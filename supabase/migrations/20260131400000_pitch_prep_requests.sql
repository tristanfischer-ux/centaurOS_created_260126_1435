-- =============================================
-- Pitch Preparation Requests Table
-- =============================================
-- 
-- LEGAL NOTE: This table stores pitch preparation service requests.
-- CentaurOS does not provide investment advice or facilitate securities transactions.
-- All investment discussions happen directly between parties off-platform.
-- 

-- Create enum for pitch prep status
CREATE TYPE pitch_prep_status AS ENUM (
  'draft',
  'submitted',
  'in_review',
  'matched',
  'in_progress',
  'completed',
  'cancelled'
);

-- Create enum for funding stage
CREATE TYPE funding_stage AS ENUM (
  'Pre-Seed',
  'Seed',
  'Series A',
  'Series B+',
  'Growth',
  'Bridge'
);

-- Create enum for legal structure
CREATE TYPE legal_structure AS ENUM (
  'Ltd',
  'Inc',
  'LLC',
  'GmbH',
  'PLC',
  'Other'
);

-- Create the pitch prep requests table
CREATE TABLE pitch_prep_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Company Information
  company_name TEXT NOT NULL,
  company_website TEXT,
  founding_date DATE,
  legal_structure legal_structure,
  headquarters TEXT,
  
  -- Team
  founder_count INTEGER,
  team_size INTEGER,
  key_team_members JSONB DEFAULT '[]',
  
  -- Product & Market
  product_description TEXT NOT NULL,
  problem_solved TEXT,
  target_market TEXT,
  competitive_landscape TEXT,
  
  -- Traction (informational)
  stage funding_stage NOT NULL,
  has_revenue BOOLEAN NOT NULL DEFAULT false,
  traction_summary TEXT,
  
  -- Fundraising Context (informational only - NOT investment terms)
  amount_seeking TEXT, -- e.g., "£500K-£1M"
  use_of_funds TEXT,
  timeline TEXT,
  
  -- Services Requested
  services_requested TEXT[] NOT NULL DEFAULT '{}',
  target_investor_types TEXT[] DEFAULT '{}',
  specific_questions TEXT,
  
  -- Files
  pitch_deck_url TEXT,
  financial_model_url TEXT,
  additional_files TEXT[] DEFAULT '{}',
  
  -- Status
  status pitch_prep_status NOT NULL DEFAULT 'draft',
  matched_provider_id UUID REFERENCES service_providers(id) ON DELETE SET NULL,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for common queries
CREATE INDEX idx_pitch_prep_foundry ON pitch_prep_requests(foundry_id);
CREATE INDEX idx_pitch_prep_user ON pitch_prep_requests(user_id);
CREATE INDEX idx_pitch_prep_status ON pitch_prep_requests(status);
CREATE INDEX idx_pitch_prep_stage ON pitch_prep_requests(stage);
CREATE INDEX idx_pitch_prep_created ON pitch_prep_requests(created_at DESC);

-- Enable RLS
ALTER TABLE pitch_prep_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own requests
CREATE POLICY "Users can view own pitch prep requests"
  ON pitch_prep_requests
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR foundry_id IN (
      SELECT foundry_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can create requests in their foundry
CREATE POLICY "Users can create pitch prep requests"
  ON pitch_prep_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND foundry_id IN (
      SELECT foundry_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can update their own requests
CREATE POLICY "Users can update own pitch prep requests"
  ON pitch_prep_requests
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own draft/cancelled requests
CREATE POLICY "Users can delete own draft pitch prep requests"
  ON pitch_prep_requests
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND status IN ('draft', 'cancelled')
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pitch_prep_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update trigger for updated_at
CREATE TRIGGER update_pitch_prep_updated_at
  BEFORE UPDATE ON pitch_prep_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_pitch_prep_updated_at();

-- Add comment for documentation
COMMENT ON TABLE pitch_prep_requests IS 'Pitch preparation service requests. This is a preparation service only - CentaurOS does not provide investment advice or facilitate securities transactions.';
