-- =============================================
-- SEED DATA: Sample VC/PE Contacts
-- Generated: 2026-02-25
-- Purpose: Populate vc_pe_contacts for 3 firms so the Key People UI can be verified.
-- All data is fictional/demo. Uses subselects on firm title to avoid hard-coded UUIDs.
-- =============================================

-- Seedcamp contacts
INSERT INTO public.vc_pe_contacts (listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker, outreach_status)
SELECT id, 'Carlos Espinal', 'Managing Partner', 'partner', 'carlos@seedcamp.com', 'https://www.linkedin.com/in/carlosespinal', true, 'not_started'
FROM public.marketplace_listings WHERE title = 'Seedcamp' AND category = 'Finance' LIMIT 1;

INSERT INTO public.vc_pe_contacts (listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker, outreach_status)
SELECT id, 'Reshma Sohoni', 'Co-Founder & Managing Partner', 'partner', 'reshma@seedcamp.com', 'https://www.linkedin.com/in/reshmasohoni', true, 'not_started'
FROM public.marketplace_listings WHERE title = 'Seedcamp' AND category = 'Finance' LIMIT 1;

INSERT INTO public.vc_pe_contacts (listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker, outreach_status)
SELECT id, 'Kate McGinn', 'Principal', 'principal', NULL, 'https://www.linkedin.com/in/katemcginn', false, 'not_started'
FROM public.marketplace_listings WHERE title = 'Seedcamp' AND category = 'Finance' LIMIT 1;

-- Balderton Capital contacts
INSERT INTO public.vc_pe_contacts (listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker, outreach_status)
SELECT id, 'Bernard Liautaud', 'Managing Partner', 'partner', NULL, 'https://www.linkedin.com/in/bernardliautaud', true, 'not_started'
FROM public.marketplace_listings WHERE title = 'Balderton Capital' AND category = 'Finance' LIMIT 1;

INSERT INTO public.vc_pe_contacts (listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker, outreach_status)
SELECT id, 'James Wise', 'Partner', 'partner', NULL, 'https://www.linkedin.com/in/jameswise', true, 'not_started'
FROM public.marketplace_listings WHERE title = 'Balderton Capital' AND category = 'Finance' LIMIT 1;

-- Atomico contacts
INSERT INTO public.vc_pe_contacts (listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker, outreach_status)
SELECT id, 'Niklas Zennström', 'Founding Partner & CEO', 'partner', NULL, 'https://www.linkedin.com/in/niklaszennstrom', true, 'not_started'
FROM public.marketplace_listings WHERE title = 'Atomico' AND category = 'Finance' LIMIT 1;

INSERT INTO public.vc_pe_contacts (listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker, outreach_status)
SELECT id, 'Hiro Tamura', 'Partner', 'partner', NULL, 'https://www.linkedin.com/in/hirotamura', true, 'not_started'
FROM public.marketplace_listings WHERE title = 'Atomico' AND category = 'Finance' LIMIT 1;

INSERT INTO public.vc_pe_contacts (listing_id, full_name, title, seniority, email, linkedin_url, is_decision_maker, outreach_status)
SELECT id, 'Sophia Bendz', 'Partner', 'partner', NULL, 'https://www.linkedin.com/in/sophiabendz', false, 'not_started'
FROM public.marketplace_listings WHERE title = 'Atomico' AND category = 'Finance' LIMIT 1;
