-- ═══════════════════════════════════════════════════════
-- PropIA — SCHEMA COMPLETO PARA SUPABASE (PostgreSQL)
-- Migración 00001: Tablas principales
-- ═══════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══════════════════════════════════════════════════════
-- TABLA CENTRAL: AGENCIES
-- Cada inmobiliaria registrada = 1 row en esta tabla
-- ═══════════════════════════════════════════════════════
CREATE TABLE agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,

  -- Datos de contacto
  email TEXT,
  phone TEXT,
  whatsapp_number TEXT,
  address TEXT,
  city TEXT,
  province TEXT,
  country TEXT DEFAULT 'ES',
  website TEXT,

  -- Redes sociales
  instagram TEXT,
  facebook TEXT,
  linkedin TEXT,
  tiktok TEXT,

  -- Branding (para white-label)
  logo_url TEXT,
  primary_color TEXT DEFAULT '#6366f1',
  secondary_color TEXT DEFAULT '#8b5cf6',
  custom_domain TEXT,

  -- Credenciales de WhatsApp Business (PRIVADAS de esta agencia)
  wa_token TEXT,
  wa_phone_id TEXT,
  wa_verify_token TEXT,
  wa_webhook_token TEXT,

  -- Credenciales de email (PRIVADAS)
  email_provider TEXT DEFAULT 'sendgrid',
  sendgrid_key TEXT,
  sendgrid_from_email TEXT,
  sendgrid_from_name TEXT,
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_user TEXT,
  smtp_pass TEXT,

  -- Notificaciones del equipo (PRIVADAS)
  slack_webhook TEXT,
  telegram_token TEXT,
  telegram_chat TEXT,

  -- Bases de datos externas (PRIVADAS)
  notion_key TEXT,
  notion_db TEXT,
  airtable_key TEXT,
  airtable_base TEXT,
  airtable_table TEXT DEFAULT 'Leads',
  sheets_id TEXT,
  sheets_credentials TEXT,

  -- Webhooks (PRIVADOS)
  webhook_zapier TEXT,
  webhook_make TEXT,
  webhook_n8n TEXT,
  webhook_custom TEXT,

  -- Suscripción y plan
  plan TEXT DEFAULT 'starter',
  plan_status TEXT DEFAULT 'trialing',

  -- Configuración general
  timezone TEXT DEFAULT 'Europe/Madrid',
  language TEXT DEFAULT 'es',
  bot_name TEXT DEFAULT 'Asistente IA',
  bot_tone TEXT DEFAULT 'profesional',
  working_hours JSONB DEFAULT '{"start":"09:00","end":"20:00","days":[1,2,3,4,5]}',

  -- Estado del onboarding
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_step INTEGER DEFAULT 0,

  -- Metadatos
  meta_page_id TEXT,
  meta_slugs TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- OFICINAS
-- ═══════════════════════════════════════════════════════
CREATE TABLE offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_offices_agency ON offices(agency_id);

-- ═══════════════════════════════════════════════════════
-- USUARIOS
-- id = auth.users.id (vinculado a Supabase Auth)
-- ═══════════════════════════════════════════════════════
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','manager','comercial','ia_agent')),
  agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
  office_id UUID REFERENCES offices(id) ON DELETE SET NULL,
  avatar TEXT,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_agency ON users(agency_id);

-- ═══════════════════════════════════════════════════════
-- LEADS
-- ═══════════════════════════════════════════════════════
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  office_id UUID REFERENCES offices(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  budget REAL,
  zone TEXT,
  property_interest TEXT,
  source TEXT CHECK(source IN ('whatsapp','web','idealista','meta_ads','manual','email')),
  status TEXT CHECK(status IN ('nuevo','contactado','interesado','visita_agendada','negociacion','reserva','cerrado')) NOT NULL DEFAULT 'nuevo',
  ia_score REAL DEFAULT 0,
  ia_score_label TEXT,
  ia_insight TEXT,
  ia_insights TEXT,
  ia_summary TEXT,
  ia_next_action TEXT,
  pipeline_stage TEXT,
  pipeline_stage_updated_at TIMESTAMPTZ,
  last_activity TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  operation_type TEXT,
  budget_max REAL,
  zones TEXT,
  urgency TEXT,
  property_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leads_agency ON leads(agency_id);
CREATE INDEX idx_leads_assigned ON leads(assigned_to);
CREATE INDEX idx_leads_status ON leads(status);

-- ═══════════════════════════════════════════════════════
-- PROPIEDADES
-- ═══════════════════════════════════════════════════════
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  office_id UUID REFERENCES offices(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  type TEXT NOT NULL,
  operation_type TEXT DEFAULT 'sale',
  city TEXT NOT NULL,
  zone TEXT,
  address TEXT,
  province TEXT,
  postal_code TEXT,
  bedrooms INTEGER DEFAULT 0,
  bathrooms INTEGER DEFAULT 0,
  surface REAL,
  floor TEXT,
  has_elevator INTEGER DEFAULT 0,
  has_terrace INTEGER DEFAULT 0,
  has_garage INTEGER DEFAULT 0,
  condition TEXT,
  features TEXT,
  images TEXT,
  public_url TEXT,
  status TEXT CHECK(status IN ('disponible','reservado','vendido','alquilado')) NOT NULL DEFAULT 'disponible',
  source TEXT DEFAULT 'manual',
  external_source TEXT,
  external_id TEXT,
  external_url TEXT,
  imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_properties_agency ON properties(agency_id);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_properties_source ON properties(source);
CREATE INDEX idx_properties_operation ON properties(operation_type);
CREATE INDEX idx_properties_external ON properties(external_source, external_id);

-- ═══════════════════════════════════════════════════════
-- CONVERSACIONES
-- ═══════════════════════════════════════════════════════
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  channel TEXT CHECK(channel IN ('whatsapp','email','web','llamada')) NOT NULL,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_lead ON conversations(lead_id);

-- ═══════════════════════════════════════════════════════
-- MENSAJES
-- ═══════════════════════════════════════════════════════
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author TEXT NOT NULL CHECK(author IN ('lead','agent','ia_agent','system')),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK(message_type IN ('text','audio','image','document','ia_note','system')),
  metadata TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_author ON messages(author);

-- ═══════════════════════════════════════════════════════
-- AGENTES IA
-- ═══════════════════════════════════════════════════════
CREATE TABLE ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  type TEXT CHECK(type IN ('captador','vendedor','coordinador','copywriter','tasador','analista','agendador','nurturing','documentador','seo','financiero','notificador')) NOT NULL,
  name TEXT NOT NULL,
  status TEXT CHECK(status IN ('active','inactive')) NOT NULL DEFAULT 'active',
  config JSONB,
  metrics TEXT,
  last_action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- ACTIVIDADES (TIMELINE)
-- ═══════════════════════════════════════════════════════
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT,
  description TEXT NOT NULL,
  metadata TEXT,
  agent_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_lead ON activities(lead_id);
CREATE INDEX idx_activities_agency ON activities(agency_id);

-- ═══════════════════════════════════════════════════════
-- AUTOMATIZACIONES
-- ═══════════════════════════════════════════════════════
CREATE TABLE automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL DEFAULT 'lead_created',
  trigger_type TEXT DEFAULT 'lead_created',
  condition TEXT,
  action TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  trigger_config JSONB DEFAULT '{}',
  conditions JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- INSIGHTS IA
-- ═══════════════════════════════════════════════════════
CREATE TABLE ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  insight TEXT NOT NULL,
  action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_insights_lead ON ai_insights(lead_id);

-- ═══════════════════════════════════════════════════════
-- MATCHING PROPIEDADES ↔ LEADS
-- ═══════════════════════════════════════════════════════
CREATE TABLE matchings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  score REAL NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_matchings_lead ON matchings(lead_id);
CREATE INDEX idx_matchings_property ON matchings(property_id);

-- ═══════════════════════════════════════════════════════
-- TAREAS
-- ═══════════════════════════════════════════════════════
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_lead ON tasks(lead_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_due ON tasks(due_date);

-- ═══════════════════════════════════════════════════════
-- REPORTES
-- ═══════════════════════════════════════════════════════
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data TEXT,
  period TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_agency ON reports(agency_id);

-- ═══════════════════════════════════════════════════════
-- TAGS
-- ═══════════════════════════════════════════════════════
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366F1',
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE
);

CREATE INDEX idx_tags_agency ON tags(agency_id);

-- ═══════════════════════════════════════════════════════
-- LEAD TAGS (relación muchos a muchos)
-- ═══════════════════════════════════════════════════════
CREATE TABLE lead_tags (
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (lead_id, tag_id)
);

-- ═══════════════════════════════════════════════════════
-- PLANES DE SUSCRIPCIÓN
-- ═══════════════════════════════════════════════════════
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price_monthly INTEGER NOT NULL,
  price_yearly INTEGER NOT NULL,
  currency TEXT DEFAULT 'EUR',
  max_offices INTEGER DEFAULT 1,
  max_users INTEGER DEFAULT 5,
  max_leads_per_month INTEGER DEFAULT 500,
  max_agents INTEGER DEFAULT 3,
  max_automations INTEGER DEFAULT 10,
  available_agent_types TEXT,
  feature_whatsapp BOOLEAN DEFAULT TRUE,
  feature_meta_ads BOOLEAN DEFAULT FALSE,
  feature_white_label BOOLEAN DEFAULT FALSE,
  feature_api_access BOOLEAN DEFAULT FALSE,
  feature_analytics_advanced BOOLEAN DEFAULT FALSE,
  feature_priority_support BOOLEAN DEFAULT FALSE,
  feature_dedicated_support BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- SUSCRIPCIONES (1 agencia → 1 suscripción activa)
-- ═══════════════════════════════════════════════════════
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  status TEXT DEFAULT 'trialing' CHECK(status IN ('trialing','active','past_due','canceled','expired','pending')),
  billing_cycle TEXT DEFAULT 'monthly' CHECK(billing_cycle IN ('monthly','yearly')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  payment_method TEXT DEFAULT 'stripe',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  paypal_subscription_id TEXT,
  paypal_plan_id TEXT,
  canceled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agency_id)
);

CREATE INDEX idx_subscriptions_agency ON subscriptions(agency_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- ═══════════════════════════════════════════════════════
-- HISTORIAL DE PAGOS
-- ═══════════════════════════════════════════════════════
CREATE TABLE payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id),
  subscription_id UUID REFERENCES subscriptions(id),
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'EUR',
  status TEXT CHECK(status IN ('succeeded','failed','pending','refunded')),
  payment_method TEXT CHECK(payment_method IN ('card','paypal','transfer')),
  stripe_invoice_id TEXT,
  stripe_payment_intent_id TEXT,
  paypal_transaction_id TEXT,
  invoice_url TEXT,
  invoice_pdf_url TEXT,
  description TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_history_agency ON payment_history(agency_id);

-- ═══════════════════════════════════════════════════════
-- CONTADORES DE USO (mensuales por agencia)
-- ═══════════════════════════════════════════════════════
CREATE TABLE usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE UNIQUE,
  leads_this_month INTEGER DEFAULT 0,
  ai_calls_this_month INTEGER DEFAULT 0,
  whatsapp_messages_this_month INTEGER DEFAULT 0,
  automations_run_this_month INTEGER DEFAULT 0,
  period_start TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-01')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_counters_agency ON usage_counters(agency_id);

-- ═══════════════════════════════════════════════════════
-- ONBOARDING (estado por agencia)
-- ═══════════════════════════════════════════════════════
CREATE TABLE onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  step INTEGER DEFAULT 1,
  completed BOOLEAN DEFAULT FALSE,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- NOTIFICACIONES
-- ═══════════════════════════════════════════════════════
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_agency ON notifications(agency_id);
CREATE INDEX idx_notifications_read ON notifications(read);

-- ═══════════════════════════════════════════════════════
-- AUTOMATION LOGS
-- ═══════════════════════════════════════════════════════
CREATE TABLE automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID REFERENCES automations(id),
  lead_id UUID REFERENCES leads(id),
  status TEXT CHECK(status IN ('success','failed','skipped')),
  actions_executed JSONB DEFAULT '[]',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- PLANTILLAS GLOBALES DE AUTOMATIZACIÓN (Marketplace)
-- Sin agency_id — disponibles para todas las agencias
-- ═══════════════════════════════════════════════════════
CREATE TABLE automation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  difficulty TEXT DEFAULT 'basica',
  trigger_type TEXT NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  conditions JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  min_plan TEXT DEFAULT 'starter',
  requires JSONB DEFAULT '[]',
  installs INTEGER DEFAULT 0,
  rating REAL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  is_featured BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- RAG: Property embeddings for semantic search
-- ═══════════════════════════════════════════════════════
CREATE TABLE property_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID UNIQUE REFERENCES properties(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id),
  content TEXT NOT NULL,
  embedding TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_property_embeddings_agency ON property_embeddings(agency_id);
CREATE INDEX idx_property_embeddings_property ON property_embeddings(property_id);

-- ═══════════════════════════════════════════════════════
-- RAG: Successful conversation embeddings
-- ═══════════════════════════════════════════════════════
CREATE TABLE successful_conversation_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id),
  lead_id UUID REFERENCES leads(id),
  content TEXT NOT NULL,
  context TEXT,
  outcome TEXT NOT NULL,
  embedding TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conv_embeddings_agency ON successful_conversation_embeddings(agency_id);
CREATE INDEX idx_conv_embeddings_outcome ON successful_conversation_embeddings(outcome);

-- ═══════════════════════════════════════════════════════
-- RAG: Knowledge base (manual/documentos de la agencia)
-- ═══════════════════════════════════════════════════════
CREATE TABLE knowledge_base_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  embedding TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kb_embeddings_agency ON knowledge_base_embeddings(agency_id);
CREATE INDEX idx_kb_embeddings_category ON knowledge_base_embeddings(category);

-- ═══════════════════════════════════════════════════════
-- VISTA: contexto completo de la agencia
-- ═══════════════════════════════════════════════════════
CREATE VIEW agency_full_context AS
  SELECT a.id AS agency_id, a.name AS agency_name, a.city AS agency_city,
    a.email AS agency_email, a.phone AS agency_phone,
    a.whatsapp_number AS agency_whatsapp, a.website AS agency_website,
    a.instagram AS agency_instagram, a.facebook AS agency_facebook,
    a.address AS agency_address,
    a.wa_token AS wa_token, a.wa_phone_id AS wa_phone_id,
    a.sendgrid_key AS sg_api_key, a.sendgrid_from_email AS sg_from_email,
    a.sendgrid_from_name AS sg_from_name,
    a.smtp_host, a.smtp_port, a.smtp_user, a.smtp_pass,
    a.telegram_token, a.telegram_chat, a.slack_webhook,
    a.notion_key, a.notion_db,
    a.airtable_key, a.airtable_base, a.airtable_table,
    a.sheets_id,
    a.webhook_zapier, a.webhook_make, a.webhook_n8n, a.webhook_custom,
    a.plan, a.plan_status, a.country, a.language, a.timezone
  FROM agencies a;

-- ═══════════════════════════════════════════════════════
-- VISTA: métricas globales para el admin del SaaS
-- ═══════════════════════════════════════════════════════
CREATE VIEW saas_metrics AS
SELECT
  (SELECT COUNT(*) FROM agencies) AS total_agencies,
  (SELECT COUNT(*) FROM agencies WHERE plan_status = 'active') AS active_agencies,
  (SELECT COUNT(*) FROM agencies WHERE plan_status = 'trialing') AS trial_agencies,
  (SELECT COUNT(*) FROM agencies WHERE plan_status = 'canceled') AS canceled_agencies,
  (SELECT COUNT(*) FROM agencies WHERE created_at > NOW() - INTERVAL '7 days') AS new_this_week,
  (SELECT COUNT(*) FROM agencies WHERE plan = 'starter') AS plan_starter,
  (SELECT COUNT(*) FROM agencies WHERE plan = 'profesional') AS plan_profesional,
  (SELECT COUNT(*) FROM agencies WHERE plan = 'agencia') AS plan_agencia,
  (SELECT COUNT(*) FROM agencies WHERE plan = 'enterprise') AS plan_enterprise,
  (SELECT COUNT(*) FROM leads WHERE created_at >= CURRENT_DATE) AS leads_today,
  (SELECT COUNT(*) FROM activities WHERE type = 'ia_response' AND created_at >= CURRENT_DATE) AS ai_actions_today,
  (SELECT COUNT(*) FROM automation_logs WHERE created_at >= CURRENT_DATE) AS automations_today;
