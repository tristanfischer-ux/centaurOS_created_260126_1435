-- Stabilize profiles RLS to eliminate recursive policy failures.
--
-- Problem:
--   environments can still carry legacy profiles policies that call
--   get_my_foundry_id()/is_active_user() from inside profiles SELECT policies.
--   Those helper functions query profiles, which can recursively invoke profiles
--   policies and produce:
--   "infinite recursion detected in policy for relation \"profiles\""
--
-- Approach:
--   1) Drop all known legacy profiles policies (idempotent).
--   2) Recreate NON-recursive profiles policies that do not query profiles.
--   3) Keep RLS enabled while allowing authenticated profile reads and self-update.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop legacy/select/update policies seen across historical migrations.
DROP POLICY IF EXISTS "Active users can view profiles in their foundry" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their foundry" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "view_profiles_same_foundry" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_users_view_profiles" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_users_can_view_profiles" ON public.profiles;
DROP POLICY IF EXISTS "Active users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Canonical non-recursive policies.
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

COMMENT ON POLICY "profiles_select_authenticated" ON public.profiles
  IS 'Non-recursive profile visibility policy. Required to avoid profiles RLS recursion via helper functions.';
