-- ============================================================
-- pipeline_runs — specialist pipeline observability row
-- ============================================================
--
-- INTENT: Every invocation of a SPECIALISTS entry across CAD Lab / V2 /
-- Money / Plan etc. lands here with durable status, token counts and cost.
-- Source-of-truth for "is Max still decomposing?", "why did Fang fail on
-- module 7?", "how much did we spend on Finn's last rollup?". The JSONB
-- artefact columns on cad_lab_projects (modules, reviews, ai_cost_estimates)
-- stay the source of truth for WHAT the specialist produced; pipeline_runs
-- is WHEN / WHY / HOW-MUCH.
--
-- Design anchor: /tmp/forge-v2-pipeline-arch/PIPELINE-ARCHITECTURE.md §3b.
-- Brief may have trimmed a couple of columns (run_kind → stage, etc.) —
-- column names below follow the agent brief (stage/trigger/cost_gbp_pence).
--
-- SECURITY:
--   • RLS ENABLED. SELECT is scoped to the caller's active foundry
--     memberships. INSERT + UPDATE are blocked at the policy level (WITH
--     CHECK false) — only the service role may write, via
--     src/actions/pipeline-runs.ts. This matches the "server actions only"
--     pattern we use for billing-adjacent tables.
--   • foundry_id is text (matches foundries.id — see MEMORY.md gotcha).
--   • triggered_by uses profiles(id) to tie back to the acting user.

CREATE TABLE public.pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES public.cad_lab_projects(id) ON DELETE CASCADE,
  specialist_id text NOT NULL,  -- matches SpecialistId in specialists-config.ts
  stage text NOT NULL,           -- 'research.seed' / 'brief.decompose' / 'bom.generate' etc.
  trigger text NOT NULL,         -- 'manual' | 'auto.brief-lock' | 'auto.module-approve' | 'scheduled'
  status text NOT NULL DEFAULT 'queued',  -- queued | running | done | failed | cancelled
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  model_provider text NULL,       -- 'anthropic' | 'deepseek' | 'openai' | 'gemini'
  model_id text NULL,
  input_tokens integer NULL,
  output_tokens integer NULL,
  cost_gbp_pence integer NULL,
  error_code text NULL,           -- short machine code, e.g. 'BUDGET_CAPPED' | 'PROVIDER_400'
  error_message text NULL,        -- human message
  input_ref jsonb NULL,           -- what was fed in (small pointer, not full payload)
  output_ref jsonb NULL,          -- where the output landed (e.g. cad_lab_projects.modules)
  triggered_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes tuned for the read patterns we know about today:
--   • UI polling on project_id to render status chips
--   • Foundry-scoped dashboards / billing rollups
--   • Worker "give me the next thing to pick up" → partial index on active statuses
--   • Specialist-history views ("show me the last 10 Finn cost runs across projects")
CREATE INDEX idx_pipeline_runs_project_id ON public.pipeline_runs(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_pipeline_runs_foundry_id ON public.pipeline_runs(foundry_id);
CREATE INDEX idx_pipeline_runs_status ON public.pipeline_runs(status) WHERE status IN ('queued','running');
CREATE INDEX idx_pipeline_runs_specialist_stage ON public.pipeline_runs(specialist_id, stage, created_at DESC);

ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

-- SELECT: same foundry. Service role bypasses RLS entirely.
-- NOTE: brief DDL referenced foundry_memberships.profile_id but the column
-- is user_id (see migration 20260206400000_multi_foundry_support.sql). Using
-- user_id to match the actual schema — same semantics, it's an FK to profiles.id.
CREATE POLICY pipeline_runs_select ON public.pipeline_runs
  FOR SELECT USING (
    foundry_id IN (SELECT foundry_id FROM public.foundry_memberships
                   WHERE user_id = auth.uid() AND active = true)
  );

-- INSERT: server actions only (service role). No client inserts.
CREATE POLICY pipeline_runs_insert ON public.pipeline_runs
  FOR INSERT WITH CHECK (false);

-- UPDATE: server actions only.
CREATE POLICY pipeline_runs_update ON public.pipeline_runs
  FOR UPDATE USING (false);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.set_pipeline_runs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER set_pipeline_runs_updated_at_trg
  BEFORE UPDATE ON public.pipeline_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_pipeline_runs_updated_at();

COMMENT ON TABLE public.pipeline_runs IS 'Specialist pipeline observability. Every invocation of a SPECIALISTS entry lands here with status, tokens, cost.';
