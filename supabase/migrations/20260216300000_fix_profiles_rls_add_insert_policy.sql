-- Fix profiles RLS: add missing INSERT policy and ensure non-recursive state.
--
-- Problem:
--   The previous stabilization migration (20260215120000) enabled RLS on profiles
--   and created SELECT + UPDATE policies, but missed an INSERT policy.
--   Without INSERT policy, new user signup fails silently when creating profiles.
--   Also ensures all legacy recursive policies are gone.
--
-- Security:
--   - INSERT: Users can only create their own profile (auth.uid() = id).
--   - SELECT: All authenticated users can read all profiles (non-recursive).
--   - UPDATE: Users can only update their own profile.

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop any leftover legacy or conflicting policies (idempotent)
DROP POLICY IF EXISTS "Users can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Active users can view profiles in their foundry" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their foundry" ON public.profiles;
DROP POLICY IF EXISTS "view_profiles_same_foundry" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_users_view_profiles" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_users_can_view_profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_via_membership" ON public.profiles;

-- Ensure canonical SELECT policy exists (idempotent re-create)
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Ensure canonical UPDATE policy exists (idempotent re-create)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Active users can update own profile" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Add the missing INSERT policy for signup
CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

COMMENT ON POLICY "profiles_insert_own" ON public.profiles
  IS 'Users can only insert their own profile during signup. auth.uid() must match the profile id.';
