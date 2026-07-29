-- ═══════════════════════════════════════════════════════
-- FIX: Errores señalados por el linter de seguridad de Supabase
-- ═══════════════════════════════════════════════════════
-- Estas 10 tablas se crearon de forma ad-hoc desde server/index.js
-- (migraciones inline al arrancar el servidor) y nunca pasaron por
-- 00002_rls.sql, así que quedaron sin RLS activado — visibles sin
-- ningún filtro por agencia para cualquiera con acceso a la API de
-- Supabase (PostgREST), aunque la propia app (que conecta directo con
-- Postgres, normalmente con un rol que hace bypass de RLS) no dependa
-- de estas políticas para funcionar.

ALTER TABLE agency_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_marketing_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_automations ENABLE ROW LEVEL SECURITY;

-- ── Tablas con agency_id directo: mismo patrón que el resto del proyecto ──

CREATE POLICY "tenant_isolation" ON agency_destinations
  USING (agency_id = public.agency_id());

CREATE POLICY "tenant_isolation" ON usage_monthly
  USING (agency_id = public.agency_id());

CREATE POLICY "tenant_isolation" ON appointments
  USING (agency_id = public.agency_id());

CREATE POLICY "tenant_isolation" ON property_leads
  USING (agency_id = public.agency_id());

CREATE POLICY "tenant_isolation" ON property_marketing_assets
  USING (agency_id = public.agency_id());

CREATE POLICY "tenant_isolation" ON property_interests
  USING (agency_id = public.agency_id());

CREATE POLICY "tenant_isolation" ON communication_logs
  USING (agency_id = public.agency_id());

CREATE POLICY "tenant_isolation" ON lead_automations
  USING (agency_id = public.agency_id());

-- ── Tablas SIN agency_id propio: aislar vía join a la tabla padre ──

-- appointment_messages solo tiene appointment_id -> unir con appointments
CREATE POLICY "tenant_isolation" ON appointment_messages
  USING (
    EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.id = appointment_messages.appointment_id
        AND a.agency_id = public.agency_id()
    )
  );

-- lead_preferences solo tiene lead_id -> unir con leads
CREATE POLICY "tenant_isolation" ON lead_preferences
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_preferences.lead_id
        AND l.agency_id = public.agency_id()
    )
  );

-- ═══════════════════════════════════════════════════════
-- FIX: Vistas SECURITY DEFINER
-- ═══════════════════════════════════════════════════════

-- agency_full_context expone credenciales reales (tokens de WhatsApp,
-- claves de SendGrid/Airtable/Notion, contraseña SMTP...) de la agencia.
-- Sin "security_invoker", una vista se evalúa con los permisos de su
-- dueño (normalmente el rol postgres, que hace bypass de RLS) en vez de
-- los del usuario que consulta — así que CUALQUIER usuario autenticado
-- podía potencialmente ver las credenciales de TODAS las agencias a
-- través de esta vista, no solo la suya. Con security_invoker = true,
-- la vista respeta el RLS real de la tabla agencies (tenant_isolation
-- ya definida en 00002_rls.sql), igual que si consultase la tabla
-- directamente.
ALTER VIEW agency_full_context SET (security_invoker = true);

-- saas_metrics es una vista de administración que agrega datos de
-- TODAS las agencias a propósito (total de agencias, plan, etc.) — no
-- tiene sentido aplicarle RLS por tenant, porque su función es
-- precisamente ver el conjunto completo para el panel de superadmin.
-- El problema real no es que sea SECURITY DEFINER, sino que no debe
-- ser accesible por cualquier usuario autenticado vía la API pública.
-- Se revoca el acceso por defecto y solo se concede a roles con
-- privilegios (postgres/service_role, que es como conecta el backend).
REVOKE ALL ON saas_metrics FROM PUBLIC;
REVOKE ALL ON saas_metrics FROM anon;
REVOKE ALL ON saas_metrics FROM authenticated;
