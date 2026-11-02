-- InmoFollow fase 2-4: prioridad y tipo de cliente en contactos + reglas de alerta configurables por agencia.
-- Reversible: supabase/rollbacks/00011_down.sql

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'media';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS client_type TEXT;

DO $$ BEGIN
  ALTER TABLE public.leads ADD CONSTRAINT leads_priority_check CHECK (priority IN ('alta','media','baja'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.leads ADD CONSTRAINT leads_client_type_check CHECK (client_type IS NULL OR client_type IN ('comprador','vendedor','propietario','inquilino','otro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.followup_settings (
  agency_id          UUID PRIMARY KEY REFERENCES public.agencies(id) ON DELETE CASCADE,
  stale_days         JSONB NOT NULL DEFAULT '{}'::jsonb,   -- días sin contacto por estado; vacío = valores por defecto
  inactive_days      INTEGER NOT NULL DEFAULT 30 CHECK (inactive_days BETWEEN 7 AND 365),
  visit_followup_days INTEGER NOT NULL DEFAULT 1 CHECK (visit_followup_days BETWEEN 0 AND 30),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.followup_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.followup_settings;
CREATE POLICY tenant_isolation ON public.followup_settings
  USING (agency_id = public.agency_id())
  WITH CHECK (agency_id = public.agency_id());

CREATE INDEX IF NOT EXISTS idx_appointments_agency_starts ON public.appointments (agency_id, status);

-- La interfaz ya ofrecía el estado "Perdido", pero la restricción original solo admitía 7 estados y lo rechazaba.
-- 'cerrado' sigue significando operación cerrada (ganada); 'perdido' permite medir operaciones perdidas.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_status_check' AND conrelid = 'public.leads'::regclass AND pg_get_constraintdef(oid) LIKE '%perdido%') THEN
    ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
    ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
      CHECK (status IN ('nuevo','contactado','interesado','visita_agendada','negociacion','reserva','cerrado','perdido'));
  END IF;
END $$;
