/**
 * @file intelligence-sweep-orchestrator.ts
 *
 * @description Orchestrates periodic intelligence sweeps where specialists
 * analyze company context and generate external intelligence reports.
 *
 * Sweeps run on-demand (triggered by cron or API) and produce IntelligenceReport
 * objects that are stored in the database and surfaced to the founder.
 *
 * This is separate from the main sweep-orchestrator.ts which handles the
 * always-on agent insight sweeps. Intelligence sweeps focus on external
 * intelligence analysis (market trends, risks, compliance, etc.).
 *
 * @dependencies
 * - External intelligence sources: src/lib/agents/external-intelligence.ts
 * - Supabase: src/lib/supabase/server.ts
 * - OpenAI SDK: openai (lazy-loaded via src/lib/ai/openai-lazy.ts)
 *
 * @related
 * - Intelligence definitions: src/lib/agents/external-intelligence.ts
 * - Main sweep orchestrator: src/lib/agents/sweep-orchestrator.ts
 * - Proactive outreach: src/lib/telegram/proactive-outreach.ts
 */

import { createClient } from '@/lib/supabase/server'
import { getOpenAIClient } from '@/lib/ai/openai-lazy'

import type { IntelligenceReport, IntelligenceSource } from './external-intelligence'
import type { SpecialistId } from '@/app/(platform)/agents/specialists-data'
import {
    INTELLIGENCE_SOURCES,
    getDueIntelligenceSources,
    getHighPriorityIntelligenceSources,
} from './external-intelligence'

// ─── Types ──────────────────────────────────────────────────────────

export interface IntelligenceSweepResult {
    /** Total sources checked */
    sourcesChecked: number
    /** Reports generated */
    reports: IntelligenceReport[]
    /** Errors encountered */
    errors: Array<{ sourceId: string; error: string }>
    /** Duration in ms */
    durationMs: number
}

export interface IntelligenceSweepOptions {
    /** Only run specific sources */
    sourceIds?: string[]
    /** Force run even if not due */
    force?: boolean
    /** Foundry to sweep for */
    foundryId: string
}

// ─── Intelligence Sweep Orchestrator ────────────────────────────────

/**
 * Runs an intelligence sweep for a foundry.
 *
 * @description Determines which intelligence sources are due for analysis,
 * builds company context, calls the AI for each source, and stores the
 * resulting reports.
 *
 * @param options - Sweep configuration
 * @returns Sweep results with generated reports
 */
export async function runIntelligenceSweep(
    options: IntelligenceSweepOptions,
): Promise<IntelligenceSweepResult> {
    const startTime = Date.now()
    const reports: IntelligenceReport[] = []
    const errors: Array<{ sourceId: string; error: string }> = []

    // Determine which sources to check
    let sources: IntelligenceSource[]

    if (options.sourceIds && options.sourceIds.length > 0) {
        sources = INTELLIGENCE_SOURCES.filter(s =>
            options.sourceIds!.includes(s.id),
        )
    } else if (options.force) {
        sources = [...INTELLIGENCE_SOURCES]
    } else {
        // Get last run times from database
        const lastRunTimes = await getLastRunTimes(options.foundryId)
        sources = getDueIntelligenceSources(lastRunTimes)
    }

    if (sources.length === 0) {
        return {
            sourcesChecked: 0,
            reports: [],
            errors: [],
            durationMs: Date.now() - startTime,
        }
    }

    // Build company context once (shared across all sources)
    const companyContext = await buildSweepContext(options.foundryId)

    // Run each source analysis (sequentially to avoid rate limits)
    for (const source of sources) {
        try {
            const report = await analyzeSource(source, companyContext)
            if (report) {
                reports.push(report)
                // Store in database
                await storeReport(report, options.foundryId)
                // Update last run time
                await updateLastRunTime(source.id, options.foundryId)
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error(`[IntelligenceSweep] Failed to analyze source ${source.id}:`, message)
            errors.push({ sourceId: source.id, error: message })
        }
    }

    return {
        sourcesChecked: sources.length,
        reports,
        errors,
        durationMs: Date.now() - startTime,
    }
}

/**
 * Runs a quick sweep of only high-priority sources.
 *
 * @param foundryId - The foundry to sweep for
 * @returns Sweep results
 */
export async function runHighPriorityIntelligenceSweep(
    foundryId: string,
): Promise<IntelligenceSweepResult> {
    const highPrioritySources = getHighPriorityIntelligenceSources()
    return runIntelligenceSweep({
        foundryId,
        sourceIds: highPrioritySources.map(s => s.id),
        force: true,
    })
}

/**
 * Gets recent intelligence reports for a foundry.
 *
 * @param foundryId - The foundry ID
 * @param limit - Maximum number of reports to return
 * @param specialistId - Optional filter by specialist
 * @returns Array of recent reports
 */
export async function getRecentIntelligenceReports(
    foundryId: string,
    limit: number = 10,
    specialistId?: string,
): Promise<IntelligenceReport[]> {
    try {
        const supabase = await createClient()

        let query = supabase
            .from('intelligence_reports')
            .select('*')
            .eq('foundry_id', foundryId)
            .order('created_at', { ascending: false })
            .limit(limit)

        if (specialistId) {
            query = query.eq('specialist_id', specialistId)
        }

        const { data, error } = await query

        if (error) {
            console.error('[IntelligenceSweep] Failed to fetch reports:', error.message)
            return []
        }

        // Map database rows to IntelligenceReport type
        return (data ?? []).map(mapRowToReport)
    } catch (err) {
        console.error('[IntelligenceSweep] Error fetching reports:', err)
        return []
    }
}

// ─── Internal Helpers ───────────────────────────────────────────────

/**
 * Maps a database row to an IntelligenceReport.
 *
 * @param row - Raw database row
 * @returns Typed IntelligenceReport
 */
function mapRowToReport(row: Record<string, unknown>): IntelligenceReport {
    return {
        sourceId: row.source_id as string,
        specialistId: row.specialist_id as SpecialistId,
        title: row.title as string,
        summary: row.summary as string,
        implications: (row.implications as string[]) ?? [],
        recommendedActions: (row.recommended_actions as string[]) ?? [],
        urgency: row.urgency as 'immediate' | 'this_week' | 'monitor',
        generatedAt: row.created_at as string,
    }
}

/**
 * Builds company context for sweep analysis.
 *
 * @param foundryId - The foundry ID
 * @returns Formatted company context string
 */
async function buildSweepContext(foundryId: string): Promise<string> {
    try {
        const supabase = await createClient()

        // Fetch foundry details (foundries table uses purpose_data JSON, not a text column)
        const { data: foundry } = await supabase
            .from('foundries')
            .select('name, industry, purpose_data')
            .eq('id', foundryId)
            .single()

        // Fetch active objectives
        const { data: objectives } = await supabase
            .from('objectives')
            .select('title, description, status, progress')
            .eq('foundry_id', foundryId)
            .in('status', ['active', 'in_progress'])
            .limit(10)

        // Fetch recent tasks
        const { data: tasks } = await supabase
            .from('tasks')
            .select('title, status')
            .eq('foundry_id', foundryId)
            .order('created_at', { ascending: false })
            .limit(20)

        // Fetch team size
        const { count: teamSize } = await supabase
            .from('foundry_memberships')
            .select('id', { count: 'exact', head: true })
            .eq('foundry_id', foundryId)

        const lines: string[] = ['## Company Context']

        if (foundry) {
            lines.push(`**Company:** ${foundry.name}`)
            if (foundry.industry) lines.push(`**Industry:** ${foundry.industry}`)
            // Extract purpose from purpose_data JSON if available
            const purposeData = foundry.purpose_data as Record<string, unknown> | null
            if (purposeData?.whyExists) {
                lines.push(`**Purpose:** ${purposeData.whyExists as string}`)
            }
        }

        if (teamSize) {
            lines.push(`**Team Size:** ${teamSize} members`)
        }

        if (objectives && objectives.length > 0) {
            lines.push('\n### Active Objectives')
            for (const obj of objectives) {
                const progress = obj.progress ? ` (${obj.progress}% complete)` : ''
                lines.push(`- ${obj.title}${progress}: ${obj.description ?? 'No description'}`)
            }
        }

        if (tasks && tasks.length > 0) {
            const statusCounts = tasks.reduce<Record<string, number>>((acc, t) => {
                const status = (t.status as string) ?? 'unknown'
                acc[status] = (acc[status] ?? 0) + 1
                return acc
            }, {})
            lines.push('\n### Task Distribution')
            for (const [status, count] of Object.entries(statusCounts)) {
                lines.push(`- ${status}: ${count} tasks`)
            }
        }

        return lines.join('\n')
    } catch (err) {
        console.error('[IntelligenceSweep] Failed to build sweep context:', err)
        return '## Company Context\nUnable to load company context.'
    }
}

/**
 * Analyzes a single intelligence source using AI.
 *
 * @description Calls OpenAI (gpt-4o-mini) with the source's analysis prompt
 * and company context to generate an intelligence report.
 *
 * @param source - The intelligence source to analyze
 * @param companyContext - Pre-built company context
 * @returns Generated intelligence report, or null if analysis failed
 */
async function analyzeSource(
    source: IntelligenceSource,
    companyContext: string,
): Promise<IntelligenceReport | null> {
    try {
        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) {
            console.error('[IntelligenceSweep] OPENAI_API_KEY not configured')
            return null
        }

        const OpenAI = await getOpenAIClient()
        const client = new OpenAI({ apiKey })

        const prompt = `${companyContext}\n\n---\n\n${source.analysisPrompt}`

        const response = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are ${source.name}, an intelligence analyst for a startup. Analyze the company context and provide a concise intelligence report. Be specific, actionable, and honest. If you lack information to be specific, say so rather than being generic.

Respond in this JSON format:
{
  "title": "Brief report title",
  "summary": "2-3 sentence summary",
  "implications": ["implication 1", "implication 2"],
  "recommendedActions": ["action 1", "action 2"],
  "urgency": "immediate" | "this_week" | "monitor"
}`,
                },
                { role: 'user', content: prompt },
            ],
            max_tokens: 500,
            temperature: 0.7,
        })

        const text = response.choices[0]?.message?.content?.trim()
        if (!text) {
            console.warn(`[IntelligenceSweep] Empty response for ${source.id}`)
            return null
        }

        // Extract JSON from potential markdown code blocks
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            console.warn(`[IntelligenceSweep] No JSON found in response for ${source.id}`)
            return null
        }

        const parsed = JSON.parse(jsonMatch[0]) as {
            title: string
            summary: string
            implications: string[]
            recommendedActions: string[]
            urgency: string
        }

        const validUrgencies = ['immediate', 'this_week', 'monitor'] as const
        const urgency = validUrgencies.includes(parsed.urgency as typeof validUrgencies[number])
            ? (parsed.urgency as 'immediate' | 'this_week' | 'monitor')
            : 'monitor'

        return {
            sourceId: source.id,
            specialistId: source.specialistId,
            title: parsed.title,
            summary: parsed.summary,
            implications: parsed.implications ?? [],
            recommendedActions: parsed.recommendedActions ?? [],
            urgency,
            generatedAt: new Date().toISOString(),
        }
    } catch (err) {
        console.error(`[IntelligenceSweep] AI analysis failed for ${source.id}:`, err)
        return null
    }
}

/**
 * Stores an intelligence report in the database.
 *
 * @param report - The report to store
 * @param foundryId - The foundry ID
 */
async function storeReport(
    report: IntelligenceReport,
    foundryId: string,
): Promise<void> {
    try {
        const supabase = await createClient()

        const { error } = await supabase.from('intelligence_reports').insert({
            foundry_id: foundryId,
            source_id: report.sourceId,
            specialist_id: report.specialistId,
            title: report.title,
            summary: report.summary,
            implications: report.implications,
            recommended_actions: report.recommendedActions,
            urgency: report.urgency,
        })

        if (error) {
            console.error('[IntelligenceSweep] Failed to store report:', error.message)
        }
    } catch (err) {
        console.error('[IntelligenceSweep] Error storing report:', err)
    }
}

/**
 * Gets last run times for all intelligence sources in a foundry.
 *
 * @param foundryId - The foundry ID
 * @returns Map of source ID to last run timestamp
 */
async function getLastRunTimes(
    foundryId: string,
): Promise<Record<string, string>> {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('intelligence_sweep_log')
            .select('source_id, last_run_at')
            .eq('foundry_id', foundryId)

        if (error || !data) return {}

        return data.reduce<Record<string, string>>((acc, row) => {
            acc[row.source_id as string] = row.last_run_at as string
            return acc
        }, {})
    } catch {
        return {}
    }
}

/**
 * Updates the last run time for an intelligence source.
 *
 * @param sourceId - The source ID
 * @param foundryId - The foundry ID
 */
async function updateLastRunTime(
    sourceId: string,
    foundryId: string,
): Promise<void> {
    try {
        const supabase = await createClient()

        const { error } = await supabase
            .from('intelligence_sweep_log')
            .upsert(
                {
                    source_id: sourceId,
                    foundry_id: foundryId,
                    last_run_at: new Date().toISOString(),
                },
                { onConflict: 'source_id,foundry_id' },
            )

        if (error) {
            console.error('[IntelligenceSweep] Failed to update last run time:', error.message)
        }
    } catch (err) {
        console.error('[IntelligenceSweep] Error updating last run time:', err)
    }
}
