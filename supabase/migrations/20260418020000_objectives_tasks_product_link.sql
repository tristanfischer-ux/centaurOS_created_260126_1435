-- Add product_id to objectives and tasks.
--
-- INTENT: close the "which product is this objective shipping?" /
-- "what's blocking the Alpha build?" mental-model gap. Today a founder
-- can't answer either question inside ForgeOS: Products live in the
-- Product Intelligence layer, Objectives and Tasks live in the work
-- management layer, and nothing links across.
--
-- SAFETY:
-- - Both columns are nullable — all existing rows stay valid.
-- - ON DELETE SET NULL: deleting a product orphans its linked objectives /
--   tasks rather than cascade-deleting work (founders keep their history).
-- - Indexes are composite on (foundry_id, product_id) so "all items for
--   product X within my foundry" is a fast partial scan. foundry_id stays
--   the primary tenant-isolation filter; RLS is unchanged.
-- - No backfill. Tagging is a deliberate user action, not something we
--   try to infer retroactively (that would require heuristics I don't
--   trust to get right).
--
-- ROLLBACK (if needed):
--   BEGIN;
--   DROP INDEX IF EXISTS public.idx_objectives_foundry_product;
--   DROP INDEX IF EXISTS public.idx_tasks_foundry_product;
--   ALTER TABLE public.objectives DROP COLUMN IF EXISTS product_id;
--   ALTER TABLE public.tasks DROP COLUMN IF EXISTS product_id;
--   COMMIT;

BEGIN;

ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS product_id uuid
    REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS product_id uuid
    REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_objectives_foundry_product
  ON public.objectives (foundry_id, product_id)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_foundry_product
  ON public.tasks (foundry_id, product_id)
  WHERE product_id IS NOT NULL;

COMMIT;
