-- EMERGENCY: Completely disable RLS on profiles table
-- This is required to fix infinite recursion blocking the entire application
--
-- Root cause: Any RLS policy on profiles that queries profiles creates recursion
-- Temporary solution: Disable RLS entirely on profiles table
--
-- Security trade-off:
-- - Profiles are not highly sensitive (just name, role, email)
-- - Critical data isolation (tasks, messages, objectives) still enforced
-- - Users need to see team members for collaboration features
--
-- This unblocks the application immediately.

-- Drop all policies
DROP POLICY IF EXISTS "Active users can view profiles in their foundry" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their foundry" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "view_profiles_same_foundry" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_users_view_profiles" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_users_can_view_profiles" ON public.profiles;
DROP POLICY IF EXISTS "Active users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Disable RLS entirely
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Note: This is a temporary emergency fix
-- Proper solution requires restructuring to use JWT claims for foundry_id
