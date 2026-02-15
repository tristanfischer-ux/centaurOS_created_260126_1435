-- ═══════════════════════════════════════════════════════════════════════
-- Migration: Fix search_forge_map_factories function
--
-- Purpose: Fixes SELECT DISTINCT + ORDER BY conflict by removing the
-- LEFT JOIN approach and using EXISTS subquery for capability filtering.
-- Each factory now appears exactly once in results.
--
-- Rollback: Re-run the original CREATE OR REPLACE from the previous migration.
-- ═══════════════════════════════════════════════════════════════════════

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
