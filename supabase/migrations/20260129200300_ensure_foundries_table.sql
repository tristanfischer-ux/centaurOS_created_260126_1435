-- Migration: Ensure foundries table exists with proper RLS policies
-- This table is referenced in multiple places but may not have been properly created

-- Create foundries table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.foundries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  industry text,
  stage text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.foundries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own foundry" ON public.foundries;
DROP POLICY IF EXISTS "Founders can update their foundry" ON public.foundries;
DROP POLICY IF EXISTS "Founders can insert their foundry" ON public.foundries;

-- Policy: Users can only see their own foundry
CREATE POLICY "Users can view their own foundry"
  ON public.foundries FOR SELECT
  USING (id = get_my_foundry_id());

-- Policy: Only founders can update their foundry
CREATE POLICY "Founders can update their foundry"
  ON public.foundries FOR UPDATE
  USING (id = get_my_foundry_id() AND get_my_role() = 'Founder');

-- Policy: Only founders can create foundries
CREATE POLICY "Founders can insert their foundry"
  ON public.foundries FOR INSERT
  WITH CHECK (get_my_role() = 'Founder');

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_foundries_slug ON public.foundries(slug);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_foundries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_foundries_updated_at_trigger ON public.foundries;

CREATE TRIGGER update_foundries_updated_at_trigger
  BEFORE UPDATE ON public.foundries
  FOR EACH ROW
  EXECUTE FUNCTION update_foundries_updated_at();

-- Add comments
COMMENT ON TABLE public.foundries IS 'Foundries represent organizations/companies in the CentaurOS platform';
COMMENT ON COLUMN public.foundries.slug IS 'URL-friendly identifier for the foundry';
COMMENT ON COLUMN public.foundries.industry IS 'Industry sector (e.g., SaaS, Manufacturing, etc.)';
COMMENT ON COLUMN public.foundries.stage IS 'Company stage (e.g., Seed, Series A, etc.)';
