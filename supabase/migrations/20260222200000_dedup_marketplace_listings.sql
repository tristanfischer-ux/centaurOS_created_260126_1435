/**
 * Migration: Deduplicate Marketplace Listings
 *
 * INTENT: The seed_founder_demo_data_expanded() function inserts marketplace
 * listings on every foundry signup. Since marketplace_listings is global (not
 * foundry-scoped), this caused unbounded duplication — every new foundry added
 * 5 duplicate "People" listings. This migration:
 *   1. Removes duplicate rows, keeping only the earliest copy of each title.
 *   2. Patches the seed function to skip marketplace inserts (they already
 *      exist from the one-time migration seeds).
 */

-- Step 1: Delete duplicate marketplace_listings, keeping only the oldest row per title.
-- GOTCHA: We keep the row with the earliest created_at for each title. Rows with
-- gen_random_uuid() IDs from the per-foundry seed are the duplicates; the originals
-- were seeded by the one-time migration 20260128100000.
DELETE FROM public.marketplace_listings
WHERE id NOT IN (
    SELECT DISTINCT ON (title) id
    FROM public.marketplace_listings
    ORDER BY title, created_at ASC
);

-- Step 2: Replace seed_founder_demo_data_expanded to stop inserting marketplace listings.
-- The function now only seeds activity_events (foundry-scoped, no duplication problem).
CREATE OR REPLACE FUNCTION seed_founder_demo_data_expanded(
  p_foundry_id TEXT,
  p_user_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.activity_events
    WHERE foundry_id = p_foundry_id
      AND event_type = 'demo_seed'
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

  -- Activity events only (foundry-scoped, safe to insert per-foundry).
  -- Marketplace listings are seeded globally by migration seeds and should
  -- NOT be inserted per-foundry.

  INSERT INTO public.activity_events (
    foundry_id, user_id, event_type, event_data, created_at
  ) VALUES (
    p_foundry_id, p_user_id, 'company_created',
    jsonb_build_object(
      'message', 'Welcome to ForgeOS! Your company workspace has been created.',
      'is_demo', true
    ),
    v_now - INTERVAL '2 hours'
  );

  INSERT INTO public.activity_events (
    foundry_id, user_id, event_type, event_data, created_at
  ) VALUES (
    p_foundry_id, p_user_id, 'objective_created',
    jsonb_build_object(
      'title', 'Launch MVP Product',
      'type', 'strategic_goal',
      'message', 'Created strategic goal: Launch MVP Product',
      'is_demo', true
    ),
    v_now - INTERVAL '1 hour 45 minutes'
  );

  INSERT INTO public.activity_events (
    foundry_id, user_id, event_type, event_data, created_at
  ) VALUES (
    p_foundry_id, p_user_id, 'task_completed',
    jsonb_build_object(
      'title', 'Define product requirements',
      'message', 'Completed task: Define product requirements',
      'is_demo', true
    ),
    v_now - INTERVAL '1 hour'
  );

  INSERT INTO public.activity_events (
    foundry_id, user_id, event_type, event_data, created_at
  ) VALUES (
    p_foundry_id, p_user_id, 'objective_created',
    jsonb_build_object(
      'title', 'Build Your Team',
      'type', 'strategic_goal',
      'message', 'Created strategic goal: Build Your Team',
      'is_demo', true
    ),
    v_now - INTERVAL '45 minutes'
  );

  INSERT INTO public.activity_events (
    foundry_id, user_id, event_type, event_data, created_at
  ) VALUES (
    p_foundry_id, p_user_id, 'demo_seed',
    jsonb_build_object(
      'message', 'Demo data seeded for new founder experience',
      'is_demo', true
    ),
    v_now
  );

END;
$$;

COMMENT ON FUNCTION seed_founder_demo_data_expanded IS
  'Seeds demo activity events for new Founders. Called during signup to populate the Updates page with sample content. Marketplace listings are seeded globally — NOT per-foundry.';
