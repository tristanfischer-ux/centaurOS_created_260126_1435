/**
 * Migration: Semantic search embeddings for specialist memory
 *
 * Purpose: Add pgvector embedding columns to agent_memory_observations and
 * specialist_decision_journal so specialists can recall past conversations
 * and decisions via semantic search across all threads.
 *
 * Embedding model: OpenAI text-embedding-3-small (1536 dimensions)
 *
 * Related:
 * - src/lib/agent-memory/semantic-search.ts - Search functions
 * - src/lib/agent-memory/manager.ts - Embed-on-write for observations
 * - src/lib/agents/decision-journal.ts - Embed-on-write for decisions
 * - src/lib/agents/prompt-builder.ts - Context layer integration
 */

-- ============================================================
-- 1. agent_memory_observations: embed observation summaries
-- ============================================================

ALTER TABLE agent_memory_observations
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_memory_observations_embedding
  ON agent_memory_observations
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMENT ON COLUMN agent_memory_observations.embedding
  IS 'OpenAI text-embedding-3-small embedding of observations_text for semantic memory recall';

-- ============================================================
-- 2. specialist_decision_journal: embed decision + context
-- ============================================================

ALTER TABLE specialist_decision_journal
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_decision_journal_embedding
  ON specialist_decision_journal
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMENT ON COLUMN specialist_decision_journal.embedding
  IS 'OpenAI text-embedding-3-small embedding of decision + context for semantic memory recall';

-- ============================================================
-- RPC: Match observations by embedding similarity (foundry-scoped)
-- ============================================================

CREATE OR REPLACE FUNCTION match_observations(
  query_embedding vector(1536),
  p_foundry_id text,
  match_threshold float DEFAULT 0.45,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  thread_id uuid,
  observations_text text,
  token_count int,
  version int,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    o.thread_id,
    o.observations_text,
    o.token_count,
    o.version,
    o.created_at,
    o.updated_at,
    1 - (o.embedding <=> query_embedding) AS similarity
  FROM agent_memory_observations o
  WHERE o.embedding IS NOT NULL
    AND o.foundry_id = p_foundry_id
    AND (1 - (o.embedding <=> query_embedding)) >= match_threshold
  ORDER BY o.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_observations
  IS 'Semantic search over agent_memory_observations scoped to a foundry; returns top-k by cosine similarity';

-- ============================================================
-- RPC: Match decisions by embedding similarity (foundry-scoped)
-- ============================================================

CREATE OR REPLACE FUNCTION match_decisions(
  query_embedding vector(1536),
  p_foundry_id text,
  match_threshold float DEFAULT 0.45,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  specialist_id text,
  decision text,
  context text,
  outcome text,
  created_at timestamptz,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id,
    d.specialist_id,
    d.decision,
    d.context,
    d.outcome,
    d.created_at,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM specialist_decision_journal d
  WHERE d.embedding IS NOT NULL
    AND d.foundry_id = p_foundry_id
    AND (1 - (d.embedding <=> query_embedding)) >= match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_decisions
  IS 'Semantic search over specialist_decision_journal scoped to a foundry; returns top-k by cosine similarity';
