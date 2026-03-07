-- Add process_capabilities JSONB column to marketplace_listings
-- Stores structured process data from Nightshift deep enrichment
ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS process_capabilities JSONB DEFAULT '[]'::jsonb;

-- GIN index for JSONB querying (containment, key-exists)
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_process_capabilities
  ON marketplace_listings USING GIN (process_capabilities);

-- Add source_company_ids to manufacturing_technique_enrichments
-- Links technique articles back to the companies that informed them
ALTER TABLE manufacturing_technique_enrichments
  ADD COLUMN IF NOT EXISTS source_company_ids JSONB DEFAULT '[]'::jsonb;
