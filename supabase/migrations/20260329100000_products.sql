-- Product Intelligence Layer — Phase 1
-- Creates products table and adds product_id to cash flow items.

-- Drop partial table from failed previous attempt
DROP TABLE IF EXISTS public.products CASCADE;

-- Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Products table
CREATE TABLE IF NOT EXISTS public.products (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  foundry_id      text NOT NULL,
  created_by      uuid NOT NULL,
  name            text NOT NULL,
  description     text,
  hero_image_url  text,
  lifecycle       text NOT NULL DEFAULT 'concept',
  market_assessment jsonb,
  unit_economics  jsonb,
  fundability_score jsonb,
  unit_price_pence      integer,
  target_monthly_units  integer,
  cad_lab_project_id    uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_foundry ON public.products(foundry_id);
CREATE INDEX IF NOT EXISTS idx_products_cad_project ON public.products(cad_lab_project_id);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'products_select') THEN
    CREATE POLICY "products_select" ON public.products FOR SELECT
      USING (foundry_id IN (
        SELECT COALESCE(active_foundry_id, foundry_id) FROM public.profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'products_insert') THEN
    CREATE POLICY "products_insert" ON public.products FOR INSERT
      WITH CHECK (foundry_id IN (
        SELECT COALESCE(active_foundry_id, foundry_id) FROM public.profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'products_update') THEN
    CREATE POLICY "products_update" ON public.products FOR UPDATE
      USING (foundry_id IN (
        SELECT COALESCE(active_foundry_id, foundry_id) FROM public.profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'products_delete') THEN
    CREATE POLICY "products_delete" ON public.products FOR DELETE
      USING (foundry_id IN (
        SELECT COALESCE(active_foundry_id, foundry_id) FROM public.profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add product_id and source to cash flow items
ALTER TABLE public.cash_in_items ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.cash_in_items ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
ALTER TABLE public.cash_out_items ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.cash_out_items ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
