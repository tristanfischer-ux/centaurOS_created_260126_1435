-- =============================================
-- MIGRATION: Marketplace Featured Listings
-- =============================================
-- This migration adds featured listing capabilities to the marketplace,
-- allowing listings to be promoted and ordered for specific user roles.

-- =============================================
-- 1. Add featured columns to marketplace_listings
-- =============================================

-- Add is_featured flag for quick filtering
ALTER TABLE public.marketplace_listings 
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false NOT NULL;

-- Add featured_for to target specific roles (founder, executive, apprentice, etc.)
-- Structure: ["founder", "executive"] or [] for all roles
ALTER TABLE public.marketplace_listings 
ADD COLUMN IF NOT EXISTS featured_for JSONB DEFAULT '[]'::jsonb NOT NULL;

-- Add featured_order for explicit ordering of featured items
-- Lower numbers appear first, NULL for non-featured items
ALTER TABLE public.marketplace_listings 
ADD COLUMN IF NOT EXISTS featured_order INTEGER DEFAULT NULL;

-- =============================================
-- 2. Create indexes for performance
-- =============================================

-- Index on is_featured for fast filtering of featured listings
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_featured 
ON public.marketplace_listings(is_featured) 
WHERE is_featured = true;

-- Composite index for featured ordering queries
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_featured_order 
ON public.marketplace_listings(is_featured, featured_order) 
WHERE is_featured = true;

-- GIN index on featured_for for role-based filtering
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_featured_for 
ON public.marketplace_listings USING GIN(featured_for);

-- =============================================
-- 3. Add comments for documentation
-- =============================================

COMMENT ON COLUMN public.marketplace_listings.is_featured IS 
'Indicates if this listing is featured in marketplace promotions';

COMMENT ON COLUMN public.marketplace_listings.featured_for IS 
'Array of user roles this listing is featured for. Empty array means featured for all roles.';

COMMENT ON COLUMN public.marketplace_listings.featured_order IS 
'Display order for featured listings (lower numbers first). NULL for non-featured items.';
