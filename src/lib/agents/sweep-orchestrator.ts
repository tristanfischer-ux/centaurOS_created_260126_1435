/**
 * @file sweep-orchestrator.ts
 *
 * @description Orchestrates background specialist sweeps for the Always-On
 * Agent Intelligence system. Determines which foundries need sweeps, which
 * specialists should run, enforces budget guards, and dispatches individual
 * sweeps via the MiniMax M2.5 provider.
 *
 * The orchestrator is invoked by the /api/cron/agent-sweep cron job and
 * processes all active foundries in parallel batches.
 *
 * @security
 * - Uses service role Supabase client (bypasses RLS for cron context)
 * - Budget guard prevents runaway costs per foundry
 * - All sweep results logged to agent_sweep_log for auditability
 *
 * @dependencies
 * - Supabase: agent_insights, agent_sweep_log, foundry_agent_preferences
 * - MiniMax M2.5 via registry streamMiniMax
 * - AI context builder for company context
 *
 * @audit All sweep executions logged to agent_sweep_log table
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getOpenAIClient } from '@/lib/ai/openai-lazy'
import { buildAIContextWithServiceClient, buildSpecialistTaskContext } from './sweep-context'
import { estimateAICost } from '@/lib/ai/usage-tracking'
import { SPECIALISTS } from '@/app/(platform)/agents/specialists-data'
import { compilePersonalityPrompt } from './personality'
import { getBackgroundSweepPrompt } from './sweep-prompts'
import { dispatchInsightNotifications } from './sweep-notifications'
import { generateDecisionSupportPackage } from './sweep-synthesis'
import { runAgenticActions } from './agentic-actions'
import { getLatestBriefingFormatted } from './specialist-briefings'
import { executeToolCall } from '@/lib/agents/tools/registry'
import type { AgentInsight } from '@/actions/agent-insights'

// ─── Types ──────────────────────────────────────────────────────────

/** Configuration for a single specialist sweep */
export interface SweepConfig {
  foundryId: string
  specialistId: string
  sweepIntervalMinutes: number
}

/** Result from a single specialist sweep */
export interface SweepResult {
  foundryId: string
  specialistId: string
  status: 'completed' | 'failed' | 'skipped'
  insightsGenerated: number
  tokensIn: number
  tokensOut: number
  estimatedCostUsd: number
  durationMs: number
  error?: string
}

/** Result from the full orchestration run */
export interface OrchestrationResult {
  foundriesProcessed: number
  sweepsExecuted: number
  sweepsSkipped: number
  sweepsFailed: number
  totalInsights: number
  totalCostUsd: number
  durationMs: number
  results: SweepResult[]
}

/** Foundry preferences row from the database */
interface FoundryPreferences {
  foundry_id: string
  sweeps_enabled: boolean
  sweep_interval_minutes: number
  specialist_overrides: Record<string, { enabled?: boolean; interval_minutes?: number }>
  monthly_budget_usd: number
  notify_critical_telegram: boolean
  notify_critical_in_app: boolean
}

// ─── Constants ──────────────────────────────────────────────────────

/** Default sweep interval if no preferences are set (2 hours) */
const DEFAULT_SWEEP_INTERVAL_MINUTES = 120

/**
 * Per-specialist default intervals (minutes).
 *
 * DECISION: Different specialists need different cadences. Strategy and finance
 * change frequently and benefit from hourly sweeps. Support roles like legal
 * and fundraising are more stable and can sweep every 8 hours.
 */
const DEFAULT_SPECIALIST_INTERVALS: Record<string, number> = {
  // High-frequency: strategy and finance change often
  strategist: 60,
  'finance-lead': 60,
  // Medium-frequency: technical and operational leaders
  cto: 120,
  'chief-of-staff': 120,
  'product-lead': 120,
  'vp-engineering': 120,
  // Lower-frequency: growth, sales, HR, manufacturing, supply chain
  'growth-marketer': 240,
  'sales-lead': 240,
  'hiring-team': 240,
  'vp-manufacturing': 240,
  'vp-supply-chain': 240,
  // Infrequent: advisory roles
  'fundraising-advisor': 480,
  'legal-counsel': 480,
}

/** Maximum concurrent sweep executions per cron invocation */
const MAX_CONCURRENT_SWEEPS = 10

/** Default monthly budget per foundry (USD) */
const DEFAULT_MONTHLY_BUDGET_USD = 50.00

/** Model used for all background sweeps */
const SWEEP_MODEL = 'MiniMax-M2.7'

/** Maximum tokens for sweep output */
const SWEEP_MAX_TOKENS = 4096

// ─── Sweep Data Tool Mapping ────────────────────────────────────────

/**
 * Maps specialist IDs to their primary data tool for one-shot data injection
 * during background sweeps. This is cheaper than a full tool-calling loop —
 * each specialist gets a single proactive data fetch to ground their analysis
 * in real company data.
 *
 * Specialists not in this map fall back to `query_objectives`.
 */
const SWEEP_DATA_TOOLS: Record<string, string> = {
  'finance-lead': 'query_financial_overview',
  'vp-engineering': 'query_engineering_metrics',
  'product-lead': 'query_product_roadmap',
  'hiring-team': 'query_team_overview',
  strategist: 'query_strategic_goals',
  'chief-of-staff': 'query_activity_metrics',
  cto: 'query_engineering_metrics',
  'fundraising-advisor': 'query_financial_overview',
  'sales-lead': 'query_financial_overview',
  'vp-manufacturing': 'query_activity_metrics',
  'vp-supply-chain': 'query_activity_metrics',
  'growth-marketer': 'query_growth_metrics',
  'legal-counsel': 'query_compliance_status',
}

/**
 * Fetches current company data for a specialist's background sweep.
 *
 * @description Executes the specialist's primary data tool to inject real-time
 * company data into the sweep prompt. This is a one-shot fetch (not a tool loop)
 * to keep sweep costs low. If the tool call fails, returns empty string so the
 * sweep proceeds without data (non-breaking).
 *
 * @param specialistId - The specialist running the sweep
 * @param foundryId - The foundry to query data for
 * @returns Formatted "Current Company Data" section, or empty string on failure
 */
async function fetchSweepDataForSpecialist(
  specialistId: string,
  foundryId: string,
): Promise<string> {
  try {
    const primaryTool = SWEEP_DATA_TOOLS[specialistId] ?? 'query_objectives'
    const result = await executeToolCall(primaryTool, {}, { foundryId })

    // Skip if the tool returned an error or empty result
    if (!result || result.startsWith('Error') || result.startsWith('No ') || result.startsWith('Unknown tool')) {
      return ''
    }

    return `\n\n## Current Company Data\nThe following live data was fetched for your analysis. Use it to ground your insights in real metrics rather than assumptions.\n\n${result}`
  } catch (err) {
    // INTENT: Non-breaking — if data fetch fails, sweep proceeds without it
    console.warn(`[SweepOrchestrator] Data tool fetch failed for ${specialistId}:`, err)
    return ''
  }
}

// ─── Orchestrator ───────────────────────────────────────────────────

/**
 * Runs the full sweep orchestration across all active foundries.
 *
 * @description Loads all foundries with sweep preferences, determines
 * which specialists are due to run, checks budget guards, and dispatches
 * sweeps in parallel batches.
 *
 * @returns Aggregated results from all sweep executions
 * @audit Logs all sweep executions to agent_sweep_log
 */
export async function runSweepOrchestration(): Promise<OrchestrationResult> {
  const startTime = Date.now()
  const results: SweepResult[] = []

  const supabase = createAdminClient()

  // 1. Load all foundries that have active subscriptions / data
  // SECURITY: Using service client — no RLS filtering
  const { data: foundries, error: foundryError } = await supabase
    .from('foundries')
    .select('id')
    .order('created_at', { ascending: false })

  if (foundryError || !foundries) {
    console.error('[SweepOrchestrator] Failed to load foundries:', foundryError?.message)
    return {
      foundriesProcessed: 0,
      sweepsExecuted: 0,
      sweepsSkipped: 0,
      sweepsFailed: 0,
      totalInsights: 0,
      totalCostUsd: 0,
      durationMs: Date.now() - startTime,
      results: [],
    }
  }

  // 2. Load preferences for all foundries (or use defaults)
  const { data: allPreferences } = await supabase
    .from('foundry_agent_preferences')
    .select('*')

  const preferencesMap = new Map<string, FoundryPreferences>()
  if (allPreferences) {
    for (const pref of allPreferences) {
      preferencesMap.set(pref.foundry_id, pref as FoundryPreferences)
    }
  }

  // 3. Load recent sweep logs to determine which specialists are due
  const cutoffTime = new Date(Date.now() - 30 * 60 * 1000).toISOString() // Last 30 min minimum
  const { data: recentSweeps } = await supabase
    .from('agent_sweep_log')
    .select('foundry_id, specialist_id, started_at')
    .gte('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('started_at', { ascending: false })

  // Build lookup: foundryId:specialistId -> last sweep time
  const lastSweepMap = new Map<string, Date>()
  if (recentSweeps) {
    for (const sweep of recentSweeps) {
      const key = `${sweep.foundry_id}:${sweep.specialist_id}`
      if (!lastSweepMap.has(key)) {
        lastSweepMap.set(key, new Date(sweep.started_at))
      }
    }
  }

  // 4. Load current month's sweep costs per foundry for budget guard
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const { data: monthlyCosts } = await supabase
    .from('agent_sweep_log')
    .select('foundry_id, estimated_cost_usd')
    .gte('started_at', monthStart.toISOString())
    .eq('status', 'completed')

  const monthlySpendMap = new Map<string, number>()
  if (monthlyCosts) {
    for (const row of monthlyCosts) {
      const current = monthlySpendMap.get(row.foundry_id) ?? 0
      monthlySpendMap.set(row.foundry_id, current + Number(row.estimated_cost_usd))
    }
  }

  // 5. Build sweep queue
  const sweepQueue: SweepConfig[] = []
  const specialistIds = SPECIALISTS.map(s => s.id)

  for (const foundry of foundries) {
    const prefs = preferencesMap.get(foundry.id)
    const sweepsEnabled = prefs?.sweeps_enabled ?? true
    if (!sweepsEnabled) continue

    const budget = prefs?.monthly_budget_usd ?? DEFAULT_MONTHLY_BUDGET_USD
    const currentSpend = monthlySpendMap.get(foundry.id) ?? 0
    if (currentSpend >= budget) {
      console.info(`[SweepOrchestrator] Budget reached for foundry ${foundry.id}: $${currentSpend.toFixed(2)} / $${budget.toFixed(2)}`)
      continue
    }

    const defaultInterval = prefs?.sweep_interval_minutes ?? DEFAULT_SWEEP_INTERVAL_MINUTES
    const overrides = prefs?.specialist_overrides ?? {}

    for (const specialistId of specialistIds) {
      const override = overrides[specialistId]
      if (override?.enabled === false) continue

      const interval = override?.interval_minutes ?? DEFAULT_SPECIALIST_INTERVALS[specialistId] ?? defaultInterval
      const lastSweep = lastSweepMap.get(`${foundry.id}:${specialistId}`)
      const minutesSinceLastSweep = lastSweep
        ? (Date.now() - lastSweep.getTime()) / 60_000
        : Infinity

      if (minutesSinceLastSweep >= interval) {
        sweepQueue.push({
          foundryId: foundry.id,
          specialistId,
          sweepIntervalMinutes: interval,
        })
      }
    }
  }

  console.info(`[SweepOrchestrator] ${sweepQueue.length} sweeps queued across ${foundries.length} foundries`)

  // 6. Execute sweeps in parallel batches
  for (let i = 0; i < sweepQueue.length; i += MAX_CONCURRENT_SWEEPS) {
    const batch = sweepQueue.slice(i, i + MAX_CONCURRENT_SWEEPS)
    const batchResults = await Promise.allSettled(
      batch.map(config => executeSingleSweep(config))
    )

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        console.error('[SweepOrchestrator] Sweep promise rejected:', result.reason)
      }
    }
  }

  // 7. Run agentic actions for foundries that had sweeps
  const sweepedFoundries = new Set(results.filter(r => r.status === 'completed').map(r => r.foundryId))
  for (const foundryId of sweepedFoundries) {
    runAgenticActions(foundryId).catch(err => {
      console.error(`[SweepOrchestrator] Agentic actions failed for ${foundryId}:`, err)
    })
  }

  // 8. Aggregate results
  const aggregated: OrchestrationResult = {
    foundriesProcessed: new Set(results.map(r => r.foundryId)).size,
    sweepsExecuted: results.filter(r => r.status === 'completed').length,
    sweepsSkipped: results.filter(r => r.status === 'skipped').length,
    sweepsFailed: results.filter(r => r.status === 'failed').length,
    totalInsights: results.reduce((sum, r) => sum + r.insightsGenerated, 0),
    totalCostUsd: results.reduce((sum, r) => sum + r.estimatedCostUsd, 0),
    durationMs: Date.now() - startTime,
    results,
  }

  console.info(
    `[SweepOrchestrator] Complete: ${aggregated.sweepsExecuted} executed, ` +
    `${aggregated.totalInsights} insights, $${aggregated.totalCostUsd.toFixed(4)} cost, ` +
    `${aggregated.durationMs}ms`
  )

  return aggregated
}

// ─── Single Sweep Execution ─────────────────────────────────────────

/**
 * Executes a single specialist sweep against a single foundry.
 *
 * @description Loads company context, builds the sweep prompt, calls
 * MiniMax M2.5, parses structured JSON insights from the response,
 * and stores them in agent_insights.
 *
 * @param config - Sweep configuration (foundry, specialist, interval)
 * @returns Sweep result with metrics and insight counts
 */
export async function executeSingleSweep(config: SweepConfig): Promise<SweepResult> {
  const startTime = Date.now()
  const supabase = createAdminClient()

  const specialist = SPECIALISTS.find(s => s.id === config.specialistId)
  if (!specialist) {
    return {
      ...config,
      status: 'skipped',
      insightsGenerated: 0,
      tokensIn: 0,
      tokensOut: 0,
      estimatedCostUsd: 0,
      durationMs: 0,
      error: `Unknown specialist: ${config.specialistId}`,
    }
  }

  try {
    // 1. Build company context (using service client)
    const companyContext = await buildAIContextWithServiceClient(config.foundryId)

    // 1b. Latest news briefing for this specialist (current events context)
    const briefingBlock = await getLatestBriefingFormatted(supabase, config.specialistId)

    // 1c. Specialist task portfolio (for execution loop follow-ups)
    let taskPortfolio = ''
    try {
      taskPortfolio = await buildSpecialistTaskContext(config.foundryId, config.specialistId)
    } catch (err) {
      console.warn(`[SweepOrchestrator] Failed to build task context for ${config.specialistId}:`, err)
    }

    // 1d. Cross-specialist recommendations for disagreement detection
    let crossSpecialistBlock = ''
    try {
      const relationships = specialist.personality.relationships ?? {}
      const tensionIds = Object.entries(relationships)
        .filter(([, rel]) => rel?.dynamic === 'creative-tension' || rel?.dynamic === 'challenging')
        .map(([id]) => id)

      if (tensionIds.length > 0) {
        const { data: recentRecs } = await supabase
          .from('agent_insights')
          .select('specialist_id, title, body')
          .eq('foundry_id', config.foundryId)
          .in('specialist_id', tensionIds)
          .eq('insight_type', 'recommendation')
          .eq('is_dismissed', false)
          .gt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(5)

        if (recentRecs?.length) {
          const lines = recentRecs.map(r => {
            const spec = SPECIALISTS.find(s => s.id === r.specialist_id)
            return `- ${spec?.name ?? r.specialist_id}: "${r.title}" — ${r.body.slice(0, 150)}`
          })
          crossSpecialistBlock = `\n\n## Cross-Specialist Awareness\nRecent recommendations from colleagues you have creative tension with:\n${lines.join('\n')}\n\nIf you DISAGREE with any of these recommendations based on your domain expertise, create an insight flagging the disagreement. Use insight type "recommendation" with title format: "Pushback: [topic] — I see it differently than [specialist name]". Explain your reasoning in the body. This healthy disagreement helps the founder make better decisions.`
        }
      }
    } catch (err) {
      console.warn(`[SweepOrchestrator] Failed to build cross-specialist context:`, err)
    }

    // 1e. Fetch live data via specialist's primary tool (one-shot, non-breaking)
    const liveDataBlock = await fetchSweepDataForSpecialist(config.specialistId, config.foundryId)

    const contextWithBriefing = [
      companyContext,
      briefingBlock ? '\n\n' + briefingBlock : '',
      taskPortfolio ? '\n\n' + taskPortfolio : '',
      crossSpecialistBlock,
      liveDataBlock,
    ].join('')

    // 2. Build the sweep prompt
    const personalityPrompt = compilePersonalityPrompt(
      specialist.name,
      specialist.personality,
      undefined,
      config.specialistId,
    )
    const sweepPrompt = getBackgroundSweepPrompt(config.specialistId)

    const systemPrompt = [
      personalityPrompt,
      '\n\n--- BACKGROUND SWEEP MODE ---',
      'You are running in background analysis mode. Do NOT have a conversation.',
      'Analyze the business context below and produce structured JSON insights.',
      'Only surface findings that are genuinely actionable or noteworthy.',
      'If nothing significant is found, return an empty insights array.',
      '\n' + sweepPrompt,
      contextWithBriefing,
    ].join('\n')

    const userPrompt = [
      `Run your background sweep for ${specialist.name} (${specialist.title}).`,
      'Analyze the current business context and produce insights.',
      'Respond with ONLY valid JSON matching this schema:',
      '```json',
      '{',
      '  "insights": [',
      '    {',
      '      "type": "alert" | "recommendation" | "observation" | "reminder" | "report",',
      '      "urgency": "critical" | "important" | "informational",',
      '      "title": "Short, actionable title (max 100 chars)",',
      '      "body": "Detailed explanation with specific recommendations (max 500 chars)",',
      '      "domain_data": { ... any relevant metrics or data points },',
      '      "suggested_actions": [',
      '        { "label": "Action button text", "action_type": "open_specialist" | "create_task" | "view_page", "action_data": {} }',
      '      ]',
      '    }',
      '  ]',
      '}',
      '```',
    ].join('\n')

    // 3. Call MiniMax M2.5 (non-streaming for background work)
    const apiKey = process.env.MINIMAX_API_KEY?.trim()
    if (!apiKey) {
      throw new Error('MINIMAX_API_KEY not configured')
    }

    const OpenAI = await getOpenAIClient()
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.minimax.io/v1',
    })

    const completion = await client.chat.completions.create({
      model: SWEEP_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: SWEEP_MAX_TOKENS,
      temperature: 0.3, // Low temperature for consistent analytical output
    })

    const responseText = completion.choices[0]?.message?.content ?? ''
    const tokensIn = completion.usage?.prompt_tokens ?? 0
    const tokensOut = completion.usage?.completion_tokens ?? 0
    const costUsd = estimateAICost(SWEEP_MODEL, tokensIn, tokensOut)
    const durationMs = Date.now() - startTime

    // 4. Parse structured insights from response
    let insights: Array<{
      type: string
      urgency: string
      title: string
      body: string
      domain_data?: Record<string, unknown>
      suggested_actions?: Array<{ label: string; action_type: string; action_data?: Record<string, unknown> }>
    }> = []

    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || [null, responseText]
      const jsonStr = jsonMatch[1]?.trim() ?? responseText.trim()
      const parsed = JSON.parse(jsonStr)
      insights = Array.isArray(parsed.insights) ? parsed.insights : []
    } catch (parseError) {
      console.warn(`[SweepOrchestrator] Failed to parse response for ${config.specialistId}@${config.foundryId}:`, parseError)
      // Non-fatal: log the sweep but with zero insights
    }

    // 5. Filter valid insights and store them (parallel inserts)
    const validTypes = ['alert', 'recommendation', 'observation', 'reminder', 'report']
    const validUrgencies = ['critical', 'important', 'informational']
    const validInsights = insights.filter(
      i =>
        validTypes.includes(i.type) &&
        validUrgencies.includes(i.urgency) &&
        i.title?.trim() &&
        i.body?.trim()
    )

    const insertResults = await Promise.allSettled(
      validInsights.map(insight =>
        supabase.rpc('insert_agent_insight', {
          p_foundry_id: config.foundryId,
          p_specialist_id: config.specialistId,
          p_insight_type: insight.type,
          p_urgency: insight.urgency,
          p_title: insight.title.slice(0, 200),
          p_body: insight.body.slice(0, 2000),
          p_domain_data: insight.domain_data ?? {},
          p_suggested_actions: insight.suggested_actions ?? [],
        })
      )
    )

    const storedInsights: AgentInsight[] = []
    let insightsStored = 0
    for (let i = 0; i < insertResults.length; i++) {
      const result = insertResults[i]
      const insight = validInsights[i]
      if (result.status === 'rejected') {
        console.error(`[SweepOrchestrator] Failed to insert insight:`, result.reason)
        continue
      }
      const { data: insightId, error: insertError } = result.value
      if (insertError) {
        console.error(`[SweepOrchestrator] Failed to insert insight:`, insertError.message)
        continue
      }
      insightsStored++
      storedInsights.push({
        id: insightId as string,
        foundry_id: config.foundryId,
        specialist_id: config.specialistId,
        insight_type: insight.type as AgentInsight['insight_type'],
        urgency: insight.urgency as AgentInsight['urgency'],
        title: insight.title.slice(0, 200),
        body: insight.body.slice(0, 2000),
        domain_data: insight.domain_data ?? {},
        suggested_actions: (insight.suggested_actions ?? []) as AgentInsight['suggested_actions'],
        is_read: false,
        is_dismissed: false,
        acted_on: false,
        acted_on_at: null,
        created_at: new Date().toISOString(),
        expires_at: null,
      })
    }

    // 6. Dispatch notifications for critical/important insights
    const notifiableInsights = storedInsights.filter(
      i => i.urgency === 'critical' || i.urgency === 'important'
    )
    if (notifiableInsights.length > 0) {
      await dispatchInsightNotifications(config.foundryId, notifiableInsights).catch(err => {
        console.error('[SweepOrchestrator] Notification dispatch failed:', err)
      })
    }

    // 6b. Track nudges: update last_nudge_at/nudge_count for tasks referenced in follow-up insights
    const followUpInsights = storedInsights.filter(i =>
      i.insight_type === 'reminder' && i.title.startsWith('Follow-up:')
    )
    if (followUpInsights.length > 0) {
      for (const insight of followUpInsights) {
        // Extract task title from "Follow-up: [task title]"
        const taskTitle = insight.title.replace(/^Follow-up:\s*/, '').trim()
        if (!taskTitle) continue

        try {
          // Find the task, then increment nudge_count
          const { data: matchedTasks } = await supabase
            .from('tasks')
            .select('id, nudge_count')
            .eq('foundry_id', config.foundryId)
            .ilike('title', `%${taskTitle.slice(0, 80)}%`)
            .is('deleted_at', null)
            .limit(1)

          if (matchedTasks?.[0]) {
            await supabase
              .from('tasks')
              .update({
                last_nudge_at: new Date().toISOString(),
                nudge_count: (matchedTasks[0].nudge_count ?? 0) + 1,
              })
              .eq('id', matchedTasks[0].id)
          }
        } catch (nudgeErr) {
          console.warn(`[SweepOrchestrator] Failed to update nudge for "${taskTitle}":`, nudgeErr)
        }
      }
    }

    // 6c. Trigger decision support packages for critical insights
    const criticalInsights = storedInsights.filter(i => i.urgency === 'critical')
    if (criticalInsights.length > 0) {
      // Map specialist domains to relevant cross-functional specialists
      const DECISION_SUPPORT_MAP: Partial<Record<string, string[]>> = {
        'chief-of-staff': ['strategist', 'finance-lead'],
        'finance-lead': ['chief-of-staff', 'strategist'],
        strategist: ['chief-of-staff', 'finance-lead', 'product-lead'],
        'product-lead': ['strategist', 'growth-marketer'],
        'growth-marketer': ['product-lead', 'sales-lead'],
        'sales-lead': ['finance-lead', 'growth-marketer'],
        'fundraising-advisor': ['finance-lead', 'strategist'],
        'hiring-team': ['chief-of-staff', 'vp-manufacturing'],
        'vp-manufacturing': ['chief-of-staff', 'product-lead'],
        'legal-counsel': ['chief-of-staff', 'finance-lead'],
      }

      for (const insight of criticalInsights) {
        const relatedSpecialists = DECISION_SUPPORT_MAP[config.specialistId] ?? ['chief-of-staff', 'strategist']
        generateDecisionSupportPackage(
          config.foundryId,
          { title: insight.title, body: insight.body, specialist_id: config.specialistId },
          relatedSpecialists,
        ).catch(err => {
          console.error('[SweepOrchestrator] Decision support package failed:', err)
        })
      }
    }

    // 6d. Generate proactive conversation openers for critical/important insights
    if (notifiableInsights.length > 0) {
      generateProactiveOpeners(
        client, specialist, notifiableInsights.slice(0, 2), supabase,
      ).catch(err => {
        console.error('[SweepOrchestrator] Proactive opener generation failed:', err)
      })
    }

    // 7. Log the sweep
    await supabase.rpc('log_agent_sweep', {
      p_foundry_id: config.foundryId,
      p_specialist_id: config.specialistId,
      p_status: 'completed',
      p_tokens_in: tokensIn,
      p_tokens_out: tokensOut,
      p_estimated_cost_usd: costUsd,
      p_duration_ms: durationMs,
      p_insights_generated: insightsStored,
    })

    return {
      foundryId: config.foundryId,
      specialistId: config.specialistId,
      status: 'completed',
      insightsGenerated: insightsStored,
      tokensIn,
      tokensOut,
      estimatedCostUsd: costUsd,
      durationMs,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    console.error(`[SweepOrchestrator] Sweep failed for ${config.specialistId}@${config.foundryId}:`, errorMessage)

    // Log the failed sweep
    await supabase.rpc('log_agent_sweep', {
      p_foundry_id: config.foundryId,
      p_specialist_id: config.specialistId,
      p_status: 'failed',
      p_tokens_in: 0,
      p_tokens_out: 0,
      p_estimated_cost_usd: 0,
      p_duration_ms: durationMs,
      p_insights_generated: 0,
      p_error_message: errorMessage,
    })

    return {
      foundryId: config.foundryId,
      specialistId: config.specialistId,
      status: 'failed',
      insightsGenerated: 0,
      tokensIn: 0,
      tokensOut: 0,
      estimatedCostUsd: 0,
      durationMs,
      error: errorMessage,
    }
  }
}

// ─── Proactive Conversation Openers ─────────────────────────────────

/**
 * Generates proactive conversation openers for critical/important insights.
 *
 * @description After a sweep discovers something noteworthy, generates a 2-3
 * sentence opener in the specialist's voice — stored in `domain_data.proactive_opener`.
 * When the founder next opens this specialist, the opener appears as if the
 * specialist initiated the conversation.
 *
 * Uses the same MiniMax M2.5 model as sweeps (cheap, fast) with a focused prompt.
 * Limited to 2 openers per sweep per specialist to control cost.
 *
 * @param client - OpenAI-compatible client configured for MiniMax
 * @param specialist - The specialist who generated the insight
 * @param insights - The critical/important insights to generate openers for (max 2)
 * @param supabase - Admin Supabase client for updating insights
 */
async function generateProactiveOpeners(
  client: InstanceType<Awaited<ReturnType<typeof getOpenAIClient>>>,
  specialist: (typeof SPECIALISTS)[number],
  insights: AgentInsight[],
  supabase: ReturnType<typeof createAdminClient>,
): Promise<void> {
  for (const insight of insights.slice(0, 2)) {
    try {
      const completion = await client.chat.completions.create({
        model: SWEEP_MODEL,
        messages: [
          {
            role: 'system',
            content: [
              `You are ${specialist.name}, ${specialist.title}.`,
              specialist.personality.backstory ? `Background: ${specialist.personality.backstory}` : '',
              specialist.personality.voice?.tone ? `Your tone: ${specialist.personality.voice.tone}` : '',
              '',
              'Write a proactive 2-3 sentence message to the founder about a discovery you made.',
              'Sound like YOU — not a notification system. Be specific about the finding.',
              'End with a suggestion or question that makes them want to discuss it with you.',
              'If the urgency is critical, convey appropriate urgency without being alarmist.',
            ].filter(Boolean).join('\n'),
          },
          {
            role: 'user',
            content: [
              `You just discovered something ${insight.urgency} during your background analysis:`,
              `Title: ${insight.title}`,
              `Details: ${insight.body}`,
              '',
              'Write your proactive conversation opener (2-3 sentences, in your voice):',
            ].join('\n'),
          },
        ],
        max_tokens: 200,
        temperature: 0.7,
      })

      const opener = completion.choices[0]?.message?.content?.trim()
      if (!opener) continue

      // Store the opener in domain_data on the insight
      const existingDomainData = (insight.domain_data ?? {}) as Record<string, unknown>
      await supabase
        .from('agent_insights')
        .update({
          domain_data: {
            ...existingDomainData,
            proactive_opener: opener,
          },
        })
        .eq('id', insight.id)

      console.info(
        `[SweepOrchestrator] Generated proactive opener for ${specialist.name}: "${opener.slice(0, 80)}..."`
      )
    } catch (err) {
      console.warn(`[SweepOrchestrator] Failed to generate opener for insight ${insight.id}:`, err)
    }
  }
}
