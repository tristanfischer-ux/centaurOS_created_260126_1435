/**
 * @file lessons-learned.ts — Retrieves and formats a specialist's past low-scoring
 * outputs so it can self-correct and avoid repeating mistakes.
 *
 * @description Queries agent_memory_messages for assistant responses that scored
 * below 0.5 overall in evaluation, pairs each with the preceding user message
 * for context, and compiles them into a prompt section that highlights weak
 * dimensions (relevance, completeness, actionability).
 *
 * @related
 * - Evaluator: src/lib/agents/evaluator.ts (writes the evaluation scores)
 * - Prompt builder: src/lib/agents/prompt-builder.ts (consumes this as Layer 10)
 * - Memory tables: agent_memory_messages, agent_memory_threads
 *
 * @security Reads cross-thread data within the same foundry+specialist scope.
 * All queries filter by foundry_id via thread ownership. Uses admin client
 * because this runs server-side during prompt assembly.
 */

import { createAdminClient } from "@/lib/supabase/admin"

export interface LowScoreEntry {
    messageId: string
    createdAt: string
    overallScore: number
    relevance: number
    completeness: number
    actionability: number
    feedback: string
    /** First 120 chars of the user message that preceded this response */
    userPromptSnippet: string
}

/**
 * Fetches recent low-scoring assistant outputs for a specialist within a foundry.
 *
 * @description Pulls the last 60 days of assistant messages from the specialist's
 * threads, filters for evaluation overall < 0.5 in JS (Supabase JSONB filtering
 * is limited), then pairs each with the preceding user message for context.
 *
 * @param foundryId - The foundry ID (ensures tenant isolation)
 * @param specialistId - The specialist whose outputs to examine
 * @param limit - Max entries to return, sorted by score ascending (default 5)
 * @returns Low-scoring entries with context, sorted worst-first
 */
export async function getLowScoringOutputs(
    foundryId: string,
    specialistId: string,
    limit: number = 5,
): Promise<LowScoreEntry[]> {
    // SECURITY: All queries scoped to foundry_id via thread ownership
    const admin = createAdminClient()

    // 1. Get thread IDs for this foundry + specialist
    // GOTCHA: specialist_id is NOT a column — it's stored in context_id (when context_type='specialist')
    // and also in metadata->specialistId. We use context_id as the canonical source.
    const { data: threads, error: threadErr } = await admin
        .from('agent_memory_threads')
        .select('id')
        .eq('foundry_id', foundryId)
        .eq('context_type', 'specialist')
        .eq('context_id', specialistId)

    if (threadErr || !threads?.length) return []

    const threadIds = threads.map(t => t.id)

    // 2. Fetch recent assistant messages (last 60 days, limit 50)
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

    // GOTCHA: agent_memory_messages has no 'message_index' column — removed from select.
    // To find the preceding user message, we fetch the most recent user msg before this one's created_at.
    const { data: messages, error: msgErr } = await admin
        .from('agent_memory_messages')
        .select('id, thread_id, metadata, created_at')
        .in('thread_id', threadIds)
        .eq('role', 'assistant')
        .gt('created_at', sixtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(50)

    if (msgErr || !messages?.length) return []

    // 3. Filter in JS for ones where evaluation.overall < 0.5
    const lowScoring = messages.filter(m => {
        const meta = m.metadata as Record<string, unknown> | null
        const eval_ = meta?.evaluation as Record<string, unknown> | undefined
        return eval_ && typeof eval_.overall === 'number' && eval_.overall < 0.5
    })

    if (lowScoring.length === 0) return []

    // 4. For each low-scoring message, find the preceding user message
    const entries: LowScoreEntry[] = []

    for (const msg of lowScoring) {
        const meta = msg.metadata as Record<string, unknown>
        const eval_ = meta.evaluation as Record<string, unknown>
        let userSnippet = '(no preceding message found)'

        // Find the most recent user message in the same thread before this assistant response
        const { data: userMsg } = await admin
            .from('agent_memory_messages')
            .select('content')
            .eq('thread_id', msg.thread_id)
            .eq('role', 'user')
            .lt('created_at', msg.created_at)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

        if (userMsg?.content) {
            userSnippet = (userMsg.content as string).slice(0, 120)
        }

        entries.push({
            messageId: msg.id,
            createdAt: msg.created_at,
            overallScore: (eval_.overall as number) ?? 0,
            relevance: (eval_.relevance as number) ?? 0,
            completeness: (eval_.completeness as number) ?? 0,
            actionability: (eval_.actionability as number) ?? 0,
            feedback: (eval_.feedback as string) ?? '',
            userPromptSnippet: userSnippet,
        })
    }

    // 5. Sort by score ascending (worst first), take top `limit`
    return entries
        .sort((a, b) => a.overallScore - b.overallScore)
        .slice(0, limit)
}

/**
 * Compiles low-scoring entries into a prompt section for self-correction.
 *
 * @description Formats each entry with date, score, weakest dimension, the
 * question context, and evaluator feedback. Appends action rules so the
 * specialist knows how to improve on each weak dimension.
 *
 * @param entries - Low-scoring entries from getLowScoringOutputs
 * @param specialistName - Display name for the specialist (unused in output but kept for consistency)
 * @returns Formatted prompt section, or empty string if no entries
 */
export function compileLessonsLearnedPrompt(
    entries: LowScoreEntry[],
    specialistName: string,
): string {
    if (entries.length === 0) return ''

    const lines = entries.map((e, i) => {
        const date = new Date(e.createdAt).toLocaleDateString('en-GB')
        const weakest = e.relevance <= e.completeness && e.relevance <= e.actionability
            ? 'relevance'
            : e.completeness <= e.actionability ? 'completeness' : 'actionability'
        return `${i + 1}. [${date}] Score: ${e.overallScore} — Weakest: ${weakest}
   Question was about: "${e.userPromptSnippet}..."
   Evaluator feedback: ${e.feedback || 'No specific feedback'}`
    }).join('\n\n')

    return `## Your Recent Performance Notes

These are YOUR recent responses that scored below expectations. Learn from them.

${lines}

ACTION RULES:
- If the current question touches a similar topic, be EXTRA thorough on the weak dimension.
- "Low actionability" means: include specific numbers, timelines, costs, and concrete next steps.
- "Low completeness" means: address EVERY part of the founder's question — don't skip sub-questions.
- "Low relevance" means: stay on topic — answer what was asked, not what's adjacent.
- Do NOT mention these scores or this section to the founder. This is internal self-improvement.`
}
