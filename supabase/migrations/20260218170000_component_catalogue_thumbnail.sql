-- Add thumbnail_url to component_catalogue for generated SVG previews.
-- Thumbnails are generated lazily via the component preview API.

ALTER TABLE component_catalogue ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
