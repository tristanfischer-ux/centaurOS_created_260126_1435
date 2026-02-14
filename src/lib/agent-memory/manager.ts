/**
 * @file manager.ts
 *
 * @description The Memory Manager is the main orchestrator for the
 * Observational Memory system. It manages memory threads, records messages,
 * assembles context for injection into prompts, and auto-triggers the
 * Observer and Reflector when token thresholds are exceeded.
 *
 * @security All database operations use the authenticated Supabase client.
 * RLS policies enforce foundry-level isolation.
 *
 * @example
 * // Create a thread for a workflow run
 * const thread = await createMemoryThread(foundryId, userId, 'workflow_run', runId)
 *
 * // Record a message
 * await addMemoryMessage(thread.id, foundryId, 'user', 'Analyze our market position')
 *
 * // Get context for injection into a prompt
 * const ctx = await getMemoryContext(thread.id, foundryId)
 * // ctx.observations = "Date: 2026-02-11\n- 🔴 (14:30) User stated..."
 */

import { createClient } from '@/lib/supabase/server'
import { countTokens, countMessagesTokens } from './token-counter'
import { runObserver } from './observer'
import { runReflector } from './reflector'
import type {
  MemoryContextType,
  MemoryThread,
  MemoryMessage,
  MemoryObservation,
  MemoryContext,
  MemoryConfig,
  CompressionLevel,
} from './types'
import { DEFAULT_MEMORY_CONFIG } from './types'
import type { Json } from '@/types/database.types'

// ─── Create Thread ──────────────────────────────────────────────────

/**
 * Creates a new memory thread for a given context.
 *
 * @param foundryId - The foundry this thread belongs to
 * @param userId - The user who initiated this thread
 * @param contextType - The type of context (workflow_run, foundry, etc.)
 * @param contextId - Optional reference to a related entity
 * @param metadata - Optional metadata for the thread
 * @returns The created thread, or null on error
 *
 * @security Requires authenticated user with foundry membership (RLS enforced)
 */
export async function createMemoryThread(
  foundryId: string,
  userId: string,
  contextType: MemoryContextType,
  contextId?: string | null,
  metadata?: Record<string, unknown>
): Promise<MemoryThread | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('agent_memory_threads')
    .insert({
      foundry_id: foundryId,
      created_by: userId,
      context_type: contextType,
      context_id: contextId ?? null,
      metadata: (metadata ?? {}) as Json,
    })
    .select()
    .single()

  if (error) {
    console.error('[AgentMemory/Manager] Failed to create thread:', {
      foundryId,
      contextType,
      error: error.message,
    })
    return null
  }

  return data as MemoryThread
}

// ─── Find or Create Foundry Thread ──────────────────────────────────

/**
 * Gets the persistent foundry-level memory thread, creating it if needed.
 *
 * @description Foundry threads accumulate observations across all workflow
 * runs and agent interactions. There is one per foundry.
 *
 * @param foundryId - The foundry to get/create a thread for
 * @param userId - The user making the request
 * @returns The foundry-level thread
 */
export async function getOrCreateFoundryThread(
  foundryId: string,
  userId: string
): Promise<MemoryThread | null> {
  const supabase = await createClient()

  // CONCURRENCY: Use maybeSingle() instead of single() to avoid errors
  // when no row exists. Then create with a direct insert that won't
  // duplicate thanks to the unique index on (foundry_id, context_type)
  // WHERE context_id IS NULL.
  const { data: existing } = await supabase
    .from('agent_memory_threads')
    .select()
    .eq('foundry_id', foundryId)
    .eq('context_type', 'foundry')
    .limit(1)
    .maybeSingle()

  if (existing) return existing as MemoryThread

  // Create a new one — unique index prevents duplicates from concurrent calls
  return createMemoryThread(foundryId, userId, 'foundry')
}

// ─── Add Message ────────────────────────────────────────────────────

/**
 * Records a message in a memory thread.
 *
 * @param threadId - The thread to add the message to
 * @param foundryId - The foundry for RLS isolation
 * @param role - The message role (user, assistant, system, tool)
 * @param content - The message content
 * @returns The created message, or null on error
 *
 * @security Foundry isolation enforced via RLS policy
 */
export async function addMemoryMessage(
  threadId: string,
  foundryId: string,
  role: 'system' | 'user' | 'assistant' | 'tool',
  content: string
): Promise<MemoryMessage | null> {
  const supabase = await createClient()
  const tokenCount = countTokens(content)

  const { data, error } = await supabase
    .from('agent_memory_messages')
    .insert({
      thread_id: threadId,
      foundry_id: foundryId,
      role,
      content,
      token_count: tokenCount,
      is_observed: false,
    })
    .select()
    .single()

  if (error) {
    console.error('[AgentMemory/Manager] Failed to add message:', {
      threadId,
      role,
      error: error.message,
    })
    return null
  }

  return data as MemoryMessage
}

// ─── Get Memory Context ─────────────────────────────────────────────

/**
 * Assembles the memory context for injection into an AI prompt.
 *
 * @description Fetches observations and recent unobserved messages for a
 * thread, returning them as a formatted block ready for system prompt
 * injection. Optionally merges in foundry-level observations.
 *
 * @param threadId - The thread to get context for
 * @param foundryId - The foundry for RLS isolation
 * @param includeFoundryMemory - Whether to merge foundry-level observations
 * @returns The assembled memory context
 */
export async function getMemoryContext(
  threadId: string,
  foundryId: string,
  includeFoundryMemory: boolean = false
): Promise<MemoryContext> {
  const supabase = await createClient()
  const emptyContext: MemoryContext = { observations: '', recentMessages: [], totalTokens: 0 }

  // Fetch observations for this thread
  const { data: obsRows } = await supabase
    .from('agent_memory_observations')
    .select('observations_text, token_count')
    .eq('thread_id', threadId)
    .order('version', { ascending: false })
    .limit(1)
    .single()

  let observations = (obsRows as MemoryObservation | null)?.observations_text ?? ''

  // Optionally merge foundry-level observations
  if (includeFoundryMemory) {
    const { data: foundryObs } = await supabase
      .from('agent_memory_observations')
      .select('observations_text, thread_id')
      .eq('foundry_id', foundryId)
      .not('thread_id', 'eq', threadId)
      .order('updated_at', { ascending: false })
      .limit(1)

    // Only merge if there's a foundry thread with observations
    if (foundryObs && foundryObs.length > 0) {
      const foundryThread = await supabase
        .from('agent_memory_threads')
        .select('context_type')
        .eq('id', foundryObs[0].thread_id)
        .single()

      if (foundryThread.data?.context_type === 'foundry' && foundryObs[0].observations_text) {
        observations = observations
          ? `## Foundry Memory\n${foundryObs[0].observations_text}\n\n## Session Memory\n${observations}`
          : foundryObs[0].observations_text
      }
    }
  }

  // Fetch recent unobserved messages
  const { data: messageRows } = await supabase
    .from('agent_memory_messages')
    .select('role, content')
    .eq('thread_id', threadId)
    .eq('is_observed', false)
    .order('created_at', { ascending: true })

  const recentMessages = (messageRows ?? []).map((m) => ({
    role: m.role as 'system' | 'user' | 'assistant' | 'tool',
    content: m.content as string,
  }))

  const obsTokens = countTokens(observations)
  const msgTokens = countMessagesTokens(recentMessages)

  return {
    observations,
    recentMessages,
    totalTokens: obsTokens + msgTokens,
  }
}

// ─── Format Context for Prompt ──────────────────────────────────────

/**
 * Formats the memory context into a string block for system prompt injection.
 *
 * @param context - The memory context from getMemoryContext
 * @returns A formatted string ready to append to a system prompt, or empty string
 */
export function formatMemoryForPrompt(context: MemoryContext): string {
  if (!context.observations && context.recentMessages.length === 0) {
    return ''
  }

  const parts: string[] = []

  if (context.observations) {
    parts.push('--- Agent Memory (Observations) ---')
    parts.push(context.observations)
    parts.push('--- End Observations ---')
  }

  if (context.recentMessages.length > 0) {
    parts.push('--- Recent Context ---')
    for (const msg of context.recentMessages) {
      parts.push(`${msg.role.toUpperCase()}: ${msg.content}`)
    }
    parts.push('--- End Recent Context ---')
  }

  return '\n' + parts.join('\n') + '\n'
}

// ─── Process Memory (Observe + Reflect) ─────────────────────────────

/**
 * Processes a memory thread: runs the Observer if unobserved messages
 * exceed the threshold, then the Reflector if observations exceed theirs.
 *
 * @description This is the core lifecycle method. Call it after adding
 * messages to a thread. It checks token counts and automatically triggers
 * compression and/or consolidation as needed.
 *
 * @param threadId - The thread to process
 * @param foundryId - The foundry for RLS isolation
 * @param config - Optional memory configuration overrides
 *
 * @audit Logs observation/reflection events with token counts
 */
export async function processMemory(
  threadId: string,
  foundryId: string,
  config: MemoryConfig = DEFAULT_MEMORY_CONFIG
): Promise<void> {
  const supabase = await createClient()

  // CONCURRENCY: Acquire an advisory lock to prevent two concurrent processMemory
  // calls from double-processing the same unobserved messages. If another process
  // already holds the lock, we skip silently (the other process will handle it).
  try {
    const { data: lockAcquired } = await supabase.rpc(
      'acquire_memory_processing_lock',
      { p_thread_id: threadId }
    )
    if (lockAcquired === false) {
      console.info('[AgentMemory/Manager] Skipping processMemory — another process holds the lock:', { threadId })
      return
    }
  } catch {
    // If the RPC doesn't exist yet (migration not applied), proceed without lock
    // This is a best-effort concurrency guard
    console.warn('[AgentMemory/Manager] Advisory lock RPC not available, proceeding without lock')
  }

  // 1. Check unobserved message token count
  const { data: unobservedMessages } = await supabase
    .from('agent_memory_messages')
    .select('*')
    .eq('thread_id', threadId)
    .eq('is_observed', false)
    .order('created_at', { ascending: true })

  if (!unobservedMessages || unobservedMessages.length === 0) return

  const unobservedTokens = (unobservedMessages as MemoryMessage[]).reduce(
    (sum, m) => sum + m.token_count,
    0
  )

  // 2. If below threshold, nothing to do
  if (unobservedTokens < config.observeThresholdTokens) return

  console.info('[AgentMemory/Manager] Observation threshold reached:', {
    threadId,
    unobservedTokens,
    threshold: config.observeThresholdTokens,
  })

  // 3. Get existing observations for context
  const { data: existingObs } = await supabase
    .from('agent_memory_observations')
    .select('*')
    .eq('thread_id', threadId)
    .order('version', { ascending: false })
    .limit(1)
    .single()

  const existingObservations = (existingObs as MemoryObservation | null)?.observations_text ?? ''
  const currentVersion = (existingObs as MemoryObservation | null)?.version ?? 0

  // 4. Run Observer
  const newObservations = await runObserver(
    unobservedMessages as MemoryMessage[],
    existingObservations,
    { model: config.memoryModel, temperature: config.observerTemperature }
  )

  // 5. Merge observations
  const mergedObservations = existingObservations
    ? existingObservations + '\n\n' + newObservations
    : newObservations

  const mergedTokens = countTokens(mergedObservations)

  // 6. Upsert observations
  // CONCURRENCY: Use upsert with ON CONFLICT on the unique thread_id index
  // to prevent duplicate observation rows from concurrent processMemory calls.
  if (existingObs) {
    await supabase
      .from('agent_memory_observations')
      .update({
        observations_text: mergedObservations,
        token_count: mergedTokens,
        version: currentVersion + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingObs.id)
  } else {
    await supabase.from('agent_memory_observations').upsert(
      {
        thread_id: threadId,
        foundry_id: foundryId,
        observations_text: mergedObservations,
        token_count: mergedTokens,
        version: 1,
      },
      { onConflict: 'thread_id' }
    )
  }

  // 7. Mark messages as observed
  const messageIds = (unobservedMessages as MemoryMessage[]).map((m) => m.id)
  await supabase
    .from('agent_memory_messages')
    .update({ is_observed: true })
    .in('id', messageIds)

  // 8. Check if reflection is needed
  if (mergedTokens >= config.reflectThresholdTokens) {
    console.info('[AgentMemory/Manager] Reflection threshold reached:', {
      threadId,
      observationTokens: mergedTokens,
      threshold: config.reflectThresholdTokens,
    })

    // Try progressive compression (level 0, 1, then 2)
    let reflectedText = mergedObservations
    const targetTokens = Math.floor(config.reflectThresholdTokens * 0.7) // 70% of threshold

    for (let level = 0; level <= 2; level++) {
      reflectedText = await runReflector(
        reflectedText,
        targetTokens,
        level as CompressionLevel,
        { model: config.memoryModel, temperature: config.reflectorTemperature }
      )

      if (countTokens(reflectedText) <= targetTokens) break
    }

    const reflectedTokens = countTokens(reflectedText)

    // Update observations with reflected version
    const { data: latestObs } = await supabase
      .from('agent_memory_observations')
      .select('id, version')
      .eq('thread_id', threadId)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    if (latestObs) {
      await supabase
        .from('agent_memory_observations')
        .update({
          observations_text: reflectedText,
          token_count: reflectedTokens,
          version: (latestObs.version as number) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', latestObs.id)
    }
  }
}
