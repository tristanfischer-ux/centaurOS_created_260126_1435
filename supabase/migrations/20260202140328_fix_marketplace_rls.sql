-- =============================================
-- FIX: Marketplace RLS Policy
-- =============================================
-- 
-- Root cause: The policy only allowed auth.role() = 'authenticated',
-- which blocks anon users from browsing the marketplace.
-- 
-- Solution: Allow both 'authenticated' AND 'anon' roles to read listings.
-- This is safe because marketplace_listings is a public catalog.

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Global Read for Marketplace" ON public.marketplace_listings;

-- Create new policy that allows both anon and authenticated users to read
CREATE POLICY "Global Read for Marketplace" ON public.marketplace_listings
    FOR SELECT USING (auth.role() IN ('authenticated', 'anon'));

-- Comment for auditors
COMMENT ON POLICY "Global Read for Marketplace" ON public.marketplace_listings IS 
'Allows both authenticated and anonymous users to browse marketplace listings. This is a public catalog.';
