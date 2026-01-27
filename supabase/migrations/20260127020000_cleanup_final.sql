-- =============================================
-- MIGRATION: Final Cleanup of Insecure Policies
-- =============================================

-- Drop specific insecure policies found during final verification

-- TEAM MEMBERS
-- Critical: This policy was found to have 'true' as qualification, allowing public access
DROP POLICY IF EXISTS "Users can manage team members" ON public.team_members;

-- FOUNDRY STACK
-- These policies use simple 'authenticated' checks, allowing cross-user data leakage
DROP POLICY IF EXISTS "Users can add to stack" ON public.foundry_stack;
DROP POLICY IF EXISTS "Users can remove from stack" ON public.foundry_stack;
DROP POLICY IF EXISTS "Users can view their stack" ON public.foundry_stack;

-- Re-apply 'users can see their own stack' if we can guess the schema, 
-- but safely, we just drop the insecure ones. 
-- Assuming `foundry_stack` has `foundry_id` (likely given the name)
-- We will try to add a secure policy if schema allows, but DROP is the priority.
-- To be safe, we just DROP. Secure policies can be added when feature is revisited.


-- =============================================
-- END OF FINAL CLEANUP
-- =============================================
