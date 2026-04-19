-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Money redesign · Chunk 1A · money_scenarios + money_scenario_overrides
-- MONEY-SCHEMA.md §2 · money_scenarios, money_scenario_overrides
--
-- NAME NOTE: MONEY-SCHEMA drafts used `burn_scenarios` but Phase 1 already
-- shipped a table of that name (cash-burn planning tables, 2026-02-26
-- migration). To avoid collision, V2 scenarios live as `money_scenarios` and
-- their diff-rows live as `money_scenario_overrides`. Legacy `burn_scenarios`
-- data migrates to `money_scenarios` in Chunk 1G.
--
-- Simplified V1 per MONEY-SCHEMA §1.5 — no formulas/triggers/global-params.
-- Overrides stored as diff rows (not copy) per ambiguity resolution #2.
-- Auto-archive orphaned override on line_item delete.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── money_scenarios ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.money_scenarios (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id        text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  name              text NOT NULL,
  question          text,
  template_source   text CHECK (template_source IN
                      ('worst_case','best_case','hiring','custom','legacy_migration')),
  is_default        boolean NOT NULL DEFAULT false,
  visibility        text NOT NULL DEFAULT 'founders'
                      CHECK (visibility IN ('founders','all_members','private')),
  legacy_source_id  uuid,
  archived_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.money_scenarios IS
  'MONEY-SCHEMA §2 · Phase 2 scenario table. Namespaced `money_` to avoid '
  'collision with legacy `burn_scenarios` (Phase 1 cash-burn). Legacy data '
  'migrates here in Chunk 1G.';

CREATE INDEX IF NOT EXISTS money_scenarios_foundry_idx
  ON public.money_scenarios (foundry_id) WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS money_scenarios_single_default_per_foundry
  ON public.money_scenarios (foundry_id) WHERE is_default = true AND archived_at IS NULL;

DROP TRIGGER IF EXISTS money_scenarios_set_updated_at ON public.money_scenarios;
CREATE TRIGGER money_scenarios_set_updated_at
  BEFORE UPDATE ON public.money_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.money_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY money_scenarios_foundry_select ON public.money_scenarios FOR SELECT
  USING (foundry_id IN (
    SELECT fm.foundry_id FROM public.foundry_memberships fm
    WHERE fm.user_id = auth.uid() AND fm.active = true
  ));

CREATE POLICY money_scenarios_foundry_write ON public.money_scenarios FOR ALL
  USING (foundry_id IN (
    SELECT fm.foundry_id FROM public.foundry_memberships fm
    WHERE fm.user_id = auth.uid() AND fm.active = true
      AND fm.role IN ('Founder', 'Executive')
  ))
  WITH CHECK (foundry_id IN (
    SELECT fm.foundry_id FROM public.foundry_memberships fm
    WHERE fm.user_id = auth.uid() AND fm.active = true
      AND fm.role IN ('Founder', 'Executive')
  ));

-- ── money_scenario_overrides ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.money_scenario_overrides (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id                  text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  scenario_id                 uuid NOT NULL REFERENCES public.money_scenarios(id) ON DELETE CASCADE,
  line_item_id                uuid REFERENCES public.plan_line_items(id) ON DELETE SET NULL,
  override_amount_cents       integer,
  override_frequency          text
                                CHECK (override_frequency IS NULL OR override_frequency IN
                                  ('one_off','weekly','monthly','quarterly','annual','variable')),
  override_effective_from     date,
  override_effective_to       date,
  override_probability_pct    smallint
                                CHECK (override_probability_pct IS NULL OR
                                  override_probability_pct BETWEEN 0 AND 100),
  note                        text,
  archived_at                 timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.money_scenario_overrides IS
  'MONEY-SCHEMA §2 · diff rows per (scenario, line_item). Ambiguity resolution '
  '#2 — stored as diffs, not copies. On line_item delete, line_item_id goes NULL '
  'and trigger archives row with "value reverts to 0" semantics.';

CREATE UNIQUE INDEX IF NOT EXISTS money_scenario_overrides_unique_pair
  ON public.money_scenario_overrides (scenario_id, line_item_id)
  WHERE archived_at IS NULL AND line_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS money_scenario_overrides_foundry_idx
  ON public.money_scenario_overrides (foundry_id, scenario_id) WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS money_scenario_overrides_set_updated_at ON public.money_scenario_overrides;
CREATE TRIGGER money_scenario_overrides_set_updated_at
  BEFORE UPDATE ON public.money_scenario_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.money_scenario_overrides_archive_on_orphan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.line_item_id IS NULL) AND (OLD.line_item_id IS NOT NULL) THEN
    NEW.archived_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS money_scenario_overrides_archive_on_orphan_trg ON public.money_scenario_overrides;
CREATE TRIGGER money_scenario_overrides_archive_on_orphan_trg
  BEFORE UPDATE ON public.money_scenario_overrides
  FOR EACH ROW EXECUTE FUNCTION public.money_scenario_overrides_archive_on_orphan();

ALTER TABLE public.money_scenario_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY money_scenario_overrides_foundry_select ON public.money_scenario_overrides FOR SELECT
  USING (foundry_id IN (
    SELECT fm.foundry_id FROM public.foundry_memberships fm
    WHERE fm.user_id = auth.uid() AND fm.active = true
  ));

CREATE POLICY money_scenario_overrides_foundry_write ON public.money_scenario_overrides FOR ALL
  USING (foundry_id IN (
    SELECT fm.foundry_id FROM public.foundry_memberships fm
    WHERE fm.user_id = auth.uid() AND fm.active = true
      AND fm.role IN ('Founder', 'Executive')
  ))
  WITH CHECK (foundry_id IN (
    SELECT fm.foundry_id FROM public.foundry_memberships fm
    WHERE fm.user_id = auth.uid() AND fm.active = true
      AND fm.role IN ('Founder', 'Executive')
  ));
