'use server'

/**
 * @file agent-memory.ts
 *
 * @description Server actions for managing agent memory threads from the
 * client side. Primarily used by the workflow view to create memory threads
 * at the start of a chain execution.
 *
 * @security All operations require authentication and enforce foundry isolation.
 *
 * @related
 * - src/lib/agent-memory/manager.ts - Core memory manager
 * - src/app/(platform)/agents/agents-workflow-view.tsx - Workflow UI
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { createMemoryThread, getOrCreateFoundryThread } from '@/lib/agent-memory'
import type { MemoryContextType, MemoryThread, MessageRole } from '@/lib/agent-memory'

/**
 * Creates a new memory thread for a workflow run.
 *
 * @description Called at the start of a "Run Chain" execution. Creates a
 * thread scoped to the workflow run so all node executions within the chain
 * share context through the same memory thread.
 *
 * @param contextType - The context type (typically 'workflow_run')
 * @param contextId - Optional reference to the workflow run or workflow ID
 * @param metadata - Optional metadata (workflow name, node count, etc.)
 * @returns The created thread ID, or error
 *
 * @security Requires authenticated user with foundry membership (RLS enforced)
 */
export async function createWorkflowMemoryThread(
    contextType: MemoryContextType = 'workflow_run',
    contextId?: string | null,
    metadata?: Record<string, unknown>
): Promise<{ threadId: string | null; error: string | null }> {
    try {
        // AUTH: Verify authentication
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { threadId: null, error: 'Unauthorized' }
        }

        // Get foundry ID
        const foundryId = await getFoundryIdCached()
        if (!foundryId) {
            return { threadId: null, error: 'No active foundry' }
        }

        // Create the thread
        const thread = await createMemoryThread(
            foundryId,
            user.id,
            contextType,
            contextId,
            metadata
        )

        if (!thread) {
            return { threadId: null, error: 'Failed to create memory thread' }
        }

        return { threadId: thread.id, error: null }
    } catch (err) {
        console.error('[agent-memory] Failed to create thread:', {
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return { threadId: null, error: 'Internal error' }
    }
}

/**
 * Ensures a foundry-level memory thread exists and returns its ID.
 *
 * @description Foundry-level threads accumulate observations across all
 * workflow runs, providing persistent "organizational memory" for agents.
 *
 * @returns The foundry thread ID, or error
 *
 * @security Requires authenticated user with foundry membership (RLS enforced)
 */
export async function ensureFoundryMemoryThread(): Promise<{
    threadId: string | null
    error: string | null
}> {
    try {
        // AUTH: Verify authentication
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { threadId: null, error: 'Unauthorized' }
        }

        // Get foundry ID
        const foundryId = await getFoundryIdCached()
        if (!foundryId) {
            return { threadId: null, error: 'No active foundry' }
        }

        const thread = await getOrCreateFoundryThread(foundryId, user.id)
        if (!thread) {
            return { threadId: null, error: 'Failed to create foundry thread' }
        }

        return { threadId: thread.id, error: null }
    } catch (err) {
        console.error('[agent-memory] Failed to ensure foundry thread:', {
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return { threadId: null, error: 'Internal error' }
    }
}

/**
 * Gets or creates a memory thread for a specific specialist within the user's foundry.
 *
 * @description Each specialist gets one persistent thread per foundry. When the
 * user briefs the Strategist, it always picks up the same thread, giving the
 * specialist continuity across sessions ("Last time we discussed your pricing...").
 *
 * @param specialistId - The specialist identifier (e.g., "strategist", "finance-lead")
 * @returns The thread ID, or error
 *
 * @security Requires authenticated user with foundry membership (RLS enforced)
 */
export async function getOrCreateSpecialistThread(
    specialistId: string
): Promise<{ threadId: string | null; error: string | null }> {
    try {
        // AUTH: Verify authentication
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { threadId: null, error: 'Unauthorized' }
        }

        // Get foundry ID
        const foundryId = await getFoundryIdCached()
        if (!foundryId) {
            return { threadId: null, error: 'No active foundry' }
        }

        // CONCURRENCY: Use atomic RPC to get-or-create in a single DB round-trip.
        // This prevents the race condition where two concurrent calls both see
        // "no thread" and both INSERT, creating duplicates.
        const { data: threadId, error: rpcError } = await supabase.rpc(
            'get_or_create_specialist_thread',
            {
                p_foundry_id: foundryId,
                p_user_id: user.id,
                p_context_type: 'specialist',
                p_context_id: specialistId,
                p_metadata: { specialistId, specialistType: 'specialist' },
            }
        )

        if (rpcError || !threadId) {
            console.error('[agent-memory] RPC get_or_create_specialist_thread failed:', {
                specialistId,
                error: rpcError?.message ?? 'No thread ID returned',
            })

            // Fallback: try the direct query approach (handles case where RPC
            // doesn't exist yet, e.g., migration not applied)
            const { data: existing } = await supabase
                .from('agent_memory_threads')
                .select('id')
                .eq('foundry_id', foundryId)
                .eq('context_type', 'specialist')
                .eq('context_id', specialistId)
                .limit(1)
                .maybeSingle()

            if (existing) {
                return { threadId: existing.id, error: null }
            }

            // Last resort: create directly
            const thread = await createMemoryThread(
                foundryId,
                user.id,
                'specialist',
                specialistId,
                { specialistId, specialistType: 'specialist' }
            )

            if (!thread) {
                return { threadId: null, error: 'Failed to create specialist thread' }
            }

            return { threadId: thread.id, error: null }
        }

        return { threadId: threadId as string, error: null }
    } catch (err) {
        console.error('[agent-memory] Failed to get/create specialist thread:', {
            specialistId,
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return { threadId: null, error: 'Internal error' }
    }
}

/**
 * Fetches recent outputs from other specialists' threads (for cross-specialist awareness).
 *
 * @description When briefing one specialist, this provides a summary of what other
 * specialists have recently produced so they can reference each other's work.
 *
 * @param excludeSpecialistId - The current specialist to exclude from results
 * @param limit - Maximum number of recent outputs to return
 * @returns Array of { specialistId, summary } tuples, or error
 *
 * @security Requires authenticated user with foundry membership (RLS enforced)
 */
export async function getRecentSpecialistOutputs(
    excludeSpecialistId: string,
    limit: number = 5
): Promise<{ data: Array<{ specialistId: string; summary: string }> | null; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { data: null, error: 'Unauthorized' }
        }

        const foundryId = await getFoundryIdCached()
        if (!foundryId) {
            return { data: null, error: 'No active foundry' }
        }

        // Fetch all specialist threads in this foundry except the current one
        const { data: threads } = await supabase
            .from('agent_memory_threads')
            .select('id, context_id')
            .eq('foundry_id', foundryId)
            .eq('context_type', 'specialist')
            .neq('context_id', excludeSpecialistId)

        if (!threads || threads.length === 0) {
            return { data: [], error: null }
        }

        const threadIds = threads.map((t) => t.id)

        // Single batch query: fetch recent messages for all threads (avoids N+1)
        const { data: allMsgs } = await supabase
            .from('agent_memory_messages')
            .select('thread_id, role, content, created_at')
            .in('thread_id', threadIds)
            .in('role', ['user', 'assistant'])
            .order('created_at', { ascending: false })
            .limit(threadIds.length * 4)

        // Group by thread, keep most recent 2 messages per thread
        const msgsByThread = new Map<string, Array<{ role: string; content: string; created_at: string }>>()
        for (const m of allMsgs ?? []) {
            const tid = m.thread_id as string
            if (!msgsByThread.has(tid)) msgsByThread.set(tid, [])
            const arr = msgsByThread.get(tid)!
            if (arr.length < 2) arr.push({ role: m.role as string, content: m.content as string, created_at: m.created_at as string })
        }

        const results: Array<{ specialistId: string; summary: string }> = []
        for (const thread of threads) {
            if (results.length >= limit) break
            const recentMsgs = msgsByThread.get(thread.id) ?? []
            const lastAssistant = recentMsgs.find((m) => m.role === 'assistant')
            const lastUser = recentMsgs.find((m) => m.role === 'user')
            if (!lastAssistant?.content) continue

            const timestamp = lastAssistant.created_at
                ? new Date(lastAssistant.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                  })
                : ''

            const parts: string[] = []
            if (timestamp) parts.push(`(${timestamp})`)
            if (lastUser?.content) {
                const userQ = lastUser.content.slice(0, 200)
                parts.push(`Asked about: "${userQ}${lastUser.content.length > 200 ? '...' : ''}"`)
            }
            const truncated =
                lastAssistant.content.length > 500
                    ? lastAssistant.content.slice(0, 500) + '...'
                    : lastAssistant.content
            parts.push(`Key output: "${truncated}"`)

            results.push({
                specialistId: thread.context_id as string,
                summary: parts.join('\n'),
            })
        }

        return { data: results, error: null }
    } catch (err) {
        console.error('[agent-memory] Failed to fetch cross-specialist outputs:', {
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return { data: null, error: 'Internal error' }
    }
}

/** A past message from a specialist thread */
export interface SpecialistHistoryMessage {
    role: MessageRole
    content: string
    createdAt: string
}

/**
 * Fetches past conversation messages from a specialist's memory thread.
 *
 * @description Returns the most recent messages for displaying conversation
 * history in the Brief dialog sidebar.
 *
 * @param specialistId - The specialist whose thread to fetch
 * @param limit - Maximum number of messages to return (default 50)
 * @returns Array of past messages, or error
 *
 * @security Requires authenticated user with foundry membership (RLS enforced)
 */
export async function getSpecialistThreadHistory(
    specialistId: string,
    limit: number = 50
): Promise<{ data: SpecialistHistoryMessage[] | null; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { data: null, error: 'Unauthorized' }
        }

        const foundryId = await getFoundryIdCached()
        if (!foundryId) {
            return { data: null, error: 'No active foundry' }
        }

        // Find the specialist thread
        // CONCURRENCY: Use maybeSingle() instead of single() to avoid errors
        // when no thread exists yet (returns null instead of throwing)
        const { data: thread } = await supabase
            .from('agent_memory_threads')
            .select('id')
            .eq('foundry_id', foundryId)
            .eq('context_type', 'specialist')
            .eq('context_id', specialistId)
            .limit(1)
            .maybeSingle()

        if (!thread) {
            return { data: [], error: null }
        }

        // Fetch messages from the thread
        const { data: messages, error } = await supabase
            .from('agent_memory_messages')
            .select('role, content, created_at')
            .eq('thread_id', thread.id)
            .in('role', ['user', 'assistant'])
            .order('created_at', { ascending: true })
            .limit(limit)

        if (error) {
            console.error('[agent-memory] Failed to fetch thread history:', {
                specialistId,
                error: error.message,
            })
            return { data: null, error: 'Failed to fetch history' }
        }

        return {
            data: (messages ?? []).map((m) => ({
                role: m.role as MessageRole,
                content: m.content as string,
                createdAt: m.created_at as string,
            })),
            error: null,
        }
    } catch (err) {
        console.error('[agent-memory] Failed to fetch specialist history:', {
            specialistId,
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return { data: null, error: 'Internal error' }
    }
}

/**
 * Activity summary for a specialist (used on landing page cards).
 */
export interface SpecialistActivity {
    specialistId: string
    lastMessageAt: string | null
    lastTopic: string | null
    mood: string | null
    moodTrigger: string | null
}

/**
 * Fetches activity data for all specialists -- last conversation timestamp
 * and last topic discussed. Used to show relationship indicators on cards.
 *
 * @returns Map of specialistId to activity data
 *
 * @security Requires authenticated user with foundry membership (RLS enforced)
 */
/**
 * Summary of the relationship between a founder and a specialist.
 */
export interface RelationshipSummary {
    level: 'new' | 'building' | 'established' | 'deep'
    conversationCount: number
    decisionsCount: number
    lastConversationDate: string | null
    mood: string | null
}

/**
 * Fetches a relationship summary for a specific specialist.
 *
 * @description Queries conversation count, decision count, last interaction date,
 * and derives a trust level from conversation depth.
 *
 * @param specialistId - The specialist to get the relationship summary for
 * @returns The relationship summary, or null on error
 *
 * @security Requires authenticated user with foundry membership (RLS enforced)
 */
export async function getSpecialistRelationshipSummary(
    specialistId: string
): Promise<{ data: RelationshipSummary | null; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { data: null, error: 'Unauthorized' }

        const foundryId = await getFoundryIdCached()
        if (!foundryId) return { data: null, error: 'No active foundry' }

        // Find the specialist thread
        const { data: thread } = await supabase
            .from('agent_memory_threads')
            .select('id, metadata, last_interaction_at')
            .eq('foundry_id', foundryId)
            .eq('context_type', 'specialist')
            .eq('context_id', specialistId)
            .limit(1)
            .maybeSingle()

        if (!thread) {
            return {
                data: {
                    level: 'new',
                    conversationCount: 0,
                    decisionsCount: 0,
                    lastConversationDate: null,
                    mood: null,
                },
                error: null,
            }
        }

        // Count messages and decisions in parallel (independent queries)
        const [{ count: msgCount }, { count: decisionCount }] = await Promise.all([
            supabase
                .from('agent_memory_messages')
                .select('*', { count: 'exact', head: true })
                .eq('thread_id', thread.id)
                .eq('role', 'user'),
            supabase
                .from('specialist_decision_journal')
                .select('*', { count: 'exact', head: true })
                .eq('foundry_id', foundryId)
                .eq('specialist_id', specialistId),
        ])

        const conversationCount = msgCount ?? 0
        const decisionsCount = decisionCount ?? 0

        // Derive trust level from conversation depth
        let level: RelationshipSummary['level'] = 'new'
        if (conversationCount >= 20 || decisionsCount >= 5) level = 'deep'
        else if (conversationCount >= 10 || decisionsCount >= 3) level = 'established'
        else if (conversationCount >= 3) level = 'building'

        // Extract mood from thread metadata if available
        const metadata = (thread.metadata ?? {}) as Record<string, unknown>
        const mood = typeof metadata.mood === 'string' ? metadata.mood : null

        return {
            data: {
                level,
                conversationCount,
                decisionsCount,
                lastConversationDate: thread.last_interaction_at ?? null,
                mood,
            },
            error: null,
        }
    } catch (err) {
        console.error('[agent-memory] Failed to get relationship summary:', {
            specialistId,
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return { data: null, error: 'Internal error' }
    }
}

export async function getSpecialistActivities(): Promise<{
    data: Record<string, SpecialistActivity> | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { data: null, error: 'Unauthorized' }
        }

        const foundryId = await getFoundryIdCached()
        if (!foundryId) {
            return { data: null, error: 'No active foundry' }
        }

        // Fetch all specialist threads (include metadata for mood)
        const { data: threads } = await supabase
            .from('agent_memory_threads')
            .select('id, context_id, metadata')
            .eq('foundry_id', foundryId)
            .eq('context_type', 'specialist')

        if (!threads || threads.length === 0) {
            return { data: {}, error: null }
        }

        const threadIds = threads.map((t) => t.id)

        // Fetch last user message from each thread (for topic + timestamp)
        const { data: messages } = await supabase
            .from('agent_memory_messages')
            .select('thread_id, content, created_at')
            .in('thread_id', threadIds)
            .eq('role', 'user')
            .order('created_at', { ascending: false })
            .limit(100)

        // Build maps: threadId -> contextId, threadId -> metadata
        const threadToSpecialist: Record<string, string> = {}
        const threadMetadata: Record<string, Record<string, unknown>> = {}
        for (const t of threads) {
            threadToSpecialist[t.id] = t.context_id as string
            threadMetadata[t.id] = (t.metadata ?? {}) as Record<string, unknown>
        }

        // Group by specialist, take most recent
        const result: Record<string, SpecialistActivity> = {}
        const seen = new Set<string>()

        for (const msg of messages ?? []) {
            const specialistId = threadToSpecialist[msg.thread_id as string]
            if (!specialistId || seen.has(specialistId)) continue
            seen.add(specialistId)

            const content = msg.content as string
            // Find the thread for this specialist to extract mood
            const threadEntry = threads.find(t => threadToSpecialist[t.id] === specialistId)
            const meta = threadEntry ? threadMetadata[threadEntry.id] : {}
            result[specialistId] = {
                specialistId,
                lastMessageAt: msg.created_at as string,
                lastTopic: content.length > 60 ? content.slice(0, 60) + "..." : content,
                mood: typeof meta.mood === 'string' ? meta.mood : null,
                moodTrigger: typeof meta.mood_trigger === 'string' ? meta.mood_trigger : null,
            }
        }

        return { data: result, error: null }
    } catch (err) {
        console.error('[agent-memory] Failed to fetch specialist activities:', {
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return { data: null, error: 'Internal error' }
    }
}
