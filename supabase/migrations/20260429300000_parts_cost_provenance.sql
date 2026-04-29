-- Loop 24 Fix 5: add cost_provenance field to parts table.
--
-- Classifies each BOM row's cost reliability so the PDF cost-waterfall
-- renderer can show an orange (parametric) or red (todo/placeholder) badge
-- rather than silently including uncertain costs alongside real quotes.
--
-- Values: 'quoted' | 'parametric' | 'placeholder' | 'todo'
--   quoted      -- supplier/catalogue quote, no badge
--   parametric  -- range estimate (+-30%), orange badge
--   placeholder -- GBP0 or TBD marker, red badge
--   todo        -- missing cost, red badge
--
-- Default: 'todo' (conservative -- forces explicit classification on insert).
-- Backfill heuristic: any cost == 0 -> todo; anything with 'placeholder'
-- in cost_justification -> todo; otherwise -> quoted.

ALTER TABLE public.parts
    ADD COLUMN IF NOT EXISTS cost_provenance text
        NOT NULL
        DEFAULT 'todo'
        CHECK (cost_provenance IN ('quoted', 'parametric', 'placeholder', 'todo'));

-- Backfill: rows with zero or null cost -> 'todo';
--           rows with 'placeholder' or 'tbd' in cost_justification -> 'todo';
--           everything else -> 'quoted' (conservative forward default).
UPDATE public.parts
SET cost_provenance =
    CASE
        WHEN estimated_unit_cost_gbp IS NULL OR estimated_unit_cost_gbp = 0 THEN 'todo'
        WHEN LOWER(COALESCE(cost_justification, '')) LIKE '%placeholder%'
          OR LOWER(COALESCE(cost_justification, '')) LIKE '%tbd%'
          OR LOWER(COALESCE(cost_justification, '')) LIKE '%todo%'        THEN 'todo'
        WHEN LOWER(COALESCE(cost_justification, '')) LIKE '%+-  %'
          OR LOWER(COALESCE(cost_justification, '')) LIKE '%parametric%'  THEN 'parametric'
        ELSE 'quoted'
    END
WHERE cost_provenance = 'todo';

COMMENT ON COLUMN public.parts.cost_provenance IS
    'Cost reliability classification: quoted | parametric | placeholder | todo. '
    'Written by the BOM merge stage via bom-reconciliation.ts classifyCostProvenance(). '
    'Read by the PDF cost-waterfall renderer to add warning badges on uncertain rows.';
