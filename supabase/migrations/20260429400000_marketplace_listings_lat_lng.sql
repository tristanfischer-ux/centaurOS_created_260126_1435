-- Add latitude and longitude columns to marketplace_listings for map rendering.
-- Populated lazily on first page view via Nominatim geocoding; persisted so
-- subsequent renders skip the geocode API call entirely.

ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6);
