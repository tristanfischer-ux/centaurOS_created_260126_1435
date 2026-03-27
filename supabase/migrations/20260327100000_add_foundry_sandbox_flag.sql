-- Migration: Add is_sandbox flag to foundries
-- INTENT: Distinguish personal sandbox workspaces from real company foundries.
-- Every new executive/apprentice gets their own isolated sandbox instead of
-- sharing forge-guild. This prevents cross-user data pollution.

ALTER TABLE foundries ADD COLUMN is_sandbox boolean NOT NULL DEFAULT false;

-- Mark forge-guild as sandbox since it was effectively a shared sandbox
UPDATE foundries SET is_sandbox = true WHERE id = 'forge-guild';

-- Update get_user_foundries RPC to include is_sandbox in the return type
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
  logo_url text,
  is_sandbox boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    fm.foundry_id,
    f.name as foundry_name,
    fm.role,
    fm.is_primary,
    (fm.foundry_id = COALESCE(p.active_foundry_id, fm.foundry_id)) as is_active,
    (SELECT count(*) FROM foundry_memberships fm2 WHERE fm2.foundry_id = fm.foundry_id) as member_count,
    fm.joined_at,
    f.logo_url,
    f.is_sandbox
  FROM foundry_memberships fm
  JOIN foundries f ON f.id = fm.foundry_id
  JOIN profiles p ON p.id = fm.user_id
  WHERE fm.user_id = p_user_id
  ORDER BY fm.is_primary DESC, fm.joined_at ASC;
$$;
