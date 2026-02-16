/**
 * Migration: Expand Founder Demo Seed Data
 *
 * Purpose: Adds demo marketplace listings, activity events, and ensures the
 * daily briefing has enough data for new founders to see a populated app.
 *
 * New content seeded:
 *   - 5 demo marketplace listings (People category: Execs + Apprentices)
 *   - 5 demo activity events showing realistic foundry activity
 *
 * Called by: seed_founder_demo_data_expanded(p_foundry_id, p_user_id)
 * This supplements the existing seed_founder_demo_data() which handles
 * strategic goals, objectives, and tasks.
 *
 * Security:
 *   SECURITY DEFINER to bypass marketplace RLS (service_role only writes).
 *
 * Rollback:
 *   DROP FUNCTION IF EXISTS seed_founder_demo_data_expanded;
 */

CREATE OR REPLACE FUNCTION seed_founder_demo_data_expanded(
  p_foundry_id TEXT,
  p_user_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_listing UUID;
BEGIN
  -- Guard: don't seed if demo marketplace listings already exist for this user's context
  -- (We check marketplace_listings by checking activity_events for demo markers)
  IF EXISTS (
    SELECT 1 FROM public.activity_events
    WHERE foundry_id = p_foundry_id
      AND event_type = 'demo_seed'
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

  -- ==========================================================================
  -- DEMO MARKETPLACE LISTINGS (People category)
  -- These show up in the Recruits page to demonstrate team building
  -- ==========================================================================

  -- Demo Executive: Fractional CTO
  INSERT INTO public.marketplace_listings (
    id, category, subcategory, title, description, attributes, is_verified
  ) VALUES (
    gen_random_uuid(),
    'People', 'Fractional Executive',
    'Sarah Chen — Fractional CTO',
    'Former VP Engineering at a Series B startup. 15 years building scalable systems. Available 2-3 days/week for early-stage companies needing technical leadership without full-time overhead.',
    jsonb_build_object(
      'expertise', ARRAY['System Architecture', 'Team Building', 'Technical Strategy'],
      'availability', '2-3 days/week',
      'experience_years', 15,
      'is_demo', true
    ),
    true
  );

  -- Demo Executive: Fractional CFO
  INSERT INTO public.marketplace_listings (
    id, category, subcategory, title, description, attributes, is_verified
  ) VALUES (
    gen_random_uuid(),
    'People', 'Fractional Executive',
    'Marcus Williams — Fractional CFO',
    'Ex-Big 4 audit partner turned startup advisor. Specializes in fundraising preparation, financial modeling, and investor relations for hardware companies.',
    jsonb_build_object(
      'expertise', ARRAY['Financial Modeling', 'Fundraising', 'Investor Relations'],
      'availability', '1-2 days/week',
      'experience_years', 20,
      'is_demo', true
    ),
    true
  );

  -- Demo Executive: Fractional CMO
  INSERT INTO public.marketplace_listings (
    id, category, subcategory, title, description, attributes, is_verified
  ) VALUES (
    gen_random_uuid(),
    'People', 'Fractional Executive',
    'Aisha Patel — Fractional CMO',
    'Growth marketing leader with 3 successful product launches. Expert in go-to-market strategy for hardware products, from positioning to launch campaigns.',
    jsonb_build_object(
      'expertise', ARRAY['Go-to-Market', 'Brand Strategy', 'Launch Campaigns'],
      'availability', '2 days/week',
      'experience_years', 12,
      'is_demo', true
    ),
    true
  );

  -- Demo Apprentice: Full-Stack Developer
  INSERT INTO public.marketplace_listings (
    id, category, subcategory, title, description, attributes, is_verified
  ) VALUES (
    gen_random_uuid(),
    'People', 'Apprentice',
    'James Liu — Full-Stack Developer',
    'Recent CS graduate with strong React/Node.js skills and a passion for hardware-software integration. Built IoT prototypes during university. Ready to ship production code.',
    jsonb_build_object(
      'expertise', ARRAY['React', 'Node.js', 'IoT'],
      'availability', 'Full-time',
      'experience_years', 2,
      'is_demo', true
    ),
    true
  );

  -- Demo Apprentice: Product Designer
  INSERT INTO public.marketplace_listings (
    id, category, subcategory, title, description, attributes, is_verified
  ) VALUES (
    gen_random_uuid(),
    'People', 'Apprentice',
    'Emma Rodriguez — Product Designer',
    'UX designer with industrial design background. Creates user experiences for physical products and their companion apps. Figma, CAD, and user research expertise.',
    jsonb_build_object(
      'expertise', ARRAY['UX Design', 'Industrial Design', 'User Research'],
      'availability', 'Full-time',
      'experience_years', 3,
      'is_demo', true
    ),
    true
  );

  -- ==========================================================================
  -- DEMO ACTIVITY EVENTS
  -- Create realistic activity history so the Updates page has content
  -- ==========================================================================

  -- Event: Company created (3 days ago feel)
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

  -- Event: Strategic goal created
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

  -- Event: Task completed
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

  -- Event: Team building started
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

  -- Event: Demo seed marker (used as guard)
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
  'Seeds demo marketplace listings and activity events for new Founders. Called during signup to populate the app with sample content.';
