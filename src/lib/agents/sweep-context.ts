/**
 * @file sweep-context.ts
 *
 * @description Builds AI context for background sweeps using the service role
 * client. Unlike the standard buildAIContext which requires authenticated user
 * context, this version works in cron/service contexts where there's no user session.
 *
 * Collects:
 * 1. Company profile (foundries.company_profile)
 * 2. Purpose / mission / vision (foundries.purpose_data)
 * 3. Active objectives summary
 * 4. Recent tasks with statuses
 * 5. Team composition
 * 6. Per-specialist task portfolio (for execution loop follow-ups)
 *
 * @security Uses service role client — bypasses RLS. Only called from cron routes.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { CompanyProfile } from '@/types/foundry'
import type { FoundryPurposeData } from '@/types/foundry'
import {
  EMPLOYEE_COUNT_LABELS,
  REVENUE_RANGE_LABELS,
  FUNDING_STATUS_LABELS,
  BUSINESS_MODEL_LABELS,
} from '@/types/foundry'

/**
 * Builds comprehensive AI context for a foundry using service role.
 *
 * @description Assembles company profile, purpose, objectives, tasks,
 * and team data into a formatted string for sweep prompts. Does not
 * require user authentication.
 *
 * @param foundryId - The foundry to build context for
 * @returns Formatted context string for AI prompt injection
 *
 * @security Uses service role client — no RLS filtering
 */
export async function buildAIContextWithServiceClient(foundryId: string): Promise<string> {
  const supabase = createAdminClient()
  const sections: string[] = []

  try {
    // 1. Fetch foundry data
    const { data: foundry } = await supabase
      .from('foundries')
      .select('name, company_profile, purpose_data, sector, industry, stage')
      .eq('id', foundryId)
      .single()

    if (!foundry) {
      return '\n--- Business Context ---\nNo company data available.\n--- End Business Context ---\n'
    }

    // 2. Company basics
    const basics: string[] = [`Company: ${foundry.name}`]
    if (foundry.sector) basics.push(`Sector: ${foundry.sector}`)
    if (foundry.industry) basics.push(`Industry: ${foundry.industry}`)
    if (foundry.stage) basics.push(`Stage: ${foundry.stage}`)
    sections.push(basics.join('\n'))

    // 3. Company Profile
    const profile = foundry.company_profile as CompanyProfile | null
    if (profile) {
      const details: string[] = []
      if (profile.employee_count) details.push(`Team size: ${EMPLOYEE_COUNT_LABELS[profile.employee_count] ?? profile.employee_count}`)
      if (profile.business_model) details.push(`Business model: ${BUSINESS_MODEL_LABELS[profile.business_model] ?? profile.business_model}`)
      if (profile.revenue_range) details.push(`Revenue: ${REVENUE_RANGE_LABELS[profile.revenue_range] ?? profile.revenue_range}`)
      if (profile.funding_status) details.push(`Funding: ${FUNDING_STATUS_LABELS[profile.funding_status] ?? profile.funding_status}`)
      if (profile.location) details.push(`Location: ${profile.location}`)
      if (profile.founded_year) details.push(`Founded: ${profile.founded_year}`)
      if (details.length > 0) {
        sections.push(`Company profile:\n${details.join('\n')}`)
      }
    }

    // 4. Purpose / Mission / Vision
    const purpose = foundry.purpose_data as FoundryPurposeData | null
    if (purpose) {
      const parts: string[] = []
      if (purpose.purpose) parts.push(`Purpose: ${purpose.purpose}`)
      if (purpose.mission) parts.push(`Mission: ${purpose.mission}`)
      if (purpose.vision) parts.push(`Vision: ${purpose.vision}`)
      if (parts.length > 0) sections.push(parts.join('\n'))
    }

    // 5. Active objectives
    const { data: objectives } = await supabase
      .from('objectives')
      .select('title, progress, status, due_date')
      .eq('foundry_id', foundryId)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .in('status', ['In Progress', 'Not Started'])
      .order('created_at', { ascending: false })
      .limit(15)

    if (objectives && objectives.length > 0) {
      const lines = objectives.map(o => {
        const dueStr = o.due_date ? ` (due: ${o.due_date})` : ''
        return `- ${o.title} — ${o.progress ?? 0}% complete, ${o.status}${dueStr}`
      })
      sections.push(`Active objectives (${objectives.length}):\n${lines.join('\n')}`)
    }

    // 6. Recent tasks (last 20, for operational context)
    const { data: tasks } = await supabase
      .from('tasks')
      .select('title, status, priority, end_date')
      .eq('foundry_id', foundryId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20)

    if (tasks && tasks.length > 0) {
      const overdue = tasks.filter(t =>
        t.end_date && new Date(t.end_date) < new Date() && t.status !== 'Done'
      )
      const inProgress = tasks.filter(t => t.status === 'In Progress')
      const todo = tasks.filter(t => t.status === 'To Do')
      const done = tasks.filter(t => t.status === 'Done')

      const taskSummary = [
        `Recent tasks: ${tasks.length} total`,
        `  In progress: ${inProgress.length}`,
        `  To do: ${todo.length}`,
        `  Completed: ${done.length}`,
      ]

      if (overdue.length > 0) {
        taskSummary.push(`  OVERDUE: ${overdue.length} tasks past due date:`)
        for (const t of overdue.slice(0, 5)) {
          taskSummary.push(`    - ${t.title} (due: ${t.end_date}, priority: ${t.priority ?? 'medium'})`)
        }
      }

      sections.push(taskSummary.join('\n'))
    }

    // 7. Team members
    const { data: members } = await supabase
      .from('profiles')
      .select('full_name, role')
      .or(`foundry_id.eq.${foundryId},active_foundry_id.eq.${foundryId}`)
      .limit(20)

    if (members && members.length > 0) {
      const memberLines = members.map(m => `- ${m.full_name ?? 'Unknown'} (${m.role ?? 'Member'})`)
      sections.push(`Team (${members.length} members):\n${memberLines.join('\n')}`)
    }

  } catch (err) {
    console.error('[SweepContext] Error building context:', err)
  }

  return sections.length > 0
    ? `\n--- Business Context ---\n${sections.join('\n\n')}\n--- End Business Context ---\n`
    : '\n--- Business Context ---\nNo company data available.\n--- End Business Context ---\n'
}

// ─── Specialist Task Portfolio ─────────────────────────────────────

/**
 * Builds a specialist-specific task portfolio for sweep prompts and conversations.
 *
 * @description Queries tasks where the specialist created or owns them, and groups
 * into OVERDUE, STALLED, On Track, and Recently Completed categories. This gives
 * the specialist awareness of work they've initiated or been assigned, enabling
 * follow-up nudges and execution loop closure.
 *
 * @param foundryId - The foundry to query tasks for
 * @param specialistId - The specialist ID (e.g., "strategist", "finance-lead")
 * @returns Formatted markdown block, or empty string if no relevant tasks
 *
 * @security Uses service role client — no RLS filtering
 */
export async function buildSpecialistTaskContext(
  foundryId: string,
  specialistId: string,
): Promise<string> {
  const supabase = createAdminClient()

  try {
    // Fetch tasks this specialist created or owns (limit 15 for prompt budget)
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, status, progress, end_date, start_date, priority, last_nudge_at, nudge_count, created_at, updated_at, created_by_agent_id, owner_agent_id')
      .eq('foundry_id', foundryId)
      .is('deleted_at', null)
      // DECISION: Use specialist_id TEXT column (not owner_agent_id UUID) for matching.
      // The UUID columns have FK to profiles and can't store string specialist IDs.
      .eq('specialist_id', specialistId)
      .order('created_at', { ascending: false })
      .limit(15)

    if (!tasks || tasks.length === 0) return ''

    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Categorize tasks
    const overdue: typeof tasks = []
    const stalled: typeof tasks = []
    const onTrack: typeof tasks = []
    const recentlyCompleted: typeof tasks = []

    for (const task of tasks) {
      const isDone = task.status === 'Done' || task.status === 'Completed'
      const isActive = task.status === 'In Progress' || task.status === 'Accepted'

      if (isDone) {
        // Check if completed in last 7 days
        const completedAt = task.updated_at ? new Date(task.updated_at) : null
        if (completedAt && completedAt >= sevenDaysAgo) {
          recentlyCompleted.push(task)
        }
        continue
      }

      // Overdue: past end_date and not done
      if (task.end_date && new Date(task.end_date) < now) {
        overdue.push(task)
        continue
      }

      // Stalled: In Progress for >7 days with <50% progress
      if (isActive && task.start_date) {
        const startDate = new Date(task.start_date)
        const daysSinceStart = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        if (daysSinceStart > 7 && (task.progress ?? 0) < 50) {
          stalled.push(task)
          continue
        }
      }

      // On Track: everything else that's active or pending
      if (!isDone) {
        onTrack.push(task)
      }
    }

    // Build markdown output
    const sections: string[] = []

    if (overdue.length > 0) {
      const lines = overdue.map(t => {
        const daysOverdue = Math.ceil((now.getTime() - new Date(t.end_date!).getTime()) / (1000 * 60 * 60 * 24))
        const nudgeInfo = t.nudge_count
          ? ` [nudged ${t.nudge_count}x, last: ${t.last_nudge_at ? new Date(t.last_nudge_at).toLocaleDateString() : 'unknown'}]`
          : ''
        return `  - **${t.title}** — ${daysOverdue}d overdue (due: ${t.end_date}, priority: ${t.priority ?? 'Medium'})${nudgeInfo}`
      })
      sections.push(`### OVERDUE (${overdue.length})\n${lines.join('\n')}`)
    }

    if (stalled.length > 0) {
      const lines = stalled.map(t => {
        const daysSinceStart = Math.ceil((now.getTime() - new Date(t.start_date!).getTime()) / (1000 * 60 * 60 * 24))
        return `  - **${t.title}** — ${t.progress ?? 0}% after ${daysSinceStart}d (started: ${t.start_date})`
      })
      sections.push(`### STALLED (${stalled.length})\n${lines.join('\n')}`)
    }

    if (onTrack.length > 0) {
      const lines = onTrack.slice(0, 5).map(t => {
        const dueStr = t.end_date ? ` (due: ${t.end_date})` : ''
        return `  - ${t.title} — ${t.status}, ${t.progress ?? 0}%${dueStr}`
      })
      const moreCount = onTrack.length > 5 ? `\n  - ...and ${onTrack.length - 5} more` : ''
      sections.push(`### On Track (${onTrack.length})\n${lines.join('\n')}${moreCount}`)
    }

    if (recentlyCompleted.length > 0) {
      const lines = recentlyCompleted.map(t =>
        `  - ~~${t.title}~~ — completed`
      )
      sections.push(`### Recently Completed (${recentlyCompleted.length})\n${lines.join('\n')}`)
    }

    if (sections.length === 0) return ''

    return `\n--- Your Task Portfolio ---\nThese are tasks you created or own. Follow up on overdue/stalled items and acknowledge completions.\n\n${sections.join('\n\n')}\n--- End Task Portfolio ---\n`
  } catch (err) {
    console.error('[SweepContext] Error building specialist task context:', err)
    return ''
  }
}

/**
 * Build context for content revision requests.
 *
 * @description Fetches artifacts in 'revision_requested' status for this foundry.
 * When a founder rejects published content and requests revisions, the specialist
 * needs to see the feedback and re-generate the content.
 *
 * FLOW: Founder clicks "Request Revision" on publish-content-card → artifact gets
 * publish_status='revision_requested' with review_notes in publish_metadata →
 * this function picks it up on the next sweep → specialist sees feedback and
 * should produce a revised PROPOSED_EXTERNAL_ACTION: publish_content.
 */
export async function buildRevisionRequestContext(
  foundryId: string,
  specialistId: string,
): Promise<string> {
  const supabase = createAdminClient()

  try {
    // SECURITY: Only show revisions relevant to this specialist (#11).
    // Filter by content_type mapped to specialist capabilities.
    const contentTypeFilter = specialistId === 'growth-marketer'
      ? ['blog', 'page', 'case-study', 'landing-page']
      : specialistId === 'sales-lead'
        ? ['email-template', 'case-study']
        : ['blog', 'page'] // default for any specialist

    const { data: revisions } = await supabase
      .from('agent_artifacts')
      .select('id, title, content_type, publish_metadata')
      .eq('foundry_id', foundryId)
      .eq('publish_status', 'revision_requested')
      .in('content_type', contentTypeFilter)
      .order('updated_at', { ascending: false })
      .limit(5)

    if (!revisions || revisions.length === 0) return ''

    const items = revisions.map(r => {
      const meta = (r.publish_metadata || {}) as Record<string, unknown>
      const notes = (meta.review_notes as string) || 'No specific feedback provided'
      return `  - **${r.title}** (${r.content_type}): Founder feedback: "${notes}"`
    })

    return `\n--- Content Revision Requests ---\nThe founder has reviewed your published content and requested revisions. For each item below, produce an updated version as a PROPOSED_EXTERNAL_ACTION with type "publish_content". Address the founder's feedback directly.\n\n${items.join('\n')}\n--- End Revision Requests ---\n`
  } catch (err) {
    console.error('[SweepContext] Error building revision request context:', err)
    return ''
  }
}

/**
 * Fetch executable tasks assigned to this specialist.
 *
 * @description Returns tasks that the specialist owns and should execute
 * during the current sweep. Limited to 3 per sweep for cost control.
 * Only returns content, external_action, and general task types
 * (code_change tasks require manual execution).
 *
 * @param foundryId - The foundry to scope to
 * @param specialistId - The specialist's ID (e.g., 'growth-marketer', 'sales-lead')
 * @returns Array of executable task objects
 */
export async function getExecutableTasks(
  foundryId: string,
  specialistId: string,
): Promise<Array<{
  id: string
  title: string
  description: string | null
  task_type: string
  plan_id: string | null
  priority: string | null
}>> {
  const supabase = createAdminClient()

  try {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, description, task_type, plan_id, risk_level')
      .eq('foundry_id', foundryId)
      .eq('specialist_id', specialistId)
      .in('status', ['Pending', 'Accepted'])
      .in('task_type', ['content', 'external_action', 'general'])
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(3)

    return (tasks || []).map(t => ({
      id: t.id,
      title: t.title ?? '',
      description: t.description ?? null,
      task_type: t.task_type ?? 'general',
      plan_id: t.plan_id ?? null,
      priority: t.risk_level ?? null,
    }))
  } catch (err) {
    console.error('[SweepContext] Error fetching executable tasks:', err)
    return []
  }
}
