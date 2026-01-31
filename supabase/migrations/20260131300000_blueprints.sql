-- Blueprints Feature: Knowledge Domain Mapping
-- Maps knowledge domains, expertise, and suppliers for products/ventures

-- ============================================================================
-- BLUEPRINT TEMPLATES
-- Pre-built templates for common product categories
-- ============================================================================

CREATE TABLE IF NOT EXISTS blueprint_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    product_category TEXT NOT NULL,
    icon TEXT DEFAULT 'cpu', -- Lucide icon name
    estimated_domains INTEGER DEFAULT 0,
    estimated_questions INTEGER DEFAULT 0,
    is_system_template BOOLEAN DEFAULT false,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    fork_count INTEGER DEFAULT 0,
    use_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- KNOWLEDGE DOMAINS
-- Hierarchical taxonomy of expertise areas
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES blueprint_templates(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES knowledge_domains(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT, -- Electronics, Mechanical, Software, Business, Regulatory, Manufacturing
    depth INTEGER DEFAULT 0, -- 0 = root, 1 = child, etc.
    display_order INTEGER DEFAULT 0,
    
    -- Key questions to assess knowledge
    key_questions JSONB DEFAULT '[]',
    
    -- Metadata
    typical_roles TEXT[] DEFAULT '{}',
    related_domain_ids UUID[] DEFAULT '{}',
    prerequisite_domain_ids UUID[] DEFAULT '{}',
    learning_resources JSONB DEFAULT '{}',
    marketplace_categories TEXT[] DEFAULT '{}',
    supplier_categories TEXT[] DEFAULT '{}',
    
    -- Criticality for product success
    criticality TEXT DEFAULT 'important' CHECK (criticality IN ('critical', 'important', 'nice-to-have')),
    learning_time_estimate TEXT,
    ai_summary TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- BLUEPRINTS
-- User's blueprint instances
-- ============================================================================

CREATE TABLE IF NOT EXISTS blueprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
    template_id UUID REFERENCES blueprint_templates(id) ON DELETE SET NULL,
    
    name TEXT NOT NULL,
    description TEXT,
    project_type TEXT DEFAULT 'product' CHECK (project_type IN ('product', 'venture', 'project')),
    
    -- Project stage for progressive disclosure
    project_stage TEXT DEFAULT 'concept' CHECK (project_stage IN ('concept', 'prototype', 'evt', 'dvt', 'production', 'launched')),
    
    -- AI-generated context
    ai_generated_context JSONB DEFAULT '{}',
    
    -- Cached metrics
    coverage_score NUMERIC(5,2) DEFAULT 0,
    critical_gaps INTEGER DEFAULT 0,
    total_domains INTEGER DEFAULT 0,
    covered_domains INTEGER DEFAULT 0,
    
    -- Settings
    settings JSONB DEFAULT '{}',
    
    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'template')),
    
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- BLUEPRINT DOMAIN COVERAGE
-- Coverage status per domain per blueprint
-- ============================================================================

CREATE TABLE IF NOT EXISTS blueprint_domain_coverage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blueprint_id UUID NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
    domain_id UUID NOT NULL REFERENCES knowledge_domains(id) ON DELETE CASCADE,
    
    -- Cached path for display
    domain_path TEXT,
    domain_name TEXT,
    
    -- Status
    status TEXT DEFAULT 'gap' CHECK (status IN ('covered', 'partial', 'gap', 'not_needed')),
    is_critical BOOLEAN DEFAULT false,
    
    -- Content
    notes TEXT,
    blockers TEXT[] DEFAULT '{}',
    decisions JSONB DEFAULT '[]',
    
    -- Questions answered/open
    questions_answered JSONB DEFAULT '[]',
    questions_open JSONB DEFAULT '[]',
    
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(blueprint_id, domain_id)
);

-- ============================================================================
-- BLUEPRINT EXPERTISE
-- Who covers what domain
-- ============================================================================

CREATE TABLE IF NOT EXISTS blueprint_expertise (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coverage_id UUID NOT NULL REFERENCES blueprint_domain_coverage(id) ON DELETE CASCADE,
    
    -- Source type
    person_type TEXT NOT NULL CHECK (person_type IN ('team', 'advisor', 'marketplace', 'external', 'ai_agent')),
    
    -- References (one of these will be set)
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    marketplace_listing_id UUID REFERENCES marketplace_listings(id) ON DELETE SET NULL,
    external_contact JSONB, -- {name, email, company, linkedin, notes}
    
    -- Expertise details
    expertise_level TEXT CHECK (expertise_level IN ('expert', 'competent', 'learning')),
    confidence INTEGER CHECK (confidence BETWEEN 0 AND 100),
    verification_status TEXT DEFAULT 'claimed' CHECK (verification_status IN ('verified', 'claimed', 'inferred')),
    specific_skills TEXT[] DEFAULT '{}',
    
    -- Availability
    availability JSONB DEFAULT '{}', -- {status, hours_per_week, response_time}
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- SUPPLIERS
-- Global supplier database
-- ============================================================================

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    website TEXT,
    logo_url TEXT,
    
    -- Type
    supplier_type TEXT NOT NULL CHECK (supplier_type IN ('manufacturer', 'distributor', 'service', 'contract_mfg', 'component', 'testing_lab')),
    
    -- What they provide (domain categories they serve)
    domain_categories TEXT[] DEFAULT '{}',
    capabilities JSONB DEFAULT '{}', -- {min_order_qty, lead_time, certifications, industries, geographies}
    
    -- Company info
    company_info JSONB DEFAULT '{}', -- {headquarters, founded, employees, revenue}
    
    -- Contact
    contact JSONB DEFAULT '{}', -- {sales_email, sales_phone, technical_email}
    
    -- Verification
    verification_status TEXT DEFAULT 'unverified' CHECK (verification_status IN ('verified', 'unverified', 'community_verified')),
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    
    -- Community data
    community_rating NUMERIC(3,2),
    review_count INTEGER DEFAULT 0,
    used_by_count INTEGER DEFAULT 0,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- SUPPLIER REVIEWS
-- User reviews of suppliers
-- ============================================================================

CREATE TABLE IF NOT EXISTS supplier_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title TEXT,
    content TEXT,
    pros TEXT[] DEFAULT '{}',
    cons TEXT[] DEFAULT '{}',
    would_recommend BOOLEAN,
    
    -- Context
    project_type TEXT,
    order_value_range TEXT,
    verified_purchase BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- BLUEPRINT SUPPLIERS
-- Which suppliers are used in which blueprint
-- ============================================================================

CREATE TABLE IF NOT EXISTS blueprint_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blueprint_id UUID NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    
    role TEXT, -- "PCB fabricator", "CM", "component vendor"
    status TEXT DEFAULT 'evaluating' CHECK (status IN ('evaluating', 'active', 'backup', 'inactive')),
    domain_categories TEXT[] DEFAULT '{}', -- Which categories they cover
    
    notes TEXT,
    contact_history JSONB DEFAULT '[]',
    quotes JSONB DEFAULT '[]',
    
    created_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(blueprint_id, supplier_id)
);

-- ============================================================================
-- BLUEPRINT MILESTONES
-- Project milestones with required domains
-- ============================================================================

CREATE TABLE IF NOT EXISTS blueprint_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blueprint_id UUID NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
    
    name TEXT NOT NULL,
    description TEXT,
    target_date DATE,
    
    -- Which domains are required for this milestone
    required_domain_ids UUID[] DEFAULT '{}',
    
    status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'in_progress', 'complete', 'blocked')),
    completed_at TIMESTAMPTZ,
    
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- BLUEPRINT HISTORY
-- Audit log for blueprint changes
-- ============================================================================

CREATE TABLE IF NOT EXISTS blueprint_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blueprint_id UUID NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
    
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Blueprint templates
CREATE INDEX IF NOT EXISTS idx_blueprint_templates_category ON blueprint_templates(product_category);
CREATE INDEX IF NOT EXISTS idx_blueprint_templates_system ON blueprint_templates(is_system_template);

-- Knowledge domains
CREATE INDEX IF NOT EXISTS idx_knowledge_domains_template ON knowledge_domains(template_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_domains_parent ON knowledge_domains(parent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_domains_category ON knowledge_domains(category);

-- Blueprints
CREATE INDEX IF NOT EXISTS idx_blueprints_foundry ON blueprints(foundry_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_template ON blueprints(template_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_status ON blueprints(status);

-- Coverage
CREATE INDEX IF NOT EXISTS idx_blueprint_coverage_blueprint ON blueprint_domain_coverage(blueprint_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_coverage_status ON blueprint_domain_coverage(status);

-- Expertise
CREATE INDEX IF NOT EXISTS idx_blueprint_expertise_coverage ON blueprint_expertise(coverage_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_expertise_profile ON blueprint_expertise(profile_id);

-- Suppliers
CREATE INDEX IF NOT EXISTS idx_suppliers_type ON suppliers(supplier_type);
CREATE INDEX IF NOT EXISTS idx_suppliers_categories ON suppliers USING GIN(domain_categories);

-- Blueprint suppliers
CREATE INDEX IF NOT EXISTS idx_blueprint_suppliers_blueprint ON blueprint_suppliers(blueprint_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_suppliers_supplier ON blueprint_suppliers(supplier_id);

-- History
CREATE INDEX IF NOT EXISTS idx_blueprint_history_blueprint ON blueprint_history(blueprint_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_history_created ON blueprint_history(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE blueprint_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_domain_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_expertise ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_history ENABLE ROW LEVEL SECURITY;

-- Blueprint templates: anyone can read system templates, users can manage their own
CREATE POLICY "Anyone can view system templates" ON blueprint_templates
    FOR SELECT USING (is_system_template = true);

CREATE POLICY "Users can view their own templates" ON blueprint_templates
    FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "Users can create templates" ON blueprint_templates
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own templates" ON blueprint_templates
    FOR UPDATE USING (created_by = auth.uid());

-- Knowledge domains: viewable if template is viewable
CREATE POLICY "View domains for accessible templates" ON knowledge_domains
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM blueprint_templates bt 
            WHERE bt.id = knowledge_domains.template_id 
            AND (bt.is_system_template = true OR bt.created_by = auth.uid())
        )
    );

-- Blueprints: users can only see their foundry's blueprints
CREATE POLICY "Users can view own foundry blueprints" ON blueprints
    FOR SELECT USING (
        foundry_id IN (
            SELECT foundry_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can create blueprints for own foundry" ON blueprints
    FOR INSERT WITH CHECK (
        foundry_id IN (
            SELECT foundry_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update own foundry blueprints" ON blueprints
    FOR UPDATE USING (
        foundry_id IN (
            SELECT foundry_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own foundry blueprints" ON blueprints
    FOR DELETE USING (
        foundry_id IN (
            SELECT foundry_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Coverage: accessible if blueprint is accessible
CREATE POLICY "View coverage for accessible blueprints" ON blueprint_domain_coverage
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM blueprints b 
            WHERE b.id = blueprint_domain_coverage.blueprint_id 
            AND b.foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Manage coverage for own blueprints" ON blueprint_domain_coverage
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM blueprints b 
            WHERE b.id = blueprint_domain_coverage.blueprint_id 
            AND b.foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid())
        )
    );

-- Expertise: accessible if coverage is accessible
CREATE POLICY "View expertise for accessible coverage" ON blueprint_expertise
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM blueprint_domain_coverage bdc
            JOIN blueprints b ON b.id = bdc.blueprint_id
            WHERE bdc.id = blueprint_expertise.coverage_id
            AND b.foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Manage expertise for own blueprints" ON blueprint_expertise
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM blueprint_domain_coverage bdc
            JOIN blueprints b ON b.id = bdc.blueprint_id
            WHERE bdc.id = blueprint_expertise.coverage_id
            AND b.foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid())
        )
    );

-- Suppliers: public read, authenticated write
CREATE POLICY "Anyone can view suppliers" ON suppliers
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create suppliers" ON suppliers
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Verified users can update suppliers" ON suppliers
    FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Supplier reviews: public read, users can manage their own
CREATE POLICY "Anyone can view reviews" ON supplier_reviews
    FOR SELECT USING (true);

CREATE POLICY "Users can create reviews" ON supplier_reviews
    FOR INSERT WITH CHECK (reviewer_id = auth.uid());

CREATE POLICY "Users can update own reviews" ON supplier_reviews
    FOR UPDATE USING (reviewer_id = auth.uid());

CREATE POLICY "Users can delete own reviews" ON supplier_reviews
    FOR DELETE USING (reviewer_id = auth.uid());

-- Blueprint suppliers: accessible if blueprint is accessible
CREATE POLICY "View suppliers for accessible blueprints" ON blueprint_suppliers
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM blueprints b 
            WHERE b.id = blueprint_suppliers.blueprint_id 
            AND b.foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Manage suppliers for own blueprints" ON blueprint_suppliers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM blueprints b 
            WHERE b.id = blueprint_suppliers.blueprint_id 
            AND b.foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid())
        )
    );

-- Milestones: accessible if blueprint is accessible
CREATE POLICY "View milestones for accessible blueprints" ON blueprint_milestones
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM blueprints b 
            WHERE b.id = blueprint_milestones.blueprint_id 
            AND b.foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Manage milestones for own blueprints" ON blueprint_milestones
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM blueprints b 
            WHERE b.id = blueprint_milestones.blueprint_id 
            AND b.foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid())
        )
    );

-- History: accessible if blueprint is accessible
CREATE POLICY "View history for accessible blueprints" ON blueprint_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM blueprints b 
            WHERE b.id = blueprint_history.blueprint_id 
            AND b.foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Create history for own blueprints" ON blueprint_history
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM blueprints b 
            WHERE b.id = blueprint_history.blueprint_id 
            AND b.foundry_id IN (SELECT foundry_id FROM profiles WHERE id = auth.uid())
        )
    );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to calculate coverage score for a blueprint
CREATE OR REPLACE FUNCTION calculate_blueprint_coverage(p_blueprint_id UUID)
RETURNS TABLE(
    coverage_score NUMERIC,
    critical_gaps INTEGER,
    total_domains INTEGER,
    covered_domains INTEGER
) AS $$
DECLARE
    v_total INTEGER;
    v_covered INTEGER;
    v_partial INTEGER;
    v_not_needed INTEGER;
    v_critical_gaps INTEGER;
    v_score NUMERIC;
BEGIN
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'covered'),
        COUNT(*) FILTER (WHERE status = 'partial'),
        COUNT(*) FILTER (WHERE status = 'not_needed'),
        COUNT(*) FILTER (WHERE status = 'gap' AND is_critical = true)
    INTO v_total, v_covered, v_partial, v_not_needed, v_critical_gaps
    FROM blueprint_domain_coverage
    WHERE blueprint_id = p_blueprint_id;
    
    -- Calculate score (partial counts as 0.5)
    IF v_total - v_not_needed > 0 THEN
        v_score := ROUND(((v_covered + v_partial * 0.5)::NUMERIC / (v_total - v_not_needed)) * 100, 1);
    ELSE
        v_score := 100;
    END IF;
    
    RETURN QUERY SELECT v_score, v_critical_gaps, v_total, v_covered;
END;
$$ LANGUAGE plpgsql;

-- Function to update cached metrics on a blueprint
CREATE OR REPLACE FUNCTION update_blueprint_metrics(p_blueprint_id UUID)
RETURNS VOID AS $$
DECLARE
    v_metrics RECORD;
BEGIN
    SELECT * INTO v_metrics FROM calculate_blueprint_coverage(p_blueprint_id);
    
    UPDATE blueprints
    SET 
        coverage_score = v_metrics.coverage_score,
        critical_gaps = v_metrics.critical_gaps,
        total_domains = v_metrics.total_domains,
        covered_domains = v_metrics.covered_domains,
        updated_at = now()
    WHERE id = p_blueprint_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update metrics when coverage changes
CREATE OR REPLACE FUNCTION trigger_update_blueprint_metrics()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM update_blueprint_metrics(OLD.blueprint_id);
        RETURN OLD;
    ELSE
        PERFORM update_blueprint_metrics(NEW.blueprint_id);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_coverage_update_metrics
    AFTER INSERT OR UPDATE OR DELETE ON blueprint_domain_coverage
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_blueprint_metrics();

-- Function to clone a blueprint template into a new blueprint
CREATE OR REPLACE FUNCTION clone_blueprint_from_template(
    p_template_id UUID,
    p_foundry_id TEXT,
    p_name TEXT,
    p_description TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_blueprint_id UUID;
    v_domain RECORD;
BEGIN
    -- Create the blueprint
    INSERT INTO blueprints (
        foundry_id, template_id, name, description, project_type, created_by
    )
    VALUES (
        p_foundry_id, p_template_id, p_name, p_description, 'product', p_created_by
    )
    RETURNING id INTO v_blueprint_id;
    
    -- Copy domains from template to coverage records
    FOR v_domain IN 
        SELECT kd.id, kd.name, kd.category, kd.criticality,
               (
                   SELECT string_agg(parent.name, ' > ' ORDER BY parent.depth)
                   FROM knowledge_domains parent
                   WHERE parent.template_id = kd.template_id
                   AND (
                       parent.id = kd.id 
                       OR parent.id = kd.parent_id
                       OR parent.id IN (
                           SELECT p.parent_id FROM knowledge_domains p WHERE p.id = kd.parent_id
                       )
                   )
               ) as domain_path
        FROM knowledge_domains kd
        WHERE kd.template_id = p_template_id
    LOOP
        INSERT INTO blueprint_domain_coverage (
            blueprint_id, domain_id, domain_name, domain_path, status, is_critical
        )
        VALUES (
            v_blueprint_id, 
            v_domain.id, 
            v_domain.name,
            COALESCE(v_domain.domain_path, v_domain.name),
            'gap',
            v_domain.criticality = 'critical'
        );
    END LOOP;
    
    -- Update metrics
    PERFORM update_blueprint_metrics(v_blueprint_id);
    
    -- Increment template use count
    UPDATE blueprint_templates
    SET use_count = use_count + 1
    WHERE id = p_template_id;
    
    RETURN v_blueprint_id;
END;
$$ LANGUAGE plpgsql;
