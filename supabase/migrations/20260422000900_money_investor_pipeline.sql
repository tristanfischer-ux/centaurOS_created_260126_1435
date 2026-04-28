-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Money redesign · Chunk 1C · investor_pipeline_state + investor_pipeline_events
-- MONEY-SCHEMA.md §2 · investor_pipeline_state, investor_pipeline_events
--
-- Event-sourced pipeline per ambiguity resolution #3:
--   - investor_pipeline_events: append-only log (source of truth)
--   - investor_pipeline_state: denormalised current-state column maintained
--     by a Postgres trigger (NOT a materialised view — red-team #5 fix).
--
-- Trigger on investor_pipeline_events INSERT updates current_stage +
-- stage_entered_at on the parent state row.
--
-- isAttentionWorthy gate (src/lib/money/attention-worthy.ts — Chunk 2A)
-- decides which events also write event_log. This migration does NOT
-- write event_log — that's application-layer.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── investor_pipeline_state ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.investor_pipeline_state (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id                   text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  round_id                     uuid REFERENCES public.investor_round(id) ON DELETE SET NULL,
  investor_firm_id             uuid,
  investor_person_id           uuid,
  marketplace_listing_id       uuid,
  current_stage                text NOT NULL
                                 CHECK (current_stage IN
                                   ('target','researching','contacted','meeting',
                                    'due_diligence','verbal','closed','passed')),
  stage_entered_at             timestamptz NOT NULL DEFAULT now(),
  probability_pct              smallint
                                 CHECK (probability_pct IS NULL OR probability_pct BETWEEN 0 AND 100),
  commit_amount_cents          bigint,
  lead_role                    text
                                 CHECK (lead_role IS NULL OR lead_role IN
                                   ('lead','co_lead','follower','undecided')),
  pass_reason                  text,
  warm_intro_via_user_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  match_score_cached           smallint
                                 CHECK (match_score_cached IS NULL OR
                                   match_score_cached BETWEEN 0 AND 100),
  match_score_computed_at      timestamptz,
  match_score_thesis_version   integer,
  legacy_source_table          text,
  legacy_source_id             uuid,
  archived_at                  timestamptz,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.investor_pipeline_state IS
  'MONEY-SCHEMA §2 · current pipeline state per investor per foundry. '
  'Denormalised current_stage maintained by trigger on investor_pipeline_events '
  'INSERT. NOT a materialised view (red-team #5).';

COMMENT ON COLUMN public.investor_pipeline_state.legacy_source_table IS
  'MONEY-SCHEMA §5.2 — which legacy investor table this row migrated from '
  '(investor_alerts / investor_shortlist). Null for net-new rows.';

CREATE INDEX IF NOT EXISTS investor_pipeline_state_foundry_stage_idx
  ON public.investor_pipeline_state (foundry_id, current_stage)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS investor_pipeline_state_round_idx
  ON public.investor_pipeline_state (round_id, current_stage)
  WHERE archived_at IS NULL AND round_id IS NOT NULL;

-- Prevent double-entry of the same investor in the same round
CREATE UNIQUE INDEX IF NOT EXISTS investor_pipeline_state_unique_per_round
  ON public.investor_pipeline_state (foundry_id, round_id, marketplace_listing_id)
  WHERE archived_at IS NULL
    AND round_id IS NOT NULL
    AND marketplace_listing_id IS NOT NULL;

DROP TRIGGER IF EXISTS investor_pipeline_state_set_updated_at ON public.investor_pipeline_state;
CREATE TRIGGER investor_pipeline_state_set_updated_at
  BEFORE UPDATE ON public.investor_pipeline_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.investor_pipeline_state ENABLE ROW LEVEL SECURITY;

-- SELECT: Founder + Executive + read-only observer. Advisor can see.
-- Apprentice + AI_Agent + Supplier cannot (per §4 matrix).
CREATE POLICY investor_pipeline_state_foundry_select
  ON public.investor_pipeline_state FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
        AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  );

CREATE POLICY investor_pipeline_state_foundry_write
  ON public.investor_pipeline_state FOR ALL
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  )
  WITH CHECK (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  );

-- ── investor_pipeline_events (append-only log) ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.investor_pipeline_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id            text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  pipeline_state_id     uuid NOT NULL
                          REFERENCES public.investor_pipeline_state(id) ON DELETE CASCADE,
  event_type            text NOT NULL
                          CHECK (event_type IN
                            ('stage_move','touch_logged','pass','reopen',
                             'note_added','doc_shared','view_recorded','news_logged')),
  from_stage            text,
  to_stage              text,
  payload               jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  backdated_to          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.investor_pipeline_events IS
  'MONEY-SCHEMA §2 · append-only event log for pipeline moves + touches. '
  'Source of truth for investor_pipeline_state.current_stage (via trigger).';

CREATE INDEX IF NOT EXISTS investor_pipeline_events_state_idx
  ON public.investor_pipeline_events (pipeline_state_id, created_at);

CREATE INDEX IF NOT EXISTS investor_pipeline_events_foundry_type_idx
  ON public.investor_pipeline_events (foundry_id, event_type, created_at DESC);

ALTER TABLE public.investor_pipeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY investor_pipeline_events_foundry_select
  ON public.investor_pipeline_events FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
        AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  );

-- INSERT via server actions only (service_role bypasses RLS).
CREATE POLICY investor_pipeline_events_foundry_insert
  ON public.investor_pipeline_events FOR INSERT
  WITH CHECK (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  );

-- Append-only: no UPDATE/DELETE policy → blocked for non-service-role.

-- ── Trigger: update investor_pipeline_state on event INSERT ─────────────────
-- Red-team #5 fix: trigger-maintained column, NOT a materialised view.

CREATE OR REPLACE FUNCTION public.investor_pipeline_update_current_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_type = 'stage_move' AND NEW.to_stage IS NOT NULL THEN
    UPDATE public.investor_pipeline_state
    SET current_stage = NEW.to_stage,
        stage_entered_at = COALESCE(NEW.backdated_to, NEW.created_at),
        updated_at = now()
    WHERE id = NEW.pipeline_state_id;
  ELSIF NEW.event_type = 'pass' THEN
    UPDATE public.investor_pipeline_state
    SET current_stage = 'passed',
        stage_entered_at = COALESCE(NEW.backdated_to, NEW.created_at),
        pass_reason = COALESCE(NEW.payload->>'reason', pass_reason),
        updated_at = now()
    WHERE id = NEW.pipeline_state_id;
  ELSIF NEW.event_type = 'reopen' AND NEW.to_stage IS NOT NULL THEN
    UPDATE public.investor_pipeline_state
    SET current_stage = NEW.to_stage,
        stage_entered_at = COALESCE(NEW.backdated_to, NEW.created_at),
        pass_reason = NULL,
        updated_at = now()
    WHERE id = NEW.pipeline_state_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS investor_pipeline_events_update_state
  ON public.investor_pipeline_events;

CREATE TRIGGER investor_pipeline_events_update_state
  AFTER INSERT ON public.investor_pipeline_events
  FOR EACH ROW
  EXECUTE FUNCTION public.investor_pipeline_update_current_state();
