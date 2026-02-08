-- =============================================
-- MIGRATION: Make objective packs publicly readable
-- =============================================
-- Purpose: objective_packs and pack_items are public templates, not user data.
-- They should be readable without authentication to prevent empty results
-- when auth sessions expire or are invalid during server action calls.
--
-- Previously, only "authenticated" users could read packs, which meant
-- any auth session issue silently returned 0 results.

-- Add public SELECT policy for objective_packs
DROP POLICY IF EXISTS "Anyone can read objective packs" ON public.objective_packs;
CREATE POLICY "Anyone can read objective packs" ON public.objective_packs
    FOR SELECT USING (true);

-- Add public SELECT policy for pack_items
DROP POLICY IF EXISTS "Anyone can read pack items" ON public.pack_items;
CREATE POLICY "Anyone can read pack items" ON public.pack_items
    FOR SELECT USING (true);
