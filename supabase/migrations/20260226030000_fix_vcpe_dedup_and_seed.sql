-- =============================================
-- FIX: Make vc_pe_contacts seed idempotent
-- Generated: 2026-02-26
-- Purpose:
--   1. Add unique constraint on vc_pe_contacts (listing_id, full_name)
--   2. Re-seed contacts using ON CONFLICT DO NOTHING (safe to re-run)
-- =============================================

-- Step 1: Remove duplicate vc_pe_contacts (from manual seeding), keeping the first-created
DELETE FROM public.vc_pe_contacts
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY listing_id, full_name ORDER BY created_at ASC) AS rn
        FROM public.vc_pe_contacts
    ) dupes
    WHERE rn > 1
);

-- Step 2: Unique constraint for idempotent seeding
CREATE UNIQUE INDEX IF NOT EXISTS vc_pe_contacts_listing_name_uniq
    ON public.vc_pe_contacts (listing_id, full_name);

-- Seedcamp
INSERT INTO public.vc_pe_contacts (listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker, outreach_status)
SELECT id, 'Carlos Espinal', 'Managing Partner', 'partner', 'carlos@seedcamp.com', 'https://www.linkedin.com/in/carlosespinal', true, 'not_started'
FROM public.marketplace_listings WHERE title = 'Seedcamp' AND category = 'Finance' LIMIT 1
ON CONFLICT (listing_id, full_name) DO NOTHING;

INSERT INTO public.vc_pe_contacts (listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker, outreach_status)
SELECT id, 'Reshma Sohoni', 'Co-Founder & Managing Partner', 'partner', 'reshma@seedcamp.com', 'https://www.linkedin.com/in/reshmasohoni', true, 'not_started'
FROM public.marketplace_listings WHERE title = 'Seedcamp' AND category = 'Finance' LIMIT 1
ON CONFLICT (listing_id, full_name) DO NOTHING;

INSERT INTO public.vc_pe_contacts (listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker, outreach_status)
SELECT id, 'Kate McGinn', 'Principal', 'principal', NULL, 'https://www.linkedin.com/in/katemcginn', false, 'not_started'
FROM public.marketplace_listings WHERE title = 'Seedcamp' AND category = 'Finance' LIMIT 1
ON CONFLICT (listing_id, full_name) DO NOTHING;

-- Balderton Capital
INSERT INTO public.vc_pe_contacts (listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker, outreach_status)
SELECT id, 'Bernard Liautaud', 'Managing Partner', 'partner', NULL, 'https://www.linkedin.com/in/bernardliautaud', true, 'not_started'
FROM public.marketplace_listings WHERE title = 'Balderton Capital' AND category = 'Finance' LIMIT 1
ON CONFLICT (listing_id, full_name) DO NOTHING;

INSERT INTO public.vc_pe_contacts (listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker, outreach_status)
SELECT id, 'James Wise', 'Partner', 'partner', NULL, 'https://www.linkedin.com/in/jameswise', true, 'not_started'
FROM public.marketplace_listings WHERE title = 'Balderton Capital' AND category = 'Finance' LIMIT 1
ON CONFLICT (listing_id, full_name) DO NOTHING;

-- Atomico
INSERT INTO public.vc_pe_contacts (listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker, outreach_status)
SELECT id, 'Niklas Zennström', 'Founding Partner & CEO', 'partner', NULL, 'https://www.linkedin.com/in/niklaszennstrom', true, 'not_started'
FROM public.marketplace_listings WHERE title = 'Atomico' AND category = 'Finance' LIMIT 1
ON CONFLICT (listing_id, full_name) DO NOTHING;

INSERT INTO public.vc_pe_contacts (listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker, outreach_status)
SELECT id, 'Hiro Tamura', 'Partner', 'partner', NULL, 'https://www.linkedin.com/in/hirotamura', true, 'not_started'
FROM public.marketplace_listings WHERE title = 'Atomico' AND category = 'Finance' LIMIT 1
ON CONFLICT (listing_id, full_name) DO NOTHING;

INSERT INTO public.vc_pe_contacts (listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker, outreach_status)
SELECT id, 'Sophia Bendz', 'Partner', 'partner', NULL, 'https://www.linkedin.com/in/sophiabendz', false, 'not_started'
FROM public.marketplace_listings WHERE title = 'Atomico' AND category = 'Finance' LIMIT 1
ON CONFLICT (listing_id, full_name) DO NOTHING;
