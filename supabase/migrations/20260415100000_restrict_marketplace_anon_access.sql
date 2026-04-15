-- =============================================
-- SECURITY: Remove anonymous access to marketplace_listings
-- =============================================
--
-- The migration 20260202140328_fix_marketplace_rls.sql opened marketplace_listings
-- to both 'authenticated' and 'anon' roles. This was originally intended for a
-- public catalog use-case, but the marketplace now contains sensitive investor and
-- partner data that should only be visible to authenticated users.
--
-- This migration reverts to authenticated-only SELECT access.
-- INSERT/UPDATE/DELETE policies (Service Role Manage Marketplace) are unchanged.

-- Drop the permissive anon+authenticated policy
DROP POLICY IF EXISTS "Global Read for Marketplace" ON public.marketplace_listings;

-- Re-create with authenticated-only access
CREATE POLICY "Global Read for Marketplace" ON public.marketplace_listings
    FOR SELECT USING (auth.role() = 'authenticated');

COMMENT ON POLICY "Global Read for Marketplace" ON public.marketplace_listings IS
'Restricts marketplace browsing to authenticated users only. Anonymous access removed 2026-04-15.';
