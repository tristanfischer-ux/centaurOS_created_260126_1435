-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Money redesign · Chunk 1A · plan_line_items
-- MONEY-SCHEMA.md §2 · plan_line_items
--
-- Cost and income lines. `direction` flags which is which. Replaces legacy
-- cash_out_items + cash_in_items (MONEY-SCHEMA §5.2).
--
-- Data preservation: forward migration in Chunk 1G copies cash_out_items +
-- cash_in_items rows here with source='legacy_migration'. Write-twin triggers
-- in 1G keep legacy tables current during the rollout window.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plan_line_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id          text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  name                text NOT NULL,
  direction           text NOT NULL CHECK (direction IN ('out', 'in')),
  category            text NOT NULL
                        CHECK (category IN (
                          -- 6 cost buckets
                          'people','premises','tools','materials','growth','other',
                          -- 4 income buckets
                          'revenue','grants','equity','loans'
                        )),
  amount_cents        integer NOT NULL,
  currency            text NOT NULL DEFAULT 'GBP',
  frequency           text NOT NULL CHECK (frequency IN
                        ('one_off','weekly','monthly','quarterly','annual','variable')),
  effective_from      date NOT NULL,
  effective_to        date,
  probability_pct     smallint NOT NULL DEFAULT 100
                        CHECK (probability_pct BETWEEN 0 AND 100),
  formula             text,
  formula_variables   jsonb,
  sensitivity_pct     smallint NOT NULL DEFAULT 5
                        CHECK (sensitivity_pct BETWEEN 0 AND 100),
  annual_uplift_pct   smallint NOT NULL DEFAULT 0
                        CHECK (annual_uplift_pct BETWEEN -100 AND 100),
  accounting_tags     text[] NOT NULL DEFAULT '{}'::text[],
  xero_account_code   text,
  project_allocation  text,
  vat_treatment       text NOT NULL DEFAULT 'standard_20'
                        CHECK (vat_treatment IN ('standard_20','reduced_5','zero','exempt')),
  source              text NOT NULL DEFAULT 'manual'
                        CHECK (source IN
                          ('manual','template','csv_import','xero_inferred','legacy_migration')),
  owner_user_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  legacy_source_table text,
  legacy_source_id    uuid,
  notes               text,
  archived_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plan_line_items IS
  'MONEY-SCHEMA §2 · plan cost + income lines. Replaces legacy cash_out_items '
  '+ cash_in_items. direction flags which (out=cost, in=income).';

COMMENT ON COLUMN public.plan_line_items.legacy_source_table IS
  'MONEY-SCHEMA §5.2 · which legacy table this row migrated from '
  '(cash_out_items / cash_in_items). NULL for net-new rows.';

COMMENT ON COLUMN public.plan_line_items.legacy_source_id IS
  'MONEY-SCHEMA §5.2 · primary key in the legacy source table. Used by '
  'write-twin triggers during the rollout window to keep legacy table current.';

-- Indexes
CREATE INDEX IF NOT EXISTS plan_line_items_foundry_direction_idx
  ON public.plan_line_items (foundry_id, direction)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS plan_line_items_foundry_category_idx
  ON public.plan_line_items (foundry_id, category)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS plan_line_items_foundry_effective_idx
  ON public.plan_line_items (foundry_id, effective_from, effective_to)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS plan_line_items_legacy_lookup_idx
  ON public.plan_line_items (legacy_source_table, legacy_source_id)
  WHERE legacy_source_table IS NOT NULL;

-- updated_at trigger
DROP TRIGGER IF EXISTS plan_line_items_set_updated_at ON public.plan_line_items;
CREATE TRIGGER plan_line_items_set_updated_at
  BEFORE UPDATE ON public.plan_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.plan_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_line_items_foundry_select
  ON public.plan_line_items
  FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
  );

-- Write: Founder + Executive. Apprentice = read-only per §4 matrix.
CREATE POLICY plan_line_items_foundry_write
  ON public.plan_line_items
  FOR ALL
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
        AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  )
  WITH CHECK (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
        AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  );
