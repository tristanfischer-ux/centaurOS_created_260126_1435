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
