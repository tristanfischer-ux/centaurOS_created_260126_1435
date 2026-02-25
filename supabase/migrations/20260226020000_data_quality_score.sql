-- Add data quality score to marketplace listings.
-- Score (0-100) reflects how complete/useful a listing is.
-- Computed automatically via trigger on INSERT/UPDATE.

-- Step 1: Add the column
ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS data_quality_score SMALLINT NOT NULL DEFAULT 0;

-- Step 2: Scoring function
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
  IF attrs->>'website_url' IS NOT NULL AND attrs->>'website_url' != '' THEN score := score + 10; END IF;
  IF (attrs->>'location' IS NOT NULL AND attrs->>'location' != '')
     OR (attrs->>'headquarters' IS NOT NULL AND attrs->>'headquarters' != '') THEN
    score := score + 10;
  END IF;
  IF (attrs->>'company_type' IS NOT NULL AND attrs->>'company_type' != '')
     OR (attrs->>'ch_company_type' IS NOT NULL AND attrs->>'ch_company_type' != '') THEN
    score := score + 10;
  END IF;

  -- Capabilities (30 pts)
  IF jsonb_typeof(attrs->'capabilities') = 'array' AND jsonb_array_length(attrs->'capabilities') > 0 THEN
    score := score + 10;
  ELSIF jsonb_typeof(attrs->'key_capabilities') = 'array' AND jsonb_array_length(attrs->'key_capabilities') > 0 THEN
    score := score + 10;
  END IF;
  IF jsonb_typeof(attrs->'certifications') = 'array' AND jsonb_array_length(attrs->'certifications') > 0 THEN
    score := score + 10;
  END IF;
  IF jsonb_typeof(attrs->'industries') = 'array' AND jsonb_array_length(attrs->'industries') > 0 THEN
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
  IF (attrs->>'established' IS NOT NULL AND attrs->>'established' != '')
     OR (attrs->>'founded_year' IS NOT NULL AND attrs->>'founded_year' != '') THEN
    score := score + 5;
  END IF;
  IF (attrs->>'employees' IS NOT NULL AND attrs->>'employees' != '')
     OR (attrs->>'employee_count_range' IS NOT NULL AND attrs->>'employee_count_range' != '') THEN
    score := score + 5;
  END IF;

  RETURN score::SMALLINT;
END $$;

-- Step 3: Trigger to auto-compute on INSERT/UPDATE
CREATE OR REPLACE FUNCTION trg_compute_data_quality_score()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.data_quality_score := compute_data_quality_score(NEW);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS marketplace_data_quality_score ON marketplace_listings;
CREATE TRIGGER marketplace_data_quality_score
  BEFORE INSERT OR UPDATE ON marketplace_listings
  FOR EACH ROW
  EXECUTE FUNCTION trg_compute_data_quality_score();

-- Step 4: Backfill existing recs (trigger fires on UPDATE)
UPDATE marketplace_listings
SET data_quality_score = compute_data_quality_score(marketplace_listings);

-- Step 5: Descending index for sort performance
CREATE INDEX IF NOT EXISTS idx_marketplace_quality_score_desc
  ON marketplace_listings (data_quality_score DESC);
