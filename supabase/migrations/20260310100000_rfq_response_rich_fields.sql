-- Rich proposal fields for supplier responses
ALTER TABLE public.rfq_responses
  ADD COLUMN IF NOT EXISTS scope_of_work TEXT,
  ADD COLUMN IF NOT EXISTS pricing_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS timeline_weeks INTEGER,
  ADD COLUMN IF NOT EXISTS valid_until DATE,
  ADD COLUMN IF NOT EXISTS milestones JSONB,
  ADD COLUMN IF NOT EXISTS deliverables JSONB,
  ADD COLUMN IF NOT EXISTS indicative_min DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS indicative_max DECIMAL(12,2);
