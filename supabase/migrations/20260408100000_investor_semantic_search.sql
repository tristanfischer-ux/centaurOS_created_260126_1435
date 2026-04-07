-- Migration: Add semantic search (pgvector embeddings) to investor_grants,
-- investor_portfolio_companies, and vc_pe_contacts.
-- Pattern: Same as marketplace_listings embedding (text-embedding-3-small, 1536 dims, HNSW cosine).

-- ============================================================
-- 1. investor_grants — semantic search for grant discovery
-- ============================================================

ALTER TABLE investor_grants
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_investor_grants_embedding
  ON investor_grants
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMENT ON COLUMN investor_grants.embedding IS
  'OpenAI text-embedding-3-small embedding of grant_name + managing_body + description + sector_focus + stage_focus + eligibility_summary';

CREATE OR REPLACE FUNCTION match_investor_grants(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.4,
  match_count int DEFAULT 25
)
RETURNS TABLE (
  id uuid,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.id,
    1 - (g.embedding <=> query_embedding) AS similarity
  FROM investor_grants g
  WHERE g.embedding IS NOT NULL
    AND (1 - (g.embedding <=> query_embedding)) >= match_threshold
  ORDER BY g.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ============================================================
-- 2. investor_portfolio_companies — semantic search for portfolio discovery
-- ============================================================

ALTER TABLE investor_portfolio_companies
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_ipc_embedding
  ON investor_portfolio_companies
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMENT ON COLUMN investor_portfolio_companies.embedding IS
  'OpenAI text-embedding-3-small embedding of company_name + sector + stage + description';

CREATE OR REPLACE FUNCTION match_portfolio_companies(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.4,
  match_count int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pc.id,
    1 - (pc.embedding <=> query_embedding) AS similarity
  FROM investor_portfolio_companies pc
  WHERE pc.embedding IS NOT NULL
    AND (1 - (pc.embedding <=> query_embedding)) >= match_threshold
  ORDER BY pc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ============================================================
-- 3. vc_pe_contacts — semantic search for people discovery
-- ============================================================

ALTER TABLE vc_pe_contacts
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_vc_pe_contacts_embedding
  ON vc_pe_contacts
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMENT ON COLUMN vc_pe_contacts.embedding IS
  'OpenAI text-embedding-3-small embedding of full_name + title + firm_name + bio';

CREATE OR REPLACE FUNCTION match_vc_pe_contacts(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.4,
  match_count int DEFAULT 25
)
RETURNS TABLE (
  id uuid,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM vc_pe_contacts c
  WHERE c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) >= match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
