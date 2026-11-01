-- InmoFollow: seguimientos (recordatorios de contacto) por lead.
-- Las interacciones se guardan en `activities` (type = 'contact' | 'summary' | 'note')
-- y los interesados por inmueble ya viven en `property_interests`.
CREATE TABLE IF NOT EXISTS public.followups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  lead_id       UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  property_id   UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  assigned_to   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  due_at        TIMESTAMPTZ NOT NULL,
  channel       TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','call','email','visit','other')),
  goal          TEXT,
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','cancelled')),
  snooze_count  INTEGER NOT NULL DEFAULT 0,
  completed_at  TIMESTAMPTZ,
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_followups_agency_status_due ON public.followups (agency_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_followups_lead ON public.followups (lead_id);

ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.followups;
CREATE POLICY tenant_isolation ON public.followups
  USING (agency_id = public.agency_id())
  WITH CHECK (agency_id = public.agency_id());

-- Resumen diario por email
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS followup_digest BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.followup_digest_log (
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sent_on    DATE NOT NULL,
  sent       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sent_on)
);
-- Solo el servidor (service role) escribe aquí: RLS activo y sin políticas = denegado por defecto
ALTER TABLE public.followup_digest_log ENABLE ROW LEVEL SECURITY;

-- Un cobro de Stripe = una fila (los reintentos de webhook no duplican)
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_history_invoice ON public.payment_history (stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_agency_status_updated ON public.leads (agency_id, status, updated_at DESC);
