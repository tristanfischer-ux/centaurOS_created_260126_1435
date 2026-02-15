-- Create a demo foundry for E2E test accounts
--
-- PROBLEM: The migration 20260204270000 set demo users' foundry_id to 'foundry-demo'
-- but never created the foundry. This causes all authenticated pages to show
-- "No Foundry Found" errors in E2E tests.
--
-- FIX: Create the 'foundry-demo' foundry and ensure demo users are properly associated.

-- 1. Create the demo foundry (idempotent)
INSERT INTO public.foundries (id, name, slug, industry, stage, created_at)
VALUES (
    'foundry-demo',
    'Demo Foundry Labs',
    'demo-foundry-labs',
    'Engineering Services',
    'Growth',
    now()
)
ON CONFLICT (id) DO NOTHING;

-- 2. Update demo user profiles to point to foundry-demo
-- Only update if they don't already have a valid foundry_id
UPDATE public.profiles
SET 
    foundry_id = 'foundry-demo',
    active_foundry_id = 'foundry-demo'
WHERE email IN (
    'demo.founder@forgeos.io',
    'demo.executive@forgeos.io',
    'demo.apprentice@forgeos.io'
)
AND (
    foundry_id IS NULL 
    OR foundry_id = '' 
    OR NOT EXISTS (SELECT 1 FROM public.foundries WHERE id = profiles.foundry_id)
);

-- 3. Create foundry_memberships for demo users (idempotent)
-- Founder
INSERT INTO public.foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
SELECT p.id, 'foundry-demo', 'Founder', true, now()
FROM public.profiles p
WHERE p.email = 'demo.founder@forgeos.io'
  AND NOT EXISTS (
    SELECT 1 FROM public.foundry_memberships fm 
    WHERE fm.user_id = p.id AND fm.foundry_id = 'foundry-demo'
  );

-- Executive
INSERT INTO public.foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
SELECT p.id, 'foundry-demo', 'Executive', true, now()
FROM public.profiles p
WHERE p.email = 'demo.executive@forgeos.io'
  AND NOT EXISTS (
    SELECT 1 FROM public.foundry_memberships fm 
    WHERE fm.user_id = p.id AND fm.foundry_id = 'foundry-demo'
  );

-- Apprentice
INSERT INTO public.foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
SELECT p.id, 'foundry-demo', 'Apprentice', true, now()
FROM public.profiles p
WHERE p.email = 'demo.apprentice@forgeos.io'
  AND NOT EXISTS (
    SELECT 1 FROM public.foundry_memberships fm 
    WHERE fm.user_id = p.id AND fm.foundry_id = 'foundry-demo'
  );

-- 4. Set the foundry owner to the demo founder
UPDATE public.foundries
SET owner_id = (SELECT id FROM public.profiles WHERE email = 'demo.founder@forgeos.io' LIMIT 1)
WHERE id = 'foundry-demo'
  AND owner_id IS NULL;
