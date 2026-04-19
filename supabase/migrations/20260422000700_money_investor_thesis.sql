-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Money redesign · Chunk 1C · investor_thesis + foundries.active_thesis_id
-- MONEY-SCHEMA.md §2 · investor_thesis
--
-- Versioned thesis — new row per save, never update. Active version pointed
-- to by foundries.active_thesis_id (added below as ALTER).
-- Match scores against investors are computed live (not stored) per ambiguity
-- resolution #4 — every time the founder views matches, they're scored
-- against the CURRENT thesis. Historical touches remember which thesis
-- version was active at touch time via payload.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── investor_thesis ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.investor_thesis (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id                  text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  version                     integer NOT NULL,
  stage_tags                  text[] NOT NULL DEFAULT '{}'::text[],
  sector_tags                 text[] NOT NULL DEFAULT '{}'::text[],
  geography                   text[] NOT NULL DEFAULT '{}'::text[],
  cheque_min_cents            bigint,
  cheque_max_cents            bigint,
  keywords                    text[] NOT NULL DEFAULT '{}'::text[],
  preferred_instrument        text[] NOT NULL DEFAULT '{}'::text[],
  decision_speed_max_weeks    smallint,
  lead_follower_pref          text NOT NULL DEFAULT 'either'
                                CHECK (lead_follower_pref IN
                                  ('lead_only','follower_only','either')),
  no_go_rules                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  weights                     jsonb NOT NULL DEFAULT
                                '{"thesis":35,"stage":20,"cheque":15,"warm":12,"geo":8,"recency":6,"speed":4}'::jsonb,
  data_sources                jsonb NOT NULL DEFAULT
                                '{"crunchbase":true,"companies_house":true,"forge_capital":true,"forge_network":true,"angellist":false}'::jsonb,
  created_by                  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  archived_at                 timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.investor_thesis IS
  'MONEY-SCHEMA §2 · versioned investment thesis. New row per save, never UPDATE. '
  'Active version → foundries.active_thesis_id. Match scores computed live.';

CREATE UNIQUE INDEX IF NOT EXISTS investor_thesis_unique_version
  ON public.investor_thesis (foundry_id, version)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS investor_thesis_foundry_version_idx
  ON public.investor_thesis (foundry_id, version DESC)
  WHERE archived_at IS NULL;

ALTER TABLE public.investor_thesis ENABLE ROW LEVEL SECURITY;

CREATE POLICY investor_thesis_foundry_select
  ON public.investor_thesis FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
  );

CREATE POLICY investor_thesis_foundry_write
  ON public.investor_thesis FOR ALL
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

-- ── foundries.active_thesis_id (additive) ────────────────────────────────────

ALTER TABLE public.foundries
  ADD COLUMN IF NOT EXISTS active_thesis_id uuid
    REFERENCES public.investor_thesis(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.foundries.active_thesis_id IS
  'MONEY-SCHEMA §2 · FK to the currently-active investor_thesis version. '
  'Null until the foundry creates their first thesis.';

CREATE INDEX IF NOT EXISTS foundries_active_thesis_idx
  ON public.foundries (active_thesis_id)
  WHERE active_thesis_id IS NOT NULL;
