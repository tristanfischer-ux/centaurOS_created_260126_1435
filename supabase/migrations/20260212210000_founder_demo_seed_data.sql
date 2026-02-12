/**
 * Migration: Founder Demo Seed Data System
 *
 * Purpose: When a Founder creates a new company, seed it with demo strategic
 * goals, objectives, and tasks so they can learn how ForgeOS works. All demo
 * items are marked with is_demo=true and displayed with a "Demo" badge in the UI.
 *
 * Changes:
 *   1. Add is_demo column to objectives and tasks
 *   2. Create seed_founder_demo_data() RPC called during Founder signup
 *
 * Demo data structure:
 *   Strategic Goal 1: "Launch MVP Product" (teaches product development workflow)
 *     → 3 milestones, each with 1 objective + 2-3 tasks
 *   Strategic Goal 2: "Build Your Team" (teaches recruiting via Recruits marketplace)
 *     → 2 milestones, each with 1 objective + 2-3 tasks
 *
 * Rollback:
 *   DROP FUNCTION IF EXISTS seed_founder_demo_data;
 *   ALTER TABLE objectives DROP COLUMN IF EXISTS is_demo;
 *   ALTER TABLE tasks DROP COLUMN IF EXISTS is_demo;
 */

-- 1. Add is_demo flag to objectives
ALTER TABLE objectives ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN objectives.is_demo IS
  'Whether this objective is demo/sample data seeded for learning purposes.';

-- 2. Add is_demo flag to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN tasks.is_demo IS
  'Whether this task is demo/sample data seeded for learning purposes.';

-- 3. Create the seeding RPC
CREATE OR REPLACE FUNCTION seed_founder_demo_data(
  p_foundry_id TEXT,
  p_user_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- Goal 1: Launch MVP Product
  v_goal1       UUID := gen_random_uuid();
  v_ms1_1       UUID := gen_random_uuid();
  v_ms1_2       UUID := gen_random_uuid();
  v_ms1_3       UUID := gen_random_uuid();
  v_obj1_1      UUID := gen_random_uuid();
  v_obj1_2      UUID := gen_random_uuid();
  v_obj1_3      UUID := gen_random_uuid();

  -- Goal 2: Build Your Team
  v_goal2       UUID := gen_random_uuid();
  v_ms2_1       UUID := gen_random_uuid();
  v_ms2_2       UUID := gen_random_uuid();
  v_obj2_1      UUID := gen_random_uuid();
  v_obj2_2      UUID := gen_random_uuid();

  -- Task scratch variable
  v_task        UUID;
  v_now         TIMESTAMPTZ := NOW();
BEGIN
  -- Guard: don't seed if demo data already exists for this foundry
  IF EXISTS (
    SELECT 1 FROM public.objectives
    WHERE foundry_id = p_foundry_id
      AND is_demo = true
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

  -- ==========================================================================
  -- GOAL 1: Launch MVP Product
  -- Teaches: strategic goals, milestones, objectives, tasks, status workflow
  -- ==========================================================================
  INSERT INTO public.objectives (
    id, title, description, status, creator_id, foundry_id,
    is_strategic_goal, milestone_date, goal_type, is_demo, created_at
  ) VALUES (
    v_goal1,
    '🎯 Demo: Launch MVP Product',
    'This is a demo strategic goal showing how to plan a product launch in ForgeOS. '
    || 'Strategic goals sit at the top of your planning hierarchy. '
    || 'Below each goal you''ll find milestones, objectives, and tasks. '
    || 'Feel free to explore — you can delete all demo items when you''re ready.',
    'In Progress', p_user_id, p_foundry_id,
    true, (v_now + INTERVAL '90 days')::TEXT, 'Launch', true, v_now
  );

  -- ---------------------------------------------------------------------------
  -- Milestone 1.1: Design Phase Complete
  -- ---------------------------------------------------------------------------
  INSERT INTO public.objectives (
    id, title, status, creator_id, foundry_id,
    is_milestone, milestone_order_index, parent_objective_id,
    milestone_date, is_demo, created_at
  ) VALUES (
    v_ms1_1, 'Design Phase Complete', 'Completed',
    p_user_id, p_foundry_id,
    true, 1, v_goal1,
    (v_now + INTERVAL '14 days')::TEXT, true, v_now
  );

  INSERT INTO public.objectives (
    id, title, description, status, creator_id, foundry_id,
    parent_objective_id, is_demo, created_at
  ) VALUES (
    v_obj1_1, 'Complete product specifications',
    'Define what you''re building. This objective groups the design tasks together. '
    || 'Try clicking into it to see how tasks are organized under objectives.',
    'Completed', p_user_id, p_foundry_id,
    v_ms1_1, true, v_now
  );

  -- Task: Define requirements
  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Define product requirements',
    'Write down what your product needs to do. In ForgeOS, tasks are the smallest unit '
    || 'of work. They have statuses (Pending → Accepted → Completed) and can be assigned '
    || 'to team members.',
    'Completed', p_user_id, p_foundry_id,
    v_obj1_1, v_now::DATE, (v_now + INTERVAL '5 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  -- Task: Create wireframes
  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Create product wireframes',
    'Sketch out the user experience. This task shows the "Completed" status — '
    || 'meaning work is done and verified.',
    'Completed', p_user_id, p_foundry_id,
    v_obj1_1, (v_now + INTERVAL '3 days')::DATE, (v_now + INTERVAL '10 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  -- Task: Technical architecture
  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Review technical architecture',
    'Validate the technical approach. This task was assigned to you as the Founder — '
    || 'once you recruit team members, you can reassign tasks to them.',
    'Completed', p_user_id, p_foundry_id,
    v_obj1_1, (v_now + INTERVAL '7 days')::DATE, (v_now + INTERVAL '14 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  -- ---------------------------------------------------------------------------
  -- Milestone 1.2: Prototype Built
  -- ---------------------------------------------------------------------------
  INSERT INTO public.objectives (
    id, title, status, creator_id, foundry_id,
    is_milestone, milestone_order_index, parent_objective_id,
    milestone_date, is_demo, created_at
  ) VALUES (
    v_ms1_2, 'Prototype Built', 'In Progress',
    p_user_id, p_foundry_id,
    true, 2, v_goal1,
    (v_now + INTERVAL '45 days')::TEXT, true, v_now
  );

  INSERT INTO public.objectives (
    id, title, description, status, creator_id, foundry_id,
    parent_objective_id, is_demo, created_at
  ) VALUES (
    v_obj1_2, 'Build functional prototype',
    'Turn designs into a working prototype. Notice how this objective is "In Progress" '
    || '— its tasks below show different statuses to demonstrate the workflow.',
    'In Progress', p_user_id, p_foundry_id,
    v_ms1_2, true, v_now
  );

  -- Task: Develop core feature (Accepted = in progress)
  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Develop core product feature',
    'Build the main feature. This task has status "Accepted" — it''s been picked up '
    || 'and work is underway. Try changing its status to see the workflow.',
    'Accepted', p_user_id, p_foundry_id,
    v_obj1_2, (v_now + INTERVAL '14 days')::DATE, (v_now + INTERVAL '35 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  -- Task: Set up testing
  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Set up testing framework',
    'Prepare quality checks. This task is "Pending" — it hasn''t been started yet. '
    || 'Click to accept it and start working.',
    'Pending', p_user_id, p_foundry_id,
    v_obj1_2, (v_now + INTERVAL '25 days')::DATE, (v_now + INTERVAL '40 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  -- Task: User feedback
  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Run user feedback session',
    'Get real user input on the prototype. Schedule 3-5 user interviews to validate '
    || 'your assumptions before investing more.',
    'Pending', p_user_id, p_foundry_id,
    v_obj1_2, (v_now + INTERVAL '35 days')::DATE, (v_now + INTERVAL '45 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  -- ---------------------------------------------------------------------------
  -- Milestone 1.3: Launch Ready
  -- ---------------------------------------------------------------------------
  INSERT INTO public.objectives (
    id, title, status, creator_id, foundry_id,
    is_milestone, milestone_order_index, parent_objective_id,
    milestone_date, is_demo, created_at
  ) VALUES (
    v_ms1_3, 'Launch Ready', 'In Progress',
    p_user_id, p_foundry_id,
    true, 3, v_goal1,
    (v_now + INTERVAL '90 days')::TEXT, true, v_now
  );

  INSERT INTO public.objectives (
    id, title, description, status, creator_id, foundry_id,
    parent_objective_id, is_demo, created_at
  ) VALUES (
    v_obj1_3, 'Prepare for market launch',
    'Everything needed to go live. These tasks will become actionable once '
    || 'your prototype is validated.',
    'In Progress', p_user_id, p_foundry_id,
    v_ms1_3, true, v_now
  );

  -- Task: Final QA
  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Complete final QA testing',
    'Run comprehensive quality assurance before launch. Assign this to a team member '
    || 'once you''ve recruited one from the Recruits marketplace.',
    'Pending', p_user_id, p_foundry_id,
    v_obj1_3, (v_now + INTERVAL '60 days')::DATE, (v_now + INTERVAL '80 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  -- Task: Marketing materials
  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Create marketing materials',
    'Design landing page, pitch deck updates, and launch comms. Consider inviting '
    || 'a Fractional CMO from the Recruits marketplace to help.',
    'Pending', p_user_id, p_foundry_id,
    v_obj1_3, (v_now + INTERVAL '70 days')::DATE, (v_now + INTERVAL '88 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);


  -- ==========================================================================
  -- GOAL 2: Build Your Team
  -- Teaches: recruiting from marketplace, team building, invitation flow
  -- ==========================================================================
  INSERT INTO public.objectives (
    id, title, description, status, creator_id, foundry_id,
    is_strategic_goal, milestone_date, goal_type, is_demo, created_at
  ) VALUES (
    v_goal2,
    '👥 Demo: Build Your Team',
    'This demo goal shows how to build your team using ForgeOS. '
    || 'Visit the Recruits marketplace to find Executives and Apprentices, '
    || 'then invite them to join your company with one click. '
    || 'Delete this demo data anytime — it''s here to help you get started.',
    'In Progress', p_user_id, p_foundry_id,
    true, (v_now + INTERVAL '30 days')::TEXT, 'Hiring', true, v_now
  );

  -- ---------------------------------------------------------------------------
  -- Milestone 2.1: Core Team Assembled
  -- ---------------------------------------------------------------------------
  INSERT INTO public.objectives (
    id, title, status, creator_id, foundry_id,
    is_milestone, milestone_order_index, parent_objective_id,
    milestone_date, is_demo, created_at
  ) VALUES (
    v_ms2_1, 'Core Team Assembled', 'In Progress',
    p_user_id, p_foundry_id,
    true, 1, v_goal2,
    (v_now + INTERVAL '14 days')::TEXT, true, v_now
  );

  INSERT INTO public.objectives (
    id, title, description, status, creator_id, foundry_id,
    parent_objective_id, is_demo, created_at
  ) VALUES (
    v_obj2_1, 'Recruit key team members',
    'Find and invite Executives and Apprentices from the Recruits marketplace. '
    || 'Each task below represents a role to fill — click "Browse Recruits" on the '
    || 'Updates page or navigate to Marketplace → Recruits.',
    'In Progress', p_user_id, p_foundry_id,
    v_ms2_1, true, v_now
  );

  -- Task: Browse Recruits
  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Browse the Recruits marketplace',
    'Go to the Recruits section (under Marketplace in the sidebar) to see Executives '
    || 'and Apprentices who have joined ForgeOS. Click "Invite to Company" on any '
    || 'listing to send them an invitation.',
    'Pending', p_user_id, p_foundry_id,
    v_obj2_1, v_now::DATE, (v_now + INTERVAL '7 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  -- Task: Invite a Fractional Executive
  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Invite a Fractional Executive',
    'Find an Executive with relevant experience in the Recruits marketplace and invite '
    || 'them to your company. They bring strategic leadership without full-time cost.',
    'Pending', p_user_id, p_foundry_id,
    v_obj2_1, (v_now + INTERVAL '3 days')::DATE, (v_now + INTERVAL '10 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  -- Task: Invite an Apprentice
  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Invite an Apprentice',
    'Apprentices provide high-output execution at a fraction of the cost. Find one in '
    || 'the Recruits marketplace and invite them to accelerate your team''s delivery.',
    'Pending', p_user_id, p_foundry_id,
    v_obj2_1, (v_now + INTERVAL '5 days')::DATE, (v_now + INTERVAL '12 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  -- ---------------------------------------------------------------------------
  -- Milestone 2.2: Team Operational
  -- ---------------------------------------------------------------------------
  INSERT INTO public.objectives (
    id, title, status, creator_id, foundry_id,
    is_milestone, milestone_order_index, parent_objective_id,
    milestone_date, is_demo, created_at
  ) VALUES (
    v_ms2_2, 'Team Operational', 'In Progress',
    p_user_id, p_foundry_id,
    true, 2, v_goal2,
    (v_now + INTERVAL '30 days')::TEXT, true, v_now
  );

  INSERT INTO public.objectives (
    id, title, description, status, creator_id, foundry_id,
    parent_objective_id, is_demo, created_at
  ) VALUES (
    v_obj2_2, 'Onboard and align team',
    'Once team members accept your invitation, get everyone aligned. '
    || 'Use ForgeOS objectives and tasks to coordinate work across your team.',
    'In Progress', p_user_id, p_foundry_id,
    v_ms2_2, true, v_now
  );

  -- Task: Define roles
  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Define roles and responsibilities',
    'Clarify who does what. Use the Team page to see all members and their roles. '
    || 'Assign objectives and tasks to the right people.',
    'Pending', p_user_id, p_foundry_id,
    v_obj2_2, (v_now + INTERVAL '14 days')::DATE, (v_now + INTERVAL '21 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

  -- Task: First team standup
  v_task := gen_random_uuid();
  INSERT INTO public.tasks (
    id, title, description, status, creator_id, foundry_id,
    objective_id, start_date, end_date, is_demo, created_at
  ) VALUES (
    v_task, 'Run first team standup',
    'Hold your first team meeting to align on priorities. Check the Updates page '
    || 'daily to see activity across your company.',
    'Pending', p_user_id, p_foundry_id,
    v_obj2_2, (v_now + INTERVAL '18 days')::DATE, (v_now + INTERVAL '25 days')::DATE, true, v_now
  );
  INSERT INTO public.task_assignees (task_id, profile_id) VALUES (v_task, p_user_id);

END;
$$;
