-- Migration: Create investor_grants table for non-dilutive funding directory
-- Source: Forge Capital SQLite grants table (3,042 records)

CREATE TABLE IF NOT EXISTS investor_grants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grant_name TEXT NOT NULL,
  managing_body TEXT,
  country TEXT,
  region TEXT,
  website TEXT,
  application_url TEXT,
  description TEXT,
  amount_min_usd NUMERIC,
  amount_max_usd NUMERIC,
  total_pool_usd NUMERIC,
  sector_focus TEXT[],
  stage_focus TEXT[],
  trl_min INTEGER,
  trl_max INTEGER,
  equity_free BOOLEAN DEFAULT TRUE,
  deadline TEXT,
  deadline_type TEXT DEFAULT 'rolling',
  cofunding_pct NUMERIC,
  eligibility_summary TEXT,
  company_size_max INTEGER,
  company_age_max_years INTEGER,
  actively_accepting BOOLEAN DEFAULT TRUE,
  deep_profile TEXT,
  data_quality_score NUMERIC DEFAULT 0,
  forge_capital_id INTEGER UNIQUE,
  last_checked TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_investor_grants_country ON investor_grants(country);
CREATE INDEX idx_investor_grants_sector ON investor_grants USING GIN(sector_focus);
CREATE INDEX idx_investor_grants_quality ON investor_grants(data_quality_score);
CREATE INDEX idx_investor_grants_accepting ON investor_grants(actively_accepting);

-- RLS: Public reference data, read-only for authenticated users
ALTER TABLE investor_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read grants"
  ON investor_grants FOR SELECT
  TO authenticated
  USING (true);
