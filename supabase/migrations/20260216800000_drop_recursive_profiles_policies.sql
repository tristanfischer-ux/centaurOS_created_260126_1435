/**
 * Migration: Drop the 3 stale/recursive policies on profiles
 *
 * Root cause found: debug_profiles_policies() revealed 6 active policies,
 * not 3. The extra 3 were NOT in our original drop list:
 *
 * 1. "select_profiles_in_foundry" (SELECT) - RECURSIVE! Contains:
 *    foundry_id = (SELECT profiles_1.foundry_id FROM profiles profiles_1 WHERE ...)
 *    This subquery on the SAME table triggers infinite recursion (42P17).
 *
 * 2. "insert_own_profile" (INSERT) - Duplicate of profiles_insert_own
 * 3. "update_own_profile" (UPDATE) - Duplicate of profiles_update_own
 *
 * After this migration, only the 3 canonical non-recursive policies remain:
 * - profiles_select_authenticated (SELECT, USING true)
 * - profiles_update_own (UPDATE, USING auth.uid() = id)
 * - profiles_insert_own (INSERT, WITH CHECK auth.uid() = id)
 *
 * Security: No change in effective access control.
 * Rollback: Not needed -- these policies were harmful.
 */

-- Drop the recursive SELECT policy (root cause of 42P17)
DROP POLICY IF EXISTS "select_profiles_in_foundry" ON public.profiles;

-- Drop duplicate INSERT policy
DROP POLICY IF EXISTS "insert_own_profile" ON public.profiles;

-- Drop duplicate UPDATE policy
DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;

-- Force PostgREST to pick up the change
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
