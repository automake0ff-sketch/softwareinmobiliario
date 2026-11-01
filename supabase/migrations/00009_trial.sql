-- Demo gratuita de 3 días: fecha de fin de la demo por agencia.
-- NULL = sin caducidad (cuentas anteriores a esta migración).
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
