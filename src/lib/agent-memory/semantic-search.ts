/**
 * @file semantic-search.ts
 *
 * @description Semantic search over specialist memory: observations (compressed
 * conversation summaries) and decisions (founder choices with specialist input).
 * Enables specialists to recall past conversations across ALL threads, not just
 * the current one.
 *
 * @related supabase/migrations/20260407200000_specialist_memory_embeddings.sql
 * @related src/lib/search/semantic-search.ts - embedText() reused here
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { embedText } from '@/lib/search/semantic-search'

// ── Types ──────────────────────────────────────────────────────

export interface ObservationHit {
  id: string
  thread_id: string
  observations_text: string
  token_count: number
  version: number
  created_at: string
  updated_at: string
  similarity: number
}

export interface DecisionHit {
  id: string
  specialist_id: string
  decision: string
  context: string | null
  outcome: string | null
  created_at: string
  similarity: number
}

interface SearchOptions {
  limit?: number
  threshold?: number
}

// ── Search Functions ───────────────────────────────────────────

/**
 * Search observations by semantic similarity, scoped to a foundry.
 *
 * @param foundryId - Foundry to scope search to
 * @param query - Natural language query
 * @param options - Optional limit and threshold
 * @returns Matching observations ranked by similarity
 */
export async function searchObservations(
  foundryId: string,
  query: string,
  options: SearchOptions = {},
): Promise<ObservationHit[]> {
  const { limit = 5, threshold = 0.45 } = options

  const embedding = await embedText(query)
  if (!embedding) return []

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('match_observations', {
    query_embedding: JSON.stringify(embedding),
    p_foundry_id: foundryId,
    match_threshold: threshold,
    match_count: limit,
  })

  if (error) {
    console.warn('[SemanticMemory] searchObservations failed:', error.message)
    return []
  }

  return (data ?? []) as ObservationHit[]
}

/**
 * Search decisions by semantic similarity, scoped to a foundry.
 *
 * @param foundryId - Foundry to scope search to
 * @param query - Natural language query
 * @param options - Optional limit and threshold
 * @returns Matching decisions ranked by similarity
 */
export async function searchDecisions(
  foundryId: string,
  query: string,
  options: SearchOptions = {},
): Promise<DecisionHit[]> {
  const { limit = 5, threshold = 0.45 } = options

  const embedding = await embedText(query)
  if (!embedding) return []

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('match_decisions', {
    query_embedding: JSON.stringify(embedding),
    p_foundry_id: foundryId,
    match_threshold: threshold,
    match_count: limit,
  })

  if (error) {
    console.warn('[SemanticMemory] searchDecisions failed:', error.message)
    return []
  }

  return (data ?? []) as DecisionHit[]
}

// ── Formatting ─────────────────────────────────────────────────

/**
 * Format observation hits into a prompt-injectable markdown block.
 *
 * @param hits - Observation search results
 * @returns Markdown string for prompt injection
 */
export function formatObservationHitsForPrompt(hits: ObservationHit[]): string {
  if (hits.length === 0) return ''

  const lines = hits.map((h, i) => {
    const date = new Date(h.updated_at).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    // INTENT: Truncate long observations to keep prompt lean
    const text = h.observations_text.length > 500
      ? h.observations_text.slice(0, 500) + '...'
      : h.observations_text
    return `${i + 1}. [${date}, similarity ${h.similarity.toFixed(2)}]\n${text}`
  })

  return `### Past Conversations\n${lines.join('\n\n')}`
}

/**
 * Format decision hits into a prompt-injectable markdown block.
 *
 * @param hits - Decision search results
 * @returns Markdown string for prompt injection
 */
export function formatDecisionHitsForPrompt(hits: DecisionHit[]): string {
  if (hits.length === 0) return ''

  const outcomeLabel = (o: string | null): string => {
    if (!o) return '\u2753' // ❓
    if (o.toLowerCase().includes('success') || o.toLowerCase().includes('positive')) return '\u2705' // ✅
    if (o.toLowerCase().includes('fail') || o.toLowerCase().includes('negative')) return '\u274C' // ❌
    return '\u2696\uFE0F' // ⚖️
  }

  const lines = hits.map((h, i) => {
    const date = new Date(h.created_at).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    const outcome = outcomeLabel(h.outcome)
    const ctx = h.context ? ` Context: ${h.context.slice(0, 200)}` : ''
    return `${i + 1}. ${outcome} [${date}, ${h.specialist_id}] ${h.decision}${ctx}`
  })

  return `### Past Decisions\n${lines.join('\n')}`
}

// ── Embed Helpers (fire-and-forget) ────────────────────────────

/**
 * Embed an observation record. Called fire-and-forget after upsert/reflection.
 *
 * @param observationId - UUID of the observation row
 * @param text - The observations_text to embed
 */
export async function embedObservation(
  observationId: string,
  text: string,
): Promise<void> {
  try {
    const embedding = await embedText(text)
    if (!embedding) return

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('agent_memory_observations')
      .update({ embedding: JSON.stringify(embedding) })
      .eq('id', observationId)

    if (error) {
      console.warn('[SemanticMemory] embedObservation update failed:', error.message)
    }
  } catch (err) {
    console.warn('[SemanticMemory] embedObservation failed:', err instanceof Error ? err.message : err)
  }
}

/**
 * Embed a decision record. Called fire-and-forget after insert.
 *
 * @param decisionId - UUID of the decision row
 * @param decision - The decision text
 * @param context - Optional context
 */
export async function embedDecision(
  decisionId: string,
  decision: string,
  context: string | null,
): Promise<void> {
  try {
    const textToEmbed = context
      ? `Decision: ${decision}. Context: ${context}`
      : `Decision: ${decision}`
    const embedding = await embedText(textToEmbed)
    if (!embedding) return

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('specialist_decision_journal')
      .update({ embedding: JSON.stringify(embedding) })
      .eq('id', decisionId)

    if (error) {
      console.warn('[SemanticMemory] embedDecision update failed:', error.message)
    }
  } catch (err) {
    console.warn('[SemanticMemory] embedDecision failed:', err instanceof Error ? err.message : err)
  }
}
