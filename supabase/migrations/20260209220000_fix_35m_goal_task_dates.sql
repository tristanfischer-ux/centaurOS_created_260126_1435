/**
 * Migration: Fix 35m funding round task dates
 *
 * Purpose: Populate start_date and end_date for all tasks under the
 * "Raise a 35m funding round" strategic goal. Without dates, tasks
 * cluster at the same X position on the Strategy River, making the
 * visualization unreadable.
 *
 * Strategy: For each milestone window (previous milestone date → this milestone date),
 * spread task start/end dates across the window so they fan out naturally.
 *
 * Also adds objectives + tasks to empty milestones so they appear on the river.
 *
 * Rollback: UPDATE tasks SET start_date = NULL, end_date = NULL
 *   WHERE objective_id IN (SELECT id FROM objectives WHERE parent_objective_id IN
 *     (SELECT id FROM objectives WHERE parent_objective_id = '<goal_id>' AND is_milestone = true));
 */

DO $$
DECLARE
  v_goal_id       UUID;
  v_foundry_id    TEXT;
  v_user_id       UUID;
  -- Milestone IDs (from existing data)
  v_ms_deck       UUID; -- "Deck + narrative complete" (Feb 28)
  v_ms_investor   UUID; -- "Investor list finalized" (Mar 19)
  v_ms_outreach   UUID; -- "Outreach launched" (Apr 5)
  v_ms_initial    UUID; -- "Initial meetings booked" (Apr 24)
  v_ms_partner    UUID; -- "Partner meetings complete" (May 13)
  v_ms_diligence  UUID; -- "Diligence & data room complete" (Jun 1)
  v_ms_term       UUID; -- "Term sheet agreed" (Jun 19)
  v_ms_close      UUID; -- "Close round" (Jul 8)
  -- New objective/task IDs for empty milestones
  v_obj           UUID;
  v_task          UUID;
BEGIN
  -- Find the 35m goal
  SELECT id INTO v_goal_id FROM objectives
  WHERE title = 'Raise a 35m funding round'
    AND is_strategic_goal = true
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_goal_id IS NULL THEN
    RAISE NOTICE '35m goal not found — skipping';
    RETURN;
  END IF;

  -- Get foundry and user
  SELECT creator_id, foundry_id INTO v_user_id, v_foundry_id
  FROM objectives WHERE id = v_goal_id;

  -- Get milestone IDs
  SELECT id INTO v_ms_deck FROM objectives
    WHERE parent_objective_id = v_goal_id AND title = 'Deck + narrative complete' AND is_milestone = true;
  SELECT id INTO v_ms_investor FROM objectives
    WHERE parent_objective_id = v_goal_id AND title = 'Investor list finalized' AND is_milestone = true;
  SELECT id INTO v_ms_outreach FROM objectives
    WHERE parent_objective_id = v_goal_id AND title = 'Outreach launched' AND is_milestone = true;
  SELECT id INTO v_ms_initial FROM objectives
    WHERE parent_objective_id = v_goal_id AND title = 'Initial meetings booked' AND is_milestone = true;
  SELECT id INTO v_ms_partner FROM objectives
    WHERE parent_objective_id = v_goal_id AND title = 'Partner meetings complete' AND is_milestone = true;
  SELECT id INTO v_ms_diligence FROM objectives
    WHERE parent_objective_id = v_goal_id AND title = 'Diligence & data room complete' AND is_milestone = true;
  SELECT id INTO v_ms_term FROM objectives
    WHERE parent_objective_id = v_goal_id AND title = 'Term sheet agreed' AND is_milestone = true;
  SELECT id INTO v_ms_close FROM objectives
    WHERE parent_objective_id = v_goal_id AND title = 'Close round' AND is_milestone = true;

  -- =========================================================================
  -- 1. Fix dates for existing tasks (Milestone: Deck + narrative complete)
  --    Window: Jan 20 → Feb 28
  -- =========================================================================
  -- "Define fundraising story and why-now" (obj: Narrative & positioning)
  UPDATE tasks SET start_date = '2026-01-20', end_date = '2026-02-05'
  WHERE id = '7f8b605c-811c-48e5-b3aa-12be8fc36711';

  -- "Competitive landscape + differentiation" (obj: Narrative & positioning)
  UPDATE tasks SET start_date = '2026-01-25', end_date = '2026-02-12'
  WHERE id = '9e3dd6be-b137-4d50-b441-be9ec0a47b63';

  -- "Draft pitch deck v1" (obj: Deck & materials)
  UPDATE tasks SET start_date = '2026-02-01', end_date = '2026-02-16'
  WHERE id = '1a47186d-9aa1-412f-8df4-c83394edc5c8';

  -- "Prepare financial model + assumptions" (obj: Deck & materials)
  UPDATE tasks SET start_date = '2026-02-05', end_date = '2026-02-20'
  WHERE id = 'bb7c1234-37dd-43f2-8ac2-6970ba90228f';

  -- "Create metrics/KPI pack" (obj: Deck & materials)
  UPDATE tasks SET start_date = '2026-02-12', end_date = '2026-02-28'
  WHERE id = 'c7972bc5-ea92-472c-8c6e-b6b494465222';

  -- =========================================================================
  -- 2. Fix dates for existing tasks (Milestone: Investor list finalized)
  --    Window: Feb 28 → Mar 19
  -- =========================================================================
  -- "Build target investor list" (obj: Investor targeting)
  UPDATE tasks SET start_date = '2026-02-28', end_date = '2026-03-12'
  WHERE id = '35389139-6185-4681-9ace-02c64ab9d518';

  -- "Find warm intro paths" (obj: Investor targeting)
  UPDATE tasks SET start_date = '2026-03-05', end_date = '2026-03-19'
  WHERE id = 'ae990155-993c-4bd7-b6d0-8b205c4e7b83';

  -- =========================================================================
  -- 3. Fix dates for existing tasks (Milestone: Outreach launched)
  --    Window: Mar 19 → Apr 5
  -- =========================================================================
  -- "Outreach messaging + email sequences" (obj: Outreach & pipeline)
  UPDATE tasks SET start_date = '2026-03-19', end_date = '2026-03-30'
  WHERE id = 'b5830928-1e50-4a2c-8afe-6e5ce1ce587c';

  -- "Schedule initial meetings" (obj: Outreach & pipeline)
  UPDATE tasks SET start_date = '2026-03-25', end_date = '2026-04-05'
  WHERE id = 'c594a9dd-8cc0-44dd-a1c1-58bfeedf7e21';

  -- =========================================================================
  -- 4. Add objective + tasks to empty milestone: Initial meetings booked
  --    Window: Apr 5 → Apr 24
  -- =========================================================================
  IF v_ms_initial IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM objectives WHERE parent_objective_id = v_ms_initial
      AND is_milestone = false AND is_strategic_goal = false AND deleted_at IS NULL
  ) THEN
    v_obj := gen_random_uuid();
    INSERT INTO objectives (id, title, status, creator_id, foundry_id, parent_objective_id, created_at)
    VALUES (v_obj, 'Book first-round meetings', 'In Progress', v_user_id, v_foundry_id, v_ms_initial, now());

    v_task := gen_random_uuid();
    INSERT INTO tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
    VALUES (v_task, 'Confirm first 10 investor meetings', 'Pending', v_user_id, v_foundry_id, v_obj, '2026-04-05', '2026-04-16', now());
    INSERT INTO task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

    v_task := gen_random_uuid();
    INSERT INTO tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
    VALUES (v_task, 'Prep meeting-specific decks', 'Pending', v_user_id, v_foundry_id, v_obj, '2026-04-10', '2026-04-24', now());
    INSERT INTO task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);
  END IF;

  -- =========================================================================
  -- 5. Fix dates for existing tasks (Milestone: Partner meetings complete)
  --    Window: Apr 24 → May 13
  -- =========================================================================
  -- "Weekly investor pipeline review" (obj: Process management)
  UPDATE tasks SET start_date = '2026-04-24', end_date = '2026-05-06'
  WHERE id = 'b1950e43-e1db-49c0-8fe0-0454188a55a5';

  -- "Q&A log and diligence tracker" (obj: Process management)
  UPDATE tasks SET start_date = '2026-04-30', end_date = '2026-05-13'
  WHERE id = 'b3e09958-ac42-445b-84db-e83f74456272';

  -- =========================================================================
  -- 6. Fix dates for existing tasks (Milestone: Diligence & data room complete)
  --    Window: May 13 → Jun 1
  -- =========================================================================
  -- "Assemble legal docs" (obj: Data room readiness)
  UPDATE tasks SET start_date = '2026-05-13', end_date = '2026-05-24'
  WHERE id = 'c18b9ce8-8606-4953-a425-97d948f650fd';

  -- "Assemble commercial docs" (obj: Data room readiness)
  UPDATE tasks SET start_date = '2026-05-18', end_date = '2026-06-01'
  WHERE id = '73247e9f-cac3-41f8-86ff-6b663d53f1ab';

  -- =========================================================================
  -- 7. Add objective + tasks to empty milestone: Term sheet agreed
  --    Window: Jun 1 → Jun 19
  -- =========================================================================
  IF v_ms_term IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM objectives WHERE parent_objective_id = v_ms_term
      AND is_milestone = false AND is_strategic_goal = false AND deleted_at IS NULL
  ) THEN
    v_obj := gen_random_uuid();
    INSERT INTO objectives (id, title, status, creator_id, foundry_id, parent_objective_id, created_at)
    VALUES (v_obj, 'Negotiate and agree terms', 'In Progress', v_user_id, v_foundry_id, v_ms_term, now());

    v_task := gen_random_uuid();
    INSERT INTO tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
    VALUES (v_task, 'Review term sheets from leads', 'Pending', v_user_id, v_foundry_id, v_obj, '2026-06-01', '2026-06-12', now());
    INSERT INTO task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

    v_task := gen_random_uuid();
    INSERT INTO tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
    VALUES (v_task, 'Negotiate final terms with counsel', 'Pending', v_user_id, v_foundry_id, v_obj, '2026-06-08', '2026-06-19', now());
    INSERT INTO task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);
  END IF;

  -- =========================================================================
  -- 8. Add objective + tasks to empty milestone: Close round
  --    Window: Jun 19 → Jul 8
  -- =========================================================================
  IF v_ms_close IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM objectives WHERE parent_objective_id = v_ms_close
      AND is_milestone = false AND is_strategic_goal = false AND deleted_at IS NULL
  ) THEN
    v_obj := gen_random_uuid();
    INSERT INTO objectives (id, title, status, creator_id, foundry_id, parent_objective_id, created_at)
    VALUES (v_obj, 'Execute closing', 'In Progress', v_user_id, v_foundry_id, v_ms_close, now());

    v_task := gen_random_uuid();
    INSERT INTO tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
    VALUES (v_task, 'Complete legal closing docs', 'Pending', v_user_id, v_foundry_id, v_obj, '2026-06-19', '2026-07-01', now());
    INSERT INTO task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);

    v_task := gen_random_uuid();
    INSERT INTO tasks (id, title, status, creator_id, foundry_id, objective_id, start_date, end_date, created_at)
    VALUES (v_task, 'Wire funds and close round', 'Pending', v_user_id, v_foundry_id, v_obj, '2026-06-28', '2026-07-08', now());
    INSERT INTO task_assignees (task_id, profile_id) VALUES (v_task, v_user_id);
  END IF;

  -- =========================================================================
  -- 9. Add task_assignees for the 13 existing tasks (if not already assigned)
  -- =========================================================================
  INSERT INTO task_assignees (task_id, profile_id)
  SELECT t.id, v_user_id
  FROM tasks t
  WHERE t.objective_id IN (
    SELECT o.id FROM objectives o
    WHERE o.parent_objective_id IN (
      SELECT m.id FROM objectives m
      WHERE m.parent_objective_id = v_goal_id AND m.is_milestone = true
    )
    AND o.is_milestone = false AND o.is_strategic_goal = false
  )
  AND NOT EXISTS (
    SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.profile_id = v_user_id
  );

  RAISE NOTICE 'Fixed dates for 35m funding round tasks and added missing milestone data';
END $$;
