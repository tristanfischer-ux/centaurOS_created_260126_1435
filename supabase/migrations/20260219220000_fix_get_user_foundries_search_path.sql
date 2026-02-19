/**
 * Migration: Fix get_user_foundries search_path
 *
 * Purpose: The get_user_foundries RPC function was created without an explicit
 * search_path, causing "relation foundry_memberships does not exist" errors
 * in Supabase when the function's default search_path doesn't include public.
 *
 * Security:
 * - SECURITY DEFINER retained so the function runs with owner privileges
 * - search_path locked to public to prevent schema injection
 *
 * Rollback: Re-run the original function from 20260211210000
 */

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
    f.logo_url
  FROM foundry_memberships fm
  JOIN foundries f ON f.id = fm.foundry_id
  JOIN profiles p ON p.id = fm.user_id
  WHERE fm.user_id = p_user_id
  ORDER BY fm.is_primary DESC, fm.joined_at ASC;
$$;
