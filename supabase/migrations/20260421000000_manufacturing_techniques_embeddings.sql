-- ============================================================
-- Manufacturing techniques: vector-backed semantic retrieval
-- ============================================================
--
-- INTENT: Tristan's directive 2026-04-18 for Forge Source overhaul —
-- Manufacturing Intelligence (shown on the Specify page "DfM" tab) must
-- become vector-backed and extensive. Previously the tab read a static
-- 45-technique library in src/lib/manufacturing-techniques/data.ts.
--
-- This migration adds embedding columns + HNSW indexes + a semantic match
-- RPC to the two technique tables that already exist:
--   - process_capabilities (20 rows, engineering_handbook)
--   - manufacturing_technique_enrichments (27 rows, real-world enrichments)
--
-- Model: nomic-embed-text-v1.5 at 768 dims. Same model as marketplace_listings
-- (migration 20260414200000) so cross-table semantic joins produce comparable
-- similarity scores. When we match techniques against matching suppliers the
-- cosine similarities live on the same scale.
--
-- GOTCHA: `content_hash` column lets the re-embed worker detect stale rows
-- cheaply (hash of concatenated content vs last-embedded hash). Without it
-- we'd need to re-embed every row every night even when nothing changed.

-- 1. process_capabilities — engineering-handbook tolerances, material lists
ALTER TABLE public.process_capabilities
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_process_capabilities_embedding
  ON public.process_capabilities
  USING hnsw (embedding vector_cosine_ops);

-- 2. manufacturing_technique_enrichments — article content, real-world data
ALTER TABLE public.manufacturing_technique_enrichments
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS embedded_at timestamptz,
  -- Reviewed flag lets LLM-seeded rows sit in the table without leaking
  -- into production retrieval until a human (or second-pass LLM) signs off.
  ADD COLUMN IF NOT EXISTS reviewed boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mfg_technique_enrichments_embedding
  ON public.manufacturing_technique_enrichments
  USING hnsw (embedding vector_cosine_ops);

-- 3. Semantic match RPC for techniques.
--
-- Returns enrichment rows joined with their process_capabilities counterpart
-- (by technique_slug ↔ process_name) so a single call surfaces both the
-- engineering-handbook tolerances AND the real-world supplier tips.
--
-- SECURITY: SECURITY INVOKER is fine — both tables are public reference data
-- (no foundry_id, no tenant scoping). Callers still need to be authenticated
-- via existing RLS on parent actions.
CREATE OR REPLACE FUNCTION public.match_manufacturing_techniques(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.45,
  match_count int DEFAULT 8,
  only_reviewed boolean DEFAULT true
)
RETURNS TABLE (
  technique_slug text,
  display_name text,
  article_markdown text,
  tolerance_typical_mm real,
  tolerance_min_mm real,
  tolerance_max_mm real,
  suitable_materials text[],
  unsuitable_materials text[],
  typical_lead_time_days int,
  real_world_tolerances jsonb,
  real_world_materials jsonb,
  real_world_equipment jsonb,
  tips_and_insights jsonb,
  common_applications jsonb,
  supplier_count int,
  source text,
  reviewed boolean,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE(e.technique_slug, pc.process_name) AS technique_slug,
    COALESCE(pc.display_name, e.technique_slug) AS display_name,
    e.article_markdown,
    pc.tolerance_typical_mm,
    pc.tolerance_min_mm,
    pc.tolerance_max_mm,
    pc.suitable_materials,
    pc.unsuitable_materials,
    pc.typical_lead_time_days,
    e.real_world_tolerances,
    e.real_world_materials,
    e.real_world_equipment,
    e.tips_and_insights,
    e.common_applications,
    e.supplier_count,
    COALESCE(e.source, pc.source) AS source,
    COALESCE(e.reviewed, true) AS reviewed,
    -- Score by whichever table has the embedding. When both do, take the
    -- stronger match — enrichment has richer article text so usually wins.
    GREATEST(
      CASE WHEN e.embedding IS NOT NULL
           THEN 1 - (e.embedding <=> query_embedding)
           ELSE 0 END,
      CASE WHEN pc.embedding IS NOT NULL
           THEN 1 - (pc.embedding <=> query_embedding)
           ELSE 0 END
    ) AS similarity
  FROM public.manufacturing_technique_enrichments e
    FULL OUTER JOIN public.process_capabilities pc
      ON pc.process_name = e.technique_slug
  WHERE (
    (e.embedding IS NOT NULL AND 1 - (e.embedding <=> query_embedding) > match_threshold)
    OR
    (pc.embedding IS NOT NULL AND 1 - (pc.embedding <=> query_embedding) > match_threshold)
  )
  AND (only_reviewed = false OR COALESCE(e.reviewed, true) = true)
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

COMMENT ON FUNCTION public.match_manufacturing_techniques IS
  'Semantic retrieval over manufacturing_technique_enrichments (join w/ process_capabilities). Used by Forge DfM tab to surface the most relevant techniques for a module spec. Set only_reviewed=false to include LLM-seeded unreviewed rows.';
