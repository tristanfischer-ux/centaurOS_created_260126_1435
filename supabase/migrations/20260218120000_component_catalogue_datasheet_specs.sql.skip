/**
 * Migration: Add datasheet_specs to component_catalogue for verified extraction
 *
 * Purpose: Store extracted datasheet JSON so the extract-datasheets.py pipeline
 * can persist verified specs and we can mark rows as verified.
 *
 * Related: scripts/extract-datasheets.py
 * Rollback: ALTER TABLE component_catalogue DROP COLUMN datasheet_specs, DROP COLUMN datasheet_extracted_at;
 */

ALTER TABLE component_catalogue
  ADD COLUMN IF NOT EXISTS datasheet_specs JSONB,
  ADD COLUMN IF NOT EXISTS datasheet_extracted_at TIMESTAMPTZ;

COMMENT ON COLUMN component_catalogue.datasheet_specs IS 'Structured specs extracted from manufacturer datasheet PDF (mechanical, electrical, performance)';
COMMENT ON COLUMN component_catalogue.datasheet_extracted_at IS 'When datasheet_specs was last extracted';
