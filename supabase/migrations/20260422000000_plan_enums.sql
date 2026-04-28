-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3 — Plan redesign · Chunk A.1 — Enum types
--
-- Defines 17 enum types owned by the Plan section, per PLAN-SCHEMA §§1–13 + §19.
-- All enums are idempotent via DO blocks with duplicate_object exception handling,
-- so this migration can be re-run safely.
--
-- These types back columns in the 10 Plan tables landed in 20260422000100 and
-- the fractional overlays landed in 20260422000300.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. goal_state (strategic_goals.state) · PLAN-SCHEMA §1 ──────────────────
DO $$ BEGIN
  CREATE TYPE public.goal_state AS ENUM (
    'draft',
    'active',
    'at_risk',
    'off_track',
    'on_track',
    'killed',
    'pivoted',
    'completed'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 2. assumption_state (disprove_assumptions.current_state) · §2 ───────────
DO $$ BEGIN
  CREATE TYPE public.assumption_state AS ENUM (
    'holding',
    'slipping',
    'broken',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 3. fractional_specialisation (fractional_executives.specialisation) · §6 ─
DO $$ BEGIN
  CREATE TYPE public.fractional_specialisation AS ENUM (
    'fundraising',
    'legal',
    'cto',
    'people',
    'cfo',
    'marketing',
    'product',
    'sales',
    'operations',
    'advisory',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 4. engagement_status (fractional_engagements.status) · §7 ───────────────
DO $$ BEGIN
  CREATE TYPE public.engagement_status AS ENUM (
    'pending_accept',
    'active',
    'ended',
    'on_hold'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 5. working_style (fractional_engagements.working_style) · §7 ────────────
DO $$ BEGIN
  CREATE TYPE public.working_style AS ENUM (
    'proactive',
    'responsive',
    'blended'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 6. assignee_type (goal_team_assignments.assignee_type) · §8 ─────────────
DO $$ BEGIN
  CREATE TYPE public.assignee_type AS ENUM (
    'user',
    'fractional',
    'specialist',
    'observer'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 7. history_entry_type (history_entries.entry_type) · §9 ─────────────────
DO $$ BEGIN
  CREATE TYPE public.history_entry_type AS ENUM (
    'decision',
    'pressure_test',
    'update_sent',
    'goal_pinned',
    'goal_state_changed',
    'specialist_rec_accepted',
    'specialist_rec_rejected',
    'gutcheck_outcome',
    'manual'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 8. actor_type (history_entries.actor_type) · §9 ─────────────────────────
DO $$ BEGIN
  CREATE TYPE public.actor_type AS ENUM (
    'founder',
    'fractional',
    'specialist',
    'system'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 9. outcome_state (history_entries.outcome) · §9 ─────────────────────────
DO $$ BEGIN
  CREATE TYPE public.outcome_state AS ENUM (
    'positive',
    'negative',
    'pending',
    'neutral'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 10. pressure_subject_type (pressure_test_sessions.subject_type) · §10 ───
DO $$ BEGIN
  CREATE TYPE public.pressure_subject_type AS ENUM (
    'goal',
    'objective',
    'report_draft',
    'custom'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 11. pressure_verdict (pressure_test_sessions.verdict) · §10 ─────────────
DO $$ BEGIN
  CREATE TYPE public.pressure_verdict AS ENUM (
    'proceed',
    'proceed_with_mitigations',
    'pivot',
    'kill',
    'inconclusive'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 12. gutcheck_decision (gutcheck_sessions.decision) · §11 ────────────────
DO $$ BEGIN
  CREATE TYPE public.gutcheck_decision AS ENUM (
    'kill',
    'pivot',
    'double_down',
    'dismissed',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 13. report_target (reports_sent.target_type) · §12 ──────────────────────
DO $$ BEGIN
  CREATE TYPE public.report_target AS ENUM (
    'weekly_team',
    'monthly_investor',
    'quarterly_board',
    'custom'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 14. report_draft_by (reports_sent.draft_by) · §12 ───────────────────────
DO $$ BEGIN
  CREATE TYPE public.report_draft_by AS ENUM (
    'cal',
    'founder'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 15. rec_context_type (specialist_recommendations.context_type) · §13 ────
DO $$ BEGIN
  CREATE TYPE public.rec_context_type AS ENUM (
    'goal',
    'objective',
    'task',
    'gutcheck',
    'pressure_test',
    'report'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 16. rec_confidence (specialist_recommendations.confidence) · §13 ────────
DO $$ BEGIN
  CREATE TYPE public.rec_confidence AS ENUM (
    'low',
    'medium',
    'high',
    'very_high'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 17. rec_status (specialist_recommendations.status) · §13 ────────────────
DO $$ BEGIN
  CREATE TYPE public.rec_status AS ENUM (
    'pending',
    'accepted',
    'edited_accepted',
    'rejected',
    'ignored',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
