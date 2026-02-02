-- ================================================
-- SAVED MARKETPLACE LISTINGS
-- ================================================
-- Allow users to save/favorite marketplace listings for later viewing
-- This is user-specific (not foundry-wide like foundry_stack)

CREATE TABLE IF NOT EXISTS public.saved_marketplace_listings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, listing_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_saved_marketplace_listings_user_id 
    ON public.saved_marketplace_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_marketplace_listings_listing_id 
    ON public.saved_marketplace_listings(listing_id);

-- RLS Policies
ALTER TABLE public.saved_marketplace_listings ENABLE ROW LEVEL SECURITY;

-- Users can view their own saved listings
CREATE POLICY "Users can view their saved listings"
    ON public.saved_marketplace_listings
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can save listings
CREATE POLICY "Users can save listings"
    ON public.saved_marketplace_listings
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can unsave their own listings
CREATE POLICY "Users can unsave listings"
    ON public.saved_marketplace_listings
    FOR DELETE
    USING (auth.uid() = user_id);
