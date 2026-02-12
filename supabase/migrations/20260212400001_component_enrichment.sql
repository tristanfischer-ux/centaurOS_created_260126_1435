-- ============================================================
-- ForgeOS: Enrich component_geometry_types with physical + procurement data
-- Migration: 20260212400001_component_enrichment
-- ============================================================
-- Adds three new columns to support engineering metadata beyond geometry:
--   physical_properties: mass, electrical, thermal, mechanical, interface data
--   procurement: cost, lead time, supplier information
--   data_source: provenance tracking (estimate vs verified vs user-provided)

-- Physical/engineering properties as flexible JSONB.
-- Schema varies by component type (passive mechanical vs active electrical).
ALTER TABLE component_geometry_types
  ADD COLUMN IF NOT EXISTS physical_properties JSONB NOT NULL DEFAULT '{}';

-- Procurement / supply chain data as JSONB.
-- Typical cost, lead time, and common supplier names.
ALTER TABLE component_geometry_types
  ADD COLUMN IF NOT EXISTS procurement JSONB NOT NULL DEFAULT '{}';

-- Data provenance: where did this component's data come from?
-- 'training_estimate' = Claude engineering knowledge (default for all existing rows)
-- 'datasheet_verified' = populated from manufacturer datasheet
-- 'user_provided' = custom data from a foundry user
ALTER TABLE component_geometry_types
  ADD COLUMN IF NOT EXISTS data_source TEXT NOT NULL DEFAULT 'training_estimate';

ALTER TABLE component_geometry_types
  ADD CONSTRAINT component_geometry_types_data_source_check
  CHECK (data_source IN ('training_estimate', 'datasheet_verified', 'user_provided'));

-- Index for querying by data source (useful for audit / quality dashboards)
CREATE INDEX IF NOT EXISTS idx_geom_types_data_source
  ON component_geometry_types(data_source);
