-- ═══════════════════════════════════════════════════════
-- PropIA — ROW LEVEL SECURITY
-- Migración 00002: RLS + Políticas multi-tenant
-- ═══════════════════════════════════════════════════════
-- El corazón del multi-tenant: cada agencia solo ve SUS datos.
-- Las políticas usan auth.uid() para identificar al usuario
-- y buscan su agency_id en la tabla users.

-- ═══════════════════════════════════════════════════════
-- FUNCIÓN HELPER: obtener agency_id del usuario autenticado
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.agency_id()
RETURNS UUID
LANGUAGE SQL STABLE
AS $$
  SELECT agency_id FROM public.users WHERE id = auth.uid()
$$;

-- ═══════════════════════════════════════════════════════
-- FUNCIÓN HELPER: verificar si el usuario es admin de su agencia
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT role = 'admin' FROM public.users WHERE id = auth.uid()
$$;

-- ═══════════════════════════════════════════════════════
-- FUNCIÓN HELPER: verificar si el usuario es super_admin
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin' AND agency_id IS NULL
  )
$$;

-- ═══════════════════════════════════════════════════════
-- HABILITAR RLS EN TODAS LAS TABLAS
-- ═══════════════════════════════════════════════════════
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE successful_conversation_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════
-- POLÍTICAS PARA TABLAS CON agency_id (aislamiento multi-tenant)
-- ═══════════════════════════════════════════════════════

-- offices: usuarios ven solo oficinas de su agencia
CREATE POLICY "tenant_isolation" ON offices
  USING (agency_id = public.agency_id());

-- leads: usuarios ven solo leads de su agencia
CREATE POLICY "tenant_isolation" ON leads
  USING (agency_id = public.agency_id());

-- properties: usuarios ven solo propiedades de su agencia
CREATE POLICY "tenant_isolation" ON properties
  USING (agency_id = public.agency_id());

-- automations: usuarios ven solo automatizaciones de su agencia
CREATE POLICY "tenant_isolation" ON automations
  USING (agency_id = public.agency_id());

-- ai_agents: usuarios ven solo agentes de su agencia
CREATE POLICY "tenant_isolation" ON ai_agents
  USING (agency_id = public.agency_id());

-- activities: usuarios ven solo actividades de su agencia
CREATE POLICY "tenant_isolation" ON activities
  USING (agency_id = public.agency_id());

-- reports: usuarios ven solo reportes de su agencia
CREATE POLICY "tenant_isolation" ON reports
  USING (agency_id = public.agency_id());

-- tags: usuarios ven solo tags de su agencia
CREATE POLICY "tenant_isolation" ON tags
  USING (agency_id = public.agency_id());

-- subscriptions: usuarios ven solo suscripciones de su agencia
CREATE POLICY "tenant_isolation" ON subscriptions
  USING (agency_id = public.agency_id());

-- payment_history: usuarios ven solo pagos de su agencia
CREATE POLICY "tenant_isolation" ON payment_history
  USING (agency_id = public.agency_id());

-- usage_counters: usuarios ven solo contadores de su agencia
CREATE POLICY "tenant_isolation" ON usage_counters
  USING (agency_id = public.agency_id());

-- onboarding: usuarios ven solo onboarding de su agencia
CREATE POLICY "tenant_isolation" ON onboarding
  USING (agency_id = public.agency_id());

-- notifications: usuarios ven solo notificaciones de su agencia
CREATE POLICY "tenant_isolation" ON notifications
  USING (agency_id = public.agency_id());

-- property_embeddings: usuarios ven solo embeddings de su agencia
CREATE POLICY "tenant_isolation" ON property_embeddings
  USING (agency_id = public.agency_id());

-- successful_conversation_embeddings
CREATE POLICY "tenant_isolation" ON successful_conversation_embeddings
  USING (agency_id = public.agency_id());

-- knowledge_base_embeddings
CREATE POLICY "tenant_isolation" ON knowledge_base_embeddings
  USING (agency_id = public.agency_id());

-- ═══════════════════════════════════════════════════════
-- POLÍTICAS PARA TABLAS RELACIONADAS (sin agency_id directo)
-- ═══════════════════════════════════════════════════════

-- conversations: acceso vía lead → agency
CREATE POLICY "tenant_isolation" ON conversations
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = conversations.lead_id
      AND leads.agency_id = public.agency_id()
    )
  );

-- messages: acceso vía conversation → lead → agency
CREATE POLICY "tenant_isolation" ON messages
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      JOIN leads ON leads.id = conversations.lead_id
      WHERE conversations.id = messages.conversation_id
      AND leads.agency_id = public.agency_id()
    )
  );

-- ai_insights: acceso vía lead → agency
CREATE POLICY "tenant_isolation" ON ai_insights
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = ai_insights.lead_id
      AND leads.agency_id = public.agency_id()
    )
  );

-- matchings: acceso vía lead → agency
CREATE POLICY "tenant_isolation" ON matchings
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = matchings.lead_id
      AND leads.agency_id = public.agency_id()
    )
  );

-- tasks: acceso vía lead → agency
CREATE POLICY "tenant_isolation" ON tasks
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = tasks.lead_id
      AND leads.agency_id = public.agency_id()
    )
  );

-- lead_tags: acceso vía lead → agency
CREATE POLICY "tenant_isolation" ON lead_tags
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = lead_tags.lead_id
      AND leads.agency_id = public.agency_id()
    )
  );

-- automation_logs: acceso vía automation → agency
CREATE POLICY "tenant_isolation" ON automation_logs
  USING (
    EXISTS (
      SELECT 1 FROM automations
      WHERE automations.id = automation_logs.automation_id
      AND automations.agency_id = public.agency_id()
    )
  );

-- ═══════════════════════════════════════════════════════
-- POLÍTICAS ESPECIALES
-- ═══════════════════════════════════════════════════════

-- agencies: solo el admin de la agencia puede ver/modificar su agencia
-- Los super_admins (dueños de PropIA) pueden ver todas
CREATE POLICY "agency_own_data" ON agencies
  USING (
    id = public.agency_id()
    OR public.is_super_admin()
  );

-- users: los usuarios pueden verse a sí mismos y a su equipo
-- Los super_admins pueden ver todos los usuarios
CREATE POLICY "users_own_agency" ON users
  USING (
    agency_id = public.agency_id()
    OR id = auth.uid()
    OR public.is_super_admin()
  );

-- automation_templates: tablas globales, acceso público para autenticados
CREATE POLICY "templates_read" ON automation_templates
  FOR SELECT USING (auth.role() = 'authenticated');

-- plans: tablas globales de planes de suscripción, acceso público para autenticados
CREATE POLICY "plans_read" ON plans
  FOR SELECT USING (auth.role() = 'authenticated');

-- ═══════════════════════════════════════════════════════
-- POLÍTICAS PARA OPERACIONES CRUD
-- ═══════════════════════════════════════════════════════

-- Políticas de INSERT: los usuarios autenticados pueden insertar en su agencia
CREATE POLICY "tenant_insert" ON leads
  FOR INSERT WITH CHECK (
    COALESCE(agency_id, public.agency_id()) = public.agency_id()
  );

CREATE POLICY "tenant_insert" ON properties
  FOR INSERT WITH CHECK (
    COALESCE(agency_id, public.agency_id()) = public.agency_id()
  );

CREATE POLICY "tenant_insert" ON conversations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = conversations.lead_id
      AND leads.agency_id = public.agency_id()
    )
  );

CREATE POLICY "tenant_insert" ON messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      JOIN leads ON leads.id = conversations.lead_id
      WHERE conversations.id = messages.conversation_id
      AND leads.agency_id = public.agency_id()
    )
  );

-- Políticas INSERT/UPDATE/DELETE para tablas con agency_id directo
CREATE POLICY "tenant_insert" ON offices
  FOR INSERT WITH CHECK (COALESCE(agency_id, public.agency_id()) = public.agency_id());

CREATE POLICY "tenant_insert" ON ai_agents
  FOR INSERT WITH CHECK (COALESCE(agency_id, public.agency_id()) = public.agency_id());

CREATE POLICY "tenant_insert" ON activities
  FOR INSERT WITH CHECK (COALESCE(agency_id, public.agency_id()) = public.agency_id());

CREATE POLICY "tenant_insert" ON automations
  FOR INSERT WITH CHECK (COALESCE(agency_id, public.agency_id()) = public.agency_id());

CREATE POLICY "tenant_insert" ON tasks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = tasks.lead_id
      AND leads.agency_id = public.agency_id()
    )
  );

CREATE POLICY "tenant_insert" ON tags
  FOR INSERT WITH CHECK (COALESCE(agency_id, public.agency_id()) = public.agency_id());

CREATE POLICY "tenant_insert" ON notifications
  FOR INSERT WITH CHECK (COALESCE(agency_id, public.agency_id()) = public.agency_id());

-- UPDATE/DELETE policies (misma regla: solo datos de tu agencia)
CREATE POLICY "tenant_update" ON leads
  FOR UPDATE USING (agency_id = public.agency_id());

CREATE POLICY "tenant_delete" ON leads
  FOR DELETE USING (agency_id = public.agency_id());

CREATE POLICY "tenant_update" ON properties
  FOR UPDATE USING (agency_id = public.agency_id());

CREATE POLICY "tenant_delete" ON properties
  FOR DELETE USING (agency_id = public.agency_id());

CREATE POLICY "tenant_update" ON automations
  FOR UPDATE USING (agency_id = public.agency_id());

CREATE POLICY "tenant_delete" ON automations
  FOR DELETE USING (agency_id = public.agency_id());

CREATE POLICY "tenant_update" ON ai_agents
  FOR UPDATE USING (agency_id = public.agency_id());

CREATE POLICY "tenant_delete" ON ai_agents
  FOR DELETE USING (agency_id = public.agency_id());

CREATE POLICY "tenant_update" ON activities
  FOR UPDATE USING (agency_id = public.agency_id());

CREATE POLICY "tenant_delete" ON activities
  FOR DELETE USING (agency_id = public.agency_id());

CREATE POLICY "tenant_update" ON tags
  FOR UPDATE USING (agency_id = public.agency_id());

CREATE POLICY "tenant_delete" ON tags
  FOR DELETE USING (agency_id = public.agency_id());

CREATE POLICY "tenant_update" ON tasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = tasks.lead_id
      AND leads.agency_id = public.agency_id()
    )
  );

-- ═══════════════════════════════════════════════════════
-- REGISTRO AUTOMÁTICO DE NUEVOS USUARIOS
-- Cuando alguien se registra via Supabase Auth, se crea
-- automáticamente su perfil en public.users
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'comercial')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
