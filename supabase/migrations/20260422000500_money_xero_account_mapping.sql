-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Money redesign · Chunk 1B · xero_account_mapping
-- MONEY-SCHEMA.md §2 · xero_account_mapping
--
-- Maps Xero account codes to ForgeOS plan categories. Auto-populated on first
-- sync with best-effort confidence; founder confirms via Settings UI.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.xero_account_mapping (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id                  text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  xero_account_code           text NOT NULL,
  xero_account_name           text NOT NULL,
  forgeos_category            text NOT NULL
                                CHECK (forgeos_category IN
                                  ('people','premises','tools','materials','growth','other',
                                   'revenue','grants','equity','loans')),
  confidence_pct              smallint NOT NULL DEFAULT 50
                                CHECK (confidence_pct BETWEEN 0 AND 100),
  user_confirmed              boolean NOT NULL DEFAULT false,
  user_confirmed_by_user_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_confirmed_at           timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.xero_account_mapping IS
  'MONEY-SCHEMA §2 · Xero account code → ForgeOS category. One mapping per '
  '(foundry, account_code). Confidence auto-assigned on sync; founder confirms.';

CREATE UNIQUE INDEX IF NOT EXISTS xero_account_mapping_unique_per_foundry
  ON public.xero_account_mapping (foundry_id, xero_account_code);

DROP TRIGGER IF EXISTS xero_account_mapping_set_updated_at ON public.xero_account_mapping;
CREATE TRIGGER xero_account_mapping_set_updated_at
  BEFORE UPDATE ON public.xero_account_mapping
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.xero_account_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY xero_account_mapping_foundry_select
  ON public.xero_account_mapping FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
  );

CREATE POLICY xero_account_mapping_foundry_write
  ON public.xero_account_mapping FOR ALL
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
