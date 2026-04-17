-- Prevent duplicate iteration_number for the same product under concurrent writes.
--
-- INTENT: `createIteration` (src/actions/products.ts) computes
--   next_number = MAX(iteration_number) + 1
-- read from the table and then INSERTs. Two tabs (or two fire-and-forget AI
-- chains) racing on the same product can both read the same MAX, both
-- compute the same next_number, and both INSERT — producing duplicate
-- iteration_number rows. A duplicate then corrupts the history view and the
-- convergence-delta calculation (ORDER BY iteration_number becomes ambiguous).
--
-- There is already a non-unique btree index on (product_id, iteration_number)
-- from 20260329300000_iteration_tracking.sql. We replace it with a unique
-- constraint that carries the same lookup benefit.
--
-- No existing duplicates at the time of writing (verified via SELECT), so the
-- ALTER is safe.

BEGIN;

DROP INDEX IF EXISTS public.idx_product_iterations_number;

ALTER TABLE public.product_iterations
  ADD CONSTRAINT product_iterations_product_number_unique
  UNIQUE (product_id, iteration_number);

COMMIT;
