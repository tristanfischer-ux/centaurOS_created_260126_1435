/**
 * Migration: Strategy River Seed Data
 *
 * Purpose: Populate the database with reference data for the Strategy River
 * visualization. Creates two strategic goals with milestones, objectives,
 * tasks, and assignees that match the reference design.
 *
 * Data structure:
 *   Strategic Goal 1: "Raise £12m Series A" (target: Jul 8, 2026)
 *     → 5 milestones, each with 1 objective + 2-5 tasks
 *   Strategic Goal 2: "Launch Drone MVP" (target: Aug 1, 2026)
 *     → 4 milestones, each with 1 objective + 2-3 tasks
 *
 * Security: Uses the first active profile's foundry_id. All data is
 * created with proper foundry isolation.
 *
 * Rollback:
 *   DELETE FROM task_assignees WHERE task_id IN (SELECT id FROM tasks WHERE title LIKE 'SR:%');
 *   DELETE FROM tasks WHERE title LIKE 'SR:%';
 *   DELETE FROM objectives WHERE title IN ('Raise £12m Series A', 'Launch Drone MVP')
 *     OR parent_objective_id IN (SELECT id FROM objectives WHERE title IN ('Raise £12m Series A', 'Launch Drone MVP'));
 */

DO $$
DECLARE
  v_user_id     UUID;
  v_foundry_id  TEXT;
  -- Goal 1: Raise £12m Series A
  v_goal1       UUID := gen_random_uuid();
  v_ms1_1       UUID := gen_random_uuid();
  v_ms1_2       UUID := gen_random_uuid();
  v_ms1_3       UUID := gen_random_uuid();
  v_ms1_4       UUID := gen_random_uuid();
  v_ms1_5       UUID := gen_random_uuid();
  v_obj1_1      UUID := gen_random_uuid();
  v_obj1_2      UUID := gen_random_uuid();
  v_obj1_3      UUID := gen_random_uuid();
  v_obj1_4      UUID := gen_random_uuid();
  v_obj1_5      UUID := gen_random_uuid();
  -- Goal 2: Launch Drone MVP
  v_goal2       UUID := gen_random_uuid();
  v_ms2_1       UUID := gen_random_uuid();
  v_ms2_2       UUID := gen_random_uuid();
  v_ms2_3       UUID := gen_random_uuid();
  v_ms2_4       UUID := gen_random_uuid();
  v_obj2_1      UUID := gen_random_uuid();
  v_obj2_2      UUID := gen_random_uuid();
  v_obj2_3      UUID := gen_random_uuid();
  v_obj2_4      UUID := gen_random_uuid();
  -- Task IDs
  v_task        UUID;
BEGIN

  -- Find the first real user with a foundry
  SELECT p.id, COALESCE(p.active_foundry_id, p.foundry_id)
  INTO v_user_id, v_foundry_id
  FROM public.profiles p
  WHERE COALESCE(p.active_foundry_id, p.foundry_id) IS NOT NULL
  ORDER BY p.created_at ASC
  LIMIT 1;

  IF v_user_id IS NULL OR v_foundry_id IS NULL THEN
    RAISE NOTICE 'No user with foundry found — skipping seed data';
    RETURN;
  END IF;

  -- Skip if seed data already exists
  IF EXISTS (
    SELECT 1 FROM public.objectives
    WHERE foundry_id = v_foundry_id
      AND title = 'Raise £12m Series A'
      AND is_strategic_goal = true
  ) THEN
    RAISE NOTICE 'Strategy River seed data already exists — skipping';
    RETURN;
  END IF;

  -- =========================================================================
  -- GOAL 1: Raise £12m Series A
  -- =========================================================================
  INSERT INTO public.objectives (id, title, description, status, creator_id, foundry_id, is_strategic_goal, milestone_date, goal_type, created_at)
  VALUES (v_goal1, 'Raise £12m Series A', 'Close a £12 million Series A round to fund expansion, hiring, and product development.', 'In Progress', v_user_id, v_foundry_id, true, '2026-07-08T00:00:00Z', 'Fundraise', '2026-01-15T00:00:00Z');

  -- Milestone 1.1: Deck + narrative complete
  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, is_milestone, milestone_order_index, parent_objective_id, milestone_date, created_at)
  VALUES (v_ms1_1, 'Deck + narrative complete', 'Completed', v_user_id, v_foundry_id, true, 1, v_goal1, '2026-02-28T00:00:00Z', '2026-01-15T00:00:00Z');

  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, parent_objective_id, created_at)
  VALUES (v_obj1_1, 'Prepare fundraising materials', 'Completed', v_user_id, v_foundry_id, v_ms1_1, '2026-01-15T00:00:00Z');

  -- Tasks for milestone 1.1 (5 tasks)
  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Draft pitch deck v1', 'Completed', v_user_id, v_foundry_id, v_obj1_1, '2026-01-20', '2026-02-05', '2026-01-20');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Write founder narrative memo', 'Completed', v_user_id, v_foundry_id, v_obj1_1, '2026-01-22', '2026-02-10', '2026-01-22');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Build financial model', 'Completed', v_user_id, v_foundry_id, v_obj1_1, '2026-01-25', '2026-02-18', '2026-01-25');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Peer review deck with advisors', 'Completed', v_user_id, v_foundry_id, v_obj1_1, '2026-02-10', '2026-02-24', '2026-02-10');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Finalize deck + data room', 'Completed', v_user_id, v_foundry_id, v_obj1_1, '2026-02-20', '2026-02-28', '2026-02-20');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  -- Milestone 1.2: Investor list finalized
  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, is_milestone, milestone_order_index, parent_objective_id, milestone_date, created_at)
  VALUES (v_ms1_2, 'Investor list finalized', 'In Progress', v_user_id, v_foundry_id, true, 2, v_goal1, '2026-03-19T00:00:00Z', '2026-01-15T00:00:00Z');

  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, parent_objective_id, created_at)
  VALUES (v_obj1_2, 'Build target investor pipeline', 'In Progress', v_user_id, v_foundry_id, v_ms1_2, '2026-01-15T00:00:00Z');

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Research Series A climate-tech VCs', 'Completed', v_user_id, v_foundry_id, v_obj1_2, '2026-02-15', '2026-03-05', '2026-02-15');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Rank and shortlist 30 investors', 'Accepted', v_user_id, v_foundry_id, v_obj1_2, '2026-03-01', '2026-03-19', '2026-03-01');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  -- Milestone 1.3: Outreach launched
  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, is_milestone, milestone_order_index, parent_objective_id, milestone_date, created_at)
  VALUES (v_ms1_3, 'Outreach launched', 'In Progress', v_user_id, v_foundry_id, true, 3, v_goal1, '2026-04-05T00:00:00Z', '2026-01-15T00:00:00Z');

  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, parent_objective_id, created_at)
  VALUES (v_obj1_3, 'Execute investor outreach campaign', 'In Progress', v_user_id, v_foundry_id, v_ms1_3, '2026-01-15T00:00:00Z');

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Send warm intros via network', 'Accepted', v_user_id, v_foundry_id, v_obj1_3, '2026-03-15', '2026-03-30', '2026-03-15');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Launch cold outreach sequence', 'Pending', v_user_id, v_foundry_id, v_obj1_3, '2026-03-20', '2026-04-05', '2026-03-20');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  -- Milestone 1.4: Partner meetings complete
  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, is_milestone, milestone_order_index, parent_objective_id, milestone_date, created_at)
  VALUES (v_ms1_4, 'Partner meetings complete', 'In Progress', v_user_id, v_foundry_id, true, 4, v_goal1, '2026-05-13T00:00:00Z', '2026-01-15T00:00:00Z');

  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, parent_objective_id, created_at)
  VALUES (v_obj1_4, 'Complete partner-level presentations', 'In Progress', v_user_id, v_foundry_id, v_ms1_4, '2026-01-15T00:00:00Z');

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Schedule partner meetings', 'Pending', v_user_id, v_foundry_id, v_obj1_4, '2026-04-10', '2026-04-30', '2026-04-10');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Deliver partner presentations', 'Pending', v_user_id, v_foundry_id, v_obj1_4, '2026-04-25', '2026-05-13', '2026-04-25');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  -- Milestone 1.5: Diligence & data room complete
  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, is_milestone, milestone_order_index, parent_objective_id, milestone_date, created_at)
  VALUES (v_ms1_5, 'Diligence & data room complete', 'In Progress', v_user_id, v_foundry_id, true, 5, v_goal1, '2026-06-01T00:00:00Z', '2026-01-15T00:00:00Z');

  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, parent_objective_id, created_at)
  VALUES (v_obj1_5, 'Prepare for due diligence', 'In Progress', v_user_id, v_foundry_id, v_ms1_5, '2026-01-15T00:00:00Z');

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Populate data room documents', 'Pending', v_user_id, v_foundry_id, v_obj1_5, '2026-05-05', '2026-05-22', '2026-05-05');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Complete legal review', 'Pending', v_user_id, v_foundry_id, v_obj1_5, '2026-05-15', '2026-06-01', '2026-05-15');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);


  -- =========================================================================
  -- GOAL 2: Launch Drone MVP
  -- =========================================================================
  INSERT INTO public.objectives (id, title, description, status, creator_id, foundry_id, is_strategic_goal, milestone_date, goal_type, created_at)
  VALUES (v_goal2, 'Launch Drone MVP', 'Design, integrate, and launch the drone minimum viable product with ForgeOS integration.', 'In Progress', v_user_id, v_foundry_id, true, '2026-08-01T00:00:00Z', 'Launch', '2026-01-20T00:00:00Z');

  -- Milestone 2.1: Hardware Spec
  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, is_milestone, milestone_order_index, parent_objective_id, milestone_date, created_at)
  VALUES (v_ms2_1, 'Hardware Spec', 'Completed', v_user_id, v_foundry_id, true, 1, v_goal2, '2026-03-20T00:00:00Z', '2026-01-20T00:00:00Z');

  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, parent_objective_id, created_at)
  VALUES (v_obj2_1, 'Define hardware specifications', 'Completed', v_user_id, v_foundry_id, v_ms2_1, '2026-01-20T00:00:00Z');

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Define motor + frame specs', 'Completed', v_user_id, v_foundry_id, v_obj2_1, '2026-01-25', '2026-02-15', '2026-01-25');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Select flight controller board', 'Completed', v_user_id, v_foundry_id, v_obj2_1, '2026-02-01', '2026-02-28', '2026-02-01');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Prototype sensor array', 'Completed', v_user_id, v_foundry_id, v_obj2_1, '2026-02-15', '2026-03-20', '2026-02-15');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  -- Milestone 2.2: ForgeOS Integration
  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, is_milestone, milestone_order_index, parent_objective_id, milestone_date, created_at)
  VALUES (v_ms2_2, 'ForgeOS Integration', 'In Progress', v_user_id, v_foundry_id, true, 2, v_goal2, '2026-05-01T00:00:00Z', '2026-01-20T00:00:00Z');

  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, parent_objective_id, created_at)
  VALUES (v_obj2_2, 'Integrate with ForgeOS platform', 'In Progress', v_user_id, v_foundry_id, v_ms2_2, '2026-01-20T00:00:00Z');

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Build telemetry API bridge', 'Accepted', v_user_id, v_foundry_id, v_obj2_2, '2026-03-15', '2026-04-10', '2026-03-15');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Implement flight plan sync', 'Accepted', v_user_id, v_foundry_id, v_obj2_2, '2026-03-25', '2026-04-20', '2026-03-25');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'End-to-end integration tests', 'Pending', v_user_id, v_foundry_id, v_obj2_2, '2026-04-15', '2026-05-01', '2026-04-15');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  -- Milestone 2.3: Beta Launch
  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, is_milestone, milestone_order_index, parent_objective_id, milestone_date, created_at)
  VALUES (v_ms2_3, 'Beta Launch', 'In Progress', v_user_id, v_foundry_id, true, 3, v_goal2, '2026-06-15T00:00:00Z', '2026-01-20T00:00:00Z');

  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, parent_objective_id, created_at)
  VALUES (v_obj2_3, 'Launch closed beta with testers', 'In Progress', v_user_id, v_foundry_id, v_ms2_3, '2026-01-20T00:00:00Z');

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Recruit 10 beta testers', 'Pending', v_user_id, v_foundry_id, v_obj2_3, '2026-05-05', '2026-05-25', '2026-05-05');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Run beta field tests', 'Pending', v_user_id, v_foundry_id, v_obj2_3, '2026-05-20', '2026-06-15', '2026-05-20');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  -- Milestone 2.4: Production Release
  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, is_milestone, milestone_order_index, parent_objective_id, milestone_date, created_at)
  VALUES (v_ms2_4, 'Production Release', 'In Progress', v_user_id, v_foundry_id, true, 4, v_goal2, '2026-07-25T00:00:00Z', '2026-01-20T00:00:00Z');

  INSERT INTO public.objectives (id, title, status, creator_id, foundry_id, parent_objective_id, created_at)
  VALUES (v_obj2_4, 'Ship production-ready drone', 'In Progress', v_user_id, v_foundry_id, v_ms2_4, '2026-01-20T00:00:00Z');

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Fix beta feedback issues', 'Pending', v_user_id, v_foundry_id, v_obj2_4, '2026-06-15', '2026-07-05', '2026-06-15');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  v_task := gen_random_uuid();
  INSERT INTO public.tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
  VALUES (v_task, 'Certify + ship v1.0', 'Pending', v_user_id, v_foundry_id, v_obj2_4, '2026-07-01', '2026-07-25', '2026-07-01');
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

  RAISE NOTICE 'Strategy River seed data created for user % in foundry %', v_user_id, v_foundry_id;

END $$;
