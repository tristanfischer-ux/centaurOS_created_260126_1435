-- Fix: drop the UUID overload of update_foundry_purpose that was not cleaned up.
-- PostgreSQL cannot disambiguate between the TEXT and UUID overloads when called via RPC.
-- Drop the UUID overload explicitly, leaving only the TEXT version (which is correct
-- since foundry IDs can be text like "test-foundry-001").
--
-- If db push fails (e.g. duplicate migration versions), run the DROP below in
-- Supabase Dashboard > SQL Editor, then: npx supabase migration repair 20260218160000 --status applied --linked

DROP FUNCTION IF EXISTS update_foundry_purpose(UUID, JSONB);
