DROP INDEX IF EXISTS public.uq_payment_history_invoice;
DROP INDEX IF EXISTS public.idx_leads_agency_status_updated;
DROP TABLE IF EXISTS public.followup_digest_log;
ALTER TABLE public.users DROP COLUMN IF EXISTS followup_digest;
DROP TABLE IF EXISTS public.followups;
