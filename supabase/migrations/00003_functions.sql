-- ═══════════════════════════════════════════════════════
-- PropIA — FUNCIONES DE AYUDA
-- Migración 00003: Funciones helper para auth, contexto y automatizaciones
-- ═══════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════
-- FUNCIÓN: obtener contexto completo para automatizaciones
-- Usa los datos REALES de la agencia del usuario actual
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_automation_context(p_lead_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_agency_id UUID;
  v_lead      leads%ROWTYPE;
  v_agency    agencies%ROWTYPE;
  v_assigned  TEXT;
  v_tags      TEXT;
BEGIN
  v_agency_id := auth.agency_id();

  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id AND agency_id = v_agency_id;
  SELECT * INTO v_agency FROM agencies WHERE id = v_agency_id;
  SELECT name INTO v_assigned FROM users WHERE id = v_lead.assigned_to;

  SELECT string_agg(t.name, ', ') INTO v_tags
  FROM lead_tags lt
  JOIN tags t ON t.id = lt.tag_id
  WHERE lt.lead_id = p_lead_id;

  RETURN jsonb_build_object(
    -- Lead
    'lead_id',          v_lead.id,
    'lead_name',        v_lead.name,
    'lead_first_name',  split_part(v_lead.name, ' ', 1),
    'phone',            COALESCE(v_lead.phone, ''),
    'email',            COALESCE(v_lead.email, ''),
    'score',            COALESCE(v_lead.ia_score, 0),
    'score_label',      COALESCE(v_lead.ia_score_label, 'frio'),
    'stage',            COALESCE(v_lead.pipeline_stage, 'nuevo'),
    'budget_max',       COALESCE(v_lead.budget_max, 0),
    'operation_type',   COALESCE(v_lead.operation_type, 'compra'),
    'source',           COALESCE(v_lead.source, 'manual'),
    'lead_summary',     COALESCE(v_lead.ia_summary, ''),
    'tags',             COALESCE(v_tags, ''),
    'assigned_to_name', COALESCE(v_assigned, 'tu asesor'),
    -- Agencia
    'agency_id',        v_agency.id,
    'agency_name',      COALESCE(v_agency.name, 'Mi Agencia'),
    'agency_city',      COALESCE(v_agency.city, ''),
    'agency_email',     COALESCE(v_agency.email, ''),
    'agency_phone',     COALESCE(v_agency.phone, ''),
    'agency_whatsapp',  COALESCE(v_agency.whatsapp_number, ''),
    'agency_website',   COALESCE(v_agency.website, ''),
    'agency_address',   COALESCE(v_agency.address, ''),
    'agency_instagram', COALESCE(v_agency.instagram, ''),
    -- Credenciales
    'wa_token',         COALESCE(v_agency.wa_token, ''),
    'wa_phone_id',      COALESCE(v_agency.wa_phone_id, ''),
    'sg_key',           COALESCE(v_agency.sendgrid_key, ''),
    'sg_from_email',    COALESCE(v_agency.sendgrid_from_email, ''),
    'sg_from_name',     COALESCE(v_agency.sendgrid_from_name, v_agency.name),
    'slack_webhook',    COALESCE(v_agency.slack_webhook, ''),
    'telegram_token',   COALESCE(v_agency.telegram_token, ''),
    'telegram_chat',    COALESCE(v_agency.telegram_chat, ''),
    'webhook_zapier',   COALESCE(v_agency.webhook_zapier, ''),
    'webhook_make',     COALESCE(v_agency.webhook_make, ''),
    'webhook_n8n',      COALESCE(v_agency.webhook_n8n, ''),
    -- Tiempo
    'date',    to_char(NOW() AT TIME ZONE v_agency.timezone, 'DD/MM/YYYY'),
    'time',    to_char(NOW() AT TIME ZONE v_agency.timezone, 'HH24:MI'),
    'datetime',to_char(NOW() AT TIME ZONE v_agency.timezone, 'DD/MM/YYYY HH24:MI'),
    'month',   to_char(NOW() AT TIME ZONE v_agency.timezone, 'Month'),
    'year',    to_char(NOW() AT TIME ZONE v_agency.timezone, 'YYYY')
  );
END;
$$;

-- ═══════════════════════════════════════════════════════
-- FUNCIÓN: instalar plantilla de automatización en la agencia
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION install_template(p_template_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_agency_id   UUID;
  v_template    automation_templates%ROWTYPE;
  v_automation_id UUID;
BEGIN
  v_agency_id := auth.agency_id();

  SELECT * INTO v_template FROM automation_templates
  WHERE id = p_template_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plantilla no encontrada';
  END IF;

  INSERT INTO automations (
    agency_id, name, description, is_active,
    trigger_type, trigger_config, conditions, actions
  ) VALUES (
    v_agency_id,
    v_template.name,
    v_template.description,
    FALSE,
    v_template.trigger_type,
    v_template.trigger_config,
    v_template.conditions,
    v_template.actions
  ) RETURNING id INTO v_automation_id;

  UPDATE automation_templates SET installs = installs + 1 WHERE id = p_template_id;

  RETURN v_automation_id;
END;
$$;

-- ═══════════════════════════════════════════════════════
-- FUNCIÓN: obtener contexto del usuario autenticado
-- Útil para API routes y verificación rápida
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_auth_context()
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user    users%ROWTYPE;
  v_agency  agencies%ROWTYPE;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('authenticated', FALSE);
  END IF;

  SELECT * INTO v_user FROM users WHERE id = v_user_id;

  IF v_user.agency_id IS NOT NULL THEN
    SELECT * INTO v_agency FROM agencies WHERE id = v_user.agency_id;
  END IF;

  RETURN jsonb_build_object(
    'authenticated', TRUE,
    'user_id', v_user.id,
    'email', v_user.email,
    'name', v_user.name,
    'role', v_user.role,
    'agency_id', v_user.agency_id,
    'office_id', v_user.office_id,
    'agency_name', COALESCE(v_agency.name, NULL),
    'agency_plan', COALESCE(v_agency.plan, NULL),
    'agency_slug', COALESCE(v_agency.slug, NULL)
  );
END;
$$;

-- ═══════════════════════════════════════════════════════
-- FUNCIÓN: registrar nueva agencia (setup completo)
-- Crea: agency, perfil de admin, agentes IA, suscripción trial, contadores
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION register_agency(
  p_agency_name TEXT,
  p_agency_city TEXT,
  p_agency_slug TEXT,
  p_plan TEXT DEFAULT 'starter'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_user_id     UUID;
  v_agency_id   UUID;
  v_plan_id     UUID;
  v_result      JSONB;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  -- 1. Crear la agencia
  INSERT INTO agencies (name, city, slug, plan, plan_status, onboarding_step)
  VALUES (p_agency_name, p_agency_city, p_agency_slug, p_plan, 'trialing', 0)
  RETURNING id INTO v_agency_id;

  -- 2. Actualizar el perfil del usuario como admin de la agencia
  UPDATE users
  SET agency_id = v_agency_id, role = 'admin'
  WHERE id = v_user_id;

  -- 3. Crear agentes IA básicos
  INSERT INTO ai_agents (agency_id, type, name, status) VALUES
    (v_agency_id, 'captador',    'Captador IA',    'inactive'),
    (v_agency_id, 'vendedor',    'Vendedor IA',    'inactive'),
    (v_agency_id, 'coordinador', 'Coordinador IA', 'inactive');

  -- 4. Obtener plan_id
  SELECT id INTO v_plan_id FROM plans WHERE name = p_plan LIMIT 1;
  IF v_plan_id IS NULL THEN
    SELECT id INTO v_plan_id FROM plans ORDER BY sort_order LIMIT 1;
  END IF;

  -- 5. Crear suscripción trial (14 días)
  INSERT INTO subscriptions (agency_id, plan_id, status, trial_end, current_period_start, current_period_end)
  VALUES (
    v_agency_id,
    v_plan_id,
    'trialing',
    NOW() + INTERVAL '14 days',
    NOW(),
    NOW() + INTERVAL '14 days'
  );

  -- 6. Inicializar contadores
  INSERT INTO usage_counters (agency_id, period_start, leads_this_month, ai_calls_this_month)
  VALUES (v_agency_id, to_char(NOW(), 'YYYY-MM-01'), 0, 0);

  -- 7. Crear onboarding
  INSERT INTO onboarding (agency_id, step, completed)
  VALUES (v_agency_id, 1, FALSE);

  RETURN jsonb_build_object(
    'agency_id', v_agency_id,
    'user_id', v_user_id,
    'plan', p_plan
  );
END;
$$;

-- ═══════════════════════════════════════════════════════
-- FUNCIÓN: actualizar updated_at automáticamente
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Triggers para updated_at automático
DROP TRIGGER IF EXISTS update_agencies_updated_at ON agencies;
CREATE TRIGGER update_agencies_updated_at
  BEFORE UPDATE ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
