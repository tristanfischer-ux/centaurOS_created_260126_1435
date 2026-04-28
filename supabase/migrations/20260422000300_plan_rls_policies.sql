-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3 — Plan redesign · Chunk A.3 — RLS policies + plan_can() helper
--
-- Implements the §16 permissions matrix on the 10 new Plan tables.
--
-- The current member_role enum has 5 values: 'Founder', 'Executive',
-- 'Apprentice', 'AI_Agent', 'Supplier'. PLAN-SCHEMA §16 targets a 9-role enum
-- (founder / co_founder / executive / cto / advisor / contractor /
--  read_only_observer / fractional_exec / apprentice). Per §17.8, Phase 3
-- ships against the current 5-role enum and degrades gracefully; the §16.3
-- access-change audit lives in app code (Chunk E), not in these policies.
--
-- plan_can(user_id, foundry_id, action) returns boolean by mapping the current
-- 5-role enum to the Phase 3 matrix. Write policies delegate here so the
-- matrix stays legible.
--
-- All DROP POLICY IF EXISTS calls make re-runs idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. plan_can() — role → action matrix
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.plan_can(
  p_user_id    uuid,
  p_foundry_id text,
  p_action     text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.member_role;
BEGIN
  -- service_role bypass for server-action writes already happens at the
  -- supabase client level; this function is only consulted by RLS WITH CHECK
  -- clauses when a user JWT is present. If there is no user, deny.
  IF p_user_id IS NULL OR p_foundry_id IS NULL OR p_action IS NULL THEN
    RETURN false;
  END IF;

  SELECT fm.role
  INTO   v_role
  FROM   public.foundry_memberships fm
  WHERE  fm.user_id = p_user_id
    AND  fm.foundry_id = p_foundry_id
    AND  fm.active = true
  LIMIT  1;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  -- Phase 3 mapping from current 5-role enum (PLAN-SCHEMA §16 preamble):
  --   Founder    → founder
  --   Executive  → executive
  --   Apprentice → apprentice
  --   AI_Agent   → (no Plan access; specialists are not human members)
  --   Supplier   → (no Plan access per §16 preamble)
  --
  -- co_founder / cto / advisor / contractor / read_only_observer /
  -- fractional_exec are not expressible in the current enum and fall back to
  -- the closest existing role (or deny) pending the 9-role expansion PR.

  RETURN CASE
    ------------------------------------------------------------------------
    -- view_plan_workspace
    ------------------------------------------------------------------------
    WHEN p_action = 'view_plan_workspace' THEN
      v_role IN ('Founder','Executive','Apprentice')

    ------------------------------------------------------------------------
    -- Strategic Goals
    ------------------------------------------------------------------------
    WHEN p_action = 'create_strategic_goal'    THEN v_role IN ('Founder','Executive')
    WHEN p_action = 'edit_strategic_goal'      THEN v_role IN ('Founder','Executive')
    WHEN p_action = 'pin_strategic_goal'       THEN v_role IN ('Founder','Executive')
    WHEN p_action = 'kill_strategic_goal'      THEN v_role =  'Founder'
    WHEN p_action = 'pivot_strategic_goal'     THEN v_role =  'Founder'
    WHEN p_action = 'set_goal_state_manual'    THEN v_role IN ('Founder','Executive')
    WHEN p_action = 'edit_disprove_assumption' THEN v_role IN ('Founder','Executive')

    ------------------------------------------------------------------------
    -- Objectives / Tasks
    ------------------------------------------------------------------------
    WHEN p_action = 'create_objective'    THEN v_role IN ('Founder','Executive','Apprentice')
    WHEN p_action = 'edit_objective'      THEN v_role IN ('Founder','Executive','Apprentice')
    WHEN p_action = 'create_task'         THEN v_role IN ('Founder','Executive','Apprentice')
    WHEN p_action = 'assign_task_self'    THEN v_role IN ('Founder','Executive','Apprentice')
    WHEN p_action = 'assign_task_others'  THEN v_role IN ('Founder','Executive')
    WHEN p_action = 'close_own_task'      THEN v_role IN ('Founder','Executive','Apprentice')
    WHEN p_action = 'delete_task'         THEN v_role IN ('Founder','Executive')

    ------------------------------------------------------------------------
    -- Fractional team
    ------------------------------------------------------------------------
    WHEN p_action = 'invite_fractional'      THEN v_role =  'Founder'
    WHEN p_action = 'end_engagement'         THEN v_role =  'Founder'
    WHEN p_action = 'set_capacity_retainer'  THEN v_role =  'Founder'

    ------------------------------------------------------------------------
    -- Gutcheck / Pressure-test
    ------------------------------------------------------------------------
    WHEN p_action = 'decide_gutcheck'        THEN v_role =  'Founder'
    WHEN p_action = 'start_pressure_test'    THEN v_role IN ('Founder','Executive')
    WHEN p_action = 'close_pressure_test'    THEN v_role IN ('Founder','Executive')

    ------------------------------------------------------------------------
    -- Report
    ------------------------------------------------------------------------
    WHEN p_action = 'draft_report'          THEN v_role IN ('Founder','Executive')
    WHEN p_action = 'edit_report_draft'     THEN v_role IN ('Founder','Executive')
    WHEN p_action = 'send_report'           THEN v_role =  'Founder'
    WHEN p_action = 'view_sent_reports'     THEN v_role IN ('Founder','Executive','Apprentice')

    ------------------------------------------------------------------------
    -- History
    ------------------------------------------------------------------------
    WHEN p_action = 'view_history'          THEN v_role IN ('Founder','Executive','Apprentice')
    WHEN p_action = 'add_manual_history'    THEN v_role IN ('Founder','Executive')
    WHEN p_action = 'mark_history_outcome'  THEN v_role IN ('Founder','Executive')

    ------------------------------------------------------------------------
    -- Settings
    ------------------------------------------------------------------------
    WHEN p_action = 'change_nudge_frequency'      THEN v_role =  'Founder'
    WHEN p_action = 'change_specialist_behaviour' THEN v_role =  'Founder'
    WHEN p_action = 'manage_permissions'          THEN v_role =  'Founder'

    ELSE false
  END;
END;
$$;

COMMENT ON FUNCTION public.plan_can(uuid, text, text) IS
  'PLAN-SCHEMA §16.1 — Phase 3 Plan action matrix against the current 5-role '
  'member_role enum. Maps Founder→founder, Executive→executive, Apprentice→'
  'apprentice; AI_Agent and Supplier deny. Full 9-role expansion lives in a '
  'separate focused PR (§17.8).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Helper: is the caller a founder/executive/apprentice of this foundry?
--    Base scope predicate reused across all Plan tables.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.plan_in_foundry(p_foundry_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.foundry_memberships fm
    WHERE fm.user_id = auth.uid()
      AND fm.foundry_id = p_foundry_id
      AND fm.active = true
  );
$$;

COMMENT ON FUNCTION public.plan_in_foundry(text) IS
  'PLAN-SCHEMA §16.2 — base foundry-scope predicate. True if auth.uid() has an '
  'active membership in the given foundry.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Fractional-overlay helper — caller is on the goal's team
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.plan_is_fractional_on_goal(p_goal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.goal_team_assignments gta
    JOIN   public.fractional_executives fe
           ON fe.id = gta.fractional_id
    WHERE  gta.goal_id = p_goal_id
      AND  fe.user_id  = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.plan_is_fractional_on_goal(uuid) IS
  'PLAN-SCHEMA §16.2 — fractional-overlay predicate. True if auth.uid() is a '
  'fractional_executive linked into the goal''s goal_team_assignments.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. fractional_executives — special-case RLS (no foundry_id column)
--    §6: network_listed=true visible to all authed; =false visible only to
--    foundries with an active engagement for this person.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS fractional_executives_select ON public.fractional_executives;
CREATE POLICY fractional_executives_select
  ON public.fractional_executives
  FOR SELECT
  USING (
    network_listed = true
    OR EXISTS (
      SELECT 1 FROM public.fractional_engagements fe
      JOIN   public.foundry_memberships fm ON fm.foundry_id = fe.foundry_id
      WHERE  fe.fractional_id = public.fractional_executives.id
        AND  fe.status IN ('pending_accept','active','on_hold')
        AND  fm.user_id = auth.uid()
        AND  fm.active  = true
    )
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS fractional_executives_insert ON public.fractional_executives;
CREATE POLICY fractional_executives_insert
  ON public.fractional_executives
  FOR INSERT
  WITH CHECK (
    -- Either service_role (server action), or the caller is founder of some
    -- foundry inviting this person (row-level check lives in the server
    -- action's plan_can('invite_fractional', ...) gate).
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true AND fm.role = 'Founder'
    )
  );

DROP POLICY IF EXISTS fractional_executives_update ON public.fractional_executives;
CREATE POLICY fractional_executives_update
  ON public.fractional_executives
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR user_id = auth.uid()
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS fractional_executives_delete ON public.fractional_executives;
CREATE POLICY fractional_executives_delete
  ON public.fractional_executives
  FOR DELETE
  USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. strategic_goals — base foundry scope + fractional overlay + write gates
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS strategic_goals_select ON public.strategic_goals;
CREATE POLICY strategic_goals_select
  ON public.strategic_goals
  FOR SELECT
  USING (
    public.plan_in_foundry(foundry_id)
    OR public.plan_is_fractional_on_goal(id)
  );

DROP POLICY IF EXISTS strategic_goals_insert ON public.strategic_goals;
CREATE POLICY strategic_goals_insert
  ON public.strategic_goals
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'create_strategic_goal')
  );

DROP POLICY IF EXISTS strategic_goals_update ON public.strategic_goals;
CREATE POLICY strategic_goals_update
  ON public.strategic_goals
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.plan_in_foundry(foundry_id)
    OR public.plan_is_fractional_on_goal(id)
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'edit_strategic_goal')
  );

DROP POLICY IF EXISTS strategic_goals_delete ON public.strategic_goals;
CREATE POLICY strategic_goals_delete
  ON public.strategic_goals
  FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'kill_strategic_goal')
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. disprove_assumptions — inherits scope from goal; fractional overlay
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS disprove_assumptions_select ON public.disprove_assumptions;
CREATE POLICY disprove_assumptions_select
  ON public.disprove_assumptions
  FOR SELECT
  USING (
    public.plan_in_foundry(foundry_id)
    OR public.plan_is_fractional_on_goal(goal_id)
  );

DROP POLICY IF EXISTS disprove_assumptions_insert ON public.disprove_assumptions;
CREATE POLICY disprove_assumptions_insert
  ON public.disprove_assumptions
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'edit_disprove_assumption')
    OR public.plan_is_fractional_on_goal(goal_id)
  );

DROP POLICY IF EXISTS disprove_assumptions_update ON public.disprove_assumptions;
CREATE POLICY disprove_assumptions_update
  ON public.disprove_assumptions
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.plan_in_foundry(foundry_id)
    OR public.plan_is_fractional_on_goal(goal_id)
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'edit_disprove_assumption')
    OR public.plan_is_fractional_on_goal(goal_id)
  );

DROP POLICY IF EXISTS disprove_assumptions_delete ON public.disprove_assumptions;
CREATE POLICY disprove_assumptions_delete
  ON public.disprove_assumptions
  FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'edit_disprove_assumption')
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. fractional_engagements — foundry-scoped + own-engagement read
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS fractional_engagements_select ON public.fractional_engagements;
CREATE POLICY fractional_engagements_select
  ON public.fractional_engagements
  FOR SELECT
  USING (
    public.plan_in_foundry(foundry_id)
    OR EXISTS (
      SELECT 1 FROM public.fractional_executives fe
      WHERE fe.id = public.fractional_engagements.fractional_id
        AND fe.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS fractional_engagements_insert ON public.fractional_engagements;
CREATE POLICY fractional_engagements_insert
  ON public.fractional_engagements
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'invite_fractional')
  );

DROP POLICY IF EXISTS fractional_engagements_update ON public.fractional_engagements;
CREATE POLICY fractional_engagements_update
  ON public.fractional_engagements
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.plan_in_foundry(foundry_id)
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'set_capacity_retainer')
    OR public.plan_can(auth.uid(), foundry_id, 'end_engagement')
  );

DROP POLICY IF EXISTS fractional_engagements_delete ON public.fractional_engagements;
CREATE POLICY fractional_engagements_delete
  ON public.fractional_engagements
  FOR DELETE
  USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. goal_team_assignments — inherits scope from goal
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS goal_team_assignments_select ON public.goal_team_assignments;
CREATE POLICY goal_team_assignments_select
  ON public.goal_team_assignments
  FOR SELECT
  USING (
    public.plan_in_foundry(foundry_id)
    OR public.plan_is_fractional_on_goal(goal_id)
  );

DROP POLICY IF EXISTS goal_team_assignments_insert ON public.goal_team_assignments;
CREATE POLICY goal_team_assignments_insert
  ON public.goal_team_assignments
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'edit_strategic_goal')
  );

DROP POLICY IF EXISTS goal_team_assignments_update ON public.goal_team_assignments;
CREATE POLICY goal_team_assignments_update
  ON public.goal_team_assignments
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.plan_in_foundry(foundry_id)
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'edit_strategic_goal')
  );

DROP POLICY IF EXISTS goal_team_assignments_delete ON public.goal_team_assignments;
CREATE POLICY goal_team_assignments_delete
  ON public.goal_team_assignments
  FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'edit_strategic_goal')
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. history_entries — foundry-scoped. Hard DELETE forbidden at policy level
--    per §16.2 ("WITH CHECK (false)" on DELETE) / §9 notes.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS history_entries_select ON public.history_entries;
CREATE POLICY history_entries_select
  ON public.history_entries
  FOR SELECT
  USING (public.plan_in_foundry(foundry_id));

DROP POLICY IF EXISTS history_entries_insert ON public.history_entries;
CREATE POLICY history_entries_insert
  ON public.history_entries
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'add_manual_history')
  );

DROP POLICY IF EXISTS history_entries_update ON public.history_entries;
CREATE POLICY history_entries_update
  ON public.history_entries
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.plan_in_foundry(foundry_id)
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'mark_history_outcome')
    OR public.plan_can(auth.uid(), foundry_id, 'add_manual_history')
  );

-- Hard delete is forbidden at the policy level — USING (false) guarantees no
-- row matches the DELETE qualifying predicate for any non-service caller.
-- service_role still can hard-delete for admin/test cleanup.
DROP POLICY IF EXISTS history_entries_delete_forbidden ON public.history_entries;
CREATE POLICY history_entries_delete_forbidden
  ON public.history_entries
  FOR DELETE
  USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. pressure_test_sessions — foundry + fractional overlay
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS pressure_test_sessions_select ON public.pressure_test_sessions;
CREATE POLICY pressure_test_sessions_select
  ON public.pressure_test_sessions
  FOR SELECT
  USING (
    public.plan_in_foundry(foundry_id)
    OR (goal_id IS NOT NULL AND public.plan_is_fractional_on_goal(goal_id))
  );

DROP POLICY IF EXISTS pressure_test_sessions_insert ON public.pressure_test_sessions;
CREATE POLICY pressure_test_sessions_insert
  ON public.pressure_test_sessions
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'start_pressure_test')
  );

DROP POLICY IF EXISTS pressure_test_sessions_update ON public.pressure_test_sessions;
CREATE POLICY pressure_test_sessions_update
  ON public.pressure_test_sessions
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.plan_in_foundry(foundry_id)
    OR (goal_id IS NOT NULL AND public.plan_is_fractional_on_goal(goal_id))
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'close_pressure_test')
  );

DROP POLICY IF EXISTS pressure_test_sessions_delete ON public.pressure_test_sessions;
CREATE POLICY pressure_test_sessions_delete
  ON public.pressure_test_sessions
  FOR DELETE
  USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. gutcheck_sessions — foundry + fractional overlay
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS gutcheck_sessions_select ON public.gutcheck_sessions;
CREATE POLICY gutcheck_sessions_select
  ON public.gutcheck_sessions
  FOR SELECT
  USING (
    public.plan_in_foundry(foundry_id)
    OR public.plan_is_fractional_on_goal(goal_id)
  );

DROP POLICY IF EXISTS gutcheck_sessions_insert ON public.gutcheck_sessions;
CREATE POLICY gutcheck_sessions_insert
  ON public.gutcheck_sessions
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.plan_in_foundry(foundry_id)
  );

DROP POLICY IF EXISTS gutcheck_sessions_update ON public.gutcheck_sessions;
CREATE POLICY gutcheck_sessions_update
  ON public.gutcheck_sessions
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.plan_in_foundry(foundry_id)
    OR public.plan_is_fractional_on_goal(goal_id)
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'decide_gutcheck')
    OR public.plan_is_fractional_on_goal(goal_id)
  );

DROP POLICY IF EXISTS gutcheck_sessions_delete ON public.gutcheck_sessions;
CREATE POLICY gutcheck_sessions_delete
  ON public.gutcheck_sessions
  FOR DELETE
  USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. reports_sent — foundry-scoped. Send gated by plan_can('send_report').
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS reports_sent_select ON public.reports_sent;
CREATE POLICY reports_sent_select
  ON public.reports_sent
  FOR SELECT
  USING (public.plan_in_foundry(foundry_id));

DROP POLICY IF EXISTS reports_sent_insert ON public.reports_sent;
CREATE POLICY reports_sent_insert
  ON public.reports_sent
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'send_report')
  );

DROP POLICY IF EXISTS reports_sent_update ON public.reports_sent;
CREATE POLICY reports_sent_update
  ON public.reports_sent
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.plan_in_foundry(foundry_id)
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.plan_can(auth.uid(), foundry_id, 'edit_report_draft')
  );

DROP POLICY IF EXISTS reports_sent_delete ON public.reports_sent;
CREATE POLICY reports_sent_delete
  ON public.reports_sent
  FOR DELETE
  USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. specialist_recommendations — foundry-scoped.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS specialist_recommendations_select ON public.specialist_recommendations;
CREATE POLICY specialist_recommendations_select
  ON public.specialist_recommendations
  FOR SELECT
  USING (public.plan_in_foundry(foundry_id));

DROP POLICY IF EXISTS specialist_recommendations_insert ON public.specialist_recommendations;
CREATE POLICY specialist_recommendations_insert
  ON public.specialist_recommendations
  FOR INSERT
  WITH CHECK (
    -- Recs are generated by specialists (service_role/cron context); human
    -- insertion is not a supported user flow in Phase 3.
    auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS specialist_recommendations_update ON public.specialist_recommendations;
CREATE POLICY specialist_recommendations_update
  ON public.specialist_recommendations
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.plan_in_foundry(foundry_id)
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.plan_in_foundry(foundry_id)
  );

DROP POLICY IF EXISTS specialist_recommendations_delete ON public.specialist_recommendations;
CREATE POLICY specialist_recommendations_delete
  ON public.specialist_recommendations
  FOR DELETE
  USING (auth.role() = 'service_role');
