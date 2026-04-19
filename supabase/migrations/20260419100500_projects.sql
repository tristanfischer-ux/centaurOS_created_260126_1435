-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1 — Forge redesign · PR #1 — Shared primitives
-- B.6 · projects — Products ↔ Forge lifecycle spine per SHARED-SCHEMA §3
--
-- Represents a single idea → build → ship lifecycle. The single most important
-- cross-section entity: Products surfaces edit the row during `hypothesis`,
-- ownership flips to Forge at `brief_locked`, to Operations at `shipped`.
--
-- Distinct from existing `products` table (which is the marketplace offerings).
-- Naming discussed + confirmed in PHASE-PLAN / SHARED-SCHEMA.
--
-- PR #1 creates the table empty. PR #2+ Forge routes populate it. Phase 2
-- Products routes populate the `hypothesis_id` forward reference (hypotheses
-- table doesn't exist yet — column is nullable uuid without FK for now; FK
-- added in Phase 2 after hypotheses table lands).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.projects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id          text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  name                text NOT NULL,
  slug                text NOT NULL,
  lifecycle_stage     text NOT NULL DEFAULT 'hypothesis'
    CHECK (lifecycle_stage IN ('hypothesis', 'brief_locked', 'building', 'shipped', 'in_market', 'archived')),
  canonical_surface   text NOT NULL DEFAULT 'products'
    CHECK (canonical_surface IN ('products', 'forge', 'operations')),
  hypothesis_id       uuid,  -- FK to hypotheses(id) added in Phase 2
  brief_locked_at     timestamptz,
  shipped_at          timestamptz,
  archived_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (foundry_id, slug)
);

COMMENT ON TABLE public.projects IS
  'SHARED-SCHEMA §3 — lifecycle spine for the Products ↔ Forge handoff. '
  'Distinct from public.products (marketplace offerings).';

COMMENT ON COLUMN public.projects.canonical_surface IS
  'SHARED-SCHEMA §3.4 — where writes are canonical. Derived from lifecycle_stage '
  'but denormalised for quick RLS checks in section-specific server actions.';

COMMENT ON COLUMN public.projects.hypothesis_id IS
  'SHARED-SCHEMA §3.1 — Phase 2 will add FK to hypotheses(id). Nullable for '
  'projects born in Forge without a Products hypothesis.';

-- ── 2. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS projects_foundry_stage_idx
  ON public.projects (foundry_id, lifecycle_stage);

CREATE INDEX IF NOT EXISTS projects_foundry_surface_idx
  ON public.projects (foundry_id, canonical_surface);

CREATE INDEX IF NOT EXISTS projects_hypothesis_idx
  ON public.projects (hypothesis_id)
  WHERE hypothesis_id IS NOT NULL;

-- ── 3. updated_at trigger ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS projects_set_updated_at ON public.projects;

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── 4. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_foundry_all"
  ON public.projects
  FOR ALL
  USING (
    foundry_id IN (
      SELECT fm.foundry_id
      FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
  )
  WITH CHECK (
    foundry_id IN (
      SELECT fm.foundry_id
      FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
  );
