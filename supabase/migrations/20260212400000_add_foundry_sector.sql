-- ============================================================
-- ForgeOS: Add standardised sector to foundries
-- Migration: 20260212400000_add_foundry_sector
-- ============================================================
-- Adds a controlled-vocabulary sector column so that the CAD Lab
-- can filter its component library to the company's industry.
-- The existing free-text `industry` column is kept for advisory/
-- inspiration features; this new column provides machine-readable
-- sector matching.

ALTER TABLE foundries
  ADD COLUMN IF NOT EXISTS sector TEXT;

-- VALIDATION: Only allow known sector values
ALTER TABLE foundries
  ADD CONSTRAINT foundries_sector_check
  CHECK (sector IS NULL OR sector IN (
    'aerospace',
    'agriculture',
    'automotive',
    'construction',
    'consumer_electronics',
    'defence',
    'energy',
    'food_processing',
    'logistics',
    'manufacturing',
    'marine',
    'medical',
    'mining',
    'robotics',
    'other'
  ));

-- Backfill from existing free-text industry field using best-effort ILIKE mapping.
-- Any row that doesn't match stays NULL — the user can set it via Company Profile.
UPDATE foundries SET sector = CASE
  WHEN industry ILIKE '%aerospace%' OR industry ILIKE '%space%' OR industry ILIKE '%satellite%' THEN 'aerospace'
  WHEN industry ILIKE '%agricult%' OR industry ILIKE '%farm%' OR industry ILIKE '%crop%' THEN 'agriculture'
  WHEN industry ILIKE '%automotive%' OR industry ILIKE '%vehicle%' OR industry ILIKE '%car%' THEN 'automotive'
  WHEN industry ILIKE '%construct%' OR industry ILIKE '%architect%' OR industry ILIKE '%building%' THEN 'construction'
  WHEN industry ILIKE '%consumer%' OR industry ILIKE '%electronic%' OR industry ILIKE '%iot%' THEN 'consumer_electronics'
  WHEN industry ILIKE '%defen%' OR industry ILIKE '%military%' OR industry ILIKE '%security%' THEN 'defence'
  WHEN industry ILIKE '%energy%' OR industry ILIKE '%solar%' OR industry ILIKE '%renewable%' OR industry ILIKE '%power%' THEN 'energy'
  WHEN industry ILIKE '%food%' OR industry ILIKE '%biotech%' OR industry ILIKE '%insect%' OR industry ILIKE '%bsf%' THEN 'food_processing'
  WHEN industry ILIKE '%logistic%' OR industry ILIKE '%warehouse%' OR industry ILIKE '%supply chain%' THEN 'logistics'
  WHEN industry ILIKE '%manufactur%' OR industry ILIKE '%cnc%' OR industry ILIKE '%machining%' THEN 'manufacturing'
  WHEN industry ILIKE '%marine%' OR industry ILIKE '%subsea%' OR industry ILIKE '%ocean%' THEN 'marine'
  WHEN industry ILIKE '%medical%' OR industry ILIKE '%health%' OR industry ILIKE '%pharma%' THEN 'medical'
  WHEN industry ILIKE '%mining%' OR industry ILIKE '%extraction%' OR industry ILIKE '%brine%' THEN 'mining'
  WHEN industry ILIKE '%robot%' OR industry ILIKE '%drone%' OR industry ILIKE '%uav%' OR industry ILIKE '%automation%' THEN 'robotics'
  ELSE NULL
END
WHERE industry IS NOT NULL AND sector IS NULL;

-- RLS: sector column inherits existing foundries RLS policies (no new policy needed)
