-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3 — Plan redesign · Chunk A.2 — New Plan tables
--
-- Creates the 10 new tables that back the Plan section per PLAN-SCHEMA §§1–13.
-- Dependency order: fractional_executives → strategic_goals →
--   (disprove_assumptions, fractional_engagements, goal_team_assignments,
--    history_entries, pressure_test_sessions, gutcheck_sessions,
--    reports_sent, specialist_recommendations).
--
-- Tables are all idempotent via CREATE TABLE IF NOT EXISTS.
-- RLS is ENABLED on every table; the actual SELECT/INSERT/UPDATE/DELETE
-- policies land in 20260422000300_plan_rls_policies.sql.
-- Backfill + legacy row imports land in 20260422000400_plan_backfill.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. fractional_executives · PLAN-SCHEMA §6
-- Human fractional pool. One row per person; potentially shared across
-- foundries via fractional_engagements. NO foundry_id column.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.fractional_executives (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name             text NOT NULL,
  email                    text NOT NULL UNIQUE,
  specialisation           public.fractional_specialisation NOT NULL,
  bio_short                text NULL,
  bio_long                 text NULL,
  avatar_gradient          text NULL,
  network_listed           boolean NOT NULL DEFAULT false,
  default_retainer_monthly integer NULL,
  default_hours_weekly     smallint NULL,
  response_time_avg_hours  numeric NULL,
  reply_rate               numeric NULL CHECK (reply_rate IS NULL OR (reply_rate >= 0 AND reply_rate <= 1)),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fractional_executives_user_id_idx
  ON public.fractional_executives (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fractional_executives_specialisation_listed_idx
  ON public.fractional_executives (specialisation, network_listed);

DROP TRIGGER IF EXISTS fractional_executives_set_updated_at ON public.fractional_executives;
CREATE TRIGGER fractional_executives_set_updated_at
  BEFORE UPDATE ON public.fractional_executives
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.fractional_executives ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.fractional_executives IS
  'PLAN-SCHEMA §6 — fractional-person records. Shared across foundries via '
  'fractional_engagements. network_listed=true rows visible to all authenticated '
  'users (Fractional Forge network); =false visible only to foundries with an '
  'active engagement.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. strategic_goals · PLAN-SCHEMA §1
-- Top-level Strategic Goal — pinnable (3 slots per foundry), quarter-scoped.
-- source_objective_id is the §A.4 backfill anchor (UNIQUE) — lets the
-- objectives→strategic_goals backfill stay idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.strategic_goals (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id              text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  title                   text NOT NULL,
  description             text NULL,
  state                   public.goal_state NOT NULL DEFAULT 'draft',
  is_pinned               boolean NOT NULL DEFAULT false,
  pin_order               smallint NULL CHECK (pin_order IS NULL OR (pin_order BETWEEN 1 AND 3)),
  quarter                 text NOT NULL,
  milestone_date          date NOT NULL,
  started_at              date NULL,
  lead_user_id            uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_fractional_id      uuid NULL REFERENCES public.fractional_executives(id) ON DELETE SET NULL,
  lead_specialist_slug    text NULL,
  purpose_connection      text NULL,
  state_overridden_until  timestamptz NULL,
  source_objective_id     uuid NULL UNIQUE REFERENCES public.objectives(id) ON DELETE SET NULL,
  created_by              uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz NULL,
  -- Exactly one lead reference must be non-null
  CONSTRAINT strategic_goals_exactly_one_lead CHECK (
    (
      (CASE WHEN lead_user_id         IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN lead_fractional_id   IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN lead_specialist_slug IS NOT NULL THEN 1 ELSE 0 END)
    ) = 1
  ),
  -- Pin slot requires pin_order; unpinned rows cannot have pin_order
  CONSTRAINT strategic_goals_pin_slot_coherent CHECK (
    (is_pinned = true  AND pin_order IS NOT NULL) OR
    (is_pinned = false AND pin_order IS NULL)
  )
);

-- Partial unique index to enforce exactly one goal per pin slot per foundry
CREATE UNIQUE INDEX IF NOT EXISTS strategic_goals_pin_slot
  ON public.strategic_goals (foundry_id, pin_order)
  WHERE is_pinned = true AND deleted_at IS NULL;

-- Pinned view for the Plan workspace hero
CREATE INDEX IF NOT EXISTS strategic_goals_foundry_pinned_idx
  ON public.strategic_goals (foundry_id, is_pinned, pin_order);

-- State + milestone query (at-risk / off-track surfacing)
CREATE INDEX IF NOT EXISTS strategic_goals_foundry_state_milestone_idx
  ON public.strategic_goals (foundry_id, state, milestone_date);

-- Soft-delete scope filter
CREATE INDEX IF NOT EXISTS strategic_goals_foundry_live_idx
  ON public.strategic_goals (foundry_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS strategic_goals_set_updated_at ON public.strategic_goals;
CREATE TRIGGER strategic_goals_set_updated_at
  BEFORE UPDATE ON public.strategic_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.strategic_goals ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.strategic_goals IS
  'PLAN-SCHEMA §1 — Strategic Goals. Up to 3 pinned per foundry (partial '
  'unique index strategic_goals_pin_slot). source_objective_id is the '
  '§A.4 backfill anchor linking each backfilled goal to its legacy '
  'objectives.id — idempotency lives on the UNIQUE constraint.';
COMMENT ON COLUMN public.strategic_goals.source_objective_id IS
  'PLAN-SCHEMA §A.4 — UNIQUE FK to objectives.id so the one-time '
  'is_strategic_goal=true backfill stays idempotent on re-run.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. disprove_assumptions · PLAN-SCHEMA §2
-- The 3-assumption disprove test per Strategic Goal.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.disprove_assumptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id         text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  goal_id            uuid NOT NULL REFERENCES public.strategic_goals(id) ON DELETE CASCADE,
  order_index        smallint NOT NULL CHECK (order_index BETWEEN 1 AND 5),
  assumption         text NOT NULL,
  current_state      public.assumption_state NOT NULL DEFAULT 'unknown',
  last_refreshed_at  timestamptz NULL,
  refreshed_by       text NULL CHECK (refreshed_by IS NULL OR refreshed_by IN ('auto_specialist','founder','gutcheck')),
  fresh_data_json    jsonb NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT disprove_assumptions_goal_order_uniq UNIQUE (goal_id, order_index)
);

CREATE INDEX IF NOT EXISTS disprove_assumptions_goal_idx
  ON public.disprove_assumptions (goal_id, order_index);

CREATE INDEX IF NOT EXISTS disprove_assumptions_foundry_broken_idx
  ON public.disprove_assumptions (foundry_id, current_state)
  WHERE current_state IN ('broken','slipping');

DROP TRIGGER IF EXISTS disprove_assumptions_set_updated_at ON public.disprove_assumptions;
CREATE TRIGGER disprove_assumptions_set_updated_at
  BEFORE UPDATE ON public.disprove_assumptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.disprove_assumptions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.disprove_assumptions IS
  'PLAN-SCHEMA §2 — per-goal disprove test (3 assumptions typical, 5 max). '
  'current_state transitions feed event_log on broken per §14.1.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. fractional_engagements · PLAN-SCHEMA §7
-- Per-foundry relationship record. fractional_executives is the person;
-- fractional_engagements is the engagement.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.fractional_engagements (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id                text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  fractional_id             uuid NOT NULL REFERENCES public.fractional_executives(id) ON DELETE CASCADE,
  role_in_foundry           text NOT NULL,
  hours_per_week            smallint NOT NULL CHECK (hours_per_week > 0),
  hours_used_this_week      numeric NOT NULL DEFAULT 0 CHECK (hours_used_this_week >= 0),
  retainer_monthly          integer NOT NULL CHECK (retainer_monthly >= 0),
  started_on                date NOT NULL,
  ended_on                  date NULL,
  status                    public.engagement_status NOT NULL DEFAULT 'pending_accept',
  working_style             public.working_style NOT NULL DEFAULT 'blended',
  notice_period_days        smallint NOT NULL DEFAULT 30 CHECK (notice_period_days >= 0),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fractional_engagements_foundry_status_idx
  ON public.fractional_engagements (foundry_id, status);

CREATE INDEX IF NOT EXISTS fractional_engagements_fractional_idx
  ON public.fractional_engagements (fractional_id);

CREATE INDEX IF NOT EXISTS fractional_engagements_ending_soon_idx
  ON public.fractional_engagements (ended_on)
  WHERE ended_on IS NOT NULL;

DROP TRIGGER IF EXISTS fractional_engagements_set_updated_at ON public.fractional_engagements;
CREATE TRIGGER fractional_engagements_set_updated_at
  BEFORE UPDATE ON public.fractional_engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.fractional_engagements ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.fractional_engagements IS
  'PLAN-SCHEMA §7 — per-foundry fractional relationship. hours_used_this_week '
  'reset by cron Monday 00:00 UTC via /api/cron/fractional-capacity-reset.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. goal_team_assignments · PLAN-SCHEMA §8
-- Who is on which goal (user / fractional / specialist / observer).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.goal_team_assignments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id        text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  goal_id           uuid NOT NULL REFERENCES public.strategic_goals(id) ON DELETE CASCADE,
  assignee_type     public.assignee_type NOT NULL,
  user_id           uuid NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fractional_id     uuid NULL REFERENCES public.fractional_executives(id) ON DELETE CASCADE,
  specialist_slug   text NULL,
  role_on_goal      text NOT NULL DEFAULT 'supporting'
    CHECK (role_on_goal IN ('lead','supporting','reviewer','observer')),
  added_at          timestamptz NOT NULL DEFAULT now(),
  added_by          uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goal_team_assignments_exactly_one_assignee CHECK (
    (
      (CASE WHEN user_id         IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN fractional_id   IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN specialist_slug IS NOT NULL THEN 1 ELSE 0 END)
    ) = 1
  ),
  CONSTRAINT goal_team_assignments_type_matches CHECK (
    (assignee_type = 'user'        AND user_id         IS NOT NULL) OR
    (assignee_type = 'fractional'  AND fractional_id   IS NOT NULL) OR
    (assignee_type = 'specialist'  AND specialist_slug IS NOT NULL) OR
    (assignee_type = 'observer'    AND user_id         IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS goal_team_assignments_goal_idx
  ON public.goal_team_assignments (goal_id);

CREATE INDEX IF NOT EXISTS goal_team_assignments_fractional_idx
  ON public.goal_team_assignments (fractional_id)
  WHERE fractional_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS goal_team_assignments_specialist_idx
  ON public.goal_team_assignments (specialist_slug)
  WHERE specialist_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS goal_team_assignments_user_idx
  ON public.goal_team_assignments (user_id)
  WHERE user_id IS NOT NULL;

DROP TRIGGER IF EXISTS goal_team_assignments_set_updated_at ON public.goal_team_assignments;
CREATE TRIGGER goal_team_assignments_set_updated_at
  BEFORE UPDATE ON public.goal_team_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.goal_team_assignments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.goal_team_assignments IS
  'PLAN-SCHEMA §8 — who is on each goal. Exactly one of '
  '{user_id, fractional_id, specialist_slug} must be non-null. '
  'Used by fractional RLS overlay in plan_rls_policies.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. history_entries · PLAN-SCHEMA §9
-- Auto-populated decision/event log. Hard-delete forbidden (RLS §16.2).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.history_entries (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id           text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  entry_type           public.history_entry_type NOT NULL,
  title                text NOT NULL,
  body                 text NULL,
  actor_type           public.actor_type NOT NULL,
  actor_id             text NULL,
  goal_id              uuid NULL REFERENCES public.strategic_goals(id) ON DELETE SET NULL,
  related_ids_json     jsonb NULL,
  outcome              public.outcome_state NULL,
  outcome_note         text NULL,
  outcome_revisit_at   timestamptz NULL,
  alternatives_json    jsonb NULL,
  grounding_text       text NULL,
  edit_log_json        jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS history_entries_foundry_type_created_idx
  ON public.history_entries (foundry_id, entry_type, created_at DESC);

CREATE INDEX IF NOT EXISTS history_entries_goal_idx
  ON public.history_entries (goal_id)
  WHERE goal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS history_entries_related_ids_gin_idx
  ON public.history_entries USING gin (related_ids_json);

CREATE INDEX IF NOT EXISTS history_entries_fts_idx
  ON public.history_entries
  USING gin (to_tsvector('english', title || ' ' || coalesce(body, '')));

CREATE INDEX IF NOT EXISTS history_entries_outcome_revisit_idx
  ON public.history_entries (outcome_revisit_at)
  WHERE outcome_revisit_at IS NOT NULL;

DROP TRIGGER IF EXISTS history_entries_set_updated_at ON public.history_entries;
CREATE TRIGGER history_entries_set_updated_at
  BEFORE UPDATE ON public.history_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.history_entries ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.history_entries IS
  'PLAN-SCHEMA §9 — auto-populated decision/event log. Hard delete forbidden '
  'at RLS policy level. body edits allowed <5 min post-creation; afterwards '
  'append to edit_log_json.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. pressure_test_sessions · PLAN-SCHEMA §10
-- Red-team debate artefacts. Replaces report_snapshots[report_type=red-team-debate]
-- going forward; legacy rows backfilled in 20260422000400_plan_backfill.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pressure_test_sessions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id                  text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  goal_id                     uuid NULL REFERENCES public.strategic_goals(id) ON DELETE SET NULL,
  subject_type                public.pressure_subject_type NOT NULL,
  subject_ref                 uuid NULL,
  subject_snapshot            jsonb NOT NULL,
  personas_used               text[] NOT NULL DEFAULT ARRAY[]::text[],
  human_reviewers_json        jsonb NULL,
  rounds                      smallint NOT NULL DEFAULT 0 CHECK (rounds >= 0),
  transcript_json             jsonb NOT NULL DEFAULT '[]'::jsonb,
  tensions_json               jsonb NULL,
  verdict                     public.pressure_verdict NULL,
  verdict_body                text NULL,
  recommended_actions_json    jsonb NULL,
  legacy_report_snapshot_id   uuid NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Idempotency anchor: one pressure_test_session per legacy report_snapshot
CREATE UNIQUE INDEX IF NOT EXISTS pressure_test_sessions_legacy_snapshot_uniq
  ON public.pressure_test_sessions (legacy_report_snapshot_id)
  WHERE legacy_report_snapshot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pressure_test_sessions_foundry_goal_created_idx
  ON public.pressure_test_sessions (foundry_id, goal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pressure_test_sessions_unverdicted_idx
  ON public.pressure_test_sessions (foundry_id, created_at DESC)
  WHERE verdict IS NULL;

DROP TRIGGER IF EXISTS pressure_test_sessions_set_updated_at ON public.pressure_test_sessions;
CREATE TRIGGER pressure_test_sessions_set_updated_at
  BEFORE UPDATE ON public.pressure_test_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pressure_test_sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.pressure_test_sessions IS
  'PLAN-SCHEMA §10 — red-team debate artefacts. SSE source /api/red-team/generate '
  'writes here canonically; dual-write to report_snapshots during transition. '
  'legacy_report_snapshot_id (UNIQUE partial) anchors the one-time backfill.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. gutcheck_sessions · PLAN-SCHEMA §11
-- Mid-quarter gutcheck events.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.gutcheck_sessions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id                text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  goal_id                   uuid NOT NULL REFERENCES public.strategic_goals(id) ON DELETE CASCADE,
  fired_at                  timestamptz NOT NULL DEFAULT now(),
  triggered_by              text NOT NULL CHECK (triggered_by IN ('cron_week6','manual','calendar')),
  assumption_states_json    jsonb NOT NULL DEFAULT '[]'::jsonb,
  cal_narrative             text NULL,
  human_narrative           text NULL,
  decision                  public.gutcheck_decision NULL,
  decision_note             text NULL,
  decided_at                timestamptz NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  -- decision and decided_at move together
  CONSTRAINT gutcheck_sessions_decision_coherent CHECK (
    (decision IS NULL     AND decided_at IS NULL) OR
    (decision IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS gutcheck_sessions_foundry_goal_fired_idx
  ON public.gutcheck_sessions (foundry_id, goal_id, fired_at DESC);

CREATE INDEX IF NOT EXISTS gutcheck_sessions_pending_decision_idx
  ON public.gutcheck_sessions (foundry_id, fired_at DESC)
  WHERE decision IS NULL;

DROP TRIGGER IF EXISTS gutcheck_sessions_set_updated_at ON public.gutcheck_sessions;
CREATE TRIGGER gutcheck_sessions_set_updated_at
  BEFORE UPDATE ON public.gutcheck_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.gutcheck_sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.gutcheck_sessions IS
  'PLAN-SCHEMA §11 — mid-quarter gutcheck events. Fired by cron_week6, manual '
  'or calendar; founder decides kill/pivot/double_down (events §14.1).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. reports_sent · PLAN-SCHEMA §12
-- Every Report the founder has shipped.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.reports_sent (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id                      text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  target_type                     public.report_target NOT NULL,
  subject_line                    text NOT NULL,
  body_html                       text NULL,
  body_markdown                   text NULL,
  pulled_from_json                jsonb NOT NULL DEFAULT '{}'::jsonb,
  recipients_json                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_via                        text[] NOT NULL DEFAULT ARRAY[]::text[],
  sent_at                         timestamptz NOT NULL DEFAULT now(),
  pressure_tested_before_send     boolean NOT NULL DEFAULT false,
  pressure_test_session_id        uuid NULL REFERENCES public.pressure_test_sessions(id) ON DELETE SET NULL,
  draft_by                        public.report_draft_by NOT NULL DEFAULT 'founder',
  edits_count                     smallint NOT NULL DEFAULT 0 CHECK (edits_count >= 0),
  external_share_url              text NULL,
  link_expires_at                 timestamptz NULL,
  open_count                      integer NOT NULL DEFAULT 0 CHECK (open_count >= 0),
  reply_count                     integer NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
  legacy_report_snapshot_id       uuid NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_sent_foundry_target_sent_idx
  ON public.reports_sent (foundry_id, target_type, sent_at DESC);

CREATE INDEX IF NOT EXISTS reports_sent_foundry_sent_idx
  ON public.reports_sent (foundry_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS reports_sent_legacy_snapshot_idx
  ON public.reports_sent (legacy_report_snapshot_id)
  WHERE legacy_report_snapshot_id IS NOT NULL;

DROP TRIGGER IF EXISTS reports_sent_set_updated_at ON public.reports_sent;
CREATE TRIGGER reports_sent_set_updated_at
  BEFORE UPDATE ON public.reports_sent
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.reports_sent ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.reports_sent IS
  'PLAN-SCHEMA §12 — every founder-shipped Report. Additive to report_snapshots '
  'during transition — new sends dual-write for 30+ days post-launch.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. specialist_recommendations · PLAN-SCHEMA §13
-- Every proactive specialist suggestion + accept/reject lifecycle.
-- Drives the "reversal rate" stat on History.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.specialist_recommendations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id         text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  specialist_slug    text NOT NULL,
  context_type       public.rec_context_type NOT NULL,
  context_ref        uuid NULL,
  summary            text NOT NULL,
  body               text NOT NULL,
  grounding_text     text NOT NULL,
  confidence         public.rec_confidence NOT NULL,
  status             public.rec_status NOT NULL DEFAULT 'pending',
  expires_at         timestamptz NULL,
  durable            boolean NOT NULL DEFAULT false,
  responded_at       timestamptz NULL,
  responded_note     text NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS specialist_recommendations_foundry_status_created_idx
  ON public.specialist_recommendations (foundry_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS specialist_recommendations_specialist_status_idx
  ON public.specialist_recommendations (specialist_slug, status);

CREATE INDEX IF NOT EXISTS specialist_recommendations_expiring_idx
  ON public.specialist_recommendations (expires_at)
  WHERE expires_at IS NOT NULL AND durable = false AND status = 'pending';

DROP TRIGGER IF EXISTS specialist_recommendations_set_updated_at ON public.specialist_recommendations;
CREATE TRIGGER specialist_recommendations_set_updated_at
  BEFORE UPDATE ON public.specialist_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.specialist_recommendations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.specialist_recommendations IS
  'PLAN-SCHEMA §13 — proactive specialist suggestions with accept/reject '
  'lifecycle. expires_at defaults to created_at + 72h in the server action '
  'unless durable=true (§17.4). Drives reversal-rate stat on History.';
