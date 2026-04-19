-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1 — Forge redesign · PR #1 — Shared primitives
-- B.7 · project_transitions per SHARED-SCHEMA §3.3
--
-- Event log of every lifecycle-stage transition on projects. Duplicates into
-- audit_log (via server actions using src/lib/audit/write.ts) for the broader
-- audit query surface.
--
-- PR #1 creates the table empty. Populated by PROMOTE_TO_FORGE / BRIEF_LOCK /
-- LAUNCH_HANDOFF / ARCHIVE server actions starting in PR #2+ (Forge) and
-- Phase 2 (Products).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_transitions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  foundry_id             text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  from_stage             text
    CHECK (from_stage IS NULL OR from_stage IN ('hypothesis', 'brief_locked', 'building', 'shipped', 'in_market', 'archived')),
  to_stage               text NOT NULL
    CHECK (to_stage IN ('hypothesis', 'brief_locked', 'building', 'shipped', 'in_market', 'archived')),
  triggered_by_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason                 text,
  carried_over_ids       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_transitions IS
  'SHARED-SCHEMA §3.3 — event log of lifecycle transitions on projects. '
  'Every row also mirrored into audit_log via server actions.';

COMMENT ON COLUMN public.project_transitions.carried_over_ids IS
  'SHARED-SCHEMA §3.3 — for PROMOTE_TO_FORGE: which hypothesis fields populated '
  'which Forge artefacts. For LAUNCH_HANDOFF: which BOM/module IDs shipped. '
  'Free-form jsonb map.';

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS project_transitions_project_idx
  ON public.project_transitions (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_transitions_foundry_idx
  ON public.project_transitions (foundry_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.project_transitions ENABLE ROW LEVEL SECURITY;

-- Foundry members can SELECT transitions. Transitions are append-only history
-- so only server actions (service_role) insert.
CREATE POLICY "project_transitions_foundry_select"
  ON public.project_transitions
  FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id
      FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
  );

CREATE POLICY "project_transitions_service_role_insert"
  ON public.project_transitions
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
