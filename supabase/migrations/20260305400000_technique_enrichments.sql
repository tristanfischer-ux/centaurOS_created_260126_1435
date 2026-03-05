-- Manufacturing technique enrichments from Nightshift aggregation pipeline
CREATE TABLE IF NOT EXISTS manufacturing_technique_enrichments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    technique_slug TEXT NOT NULL,
    article_markdown TEXT,
    real_world_tolerances JSONB DEFAULT '{}',
    real_world_materials JSONB DEFAULT '[]',
    real_world_equipment JSONB DEFAULT '[]',
    real_world_surface_finishes JSONB DEFAULT '{}',
    typical_batch_sizes JSONB DEFAULT '{}',
    tips_and_insights JSONB DEFAULT '[]',
    common_applications JSONB DEFAULT '[]',
    supplier_count INTEGER DEFAULT 0,
    source TEXT DEFAULT 'nightshift',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(technique_slug)
);

-- RLS: public read, service-role write
ALTER TABLE manufacturing_technique_enrichments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON manufacturing_technique_enrichments FOR SELECT USING (true);
CREATE POLICY "Service write" ON manufacturing_technique_enrichments FOR ALL USING (auth.role() = 'service_role');

-- Index for slug lookups
CREATE INDEX idx_technique_enrichments_slug ON manufacturing_technique_enrichments(technique_slug);
