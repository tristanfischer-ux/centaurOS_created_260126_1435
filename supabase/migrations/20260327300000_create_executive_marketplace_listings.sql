-- Migration: Create marketplace People listings for real executives
-- INTENT: Executives who sign up should be discoverable via the Recruits page.
-- The Recruits page queries marketplace_listings WHERE category='People'.
-- Previously, only seed/demo executives had listings. Real signups had
-- provider_profiles but no marketplace presence.
--
-- This creates a basic People listing for each real executive who has a
-- sandbox foundry (i.e., signed up as an executive, not a founder).
-- They can enrich their listing later via their profile.

INSERT INTO public.marketplace_listings (category, subcategory, title, description, attributes, is_verified)
SELECT
  'People',
  'Executive',
  p.full_name,
  'Fractional Executive available for engagements. Complete your profile to add more details about your experience and expertise.',
  jsonb_build_object(
    'role', 'Fractional Executive',
    'availability', 'Available',
    'profile_id', p.id,
    'function_category', 'operations'
  ),
  false
FROM profiles p
JOIN foundries f ON f.id = p.foundry_id
WHERE f.is_sandbox = true
  AND p.role = 'Executive'
  -- Don't create duplicates for executives who already have a listing
  AND NOT EXISTS (
    SELECT 1 FROM public.marketplace_listings ml
    WHERE ml.title = p.full_name
      AND ml.category = 'People'
  );
