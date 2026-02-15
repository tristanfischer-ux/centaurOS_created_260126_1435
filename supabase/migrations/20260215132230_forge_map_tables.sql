-- ═══════════════════════════════════════════════════════════════════════
-- Migration: Forge Map — Manufacturing Factory Database
--
-- Purpose: Creates the Forge Map tables for storing UK/EU manufacturer
-- data enriched by the overnight pipeline (Companies House + LLM extraction).
-- This is shared reference data — all authenticated users can read,
-- only the enrichment pipeline (service_role) can write.
--
-- Tables:
--   forge_map_factories      — Company profiles with PostGIS location
--   forge_map_capabilities   — Structured process/material capabilities
--   forge_map_reviews        — Per-foundry performance reviews (foundry-isolated)
--
-- Functions:
--   search_forge_map_factories() — Spatial + capability search RPC
--
-- Security:
--   - forge_map_factories/capabilities: authenticated SELECT, service_role write
--   - forge_map_reviews: standard foundry isolation via RLS
--   - Enrichment pipeline on Mac Studio uses service_role key to bypass RLS
--
-- Related:
--   - Mac Studio pipeline: ~/forgeos/forge-map/enrich_to_supabase.py
--   - Future UI: src/app/(platform)/forge-map/ (Phase 2)
--   - Existing supplier matching: src/app/(platform)/the-forge/services/suppliers.ts
--
-- Rollback: DROP TABLE forge_map_reviews, forge_map_capabilities, forge_map_factories CASCADE;
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Enable PostGIS Extension ────────────────────────────────────────
-- Required for GEOGRAPHY(POINT, 4326) columns and spatial queries.
-- If this fails, enable manually: Dashboard → Database → Extensions → postgis
CREATE EXTENSION IF NOT EXISTS postgis;

-- ═══ FORGE MAP FACTORIES ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.forge_map_factories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Companies House identifiers
    company_number TEXT UNIQUE,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,

    -- Location
    registered_address JSONB,
    postcode TEXT,
    location GEOGRAPHY(POINT, 4326),
    country TEXT DEFAULT 'GB',

    -- Contact
    website TEXT,
    email TEXT,
    phone TEXT,

    -- Companies House metadata
    company_type TEXT,
    company_status TEXT DEFAULT 'active',
    date_of_creation TEXT,
    sic_codes TEXT[],
    sic_descriptions TEXT[],

    -- Enriched profile data (populated by LLM extraction pipeline)
    employee_count_estimate TEXT,
    industries_served TEXT[],
    certifications TEXT[],
    equipment_mentioned TEXT[],
    summary TEXT,

    -- Trust & quality scoring
    trust_score DECIMAL(3,2) DEFAULT 0.50,

    -- Pipeline metadata
    data_source TEXT DEFAULT 'companies_house',
    enrichment_status TEXT DEFAULT 'pending'
        CHECK (enrichment_status IN ('pending', 'scraping', 'enriched', 'no_website', 'failed')),
    enrichment_date TIMESTAMPTZ,
    raw_website_text TEXT,
    llm_extraction JSONB,
    extraction_confidence DECIMAL(3,2),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.forge_map_factories IS
    'UK/EU manufacturing companies enriched from Companies House + website scraping + LLM extraction. Shared reference data — all users can read, only enrichment pipeline writes.';

-- ═══ FORGE MAP CAPABILITIES ════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.forge_map_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID NOT NULL REFERENCES public.forge_map_factories(id) ON DELETE CASCADE,

    -- Standardised process taxonomy
    -- Categories: additive, subtractive, forming, joining, finishing, pcb, assembly, testing
    process_category TEXT NOT NULL,
    process_type TEXT NOT NULL,

    -- Materials this capability applies to
    materials TEXT[],

    -- Size constraints (mm)
    max_size_x_mm INTEGER,
    max_size_y_mm INTEGER,
    max_size_z_mm INTEGER,

    -- Precision
    tolerance_mm DECIMAL,
    surface_finish_ra_um DECIMAL,

    -- Capacity
    min_order_qty INTEGER DEFAULT 1,
    lead_time_days INTEGER,
    price_tier TEXT CHECK (price_tier IN ('budget', 'mid', 'premium', NULL)),

    -- Confidence in this data (0.0 = guessed, 1.0 = verified)
    confidence DECIMAL(3,2) DEFAULT 0.50,
    source TEXT DEFAULT 'llm_extraction'
        CHECK (source IN ('llm_extraction', 'manual', 'verified', 'self_reported')),

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.forge_map_capabilities IS
    'Structured manufacturing capabilities per factory. Each row = one process a factory can perform. Populated by LLM extraction from factory websites.';

-- ═══ FORGE MAP REVIEWS ═════════════════════════════════════════════
-- Per-foundry performance tracking. A foundry's experience with a factory
-- is private to that foundry.

CREATE TABLE IF NOT EXISTS public.forge_map_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID NOT NULL REFERENCES public.forge_map_factories(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Order reference (optional link to existing RFQ system)
    rfq_id UUID,

    -- Delivery performance
    order_date TIMESTAMPTZ,
    on_time BOOLEAN,
    promised_date DATE,
    actual_date DATE,

    -- Quality scores (1-5)
    quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 5),
    dimensional_accuracy INTEGER CHECK (dimensional_accuracy BETWEEN 1 AND 5),
    surface_quality INTEGER CHECK (surface_quality BETWEEN 1 AND 5),
    communication_score INTEGER CHECK (communication_score BETWEEN 1 AND 5),

    -- Cost accuracy
    price_vs_quote_pct DECIMAL,

    -- Free-text notes
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.forge_map_reviews IS
    'Per-foundry performance reviews of factories. Foundry-isolated — each foundry only sees their own reviews.';

-- ═══ INDEXES ═══════════════════════════════════════════════════════

-- Factories: spatial + lookup indexes
CREATE INDEX IF NOT EXISTS idx_forge_map_factories_location
    ON public.forge_map_factories USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_forge_map_factories_postcode
    ON public.forge_map_factories (postcode);
CREATE INDEX IF NOT EXISTS idx_forge_map_factories_enrichment_status
    ON public.forge_map_factories (enrichment_status);
CREATE INDEX IF NOT EXISTS idx_forge_map_factories_company_number
    ON public.forge_map_factories (company_number);
CREATE INDEX IF NOT EXISTS idx_forge_map_factories_certifications
    ON public.forge_map_factories USING GIN (certifications);
CREATE INDEX IF NOT EXISTS idx_forge_map_factories_industries
    ON public.forge_map_factories USING GIN (industries_served);

-- Capabilities: lookup indexes
CREATE INDEX IF NOT EXISTS idx_forge_map_capabilities_factory
    ON public.forge_map_capabilities (factory_id);
CREATE INDEX IF NOT EXISTS idx_forge_map_capabilities_process
    ON public.forge_map_capabilities (process_category, process_type);
CREATE INDEX IF NOT EXISTS idx_forge_map_capabilities_materials
    ON public.forge_map_capabilities USING GIN (materials);

-- Reviews: foundry isolation + factory lookup
CREATE INDEX IF NOT EXISTS idx_forge_map_reviews_factory
    ON public.forge_map_reviews (factory_id);
CREATE INDEX IF NOT EXISTS idx_forge_map_reviews_foundry
    ON public.forge_map_reviews (foundry_id);

-- ═══ ROW LEVEL SECURITY ════════════════════════════════════════════

-- Factories: shared reference data (read-only for users, service_role writes)
ALTER TABLE public.forge_map_factories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_factories"
    ON public.forge_map_factories
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Capabilities: shared reference data (read-only for users, service_role writes)
ALTER TABLE public.forge_map_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_capabilities"
    ON public.forge_map_capabilities
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Reviews: foundry-isolated (standard ForgeOS pattern)
ALTER TABLE public.forge_map_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_own_foundry_reviews"
    ON public.forge_map_reviews
    FOR SELECT
    USING (
        foundry_id IN (
            SELECT p.foundry_id FROM public.profiles p WHERE p.id = auth.uid()
        )
    );

CREATE POLICY "create_own_foundry_reviews"
    ON public.forge_map_reviews
    FOR INSERT
    WITH CHECK (
        reviewed_by = auth.uid()
        AND foundry_id IN (
            SELECT p.foundry_id FROM public.profiles p WHERE p.id = auth.uid()
        )
    );

CREATE POLICY "update_own_reviews"
    ON public.forge_map_reviews
    FOR UPDATE
    USING (reviewed_by = auth.uid())
    WITH CHECK (reviewed_by = auth.uid());

CREATE POLICY "delete_own_reviews"
    ON public.forge_map_reviews
    FOR DELETE
    USING (reviewed_by = auth.uid());

-- ═══ SPATIAL SEARCH FUNCTION ═══════════════════════════════════════
-- Callable from TypeScript via: supabase.rpc('search_forge_map_factories', { ... })

CREATE OR REPLACE FUNCTION public.search_forge_map_factories(
    p_process_type TEXT DEFAULT NULL,
    p_material TEXT DEFAULT NULL,
    p_lat DOUBLE PRECISION DEFAULT NULL,
    p_lng DOUBLE PRECISION DEFAULT NULL,
    p_max_distance_km INTEGER DEFAULT 200,
    p_certification TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    factory_id UUID,
    factory_name TEXT,
    factory_website TEXT,
    postcode TEXT,
    distance_km DOUBLE PRECISION,
    capabilities JSONB,
    certifications TEXT[],
    trust_score DECIMAL,
    summary TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        f.name,
        f.website,
        f.postcode,
        CASE
            WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND f.location IS NOT NULL
            THEN ST_Distance(
                f.location,
                ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
            ) / 1000.0
            ELSE NULL::DOUBLE PRECISION
        END AS distance_km,
        (
            SELECT jsonb_agg(jsonb_build_object(
                'process_category', fc2.process_category,
                'process_type', fc2.process_type,
                'materials', fc2.materials,
                'confidence', fc2.confidence
            ))
            FROM public.forge_map_capabilities fc2
            WHERE fc2.factory_id = f.id
        ) AS capabilities,
        f.certifications,
        f.trust_score,
        f.summary
    FROM public.forge_map_factories f
    WHERE f.enrichment_status = 'enriched'
        AND (p_certification IS NULL OR p_certification = ANY(f.certifications))
        AND (
            p_lat IS NULL OR p_lng IS NULL OR f.location IS NULL
            OR ST_DWithin(
                f.location,
                ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
                p_max_distance_km * 1000
            )
        )
        -- Filter by capability: only include factories that have a matching capability
        AND (
            (p_process_type IS NULL AND p_material IS NULL)
            OR EXISTS (
                SELECT 1 FROM public.forge_map_capabilities fc
                WHERE fc.factory_id = f.id
                    AND (p_process_type IS NULL OR fc.process_type = p_process_type)
                    AND (p_material IS NULL OR p_material = ANY(fc.materials))
            )
        )
    ORDER BY
        CASE
            WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND f.location IS NOT NULL
            THEN ST_Distance(
                f.location,
                ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
            )
            ELSE 0
        END ASC,
        f.trust_score DESC
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.search_forge_map_factories IS
    'Spatial + capability search for manufacturing factories. Filters by process type, material, certification, and geographic distance. Returns ranked results.';

-- ═══ AUTO-UPDATE TIMESTAMPS ════════════════════════════════════════

-- Reuse existing trigger function if it exists, otherwise create
CREATE OR REPLACE FUNCTION public.forge_map_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS forge_map_factories_updated_at ON public.forge_map_factories;
CREATE TRIGGER forge_map_factories_updated_at
    BEFORE UPDATE ON public.forge_map_factories
    FOR EACH ROW
    EXECUTE FUNCTION public.forge_map_update_updated_at();
