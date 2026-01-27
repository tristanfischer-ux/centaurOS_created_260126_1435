-- =============================================
-- FIX: Break Infinite Recursion in Profiles RLS
-- =============================================

-- The previous policy on profiles utilized a subquery to profiles itself to get the foundry_id.
-- This caused an infinite recursion loop (Stack Overflow / 500 Error) when querying profiles,
-- or when querying tables that join profiles (like Tasks).

-- The fix is to use the SECURITY DEFINER function `get_my_foundry_id()` which bypasses RLS
-- to safely retrieve the user's foundry_id without triggering the policy again.

-- 1. Drop the problematic policy
DROP POLICY IF EXISTS "Users can view profiles in their foundry" ON public.profiles;

-- 2. Re-create using the safe function
CREATE POLICY "Users can view profiles in their foundry" ON public.profiles
    FOR SELECT USING (
        foundry_id = get_my_foundry_id()
    );

-- 3. Ensure users can always see themselves (redundant but safe fallback)
-- Actually, the above covers it if they belong to the same foundry (which they do).
-- But we can add an OR condition for ID = auth.uid() if needed.
-- For strict Foundry isolation, the above is consistent.

-- =============================================
-- END FIX
-- =============================================
