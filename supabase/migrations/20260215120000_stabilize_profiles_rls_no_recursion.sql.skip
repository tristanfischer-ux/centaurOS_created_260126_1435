-- Stabilize profiles RLS to eliminate recursive policy failures.
--
-- Problem:
--   Environments can still carry legacy profiles policies that call
--   get_my_foundry_id()/is_active_user() from inside profiles SELECT policies.
--   Those helper functions query profiles, which can recursively invoke profiles
--   policies and produce:
--   "infinite recursion detected in policy for relation \"profiles\""
--
-- Approach:
--   1) Drop all known legacy profiles policies (idempotent).
--   2) Recreate NON-recursive profiles policies that do not query profiles.
--   3) Keep RLS enabled while allowing authenticated profile reads, self-insert, and self-update.
--
-- Security:
--   - All authenticated users can read all profiles (non-recursive).
--   - Users can only insert their own profile (auth.uid() = id).
--   - Users can only update their own profile (auth.uid() = id).
--   - Foundry-level isolation is enforced at the application layer and in
--     other table policies, not on the profiles table itself.
--
-- Rollback:
--   ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop ALL known legacy profiles policies (idempotent).
DROP POLICY IF EXISTS "Active users can view profiles in their foundry" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their foundry" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "view_profiles_same_foundry" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_users_view_profiles" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_users_can_view_profiles" ON public.profiles;
DROP POLICY IF EXISTS "Active users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_via_membership" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- Canonical non-recursive policies.

-- SELECT: All authenticated users can read all profiles.
-- This avoids recursion because it doesn't query profiles or any dependent table.
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Users can only create their own profile row (during signup).
CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- UPDATE: Users can only update their own profile row.
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

COMMENT ON POLICY "profiles_select_authenticated" ON public.profiles
  IS 'Non-recursive profile visibility. All authenticated users can see all profiles. Foundry isolation is enforced at the application layer.';

COMMENT ON POLICY "profiles_insert_own" ON public.profiles
  IS 'Users can only insert their own profile during signup. auth.uid() must match the profile id.';

COMMENT ON POLICY "profiles_update_own" ON public.profiles
  IS 'Users can only update their own profile. Prevents cross-user profile modification.';
