/**
 * Migration: Add logo_url to foundries table
 *
 * Purpose: Allow foundries to display a company logo in the sidebar
 * navigation and foundry switcher dropdown. The logo_url stores a
 * path to an image in Supabase Storage.
 *
 * Security:
 * - Existing RLS policies on foundries table cover this column
 * - No additional policies needed (column-level, not row-level)
 *
 * Related:
 * - Frontend: src/components/FoundrySwitcher.tsx
 * - Sidebar: src/components/Sidebar.tsx
 *
 * Rollback:
 *   ALTER TABLE foundries DROP COLUMN IF EXISTS logo_url;
 *   -- Then re-run the original get_user_foundries from 20260206400000
 */

-- Step 1: Add logo_url column
ALTER TABLE foundries ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN foundries.logo_url IS 'URL to the foundry logo image in Supabase Storage';

-- Step 2: Update get_user_foundries RPC to include logo_url
-- Must DROP first because CREATE OR REPLACE cannot change return type
DROP FUNCTION IF EXISTS get_user_foundries(uuid);

CREATE OR REPLACE FUNCTION get_user_foundries(p_user_id uuid)
RETURNS TABLE(
  foundry_id text,
  foundry_name text,
  role member_role,
  is_primary boolean,
  is_active boolean,
  member_count bigint,
  joined_at timestamptz,
  logo_url text
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
    fm.joined_at,
    f.logo_url
  FROM foundry_memberships fm
  JOIN foundries f ON f.id = fm.foundry_id
  JOIN profiles p ON p.id = fm.user_id
  WHERE fm.user_id = p_user_id
  ORDER BY fm.is_primary DESC, fm.joined_at ASC;
$$;
