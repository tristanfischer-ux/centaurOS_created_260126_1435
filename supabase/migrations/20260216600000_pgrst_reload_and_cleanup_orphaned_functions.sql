/**
 * Migration: Force PostgREST schema reload + clean up orphaned functions
 *
 * Purpose:
 * 1) Force PostgREST to reload its schema cache. After many policy
 *    add/drop cycles, the cached schema may reference deleted policies
 *    or functions, causing 500 errors on table queries.
 *
 * 2) Drop orphaned helper functions that were used by old RLS policies
 *    but are no longer referenced by any active policy:
 *    - can_access_profile()    (was used by dropped users_can_view_shared_foundry_profiles)
 *    - get_my_foundry_id()     (was used by dropped Active users can view profiles)
 *    - is_active_user()        (was used by dropped Active users can view profiles)
 *
 * 3) Re-assert the three canonical non-recursive policies are the ONLY
 *    SELECT/UPDATE/INSERT policies on profiles. Drop everything else.
 *
 * Security:
 * - The three remaining policies are non-recursive and safe.
 * - SELECT: all authenticated users (USING true)
 * - UPDATE: own profile only (auth.uid() = id)
 * - INSERT: own profile only (auth.uid() = id)
 *
 * Rollback:
 * - Recreate the dropped functions if needed (not recommended).
 */

-- =====================================================================
-- STEP 1: Drop ALL profiles policies, then recreate only the 3 canonical
-- =====================================================================

-- Drop every known policy name from the entire migration history
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "users_can_view_shared_foundry_profiles" ON public.profiles;
DROP POLICY IF EXISTS "users_can_insert_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "users_can_update_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their foundry" ON public.profiles;
DROP POLICY IF EXISTS "Active users can view profiles in their foundry" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Active users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "view_profiles_same_foundry" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_users_view_profiles" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_users_can_view_profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_via_membership" ON public.profiles;

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Recreate the 3 canonical policies
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- =====================================================================
-- STEP 2: Drop orphaned helper functions
-- NOTE: get_my_foundry_id() and is_active_user() are used by 50+ RLS
-- policies on other tables (objectives, tasks, teams, etc.), so we
-- MUST keep them. Only drop functions that were solely for profiles.
-- =====================================================================

DROP FUNCTION IF EXISTS public.can_access_profile(uuid);

-- =====================================================================
-- STEP 3: Force PostgREST to reload its schema cache
-- =====================================================================

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
