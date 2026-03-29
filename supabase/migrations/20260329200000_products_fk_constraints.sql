-- Add FK constraints that were missing from the initial migration
ALTER TABLE public.cash_in_items
  ADD CONSTRAINT fk_cash_in_product
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.cash_out_items
  ADD CONSTRAINT fk_cash_out_product
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

-- Lifecycle CHECK constraint
ALTER TABLE public.products
  ADD CONSTRAINT chk_products_lifecycle
  CHECK (lifecycle IN ('concept','researching','validated','prototyping','pre_production','in_market','deprecated'));

-- Prevent duplicate products for the same CAD project
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_unique_cad_project
  ON public.products(foundry_id, cad_lab_project_id) WHERE cad_lab_project_id IS NOT NULL;
