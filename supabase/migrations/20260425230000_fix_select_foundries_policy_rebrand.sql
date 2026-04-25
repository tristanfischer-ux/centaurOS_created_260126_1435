-- Bug discovered 2026-04-25 during red-team iteration 1.
--
-- The select_foundries RLS policy on public.foundries still referenced the
-- legacy "centaur-guild" and "centaur-suppliers" foundry IDs from before
-- the Fractional Forge rebrand. Production has the renamed rows
-- ("forge-guild" / "forge-suppliers"), so any newly-signed-up user could
-- not SELECT them. setupNewUser then tried to INSERT them, which the
-- "Team builders can create foundries" policy correctly rejected, and
-- every new signup ended on /auth/setup-error?reason=rls_denied.
--
-- Fix: drop and recreate the SELECT policy with the correct foundry IDs.
-- No data migration is needed — the rows already have the right IDs; only
-- the policy text was stale.
--
-- This migration was applied to production manually via the Supabase
-- management API on 2026-04-25 to unblock new-user signup; this file
-- captures the change in the migration history so future schema rebuilds
-- end up in the same state.

DROP POLICY IF EXISTS select_foundries ON public.foundries;

CREATE POLICY select_foundries
ON public.foundries
FOR SELECT
USING (
  (id = ANY (ARRAY['forge-guild'::text, 'forge-suppliers'::text]))
  OR (owner_id = auth.uid())
);
