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
import type { MemoryContextType } from '@/lib/agent-memory'

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
