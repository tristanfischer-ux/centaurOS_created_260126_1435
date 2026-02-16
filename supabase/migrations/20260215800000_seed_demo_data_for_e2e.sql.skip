-- Seed demo data for E2E tests
-- Creates tasks, objectives, and task_history for the demo.founder account
-- so that the Today page, Tasks page, and Objectives page render real content.

DO $$
DECLARE
  v_founder_id UUID;
  v_exec_id UUID;
  v_foundry_id TEXT := 'foundry-demo';
  v_today DATE := CURRENT_DATE;
  v_task1_id UUID := gen_random_uuid();
  v_task2_id UUID := gen_random_uuid();
  v_task3_id UUID := gen_random_uuid();
  v_task4_id UUID := gen_random_uuid();
  v_obj1_id UUID := gen_random_uuid();
  v_obj2_id UUID := gen_random_uuid();
BEGIN
  -- Look up demo user IDs
  SELECT id INTO v_founder_id
  FROM profiles
  WHERE email = 'demo.founder@forgeos.io'
  LIMIT 1;

  SELECT id INTO v_exec_id
  FROM profiles
  WHERE email = 'demo.executive@forgeos.io'
  LIMIT 1;

  IF v_founder_id IS NULL THEN
    RAISE NOTICE 'Demo founder not found — skipping seed data';
    RETURN;
  END IF;

  -- ────────────────────────────────────────────────
  -- Objectives
  -- ────────────────────────────────────────────────

  INSERT INTO objectives (id, title, description, status, progress, creator_id, foundry_id)
  VALUES
    (v_obj1_id, 'Launch MVP Product', 'Ship the first version of our product to early adopters', 'In Progress', 45, v_founder_id, v_foundry_id),
    (v_obj2_id, 'Build Engineering Team', 'Hire 3 senior engineers and establish dev culture', 'In Progress', 20, v_founder_id, v_foundry_id)
  ON CONFLICT (id) DO NOTHING;

  -- ────────────────────────────────────────────────
  -- Tasks
  -- ────────────────────────────────────────────────

  -- Task 1: Completed today (drives tasks_completed_count)
  INSERT INTO tasks (id, title, description, status, creator_id, assignee_id, objective_id, foundry_id, start_date, end_date)
  VALUES (
    v_task1_id,
    'Finalize product requirements document',
    'Review and sign off on the PRD for MVP launch',
    'Completed',
    v_founder_id,
    v_founder_id,
    v_obj1_id,
    v_foundry_id,
    v_today - INTERVAL '3 days',
    v_today
  ) ON CONFLICT (id) DO NOTHING;

  -- Task 2: Due today (drives tasks_due_today)
  INSERT INTO tasks (id, title, description, status, creator_id, assignee_id, objective_id, foundry_id, start_date, end_date)
  VALUES (
    v_task2_id,
    'Review candidate portfolios for senior engineer role',
    'Evaluate the shortlisted candidates and prepare interview notes',
    'Accepted',
    v_founder_id,
    v_founder_id,
    v_obj2_id,
    v_foundry_id,
    v_today - INTERVAL '2 days',
    v_today
  ) ON CONFLICT (id) DO NOTHING;

  -- Task 3: Overdue (drives tasks_overdue)
  INSERT INTO tasks (id, title, description, status, creator_id, assignee_id, objective_id, foundry_id, start_date, end_date)
  VALUES (
    v_task3_id,
    'Set up CI/CD pipeline',
    'Configure GitHub Actions for automated testing and deployment',
    'Pending',
    v_founder_id,
    v_founder_id,
    v_obj1_id,
    v_foundry_id,
    v_today - INTERVAL '7 days',
    v_today - INTERVAL '2 days'
  ) ON CONFLICT (id) DO NOTHING;

  -- Task 4: Assigned to exec (drives team stats)
  INSERT INTO tasks (id, title, description, status, creator_id, assignee_id, objective_id, foundry_id, start_date, end_date)
  VALUES (
    v_task4_id,
    'Draft investor update email',
    'Monthly investor update covering progress on MVP and hiring',
    'Accepted',
    v_founder_id,
    COALESCE(v_exec_id, v_founder_id),
    v_obj1_id,
    v_foundry_id,
    v_today - INTERVAL '1 day',
    v_today + INTERVAL '3 days'
  ) ON CONFLICT (id) DO NOTHING;

  -- ────────────────────────────────────────────────
  -- Task assignees (multi-assignee support)
  -- ────────────────────────────────────────────────

  INSERT INTO task_assignees (task_id, profile_id) VALUES
    (v_task1_id, v_founder_id),
    (v_task2_id, v_founder_id),
    (v_task3_id, v_founder_id),
    (v_task4_id, COALESCE(v_exec_id, v_founder_id))
  ON CONFLICT (task_id, profile_id) DO NOTHING;

  -- ────────────────────────────────────────────────
  -- Task history (drives daily pulse stats)
  -- ────────────────────────────────────────────────

  -- Today: task 1 completed
  INSERT INTO task_history (task_id, user_id, action_type, created_at)
  SELECT v_task1_id, v_founder_id, 'COMPLETED', NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM task_history
    WHERE task_id = v_task1_id AND action_type = 'COMPLETED'
  );

  -- Today: task 1 was created 3 days ago
  INSERT INTO task_history (task_id, user_id, action_type, created_at)
  SELECT v_task1_id, v_founder_id, 'CREATED', NOW() - INTERVAL '3 days'
  WHERE NOT EXISTS (
    SELECT 1 FROM task_history
    WHERE task_id = v_task1_id AND action_type = 'CREATED'
  );

  -- Today: task 2 was created 2 days ago
  INSERT INTO task_history (task_id, user_id, action_type, created_at)
  SELECT v_task2_id, v_founder_id, 'CREATED', NOW() - INTERVAL '2 days'
  WHERE NOT EXISTS (
    SELECT 1 FROM task_history
    WHERE task_id = v_task2_id AND action_type = 'CREATED'
  );

  -- Yesterday: simulate completing another task (drives trends)
  INSERT INTO task_history (task_id, user_id, action_type, created_at)
  SELECT v_task3_id, v_founder_id, 'CREATED', NOW() - INTERVAL '7 days'
  WHERE NOT EXISTS (
    SELECT 1 FROM task_history
    WHERE task_id = v_task3_id AND action_type = 'CREATED'
  );

  RAISE NOTICE 'Demo seed data created: 2 objectives, 4 tasks, task history entries';
END $$;
