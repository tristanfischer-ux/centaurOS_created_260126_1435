/**
 * Migration: Semantic search embeddings for step_templates
 *
 * Purpose: Add pgvector embedding column to step_templates so that modules
 * can be matched to STEP templates by semantic similarity instead of relying
 * solely on keyword overlap. This enables a hybrid matching strategy that
 * significantly improves template recall for the thousands of available STEP files.
 *
 * Embedding model: OpenAI text-embedding-3-small (1536 dimensions)
 *
 * Related:
 * - src/actions/step-template-matching.ts - Hybrid keyword + semantic matching
 * - src/lib/search/semantic-search.ts - embedText() helper
 * - scripts/backfill-step-template-embeddings.ts - One-shot backfill script
 * - supabase/migrations/20260218110000_semantic_search_embeddings.sql - Pattern reference
 *
 * Rollback: ALTER TABLE step_templates DROP COLUMN IF EXISTS embedding;
 *           DROP FUNCTION IF EXISTS match_step_templates;
 */

-- pgvector should already be enabled from 20260218110000, but be safe
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 1. Add embedding column to step_templates
-- ============================================================

ALTER TABLE step_templates
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_step_templates_embedding
  ON step_templates
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMENT ON COLUMN step_templates.embedding IS 'OpenAI text-embedding-3-small embedding of name, category, subcategory, description, tags for semantic template matching';

-- ============================================================
-- 2. RPC: Match step templates by embedding similarity
-- ============================================================

CREATE OR REPLACE FUNCTION match_step_templates(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.35,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  slug text,
  name text,
  category text,
  subcategory text,
  description text,
  step_url text,
  tags text[],
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    st.slug,
    st.name,
    st.category,
    st.subcategory,
    st.description,
    st.step_url,
    st.tags,
    1 - (st.embedding <=> query_embedding) AS similarity
  FROM step_templates st
  WHERE st.embedding IS NOT NULL
    AND st.step_url IS NOT NULL
    AND (1 - (st.embedding <=> query_embedding)) >= match_threshold
  ORDER BY st.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_step_templates IS 'Semantic search over step_templates for hybrid template matching in CAD Lab';
