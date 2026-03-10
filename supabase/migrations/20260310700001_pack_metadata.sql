-- Add metadata columns to objective_packs for richer pack content
ALTER TABLE objective_packs ADD COLUMN IF NOT EXISTS prerequisites text[];
ALTER TABLE objective_packs ADD COLUMN IF NOT EXISTS success_criteria text[];
ALTER TABLE objective_packs ADD COLUMN IF NOT EXISTS tags text[];
