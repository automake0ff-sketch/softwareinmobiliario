-- ═══════════════════════════════════════════════════════
-- FIX: Avisos WARN del linter de seguridad de Supabase
-- ═══════════════════════════════════════════════════════

-- ── 1) function_search_path_mutable ──
-- Sin un search_path fijo, una función SECURITY DEFINER podría en teoría
-- ser engañada para resolver un nombre de tabla/función contra un schema
-- distinto al esperado (ataque de "search_path hijacking"). Se fija el
-- mismo search_path que ya usan el resto de funciones del proyecto.
ALTER FUNCTION public.agency_id() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.is_admin() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.is_super_admin() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, extensions, pg_temp;

-- ── 2) Reparar referencia rota a auth.agency_id() ──
-- La migración de seguridad anterior (00004) no tocó estas dos funciones,
-- pero ambas seguían llamando a auth.agency_id() — el nombre ANTIGUO de
-- esta función antes de moverla a public.agency_id() (Supabase no permite
-- crear funciones nuevas dentro del schema auth). Sin este fix, las dos
-- fallan en tiempo de ejecución con "function auth.agency_id() does not
-- exist" en cuanto alguien las invoque.
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
  v_agency_id := public.agency_id();

  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id AND agency_id = v_agency_id;
  SELECT * INTO v_agency FROM agencies WHERE id = v_agency_id;
  SELECT name INTO v_assigned FROM users WHERE id = v_lead.assigned_to;

  SELECT string_agg(t.name, ', ') INTO v_tags
  FROM lead_tags lt
  JOIN tags t ON t.id = lt.tag_id
  WHERE lt.lead_id = p_lead_id;

  RETURN jsonb_build_object(
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
    'agency_id',        v_agency.id,
    'agency_name',      COALESCE(v_agency.name, 'Mi Agencia'),
    'agency_city',      COALESCE(v_agency.city, ''),
    'agency_email',     COALESCE(v_agency.email, ''),
    'agency_phone',     COALESCE(v_agency.phone, ''),
    'agency_whatsapp',  COALESCE(v_agency.whatsapp_number, ''),
    'agency_website',   COALESCE(v_agency.website, ''),
    'agency_address',   COALESCE(v_agency.address, ''),
    'agency_instagram', COALESCE(v_agency.instagram, ''),
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
    'date',    to_char(NOW() AT TIME ZONE v_agency.timezone, 'DD/MM/YYYY'),
    'time',    to_char(NOW() AT TIME ZONE v_agency.timezone, 'HH24:MI'),
    'datetime',to_char(NOW() AT TIME ZONE v_agency.timezone, 'DD/MM/YYYY HH24:MI'),
    'month',   to_char(NOW() AT TIME ZONE v_agency.timezone, 'Month'),
    'year',    to_char(NOW() AT TIME ZONE v_agency.timezone, 'YYYY')
  );
END;
$$;

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
  v_agency_id := public.agency_id();

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

-- ── 3) Funciones SECURITY DEFINER expuestas de más vía /rest/v1/rpc/... ──
-- Por defecto, Supabase concede EXECUTE a anon y authenticated en toda
-- función nueva del schema public. Ninguna de estas 6 la llama nuestra
-- app (el backend hace el equivalente en JS, o son funciones muertas de
-- un flujo de registro antiguo sin usar) — se cierra el acceso público:

-- handle_new_user: SOLO la usa el trigger on_auth_user_created. No
-- necesita ser invocable directamente por nadie.
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;

-- get_automation_context / install_template: duplican en SQL lo que el
-- backend Express ya hace en JS (full-context-builder.js / routes/templates.js);
-- get_automation_context además devuelve credenciales reales de la agencia
-- (token de WhatsApp, claves de SendGrid/Telegram...) — sin usuarios reales
-- llamándolas por RPC, mejor cerrarlas del todo.
REVOKE EXECUTE ON FUNCTION get_automation_context(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION install_template(UUID) FROM PUBLIC, anon, authenticated;

-- get_auth_context: nadie la llama actualmente, pero es inofensiva para un
-- usuario ya autenticado (solo devuelve su propio perfil). Se cierra solo
-- para anon (usuarios no logueados no deberían ni poder intentarlo).
REVOKE EXECUTE ON FUNCTION get_auth_context() FROM PUBLIC, anon;

-- register_agency: solo la usa src/lib/useSupabaseAuth.js, que a su vez
-- solo importa LoginPageSupabase.jsx — una página NO enrutada en App.jsx
-- (código muerto, confirmado). Se cierra para anon (evita que cualquiera
-- sin sesión cree agencias a través del RPC), se deja para authenticated
-- por si esa página se reactivase en el futuro.
REVOKE EXECUTE ON FUNCTION register_agency(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;

-- get_my_profile: no está definida en nuestras migraciones versionadas —
-- se creó a mano directamente en Supabase en algún momento. Nadie la llama
-- desde el código del proyecto. Se cierra por precaución (no sabemos qué
-- devuelve exactamente sin ver su definición).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_my_profile'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════
-- NOTA: "Leaked Password Protection Disabled" (auth_leaked_password_protection)
-- no se puede arreglar por SQL — es un ajuste del panel de Supabase:
-- Authentication → Providers → Email → activar "Leaked password protection"
-- (comprueba las contraseñas nuevas contra la base de datos de HaveIBeenPwned).
-- ═══════════════════════════════════════════════════════
