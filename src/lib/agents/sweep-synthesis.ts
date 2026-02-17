/**
 * @file sweep-synthesis.ts
 *
 * @description Multi-specialist synthesis engine for the Always-On Agent
 * Intelligence system. Cal (Chief of Staff) orchestrates insights from all
 * specialists into a unified weekly executive brief. Also supports decision
 * support packages where relevant specialists contribute perspectives on
 * critical findings.
 *
 * @security Uses service role client (cron context, no user session).
 * All synthesis results stored as agent_insights with type "report".
 *
 * @dependencies
 * - Supabase: agent_insights, foundry_agent_preferences
 * - MiniMax M2.5 via OpenAI-compatible API
 * - Sweep context builder for company data
 *
 * @audit Synthesis runs logged to agent_sweep_log
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getOpenAIClient } from '@/lib/ai/openai-lazy'
import { buildAIContextWithServiceClient } from './sweep-context'
import { estimateAICost } from '@/lib/ai/usage-tracking'
import { SPECIALISTS } from '@/app/(platform)/agents/specialists-data'
import { compilePersonalityPrompt } from './personality'
import { dispatchInsightNotifications } from './sweep-notifications'
import type { AgentInsight } from '@/actions/agent-insights'

// ─── Types ──────────────────────────────────────────────────────────

/** Result from the synthesis run */
export interface SynthesisResult {
  foundryId: string
  status: 'completed' | 'failed' | 'skipped'
  briefInsightId: string | null
  tokensIn: number
  tokensOut: number
  estimatedCostUsd: number
  durationMs: number
  error?: string
}

/** Full orchestration result */
export interface SynthesisOrchestrationResult {
  foundriesProcessed: number
  briefsGenerated: number
  briefsFailed: number
  totalCostUsd: number
  durationMs: number
  results: SynthesisResult[]
}

/** A specialist insight summary for the synthesis prompt */
interface SpecialistInsightSummary {
  specialistId: string
  specialistName: string
  specialistTitle: string
  insightCount: number
  criticalCount: number
  importantCount: number
  topInsights: Array<{
    type: string
    urgency: string
    title: string
    body: string
  }>
}

// ─── Constants ──────────────────────────────────────────────────────

/** Model used for synthesis (same as sweeps) */
const SYNTHESIS_MODEL = 'MiniMax-M2.5'

/** Maximum output tokens for executive brief */
const SYNTHESIS_MAX_TOKENS = 8192

/** How far back to look for insights (7 days) */
const SYNTHESIS_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000

/** Cal's specialist ID — the Chief of Staff who writes the brief */
const CAL_SPECIALIST_ID = 'chief-of-staff'

/** Max insights to include per specialist in the synthesis prompt */
const MAX_INSIGHTS_PER_SPECIALIST = 5

// ─── Synthesis Orchestrator ─────────────────────────────────────────

/**
 * Runs weekly synthesis across all active foundries.
 *
 * @description Determines which foundries need a weekly brief, collects
 * insights from all specialists, and has Cal produce a unified narrative.
 *
 * @returns Aggregated synthesis results
 * @audit Logs synthesis runs to agent_sweep_log
 */
export async function runWeeklySynthesis(): Promise<SynthesisOrchestrationResult> {
  const startTime = Date.now()
  const results: SynthesisResult[] = []

  const supabase = createAdminClient()

  // 1. Load all foundries
  const { data: foundries, error: foundryError } = await supabase
    .from('foundries')
    .select('id')
    .order('created_at', { ascending: false })

  if (foundryError || !foundries) {
    console.error('[SweepSynthesis] Failed to load foundries:', foundryError?.message)
    return {
      foundriesProcessed: 0,
      briefsGenerated: 0,
      briefsFailed: 0,
      totalCostUsd: 0,
      durationMs: Date.now() - startTime,
      results: [],
    }
  }

  // 2. Load preferences to check if sweeps are enabled
  const { data: allPreferences } = await supabase
    .from('foundry_agent_preferences')
    .select('foundry_id, sweeps_enabled')

  const enabledFoundries = new Set<string>()
  if (allPreferences) {
    for (const pref of allPreferences) {
      if (pref.sweeps_enabled) enabledFoundries.add(pref.foundry_id)
    }
  }

  // 3. Process each foundry
  for (const foundry of foundries) {
    // Default to enabled if no preferences set
    const isEnabled = enabledFoundries.has(foundry.id) || !allPreferences?.some(p => p.foundry_id === foundry.id)
    if (!isEnabled) continue

    const result = await generateWeeklyBrief(foundry.id)
    results.push(result)
  }

  const aggregated: SynthesisOrchestrationResult = {
    foundriesProcessed: results.length,
    briefsGenerated: results.filter(r => r.status === 'completed').length,
    briefsFailed: results.filter(r => r.status === 'failed').length,
    totalCostUsd: results.reduce((sum, r) => sum + r.estimatedCostUsd, 0),
    durationMs: Date.now() - startTime,
    results,
  }

  console.info(
    `[SweepSynthesis] Complete: ${aggregated.briefsGenerated} briefs generated, ` +
    `$${aggregated.totalCostUsd.toFixed(4)} cost, ${aggregated.durationMs}ms`
  )

  return aggregated
}

// ─── Weekly Brief Generator ─────────────────────────────────────────

/**
 * Generates a weekly executive brief for a single foundry.
 *
 * @description Collects insights from all specialists over the past week,
 * builds a synthesis prompt for Cal, and produces a unified narrative brief.
 * The brief is stored as an agent_insight of type "report".
 *
 * @param foundryId - The foundry to generate the brief for
 * @returns Synthesis result with metrics
 */
export async function generateWeeklyBrief(foundryId: string): Promise<SynthesisResult> {
  const startTime = Date.now()
  const supabase = createAdminClient()

  try {
    // 1. Collect past week's insights from all specialists
    const weekAgo = new Date(Date.now() - SYNTHESIS_LOOKBACK_MS).toISOString()
    const { data: weekInsights, error: insightError } = await supabase
      .from('agent_insights')
      .select('specialist_id, insight_type, urgency, title, body')
      .eq('foundry_id', foundryId)
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false })

    if (insightError) {
      throw new Error(`Failed to fetch insights: ${insightError.message}`)
    }

    // If no insights this week, skip synthesis
    if (!weekInsights || weekInsights.length === 0) {
      console.info(`[SweepSynthesis] No insights for foundry ${foundryId} — skipping`)
      return {
        foundryId,
        status: 'skipped',
        briefInsightId: null,
        tokensIn: 0,
        tokensOut: 0,
        estimatedCostUsd: 0,
        durationMs: Date.now() - startTime,
      }
    }

    // 2. Group insights by specialist
    const specialistSummaries = buildSpecialistSummaries(weekInsights)

    // 3. Build company context
    const companyContext = await buildAIContextWithServiceClient(foundryId)

    // 4. Find Cal's personality data
    const calSpecialist = SPECIALISTS.find(s => s.id === CAL_SPECIALIST_ID)
    if (!calSpecialist) {
      throw new Error('Cal (Chief of Staff) specialist not found in registry')
    }

    const personalityPrompt = compilePersonalityPrompt(
      calSpecialist.name,
      calSpecialist.personality,
      undefined,
      CAL_SPECIALIST_ID,
    )

    // 5. Build synthesis prompt
    const systemPrompt = buildSynthesisSystemPrompt(personalityPrompt, companyContext)
    const userPrompt = buildSynthesisUserPrompt(specialistSummaries, weekInsights.length)

    // 6. Call MiniMax M2.5
    const apiKey = process.env.MINIMAX_API_KEY
    if (!apiKey) {
      throw new Error('MINIMAX_API_KEY not configured')
    }

    const OpenAI = await getOpenAIClient()
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.minimax.io/v1',
    })

    const completion = await client.chat.completions.create({
      model: SYNTHESIS_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: SYNTHESIS_MAX_TOKENS,
      temperature: 0.4,
    })

    const responseText = completion.choices[0]?.message?.content ?? ''
    const tokensIn = completion.usage?.prompt_tokens ?? 0
    const tokensOut = completion.usage?.completion_tokens ?? 0
    const costUsd = estimateAICost(SYNTHESIS_MODEL, tokensIn, tokensOut)

    // 7. Parse the structured brief
    let briefData: {
      title: string
      executive_summary: string
      sections: Array<{ heading: string; body: string }>
      top_priorities: string[]
      risks: string[]
      wins: string[]
    }

    try {
      const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || [null, responseText]
      const jsonStr = jsonMatch[1]?.trim() ?? responseText.trim()
      briefData = JSON.parse(jsonStr)
    } catch {
      // If JSON parsing fails, wrap the raw text as the brief body
      briefData = {
        title: 'Weekly Executive Brief',
        executive_summary: responseText.slice(0, 500),
        sections: [{ heading: 'Full Brief', body: responseText }],
        top_priorities: [],
        risks: [],
        wins: [],
      }
    }

    // 8. Compose the brief body (Markdown format for rich display)
    const briefBody = composeBriefMarkdown(briefData)

    // 9. Store as an insight of type "report"
    const { data: insightId, error: insertError } = await supabase.rpc('insert_agent_insight', {
      p_foundry_id: foundryId,
      p_specialist_id: CAL_SPECIALIST_ID,
      p_insight_type: 'report',
      p_urgency: 'important',
      p_title: briefData.title || 'Weekly Executive Brief',
      p_body: briefBody.slice(0, 10000),
      p_domain_data: {
        synthesis_type: 'weekly_executive_brief',
        period_start: weekAgo,
        period_end: new Date().toISOString(),
        insights_analyzed: weekInsights.length,
        specialists_contributing: specialistSummaries.length,
        top_priorities: briefData.top_priorities ?? [],
        risks: briefData.risks ?? [],
        wins: briefData.wins ?? [],
      },
      p_suggested_actions: [
        {
          label: 'Review Full Brief',
          action_type: 'view_page',
          action_data: { page: '/today' },
        },
        {
          label: 'Discuss with Cal',
          action_type: 'open_specialist',
          action_data: { specialist_id: CAL_SPECIALIST_ID },
        },
      ],
    })

    if (insertError) {
      throw new Error(`Failed to store brief: ${insertError.message}`)
    }

    // 10. Dispatch notifications for the brief
    const briefInsight: AgentInsight = {
      id: insightId as string,
      foundry_id: foundryId,
      specialist_id: CAL_SPECIALIST_ID,
      insight_type: 'report',
      urgency: 'important',
      title: briefData.title || 'Weekly Executive Brief',
      body: briefBody.slice(0, 10000),
      domain_data: { synthesis_type: 'weekly_executive_brief' },
      suggested_actions: [
        { label: 'Review Full Brief', action_type: 'view_page', action_data: { page: '/today' } },
      ],
      is_read: false,
      is_dismissed: false,
      acted_on: false,
      acted_on_at: null,
      created_at: new Date().toISOString(),
      expires_at: null,
    }

    await dispatchInsightNotifications(foundryId, [briefInsight]).catch(err => {
      console.error('[SweepSynthesis] Notification dispatch failed:', err)
    })

    // 11. Log the synthesis sweep
    const durationMs = Date.now() - startTime
    await supabase.rpc('log_agent_sweep', {
      p_foundry_id: foundryId,
      p_specialist_id: CAL_SPECIALIST_ID,
      p_status: 'completed',
      p_tokens_in: tokensIn,
      p_tokens_out: tokensOut,
      p_estimated_cost_usd: costUsd,
      p_duration_ms: durationMs,
      p_insights_generated: 1,
    })

    console.info(
      `[SweepSynthesis] Brief generated for foundry ${foundryId}: ` +
      `${weekInsights.length} insights synthesized, ${tokensIn + tokensOut} tokens, $${costUsd.toFixed(4)}`
    )

    return {
      foundryId,
      status: 'completed',
      briefInsightId: insightId as string,
      tokensIn,
      tokensOut,
      estimatedCostUsd: costUsd,
      durationMs,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    console.error(`[SweepSynthesis] Synthesis failed for foundry ${foundryId}:`, errorMessage)

    // Log the failed synthesis
    await supabase.rpc('log_agent_sweep', {
      p_foundry_id: foundryId,
      p_specialist_id: CAL_SPECIALIST_ID,
      p_status: 'failed',
      p_tokens_in: 0,
      p_tokens_out: 0,
      p_estimated_cost_usd: 0,
      p_duration_ms: durationMs,
      p_insights_generated: 0,
      p_error_message: errorMessage,
    })

    return {
      foundryId,
      status: 'failed',
      briefInsightId: null,
      tokensIn: 0,
      tokensOut: 0,
      estimatedCostUsd: 0,
      durationMs,
      error: errorMessage,
    }
  }
}

// ─── Decision Support Package ───────────────────────────────────────

/**
 * Generates a multi-specialist decision support package for a critical insight.
 *
 * @description When a critical insight is detected (e.g., a strategic
 * misalignment or financial concern), this function collects perspectives
 * from relevant specialists and produces a coordinated analysis.
 *
 * @param foundryId - The foundry context
 * @param triggerInsight - The critical insight that triggered this
 * @param specialistIds - Which specialists should contribute
 * @returns The synthesized decision support insight ID, or null if failed
 */
export async function generateDecisionSupportPackage(
  foundryId: string,
  triggerInsight: { title: string; body: string; specialist_id: string },
  specialistIds: string[],
): Promise<string | null> {
  const supabase = createAdminClient()

  try {
    // Build company context
    const companyContext = await buildAIContextWithServiceClient(foundryId)

    // Build the multi-specialist prompt
    const contributingSpecialists = specialistIds
      .map(id => SPECIALISTS.find(s => s.id === id))
      .filter(Boolean)

    if (contributingSpecialists.length === 0) return null

    const specialistPerspectives = contributingSpecialists.map(s => {
      return `### ${s!.name} (${s!.title})\nAnalyze this situation from your domain expertise. What risks, opportunities, and recommendations do you see?`
    }).join('\n\n')

    const systemPrompt = [
      'You are a multi-specialist advisory team providing a coordinated analysis.',
      'A critical finding has been identified that requires multiple perspectives.',
      '',
      companyContext,
    ].join('\n')

    const userPrompt = [
      `CRITICAL FINDING (from ${triggerInsight.specialist_id}):`,
      `Title: ${triggerInsight.title}`,
      `Details: ${triggerInsight.body}`,
      '',
      'Provide coordinated analysis from the following specialist perspectives:',
      specialistPerspectives,
      '',
      'Respond with ONLY valid JSON:',
      '```json',
      '{',
      '  "title": "Decision Support: [concise title]",',
      '  "executive_summary": "2-3 sentence synthesis of all perspectives",',
      '  "perspectives": [',
      '    { "specialist": "Name", "analysis": "Their analysis", "recommendation": "Their recommendation" }',
      '  ],',
      '  "consensus_actions": ["Action 1", "Action 2"],',
      '  "dissenting_views": ["Any disagreements between specialists"]',
      '}',
      '```',
    ].join('\n')

    const apiKey = process.env.MINIMAX_API_KEY
    if (!apiKey) return null

    const OpenAI = await getOpenAIClient()
    const client = new OpenAI({ apiKey, baseURL: 'https://api.minimax.io/v1' })

    const completion = await client.chat.completions.create({
      model: SYNTHESIS_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: SYNTHESIS_MAX_TOKENS,
      temperature: 0.3,
    })

    const responseText = completion.choices[0]?.message?.content ?? ''
    const tokensIn = completion.usage?.prompt_tokens ?? 0
    const tokensOut = completion.usage?.completion_tokens ?? 0

    // Parse response
    let parsed: {
      title: string
      executive_summary: string
      perspectives: Array<{ specialist: string; analysis: string; recommendation: string }>
      consensus_actions: string[]
      dissenting_views: string[]
    }

    try {
      const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || [null, responseText]
      parsed = JSON.parse(jsonMatch[1]?.trim() ?? responseText.trim())
    } catch {
      return null
    }

    // Build rich body
    const bodyParts = [
      parsed.executive_summary,
      '',
      ...parsed.perspectives.map(p =>
        `**${p.specialist}:** ${p.analysis}\n*Recommendation:* ${p.recommendation}`
      ),
      '',
      '**Consensus Actions:**',
      ...parsed.consensus_actions.map(a => `- ${a}`),
    ]

    if (parsed.dissenting_views && parsed.dissenting_views.length > 0) {
      bodyParts.push('', '**Dissenting Views:**', ...parsed.dissenting_views.map(v => `- ${v}`))
    }

    // Store as insight
    const { data: insightId, error: insertError } = await supabase.rpc('insert_agent_insight', {
      p_foundry_id: foundryId,
      p_specialist_id: CAL_SPECIALIST_ID,
      p_insight_type: 'report',
      p_urgency: 'critical',
      p_title: parsed.title || 'Decision Support Package',
      p_body: bodyParts.join('\n').slice(0, 10000),
      p_domain_data: {
        synthesis_type: 'decision_support',
        trigger_insight_title: triggerInsight.title,
        contributing_specialists: specialistIds,
        consensus_actions: parsed.consensus_actions,
      },
      p_suggested_actions: [
        { label: 'Discuss with Cal', action_type: 'open_specialist', action_data: { specialist_id: CAL_SPECIALIST_ID } },
        ...contributingSpecialists.slice(0, 2).map(s => ({
          label: `Ask ${s!.name}`,
          action_type: 'open_specialist',
          action_data: { specialist_id: s!.id },
        })),
      ],
    })

    if (insertError) {
      console.error('[SweepSynthesis] Failed to store decision support:', insertError.message)
      return null
    }

    // Log the synthesis
    await supabase.rpc('log_agent_sweep', {
      p_foundry_id: foundryId,
      p_specialist_id: CAL_SPECIALIST_ID,
      p_status: 'completed',
      p_tokens_in: tokensIn,
      p_tokens_out: tokensOut,
      p_estimated_cost_usd: estimateAICost(SYNTHESIS_MODEL, tokensIn, tokensOut),
      p_duration_ms: 0,
      p_insights_generated: 1,
    })

    return insightId as string
  } catch (error) {
    console.error('[SweepSynthesis] Decision support failed:', error)
    return null
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Groups insights by specialist and builds summaries for the synthesis prompt.
 */
function buildSpecialistSummaries(
  insights: Array<{ specialist_id: string; insight_type: string; urgency: string; title: string; body: string }>,
): SpecialistInsightSummary[] {
  const bySpecialist = new Map<string, typeof insights>()

  for (const insight of insights) {
    const existing = bySpecialist.get(insight.specialist_id) ?? []
    existing.push(insight)
    bySpecialist.set(insight.specialist_id, existing)
  }

  const summaries: SpecialistInsightSummary[] = []

  for (const [specialistId, specialistInsights] of bySpecialist.entries()) {
    const specialist = SPECIALISTS.find(s => s.id === specialistId)

    summaries.push({
      specialistId,
      specialistName: specialist?.name ?? 'Unknown Specialist',
      specialistTitle: specialist?.title ?? 'Specialist',
      insightCount: specialistInsights.length,
      criticalCount: specialistInsights.filter(i => i.urgency === 'critical').length,
      importantCount: specialistInsights.filter(i => i.urgency === 'important').length,
      topInsights: specialistInsights
        .sort((a, b) => {
          const urgencyOrder = { critical: 0, important: 1, informational: 2 }
          return (urgencyOrder[a.urgency as keyof typeof urgencyOrder] ?? 2) -
                 (urgencyOrder[b.urgency as keyof typeof urgencyOrder] ?? 2)
        })
        .slice(0, MAX_INSIGHTS_PER_SPECIALIST)
        .map(i => ({
          type: i.insight_type,
          urgency: i.urgency,
          title: i.title,
          body: i.body,
        })),
    })
  }

  // Sort: most critical specialists first
  return summaries.sort((a, b) => b.criticalCount - a.criticalCount || b.insightCount - a.insightCount)
}

/**
 * Builds the system prompt for Cal's synthesis.
 */
function buildSynthesisSystemPrompt(personalityPrompt: string, companyContext: string): string {
  return [
    personalityPrompt,
    '',
    '--- WEEKLY EXECUTIVE BRIEF SYNTHESIS MODE ---',
    '',
    'You are Cal, Chief of Staff, producing the weekly executive brief.',
    'Your job is to synthesize insights from ALL specialists into a single,',
    'coherent narrative that gives the founder a complete picture of their business.',
    '',
    'This is NOT a list of individual findings. It IS a unified narrative that:',
    '1. Connects the dots between different specialist domains',
    '2. Identifies themes that span multiple areas',
    '3. Prioritizes the 3-5 things that matter most THIS WEEK',
    '4. Celebrates wins (people need good news too)',
    '5. Flags risks with specific recommended actions',
    '',
    'Write with authority and clarity. Be direct. No hedging.',
    'The founder should be able to read this in 3 minutes and know',
    'exactly what they need to focus on.',
    '',
    companyContext,
  ].join('\n')
}

/**
 * Builds the user prompt with all specialist insight summaries.
 */
function buildSynthesisUserPrompt(
  summaries: SpecialistInsightSummary[],
  totalInsights: number,
): string {
  const specialistBlocks = summaries.map(s => {
    const insightLines = s.topInsights.map(i =>
      `  - [${i.urgency.toUpperCase()}] ${i.title}: ${i.body.slice(0, 200)}`
    ).join('\n')

    return [
      `### ${s.specialistName} (${s.specialistTitle})`,
      `${s.insightCount} insights (${s.criticalCount} critical, ${s.importantCount} important)`,
      insightLines,
    ].join('\n')
  }).join('\n\n')

  return [
    `Produce the weekly executive brief for this week.`,
    `${totalInsights} total insights from ${summaries.length} specialists:`,
    '',
    specialistBlocks,
    '',
    'Respond with ONLY valid JSON:',
    '```json',
    '{',
    '  "title": "Weekly Executive Brief — [Month Day-Day]",',
    '  "executive_summary": "3-4 sentence overview of the week (250 chars max)",',
    '  "sections": [',
    '    { "heading": "Section title", "body": "2-3 paragraph narrative for this theme" }',
    '  ],',
    '  "top_priorities": ["Priority 1 with specific action", "Priority 2"],',
    '  "risks": ["Risk 1 with recommended mitigation", "Risk 2"],',
    '  "wins": ["Win 1 - celebrate it", "Win 2"]',
    '}',
    '```',
  ].join('\n')
}

/**
 * Composes the brief body in Markdown format for rich display.
 */
function composeBriefMarkdown(briefData: {
  executive_summary: string
  sections: Array<{ heading: string; body: string }>
  top_priorities: string[]
  risks: string[]
  wins: string[]
}): string {
  const parts: string[] = []

  // Executive summary
  parts.push(briefData.executive_summary)
  parts.push('')

  // Sections
  for (const section of briefData.sections ?? []) {
    parts.push(`## ${section.heading}`)
    parts.push(section.body)
    parts.push('')
  }

  // Top priorities
  if (briefData.top_priorities?.length > 0) {
    parts.push('## This Week\'s Priorities')
    for (const priority of briefData.top_priorities) {
      parts.push(`1. ${priority}`)
    }
    parts.push('')
  }

  // Risks
  if (briefData.risks?.length > 0) {
    parts.push('## Risks to Watch')
    for (const risk of briefData.risks) {
      parts.push(`- ${risk}`)
    }
    parts.push('')
  }

  // Wins
  if (briefData.wins?.length > 0) {
    parts.push('## Wins This Week')
    for (const win of briefData.wins) {
      parts.push(`- ${win}`)
    }
    parts.push('')
  }

  return parts.join('\n')
}
