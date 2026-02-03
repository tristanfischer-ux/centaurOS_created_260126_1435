-- =============================================
-- Universal Subsystems for Product Guidance
-- =============================================
-- These are cross-sector technical domains that apply to ANY company
-- needing that capability. Each subsystem has detailed primers,
-- key questions, decision points, and pre-built objective packs
-- that include marketplace discovery tasks.
-- =============================================

-- =============================================
-- SECTION 1: Universal Subsystems Table
-- =============================================

CREATE TABLE IF NOT EXISTS public.universal_subsystems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    name TEXT NOT NULL,                              -- "Propulsion Systems"
    slug TEXT UNIQUE NOT NULL,                       -- "propulsion-systems"
    tagline TEXT,                                    -- Brief one-liner
    description TEXT,                                -- Full description
    category TEXT NOT NULL,                          -- Electronics, Mechanical, Software, etc.
    icon_name TEXT DEFAULT 'Box',                    -- Lucide icon name
    
    -- Detailed Primer Content
    primer JSONB DEFAULT '{}'::jsonb,                -- Structured primer content
    -- primer structure:
    -- {
    --   "overview": "Full explanation of what this subsystem entails...",
    --   "why_it_matters": "Explanation of criticality...",
    --   "key_concepts": ["concept1", "concept2"],
    --   "decision_points": ["decision1", "decision2"],
    --   "common_mistakes": ["mistake1", "mistake2"],
    --   "success_indicators": ["indicator1", "indicator2"],
    --   "terminology": {"term1": "definition1", "term2": "definition2"},
    --   "related_subsystems": ["uuid1", "uuid2"]
    -- }
    
    -- Questions to Answer
    key_questions JSONB DEFAULT '[]'::jsonb,         -- Questions for assessment
    -- key_questions structure:
    -- [
    --   {"id": "q1", "question": "...", "context": "...", "difficulty": "basic"},
    --   {"id": "q2", "question": "...", "context": "...", "difficulty": "intermediate"}
    -- ]
    
    -- Learning Resources
    learning_resources JSONB DEFAULT '{}'::jsonb,    -- Curated resources
    -- {
    --   "courses": [{"title": "...", "url": "...", "provider": "..."}],
    --   "books": [{"title": "...", "author": "...", "url": "..."}],
    --   "articles": [{"title": "...", "url": "..."}],
    --   "communities": [{"title": "...", "url": "..."}]
    -- }
    
    -- Marketplace Integration
    marketplace_categories TEXT[] DEFAULT ARRAY[]::TEXT[],   -- Categories for filtering
    recommended_executive_roles TEXT[] DEFAULT ARRAY[]::TEXT[], -- "Fractional CTO", "VP Engineering"
    recommended_supplier_types TEXT[] DEFAULT ARRAY[]::TEXT[],  -- "manufacturer", "service"
    
    -- Display
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add comment
COMMENT ON TABLE public.universal_subsystems IS 'Cross-sector technical domains with detailed primers and marketplace integration. Used in Product Guidance for actionable advice.';

-- Enable RLS
ALTER TABLE public.universal_subsystems ENABLE ROW LEVEL SECURITY;

-- Everyone can view subsystems (public content)
CREATE POLICY "anyone_view_subsystems" ON public.universal_subsystems
    FOR SELECT USING (true);

-- Service role manages subsystems
CREATE POLICY "service_manage_subsystems" ON public.universal_subsystems
    FOR ALL USING (auth.role() = 'service_role');

-- Index for display order
CREATE INDEX IF NOT EXISTS idx_universal_subsystems_order ON public.universal_subsystems(display_order);
CREATE INDEX IF NOT EXISTS idx_universal_subsystems_category ON public.universal_subsystems(category);
CREATE INDEX IF NOT EXISTS idx_universal_subsystems_slug ON public.universal_subsystems(slug);

-- =============================================
-- SECTION 2: Subsystem Objective Packs Table
-- =============================================

CREATE TABLE IF NOT EXISTS public.subsystem_objective_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subsystem_id UUID NOT NULL REFERENCES public.universal_subsystems(id) ON DELETE CASCADE,
    
    -- Objective Details
    title TEXT NOT NULL,                             -- "Establish Propulsion Strategy"
    summary TEXT,                                    -- Brief summary
    extended_description TEXT,                       -- Full markdown description
    
    -- Pre-built Tasks
    tasks JSONB NOT NULL DEFAULT '[]'::jsonb,       -- Array of task definitions
    -- tasks structure:
    -- [
    --   {
    --     "order": 1,
    --     "title": "Define propulsion requirements",
    --     "description": "Full detailed description of what this task involves...",
    --     "role": "Executive",
    --     "estimated_hours": 4,
    --     "is_marketplace_task": false
    --   },
    --   {
    --     "order": 5,
    --     "title": "Find propulsion engineering expert",
    --     "description": "Search the CentaurOS marketplace for...",
    --     "role": "Executive",
    --     "is_marketplace_task": true,
    --     "marketplace_filter": {
    --       "categories": ["propulsion", "aerospace"],
    --       "type": "advice"
    --     }
    --   }
    -- ]
    
    -- Metadata
    difficulty TEXT DEFAULT 'intermediate' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
    estimated_duration TEXT,                         -- "2-4 weeks"
    is_default BOOLEAN DEFAULT false,                -- Default pack for subsystem
    
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add comment
COMMENT ON TABLE public.subsystem_objective_packs IS 'Pre-built objective templates for universal subsystems. Each pack includes technical tasks plus marketplace discovery tasks.';

-- Enable RLS
ALTER TABLE public.subsystem_objective_packs ENABLE ROW LEVEL SECURITY;

-- Everyone can view packs (public content)
CREATE POLICY "anyone_view_packs" ON public.subsystem_objective_packs
    FOR SELECT USING (true);

-- Service role manages packs
CREATE POLICY "service_manage_packs" ON public.subsystem_objective_packs
    FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subsystem_packs_subsystem ON public.subsystem_objective_packs(subsystem_id);
CREATE INDEX IF NOT EXISTS idx_subsystem_packs_default ON public.subsystem_objective_packs(is_default) WHERE is_default = true;

-- =============================================
-- SECTION 3: Blueprint-to-Subsystem Mapping
-- =============================================

CREATE TABLE IF NOT EXISTS public.blueprint_subsystem_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.blueprint_templates(id) ON DELETE CASCADE,
    subsystem_id UUID NOT NULL REFERENCES public.universal_subsystems(id) ON DELETE CASCADE,
    
    -- Relevance for this sector
    relevance TEXT DEFAULT 'important' CHECK (relevance IN ('critical', 'important', 'optional')),
    context_notes TEXT,                              -- Sector-specific guidance
    
    display_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Prevent duplicates
    UNIQUE(template_id, subsystem_id)
);

-- Add comment
COMMENT ON TABLE public.blueprint_subsystem_mapping IS 'Maps universal subsystems to sector-specific blueprint templates, showing which subsystems are relevant for each company type.';

-- Enable RLS
ALTER TABLE public.blueprint_subsystem_mapping ENABLE ROW LEVEL SECURITY;

-- Everyone can view mappings
CREATE POLICY "anyone_view_mappings" ON public.blueprint_subsystem_mapping
    FOR SELECT USING (true);

-- Service role manages mappings
CREATE POLICY "service_manage_mappings" ON public.blueprint_subsystem_mapping
    FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_blueprint_subsystem_template ON public.blueprint_subsystem_mapping(template_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_subsystem_subsystem ON public.blueprint_subsystem_mapping(subsystem_id);

-- =============================================
-- SECTION 4: Triggers for updated_at
-- =============================================

-- Updated_at trigger for universal_subsystems
CREATE TRIGGER update_universal_subsystems_updated_at
    BEFORE UPDATE ON public.universal_subsystems
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Updated_at trigger for subsystem_objective_packs
CREATE TRIGGER update_subsystem_packs_updated_at
    BEFORE UPDATE ON public.subsystem_objective_packs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
