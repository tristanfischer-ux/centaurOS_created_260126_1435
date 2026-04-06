-- Migration: Create materialized portfolio companies table
-- Source: Forge Capital SQLite portfolio_companies table (92,921 records)
-- DECISION: Materialized table instead of JSONB RPC for searchability and performance

CREATE TABLE IF NOT EXISTS investor_portfolio_companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  sector TEXT,
  stage TEXT,
  amount_usd NUMERIC,
  investment_date TEXT,
  description TEXT,
  why_appealing TEXT,
  source_url TEXT,
  forge_capital_investor_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for search and filtering
CREATE INDEX idx_ipc_listing ON investor_portfolio_companies(listing_id);
CREATE INDEX idx_ipc_company ON investor_portfolio_companies(company_name);
CREATE INDEX idx_ipc_sector ON investor_portfolio_companies(sector);
CREATE INDEX idx_ipc_fc_id ON investor_portfolio_companies(forge_capital_investor_id);

-- RLS: Public reference data, read-only for authenticated users
ALTER TABLE investor_portfolio_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read portfolio companies"
  ON investor_portfolio_companies FOR SELECT
  TO authenticated
  USING (true);
