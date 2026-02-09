-- ============================================================================
-- Migration: Foundry Custom Business Functions
-- Purpose: Allow each foundry to customize the 7 core business function names
--          and display order in the Company Orbit view
-- ============================================================================

-- Create foundry_business_functions table
CREATE TABLE public.foundry_business_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id text NOT NULL,
  function_id text NOT NULL CHECK (function_id IN (
    'sales', 'marketing', 'finance', 'hr', 'legal', 'operations', 'product'
  )),
  label text NOT NULL CHECK (length(label) >= 1 AND length(label) <= 50),
  short text NOT NULL CHECK (length(short) >= 2 AND length(short) <= 6 AND short = upper(short)),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(foundry_id, function_id),
  UNIQUE(foundry_id, display_order)
);

-- Enable RLS
ALTER TABLE public.foundry_business_functions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only manage functions in their own foundry
CREATE POLICY "Users manage functions in same foundry" 
  ON public.foundry_business_functions
  FOR ALL
  USING (foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid()));

-- Indexes for performance
CREATE INDEX idx_foundry_functions_foundry ON public.foundry_business_functions(foundry_id);
CREATE INDEX idx_foundry_functions_order ON public.foundry_business_functions(foundry_id, display_order);

-- Comment
COMMENT ON TABLE public.foundry_business_functions IS 'Custom business function labels and ordering per foundry for the Company Orbit view';
COMMENT ON COLUMN public.foundry_business_functions.function_id IS 'One of the 7 core function IDs: sales, marketing, finance, hr, legal, operations, product';
COMMENT ON COLUMN public.foundry_business_functions.label IS 'Custom display name (e.g., "Revenue" instead of "Sales")';
COMMENT ON COLUMN public.foundry_business_functions.short IS 'Custom abbreviation shown in orbit (e.g., "REV" instead of "SALES")';
COMMENT ON COLUMN public.foundry_business_functions.display_order IS 'Position in orbit view, clockwise from top-right (0-6)';
