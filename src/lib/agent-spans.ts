/**
 * @file Agent rollouts and spans for training/optimization
 *
 * @description Records each agent run as a "rollout" with "spans" (prompt/response
 * snapshots and token counts). Enables out-of-band prompt optimization (APO) or
 * RL training. All writes are best-effort and non-blocking so logging failures
 * do not affect the main request.
 *
 * @security RLS on agent_rollouts and agent_spans ensures users only see/insert
 * their own data. Prompt/response snapshots are truncated to SPAN_SNAPSHOT_MAX_CHARS.
 *
 * @related supabase/migrations/20260217500000_agent_rollouts_spans.sql
 */

import { createClient } from '@/lib/supabase/server'

const SPAN_SNAPSHOT_MAX_CHARS = 32_000

function truncate(s: string | undefined | null, max: number = SPAN_SNAPSHOT_MAX_CHARS): string | null {
  if (s == null || s === '') return null
  if (s.length <= max) return s
  return s.slice(0, max) + '\n[...truncated]'
}

export type RolloutStatus = 'running' | 'finished' | 'failed'
export type SpanKind = 'llm_call' | 'tool_call'

export interface CreateRolloutParams {
  foundryId: string
  userId: string
  agentId: string
  threadId?: string | null
  promptId?: string | null
  metadata?: Record<string, unknown>
}

export interface AddSpanParams {
  rolloutId: string
  kind: SpanKind
  promptSnapshot?: string | null
  responseSnapshot?: string | null
  promptTokens?: number | null
  completionTokens?: number | null
  metadata?: Record<string, unknown>
}

/**
 * Create a new rollout and return its id. Best-effort; on failure returns null.
 *
 * @param params - foundryId, userId, agentId, optional threadId/promptId/metadata
 * @returns rollout id, or null if insert failed
 */
export async function createRollout(params: CreateRolloutParams): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('agent_rollouts')
      .insert({
        foundry_id: params.foundryId,
        user_id: params.userId,
        agent_id: params.agentId,
        thread_id: params.threadId ?? null,
        prompt_id: params.promptId ?? null,
        status: 'running',
        metadata: (params.metadata ?? {}) as import('@/types/database.types').Json,
      })
      .select('id')
      .single()

    if (error) {
      console.warn('[agent-spans] createRollout failed:', { error: error.message })
      return null
    }
    return data?.id ?? null
  } catch (err) {
    console.warn('[agent-spans] createRollout error:', err)
    return null
  }
}

/**
 * Add a span to a rollout. Best-effort; does not throw.
 *
 * @param params - rolloutId, kind, optional prompt/response snapshots (truncated), tokens, metadata
 */
export async function addSpan(params: AddSpanParams): Promise<void> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('agent_spans').insert({
      rollout_id: params.rolloutId,
      kind: params.kind,
      prompt_snapshot: truncate(params.promptSnapshot),
      response_snapshot: truncate(params.responseSnapshot),
      prompt_tokens: params.promptTokens ?? null,
      completion_tokens: params.completionTokens ?? null,
      metadata: (params.metadata ?? {}) as import('@/types/database.types').Json,
    })
    if (error) {
      console.warn('[agent-spans] addSpan failed:', { rolloutId: params.rolloutId, error: error.message })
    }
  } catch (err) {
    console.warn('[agent-spans] addSpan error:', err)
  }
}

/**
 * Mark a rollout as finished or failed. Best-effort; does not throw.
 *
 * @param rolloutId - id from createRollout
 * @param status - 'finished' | 'failed'
 */
export async function finishRollout(rolloutId: string, status: RolloutStatus): Promise<void> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('agent_rollouts')
      .update({ status })
      .eq('id', rolloutId)

    if (error) {
      console.warn('[agent-spans] finishRollout failed:', { rolloutId, error: error.message })
    }
  } catch (err) {
    console.warn('[agent-spans] finishRollout error:', err)
  }
}

/**
 * Attach a reward to a rollout (e.g. task_completed, listing_contact). Best-effort.
 *
 * @param rolloutId - id from createRollout
 * @param value - scalar reward (e.g. 1.0 for success)
 * @param source - label for the reward (e.g. 'task_completed')
 */
export async function addReward(rolloutId: string, value: number, source: string): Promise<void> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('agent_rollouts')
      .update({
        reward: value,
        reward_source: source,
        rewarded_at: new Date().toISOString(),
      })
      .eq('id', rolloutId)

    if (error) {
      console.warn('[agent-spans] addReward failed:', { rolloutId, error: error.message })
    }
  } catch (err) {
    console.warn('[agent-spans] addReward error:', err)
  }
}
