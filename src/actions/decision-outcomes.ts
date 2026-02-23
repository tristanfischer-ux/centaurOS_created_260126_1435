'use server'

/**
 * @file decision-outcomes.ts
 *
 * @description Server actions for recording decision outcomes and
 * fetching decision timelines. Allows founders to track whether
 * past decisions worked out.
 *
 * @security All actions require authenticated user with foundry membership.
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import type { OutcomeStatus, DecisionEntry } from '@/lib/agents/decision-journal'

/**
 * Updates the outcome of a past decision.
 *
 * @param decisionId - The decision to update
 * @param outcomeStatus - The outcome (positive, negative, mixed)
 * @param outcomeNotes - Optional notes about the outcome
 *
 * @security Verifies foundry ownership before updating
 */
export async function updateDecisionOutcome(
    decisionId: string,
    outcomeStatus: OutcomeStatus,
    outcomeNotes?: string,
): Promise<{ error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Unauthorized' }

        const foundryId = await getFoundryIdCached()
        if (!foundryId) return { error: 'No active foundry' }

        const { error } = await supabase
            .from('specialist_decision_journal')
            .update({
                outcome_status: outcomeStatus,
                outcome_notes: outcomeNotes ?? null,
                outcome_recorded_at: new Date().toISOString(),
            })
            .eq('id', decisionId)
            .eq('foundry_id', foundryId)

        if (error) {
            console.error('[decision-outcomes] Failed to update:', error.message)
            return { error: 'Failed to update decision outcome' }
        }

        return { error: null }
    } catch (err) {
        console.error('[decision-outcomes] Error:', err)
        return { error: 'Internal error' }
    }
}

/**
 * Fetches all decisions for a specialist, ordered by date.
 *
 * @param specialistId - The specialist to get decisions for (optional, null for all)
 * @returns Timeline of decisions with outcomes
 *
 * @security Requires authenticated user with foundry membership
 */
export async function getDecisionTimeline(
    specialistId?: string,
): Promise<{ data: DecisionEntry[]; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { data: [], error: 'Unauthorized' }

        const foundryId = await getFoundryIdCached()
        if (!foundryId) return { data: [], error: 'No active foundry' }

        let query = supabase
            .from('specialist_decision_journal')
            .select('id, foundry_id, specialist_id, decision, context, outcome, outcome_status, outcome_notes, outcome_recorded_at, created_at')
            .eq('foundry_id', foundryId)
            .order('created_at', { ascending: false })
            .limit(50)

        if (specialistId) {
            query = query.eq('specialist_id', specialistId)
        }

        const { data, error } = await query

        if (error) {
            console.error('[decision-outcomes] Failed to fetch timeline:', error.message)
            return { data: [], error: 'Failed to fetch decisions' }
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
    } catch (err) {
        console.error('[decision-outcomes] Error:', err)
        return { data: [], error: 'Internal error' }
    }
}
