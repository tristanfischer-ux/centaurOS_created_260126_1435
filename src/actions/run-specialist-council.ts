/**
 * @file run-specialist-council.ts
 *
 * @description Server action to trigger a Specialist Council debate.
 * Orchestrates the council API and returns the debate results and report.
 *
 * @action runSpecialistCouncil
 * @param {Object} params
 * @param {string} params.topic - The debate topic/question
 * @param {string} [params.context] - Optional context/background
 * @returns {Promise<CouncilResult>} The debate transcript and Chief of Staff report
 */

'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface CouncilDebateEntry {
    specialistId: string
    specialistName: string
    specialistTitle: string
    round: number
    content: string
}

export interface CouncilPosition {
    specialist: string
    specialist_id: string
    key_position: string
    conviction: 'high' | 'medium' | 'low'
}

export interface CouncilTension {
    between: string[]
    description: string
}

export interface CouncilDecisionOption {
    option: string
    supporters: string[]
    rationale: string
}

export interface CouncilReport {
    executive_summary: string
    positions: CouncilPosition[]
    tensions: CouncilTension[]
    consensus: string[]
    recommendations: string[]
    decision_options: CouncilDecisionOption[]
}

export interface CouncilResult {
    topic: string
    specialists: Array<{ id: string; name: string; title: string }>
    debate: CouncilDebateEntry[]
    report: CouncilReport
}

export interface RunSpecialistCouncilParams {
    topic: string
    context?: string
}

/**
 * Runs a Specialist Council debate and returns the results.
 *
 * @param params - The council parameters
 * @returns The debate results and Chief of Staff report
 */
export async function runSpecialistCouncil(
    params: RunSpecialistCouncilParams
): Promise<CouncilResult> {
    const { topic, context } = params

    if (!topic || topic.trim().length === 0) {
        throw new Error('Topic is required')
    }

    if (topic.length > 500) {
        throw new Error('Topic must be 500 characters or less')
    }

    // Authenticate
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        throw new Error('Unauthorized')
    }

    // Call the council API
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''
    const response = await fetch(`${baseUrl}/api/agents/council`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            topic: topic.trim(),
            context: context?.trim(),
        }),
    })

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(errorData.error || `Request failed with status ${response.status}`)
    }

    const result = await response.json() as CouncilResult

    // Revalidate relevant paths
    revalidatePath('/today')
    revalidatePath('/agents')

    return result
}
