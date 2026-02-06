-- Migration: Multi-Foundry Support
-- Allows users (especially executives and apprentices) to belong to multiple foundries simultaneously
-- Adds foundry_memberships junction table and active_foundry_id to profiles

-- Step 1: Create the foundry_memberships table
CREATE TABLE IF NOT EXISTS foundry_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  foundry_id text NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'Apprentice',
  is_primary boolean DEFAULT false,
  joined_at timestamptz DEFAULT now(),
  invited_by uuid REFERENCES profiles(id),
  UNIQUE(user_id, foundry_id)
);

-- Step 2: Add active_foundry_id column to profiles
-- This is the "currently selected" workspace, nullable (defaults to primary)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS active_foundry_id text REFERENCES foundries(id);

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_foundry_memberships_user_id ON foundry_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_foundry_memberships_foundry_id ON foundry_memberships(foundry_id);
CREATE INDEX IF NOT EXISTS idx_foundry_memberships_user_foundry ON foundry_memberships(user_id, foundry_id);
CREATE INDEX IF NOT EXISTS idx_profiles_active_foundry ON profiles(active_foundry_id);

-- Step 4: Migrate existing data from profiles.foundry_id into foundry_memberships
-- Every existing user gets a membership record for their current foundry
INSERT INTO foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
SELECT 
  p.id,
  p.foundry_id,
  p.role,
  true,  -- Their current foundry is their primary
  COALESCE(p.created_at, now())
FROM profiles p
WHERE p.foundry_id IS NOT NULL
ON CONFLICT (user_id, foundry_id) DO NOTHING;

-- Step 5: Set active_foundry_id to current foundry_id for all existing users
UPDATE profiles 
SET active_foundry_id = foundry_id
WHERE foundry_id IS NOT NULL AND active_foundry_id IS NULL;

-- Step 6: Enable RLS on foundry_memberships
ALTER TABLE foundry_memberships ENABLE ROW LEVEL SECURITY;

-- Users can see their own memberships
CREATE POLICY "Users can view own memberships" ON foundry_memberships
  FOR SELECT USING (auth.uid() = user_id);

-- Users in the same foundry can see each other's memberships
CREATE POLICY "Foundry members can view co-members" ON foundry_memberships
  FOR SELECT USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM foundry_memberships fm WHERE fm.user_id = auth.uid()
    )
  );

-- Only the user themselves can update their own membership (e.g., set primary)
CREATE POLICY "Users can update own memberships" ON foundry_memberships
  FOR UPDATE USING (auth.uid() = user_id);

-- Admins (Founders/Executives) can insert memberships for their foundry
CREATE POLICY "Admins can create memberships" ON foundry_memberships
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM foundry_memberships fm
      JOIN profiles p ON p.id = fm.user_id
      WHERE fm.user_id = auth.uid()
      AND fm.foundry_id = foundry_memberships.foundry_id
      AND p.role IN ('Founder', 'Executive')
    )
    OR auth.uid() = user_id  -- Users can also create their own (for accepting invitations)
  );

-- Step 7: Create helper function to get user's active foundry
CREATE OR REPLACE FUNCTION get_active_foundry_id(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    p.active_foundry_id,
    (SELECT fm.foundry_id FROM foundry_memberships fm 
     WHERE fm.user_id = p_user_id AND fm.is_primary = true 
     LIMIT 1),
    p.foundry_id
  )
  FROM profiles p
  WHERE p.id = p_user_id;
$$;

-- Step 8: Create function to get all foundries for a user
CREATE OR REPLACE FUNCTION get_user_foundries(p_user_id uuid)
RETURNS TABLE(
  foundry_id text,
  foundry_name text,
  role member_role,
  is_primary boolean,
  is_active boolean,
  member_count bigint,
  joined_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    fm.foundry_id,
    f.name as foundry_name,
    fm.role,
    fm.is_primary,
    (fm.foundry_id = COALESCE(p.active_foundry_id, fm.foundry_id)) as is_active,
    (SELECT count(*) FROM foundry_memberships fm2 WHERE fm2.foundry_id = fm.foundry_id) as member_count,
    fm.joined_at
  FROM foundry_memberships fm
  JOIN foundries f ON f.id = fm.foundry_id
  JOIN profiles p ON p.id = fm.user_id
  WHERE fm.user_id = p_user_id
  ORDER BY fm.is_primary DESC, fm.joined_at ASC;
$$;

-- Step 9: Create function to switch active foundry
CREATE OR REPLACE FUNCTION switch_active_foundry(p_user_id uuid, p_foundry_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify user has membership in the target foundry
  IF NOT EXISTS (
    SELECT 1 FROM foundry_memberships 
    WHERE user_id = p_user_id AND foundry_id = p_foundry_id
  ) THEN
    RETURN false;
  END IF;
  
  -- Update active foundry
  UPDATE profiles 
  SET active_foundry_id = p_foundry_id,
      -- Also update the legacy foundry_id and role for backward compatibility
      foundry_id = p_foundry_id,
      role = (SELECT role FROM foundry_memberships WHERE user_id = p_user_id AND foundry_id = p_foundry_id),
      updated_at = now()
  WHERE id = p_user_id;
  
  RETURN true;
END;
$$;
