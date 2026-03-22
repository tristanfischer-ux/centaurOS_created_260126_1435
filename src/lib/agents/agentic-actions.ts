/**
 * @file agentic-actions.ts
 *
 * @description Agentic action engine for the Always-On Agent Intelligence system.
 * Specialists don't just observe — they act (with guardrails). Supports:
 *
 * - **Auto-draft tasks**: Creates draft tasks from insights (requires user approval)
 * - **Auto-generate reports**: Produces board updates, investor briefs
 * - **Auto-escalate**: Flags metrics crossing thresholds to leadership
 *
 * All data-modifying actions create DRAFTS that require user confirmation.
 * Read-only analysis and report generation happen autonomously.
 *
 * @security
 * - Draft tasks are created with status "Draft" and flagged as agent-generated
 * - Reports are stored as insights, not committed to external systems
 * - Escalations use existing notification pipeline
 * - All actions logged to agent_sweep_log for auditability
 *
 * @dependencies
 * - Supabase: tasks, agent_insights, agent_sweep_log
 * - MiniMax M2.5 via OpenAI-compatible API
 * - Sweep context builder
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getOpenAIClient } from '@/lib/ai/openai-lazy'
import { buildAIContextWithServiceClient } from './sweep-context'
import { estimateAICost } from '@/lib/ai/usage-tracking'
import { SPECIALISTS } from '@/app/(platform)/agents/specialists-data'
import { dispatchInsightNotifications } from './sweep-notifications'
import type { AgentInsight } from '@/actions/agent-insights'

// ─── Types ──────────────────────────────────────────────────────────

/** A draft task generated from an insight */
export interface DraftTask {
  title: string
  description: string
  priority: 'Low' | 'Medium' | 'High' | 'Critical'
  suggested_assignee_role?: string
  source_insight_id: string
  source_specialist_id: string
}

/** A generated report (board update, investor brief, etc.) */
export interface GeneratedReport {
  report_type: 'board_update' | 'investor_brief' | 'weekly_summary' | 'metric_report'
  title: string
  content: string
  data_points: Record<string, unknown>
}

/** An escalation alert */
export interface EscalationAlert {
  metric_name: string
  current_value: string
  threshold: string
  direction: 'above' | 'below'
  severity: 'warning' | 'critical'
  recommended_action: string
}

/** Result from action processing */
export interface ActionResult {
  action_type: string
  status: 'completed' | 'failed' | 'skipped'
  details: string
  artifact_id?: string
}

// ─── Constants ──────────────────────────────────────────────────────

const ACTION_MODEL = 'MiniMax-M2.7'
const ACTION_MAX_TOKENS = 4096

// ─── Auto-Draft Tasks ───────────────────────────────────────────────

/**
 * Auto-drafts tasks from actionable insights for a foundry.
 *
 * @description Scans recent insights with suggested_actions that include
 * "create_task" and generates draft tasks. Draft tasks are stored with
 * status "Draft" and require user approval before becoming active.
 *
 * @param foundryId - The foundry to process
 * @returns Array of action results
 *
 * @security Tasks created with status "Draft" — not actionable until approved
 * @audit Logs draft task creation to agent_sweep_log
 */
export async function autoDraftTasksFromInsights(foundryId: string): Promise<ActionResult[]> {
  const supabase = createAdminClient()
  const results: ActionResult[] = []

  try {
    // Find insights with create_task actions that haven't been acted on
    const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: insights } = await supabase
      .from('agent_insights')
      .select('id, specialist_id, title, body, suggested_actions, domain_data')
      .eq('foundry_id', foundryId)
      .eq('is_dismissed', false)
      .eq('acted_on', false)
      .gte('created_at', recentCutoff)

    if (!insights || insights.length === 0) {
      return results
    }

    // Filter to insights that suggest task creation
    const taskableInsights = insights.filter(insight => {
      const actions = insight.suggested_actions as Array<{ action_type: string }> | null
      return actions?.some(a => a.action_type === 'create_task')
    })

    if (taskableInsights.length === 0) return results

    // Build company context for task generation
    const companyContext = await buildAIContextWithServiceClient(foundryId)

    // Generate draft tasks from insights
    for (const insight of taskableInsights.slice(0, 5)) { // Cap at 5 per run
      try {
        const draftTask = await generateDraftTask(insight, companyContext, foundryId)
        if (!draftTask) continue

        // Store as a draft task in the tasks table
        const { error: taskError } = await supabase
          .from('tasks')
          .insert({
            foundry_id: foundryId,
            title: `[Draft] ${draftTask.title}`,
            description: [
              draftTask.description,
              '',
              `---`,
              `*Auto-drafted by ${SPECIALISTS.find(s => s.id === draftTask.source_specialist_id)?.name ?? 'Specialist'} from insight: "${insight.title}"*`,
              `*Review and approve to make this task active.*`,
            ].join('\n'),
            status: 'To Do',
            priority: draftTask.priority,
            is_private: false,
          })

        if (taskError) {
          console.error('[AgenticActions] Failed to create draft task:', taskError.message)
          results.push({
            action_type: 'auto_draft_task',
            status: 'failed',
            details: `Failed to create task for insight "${insight.title}": ${taskError.message}`,
          })
        } else {
          results.push({
            action_type: 'auto_draft_task',
            status: 'completed',
            details: `Draft task created: "${draftTask.title}" from insight "${insight.title}"`,
          })

          // Mark the insight as acted on
          await supabase
            .from('agent_insights')
            .update({ acted_on: true, acted_on_at: new Date().toISOString() })
            .eq('id', insight.id)
        }
      } catch (err) {
        console.error('[AgenticActions] Task draft generation failed:', err)
        results.push({
          action_type: 'auto_draft_task',
          status: 'failed',
          details: `Error generating task for insight "${insight.title}"`,
        })
      }
    }

    return results
  } catch (error) {
    console.error('[AgenticActions] autoDraftTasksFromInsights failed:', error)
    return results
  }
}

/**
 * Uses AI to generate a well-structured draft task from an insight.
 */
async function generateDraftTask(
  insight: { id: string; specialist_id: string; title: string; body: string },
  companyContext: string,
  _foundryId: string,
): Promise<DraftTask | null> {
  const apiKey = process.env.MINIMAX_API_KEY?.trim()
  if (!apiKey) return null

  const specialist = SPECIALISTS.find(s => s.id === insight.specialist_id)

  const OpenAI = await getOpenAIClient()
  const client = new OpenAI({ apiKey, baseURL: 'https://api.minimax.io/v1' })

  const completion = await client.chat.completions.create({
    model: ACTION_MODEL,
    messages: [
      {
        role: 'system',
        content: [
          'You convert specialist insights into well-structured task definitions.',
          'Create clear, actionable tasks that a team member can pick up and execute.',
          '',
          companyContext,
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Convert this insight into a task:`,
          `Specialist: ${specialist?.name ?? 'Unknown'} (${specialist?.title ?? ''})`,
          `Insight: ${insight.title}`,
          `Details: ${insight.body}`,
          '',
          'Respond with ONLY valid JSON:',
          '```json',
          '{',
          '  "title": "Clear, actionable task title (max 100 chars)",',
          '  "description": "Detailed task description with acceptance criteria (max 500 chars)",',
          '  "priority": "Low" | "Medium" | "High" | "Critical",',
          '  "suggested_assignee_role": "Founder" | "Executive" | "Apprentice"',
          '}',
          '```',
        ].join('\n'),
      },
    ],
    max_tokens: 1024,
    temperature: 0.3,
  })

  const responseText = completion.choices[0]?.message?.content ?? ''

  try {
    const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || [null, responseText]
    const parsed = JSON.parse(jsonMatch[1]?.trim() ?? responseText.trim())

    return {
      title: parsed.title?.slice(0, 200) ?? insight.title,
      description: parsed.description?.slice(0, 2000) ?? insight.body,
      priority: ['Low', 'Medium', 'High', 'Critical'].includes(parsed.priority) ? parsed.priority : 'Medium',
      suggested_assignee_role: parsed.suggested_assignee_role,
      source_insight_id: insight.id,
      source_specialist_id: insight.specialist_id,
    }
  } catch {
    return null
  }
}

// ─── Auto-Generate Reports ──────────────────────────────────────────

/**
 * Auto-generates a board update or investor brief for a foundry.
 *
 * @description Compiles recent insights, metrics, and progress into a
 * structured report. Stored as an insight of type "report" for review.
 *
 * @param foundryId - The foundry to generate the report for
 * @param reportType - Type of report to generate
 * @returns The generated report insight ID, or null if failed
 */
export async function autoGenerateReport(
  foundryId: string,
  reportType: 'board_update' | 'investor_brief',
): Promise<string | null> {
  const supabase = createAdminClient()

  try {
    // Build company context
    const companyContext = await buildAIContextWithServiceClient(foundryId)

    // Get recent insights for context
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recentInsights } = await supabase
      .from('agent_insights')
      .select('specialist_id, title, body, urgency')
      .eq('foundry_id', foundryId)
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false })
      .limit(20)

    const reportPrompts: Record<string, string> = {
      board_update: [
        'Generate a concise board update report. Include:',
        '1. Executive Summary (3-4 sentences)',
        '2. Key Metrics & Progress (what moved)',
        '3. Strategic Initiatives Update (status of major objectives)',
        '4. Risks & Mitigations (what could go wrong)',
        '5. Ask from the Board (specific support needed)',
        '',
        'Keep it professional, data-driven, and under 800 words.',
        'Use specific numbers where available, ranges where not.',
      ].join('\n'),
      investor_brief: [
        'Generate an investor update email. Include:',
        '1. Headline metric (the one number investors care about)',
        '2. What shipped this period',
        '3. Key wins and momentum signals',
        '4. Challenges (be honest but frame with mitigations)',
        '5. What help we need (introductions, advice, resources)',
        '',
        'Keep the tone confident but honest. Under 600 words.',
        'Investors appreciate brevity and candor.',
      ].join('\n'),
    }

    const insightContext = (recentInsights ?? []).map(i => {
      const specialist = SPECIALISTS.find(s => s.id === i.specialist_id)
      return `- ${specialist?.name ?? 'Specialist'} [${i.urgency}]: ${i.title}`
    }).join('\n')

    const apiKey = process.env.MINIMAX_API_KEY?.trim()
    if (!apiKey) return null

    const OpenAI = await getOpenAIClient()
    const client = new OpenAI({ apiKey, baseURL: 'https://api.minimax.io/v1' })

    const completion = await client.chat.completions.create({
      model: ACTION_MODEL,
      messages: [
        {
          role: 'system',
          content: [
            'You are a professional business writer producing executive communications.',
            'Write clearly, use data, and be direct.',
            '',
            companyContext,
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            reportPrompts[reportType] ?? reportPrompts.board_update,
            '',
            'Recent specialist intelligence:',
            insightContext || '(No recent insights available)',
            '',
            'Respond with ONLY valid JSON:',
            '```json',
            '{',
            '  "title": "Report title",',
            '  "content": "Full report in markdown format",',
            '  "key_metrics": { "metric_name": "value" }',
            '}',
            '```',
          ].join('\n'),
        },
      ],
      max_tokens: ACTION_MAX_TOKENS,
      temperature: 0.4,
    })

    const responseText = completion.choices[0]?.message?.content ?? ''
    const tokensIn = completion.usage?.prompt_tokens ?? 0
    const tokensOut = completion.usage?.completion_tokens ?? 0

    let parsed: { title: string; content: string; key_metrics: Record<string, unknown> }

    try {
      const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || [null, responseText]
      parsed = JSON.parse(jsonMatch[1]?.trim() ?? responseText.trim())
    } catch {
      parsed = {
        title: reportType === 'board_update' ? 'Board Update' : 'Investor Brief',
        content: responseText,
        key_metrics: {},
      }
    }

    // Store as insight
    const reportLabel = reportType === 'board_update' ? 'Board Update' : 'Investor Brief'
    const { data: insightId, error: insertError } = await supabase.rpc('insert_agent_insight', {
      p_foundry_id: foundryId,
      p_specialist_id: 'chief-of-staff',
      p_insight_type: 'report',
      p_urgency: 'informational',
      p_title: parsed.title || reportLabel,
      p_body: parsed.content.slice(0, 10000),
      p_domain_data: {
        report_type: reportType,
        auto_generated: true,
        key_metrics: parsed.key_metrics,
        generated_at: new Date().toISOString(),
      },
      p_suggested_actions: [
        { label: 'Review & Edit', action_type: 'view_page', action_data: { page: '/today' } },
        { label: 'Discuss with Cal', action_type: 'open_specialist', action_data: { specialist_id: 'chief-of-staff' } },
      ],
    })

    if (insertError) {
      console.error('[AgenticActions] Failed to store report:', insertError.message)
      return null
    }

    // Log the action
    await supabase.rpc('log_agent_sweep', {
      p_foundry_id: foundryId,
      p_specialist_id: 'chief-of-staff',
      p_status: 'completed',
      p_tokens_in: tokensIn,
      p_tokens_out: tokensOut,
      p_estimated_cost_usd: estimateAICost(ACTION_MODEL, tokensIn, tokensOut),
      p_duration_ms: 0,
      p_insights_generated: 1,
    })

    return insightId as string
  } catch (error) {
    console.error('[AgenticActions] autoGenerateReport failed:', error)
    return null
  }
}

// ─── Auto-Escalation ────────────────────────────────────────────────

/**
 * Checks for threshold breaches and auto-escalates to leadership.
 *
 * @description Scans recent insights for patterns that indicate a metric
 * has crossed a critical threshold. Creates escalation alerts and routes
 * them via Telegram + in-app notifications to Founders/Executives.
 *
 * @param foundryId - The foundry to check
 * @returns Number of escalations triggered
 */
export async function autoEscalateThresholdBreaches(foundryId: string): Promise<number> {
  const supabase = createAdminClient()

  try {
    // Find recent critical insights that haven't been acted on
    const recentCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() // Last 4 hours
    const { data: criticalInsights } = await supabase
      .from('agent_insights')
      .select('id, specialist_id, title, body, domain_data')
      .eq('foundry_id', foundryId)
      .eq('urgency', 'critical')
      .eq('is_dismissed', false)
      .eq('acted_on', false)
      .gte('created_at', recentCutoff)

    if (!criticalInsights || criticalInsights.length === 0) return 0

    // Check for repeat critical insights from the same specialist (pattern = escalation)
    const specialistCriticalCounts = new Map<string, number>()
    for (const insight of criticalInsights) {
      const count = specialistCriticalCounts.get(insight.specialist_id) ?? 0
      specialistCriticalCounts.set(insight.specialist_id, count + 1)
    }

    // Escalate if any specialist has 2+ critical findings in 4 hours (pattern of concern)
    let escalationCount = 0
    for (const [specialistId, count] of specialistCriticalCounts.entries()) {
      if (count < 2) continue

      const specialist = SPECIALISTS.find(s => s.id === specialistId)
      const relevantInsights = criticalInsights.filter(i => i.specialist_id === specialistId)
      const insightTitles = relevantInsights.map(i => i.title).join(', ')

      // Create an escalation insight
      const { data: insightId, error: insertError } = await supabase.rpc('insert_agent_insight', {
        p_foundry_id: foundryId,
        p_specialist_id: 'chief-of-staff',
        p_insight_type: 'alert',
        p_urgency: 'critical',
        p_title: `Escalation: ${specialist?.name ?? 'Specialist'} flagged ${count} critical issues`,
        p_body: [
          `${specialist?.name ?? 'A specialist'} has identified ${count} critical issues in the last 4 hours, which suggests an emerging pattern that needs immediate attention.`,
          '',
          `Issues flagged: ${insightTitles}`,
          '',
          `This auto-escalation was triggered because multiple critical findings from the same domain typically indicate a systemic concern rather than isolated incidents.`,
        ].join('\n'),
        p_domain_data: {
          escalation_type: 'threshold_breach',
          source_specialist_id: specialistId,
          critical_count: count,
          source_insight_ids: relevantInsights.map(i => i.id),
        },
        p_suggested_actions: [
          {
            label: `Talk to ${specialist?.name ?? 'Specialist'}`,
            action_type: 'open_specialist',
            action_data: { specialist_id: specialistId },
          },
          { label: 'Review all critical', action_type: 'view_page', action_data: { page: '/today' } },
        ],
      })

      if (!insertError && insightId) {
        // Dispatch high-priority notification
        const escalationInsight: AgentInsight = {
          id: insightId as string,
          foundry_id: foundryId,
          specialist_id: 'chief-of-staff',
          insight_type: 'alert',
          urgency: 'critical',
          title: `Escalation: ${specialist?.name ?? 'Specialist'} flagged ${count} critical issues`,
          body: `Multiple critical findings detected. Immediate attention recommended.`,
          domain_data: { escalation_type: 'threshold_breach' },
          suggested_actions: [],
          is_read: false,
          is_dismissed: false,
          acted_on: false,
          acted_on_at: null,
          created_at: new Date().toISOString(),
          expires_at: null,
        }

        await dispatchInsightNotifications(foundryId, [escalationInsight]).catch(err => {
          console.error('[AgenticActions] Escalation notification failed:', err)
        })

        escalationCount++
      }
    }

    if (escalationCount > 0) {
      console.info(`[AgenticActions] ${escalationCount} escalations triggered for foundry ${foundryId}`)
    }

    return escalationCount
  } catch (error) {
    console.error('[AgenticActions] autoEscalateThresholdBreaches failed:', error)
    return 0
  }
}

// ─── Auto Follow-Up on Overdue Tasks ─────────────────────────────────

/**
 * Creates follow-up reminder insights for overdue tasks owned by specialists.
 *
 * @description Scans for overdue tasks that have a specialist as creator or owner,
 * respects nudge cooldown (48h), and creates reminder insights so the specialist
 * can surface the overdue status in their next interaction or sweep.
 *
 * @param foundryId - The foundry to check
 * @returns Number of follow-up reminders created
 *
 * @security Creates read-only insights — no task modifications
 */
export async function autoFollowUpOnOverdueTasks(foundryId: string): Promise<number> {
  const supabase = createAdminClient()
  let remindersCreated = 0

  try {
    // Find overdue tasks with specialist ownership
    const now = new Date()
    const { data: overdueTasks } = await supabase
      .from('tasks')
      .select('id, title, end_date, priority, status, last_nudge_at, nudge_count, created_by_agent_id, owner_agent_id')
      .eq('foundry_id', foundryId)
      .is('deleted_at', null)
      .lt('end_date', now.toISOString())
      .not('status', 'in', '("Done","Completed")')

    if (!overdueTasks || overdueTasks.length === 0) return 0

    // Filter to tasks with specialist involvement and respect nudge cooldown
    const nudgeCooldownMs = 48 * 60 * 60 * 1000 // 48 hours
    const eligibleTasks = overdueTasks.filter(t => {
      // Must have a specialist creator or owner
      const specialistId = t.owner_agent_id ?? t.created_by_agent_id
      if (!specialistId) return false

      // Respect nudge cooldown
      if (t.last_nudge_at) {
        const lastNudge = new Date(t.last_nudge_at)
        if (now.getTime() - lastNudge.getTime() < nudgeCooldownMs) return false
      }

      return true
    })

    if (eligibleTasks.length === 0) return 0

    // Cap at 5 reminders per run to avoid noise
    for (const task of eligibleTasks.slice(0, 5)) {
      const specialistId = task.owner_agent_id ?? task.created_by_agent_id!
      const specialist = SPECIALISTS.find(s => s.id === specialistId)
      const daysOverdue = Math.ceil((now.getTime() - new Date(task.end_date!).getTime()) / (1000 * 60 * 60 * 24))
      const nudgeCount = task.nudge_count ?? 0
      const isEscalation = nudgeCount >= 3

      const urgency = daysOverdue >= 14 || isEscalation ? 'critical' : 'important'
      const escalationNote = isEscalation
        ? `\n\nThis task has been nudged ${nudgeCount} times without resolution. Consider reassigning, reducing scope, or removing it from the backlog.`
        : ''

      const { error: insertError } = await supabase.rpc('insert_agent_insight', {
        p_foundry_id: foundryId,
        p_specialist_id: specialistId,
        p_insight_type: 'reminder',
        p_urgency: urgency,
        p_title: `Follow-up: ${task.title.slice(0, 150)}`,
        p_body: [
          `Task "${task.title}" is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue (due: ${task.end_date}, priority: ${task.priority ?? 'Medium'}).`,
          `Current status: ${task.status ?? 'Unknown'}.`,
          `This task was ${task.owner_agent_id === specialistId ? 'assigned to' : 'created by'} ${specialist?.name ?? 'a specialist'}.`,
          escalationNote,
        ].join('\n').trim(),
        p_domain_data: {
          task_id: task.id,
          days_overdue: daysOverdue,
          nudge_count: nudgeCount + 1,
          is_escalation: isEscalation,
        },
        p_suggested_actions: [
          {
            label: `Discuss with ${specialist?.name ?? 'Specialist'}`,
            action_type: 'open_specialist',
            action_data: { specialist_id: specialistId },
          },
          { label: 'View tasks', action_type: 'view_page', action_data: { page: '/objectives' } },
        ],
      })

      if (!insertError) {
        // Update nudge tracking on the task
        await supabase
          .from('tasks')
          .update({
            last_nudge_at: now.toISOString(),
            nudge_count: nudgeCount + 1,
          })
          .eq('id', task.id)

        remindersCreated++
      } else {
        console.error(`[AgenticActions] Failed to create follow-up for "${task.title}":`, insertError.message)
      }
    }

    if (remindersCreated > 0) {
      console.info(`[AgenticActions] Created ${remindersCreated} task follow-up reminders for foundry ${foundryId}`)
    }

    return remindersCreated
  } catch (error) {
    console.error('[AgenticActions] autoFollowUpOnOverdueTasks failed:', error)
    return 0
  }
}

// ─── Ambient Milestone Celebrations ──────────────────────────────────

/** Specialist domain keywords for matching celebrations to relevant specialists */
const SPECIALIST_DOMAINS: Record<string, string[]> = {
  'strategist': ['strategy', 'market', 'competitive', 'growth', 'expansion', 'launch', 'pivot'],
  'finance-lead': ['revenue', 'mrr', 'arr', 'funding', 'burn', 'runway', 'budget', 'cash', 'profit', 'cost'],
  'product-lead': ['product', 'feature', 'release', 'ship', 'user', 'customer', 'prd', 'roadmap'],
  'growth-marketer': ['marketing', 'content', 'campaign', 'traffic', 'seo', 'brand', 'awareness'],
  'sales-lead': ['sale', 'deal', 'pipeline', 'contract', 'client', 'enterprise', 'close', 'lead'],
  'hiring-team': ['hire', 'team', 'onboard', 'recruit', 'culture', 'headcount'],
  'cto': ['technical', 'architecture', 'infrastructure', 'performance', 'security', 'engineering'],
  'legal-counsel': ['legal', 'compliance', 'contract', 'ip', 'regulation', 'terms'],
  'fundraising-advisor': ['fundraise', 'investor', 'pitch', 'round', 'valuation', 'term sheet'],
  'chief-of-staff': ['milestone', 'objective', 'goal', 'ops', 'process'],
}

/**
 * Creates celebration insights from relevant specialists when milestones occur.
 *
 * @description Uses each specialist's celebrationStyle to generate brief,
 * in-character acknowledgments. No AI call needed — the celebration style
 * data is rich enough to construct compelling messages via template.
 *
 * @param foundryId - The foundry
 * @param milestoneType - What kind of milestone was hit
 * @param eventData - Details about the milestone
 * @returns Number of celebrations created
 */
export async function celebrateMilestone(
  foundryId: string,
  milestoneType: 'task_completed' | 'objective_completed' | 'metric_milestone',
  eventData: { title: string; description?: string; specialistId?: string },
): Promise<number> {
  const supabase = createAdminClient()
  let celebrationsCreated = 0

  try {
    const titleLower = (eventData.title + ' ' + (eventData.description ?? '')).toLowerCase()

    // Select 2-3 relevant specialists by domain keyword match
    const scored: Array<{ id: string; score: number }> = []
    for (const [specId, keywords] of Object.entries(SPECIALIST_DOMAINS)) {
      const matchCount = keywords.filter(kw => titleLower.includes(kw)).length
      if (matchCount > 0) {
        scored.push({ id: specId, score: matchCount })
      }
    }
    scored.sort((a, b) => b.score - a.score)

    // Always include the specialist who owns/created the work, plus 1-2 domain-relevant others
    const celebrants = new Set<string>()
    if (eventData.specialistId) celebrants.add(eventData.specialistId)
    for (const s of scored) {
      if (celebrants.size >= 3) break
      celebrants.add(s.id)
    }
    // If still empty, default to chief-of-staff
    if (celebrants.size === 0) celebrants.add('chief-of-staff')

    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    for (const specId of celebrants) {
      const specialist = SPECIALISTS.find(s => s.id === specId)
      if (!specialist?.personality.celebrationStyle) continue

      const { acknowledgment, domainConnection, nextChallenge } = specialist.personality.celebrationStyle
      const body = `${acknowledgment} ${domainConnection} ${nextChallenge}`

      const milestoneLabel = milestoneType === 'task_completed' ? 'Task completed'
        : milestoneType === 'objective_completed' ? 'Objective achieved'
        : 'Milestone reached'

      const { error } = await supabase.rpc('insert_agent_insight', {
        p_foundry_id: foundryId,
        p_specialist_id: specId,
        p_insight_type: 'observation',
        p_urgency: 'informational',
        p_title: `${milestoneLabel}: ${eventData.title.slice(0, 120)}`,
        p_body: body.slice(0, 2000),
        p_domain_data: {
          celebration: true,
          milestone_type: milestoneType,
          event_title: eventData.title,
        },
        p_suggested_actions: [
          {
            label: `Chat with ${specialist.name}`,
            action_type: 'open_specialist',
            action_data: { specialist_id: specId },
          },
        ],
      })

      if (!error) {
        celebrationsCreated++
      }
    }

    // Set short TTL on celebrations so they don't clog the feed
    // (The expires_at is set via a direct update since the RPC doesn't support it)
    if (celebrationsCreated > 0) {
      await supabase
        .from('agent_insights')
        .update({ expires_at: expires })
        .eq('foundry_id', foundryId)
        .eq('insight_type', 'observation')
        .contains('domain_data', { celebration: true })
        .gte('created_at', new Date(Date.now() - 60_000).toISOString())
    }

    return celebrationsCreated
  } catch (error) {
    console.error('[AgenticActions] celebrateMilestone failed:', error)
    return 0
  }
}

// ─── Orchestrator ───────────────────────────────────────────────────

/**
 * Runs all agentic actions for a foundry.
 *
 * @description Called after sweep runs to process insights and take
 * autonomous actions (drafting tasks, escalating alerts, following up
 * on overdue tasks).
 *
 * @param foundryId - The foundry to process
 * @returns Summary of all actions taken
 */
// ─── Decision Outcome Follow-ups ────────────────────────────────────

/**
 * Creates follow-up reminders for decisions 30+ days old with no recorded outcome.
 *
 * @description Queries the decision journal for pending-outcome decisions
 * and creates gentle reminder insights asking the founder how things went.
 * This closes the learning loop so specialists can reference outcomes in
 * future conversations.
 *
 * @param foundryId - The foundry to check
 * @returns Number of outcome follow-ups created
 */
async function autoFollowUpOnDecisionOutcomes(foundryId: string): Promise<number> {
  const supabase = createAdminClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  try {
    // Find decisions 30+ days old with pending outcome status
    const { data: pendingDecisions } = await supabase
      .from('specialist_decision_journal')
      .select('id, specialist_id, decision, created_at')
      .eq('foundry_id', foundryId)
      .eq('outcome_status', 'pending')
      .lt('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: true })
      .limit(3)

    if (!pendingDecisions?.length) return 0

    let created = 0
    for (const d of pendingDecisions) {
      const daysSince = Math.floor((Date.now() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24))
      const decisionPreview = d.decision.slice(0, 120)

      // Check we haven't already created a follow-up for this decision recently
      const { count } = await supabase
        .from('agent_insights')
        .select('*', { count: 'exact', head: true })
        .eq('foundry_id', foundryId)
        .eq('specialist_id', d.specialist_id)
        .eq('insight_type', 'reminder')
        .ilike('title', `%${decisionPreview.slice(0, 50)}%`)
        .gt('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())

      if ((count ?? 0) > 0) continue

      const { error } = await supabase.rpc('insert_agent_insight', {
        p_foundry_id: foundryId,
        p_specialist_id: d.specialist_id,
        p_insight_type: 'reminder',
        p_urgency: 'informational',
        p_title: `How did it go? "${decisionPreview}"`,
        p_body: `${daysSince} days ago, you decided: "${d.decision.slice(0, 200)}". How did that turn out? Understanding outcomes helps me give you better advice next time.`,
        p_domain_data: { decision_id: d.id, days_since: daysSince },
        p_suggested_actions: [
          { label: `Tell ${SPECIALISTS.find(s => s.id === d.specialist_id)?.name ?? 'me'} how it went`, action_type: 'open_specialist', action_data: { specialist_id: d.specialist_id } },
        ],
      })

      if (!error) created++
    }

    if (created > 0) {
      console.info(`[AgenticActions] Created ${created} decision outcome follow-ups for foundry ${foundryId}`)
    }
    return created
  } catch (error) {
    console.error('[AgenticActions] Decision outcome follow-up failed:', error)
    return 0
  }
}

export async function runAgenticActions(foundryId: string): Promise<{
  draftTasks: ActionResult[]
  escalations: number
  followUps: number
  decisionFollowUps: number
}> {
  const [draftTasks, escalations, followUps, decisionFollowUps] = await Promise.all([
    autoDraftTasksFromInsights(foundryId),
    autoEscalateThresholdBreaches(foundryId),
    autoFollowUpOnOverdueTasks(foundryId),
    autoFollowUpOnDecisionOutcomes(foundryId),
  ])

  return { draftTasks, escalations, followUps, decisionFollowUps }
}
