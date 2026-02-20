/**
 * Migration: Seed Soldado Account — Mark Richardson
 *
 * Creates a complete Founder account for Soldado (soldado.uk), a UK-based
 * black soldier fly (BSF) company producing neonates and 5-day-old larvae.
 *
 * Includes: foundry with purpose_data + company_profile, profile, membership,
 * 3 strategic goals with milestones/objectives/tasks covering operations,
 * fundraising, and growth, plus 2 funding requirements.
 *
 * DECISION: Using a migration instead of a TypeScript seed script because
 * the Supabase project has legacy API keys disabled. Migrations run as the
 * postgres role and bypass all RLS/key restrictions.
 *
 * Auth user (mark@soldado.uk) must be created separately via the signup flow
 * or Supabase dashboard. This migration will still create all data; the
 * profile.id will be updated once the auth user exists.
 */

DO $$
DECLARE
  -- GOTCHA: We look up the auth user by email. If the user doesn't exist yet
  -- in auth.users, we generate a deterministic UUID and the profile won't link
  -- to an auth user until the user signs up with this email.
  v_user_id    UUID;
  v_now        TIMESTAMPTZ := NOW();
  v_foundry    TEXT := 'soldado';

  -- Goal 1: Scale Neonate Production
  v_goal1      UUID := gen_random_uuid();
  v_ms1_1      UUID := gen_random_uuid();
  v_ms1_2      UUID := gen_random_uuid();
  v_ms1_3      UUID := gen_random_uuid();
  v_obj1_1     UUID := gen_random_uuid();
  v_obj1_2     UUID := gen_random_uuid();
  v_obj1_3     UUID := gen_random_uuid();

  -- Goal 2: Close Seed Round
  v_goal2      UUID := gen_random_uuid();
  v_ms2_1      UUID := gen_random_uuid();
  v_ms2_2      UUID := gen_random_uuid();
  v_ms2_3      UUID := gen_random_uuid();
  v_obj2_1     UUID := gen_random_uuid();
  v_obj2_2     UUID := gen_random_uuid();
  v_obj2_3     UUID := gen_random_uuid();

  -- Goal 3: Regulatory and Market Development
  v_goal3      UUID := gen_random_uuid();
  v_ms3_1      UUID := gen_random_uuid();
  v_ms3_2      UUID := gen_random_uuid();
  v_obj3_1     UUID := gen_random_uuid();
  v_obj3_2     UUID := gen_random_uuid();

  v_task       UUID;
BEGIN
  -- ========================================================================
  -- 0. Resolve or create auth user
  -- ========================================================================
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'mark@soldado.uk' LIMIT 1;

  IF v_user_id IS NULL THEN
    -- Create the auth user directly in auth.users
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_user_meta_data,
      created_at, updated_at, confirmation_token, is_sso_user
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'mark@soldado.uk',
      crypt('Soldado2026!', gen_salt('bf')),
      v_now,
      jsonb_build_object(
        'full_name', 'Mark Richardson',
        'company_name', 'Soldado',
        'industry', 'Agriculture, Biotech',
        'stage', 'Seed'
      ),
      v_now, v_now, '', false
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_user_id, v_user_id, v_user_id::TEXT, 'email',
      jsonb_build_object('sub', v_user_id::TEXT, 'email', 'mark@soldado.uk'),
      v_now, v_now, v_now
    );

    RAISE NOTICE 'Created auth user: %', v_user_id;
  ELSE
    -- Ensure existing user has email confirmed
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, v_now)
    WHERE id = v_user_id AND email_confirmed_at IS NULL;
    RAISE NOTICE 'Using existing auth user: %', v_user_id;
  END IF;

  -- ========================================================================
  -- 1. Profile (must exist before foundry due to foundries.owner_id FK)
  -- ========================================================================
  -- GOTCHA: active_foundry_id has FK to foundries, so we set it NULL first,
  -- create the foundry, then update the profile with the foundry reference.
  INSERT INTO public.profiles (id, email, full_name, role, foundry_id, active_foundry_id, account_type)
  VALUES (v_user_id, 'mark@soldado.uk', 'Mark Richardson', 'Founder', v_foundry, NULL, 'team_builder')
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    foundry_id = EXCLUDED.foundry_id;

  -- ========================================================================
  -- 2. Foundry
  -- ========================================================================
  INSERT INTO public.foundries (id, name, slug, owner_id, industry, stage, sector, purpose_data, company_profile, created_at)
  VALUES (
    v_foundry, 'Soldado', 'soldado', v_user_id,
    'Agriculture, Biotech', 'Seed', 'agriculture',
    jsonb_build_object(
      'purpose', 'Soldado exists to make sustainable insect protein accessible by providing the reliable, high-quality BSF neonates and larvae that farms and waste processors need to scale.',
      'mission', 'To simplify the beginning of the black soldier fly supply chain — delivering consistent, high-viability neonates and 5-day-old larvae so our customers can focus on conversion and end products.',
      'vision', 'A world where organic waste is a valuable resource, not a problem — powered by a robust, decentralised network of BSF producers who all started with Soldado stock.',
      'questionnaire', jsonb_build_object(
        'whyExists', 'Billions of tonnes of organic waste go to landfill every year while the planet desperately needs sustainable protein. Black soldier flies convert waste into protein with extraordinary efficiency, but the industry bottleneck is reliable starter stock. Soldado exists to remove that bottleneck.',
        'problemSolved', 'BSF farms struggle to maintain healthy breeding colonies and consistent neonate quality. Colony crashes, variable hatch rates, and unreliable supply from ad-hoc breeders cost operators weeks of lost production. Soldado provides lab-grade neonates with guaranteed viability.',
        'whoServed', 'Mid-scale BSF farms, waste-processing facilities looking to add insect bioconversion, and agricultural operations piloting insect protein for livestock feed — primarily in the UK and Europe.',
        'uniqueValue', 'We specialise exclusively in the earliest stage of the supply chain: breeding, egg production, and neonate rearing. This focus means our colony genetics, environmental controls, and QA protocols are purpose-built for maximum hatch rate and larval viability — something generalist BSF operations cannot match.',
        'fiveYearVision', 'Soldado is the default source of BSF starter stock across Europe. We operate three regional breeding facilities, supply over 200 farms, and have expanded into genetics licensing — enabling local hatcheries to produce Soldado-grade neonates under our quality framework.'
      ),
      'updatedAt', v_now::TEXT,
      'updatedBy', v_user_id::TEXT
    ),
    jsonb_build_object(
      'employee_count', '2-5',
      'revenue_range', 'under_100k',
      'funding_status', 'seed',
      'seeking_funding', true,
      'founded_year', 2024,
      'location', 'United Kingdom',
      'website', 'https://soldado.uk',
      'business_model', 'hardware',
      'competitors', jsonb_build_array('Betabugs', 'Entocycle', 'Protix', 'Innovafeed'),
      'updatedAt', v_now::TEXT,
      'updatedBy', v_user_id::TEXT
    ),
    v_now
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    owner_id = EXCLUDED.owner_id,
    purpose_data = EXCLUDED.purpose_data,
    company_profile = EXCLUDED.company_profile;

  -- Now that the foundry exists, set active_foundry_id on the profile
  UPDATE public.profiles SET active_foundry_id = v_foundry WHERE id = v_user_id;

  -- ========================================================================
  -- 3. Foundry membership
  -- ========================================================================
  INSERT INTO public.foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
  VALUES (v_user_id, v_foundry, 'Founder', true, v_now)
  ON CONFLICT (user_id, foundry_id) DO NOTHING;

  -- ========================================================================
  -- GOAL 1: Scale Neonate Production (Operations)
  -- ========================================================================

  -- Guard: skip if data already seeded for this foundry
  IF EXISTS (SELECT 1 FROM public.objectives WHERE foundry_id = v_foundry LIMIT 1) THEN
    RAISE NOTICE 'Objectives already exist for foundry %. Skipping seed.', v_foundry;
    RETURN;
  END IF;

  INSERT INTO public.objectives (id, title, description, status, creator_id, foundry_id, is_strategic_goal, milestone_date, goal_type, is_demo, created_at)
  VALUES (v_goal1, 'Scale Neonate Production',
    'Build the operational capacity to produce and deliver BSF neonates and 5DOLs at commercial volumes. Covers colony management, production scale-up, quality assurance, and fulfilment logistics.',
    'In Progress', v_user_id, v_foundry, true, v_now + INTERVAL '120 days', 'Launch', false, v_now);

  -- Milestone 1.1: Colony Optimisation (Completed)
  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, is_milestone, milestone_order_index, parent_objective_id, milestone_date, is_demo, created_at)
  VALUES (v_ms1_1, 'Colony Optimisation', 'Completed', v_user_id, v_foundry, true, 1, v_goal1, v_now - INTERVAL '30 days', false, v_now);

  INSERT INTO public.objectives (id, title, description, status, creator_id, foundry_id, parent_objective_id, is_demo, created_at)
  VALUES (v_obj1_1, 'Establish stable breeding colonies',
    'Get the adult fly colonies to a point where egg production is consistent and predictable week-on-week. This is the foundation everything else depends on.',
    'Completed', v_user_id, v_foundry, v_ms1_1, false, v_now);

  -- Tasks for obj1_1
  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, is_demo, created_at)
  VALUES (v_task, 'Optimise adult fly mating conditions',
    'Dial in temperature (27-30°C), humidity (60-70%), and light cycles to maximise mating success. Document the optimal parameters for our facility.',
    'Completed', v_user_id, v_foundry, v_obj1_1, (v_now - INTERVAL '60 days')::DATE, (v_now - INTERVAL '40 days')::DATE, false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, is_demo, created_at)
  VALUES (v_task, 'Standardise egg harvesting protocol',
    'Create a repeatable SOP for collecting egg clusters from oviposition substrates. Target: consistent harvest every 48 hours with >85% hatch viability.',
    'Completed', v_user_id, v_foundry, v_obj1_1, (v_now - INTERVAL '50 days')::DATE, (v_now - INTERVAL '30 days')::DATE, false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, is_demo, created_at)
  VALUES (v_task, 'Implement environmental monitoring system',
    'Install IoT sensors for temperature, humidity, CO₂, and ammonia across all rearing rooms. Set up alerting thresholds so colony stress is caught early.',
    'Completed', v_user_id, v_foundry, v_obj1_1, (v_now - INTERVAL '45 days')::DATE, (v_now - INTERVAL '25 days')::DATE, false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  -- Milestone 1.2: Production Scale-Up (In Progress)
  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, is_milestone, milestone_order_index, parent_objective_id, milestone_date, is_demo, created_at)
  VALUES (v_ms1_2, 'Production Scale-Up', 'In Progress', v_user_id, v_foundry, true, 2, v_goal1, v_now + INTERVAL '60 days', false, v_now);

  INSERT INTO public.objectives (id, title, description, status, creator_id, foundry_id, parent_objective_id, is_demo, created_at)
  VALUES (v_obj1_2, 'Scale from pilot to commercial output',
    'Move from producing occasional test batches to fulfilling 50,000-unit orders reliably every week. Requires a second rearing room, a production hire, and validated QA.',
    'In Progress', v_user_id, v_foundry, v_ms1_2, false, v_now);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, risk_level, is_demo, created_at)
  VALUES (v_task, 'Commission second rearing room',
    'Fit out the adjacent unit as a dedicated neonate rearing room — climate control, shelving, drainage, biosecurity protocols. Budget: £15k.',
    'Accepted', v_user_id, v_foundry, v_obj1_2, (v_now - INTERVAL '10 days')::DATE, (v_now + INTERVAL '30 days')::DATE, 'Medium', false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, risk_level, is_demo, created_at)
  VALUES (v_task, 'Validate 50k-batch consistency metrics',
    'Run 10 consecutive production cycles at 50,000 neonates per batch. Track hatch rate, weight uniformity, and survival to 5DOL stage. Target: >90% viability across all batches.',
    'Accepted', v_user_id, v_foundry, v_obj1_2, (v_now - INTERVAL '5 days')::DATE, (v_now + INTERVAL '45 days')::DATE, 'High', false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, risk_level, is_demo, created_at)
  VALUES (v_task, 'Hire production technician',
    'Recruit a full-time technician with entomology or bioprocessing experience to manage day-to-day colony and production operations. Mark can then focus on business development.',
    'Pending', v_user_id, v_foundry, v_obj1_2, v_now::DATE, (v_now + INTERVAL '30 days')::DATE, 'Medium', false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, is_demo, created_at)
  VALUES (v_task, 'Establish QA testing protocol for neonate viability',
    'Define and document the quality checks performed on every batch before dispatch: weight sampling, motility assessment, contamination screening, and viability percentage.',
    'Pending', v_user_id, v_foundry, v_obj1_2, (v_now + INTERVAL '5 days')::DATE, (v_now + INTERVAL '35 days')::DATE, false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  -- Milestone 1.3: Customer Fulfilment Pipeline (In Progress)
  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, is_milestone, milestone_order_index, parent_objective_id, milestone_date, is_demo, created_at)
  VALUES (v_ms1_3, 'Customer Fulfilment Pipeline', 'In Progress', v_user_id, v_foundry, true, 3, v_goal1, v_now + INTERVAL '90 days', false, v_now);

  INSERT INTO public.objectives (id, title, description, status, creator_id, foundry_id, parent_objective_id, is_demo, created_at)
  VALUES (v_obj1_3, 'Build reliable order-to-delivery process',
    'Create the end-to-end fulfilment workflow from order receipt through packaging, cold chain logistics, and customer handover. Neonates are live organisms — packaging and speed are critical.',
    'In Progress', v_user_id, v_foundry, v_ms1_3, false, v_now);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, risk_level, is_demo, created_at)
  VALUES (v_task, 'Design packaging for live neonate shipment',
    'Develop insulated, ventilated packaging that keeps neonates viable for 24-48 hours in transit. Test with temperature loggers across summer and winter conditions.',
    'Accepted', v_user_id, v_foundry, v_obj1_3, (v_now - INTERVAL '5 days')::DATE, (v_now + INTERVAL '20 days')::DATE, 'High', false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, risk_level, is_demo, created_at)
  VALUES (v_task, 'Set up cold chain logistics with courier partner',
    'Negotiate terms with a next-day biological courier service. Need temperature-controlled vans and guaranteed morning delivery windows. Get quotes from Biocair and TNT Special Services.',
    'Pending', v_user_id, v_foundry, v_obj1_3, (v_now + INTERVAL '5 days')::DATE, (v_now + INTERVAL '35 days')::DATE, 'Medium', false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, is_demo, created_at)
  VALUES (v_task, 'Create customer onboarding guide for receiving stock',
    'Write a practical guide for customers: how to receive, inspect, acclimate, and introduce Soldado neonates into their rearing systems. Include troubleshooting for common issues.',
    'Pending', v_user_id, v_foundry, v_obj1_3, (v_now + INTERVAL '10 days')::DATE, (v_now + INTERVAL '40 days')::DATE, false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  -- ========================================================================
  -- GOAL 2: Close Seed Round (Fundraising)
  -- ========================================================================
  INSERT INTO public.objectives (id, title, description, status, creator_id, foundry_id, is_strategic_goal, milestone_date, goal_type, is_demo, created_at)
  VALUES (v_goal2, 'Close Seed Round',
    'Raise £250k seed funding to finance the production scale-up, first commercial hires, and 18 months of runway. Covers investor materials, pipeline development, and post-close capital deployment planning.',
    'In Progress', v_user_id, v_foundry, true, v_now + INTERVAL '90 days', 'Fundraise', false, v_now);

  -- Milestone 2.1: Investor Materials Ready
  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, is_milestone, milestone_order_index, parent_objective_id, milestone_date, is_demo, created_at)
  VALUES (v_ms2_1, 'Investor Materials Ready', 'In Progress', v_user_id, v_foundry, true, 1, v_goal2, v_now + INTERVAL '21 days', false, v_now);

  INSERT INTO public.objectives (id, title, description, status, creator_id, foundry_id, parent_objective_id, is_demo, created_at)
  VALUES (v_obj2_1, 'Prepare fundraising collateral',
    'Get the pitch deck, financial model, and data room to investor-ready standard. SEIS/EIS advance assurance is a key selling point for UK angel investors.',
    'In Progress', v_user_id, v_foundry, v_ms2_1, false, v_now);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, risk_level, is_demo, created_at)
  VALUES (v_task, 'Finalise financial model with 3-year projections',
    'Build a bottoms-up model: unit economics per 50k batch, production capacity ramp, customer acquisition timeline, and cash flow projections through to Series A. Include sensitivity analysis for key assumptions.',
    'Accepted', v_user_id, v_foundry, v_obj2_1, (v_now - INTERVAL '7 days')::DATE, (v_now + INTERVAL '14 days')::DATE, 'High', false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, is_demo, created_at)
  VALUES (v_task, 'Update pitch deck with latest traction data',
    'Refresh the deck with current production metrics, pilot customer feedback, and the regulatory progress. Add a compelling "why now" slide about the EU protein gap and UK waste regulations.',
    'Accepted', v_user_id, v_foundry, v_obj2_1, (v_now - INTERVAL '5 days')::DATE, (v_now + INTERVAL '10 days')::DATE, false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, is_demo, created_at)
  VALUES (v_task, 'Prepare data room (cap table, accounts, IP)',
    'Organise the virtual data room with: cap table, Companies House filings, management accounts, IP documentation (SOPs, breeding protocols), key contracts, and team CVs.',
    'Pending', v_user_id, v_foundry, v_obj2_1, v_now::DATE, (v_now + INTERVAL '14 days')::DATE, false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, risk_level, is_demo, created_at)
  VALUES (v_task, 'Draft SEIS/EIS advance assurance application',
    'Apply to HMRC for advance assurance that Soldado qualifies for SEIS (up to £250k) and EIS tax relief. This is a major incentive for UK angel investors — 50% income tax relief on SEIS.',
    'Pending', v_user_id, v_foundry, v_obj2_1, v_now::DATE, (v_now + INTERVAL '21 days')::DATE, 'Medium', false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  -- Milestone 2.2: Investor Pipeline
  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, is_milestone, milestone_order_index, parent_objective_id, milestone_date, is_demo, created_at)
  VALUES (v_ms2_2, 'Investor Pipeline', 'In Progress', v_user_id, v_foundry, true, 2, v_goal2, v_now + INTERVAL '60 days', false, v_now);

  INSERT INTO public.objectives (id, title, description, status, creator_id, foundry_id, parent_objective_id, is_demo, created_at)
  VALUES (v_obj2_2, 'Build and convert investor pipeline',
    'Identify, approach, and convert angel investors and agri-tech funds. Target: 30 in pipeline, 10 meetings, close with 5-8 investors for a £250k round.',
    'In Progress', v_user_id, v_foundry, v_ms2_2, false, v_now);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, is_demo, created_at)
  VALUES (v_task, 'Identify 30 target angel investors and funds',
    'Research and compile a target list of 30 investors with demonstrated interest in agri-tech, sustainability, alternative protein, or circular economy. Include UK angel networks (UKBAA members), agri-focused VCs, and relevant grant programmes.',
    'Accepted', v_user_id, v_foundry, v_obj2_2, (v_now - INTERVAL '14 days')::DATE, (v_now + INTERVAL '7 days')::DATE, false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, is_demo, created_at)
  VALUES (v_task, 'Schedule pitch meetings with shortlisted investors',
    'Send personalised outreach to top 15 prospects. Aim for 10 first meetings within 3 weeks. Use warm intros from the agri-tech network where possible.',
    'Pending', v_user_id, v_foundry, v_obj2_2, (v_now + INTERVAL '7 days')::DATE, (v_now + INTERVAL '28 days')::DATE, false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, is_demo, created_at)
  VALUES (v_task, 'Follow up with warm leads from agri-tech network',
    'Re-engage contacts from AgriTechE, Wyvern Partners, and the Insect Technology Group. Several expressed interest at the last networking event — convert that interest into meetings.',
    'Pending', v_user_id, v_foundry, v_obj2_2, v_now::DATE, (v_now + INTERVAL '21 days')::DATE, false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, risk_level, is_demo, created_at)
  VALUES (v_task, 'Negotiate term sheet with lead investor',
    'Once a lead investor commits, negotiate the term sheet: pre-money valuation, SEIS/EIS structuring, board observer rights, anti-dilution provisions, and milestone-based tranching if required.',
    'Pending', v_user_id, v_foundry, v_obj2_2, (v_now + INTERVAL '30 days')::DATE, (v_now + INTERVAL '60 days')::DATE, 'High', false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  -- Milestone 2.3: Post-Close Planning
  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, is_milestone, milestone_order_index, parent_objective_id, milestone_date, is_demo, created_at)
  VALUES (v_ms2_3, 'Post-Close Planning', 'Not Started', v_user_id, v_foundry, true, 3, v_goal2, v_now + INTERVAL '90 days', false, v_now);

  INSERT INTO public.objectives (id, title, description, status, creator_id, foundry_id, parent_objective_id, is_demo, created_at)
  VALUES (v_obj2_3, 'Plan capital deployment',
    'Map out exactly how the £250k will be spent over 18 months and what metrics need to be hit to position Soldado for a Series A.',
    'Not Started', v_user_id, v_foundry, v_ms2_3, false, v_now);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, is_demo, created_at)
  VALUES (v_task, 'Develop 18-month cash runway plan',
    'Break down the £250k allocation: production capex (~£60k), salaries (~£100k), logistics and packaging (~£30k), regulatory (~£15k), marketing (~£20k), contingency (~£25k). Map monthly burn rate.',
    'Pending', v_user_id, v_foundry, v_obj2_3, (v_now + INTERVAL '60 days')::DATE, (v_now + INTERVAL '75 days')::DATE, false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, is_demo, created_at)
  VALUES (v_task, 'Scope facility expansion for Series A readiness',
    'Identify and evaluate potential sites for a larger facility that could support 10x current production volume. Needed to demonstrate growth potential in the Series A pitch.',
    'Pending', v_user_id, v_foundry, v_obj2_3, (v_now + INTERVAL '65 days')::DATE, (v_now + INTERVAL '90 days')::DATE, false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, is_demo, created_at)
  VALUES (v_task, 'Define KPIs and reporting cadence for investors',
    'Set up monthly investor update template covering: production volume, customer count, revenue, burn rate, cash position, key milestones hit. Investors love transparency — make it automatic.',
    'Pending', v_user_id, v_foundry, v_obj2_3, (v_now + INTERVAL '60 days')::DATE, (v_now + INTERVAL '70 days')::DATE, false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  -- ========================================================================
  -- GOAL 3: Regulatory and Market Development (Growth)
  -- ========================================================================
  INSERT INTO public.objectives (id, title, description, status, creator_id, foundry_id, is_strategic_goal, milestone_date, goal_type, is_demo, created_at)
  VALUES (v_goal3, 'Regulatory and Market Development',
    'Navigate UK/EU regulations for insect-derived feed products and build the initial customer base through pilots, case studies, and industry networking.',
    'In Progress', v_user_id, v_foundry, true, v_now + INTERVAL '150 days', 'Revenue', false, v_now);

  -- Milestone 3.1: Regulatory Compliance
  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, is_milestone, milestone_order_index, parent_objective_id, milestone_date, is_demo, created_at)
  VALUES (v_ms3_1, 'Regulatory Compliance', 'In Progress', v_user_id, v_foundry, true, 1, v_goal3, v_now + INTERVAL '90 days', false, v_now);

  INSERT INTO public.objectives (id, title, description, status, creator_id, foundry_id, parent_objective_id, is_demo, created_at)
  VALUES (v_obj3_1, 'Ensure product meets UK/EU regulations',
    'BSF-derived products for animal feed fall under novel feed regulations. Need FSA registration, HACCP documentation, and environmental permitting for waste processing.',
    'In Progress', v_user_id, v_foundry, v_ms3_1, false, v_now);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, risk_level, is_demo, created_at)
  VALUES (v_task, 'Complete novel food/feed registration (FSA)',
    'Submit application to the Food Standards Agency for authorisation of BSF larvae as a feed ingredient. Requires detailed dossier on production process, safety data, and nutritional composition.',
    'Accepted', v_user_id, v_foundry, v_obj3_1, (v_now - INTERVAL '14 days')::DATE, (v_now + INTERVAL '60 days')::DATE, 'High', false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, risk_level, is_demo, created_at)
  VALUES (v_task, 'Document HACCP processes for insect rearing',
    'Develop a full HACCP plan covering: hazard analysis (biological, chemical, physical), critical control points (temperature, feed substrate quality, cross-contamination), monitoring procedures, and corrective actions.',
    'Pending', v_user_id, v_foundry, v_obj3_1, v_now::DATE, (v_now + INTERVAL '45 days')::DATE, 'Medium', false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, risk_level, is_demo, created_at)
  VALUES (v_task, 'Obtain environmental permit for waste processing',
    'Apply to the Environment Agency for a standard rules permit (or bespoke permit if needed) to process organic waste through BSF bioconversion. This allows us to accept pre-consumer food waste as larval feed substrate.',
    'Pending', v_user_id, v_foundry, v_obj3_1, (v_now + INTERVAL '7 days')::DATE, (v_now + INTERVAL '75 days')::DATE, 'Medium', false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  -- Milestone 3.2: Customer Acquisition
  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, is_milestone, milestone_order_index, parent_objective_id, milestone_date, is_demo, created_at)
  VALUES (v_ms3_2, 'Customer Acquisition', 'In Progress', v_user_id, v_foundry, true, 2, v_goal3, v_now + INTERVAL '120 days', false, v_now);

  INSERT INTO public.objectives (id, title, description, status, creator_id, foundry_id, parent_objective_id, is_demo, created_at)
  VALUES (v_obj3_2, 'Secure first commercial customers',
    'Convert pilot programme participants into paying customers and build a repeatable sales process for BSF neonate supply contracts.',
    'In Progress', v_user_id, v_foundry, v_ms3_2, false, v_now);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, risk_level, is_demo, created_at)
  VALUES (v_task, 'Run pilot supply programme with 3 target farms',
    'Provide 4 weeks of free neonates to 3 selected BSF farms. Track their survival rates, growth performance, and operational feedback. Use results to validate product-market fit and refine the offering.',
    'Accepted', v_user_id, v_foundry, v_obj3_2, (v_now - INTERVAL '7 days')::DATE, (v_now + INTERVAL '28 days')::DATE, 'Medium', false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, is_demo, created_at)
  VALUES (v_task, 'Build pricing model for volume contracts',
    'Develop tiered pricing: per-batch (50k neonates), monthly subscription (weekly deliveries), and annual contract rates. Factor in production cost, logistics, and margin targets.',
    'Pending', v_user_id, v_foundry, v_obj3_2, (v_now + INTERVAL '14 days')::DATE, (v_now + INTERVAL '30 days')::DATE, false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, is_demo, created_at)
  VALUES (v_task, 'Create case study from pilot programme results',
    'Document the pilot results as a professional case study: customer profile, problem, Soldado solution, quantified results (survival rate, growth improvement, cost comparison). Use for investor deck and sales collateral.',
    'Pending', v_user_id, v_foundry, v_obj3_2, (v_now + INTERVAL '28 days')::DATE, (v_now + INTERVAL '42 days')::DATE, false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, description, status, creator_id, foundry_id, objective_id, start_date, end_date, is_demo, created_at)
  VALUES (v_task, 'Attend AgriTechE conference for lead generation',
    'Present at the AgriTechE networking event. Prepare a 5-minute pitch and demo samples. Target: 10 qualified leads from waste management, aquaculture, and poultry feed companies.',
    'Pending', v_user_id, v_foundry, v_obj3_2, (v_now + INTERVAL '20 days')::DATE, (v_now + INTERVAL '25 days')::DATE, false, v_now);
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  -- ========================================================================
  -- Funding Requirements
  -- ========================================================================
  INSERT INTO public.funding_requirements (foundry_id, title, amount_usd, reason, needed_by_date, funding_type, linked_objective_ids, status)
  VALUES (
    v_foundry,
    'Seed Round — Production Scale-Up & Runway',
    315000,
    'Fund the production scale-up (second rearing room, QA equipment), first full-time hire, cold chain logistics setup, regulatory applications, and 18 months of operating runway.',
    (v_now + INTERVAL '90 days')::DATE,
    'angel',
    ARRAY[v_goal2],
    'seeking'
  );

  INSERT INTO public.funding_requirements (foundry_id, title, amount_usd, reason, needed_by_date, funding_type, linked_objective_ids, status)
  VALUES (
    v_foundry,
    'Series A — Facility Expansion & European Growth',
    2520000,
    'Scale to a dedicated facility with 10x production capacity, hire a team of 8-10, expand logistics to serve European customers, and invest in genetics R&D for improved larval strains.',
    (v_now + INTERVAL '540 days')::DATE,
    'vc',
    ARRAY[]::UUID[],
    'projected'
  );

  RAISE NOTICE 'Soldado account seeded successfully. User: %, Foundry: %', v_user_id, v_foundry;
END;
$$;
