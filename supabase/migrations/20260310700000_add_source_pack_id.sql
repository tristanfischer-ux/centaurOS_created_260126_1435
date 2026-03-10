-- Add source_pack_id to objectives for reliable tracking of which pack was used
ALTER TABLE objectives ADD COLUMN IF NOT EXISTS source_pack_id text;

-- No FK constraint since packs come from both objective_packs and subsystem_objective_packs tables
-- Best-effort tracking via text field

CREATE INDEX IF NOT EXISTS idx_objectives_source_pack_id ON objectives(source_pack_id) WHERE source_pack_id IS NOT NULL;
