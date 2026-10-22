-- Cumplimiento de anuncios, partes de visita firmados y encargos (exclusivas)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS fees_info TEXT;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS cedula_habitabilidad TEXT;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS tensioned_zone BOOLEAN DEFAULT false;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS reference_price REAL;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS last_rent_price REAL;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS large_holder BOOLEAN;

ALTER TABLE agencies ADD COLUMN IF NOT EXISTS visit_terms TEXT;

CREATE TABLE IF NOT EXISTS visit_reports (
  id UUID PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  agent_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed','cancelled')),
  visit_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visitor_name TEXT,
  visitor_doc TEXT,
  visitor_phone TEXT,
  visitor_email TEXT,
  terms_text TEXT,
  consent_data BOOLEAN NOT NULL DEFAULT false,
  signature_name TEXT,
  signature_image TEXT,
  signed_at TIMESTAMPTZ,
  signed_ip TEXT,
  signed_user_agent TEXT,
  content_hash TEXT,
  interest_level TEXT CHECK (interest_level IN ('alto','medio','bajo')),
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visit_reports_agency ON visit_reports(agency_id, visit_date DESC);

CREATE INDEX IF NOT EXISTS idx_visit_reports_property ON visit_reports(property_id);

CREATE TABLE IF NOT EXISTS listing_agreements (
  id UUID PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  owner_name TEXT NOT NULL,
  owner_phone TEXT,
  owner_email TEXT,
  agreement_type TEXT NOT NULL DEFAULT 'exclusiva' CHECK (agreement_type IN ('exclusiva','no_exclusiva')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  notice_days INTEGER NOT NULL DEFAULT 15,
  commission_text TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','renovado','cancelado','cerrado')),
  report_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_agreements_agency ON listing_agreements(agency_id, end_date);

CREATE INDEX IF NOT EXISTS idx_listing_agreements_property ON listing_agreements(property_id);

ALTER TABLE visit_reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE listing_agreements ENABLE ROW LEVEL SECURITY;
