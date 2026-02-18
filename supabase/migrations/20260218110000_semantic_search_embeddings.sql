/**
 * Migration: Semantic search embeddings for engineering recommendations
 *
 * Purpose: Add pgvector embedding columns to component_catalogue, tutorials,
 * project_templates, marketplace_listings, and component_compatibility so that
 * RAG can retrieve contextually relevant items before generating recommendations.
 *
 * Embedding model: OpenAI text-embedding-3-small (1536 dimensions)
 *
 * Related:
 * - src/lib/search/semantic-search.ts - Embedding generation and RPC calls
 * - src/actions/cad-lab.ts - RAG injection points
 *
 * Rollback: Drop extension and columns (see end of file).
 */

-- Enable pgvector (required for vector type)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 1. component_catalogue: embed name + tags + geometry summary
-- ============================================================

ALTER TABLE component_catalogue
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_component_catalogue_embedding
  ON component_catalogue
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMENT ON COLUMN component_catalogue.embedding IS 'OpenAI text-embedding-3-small embedding of name, tags, and geometry params summary for semantic search';

-- ============================================================
-- 2. component_compatibility: embed notes + relationship context
-- ============================================================

ALTER TABLE component_compatibility
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_component_compatibility_embedding
  ON component_compatibility
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMENT ON COLUMN component_compatibility.embedding IS 'Embedding of component_a, component_b, relationship, notes, domain for semantic search';

-- ============================================================
-- 3. tutorials: embed title + description + sections summary
-- ============================================================

ALTER TABLE tutorials
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_tutorials_embedding
  ON tutorials
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMENT ON COLUMN tutorials.embedding IS 'Embedding of title, description, topic, tags for semantic search';

-- ============================================================
-- 4. project_templates: embed title + description + BOM summary
-- ============================================================

ALTER TABLE project_templates
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_project_templates_embedding
  ON project_templates
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMENT ON COLUMN project_templates.embedding IS 'Embedding of title, description, category, tags, BOM summary for semantic search';

-- ============================================================
-- 5. marketplace_listings: embed title + description + attributes
-- ============================================================

ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_embedding
  ON marketplace_listings
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMENT ON COLUMN marketplace_listings.embedding IS 'Embedding of title, description, category, subcategory, attributes for semantic search';

-- ============================================================
-- RPC: Match components by embedding similarity
-- ============================================================

CREATE OR REPLACE FUNCTION match_components(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  name text,
  manufacturer text,
  part_number text,
  geometry_type_slug text,
  tags text[],
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cc.id,
    cc.name,
    cc.manufacturer,
    cc.part_number,
    cc.geometry_type_slug,
    cc.tags,
    1 - (cc.embedding <=> query_embedding) AS similarity
  FROM component_catalogue cc
  WHERE cc.embedding IS NOT NULL
    AND (1 - (cc.embedding <=> query_embedding)) >= match_threshold
  ORDER BY cc.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_components IS 'Semantic search over component_catalogue for RAG; returns top-k by cosine similarity';

-- ============================================================
-- RPC: Match compatibility pairs by embedding similarity
-- ============================================================

CREATE OR REPLACE FUNCTION match_component_compatibility(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.4,
  match_count int DEFAULT 15
)
RETURNS TABLE (
  id uuid,
  component_a text,
  component_b text,
  relationship text,
  notes text,
  domain text,
  confidence numeric,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ccomp.id,
    ccomp.component_a,
    ccomp.component_b,
    ccomp.relationship,
    ccomp.notes,
    ccomp.domain,
    ccomp.confidence,
    1 - (ccomp.embedding <=> query_embedding) AS similarity
  FROM component_compatibility ccomp
  WHERE ccomp.embedding IS NOT NULL
    AND (1 - (ccomp.embedding <=> query_embedding)) >= match_threshold
  ORDER BY ccomp.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_component_compatibility IS 'Semantic search over component_compatibility for RAG';

-- ============================================================
-- RPC: Match tutorials by embedding similarity
-- ============================================================

CREATE OR REPLACE FUNCTION match_tutorials(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.4,
  match_count int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  title text,
  slug text,
  description text,
  topic text,
  difficulty text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.title,
    t.slug,
    t.description,
    t.topic,
    t.difficulty,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM tutorials t
  WHERE t.embedding IS NOT NULL
    AND (1 - (t.embedding <=> query_embedding)) >= match_threshold
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_tutorials IS 'Semantic search over tutorials for RAG';

-- ============================================================
-- RPC: Match project templates by embedding similarity
-- ============================================================

CREATE OR REPLACE FUNCTION match_project_templates(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.4,
  match_count int DEFAULT 6
)
RETURNS TABLE (
  id uuid,
  title text,
  slug text,
  description text,
  category text,
  difficulty text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pt.id,
    pt.title,
    pt.slug,
    pt.description,
    pt.category,
    pt.difficulty,
    1 - (pt.embedding <=> query_embedding) AS similarity
  FROM project_templates pt
  WHERE pt.embedding IS NOT NULL
    AND (1 - (pt.embedding <=> query_embedding)) >= match_threshold
  ORDER BY pt.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_project_templates IS 'Semantic search over project_templates for RAG';

-- ============================================================
-- RPC: Match marketplace listings by embedding similarity
-- ============================================================

CREATE OR REPLACE FUNCTION match_marketplace_listings(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.4,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  category text,
  subcategory text,
  title text,
  description text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ml.id,
    ml.category::text,
    ml.subcategory,
    ml.title,
    ml.description,
    1 - (ml.embedding <=> query_embedding) AS similarity
  FROM marketplace_listings ml
  WHERE ml.embedding IS NOT NULL
    AND (1 - (ml.embedding <=> query_embedding)) >= match_threshold
  ORDER BY ml.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_marketplace_listings IS 'Semantic search over marketplace_listings for RAG';
