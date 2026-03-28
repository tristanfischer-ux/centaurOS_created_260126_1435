-- Strip founding member status from seed/demo profiles that don't have
-- a real auth.users entry. The backfill in 20260320100000 marked the
-- first 100 profiles (ordered by created_at) as founding members,
-- but most of those are seeded test data, not real signups.
--
-- Real users have a matching row in auth.users. Seed profiles don't.

UPDATE public.profiles
SET is_founding_member = false,
    founding_member_number = NULL
WHERE is_founding_member = true
  AND id NOT IN (SELECT id FROM auth.users);
