/**
 * Migration: Restore RLS for profiles with membership-based access guard
 *
 * Purpose:
 * - Re-enable row-level security on public.profiles after emergency disable.
 * - Prevent cross-foundry profile visibility by default.
 * - Avoid recursive policy checks by using a SECURITY DEFINER helper function.
 *
 * Security:
 * - Authenticated users can view:
 *   1) their own profile
 *   2) profiles that share at least one foundry membership
 * - Users can only insert/update their own profile rows.
 * - Service role access remains available for server-side jobs.
 *
 * Related:
 * - 20260204260000_emergency_disable_profiles_rls.sql
 * - 20260206400000_multi_foundry_support.sql
 *
 * Rollback:
 * - Disable RLS on profiles and reintroduce authenticated-wide SELECT policy.
 */

-- SECURITY: Membership helper must bypass table RLS to avoid recursion.
CREATE OR REPLACE FUNCTION public.can_access_profile(target_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- AUTH: Only authenticated users can read profile rows.
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    -- Users may always read their own profile row.
    IF auth.uid() = target_profile_id THEN
        RETURN true;
    END IF;

    -- RLS: Access is limited to users sharing at least one foundry membership.
    RETURN EXISTS (
        SELECT 1
        FROM public.foundry_memberships viewer
        INNER JOIN public.foundry_memberships target
            ON viewer.foundry_id = target.foundry_id
        WHERE viewer.user_id = auth.uid()
          AND target.user_id = target_profile_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_profile(uuid) TO authenticated;

-- Remove emergency/open profile policies before restoring strict policies.
DROP POLICY IF EXISTS "authenticated_users_can_view_profiles" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_users_view_profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their foundry" ON public.profiles;
DROP POLICY IF EXISTS "Active users can view profiles in their foundry" ON public.profiles;
DROP POLICY IF EXISTS "view_profiles_same_foundry" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Active users can update own profile" ON public.profiles;

-- Restore row-level security enforcement.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- AUTH: Read own profile and shared-foundry profiles only.
CREATE POLICY "users_can_view_shared_foundry_profiles"
ON public.profiles
FOR SELECT
USING (public.can_access_profile(id));

-- AUTH: Users may only create their own profile record.
CREATE POLICY "users_can_insert_own_profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- AUTH: Users may only update their own profile record.
CREATE POLICY "users_can_update_own_profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

COMMENT ON FUNCTION public.can_access_profile(uuid)
IS 'Returns true when the current authenticated user shares any foundry membership with the target profile (or owns the profile).';
