-- =============================================
-- MIGRATION: Fix Orders Schema Gaps
-- =============================================
-- The orders service layer references columns that don't exist on
-- marketplace_listings (price, currency) and provider_profiles (display_name).
-- This migration adds them so createOrder can validate listing prices and
-- getOrders can display seller names without nested profile joins.

-- =============================================
-- 1. marketplace_listings: add price + currency
-- =============================================
-- Listings need an explicit price column for order price validation.
-- Nullable because some listings are "request a quote" / RFQ-based.
ALTER TABLE public.marketplace_listings
ADD COLUMN IF NOT EXISTS price DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'GBP';

-- =============================================
-- 2. provider_profiles: add display_name
-- =============================================
-- The order list query selects display_name from provider_profiles
-- to avoid a nested join through profiles.full_name every time.
ALTER TABLE public.provider_profiles
ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Back-fill display_name from profiles.full_name for existing providers
UPDATE public.provider_profiles pp
SET display_name = p.full_name
FROM public.profiles p
WHERE pp.user_id = p.id
  AND pp.display_name IS NULL
  AND p.full_name IS NOT NULL;

-- For any remaining nulls, fall back to headline or 'Provider'
UPDATE public.provider_profiles
SET display_name = COALESCE(headline, 'Provider')
WHERE display_name IS NULL;
