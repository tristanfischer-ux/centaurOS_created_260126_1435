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

        // Look for existing specialist thread in this foundry
        const { data: existing } = await supabase
            .from('agent_memory_threads')
            .select()
            .eq('foundry_id', foundryId)
            .eq('context_type', 'specialist')
            .eq('context_id', specialistId)
            .order('created_at', { ascending: true })
            .limit(1)
            .single()

        if (existing) {
            return { threadId: (existing as MemoryThread).id, error: null }
        }

        // Create a new specialist thread
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

        const results: Array<{ specialistId: string; summary: string }> = []

        // For each thread, get the most recent assistant message
        for (const thread of threads) {
            if (results.length >= limit) break

            const { data: lastMsg } = await supabase
                .from('agent_memory_messages')
                .select('content')
                .eq('thread_id', thread.id)
                .eq('role', 'assistant')
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            if (lastMsg?.content) {
                // Truncate to first ~300 chars for a summary
                const summary = (lastMsg.content as string).length > 300
                    ? (lastMsg.content as string).slice(0, 300) + '...'
                    : (lastMsg.content as string)
                results.push({
                    specialistId: thread.context_id as string,
                    summary,
                })
            }
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
        const { data: thread } = await supabase
            .from('agent_memory_threads')
            .select('id')
            .eq('foundry_id', foundryId)
            .eq('context_type', 'specialist')
            .eq('context_id', specialistId)
            .limit(1)
            .single()

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
