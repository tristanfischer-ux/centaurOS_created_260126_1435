/**
 * Migration: Seed Soldado Correspondence
 *
 * Adds realistic team members, conversations, messages, task comments,
 * objective comments, and advisory forum activity to the Soldado foundry.
 *
 * Creates 3 additional team members:
 *   - Sarah Chen (Fractional CFO / Executive) — fundraising partner
 *   - James Okafor (Production Lead / Apprentice) — operations
 *   - ForgeOS Strategy AI (AI_Agent) — advisory agent
 *
 * Then seeds:
 *   - 4 conversations with 30+ messages covering fundraising, operations, logistics, regulatory
 *   - Task comments on key tasks
 *   - Objective comments on strategic objectives
 *   - Advisory forum questions and AI answers
 */

DO $$
DECLARE
  v_foundry       TEXT := 'soldado';
  -- GOTCHA: pgcrypto may live in 'extensions' schema on Supabase hosted.
  -- We set search_path to include it.
  v_now           TIMESTAMPTZ := NOW();

  -- Mark Richardson (Founder) — looked up
  v_mark          UUID;

  -- New team members (deterministic UUIDs for idempotency)
  v_sarah         UUID := gen_random_uuid();  -- Fractional CFO
  v_james         UUID := gen_random_uuid();  -- Production Lead
  v_ai_agent      UUID := gen_random_uuid();  -- AI Strategy Agent

  v_hashed_pw     TEXT;

  -- Conversations
  v_conv_funding  UUID := gen_random_uuid();
  v_conv_ops      UUID := gen_random_uuid();
  v_conv_logistics UUID := gen_random_uuid();
  v_conv_strategy UUID := gen_random_uuid();

  -- Looked-up objective/task IDs
  v_obj_scale     UUID;  -- "Scale from pilot to commercial output"
  v_obj_collateral UUID; -- "Prepare fundraising collateral"
  v_obj_pipeline  UUID;  -- "Build and convert investor pipeline"
  v_obj_regs      UUID;  -- "Ensure product meets UK/EU regulations"
  v_obj_customers UUID;  -- "Secure first commercial customers"
  v_obj_delivery  UUID;  -- "Build reliable order-to-delivery process"

  v_task_finmodel UUID;  -- "Finalise financial model..."
  v_task_pitchdeck UUID; -- "Update pitch deck..."
  v_task_dataroom UUID;  -- "Prepare data room..."
  v_task_rearing  UUID;  -- "Commission second rearing room"
  v_task_batch    UUID;  -- "Validate 50k-batch consistency..."
  v_task_hire     UUID;  -- "Hire production technician"
  v_task_packaging UUID; -- "Design packaging for live neonate shipment"
  v_task_logistics UUID; -- "Set up cold chain logistics..."
  v_task_fsa      UUID;  -- "Complete novel food/feed registration..."
  v_task_pilot    UUID;  -- "Run pilot supply programme..."
  v_task_investors UUID; -- "Identify 30 target angel investors..."
  v_task_termsheet UUID; -- "Negotiate term sheet..."

  v_msg           UUID;
BEGIN
  -- ========================================================================
  -- 0. Look up Mark Richardson
  -- ========================================================================
  SELECT id INTO v_mark FROM public.profiles WHERE email = 'mark@soldado.uk' LIMIT 1;
  IF v_mark IS NULL THEN
    RAISE EXCEPTION 'Mark Richardson profile not found. Run seed_soldado_account migration first.';
  END IF;

  -- Guard: skip if correspondence already seeded
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = 'sarah.chen@soldado.uk' LIMIT 1) THEN
    RAISE NOTICE 'Soldado correspondence already seeded. Skipping.';
    RETURN;
  END IF;

  -- GOTCHA: pgcrypto lives in the 'extensions' schema on Supabase hosted.
  -- Use fully qualified function names.
  v_hashed_pw := extensions.crypt('Soldado2026!', extensions.gen_salt('bf'));

  -- ========================================================================
  -- 1. Create team member auth users
  -- ========================================================================

  -- Sarah Chen — Fractional CFO
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data,
    created_at, updated_at, confirmation_token, is_sso_user
  ) VALUES (
    v_sarah, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'sarah.chen@soldado.uk', v_hashed_pw,
    v_now, jsonb_build_object('full_name', 'Sarah Chen'),
    v_now - INTERVAL '14 days', v_now, '', false
  );
  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES (v_sarah, v_sarah, v_sarah::TEXT, 'email', jsonb_build_object('sub', v_sarah::TEXT, 'email', 'sarah.chen@soldado.uk'), v_now, v_now, v_now);

  INSERT INTO public.profiles (id, email, full_name, role, foundry_id, active_foundry_id, account_type, bio)
  VALUES (v_sarah, 'sarah.chen@soldado.uk', 'Sarah Chen', 'Executive', v_foundry, v_foundry, 'team_builder',
    'Fractional CFO with 12 years in agri-tech and food-tech startups. Previously raised £8M across seed and Series A for two portfolio companies. Specialises in SEIS/EIS structuring and investor relations.');

  INSERT INTO public.foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
  VALUES (v_sarah, v_foundry, 'Executive', true, v_now - INTERVAL '14 days');

  -- James Okafor — Production Lead
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data,
    created_at, updated_at, confirmation_token, is_sso_user
  ) VALUES (
    v_james, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'james.okafor@soldado.uk', v_hashed_pw,
    v_now, jsonb_build_object('full_name', 'James Okafor'),
    v_now - INTERVAL '21 days', v_now, '', false
  );
  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES (v_james, v_james, v_james::TEXT, 'email', jsonb_build_object('sub', v_james::TEXT, 'email', 'james.okafor@soldado.uk'), v_now, v_now, v_now);

  INSERT INTO public.profiles (id, email, full_name, role, foundry_id, active_foundry_id, account_type, bio)
  VALUES (v_james, 'james.okafor@soldado.uk', 'James Okafor', 'Apprentice', v_foundry, v_foundry, 'team_builder',
    'Entomology MSc from Harper Adams University. Joined Soldado as production lead to manage colony health, rearing protocols, and batch QA. Passionate about insect bioconversion and sustainable protein.');

  INSERT INTO public.foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
  VALUES (v_james, v_foundry, 'Apprentice', true, v_now - INTERVAL '21 days');

  -- ForgeOS Strategy AI Agent
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data,
    created_at, updated_at, confirmation_token, is_sso_user
  ) VALUES (
    v_ai_agent, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'strategy-ai@soldado.uk', v_hashed_pw,
    v_now, jsonb_build_object('full_name', 'Strategy Advisor'),
    v_now - INTERVAL '30 days', v_now, '', false
  );
  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES (v_ai_agent, v_ai_agent, v_ai_agent::TEXT, 'email', jsonb_build_object('sub', v_ai_agent::TEXT, 'email', 'strategy-ai@soldado.uk'), v_now, v_now, v_now);

  INSERT INTO public.profiles (id, email, full_name, role, foundry_id, active_foundry_id, account_type, bio)
  VALUES (v_ai_agent, 'strategy-ai@soldado.uk', 'Strategy Advisor', 'AI_Agent', v_foundry, v_foundry, 'team_builder',
    'AI strategy advisor specialising in agri-tech go-to-market, regulatory pathways, and fundraising preparation.');

  INSERT INTO public.foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
  VALUES (v_ai_agent, v_foundry, 'AI_Agent', false, v_now - INTERVAL '30 days');

  -- ========================================================================
  -- 2. Look up objective and task IDs
  -- ========================================================================
  SELECT id INTO v_obj_scale     FROM public.objectives WHERE foundry_id = v_foundry AND title = 'Scale from pilot to commercial output' LIMIT 1;
  SELECT id INTO v_obj_collateral FROM public.objectives WHERE foundry_id = v_foundry AND title = 'Prepare fundraising collateral' LIMIT 1;
  SELECT id INTO v_obj_pipeline  FROM public.objectives WHERE foundry_id = v_foundry AND title = 'Build and convert investor pipeline' LIMIT 1;
  SELECT id INTO v_obj_regs      FROM public.objectives WHERE foundry_id = v_foundry AND title = 'Ensure product meets UK/EU regulations' LIMIT 1;
  SELECT id INTO v_obj_customers FROM public.objectives WHERE foundry_id = v_foundry AND title = 'Secure first commercial customers' LIMIT 1;
  SELECT id INTO v_obj_delivery  FROM public.objectives WHERE foundry_id = v_foundry AND title = 'Build reliable order-to-delivery process' LIMIT 1;

  SELECT id INTO v_task_finmodel  FROM public.tasks WHERE foundry_id = v_foundry AND title LIKE 'Finalise financial model%' LIMIT 1;
  SELECT id INTO v_task_pitchdeck FROM public.tasks WHERE foundry_id = v_foundry AND title LIKE 'Update pitch deck%' LIMIT 1;
  SELECT id INTO v_task_dataroom  FROM public.tasks WHERE foundry_id = v_foundry AND title LIKE 'Prepare data room%' LIMIT 1;
  SELECT id INTO v_task_rearing   FROM public.tasks WHERE foundry_id = v_foundry AND title LIKE 'Commission second rearing%' LIMIT 1;
  SELECT id INTO v_task_batch     FROM public.tasks WHERE foundry_id = v_foundry AND title LIKE 'Validate 50k-batch%' LIMIT 1;
  SELECT id INTO v_task_hire      FROM public.tasks WHERE foundry_id = v_foundry AND title LIKE 'Hire production technician%' LIMIT 1;
  SELECT id INTO v_task_packaging FROM public.tasks WHERE foundry_id = v_foundry AND title LIKE 'Design packaging for live%' LIMIT 1;
  SELECT id INTO v_task_logistics FROM public.tasks WHERE foundry_id = v_foundry AND title LIKE 'Set up cold chain logistics%' LIMIT 1;
  SELECT id INTO v_task_fsa       FROM public.tasks WHERE foundry_id = v_foundry AND title LIKE 'Complete novel food%' LIMIT 1;
  SELECT id INTO v_task_pilot     FROM public.tasks WHERE foundry_id = v_foundry AND title LIKE 'Run pilot supply programme%' LIMIT 1;
  SELECT id INTO v_task_investors FROM public.tasks WHERE foundry_id = v_foundry AND title LIKE 'Identify 30 target%' LIMIT 1;
  SELECT id INTO v_task_termsheet FROM public.tasks WHERE foundry_id = v_foundry AND title LIKE 'Negotiate term sheet%' LIMIT 1;

  -- Assign some tasks to the new team members
  IF v_task_finmodel IS NOT NULL THEN
    INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task_finmodel, v_sarah) ON CONFLICT DO NOTHING;
  END IF;
  IF v_task_pitchdeck IS NOT NULL THEN
    INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task_pitchdeck, v_sarah) ON CONFLICT DO NOTHING;
  END IF;
  IF v_task_dataroom IS NOT NULL THEN
    INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task_dataroom, v_sarah) ON CONFLICT DO NOTHING;
  END IF;
  IF v_task_rearing IS NOT NULL THEN
    INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task_rearing, v_james) ON CONFLICT DO NOTHING;
  END IF;
  IF v_task_batch IS NOT NULL THEN
    INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task_batch, v_james) ON CONFLICT DO NOTHING;
  END IF;
  IF v_task_packaging IS NOT NULL THEN
    INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task_packaging, v_james) ON CONFLICT DO NOTHING;
  END IF;

  -- ========================================================================
  -- 3. Conversations & Messages
  -- ========================================================================

  -- ── CONVERSATION 1: Mark <> Sarah — Fundraising ──────────────────────────
  INSERT INTO public.conversations (id, buyer_id, seller_id, conversation_type, title, creator_id, created_at, updated_at)
  VALUES (v_conv_funding, v_mark, v_sarah, 'direct', 'Seed Round Planning', v_mark, v_now - INTERVAL '12 days', v_now - INTERVAL '1 day');

  INSERT INTO public.conversation_participants (conversation_id, profile_id, joined_at) VALUES
    (v_conv_funding, v_mark, v_now - INTERVAL '12 days'),
    (v_conv_funding, v_sarah, v_now - INTERVAL '12 days')
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  INSERT INTO public.messages (id, conversation_id, sender_id, content, created_at) VALUES
    (gen_random_uuid(), v_conv_funding, v_mark,
     'Sarah, welcome aboard! Really glad to have you helping with the raise. I''ve got a rough financial model but it needs serious work before we show it to investors.',
     v_now - INTERVAL '12 days'),
    (gen_random_uuid(), v_conv_funding, v_sarah,
     'Thanks Mark — excited to be involved. I''ve had a quick look at what you sent over. The unit economics section needs fleshing out. Do you have the actual cost per 50k neonate batch, including substrate, energy, and labour?',
     v_now - INTERVAL '12 days' + INTERVAL '2 hours'),
    (gen_random_uuid(), v_conv_funding, v_mark,
     'Roughly £180 per 50k batch at current scale, but that should come down to around £120-130 once the second rearing room is online. Energy is the big variable — the climate control runs 24/7.',
     v_now - INTERVAL '12 days' + INTERVAL '3 hours'),
    (gen_random_uuid(), v_conv_funding, v_sarah,
     'Good. That gives us a 60-65% gross margin at £350/batch selling price, improving to 70%+ at scale. I''ll build that into the three-year model with volume assumptions. What''s the realistic production capacity once room two is commissioned?',
     v_now - INTERVAL '11 days'),
    (gen_random_uuid(), v_conv_funding, v_mark,
     'James thinks we can do 20 batches per week from both rooms combined. That''s 1M neonates per week. But we need to prove the consistency first — we''re still validating the 50k-batch metrics.',
     v_now - INTERVAL '11 days' + INTERVAL '1 hour'),
    (gen_random_uuid(), v_conv_funding, v_sarah,
     'That''s a solid growth story for investors. 1M/week capacity with only £250k raise. I''ll structure the deck around three themes: 1) proven biology (colony optimisation done), 2) scaling economics (second room capex already scoped), 3) market timing (UK waste regulations creating demand). Sound right?',
     v_now - INTERVAL '10 days'),
    (gen_random_uuid(), v_conv_funding, v_mark,
     'Perfect. The regulatory angle is strong — the Environment Agency is pushing food businesses to divert organic waste from landfill, and BSF bioconversion is one of the approved pathways. That''s our "why now" slide.',
     v_now - INTERVAL '10 days' + INTERVAL '2 hours'),
    (gen_random_uuid(), v_conv_funding, v_sarah,
     'Exactly. I''ve also started the SEIS advance assurance application. If we get it approved before we go out to angels, it''s a huge incentive — 50% income tax relief for them. Most agri-tech angels expect it.',
     v_now - INTERVAL '9 days'),
    (gen_random_uuid(), v_conv_funding, v_mark,
     'How long does the HMRC process usually take?',
     v_now - INTERVAL '9 days' + INTERVAL '30 minutes'),
    (gen_random_uuid(), v_conv_funding, v_sarah,
     'Usually 6-8 weeks, sometimes faster if the application is clean. I''ve done three of these before — the key is making sure the "trade" qualification is watertight. Selling physical neonates to farms should be straightforward. I''ll have it drafted by end of this week.',
     v_now - INTERVAL '9 days' + INTERVAL '1 hour'),
    (gen_random_uuid(), v_conv_funding, v_mark,
     'Brilliant. Oh, one more thing — I had a good call with an angel from the AgriTechE network yesterday. She runs a 50-hectare poultry operation in Norfolk and is looking for alternative protein sources for her birds. She''s interested both as a potential customer AND investor.',
     v_now - INTERVAL '7 days'),
    (gen_random_uuid(), v_conv_funding, v_sarah,
     'That''s the best kind of investor — someone who genuinely understands the product. Get her name and details into the investor pipeline. If she''ll do a small pilot order alongside the investment, that''s incredibly powerful social proof for other angels.',
     v_now - INTERVAL '7 days' + INTERVAL '45 minutes'),
    (gen_random_uuid(), v_conv_funding, v_mark,
     'Already on it. Her name is Catherine Holt. I''m sending her our one-pager and a sample batch next week.',
     v_now - INTERVAL '6 days'),
    (gen_random_uuid(), v_conv_funding, v_sarah,
     'Perfect. I should have the updated financial model ready for your review by Thursday. Then we can do a dry-run of the pitch together before you start booking meetings. How does Friday morning look?',
     v_now - INTERVAL '5 days'),
    (gen_random_uuid(), v_conv_funding, v_mark,
     'Friday works. Let''s do 9am. I''ll have James join for the production Q&A section — investors always ask detailed questions about the biology and he explains it better than I do.',
     v_now - INTERVAL '5 days' + INTERVAL '1 hour');

  -- ── CONVERSATION 2: Mark <> James — Production Operations ────────────────
  INSERT INTO public.conversations (id, buyer_id, seller_id, conversation_type, title, creator_id, created_at, updated_at)
  VALUES (v_conv_ops, v_mark, v_james, 'direct', 'Production & Colony Updates', v_mark, v_now - INTERVAL '18 days', v_now - INTERVAL '2 days');

  INSERT INTO public.conversation_participants (conversation_id, profile_id, joined_at) VALUES
    (v_conv_ops, v_mark, v_now - INTERVAL '18 days'),
    (v_conv_ops, v_james, v_now - INTERVAL '18 days')
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  INSERT INTO public.messages (id, conversation_id, sender_id, content, created_at) VALUES
    (gen_random_uuid(), v_conv_ops, v_james,
     'Morning Mark. Quick colony update — the new oviposition substrate mix is working well. Egg cluster density is up about 15% compared to last month. I think we''ve cracked the humidity sweet spot.',
     v_now - INTERVAL '18 days'),
    (gen_random_uuid(), v_conv_ops, v_mark,
     'That''s great news. What humidity level are we running at now?',
     v_now - INTERVAL '18 days' + INTERVAL '30 minutes'),
    (gen_random_uuid(), v_conv_ops, v_james,
     '68% RH in the mating chamber, 72% in the oviposition zone. The IoT sensors are holding steady — the alerting system we set up caught a compressor hiccup at 2am last Tuesday before it could affect anything.',
     v_now - INTERVAL '18 days' + INTERVAL '1 hour'),
    (gen_random_uuid(), v_conv_ops, v_mark,
     'Good to hear the monitoring system is earning its keep. Where are we on the second rearing room fit-out?',
     v_now - INTERVAL '15 days'),
    (gen_random_uuid(), v_conv_ops, v_james,
     'Electrician is coming Monday for the climate control wiring. Shelving arrives Tuesday. I''ve specc''d it for 8 racks of 12 trays each — that gives us 96 trays, enough for 12 concurrent batches at any time. Biggest bottleneck is the extraction fan — lead time is 3 weeks from the supplier.',
     v_now - INTERVAL '15 days' + INTERVAL '2 hours'),
    (gen_random_uuid(), v_conv_ops, v_mark,
     'Can we source the fan from somewhere else to speed it up?',
     v_now - INTERVAL '14 days'),
    (gen_random_uuid(), v_conv_ops, v_james,
     'I''ve found an alternative supplier in Birmingham who has compatible units in stock. Slightly more expensive (£340 vs £280) but they can deliver this week. I''d recommend going for it — the 3-week delay costs us more in lost production than the £60 premium.',
     v_now - INTERVAL '14 days' + INTERVAL '1 hour'),
    (gen_random_uuid(), v_conv_ops, v_mark,
     'Agreed. Order it. Every week we delay the second room is a week of lost revenue once customers are onboard.',
     v_now - INTERVAL '14 days' + INTERVAL '2 hours'),
    (gen_random_uuid(), v_conv_ops, v_james,
     'On it. Also — I ran our first full consistency test on batch #47 through #51. Hatch rates: 91%, 88%, 93%, 90%, 92%. That''s an average of 90.8% across five consecutive batches. We''re hitting our >90% target.',
     v_now - INTERVAL '10 days'),
    (gen_random_uuid(), v_conv_ops, v_mark,
     'Excellent. That''s exactly what Sarah needs for the investor deck — proof that our production is consistent and scalable. Can you write up a one-page summary of those results? Include the environmental parameters for each batch.',
     v_now - INTERVAL '10 days' + INTERVAL '30 minutes'),
    (gen_random_uuid(), v_conv_ops, v_james,
     'Will do. I''ll have it to you by tomorrow. One concern though — batch #48 had the lowest rate (88%) and it coincided with a substrate delivery that was slightly drier than usual. We might want to add moisture content testing to our incoming QA checks.',
     v_now - INTERVAL '10 days' + INTERVAL '1 hour'),
    (gen_random_uuid(), v_conv_ops, v_mark,
     'Smart catch. Add it to the QA protocol you''re developing. We can''t afford inconsistency when we''re shipping live neonates to customers — if a batch arrives with poor viability, we lose that customer''s trust.',
     v_now - INTERVAL '9 days'),
    (gen_random_uuid(), v_conv_ops, v_james,
     'Agreed. Speaking of shipping — I''ve been testing the insulated packaging prototypes. The EPS boxes with gel packs keep internal temp between 22-26°C for about 36 hours. Should be enough for next-day delivery, but I''m worried about summer conditions. We might need to add a phase-change material layer for July/August shipments.',
     v_now - INTERVAL '5 days'),
    (gen_random_uuid(), v_conv_ops, v_mark,
     'Good thinking ahead. Cost difference?',
     v_now - INTERVAL '5 days' + INTERVAL '1 hour'),
    (gen_random_uuid(), v_conv_ops, v_james,
     'About £2.50 extra per box for the PCM inserts. At our volumes that''s maybe £500/month in summer. Small price for reliable viability.',
     v_now - INTERVAL '4 days'),
    (gen_random_uuid(), v_conv_ops, v_mark,
     'Worth it. Factor it into the packaging costs. I''ll let Sarah know for the financial model.',
     v_now - INTERVAL '4 days' + INTERVAL '30 minutes'),
    (gen_random_uuid(), v_conv_ops, v_james,
     'Quick hiring update — I''ve shortlisted two candidates for the production technician role. One has insect rearing experience (crickets, not BSF, but transferable). The other is a biology grad with lab QA background. Both available to start within the month. Want to do interviews next week?',
     v_now - INTERVAL '2 days'),
    (gen_random_uuid(), v_conv_ops, v_mark,
     'Yes, let''s book them in. Tuesday and Wednesday if possible. I want you to lead the practical assessment — have them do a mock batch setup and explain their approach to troubleshooting a colony health issue.',
     v_now - INTERVAL '2 days' + INTERVAL '2 hours');

  -- ── CONVERSATION 3: Mark <> James & Sarah — Logistics Planning ───────────
  INSERT INTO public.conversations (id, buyer_id, seller_id, conversation_type, title, is_group, creator_id, created_at, updated_at)
  VALUES (v_conv_logistics, v_mark, v_sarah, 'direct', 'Customer Delivery & Logistics', true, v_mark, v_now - INTERVAL '8 days', v_now - INTERVAL '3 days');

  INSERT INTO public.conversation_participants (conversation_id, profile_id, joined_at) VALUES
    (v_conv_logistics, v_mark, v_now - INTERVAL '8 days'),
    (v_conv_logistics, v_sarah, v_now - INTERVAL '8 days'),
    (v_conv_logistics, v_james, v_now - INTERVAL '8 days')
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  INSERT INTO public.messages (id, conversation_id, sender_id, content, created_at) VALUES
    (gen_random_uuid(), v_conv_logistics, v_mark,
     'Team — we need to nail down the delivery process before the pilot customers start. I''ve had quotes from two couriers: Biocair (specialist biological courier) and ParcelForce (general but cheaper). Thoughts?',
     v_now - INTERVAL '8 days'),
    (gen_random_uuid(), v_conv_logistics, v_james,
     'I''d strongly recommend Biocair. Live neonates need careful handling — standard couriers throw packages around. Biocair have temperature-controlled vans and guaranteed AM delivery slots. The viability risk with a general courier is too high for a pilot programme where first impressions matter.',
     v_now - INTERVAL '8 days' + INTERVAL '1 hour'),
    (gen_random_uuid(), v_conv_logistics, v_sarah,
     'Agree with James. What''s the price difference?',
     v_now - INTERVAL '8 days' + INTERVAL '2 hours'),
    (gen_random_uuid(), v_conv_logistics, v_mark,
     'Biocair is £18 per delivery (next-day AM, temperature-monitored). ParcelForce is £8 but no temperature guarantee and delivery window is 8am-6pm. At £350 per batch, the £18 delivery cost is about 5% — I think that''s fine.',
     v_now - INTERVAL '7 days'),
    (gen_random_uuid(), v_conv_logistics, v_sarah,
     'Definitely go with Biocair. That 5% delivery cost is a great margin to protect the product quality. For the financial model, I''ll assume Biocair for year one, then renegotiate volume rates in year two once we have consistent weekly shipments. Their volume discount kicks in at 50+ deliveries per month.',
     v_now - INTERVAL '7 days' + INTERVAL '1 hour'),
    (gen_random_uuid(), v_conv_logistics, v_james,
     'I''ll contact Biocair to set up an account and do a trial shipment to myself — basically a test run with a live batch to see how the packaging holds up in their system. We can put a temperature logger in the box to get real data.',
     v_now - INTERVAL '6 days'),
    (gen_random_uuid(), v_conv_logistics, v_mark,
     'Great idea. Do the trial this week if you can. Also — we need the customer onboarding guide written before the first pilot delivery. James, can you draft the receiving instructions? Think: what does a farm manager need to know when a box of neonates arrives on their doorstep?',
     v_now - INTERVAL '5 days'),
    (gen_random_uuid(), v_conv_logistics, v_james,
     'On it. Key sections: unboxing procedure, visual viability check, acclimation protocol (let neonates adjust to ambient temp for 30 mins before introducing to substrate), troubleshooting dead-on-arrival, and our guarantee/replacement policy. I''ll have a draft to you by Friday.',
     v_now - INTERVAL '5 days' + INTERVAL '2 hours'),
    (gen_random_uuid(), v_conv_logistics, v_sarah,
     'Mark — the customer guide is also great investor material. "We''ve built a complete onboarding system" shows operational maturity. Make sure we include it in the data room.',
     v_now - INTERVAL '4 days'),
    (gen_random_uuid(), v_conv_logistics, v_mark,
     'Good shout. I''ll add it to the data room checklist. James — also include a section on reordering. We want to make it as frictionless as possible for customers to set up regular weekly deliveries.',
     v_now - INTERVAL '3 days');

  -- ── CONVERSATION 4: Mark <> AI Strategy Agent — Regulatory ───────────────
  INSERT INTO public.conversations (id, buyer_id, seller_id, conversation_type, title, creator_id, created_at, updated_at)
  VALUES (v_conv_strategy, v_mark, v_ai_agent, 'expert', 'Regulatory Strategy & Market Entry', v_mark, v_now - INTERVAL '20 days', v_now - INTERVAL '6 days');

  INSERT INTO public.conversation_participants (conversation_id, profile_id, joined_at) VALUES
    (v_conv_strategy, v_mark, v_now - INTERVAL '20 days'),
    (v_conv_strategy, v_ai_agent, v_now - INTERVAL '20 days')
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  INSERT INTO public.messages (id, conversation_id, sender_id, content, created_at) VALUES
    (gen_random_uuid(), v_conv_strategy, v_mark,
     'I need to understand the regulatory pathway for selling BSF neonates in the UK. We''re not selling processed insect protein — we''re selling live larvae as starter stock for other BSF farms. Does that simplify things?',
     v_now - INTERVAL '20 days'),
    (gen_random_uuid(), v_conv_strategy, v_ai_agent,
     'Good question — and yes, your regulatory position is actually simpler than companies selling processed insect meal for animal feed. Here''s the breakdown:

1. **Live insect supply (your core product):** Selling live BSF neonates/larvae to other farms is essentially selling livestock breeding stock. This falls under general animal health regulations, not novel food/feed regulations. You need to ensure your colony is disease-free and your premises meet basic biosecurity standards.

2. **If customers use larvae for animal feed:** The end product (processed insect meal) needs to comply with EU Regulation 2017/893 (authorising insect protein in aquaculture and poultry feed). But that''s your customer''s problem, not yours — you''re the breeder, not the processor.

3. **Waste processing angle:** If you accept organic waste as substrate for your larvae (which reduces your feed costs significantly), you''ll need an Environment Agency permit. This is a standard waste processing permit, not specific to insects.

4. **FSA registration:** You should still register with the Food Standards Agency as a food/feed business operator. It''s a formality but important for credibility with investors and customers.',
     v_now - INTERVAL '20 days' + INTERVAL '10 minutes'),
    (gen_random_uuid(), v_conv_strategy, v_mark,
     'That''s really helpful. So the main thing I need is the Environment Agency waste processing permit and the FSA registration. The novel feed regulation is my customers'' concern. What about HACCP — do I need that as a breeder?',
     v_now - INTERVAL '19 days'),
    (gen_random_uuid(), v_conv_strategy, v_ai_agent,
     'Strictly speaking, HACCP (Hazard Analysis and Critical Control Points) is required for food/feed operators, and as a breeder you''re borderline. However, I''d strongly recommend implementing HACCP voluntarily for three reasons:

1. **Customer confidence:** Your customers (BSF farms) will want to know that the neonates they buy are reared under controlled, documented conditions. HACCP is the gold standard they''ll ask about.

2. **Investor credibility:** Investors in agri-tech expect to see food-safety-grade processes. Having HACCP documentation signals operational maturity.

3. **Future-proofing:** UK regulations on insect farming are evolving quickly. Having HACCP in place now means you won''t be scrambling when requirements tighten.

The documentation doesn''t need to be overwhelming for a breeding operation. Focus on: colony health monitoring, substrate quality control, environmental parameter logging, and batch traceability.',
     v_now - INTERVAL '19 days' + INTERVAL '15 minutes'),
    (gen_random_uuid(), v_conv_strategy, v_mark,
     'Makes sense. James is already documenting our processes — I''ll have him format it as a proper HACCP plan. What about selling into Europe post-Brexit? Any barriers?',
     v_now - INTERVAL '15 days'),
    (gen_random_uuid(), v_conv_strategy, v_ai_agent,
     'EU market access for live insects is possible but has additional requirements:

1. **Export Health Certificate:** You''ll need an EHC from APHA (Animal and Plant Health Agency) for each shipment. Cost is around £20 per certificate.

2. **EU import requirements:** The receiving country needs to approve the import of live Hermetia illucens. Most EU countries have aligned with EFSA guidance approving BSF as a safe insect species, but check country-by-country.

3. **Phytosanitary considerations:** Live insects are classified as ''other organisms'' under plant health regulations. You may need a phytosanitary certificate alongside the EHC.

4. **Practical challenge:** Shipping live neonates across borders adds 24-48 hours to transit time. Your packaging and cold chain must be designed for 72-hour viability, not just 36 hours.

My recommendation: focus on the UK market first. There''s more than enough demand domestically — the UK BSF industry is growing 40% year-on-year and most farms still breed their own stock (inefficiently). You''ll have a full addressable market without the EU complexity. Revisit European expansion for your Series A story.',
     v_now - INTERVAL '15 days' + INTERVAL '20 minutes'),
    (gen_random_uuid(), v_conv_strategy, v_mark,
     'Agreed — UK first makes sense. We''ve got three pilot customers lined up already and they''re all domestic. Thanks for the clarity on the regulatory side.',
     v_now - INTERVAL '14 days');

  -- ========================================================================
  -- 4. Task Comments
  -- ========================================================================

  IF v_task_finmodel IS NOT NULL THEN
    INSERT INTO public.task_comments (task_id, user_id, content, foundry_id, created_at) VALUES
      (v_task_finmodel, v_sarah, 'First draft of the three-year model is done. Revenue assumptions: 10 batches/week in month 6, scaling to 40/week by month 18 with the second facility. Gross margins modelled at 62% (year 1) to 71% (year 3). Ready for Mark''s review.', v_foundry, v_now - INTERVAL '6 days'),
      (v_task_finmodel, v_mark, 'Reviewed — the assumptions look solid. One note: we should add a sensitivity table showing what happens if customer acquisition takes 2x longer than base case. Angels will ask about downside scenarios.', v_foundry, v_now - INTERVAL '5 days'),
      (v_task_finmodel, v_sarah, 'Good call. I''ve added a sensitivity analysis with three scenarios: base case, slow-growth (2x customer ramp), and optimistic (Biocair volume discount kicks in earlier). Updated model is in the shared drive.', v_foundry, v_now - INTERVAL '4 days');
  END IF;

  IF v_task_pitchdeck IS NOT NULL THEN
    INSERT INTO public.task_comments (task_id, user_id, content, foundry_id, created_at) VALUES
      (v_task_pitchdeck, v_sarah, 'Updated the traction slide with James''s batch consistency data. Five consecutive batches at >90% hatch rate is a strong proof point. Also added the "why now" regulatory slide Mark suggested.', v_foundry, v_now - INTERVAL '4 days'),
      (v_task_pitchdeck, v_mark, 'Looks great. Can we add a slide about the competitive landscape? Show that Betabugs and Entocycle focus on processing/end products, while we''re filling the supply chain gap at the breeding stage.', v_foundry, v_now - INTERVAL '3 days');
  END IF;

  IF v_task_rearing IS NOT NULL THEN
    INSERT INTO public.task_comments (task_id, user_id, content, foundry_id, created_at) VALUES
      (v_task_rearing, v_james, 'Electrician completed the climate control wiring on Monday. Shelving installed Tuesday. Extraction fan ordered from the Birmingham supplier — arrives Thursday. We''re on track for room two to be operational by next Monday.', v_foundry, v_now - INTERVAL '10 days'),
      (v_task_rearing, v_mark, 'Excellent progress. Once the fan is installed, let''s run it empty for 48 hours to verify the temp/humidity profiles match room one before introducing any stock.', v_foundry, v_now - INTERVAL '9 days'),
      (v_task_rearing, v_james, 'Room two is up and running. 48-hour burn-in test completed — humidity holding at 68-72% range, temp at 28.5°C ± 0.5°C. Matches room one''s performance. Ready to introduce the first production batch.', v_foundry, v_now - INTERVAL '4 days');
  END IF;

  IF v_task_batch IS NOT NULL THEN
    INSERT INTO public.task_comments (task_id, user_id, content, foundry_id, created_at) VALUES
      (v_task_batch, v_james, 'Batch consistency results (batches 47-51): 91%, 88%, 93%, 90%, 92% hatch rates. Average 90.8%. Batch 48 was lower due to drier substrate — adding moisture QA check to incoming inspection protocol.', v_foundry, v_now - INTERVAL '8 days'),
      (v_task_batch, v_mark, 'These numbers are exactly what we need. I''ve shared the summary with Sarah for the investor materials. The substrate moisture catch is a good process improvement — shows we''re data-driven.', v_foundry, v_now - INTERVAL '7 days');
  END IF;

  IF v_task_packaging IS NOT NULL THEN
    INSERT INTO public.task_comments (task_id, user_id, content, foundry_id, created_at) VALUES
      (v_task_packaging, v_james, 'Testing three packaging options: (A) basic EPS box with gel packs, (B) EPS with phase-change material inserts, (C) vacuum-insulated panel box. Option B gives the best cost/performance balance — maintains 22-26°C for 36+ hours at £4.50/unit. Option C is overkill at £12/unit.', v_foundry, v_now - INTERVAL '6 days'),
      (v_task_packaging, v_mark, 'Go with option B. The PCM inserts also give us summer protection which James flagged as a concern. £4.50/unit is fine — it''s about 1.3% of the batch selling price.', v_foundry, v_now - INTERVAL '5 days');
  END IF;

  IF v_task_pilot IS NOT NULL THEN
    INSERT INTO public.task_comments (task_id, user_id, content, foundry_id, created_at) VALUES
      (v_task_pilot, v_mark, 'Pilot programme update: three customers confirmed — Green Acres Farm (Cambridgeshire), Circuloop Biotech (Wales), and FlyProtein Ltd (Yorkshire). All are existing BSF operators looking to outsource their breeding stock. First deliveries scheduled for next month.', v_foundry, v_now - INTERVAL '3 days'),
      (v_task_pilot, v_james, 'I''ll prepare dedicated production runs for each pilot customer. We should tag the batches separately so we can track per-customer viability data and any feedback they give us.', v_foundry, v_now - INTERVAL '2 days');
  END IF;

  IF v_task_fsa IS NOT NULL THEN
    INSERT INTO public.task_comments (task_id, user_id, content, foundry_id, created_at) VALUES
      (v_task_fsa, v_mark, 'Spoke with the FSA business support team. They confirmed that as a live insect breeder/supplier, our registration is straightforward. They''re sending the forms this week. The HACCP documentation James is preparing will support the application.', v_foundry, v_now - INTERVAL '7 days');
  END IF;

  -- ========================================================================
  -- 5. Objective Comments
  -- ========================================================================

  IF v_obj_collateral IS NOT NULL THEN
    INSERT INTO public.objective_comments (objective_id, user_id, content, foundry_id, created_at) VALUES
      (v_obj_collateral, v_sarah, 'Investor materials progress: Financial model v2 complete, pitch deck updated with traction data, SEIS application drafted. Still need to finish the data room — cap table needs formalising with our solicitor.', v_foundry, v_now - INTERVAL '3 days'),
      (v_obj_collateral, v_mark, 'Data room is the last piece. I''m meeting the solicitor Tuesday to finalise the cap table and shareholders'' agreement. After that we''re ready to start outreach.', v_foundry, v_now - INTERVAL '2 days');
  END IF;

  IF v_obj_scale IS NOT NULL THEN
    INSERT INTO public.objective_comments (objective_id, user_id, content, foundry_id, created_at) VALUES
      (v_obj_scale, v_james, 'Production capacity update: Room two is now commissioned and running. First batch from the new room had a 91% hatch rate — matching room one. Total capacity is now 20 batches/week. Ready for customer orders.', v_foundry, v_now - INTERVAL '3 days'),
      (v_obj_scale, v_mark, 'This is a huge milestone. Two rooms running at >90% consistency means we can confidently take on the pilot customers. Well done James.', v_foundry, v_now - INTERVAL '2 days');
  END IF;

  IF v_obj_pipeline IS NOT NULL THEN
    INSERT INTO public.objective_comments (objective_id, user_id, content, foundry_id, created_at) VALUES
      (v_obj_pipeline, v_mark, 'Investor pipeline status: 12 prospects identified so far (target 30). Three meetings booked for next week. Catherine Holt (Norfolk poultry farmer) is our strongest warm lead — both potential customer and investor.', v_foundry, v_now - INTERVAL '4 days'),
      (v_obj_pipeline, v_sarah, 'I''ve added 8 more prospects from my agri-tech network, bringing us to 20. The UKBAA (UK Business Angels Association) database has another 15 angels who''ve invested in food/ag in the last 12 months. I''ll reach out to them this week.', v_foundry, v_now - INTERVAL '3 days');
  END IF;

  -- ========================================================================
  -- 6. Advisory Forum Questions & Answers
  -- ========================================================================

  INSERT INTO public.advisory_questions (foundry_id, asked_by, title, body, category, tags, status, created_at, updated_at) VALUES
    (v_foundry, v_mark,
     'Best approach for SEIS/EIS structuring with multiple angel investors?',
     'We''re raising £250k from angel investors and want to maximise SEIS/EIS tax relief for them. Some angels might invest more than the £100k SEIS individual limit. What''s the best way to structure the round so investors get the most tax-efficient treatment? Should we split into SEIS and EIS tranches?',
     'finance', ARRAY['fundraising', 'seis', 'eis', 'tax', 'angel-investors'], 'answered',
     v_now - INTERVAL '10 days', v_now - INTERVAL '9 days');

  -- AI answer to the SEIS/EIS question
  INSERT INTO public.advisory_answers (question_id, author_id, author_type, body, is_accepted, verification_status, upvotes, created_at, updated_at)
  VALUES (
    (SELECT id FROM public.advisory_questions WHERE foundry_id = v_foundry AND title LIKE 'Best approach for SEIS%' LIMIT 1),
    v_ai_agent, 'ai',
    'Here''s the recommended approach for structuring a £250k round with SEIS/EIS:

**1. SEIS First Tranche (up to £250k total, £100k per investor)**
Since your company is under 2 years old and hasn''t received prior EIS investment, you likely qualify for SEIS. Issue shares under SEIS first — it gives investors 50% income tax relief plus CGT exemption, which is significantly better than EIS (30% relief only).

**2. If you exceed £250k SEIS limit**
Any investment above the £250k company SEIS limit automatically falls into EIS territory. Structure subsequent investment as a separate EIS share class if needed. Most angels won''t mind — 30% tax relief is still attractive.

**3. Advance Assurance**
Apply to HMRC for advance assurance BEFORE going to investors. This takes 6-8 weeks but gives investors certainty. Without it, angels will either negotiate a lower valuation or pass entirely.

**4. Practical Structure**
- First £250k via SEIS (ordinary shares)
- Any overfunding via EIS (same share class, different tax treatment)
- Include anti-dilution protection for SEIS investors in case of a down round

**5. Key Qualification Points**
- Soldado must be trading (selling neonates) not just in R&D
- Gross assets must be under £350k at time of SEIS investment
- The raised capital must be used for a qualifying trade (breeding/selling BSF stock qualifies)

I''d recommend getting your accountant to confirm SEIS qualification before you start outreach. The advance assurance application can be submitted simultaneously.',
    true, 'verified', 3, v_now - INTERVAL '10 days' + INTERVAL '15 minutes', v_now - INTERVAL '9 days'
  );

  INSERT INTO public.advisory_questions (foundry_id, asked_by, title, body, category, tags, status, created_at, updated_at) VALUES
    (v_foundry, v_mark,
     'How do other BSF companies handle batch traceability for customers?',
     'We''re about to start shipping live neonates to pilot customers. I want to implement a traceability system from day one so every batch can be traced back to its colony, substrate source, and environmental conditions. What are the best practices in the insect farming industry? Do customers expect batch certificates or QR codes?',
     'operations', ARRAY['traceability', 'quality', 'bsf', 'compliance'], 'answered',
     v_now - INTERVAL '14 days', v_now - INTERVAL '13 days');

  INSERT INTO public.advisory_answers (question_id, author_id, author_type, body, is_accepted, verification_status, upvotes, created_at, updated_at)
  VALUES (
    (SELECT id FROM public.advisory_questions WHERE foundry_id = v_foundry AND title LIKE 'How do other BSF%' LIMIT 1),
    v_ai_agent, 'ai',
    'Batch traceability is becoming table stakes in the insect farming industry. Here''s what the leading operators do:

**Batch Certificate (Minimum)**
Every shipment should include a batch certificate with: batch number, production date, colony source ID, hatch rate, weight per unit, substrate type, and environmental conditions (avg temp/humidity during rearing). Print this on a card inside the package.

**Digital Traceability (Recommended)**
Assign each batch a unique ID (format: SOL-YYYYMMDD-XXX) and link it to a simple database record. A QR code on the packaging that links to a web page showing the batch details is increasingly common. Betabugs and Protix both use QR-based systems.

**What Customers Expect**
- Small farms: Batch certificate is sufficient
- Medium/large operations: Expect digital traceability, especially if they''re supplying into food chains (e.g., poultry fed on BSF meal)
- EU customers (future): Will require full traceability under EU feed hygiene regulations

**Implementation Suggestion**
Start simple: a Google Sheet or Airtable with batch records, auto-generating a PDF certificate per batch. Graduate to a proper system when volume justifies it. The key is establishing the discipline now — even if the tooling is basic.',
    true, 'verified', 2, v_now - INTERVAL '14 days' + INTERVAL '20 minutes', v_now - INTERVAL '13 days'
  );

  INSERT INTO public.advisory_questions (foundry_id, asked_by, title, body, category, tags, status, created_at, updated_at) VALUES
    (v_foundry, v_james,
     'Substrate moisture content specs for optimal BSF neonate viability?',
     'We had a dip in hatch rate on a recent batch (88% vs our 90%+ average) and traced it to substrate that was drier than usual. What''s the ideal moisture content range for BSF oviposition substrate and neonatal feed substrate? Should we be testing every delivery or is spot-checking sufficient?',
     'operations', ARRAY['bsf', 'substrate', 'quality-control', 'colony-health'], 'open',
     v_now - INTERVAL '8 days', v_now - INTERVAL '8 days');

  -- ========================================================================
  -- 7. Notifications
  -- ========================================================================

  INSERT INTO public.notifications (user_id, foundry_id, type, title, message, link, is_read, created_at) VALUES
    (v_mark, v_foundry, 'task_completed', 'Task completed', 'James marked "Commission second rearing room" as complete.', '/tasks', true, v_now - INTERVAL '4 days'),
    (v_mark, v_foundry, 'comment_added', 'New comment on task', 'Sarah commented on "Finalise financial model with 3-year projections".', '/tasks', true, v_now - INTERVAL '6 days'),
    (v_mark, v_foundry, 'team_invite', 'New team member', 'Sarah Chen joined Soldado as Executive.', '/team', true, v_now - INTERVAL '14 days'),
    (v_mark, v_foundry, 'team_invite', 'New team member', 'James Okafor joined Soldado as Apprentice.', '/team', true, v_now - INTERVAL '21 days'),
    (v_mark, v_foundry, 'system', 'Batch consistency results', 'Batch consistency results are in — 90.8% average hatch rate across 5 batches.', '/tasks', false, v_now - INTERVAL '2 days'),
    (v_sarah, v_foundry, 'task_assigned', 'New task assigned', 'You''ve been assigned "Finalise financial model with 3-year projections".', '/tasks', true, v_now - INTERVAL '12 days'),
    (v_james, v_foundry, 'task_assigned', 'New task assigned', 'You''ve been assigned "Commission second rearing room".', '/tasks', true, v_now - INTERVAL '18 days');

  RAISE NOTICE 'Soldado correspondence seeded: 3 team members, 4 conversations, 50+ messages, task comments, advisory questions, notifications.';
END;
$$;
