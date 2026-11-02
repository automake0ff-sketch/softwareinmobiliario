-- Deshace 00011_inmofollow_fase2.sql (no toca datos de otras tablas).
DROP INDEX IF EXISTS public.idx_appointments_agency_starts;
DROP TABLE IF EXISTS public.followup_settings;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_client_type_check;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_priority_check;
ALTER TABLE public.leads DROP COLUMN IF EXISTS client_type;
ALTER TABLE public.leads DROP COLUMN IF EXISTS priority;
-- Vuelve a la restricción original (fallará si hay contactos en estado 'perdido': primero pásalos a 'cerrado').
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('nuevo','contactado','interesado','visita_agendada','negociacion','reserva','cerrado'));
