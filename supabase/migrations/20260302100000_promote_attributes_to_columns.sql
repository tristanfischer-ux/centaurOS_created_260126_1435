-- =============================================
-- MIGRATION: Promote enrichment attributes to real columns
-- INTENT: Move frequently-queried fields from attributes JSONB to top-level
-- columns for better indexing, type safety, and query performance.
-- Keeps attributes JSONB for registry data (CH/OC) and extra fields.
-- =============================================

-- Step 1: Add new columns
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS specialties JSONB DEFAULT '[]'::jsonb;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS certifications JSONB DEFAULT '[]'::jsonb;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS industries JSONB DEFAULT '[]'::jsonb;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS materials JSONB DEFAULT '[]'::jsonb;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS key_equipment JSONB DEFAULT '[]'::jsonb;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS products JSONB DEFAULT '[]'::jsonb;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS production_capacity TEXT;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS company_size TEXT;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS employee_count_exact INTEGER;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS key_people JSONB DEFAULT '[]'::jsonb;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS founded_year INTEGER;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS lead_time TEXT;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS minimum_order TEXT;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS quality_systems TEXT;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS export_controls TEXT;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS security_clearances JSONB DEFAULT '[]'::jsonb;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS relevance_score INTEGER;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS enrichment_quality INTEGER;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS financial_health TEXT;

-- Step 2: Update compute_data_quality_score() to prefer new columns with JSONB fallback
CREATE OR REPLACE FUNCTION compute_data_quality_score(rec marketplace_listings)
RETURNS SMALLINT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  score INT := 0;
  attrs JSONB;
BEGIN
  attrs := COALESCE(rec.attributes, '{}'::jsonb);

  -- Identity (40 pts)
  IF length(COALESCE(rec.description, '')) > 50 THEN score := score + 10; END IF;
  IF COALESCE(rec.website_url, attrs->>'website_url', '') != '' THEN score := score + 10; END IF;
  IF COALESCE(rec.city, rec.country, attrs->>'location', attrs->>'headquarters', '') != '' THEN
    score := score + 10;
  END IF;
  IF COALESCE(rec.company_size, attrs->>'company_type', attrs->>'ch_company_type', '') != '' THEN
    score := score + 10;
  END IF;

  -- Capabilities (30 pts)
  IF jsonb_array_length(COALESCE(rec.specialties, '[]'::jsonb)) > 0 THEN
    score := score + 10;
  ELSIF jsonb_typeof(attrs->'capabilities') = 'array' AND jsonb_array_length(attrs->'capabilities') > 0 THEN
    score := score + 10;
  ELSIF jsonb_typeof(attrs->'key_capabilities') = 'array' AND jsonb_array_length(attrs->'key_capabilities') > 0 THEN
    score := score + 10;
  END IF;
  IF jsonb_array_length(COALESCE(rec.certifications, '[]'::jsonb)) > 0 THEN
    score := score + 10;
  ELSIF jsonb_typeof(attrs->'certifications') = 'array' AND jsonb_array_length(attrs->'certifications') > 0 THEN
    score := score + 10;
  END IF;
  IF jsonb_array_length(COALESCE(rec.industries, '[]'::jsonb)) > 0 THEN
    score := score + 10;
  ELSIF jsonb_typeof(attrs->'industries') = 'array' AND jsonb_array_length(attrs->'industries') > 0 THEN
    score := score + 10;
  ELSIF jsonb_typeof(attrs->'notable_clients_or_industries') = 'array'
        AND jsonb_array_length(attrs->'notable_clients_or_industries') > 0 THEN
    score := score + 10;
  END IF;

  -- Contact / enrichment (20 pts)
  IF rec.contact_email IS NOT NULL AND rec.contact_email != '' THEN score := score + 10; END IF;
  IF attrs->>'ch_company_number' IS NOT NULL AND attrs->>'ch_company_number' != '' THEN score := score + 5; END IF;
  IF jsonb_typeof(attrs->'ch_directors') = 'array' AND jsonb_array_length(attrs->'ch_directors') > 0 THEN
    score := score + 5;
  END IF;

  -- Depth (10 pts)
  IF rec.founded_year IS NOT NULL
     OR (attrs->>'established' IS NOT NULL AND attrs->>'established' != '')
     OR (attrs->>'founded_year' IS NOT NULL AND attrs->>'founded_year' != '') THEN
    score := score + 5;
  END IF;
  IF rec.company_size IS NOT NULL AND rec.company_size != '' THEN
    score := score + 5;
  ELSIF (attrs->>'employees' IS NOT NULL AND attrs->>'employees' != '')
     OR (attrs->>'employee_count_range' IS NOT NULL AND attrs->>'employee_count_range' != '') THEN
    score := score + 5;
  END IF;

  RETURN score::SMALLINT;
END $$;

-- Step 3: Backfill existing rows from attributes JSONB
UPDATE marketplace_listings SET
  website_url = COALESCE(website_url, attributes->>'website_url'),
  country = COALESCE(country, attributes->>'country'),
  city = COALESCE(city, attributes->>'city'),
  specialties = CASE
    WHEN jsonb_array_length(COALESCE(specialties, '[]'::jsonb)) > 0 THEN specialties
    WHEN jsonb_typeof(attributes->'specialties') = 'array' THEN attributes->'specialties'
    WHEN jsonb_typeof(attributes->'capabilities') = 'array' THEN attributes->'capabilities'
    ELSE '[]'::jsonb
  END,
  certifications = CASE
    WHEN jsonb_array_length(COALESCE(certifications, '[]'::jsonb)) > 0 THEN certifications
    WHEN jsonb_typeof(attributes->'certifications') = 'array' THEN attributes->'certifications'
    ELSE '[]'::jsonb
  END,
  industries = CASE
    WHEN jsonb_array_length(COALESCE(industries, '[]'::jsonb)) > 0 THEN industries
    WHEN jsonb_typeof(attributes->'industries') = 'array' THEN attributes->'industries'
    ELSE '[]'::jsonb
  END,
  materials = CASE
    WHEN jsonb_array_length(COALESCE(materials, '[]'::jsonb)) > 0 THEN materials
    WHEN jsonb_typeof(attributes->'materials') = 'array' THEN attributes->'materials'
    ELSE '[]'::jsonb
  END,
  key_equipment = CASE
    WHEN jsonb_array_length(COALESCE(key_equipment, '[]'::jsonb)) > 0 THEN key_equipment
    WHEN jsonb_typeof(attributes->'key_equipment') = 'array' THEN attributes->'key_equipment'
    ELSE '[]'::jsonb
  END,
  products = CASE
    WHEN jsonb_array_length(COALESCE(products, '[]'::jsonb)) > 0 THEN products
    WHEN jsonb_typeof(attributes->'products') = 'array' THEN attributes->'products'
    ELSE '[]'::jsonb
  END,
  production_capacity = COALESCE(production_capacity, attributes->>'production_capacity'),
  company_size = COALESCE(company_size, attributes->>'employees', attributes->>'employee_count_range'),
  employee_count_exact = COALESCE(employee_count_exact, (attributes->>'employee_count_exact')::integer),
  key_people = CASE
    WHEN jsonb_array_length(COALESCE(key_people, '[]'::jsonb)) > 0 THEN key_people
    WHEN jsonb_typeof(attributes->'key_people') = 'array' THEN attributes->'key_people'
    ELSE '[]'::jsonb
  END,
  founded_year = COALESCE(founded_year, (attributes->>'founded_year')::integer, (attributes->>'established')::integer),
  address = COALESCE(address, attributes->>'address'),
  lead_time = COALESCE(lead_time, attributes->>'lead_time'),
  minimum_order = COALESCE(minimum_order, attributes->>'minimum_order'),
  quality_systems = COALESCE(quality_systems, attributes->>'quality_systems'),
  export_controls = COALESCE(export_controls, attributes->>'export_controls'),
  security_clearances = CASE
    WHEN jsonb_array_length(COALESCE(security_clearances, '[]'::jsonb)) > 0 THEN security_clearances
    WHEN jsonb_typeof(attributes->'security_clearances') = 'array' THEN attributes->'security_clearances'
    ELSE '[]'::jsonb
  END,
  relevance_score = COALESCE(relevance_score, (attributes->>'nightshift_score')::integer),
  enrichment_quality = COALESCE(enrichment_quality, (attributes->>'enrichment_quality')::integer),
  financial_health = COALESCE(financial_health, (attributes->'financial_signals'->>'health'))
WHERE attributes IS NOT NULL AND attributes != '{}'::jsonb;

-- Step 4: Recompute data quality scores with new function
UPDATE marketplace_listings
SET data_quality_score = compute_data_quality_score(marketplace_listings);

-- Step 5: Add indexes for query performance
CREATE INDEX IF NOT EXISTS idx_marketplace_website_url ON marketplace_listings (website_url);
CREATE INDEX IF NOT EXISTS idx_marketplace_country ON marketplace_listings (country);
CREATE INDEX IF NOT EXISTS idx_marketplace_company_size ON marketplace_listings (company_size);
CREATE INDEX IF NOT EXISTS idx_marketplace_founded_year ON marketplace_listings (founded_year);
CREATE INDEX IF NOT EXISTS idx_marketplace_relevance_score ON marketplace_listings (relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_certifications ON marketplace_listings USING GIN (certifications);
CREATE INDEX IF NOT EXISTS idx_marketplace_industries ON marketplace_listings USING GIN (industries);
CREATE INDEX IF NOT EXISTS idx_marketplace_materials ON marketplace_listings USING GIN (materials);
CREATE INDEX IF NOT EXISTS idx_marketplace_specialties ON marketplace_listings USING GIN (specialties);
