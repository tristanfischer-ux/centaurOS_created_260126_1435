-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Money redesign · Chunk 1C · investor_round
-- MONEY-SCHEMA.md §2 · investor_round
--
-- At most one active round per foundry (partial unique index). State machine:
-- draft → active → closing → closed → archived.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.investor_round (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id            text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  stage                 text NOT NULL
                          CHECK (stage IN
                            ('pre_seed','seed','series_a','series_b','bridge','other')),
  target_cents          bigint NOT NULL,
  currency              text NOT NULL DEFAULT 'GBP',
  close_date            date NOT NULL,
  instrument            text NOT NULL
                          CHECK (instrument IN
                            ('safe_post','safe_pre','priced','convertible','asa','other')),
  cap_cents             bigint,
  discount_pct          smallint
                          CHECK (discount_pct IS NULL OR discount_pct BETWEEN 0 AND 100),
  cheque_min_cents      bigint,
  cheque_max_cents      bigint,
  lead_structure        text NOT NULL DEFAULT 'open_to_leads'
                          CHECK (lead_structure IN
                            ('open_to_leads','follower_only','party')),
  close_style           text NOT NULL DEFAULT 'rolling'
                          CHECK (close_style IN ('rolling','single_close')),
  syndicate_narrative   text,
  state                 text NOT NULL DEFAULT 'draft'
                          CHECK (state IN ('draft','active','closing','closed','archived')),
  opened_at             timestamptz,
  closed_at             timestamptz,
  archived_at           timestamptz,
  is_legacy_migrated    boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.investor_round IS
  'MONEY-SCHEMA §2 · fundraise round definition. State machine: '
  'draft → active → closing → closed → archived. At most one active per foundry.';

-- Partial unique: at most one active round per foundry
CREATE UNIQUE INDEX IF NOT EXISTS investor_round_one_active_per_foundry
  ON public.investor_round (foundry_id)
  WHERE state = 'active';

CREATE INDEX IF NOT EXISTS investor_round_foundry_state_idx
  ON public.investor_round (foundry_id, state)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS investor_round_set_updated_at ON public.investor_round;
CREATE TRIGGER investor_round_set_updated_at
  BEFORE UPDATE ON public.investor_round
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.investor_round ENABLE ROW LEVEL SECURITY;

CREATE POLICY investor_round_foundry_select
  ON public.investor_round FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
  );

CREATE POLICY investor_round_foundry_write
  ON public.investor_round FOR ALL
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
