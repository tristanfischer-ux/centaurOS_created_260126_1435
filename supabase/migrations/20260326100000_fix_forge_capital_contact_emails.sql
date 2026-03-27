-- =============================================
-- MIGRATION: Fix Forge Capital Contact Emails
-- Generated: 2026-03-26
-- Purpose: Correct 6 email addresses in vc_pe_contacts and marketplace_listings
--          that were identified as bouncing during SkySails defence outreach.
--          Also adds Darkstar (Ragnar Sass) if not already present.
--
-- Source: Forge Capital database corrections applied 2026-03-26.
-- Contacts affected:
--   1. Niels V. Carlsen (Final Frontier) → niels@finalfrontier.vc
--   2. Thomas Friedberger (Tikehau Capital) → tfriedberger@tikehaucapital.com
--   3. Ragnar Sass (Darkstar) → ragnar.sass@gmail.com [NEW firm + contact]
--   4. Simon Drake (European Space Ventures) → emailme@simondrake.com
--   5. Thierry Vandewalle (Wind Capital) → thierry@wind.capital
--   6. Uwe Horstmann (Project A) → uwe@project-a.vc
-- =============================================

-- 1. Update Thomas Friedberger email at Tikehau (if contact exists)
UPDATE public.vc_pe_contacts
SET email = 'tfriedberger@tikehaucapital.com',
    email_verified = true,
    updated_at = now()
WHERE full_name = 'Thomas Friedberger'
  AND listing_id IN (
    SELECT id FROM public.marketplace_listings
    WHERE title ILIKE '%Tikehau%' AND category::text = 'Finance'
  );

-- 2. Update Tikehau firm-level contact_email in marketplace_listings attributes
UPDATE public.marketplace_listings
SET attributes = jsonb_set(
    attributes,
    '{contact_email}',
    '"tfriedberger@tikehaucapital.com"'
  )
WHERE title ILIKE '%Tikehau%'
  AND category::text = 'Finance'
  AND attributes->>'contact_email' IS NOT NULL;

-- 3. Update Niels V. Carlsen at Final Frontier (if exists)
UPDATE public.vc_pe_contacts
SET email = 'niels@finalfrontier.vc',
    email_verified = true,
    updated_at = now()
WHERE full_name = 'Niels V. Carlsen'
  AND listing_id IN (
    SELECT id FROM public.marketplace_listings
    WHERE title ILIKE '%Final Frontier%' AND category::text = 'Finance'
  );

-- 4. Update Simon Drake at European Space Ventures (if exists)
UPDATE public.vc_pe_contacts
SET email = 'emailme@simondrake.com',
    email_verified = true,
    updated_at = now()
WHERE full_name = 'Simon Drake'
  AND listing_id IN (
    SELECT id FROM public.marketplace_listings
    WHERE title ILIKE '%European Space%' AND category::text = 'Finance'
  );

-- 5. Update Thierry Vandewalle at Wind Capital (if exists)
UPDATE public.vc_pe_contacts
SET email = 'thierry@wind.capital',
    email_verified = true,
    updated_at = now()
WHERE full_name = 'Thierry Vandewalle'
  AND listing_id IN (
    SELECT id FROM public.marketplace_listings
    WHERE title ILIKE '%Wind Capital%' AND category::text = 'Finance'
  );

-- 6. Update Uwe Horstmann at Project A (if exists)
-- Note: Domain changed from project-a.com to project-a.vc
UPDATE public.vc_pe_contacts
SET email = 'uwe@project-a.vc',
    email_verified = true,
    updated_at = now()
WHERE full_name = 'Uwe Horstmann'
  AND listing_id IN (
    SELECT id FROM public.marketplace_listings
    WHERE title ILIKE '%Project A%' AND category::text = 'Finance'
  );

-- 7. Update Ragnar Sass at Darkstar (if exists)
UPDATE public.vc_pe_contacts
SET email = 'ragnar.sass@gmail.com',
    email_verified = true,
    updated_at = now()
WHERE full_name = 'Ragnar Sass'
  AND listing_id IN (
    SELECT id FROM public.marketplace_listings
    WHERE title ILIKE '%Darkstar%' AND category::text = 'Finance'
  );
