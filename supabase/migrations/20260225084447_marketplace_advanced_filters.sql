-- Enable efficient JSONB attribute filtering for marketplace advanced search.
-- GIN with jsonb_path_ops supports @> containment queries on attributes.
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_attributes_gin
  ON marketplace_listings USING GIN (attributes jsonb_path_ops);
