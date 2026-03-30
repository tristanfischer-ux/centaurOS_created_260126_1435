-- ============================================================
-- Knowledge Vault Semantic Search
-- ============================================================
-- Adds pgvector embeddings to knowledge_notes for semantic search.
-- Uses OpenAI text-embedding-3-small (1536 dims) — same model as
-- engineering semantic search (migration 20260218110000).
-- ============================================================

-- pgvector already enabled (from 20260218110000), safe to call again
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (nullable — populated async after note creation)
ALTER TABLE knowledge_notes
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- HNSW index for fast approximate cosine similarity search.
-- m=16, ef_construction=64 balances index build time vs recall quality.
CREATE INDEX IF NOT EXISTS idx_knowledge_notes_embedding
  ON knowledge_notes USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================
-- RPC: Semantic search over knowledge notes
-- ============================================================
-- Returns notes matching a query embedding above a similarity
-- threshold, scoped to a single foundry. Used by the Knowledge
-- page search and the specialist query_past_advice tool.
-- ============================================================

CREATE OR REPLACE FUNCTION match_knowledge_notes(
  query_embedding vector(1536),
  p_foundry_id text,
  match_threshold float DEFAULT 0.4,
  match_count int DEFAULT 15
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  description text,
  note_type text,
  domain_id uuid,
  source_specialist text,
  tags text[],
  confidence real,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    kn.id,
    kn.title,
    kn.content,
    kn.description,
    kn.note_type,
    kn.domain_id,
    kn.source_specialist,
    kn.tags,
    kn.confidence,
    1 - (kn.embedding <=> query_embedding) AS similarity
  FROM knowledge_notes kn
  WHERE kn.foundry_id = p_foundry_id
    AND kn.is_archived = false
    AND kn.embedding IS NOT NULL
    AND 1 - (kn.embedding <=> query_embedding) >= match_threshold
  ORDER BY kn.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_knowledge_notes IS
  'Semantic search over knowledge_notes for RAG; returns top-k by cosine similarity, foundry-scoped';

-- ============================================================
-- Helper RPC: Update embedding for a knowledge note
-- ============================================================
-- PostgREST schema cache doesn't expose pgvector columns via the
-- REST API. This RPC provides a workaround for server-side code
-- and backfill scripts to set embeddings.
-- ============================================================

CREATE OR REPLACE FUNCTION update_knowledge_embedding(
  p_note_id uuid,
  p_embedding text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE knowledge_notes
  SET embedding = p_embedding::vector
  WHERE id = p_note_id;
END;
$$;

COMMENT ON FUNCTION update_knowledge_embedding IS
  'Helper to update pgvector embedding on knowledge_notes (PostgREST workaround)';
