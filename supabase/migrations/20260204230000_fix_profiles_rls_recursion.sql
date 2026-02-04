-- Fix infinite recursion in profiles RLS policy
-- ISSUE: Both is_active_user() and get_my_foundry_id() query profiles table
-- This creates infinite recursion when profiles SELECT policy calls these functions
-- 
-- FIX: Use direct column checks instead of helper functions for SELECT policy

-- Drop the problematic policy
DROP POLICY IF EXISTS "Active users can view profiles in their foundry" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their foundry" ON public.profiles;

-- Recreate with direct SQL - no helper functions that query profiles
CREATE POLICY "Users can view profiles in their foundry" ON public.profiles
    FOR SELECT USING (
        -- Users can see profiles with same foundry_id as their own
        foundry_id = (
            SELECT p.foundry_id 
            FROM public.profiles p 
            WHERE p.id = auth.uid()
            LIMIT 1
        )
        OR auth.uid() = id  -- Users can always see their own profile
    );

-- Note: Active check removed from SELECT policy to prevent recursion
-- Access revocation handled at auth level, not RLS level
