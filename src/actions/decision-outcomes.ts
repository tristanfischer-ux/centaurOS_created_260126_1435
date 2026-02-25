'use server'

/**
 * @file decision-outcomes.ts
 *
 * @description Server actions for recording decision outcomes and finding
 * pending decisions related to the current conversation. Used by the
 * DecisionOutcomePrompt inline card in brief-specialist-dialog.
 *
 * @related
 * - Decision journal: src/lib/agents/decision-journal.ts (data model)
 * - Prompt component: src/components/specialists/decision-outcome-prompt.tsx
 * - Dialog: src/app/(platform)/agents/brief-specialist-dialog.tsx (consumer)
 */

import { createClient } from '@/lib/supabase/server'
import type { DecisionEntry, OutcomeStatus } from '@/lib/agents/decision-journal'

// ─── Stop-words filtered during keyword matching ─────────────────────────────
const STOPWORDS = new Set([
    'with', 'that', 'this', 'from', 'they', 'have', 'been', 'will', 'what',
    'when', 'were', 'said', 'each', 'which', 'their', 'time', 'more', 'very',
    'just', 'know', 'take', 'into', 'year', 'your', 'good', 'some', 'them',
    'then', 'than', 'well', 'also', 'make', 'like', 'want', 'look', 'come',
    'would', 'could', 'about', 'there', 'after', 'first', 'these', 'those',
    'decided', 'decision', 'context', 'going', 'proceed', 'going', 'lets',
])

/**
 * Updates the outcome of a past decision.
 *
 * @description Updates a decision journal entry with the founder's reported
 * outcome. Safe to call even if the decision no longer exists (no-op).
 * Security: only the authenticated user's foundry decisions can be updated.
 * Exported as both `updateDecisionOutcome` (used by existing components) and
 * `recordDecisionOutcome` (used by the inline prompt component).
 *
 * @param decisionId - The decision journal entry UUID
 * @param status - Outcome type (positive/negative/mixed/unknown)
 * @param notes - Optional free-text notes about the outcome
 * @returns Success status and optional error message
 *
 * @security Requires authenticated user. foundry_id filter prevents cross-foundry updates.
 */
export async function updateDecisionOutcome(
    decisionId: string,
    status: OutcomeStatus,
    notes?: string,
): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    // AUTH: Get user's foundry to scope the update
    const { data: foundry } = await supabase
        .from('foundries')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (!foundry) return { success: false, error: 'No foundry found' }

    const { error } = await supabase
        .from('specialist_decision_journal')
        .update({
            outcome_status: status,
            outcome_notes: notes ?? null,
            outcome_recorded_at: new Date().toISOString(),
        })
        // SECURITY: Scope to user's foundry — prevents updating other foundries' decisions
        .eq('id', decisionId)
        .eq('foundry_id', foundry.id)

    if (error) {
        console.error('[decision-outcomes] Failed to record outcome:', error)
        return { success: false, error: error.message }
    }

    return { success: true, error: null }
}

/** @alias Backward-compatible alias for updateDecisionOutcome */
export const recordDecisionOutcome = updateDecisionOutcome

/**
 * Retrieves the decision timeline for the current user's foundry.
 *
 * @description Used by DecisionTimeline to show all decisions, optionally
 * filtered by specialist. Returns decisions in reverse chronological order.
 *
 * @param specialistId - Optional filter to a specific specialist's decisions
 * @returns Decision entries and optional error
 */
export async function getDecisionTimeline(
    specialistId?: string,
): Promise<{ data: DecisionEntry[]; error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Not authenticated' }

    // AUTH: Get user's foundry
    const { data: foundry } = await supabase
        .from('foundries')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (!foundry) return { data: [], error: 'No foundry found' }

    let query = supabase
        .from('specialist_decision_journal')
        .select('id, foundry_id, specialist_id, decision, context, outcome, outcome_status, outcome_notes, outcome_recorded_at, created_at')
        .eq('foundry_id', foundry.id)
        .order('created_at', { ascending: false })
        .limit(50)

    if (specialistId) {
        query = query.eq('specialist_id', specialistId)
    }

    const { data, error } = await query

    if (error) {
        console.error('[decision-outcomes] Failed to fetch timeline:', error)
        return { data: [], error: error.message }
    }

    const entries: DecisionEntry[] = (data ?? []).map(row => ({
        id: row.id,
        foundryId: row.foundry_id,
        specialistId: row.specialist_id,
        decision: row.decision,
        context: row.context ?? '',
        outcome: row.outcome ?? undefined,
        outcomeStatus: (row.outcome_status ?? 'pending') as OutcomeStatus,
        outcomeNotes: row.outcome_notes ?? undefined,
        outcomeRecordedAt: row.outcome_recorded_at ?? undefined,
        createdAt: row.created_at,
    }))

    return { data: entries, error: null }
}

/**
 * Finds pending decisions that are topically related to a conversation response.
 *
 * @description After each specialist response, this runs a keyword-overlap check
 * against the user's pending decisions. If 2+ meaningful words from a decision
 * appear in the response, the decision is returned as a candidate for outcome
 * recording. Only checks decisions from the last 90 days to avoid stale prompts.
 *
 * @param conversationText - The assistant's response text to match against
 * @param specialistId - The current specialist (used to prioritize same-specialist decisions)
 * @returns Array of matching pending decisions (max 2 to avoid noise)
 */
export async function findRelatedPendingDecisions(
    conversationText: string,
    specialistId: string,
): Promise<DecisionEntry[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // AUTH: Get user's foundry
    const { data: foundry } = await supabase
        .from('foundries')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (!foundry) return []

    // Fetch recent pending decisions (last 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
        .from('specialist_decision_journal')
        .select('id, foundry_id, specialist_id, decision, context, outcome, outcome_status, outcome_notes, outcome_recorded_at, created_at')
        .eq('foundry_id', foundry.id)
        .or('outcome_status.is.null,outcome_status.eq.pending')
        .gte('created_at', ninetyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(30)

    if (!data?.length) return []

    const text = conversationText.toLowerCase()

    // Score each decision by keyword overlap
    const scored = data
        .map(row => {
            const words = row.decision
                .toLowerCase()
                .split(/\W+/)
                .filter((w: string) => w.length > 3 && !STOPWORDS.has(w))

            const matchCount = words.filter((w: string) => text.includes(w)).length
            // Boost same-specialist decisions
            const boost = row.specialist_id === specialistId ? 1 : 0
            return { row, score: matchCount + boost }
        })
        .filter(({ score }) => score >= 2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2) // Max 2 prompts to avoid overwhelming the user

    return scored.map(({ row }) => ({
        id: row.id,
        foundryId: row.foundry_id,
        specialistId: row.specialist_id,
        decision: row.decision,
        context: row.context ?? '',
        outcome: row.outcome ?? undefined,
        outcomeStatus: (row.outcome_status ?? 'pending') as OutcomeStatus,
        outcomeNotes: row.outcome_notes ?? undefined,
        outcomeRecordedAt: row.outcome_recorded_at ?? undefined,
        createdAt: row.created_at,
    }))
}
