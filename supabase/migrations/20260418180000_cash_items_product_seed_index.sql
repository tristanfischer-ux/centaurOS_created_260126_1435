-- Partial index for fast product-seed idempotent upsert on cash_in_items + cash_out_items.
--
-- INTENT: seedCashInFromProducts / seedCashOutCogsFromProducts look up existing seed
-- rows by (foundry_id, product_id, source='product_seed', source_type/pnl_category).
-- Without this index the lookup is a full-table scan for every seed run. Expected
-- most rows have source='manual', so a PARTIAL index (source='product_seed' only)
-- keeps the index tiny while serving the exact path we care about.
--
-- SAFETY: additive, no data changes. Fully rollback-safe:
--   DROP INDEX IF EXISTS public.idx_cash_in_items_product_seed;
--   DROP INDEX IF EXISTS public.idx_cash_out_items_product_seed;

BEGIN;

CREATE INDEX IF NOT EXISTS idx_cash_in_items_product_seed
  ON public.cash_in_items (foundry_id, product_id)
  WHERE source = 'product_seed';

CREATE INDEX IF NOT EXISTS idx_cash_out_items_product_seed
  ON public.cash_out_items (foundry_id, product_id)
  WHERE source = 'product_seed';

COMMIT;
