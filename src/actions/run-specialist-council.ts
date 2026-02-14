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

import { cookies, headers } from 'next/headers'
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

/** Return type for the council action — errors returned as data, never thrown */
export type CouncilActionResult =
    | { success: true; data: CouncilResult }
    | { success: false; error: string }

function isValidHostHeader(host: string): boolean {
    return /^[a-zA-Z0-9.-]+(?::\d+)?$/.test(host)
}

async function resolveInternalBaseUrl(): Promise<string | null> {
    const headerStore = await headers()
    const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host')
    const protocol = headerStore.get('x-forwarded-proto') ?? (host?.includes('localhost') ? 'http' : 'https')

    if (!host || !isValidHostHeader(host)) {
        return null
    }

    if (protocol !== 'http' && protocol !== 'https') {
        return null
    }

    return `${protocol}://${host}`
}

/**
 * Runs a Specialist Council debate and returns the results.
 *
 * @description Returns errors as data (not thrown) so Next.js production
 * builds don't sanitize the message into a generic "Server Components render" error.
 *
 * @param params - The council parameters
 * @returns Success with council result, or failure with error message
 */
export async function runSpecialistCouncil(
    params: RunSpecialistCouncilParams
): Promise<CouncilActionResult> {
    const { topic, context } = params

    if (!topic || topic.trim().length === 0) {
        return { success: false, error: 'Topic is required' }
    }

    if (topic.length > 500) {
        return { success: false, error: 'Topic must be 500 characters or less' }
    }

    // AUTH: Authenticate before proceeding
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        return { success: false, error: 'Please sign in to use the Specialist Council' }
    }

    try {
        // Call the council API (forward cookies so execute sub-requests are authenticated)
        const baseUrl = await resolveInternalBaseUrl()
        if (!baseUrl) {
            return { success: false, error: 'Unable to resolve internal API host' }
        }
        const cookieStore = await cookies()
        const cookieHeader = cookieStore
            .getAll()
            .map((c) => `${c.name}=${c.value}`)
            .join('; ')

        const response = await fetch(new URL('/api/agents/council', baseUrl), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(cookieHeader && { Cookie: cookieHeader }),
            },
            body: JSON.stringify({
                topic: topic.trim(),
                context: context?.trim(),
            }),
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Request failed' }))
            const message = errorData.error || `Request failed with status ${response.status}`
            console.error('[Council Action] API request failed:', { status: response.status, message })
            return { success: false, error: message }
        }

        const result = await response.json() as CouncilResult

        // Revalidate relevant paths
        revalidatePath('/today')
        revalidatePath('/agents')

        return { success: true, data: result }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('[Council Action] Unexpected error:', { error: message })
        return { success: false, error: `Council failed: ${message}` }
    }
}
