'use server'

/**
 * @file corpus-search.ts
 *
 * @description Server actions for searching the page_chunks_corpus table —
 * 2.85M embedded page chunks from the Forge Capital crawler corpus.
 * Uses the match_page_chunks_corpus RPC (pgvector HNSW, cosine similarity).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { embedQuery } from '@/lib/embeddings'

export interface CorpusChunkResult {
  id: number
  source: string
  entity_id: string
  page_url: string
  chunk_idx: number
  chunk_text: string
  similarity: number
}

export interface SearchCorpusOptions {
  source?: string
  entityId?: string
  threshold?: number
  limit?: number
}

/**
 * Searches the page_chunks_corpus table for chunks semantically similar to the query.
 *
 * @param query - Natural language search query
 * @param options - Optional filters for source, entity, threshold, and result count
 * @returns Array of matching chunks with similarity scores
 * @throws Error if embedding generation or RPC call fails
 */
export async function searchCorpusChunks(
  query: string,
  options: SearchCorpusOptions = {},
): Promise<CorpusChunkResult[]> {
  const {
    source,
    entityId,
    threshold = 0.5,
    limit = 20,
  } = options

  const queryEmbedding = await embedQuery(query, {
    actionSlug: 'corpus-search',
  })

  const supabase = createAdminClient()
  const queryEmbStr = JSON.stringify(queryEmbedding) as unknown as string

  const { data, error } = await supabase.rpc('match_page_chunks_corpus', {
    query_embedding: queryEmbStr,
    match_threshold: threshold,
    match_count: limit,
    filter_source: source ?? null,
    filter_entity_id: entityId ?? null,
  })

  if (error) {
    throw new Error(`corpus search failed: ${error.message}`)
  }

  return (data ?? []) as CorpusChunkResult[]
}
