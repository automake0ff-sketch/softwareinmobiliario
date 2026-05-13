CREATE TABLE IF NOT EXISTS agencies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#2563eb',
  domain TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS offices (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','manager','comercial','ia_agent')),
  agency_id TEXT REFERENCES agencies(id) ON DELETE SET NULL,
  office_id TEXT REFERENCES offices(id) ON DELETE SET NULL,
  avatar TEXT,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  agency_id TEXT REFERENCES agencies(id) ON DELETE CASCADE,
  office_id TEXT REFERENCES offices(id) ON DELETE SET NULL,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
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
  pipeline_stage_updated_at TEXT,
  last_activity TEXT,
  last_contact_at TEXT,
  operation_type TEXT,
  budget_max REAL,
  zones TEXT,
  urgency TEXT,
  property_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  agency_id TEXT REFERENCES agencies(id) ON DELETE CASCADE,
  office_id TEXT REFERENCES offices(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  type TEXT NOT NULL,
  city TEXT NOT NULL,
  zone TEXT,
  bedrooms INTEGER DEFAULT 0,
  bathrooms INTEGER DEFAULT 0,
  surface REAL,
  features TEXT,
  images TEXT,
  status TEXT CHECK(status IN ('disponible','reservado','vendido','alquilado')) NOT NULL DEFAULT 'disponible',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  channel TEXT CHECK(channel IN ('whatsapp','email','web','llamada')) NOT NULL,
  messages TEXT,
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  agency_id TEXT REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL DEFAULT 'lead_created',
  trigger_type TEXT DEFAULT 'lead_created',
  condition TEXT,
  action TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  description TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1,
  trigger_config TEXT DEFAULT '{}',
  conditions TEXT DEFAULT '[]',
  actions TEXT DEFAULT '[]',
  run_count INTEGER DEFAULT 0,
  last_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_agents (
  id TEXT PRIMARY KEY,
  agency_id TEXT REFERENCES agencies(id) ON DELETE CASCADE,
  type TEXT CHECK(type IN ('captador','vendedor','coordinador','copywriter','tasador','analista','agendador','nurturing','documentador','seo','financiero','notificador')) NOT NULL,
  name TEXT NOT NULL,
  status TEXT CHECK(status IN ('active','inactive')) NOT NULL DEFAULT 'active',
  config TEXT,
  metrics TEXT,
  last_action TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  agency_id TEXT REFERENCES agencies(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  agent_id TEXT REFERENCES ai_agents(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT,
  description TEXT NOT NULL,
  metadata TEXT,
  agent_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_insights (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  insight TEXT NOT NULL,
  action TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author TEXT NOT NULL CHECK(author IN ('lead','agent','ia_agent','system')),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK(message_type IN ('text','audio','image','document','ia_note','system')),
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS matchings (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  score REAL NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  agency_id TEXT REFERENCES agencies(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data TEXT,
  period TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366F1',
  agency_id TEXT REFERENCES agencies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lead_tags (
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (lead_id, tag_id)
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
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
  feature_whatsapp INTEGER DEFAULT 1,
  feature_meta_ads INTEGER DEFAULT 0,
  feature_white_label INTEGER DEFAULT 0,
  feature_api_access INTEGER DEFAULT 0,
  feature_analytics_advanced INTEGER DEFAULT 0,
  feature_priority_support INTEGER DEFAULT 0,
  feature_dedicated_support INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT DEFAULT 'trialing' CHECK(status IN ('trialing','active','past_due','canceled','expired','pending')),
  billing_cycle TEXT DEFAULT 'monthly' CHECK(billing_cycle IN ('monthly','yearly')),
  current_period_start TEXT,
  current_period_end TEXT,
  trial_end TEXT,
  cancel_at_period_end INTEGER DEFAULT 0,
  payment_method TEXT DEFAULT 'stripe',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  paypal_subscription_id TEXT,
  paypal_plan_id TEXT,
  canceled_at TEXT,
  cancel_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(agency_id)
);

CREATE TABLE IF NOT EXISTS payment_history (
  id TEXT PRIMARY KEY,
  agency_id TEXT REFERENCES agencies(id),
  subscription_id TEXT REFERENCES subscriptions(id),
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
  period_start TEXT,
  period_end TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usage_counters (
  id TEXT PRIMARY KEY,
  agency_id TEXT REFERENCES agencies(id) ON DELETE CASCADE UNIQUE,
  leads_this_month INTEGER DEFAULT 0,
  ai_calls_this_month INTEGER DEFAULT 0,
  whatsapp_messages_this_month INTEGER DEFAULT 0,
  automations_run_this_month INTEGER DEFAULT 0,
  period_start TEXT DEFAULT (date('now','start of month')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_agency ON subscriptions(agency_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payment_history_agency ON payment_history(agency_id);
CREATE INDEX IF NOT EXISTS idx_usage_counters_agency ON usage_counters(agency_id);

CREATE TABLE IF NOT EXISTS onboarding (
  id TEXT PRIMARY KEY,
  agency_id TEXT REFERENCES agencies(id) ON DELETE CASCADE,
  step INTEGER DEFAULT 1,
  completed INTEGER DEFAULT 0,
  data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  agency_id TEXT REFERENCES agencies(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT,
  read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_agency ON leads(agency_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_properties_agency ON properties(agency_id);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_conversations_lead ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_agency ON activities(agency_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_lead ON ai_insights(lead_id);
CREATE INDEX IF NOT EXISTS idx_users_agency ON users(agency_id);
CREATE INDEX IF NOT EXISTS idx_offices_agency ON offices(agency_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author);
CREATE INDEX IF NOT EXISTS idx_matchings_lead ON matchings(lead_id);
CREATE INDEX IF NOT EXISTS idx_matchings_property ON matchings(property_id);
CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_reports_agency ON reports(agency_id);
CREATE INDEX IF NOT EXISTS idx_tags_agency ON tags(agency_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_agency ON notifications(agency_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

-- RAG: Property embeddings for semantic search
CREATE TABLE IF NOT EXISTS property_embeddings (
  id TEXT PRIMARY KEY,
  property_id TEXT UNIQUE REFERENCES properties(id) ON DELETE CASCADE,
  agency_id TEXT REFERENCES agencies(id),
  content TEXT NOT NULL,
  embedding TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- RAG: Successful conversation embeddings
CREATE TABLE IF NOT EXISTS successful_conversation_embeddings (
  id TEXT PRIMARY KEY,
  agency_id TEXT REFERENCES agencies(id),
  lead_id TEXT REFERENCES leads(id),
  content TEXT NOT NULL,
  context TEXT,
  outcome TEXT NOT NULL,
  embedding TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- RAG: Knowledge base (manual/documentos de la agencia)
CREATE TABLE IF NOT EXISTS knowledge_base_embeddings (
  id TEXT PRIMARY KEY,
  agency_id TEXT REFERENCES agencies(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  embedding TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_property_embeddings_agency ON property_embeddings(agency_id);
CREATE INDEX IF NOT EXISTS idx_property_embeddings_property ON property_embeddings(property_id);
CREATE INDEX IF NOT EXISTS idx_conv_embeddings_agency ON successful_conversation_embeddings(agency_id);
CREATE INDEX IF NOT EXISTS idx_conv_embeddings_outcome ON successful_conversation_embeddings(outcome);
CREATE INDEX IF NOT EXISTS idx_kb_embeddings_agency ON knowledge_base_embeddings(agency_id);
CREATE INDEX IF NOT EXISTS idx_kb_embeddings_category ON knowledge_base_embeddings(category);
