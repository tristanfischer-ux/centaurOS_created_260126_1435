-- Migration: Add account_type to distinguish suppliers from team builders
-- This determines which portal users land on after login

-- 1. Create the account_type enum
DO $$ BEGIN
    CREATE TYPE account_type AS ENUM ('team_builder', 'supplier');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add account_type column to profiles (nullable for backward compatibility)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_type account_type;

-- 3. Create index for efficient filtering by account type
CREATE INDEX IF NOT EXISTS idx_profiles_account_type ON profiles(account_type);

-- 4. Add comment for documentation
COMMENT ON COLUMN profiles.account_type IS 'Determines user portal: supplier = supplier-portal, team_builder = standard platform';

-- 5. Create the shared foundry for suppliers
INSERT INTO foundries (id, name, slug, owner_id)
VALUES (
    'centaur-suppliers',
    'Centaur Marketplace Suppliers',
    'centaur-suppliers',
    NULL -- System user (no profile)
)
ON CONFLICT (id) DO NOTHING;
