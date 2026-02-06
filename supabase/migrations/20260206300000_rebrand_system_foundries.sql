-- Migration: Rebrand system foundries from Centaur to Forge
-- Renames system foundry IDs and display names, and renames centaur_discount_percent column

-- Step 1: Update system foundry display names
UPDATE foundries 
SET name = 'The Forge Guild', 
    updated_at = now()
WHERE id = 'centaur-guild';

UPDATE foundries 
SET name = 'Forge Marketplace', 
    updated_at = now()
WHERE id = 'centaur-suppliers';

-- Step 2: Create new system foundries with new IDs
INSERT INTO foundries (id, name, slug, created_at, updated_at)
VALUES 
  ('forge-guild', 'The Forge Guild', 'forge-guild', now(), now()),
  ('forge-suppliers', 'Forge Marketplace', 'forge-suppliers', now(), now())
ON CONFLICT (id) DO NOTHING;

-- Step 3: Migrate users from old foundry IDs to new ones
UPDATE profiles 
SET foundry_id = 'forge-guild', updated_at = now()
WHERE foundry_id = 'centaur-guild';

UPDATE profiles 
SET foundry_id = 'forge-suppliers', updated_at = now()
WHERE foundry_id = 'centaur-suppliers';

-- Step 4: Update any invitations referencing old foundry IDs
UPDATE company_invitations 
SET foundry_id = 'forge-guild'
WHERE foundry_id = 'centaur-guild';

UPDATE company_invitations 
SET foundry_id = 'forge-suppliers'
WHERE foundry_id = 'centaur-suppliers';

-- Step 5: Rename centaur_discount_percent column to forge_discount_percent
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_profiles' 
    AND column_name = 'centaur_discount_percent'
  ) THEN
    ALTER TABLE provider_profiles 
    RENAME COLUMN centaur_discount_percent TO forge_discount_percent;
  END IF;
END $$;

-- Step 6: Update any materialized views or search vectors that reference old column name
-- (These will be automatically handled by the app code which now references forge_discount_percent)

-- Step 7: Clean up old system foundries (only if no more references)
-- We keep them around briefly for safety but mark them as deprecated
-- DELETE FROM foundries WHERE id IN ('centaur-guild', 'centaur-suppliers');
-- ^ Uncomment after confirming all references are migrated
