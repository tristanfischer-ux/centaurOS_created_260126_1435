-- Migration: Add product_category to objective_packs
-- Purpose: Link objective packs to specific industries (robotics, rockets, etc.)
-- This enables filtering packs by industry in the Inspiration page

-- Add product_category column to objective_packs
ALTER TABLE public.objective_packs 
ADD COLUMN IF NOT EXISTS product_category TEXT;

-- Create index for efficient filtering by product_category
CREATE INDEX IF NOT EXISTS idx_objective_packs_product_category 
ON public.objective_packs(product_category);

-- Add comment for documentation
COMMENT ON COLUMN public.objective_packs.product_category IS 
'Industry category slug (e.g., robotics, rockets, satellites) for filtering packs by industry';
