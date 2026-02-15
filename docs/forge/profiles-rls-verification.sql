-- Forge Design→RFQ release: profiles RLS verification checks
-- Run after applying:
-- supabase/migrations/20260215120000_stabilize_profiles_rls_no_recursion.sql

-- 1) Verify canonical profiles policy names exist
select policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;

-- 2) Verify policy expressions are non-recursive
select
  policyname,
  coalesce(qual, '') as using_expression,
  coalesce(with_check, '') as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;

-- Expected checks:
-- - includes profiles_select_authenticated
-- - includes profiles_update_own
-- - no get_my_foundry_id( references
-- - no is_active_user( references
-- - profiles_update_own uses auth.uid() = id in both USING and WITH CHECK
