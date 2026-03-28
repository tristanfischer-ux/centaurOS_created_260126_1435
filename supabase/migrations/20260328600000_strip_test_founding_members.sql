-- Strip founding member status from test/demo/seed profiles.
-- These were flagged by the backfill migration but are not real signups.
-- Patterns: @centauros.app, @centauros.ai, @guild.forge, @forge.community,
-- @e2e.test, @forgeos.io, @forgeos-test.io, known seed domains, and
-- zero-padded seed UUIDs (a0000000-*, b0000000-*, c0000000-*).

UPDATE public.profiles
SET is_founding_member = false,
    founding_member_number = NULL
WHERE is_founding_member = true
  AND (
    -- Seed UUID patterns
    id::text LIKE 'a0000000-%'
    OR id::text LIKE 'b0000000-%'
    OR id::text LIKE 'c0000000-%'
    -- Test/demo email domains
    OR email LIKE '%@centauros.app'
    OR email LIKE '%@centauros.ai'
    OR email LIKE '%@guild.forge'
    OR email LIKE '%@forge.community'
    OR email LIKE '%@e2e.test'
    OR email LIKE '%@forgeos.io'
    OR email LIKE '%@forgeos-test.io'
    -- Known seed company domains
    OR email LIKE '%@novasense.med'
    OR email LIKE '%@aetherrobotics.io'
    OR email LIKE '%@boltpropulsion.com'
    OR email LIKE '%@clearwatt.co.uk'
    -- Test account patterns
    OR email LIKE '%+test%'
    OR email LIKE '%+qa%'
    OR full_name ILIKE '%test %'
    OR full_name ILIKE 'demo %'
    OR full_name ILIKE 'ghost %'
  );
