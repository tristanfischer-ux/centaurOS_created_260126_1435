-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Money redesign · Chunk 1B · xero_transaction
-- MONEY-SCHEMA.md §2 · xero_transaction
--
-- Imported transactions from Xero. Dedup on (foundry_id, xero_transaction_id) —
-- reimports are idempotent. Large-table candidate for partitioning if growth
-- warrants (deferred to V2).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.xero_transaction (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id                   text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  xero_transaction_id          text NOT NULL,
  transaction_date             date NOT NULL,
  description                  text NOT NULL,
  vendor_name                  text,
  amount_cents                 integer NOT NULL,
  currency                     text NOT NULL DEFAULT 'GBP',
  xero_account_code            text NOT NULL,
  assigned_category            text NOT NULL
                                 CHECK (assigned_category IN
                                   ('people','premises','tools','materials','growth','other',
                                    'revenue','grants','equity','loans')),
  category_override            text
                                 CHECK (category_override IS NULL OR category_override IN
                                   ('people','premises','tools','materials','growth','other',
                                    'revenue','grants','equity','loans')),
  category_override_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  flagged                      text
                                 CHECK (flagged IS NULL OR flagged IN
                                   ('unusual_for_category','structural_drift','duplicate_suspected',
                                    'large_expense','manual_review')),
  synced_at                    timestamptz NOT NULL DEFAULT now(),
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.xero_transaction IS
  'MONEY-SCHEMA §2 · Xero-imported transactions. Idempotent reimport via '
  'unique (foundry_id, xero_transaction_id). amount_cents negative = out, '
  'positive = in.';

-- Idempotent import
CREATE UNIQUE INDEX IF NOT EXISTS xero_transaction_unique_per_foundry
  ON public.xero_transaction (foundry_id, xero_transaction_id);

-- Hot queries: date-range + category rollups for Variance view
CREATE INDEX IF NOT EXISTS xero_transaction_foundry_date_idx
  ON public.xero_transaction (foundry_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS xero_transaction_foundry_category_date_idx
  ON public.xero_transaction (foundry_id, assigned_category, transaction_date);

CREATE INDEX IF NOT EXISTS xero_transaction_foundry_flagged_idx
  ON public.xero_transaction (foundry_id, flagged)
  WHERE flagged IS NOT NULL;

DROP TRIGGER IF EXISTS xero_transaction_set_updated_at ON public.xero_transaction;
CREATE TRIGGER xero_transaction_set_updated_at
  BEFORE UPDATE ON public.xero_transaction
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.xero_transaction ENABLE ROW LEVEL SECURITY;

-- SELECT: any foundry member can read transactions (cost visibility is
-- fundamental to running the business).
CREATE POLICY xero_transaction_foundry_select
  ON public.xero_transaction FOR SELECT
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
    )
  );

-- Write: Founder + Executive can reclassify (override category). Sync writes
-- happen via service_role which bypasses RLS.
CREATE POLICY xero_transaction_foundry_reclassify
  ON public.xero_transaction FOR UPDATE
  USING (
    foundry_id IN (
      SELECT fm.foundry_id FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid() AND fm.active = true
        AND fm.role IN ('Founder', 'Executive')
    )
  );
