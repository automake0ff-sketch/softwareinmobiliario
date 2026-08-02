-- ═══════════════════════════════════════════════════════
-- Campos que faltaban en properties para la ficha completa
-- ═══════════════════════════════════════════════════════
ALTER TABLE properties ADD COLUMN IF NOT EXISTS latitude REAL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS longitude REAL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS useful_surface REAL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS has_balcony BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS has_storage BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS has_pool BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS has_garden BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS year_built INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS energy_certificate TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS reference TEXT;
