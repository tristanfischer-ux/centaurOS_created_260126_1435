-- Design Standards Library
-- Engineering standards reference for CAD Lab — injected into Claude Opus 1M context window
-- Global table (not per-foundry): standards are universal engineering knowledge

CREATE TABLE IF NOT EXISTS design_standards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    standard_code TEXT NOT NULL,
    standard_name TEXT NOT NULL,
    issuing_body TEXT NOT NULL,

    -- Classification
    industry_domain TEXT NOT NULL,
    product_tags TEXT[] NOT NULL DEFAULT '{}',
    engineering_tags TEXT[] NOT NULL DEFAULT '{}',

    -- Content (injected into prompts)
    summary TEXT NOT NULL,
    requirements_markdown TEXT NOT NULL,
    design_rules JSONB NOT NULL DEFAULT '[]',
    material_specs JSONB DEFAULT '{}',
    dimensional_constraints JSONB DEFAULT '{}',
    test_procedures TEXT,

    -- Applicability
    applicable_to TEXT[] DEFAULT '{}',
    region TEXT[] DEFAULT '{"global"}',
    version TEXT,
    superseded_by TEXT,

    -- Budget + provenance
    token_estimate INTEGER NOT NULL DEFAULT 0,
    source TEXT DEFAULT 'ai_generated',
    source_notes TEXT,
    verified BOOLEAN DEFAULT false,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(standard_code)
);

-- RLS: public read, service-role write
ALTER TABLE design_standards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read design standards"
    ON design_standards FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage design standards"
    ON design_standards FOR ALL USING (auth.role() = 'service_role');

-- Indexes for query patterns
CREATE INDEX idx_design_standards_domain ON design_standards(industry_domain);
CREATE INDEX idx_design_standards_product_tags ON design_standards USING GIN(product_tags);
CREATE INDEX idx_design_standards_engineering_tags ON design_standards USING GIN(engineering_tags);
CREATE INDEX idx_design_standards_issuing_body ON design_standards(issuing_body);
