-- EMERGENCY FIX: Disable RLS on profiles to fix infinite recursion
-- 
-- The profiles RLS policy was causing infinite recursion when:
-- 1. Tasks query joins with profiles
-- 2. Profiles RLS policy tries to check user's foundry_id
-- 3. Which requires querying profiles table again → infinite loop
--
-- This is a temporary fix to unblock the application.
-- Proper solution requires re-architecting the RLS policy structure.
--
-- Security implications:
-- - Users can now view all profiles across foundries
-- - Data isolation still enforced at tasks/objectives/messages level
-- - Profile data (name, role) is not highly sensitive
-- - Proper fix should use cached session variables instead of table lookups

-- Drop all existing profiles SELECT policies
DROP POLICY IF EXISTS "Active users can view profiles in their foundry" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their foundry" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "view_profiles_same_foundry" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_users_view_profiles" ON public.profiles;

-- Temporarily use simple authenticated policy without ANY profile table lookups
CREATE POLICY "authenticated_users_can_view_profiles" ON public.profiles
    FOR SELECT TO authenticated
    USING (true);  -- Allow all authenticated users to view all profiles

-- TODO: Proper fix requires using JWT claims or session variables for foundry_id
-- See: https://supabase.com/docs/guides/auth/row-level-security#policies-with-security-definer-functions
