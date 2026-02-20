'use server'

/**
 * @file report-generator.ts
 *
 * @description Server action that collects data from existing Supabase RPCs
 * and composes it into a ReportDocument for rendering. This is the single
 * data-fetching entry point for the report generation system.
 *
 * INTENT: Reuse existing get_weekly_rollup / get_monthly_summary DB functions
 * rather than duplicating queries. Additional data (week-ahead tasks, blockers
 * detail) is fetched directly where the existing RPCs don't cover it.
 *
 * @related
 * - src/lib/reports/report-document-types.ts — Type definitions
 * - src/lib/reports/templates.ts — Template definitions
 * - src/actions/reports.ts — Existing report actions (weekly rollup, etc.)
 */

import { v4 as uuidv4 } from 'uuid'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { calculatePercentChange, getTrendDirection } from '@/lib/reports/trends'
import { generateExecutiveNarrative } from '@/lib/reports/ai-narrative'
import type { NarrativeContext, NarrativeOptions } from '@/lib/reports/ai-narrative'
import type { Json } from '@/types/database.types'
import type {
  GenerateReportRequest,
  GenerateReportResponse,
  ReportDocument,
  SectionData,
  CoverSectionData,
  ExecutiveSummarySectionData,
  KeyMetricsSectionData,
  KPIMetric,
  ObjectivesProgressSectionData,
  ObjectiveRow,
  TeamActivitySectionData,
  TeamMemberRow,
  BlockersRisksSectionData,
  BlockerRow,
  AtRiskObjective,
  CompletionTrendSectionData,
  WeekAheadSectionData,
  UpcomingTask,
  ReportSectionType,
} from '@/lib/reports/report-document-types'

/**
 * Generate a report document from the given template and date range.
 *
 * @param request - Template ID, selected sections, and date range
 * @returns The composed ReportDocument or an error
 */
export async function generateReport(request: GenerateReportRequest): Promise<GenerateReportResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
      return { success: false, error: 'No foundry context' }
    }

    const { data: foundry } = await supabase
      .from('foundries')
      .select('name')
      .eq('id', foundryId)
      .single()

    const foundryName = foundry?.name ?? 'My Company'
    const { sections: requestedSections, dateRange, templateId, tone, detailLevel } = request

    const sectionDataMap = new Map<ReportSectionType, SectionData>()

    // FLOW: Fetch data for each requested section in parallel where possible
    const fetchPromises: Promise<void>[] = []

    if (requestedSections.includes('cover')) {
      sectionDataMap.set('cover', {
        type: 'cover',
        data: buildCoverData(foundryName, templateId, dateRange),
      })
    }

    if (requestedSections.includes('key-metrics') || requestedSections.includes('executive-summary')) {
      fetchPromises.push(
        fetchMetricsData(supabase, foundryId, dateRange).then(({ metrics, summary }) => {
          if (requestedSections.includes('key-metrics')) {
            sectionDataMap.set('key-metrics', { type: 'key-metrics', data: metrics })
          }
          if (requestedSections.includes('executive-summary')) {
            sectionDataMap.set('executive-summary', { type: 'executive-summary', data: summary })
          }
        })
      )
    }

    if (requestedSections.includes('objectives-progress')) {
      fetchPromises.push(
        fetchObjectivesData(supabase, foundryId, dateRange).then(data => {
          sectionDataMap.set('objectives-progress', { type: 'objectives-progress', data })
        })
      )
    }

    if (requestedSections.includes('team-activity')) {
      fetchPromises.push(
        fetchTeamActivityData(supabase, foundryId, dateRange).then(data => {
          sectionDataMap.set('team-activity', { type: 'team-activity', data })
        })
      )
    }

    if (requestedSections.includes('blockers-risks')) {
      fetchPromises.push(
        fetchBlockersData(supabase, foundryId, dateRange).then(data => {
          sectionDataMap.set('blockers-risks', { type: 'blockers-risks', data })
        })
      )
    }

    if (requestedSections.includes('completion-trend')) {
      fetchPromises.push(
        fetchCompletionTrend(supabase, foundryId, dateRange).then(data => {
          sectionDataMap.set('completion-trend', { type: 'completion-trend', data })
        })
      )
    }

    if (requestedSections.includes('week-ahead')) {
      fetchPromises.push(
        fetchWeekAheadData(supabase, foundryId).then(data => {
          sectionDataMap.set('week-ahead', { type: 'week-ahead', data })
        })
      )
    }

    await Promise.all(fetchPromises)

    // INTENT: After all data is fetched, enhance the executive summary with
    // an AI-generated narrative via Gemini. The raw metrics are passed as
    // context so the narrative is grounded in real data, not hallucinated.
    if (requestedSections.includes('executive-summary')) {
      const narrativeOptions: NarrativeOptions = {
        tone: tone ?? 'internal',
        detailLevel: detailLevel ?? 'standard',
      }

      const narrativeContext = buildNarrativeContext(
        foundryName,
        templateId === 'board-pack' ? 'Board Pack' : 'Weekly Update',
        dateRange,
        sectionDataMap,
      )

      try {
        const aiResult = await generateExecutiveNarrative(narrativeContext, narrativeOptions)
        sectionDataMap.set('executive-summary', {
          type: 'executive-summary',
          data: {
            narrative: aiResult.narrative,
            highlights: aiResult.highlights,
          } satisfies ExecutiveSummarySectionData,
        })
      } catch (err) {
        console.warn('[ReportGenerator] AI narrative failed, keeping template summary:', err)
      }
    }

    // Assemble sections in the order they were requested
    const orderedSections: SectionData[] = requestedSections
      .filter(type => sectionDataMap.has(type))
      .map(type => sectionDataMap.get(type)!)

    const document: ReportDocument = {
      id: uuidv4(),
      templateId,
      title: templateId === 'board-pack' ? 'Board Pack' : 'Weekly Update',
      dateRange,
      generatedAt: new Date().toISOString(),
      foundryId,
      foundryName,
      sections: orderedSections,
    }

    return { success: true, document }
  } catch (error) {
    console.error('[ReportGenerator] Failed to generate report:', error)
    return { success: false, error: sanitizeErrorMessage(error) }
  }
}

// ========================
// Section Data Fetchers
// ========================

function buildCoverData(
  companyName: string,
  templateId: string,
  dateRange: { start: string; end: string }
): CoverSectionData {
  const reportTitle = templateId === 'board-pack' ? 'Board Pack' : 'Weekly Update'
  const startDate = new Date(dateRange.start)
  const endDate = new Date(dateRange.end)

  const formatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const subtitle = `${formatter.format(startDate)} — ${formatter.format(endDate)}`

  return {
    companyName,
    reportTitle,
    subtitle,
    dateRange,
    generatedAt: new Date().toISOString(),
  }
}

// INTENT: Fetch the weekly rollup RPC and transform it into our KPI metrics
// and executive summary. Reuses the existing get_weekly_rollup DB function.
async function fetchMetricsData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  dateRange: { start: string; end: string }
): Promise<{ metrics: KeyMetricsSectionData; summary: ExecutiveSummarySectionData }> {
  const { data, error } = await supabase.rpc('get_weekly_rollup', {
    p_foundry_id: foundryId,
    p_week_start: dateRange.start,
  })

  if (error || !data) {
    console.warn('[ReportGenerator] Weekly rollup failed, using fallback:', error?.message)
    return {
      metrics: { metrics: [] },
      summary: { narrative: 'Report data is being collected.', highlights: [] },
    }
  }

  const rollup = data as {
    stats: { tasks_completed: number; tasks_created: number; blockers_reported: number; standup_submissions: number; avg_daily_completion: number | null }
    previous_week: { tasks_completed: number; tasks_created: number }
    top_completers: { full_name: string; completed_count: number }[]
    objectives_progress: { title: string; progress: number; tasks_completed_this_week?: number; tasks_remaining?: number }[]
  }

  const completedChange = calculatePercentChange(rollup.stats.tasks_completed, rollup.previous_week.tasks_completed)
  const createdChange = calculatePercentChange(rollup.stats.tasks_created, rollup.previous_week.tasks_created)
  const velocity = rollup.stats.tasks_created > 0
    ? Math.round((rollup.stats.tasks_completed / rollup.stats.tasks_created) * 100)
    : 0

  const kpiMetrics: KPIMetric[] = [
    {
      label: 'Tasks Completed',
      value: rollup.stats.tasks_completed,
      previousValue: rollup.previous_week.tasks_completed,
      format: 'number',
      trend: getTrendDirection(rollup.stats.tasks_completed - rollup.previous_week.tasks_completed, 2),
      changePercent: Math.round(completedChange),
    },
    {
      label: 'Tasks Created',
      value: rollup.stats.tasks_created,
      previousValue: rollup.previous_week.tasks_created,
      format: 'number',
      trend: getTrendDirection(rollup.stats.tasks_created - rollup.previous_week.tasks_created, 2),
      changePercent: Math.round(createdChange),
    },
    {
      label: 'Velocity',
      value: velocity,
      previousValue: 100,
      format: 'percentage',
      trend: velocity > 105 ? 'up' : velocity < 95 ? 'down' : 'stable',
      changePercent: velocity - 100,
    },
    {
      label: 'Blockers Reported',
      value: rollup.stats.blockers_reported,
      previousValue: 0,
      format: 'number',
      trend: rollup.stats.blockers_reported > 3 ? 'down' : 'stable',
      changePercent: 0,
    },
  ]

  // Build a template-based executive summary
  const highlights: string[] = []
  const diffText = rollup.stats.tasks_completed > rollup.previous_week.tasks_completed
    ? `up ${Math.round(completedChange)}% from the previous period`
    : rollup.stats.tasks_completed < rollup.previous_week.tasks_completed
      ? `down ${Math.abs(Math.round(completedChange))}% from the previous period`
      : 'steady compared to the previous period'

  let narrative = `The team completed ${rollup.stats.tasks_completed} tasks this period, ${diffText}.`

  if (rollup.top_completers.length > 0) {
    highlights.push(`Top contributor: ${rollup.top_completers[0].full_name} (${rollup.top_completers[0].completed_count} tasks)`)
  }

  const atRiskCount = rollup.objectives_progress.filter(o => o.progress < 50 && (o.tasks_remaining ?? 0) > 5).length
  if (atRiskCount > 0) {
    highlights.push(`${atRiskCount} objective${atRiskCount !== 1 ? 's' : ''} at risk of missing deadline`)
    narrative += ` ${atRiskCount} objective${atRiskCount !== 1 ? 's are' : ' is'} at risk and may need attention.`
  }

  if (rollup.stats.blockers_reported > 0) {
    highlights.push(`${rollup.stats.blockers_reported} blocker${rollup.stats.blockers_reported !== 1 ? 's' : ''} reported`)
  }

  const progressingObjectives = rollup.objectives_progress.filter(o => (o.tasks_completed_this_week ?? 0) > 0)
  if (progressingObjectives.length > 0) {
    highlights.push(`${progressingObjectives.length} objective${progressingObjectives.length !== 1 ? 's' : ''} made progress this period`)
  }

  return {
    metrics: { metrics: kpiMetrics },
    summary: { narrative, highlights },
  }
}

async function fetchObjectivesData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  _dateRange: { start: string; end: string }
): Promise<ObjectivesProgressSectionData> {
  const { data: objectives, error } = await supabase
    .from('objectives')
    .select('id, title, progress, status, end_date, is_milestone')
    .eq('foundry_id', foundryId)
    .is('deleted_at', null)
    .in('status', ['In Progress', 'Not Started'])
    .order('progress', { ascending: false })
    .limit(15)

  if (error) {
    console.warn('[ReportGenerator] Objectives fetch failed:', error.message)
    return { objectives: [], totalActive: 0, totalCompleted: 0 }
  }

  // Get task counts per objective
  const objectiveIds = (objectives ?? []).map(o => o.id)
  const { data: taskCounts } = await supabase
    .from('tasks')
    .select('objective_id, status')
    .in('objective_id', objectiveIds.length > 0 ? objectiveIds : ['__none__'])
    .is('deleted_at', null)

  const taskCountMap = new Map<string, { completed: number; total: number }>()
  for (const task of taskCounts ?? []) {
    if (!task.objective_id) continue
    const existing = taskCountMap.get(task.objective_id) ?? { completed: 0, total: 0 }
    existing.total++
    if (task.status === 'Completed') existing.completed++
    taskCountMap.set(task.objective_id, existing)
  }

  const rows: ObjectiveRow[] = (objectives ?? []).map(o => {
    const counts = taskCountMap.get(o.id) ?? { completed: 0, total: 0 }
    const remaining = counts.total - counts.completed
    const daysRemaining = o.end_date
      ? Math.ceil((new Date(o.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null

    let health: ObjectiveRow['health'] = 'on-track'
    if (o.status === 'Completed') health = 'completed'
    else if (o.status === 'Not Started') health = 'not-started'
    else if (daysRemaining !== null && daysRemaining < 14 && (o.progress ?? 0) < 50) health = 'off-track'
    else if (daysRemaining !== null && daysRemaining < 21 && (o.progress ?? 0) < 70) health = 'at-risk'

    return {
      id: o.id,
      title: o.title,
      progress: o.progress ?? 0,
      status: o.status ?? 'Not Started',
      health,
      tasksCompleted: counts.completed,
      tasksRemaining: remaining,
      endDate: o.end_date,
    }
  })

  const { count: completedCount } = await supabase
    .from('objectives')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', foundryId)
    .eq('status', 'Completed')
    .is('deleted_at', null)

  return {
    objectives: rows,
    totalActive: rows.length,
    totalCompleted: completedCount ?? 0,
  }
}

async function fetchTeamActivityData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  dateRange: { start: string; end: string }
): Promise<TeamActivitySectionData> {
  // INTENT: Count tasks completed per user within the date range
  const { data: completedTasks, error } = await supabase
    .from('tasks')
    .select('assignee_id, status, updated_at')
    .eq('foundry_id', foundryId)
    .eq('status', 'Completed')
    .gte('updated_at', `${dateRange.start}T00:00:00`)
    .lte('updated_at', `${dateRange.end}T23:59:59`)
    .is('deleted_at', null)

  if (error) {
    console.warn('[ReportGenerator] Team activity fetch failed:', error.message)
    return { members: [], totalTeamCompleted: 0, standupParticipationRate: null }
  }

  const countByUser = new Map<string, number>()
  for (const task of completedTasks ?? []) {
    if (!task.assignee_id) continue
    countByUser.set(task.assignee_id, (countByUser.get(task.assignee_id) ?? 0) + 1)
  }

  const userIds = Array.from(countByUser.keys())
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role, avatar_url')
    .in('id', userIds.length > 0 ? userIds : ['__none__'])

  const members: TeamMemberRow[] = (profiles ?? [])
    .map(p => ({
      id: p.id,
      name: p.full_name ?? 'Unknown',
      role: p.role,
      tasksCompleted: countByUser.get(p.id) ?? 0,
      avatarUrl: p.avatar_url,
    }))
    .sort((a, b) => b.tasksCompleted - a.tasksCompleted)

  return {
    members,
    totalTeamCompleted: completedTasks?.length ?? 0,
    standupParticipationRate: null,
  }
}

async function fetchBlockersData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  dateRange: { start: string; end: string }
): Promise<BlockersRisksSectionData> {
  const { data: standups, error } = await supabase
    .from('standups')
    .select('id, user_id, blockers, blocker_severity, needs_help, profiles!standups_user_id_fkey(full_name, role)')
    .eq('foundry_id', foundryId)
    .gte('standup_date', dateRange.start)
    .lte('standup_date', dateRange.end)
    .not('blockers', 'is', null)
    .not('blockers', 'eq', '')

  if (error) {
    console.warn('[ReportGenerator] Blockers fetch failed:', error.message)
  }

  const blockers: BlockerRow[] = (standups ?? []).map(s => {
    const profile = s.profiles as unknown as { full_name: string | null; role: string | null } | null
    return {
      id: s.id,
      reporterName: profile?.full_name ?? 'Unknown',
      reporterRole: profile?.role ?? null,
      description: s.blockers ?? '',
      severity: s.blocker_severity as BlockerRow['severity'],
      needsHelp: s.needs_help ?? false,
    }
  })

  // At-risk objectives
  const { data: objectives } = await supabase
    .from('objectives')
    .select('id, title, progress, end_date')
    .eq('foundry_id', foundryId)
    .eq('status', 'In Progress')
    .is('deleted_at', null)
    .not('end_date', 'is', null)

  const atRiskObjectives: AtRiskObjective[] = (objectives ?? [])
    .map(o => {
      const daysRemaining = Math.ceil((new Date(o.end_date!).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      return { id: o.id, title: o.title, progress: o.progress ?? 0, daysRemaining }
    })
    .filter(o => o.daysRemaining < 21 && o.progress < 70)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
    .slice(0, 5)

  return { blockers, atRiskObjectives }
}

async function fetchCompletionTrend(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  dateRange: { start: string; end: string }
): Promise<CompletionTrendSectionData> {
  const startDate = new Date(dateRange.start)
  const endDate = new Date(dateRange.end)
  const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

  const { data, error } = await supabase.rpc('get_completion_trend', {
    p_foundry_id: foundryId,
    p_days: Math.max(daysDiff, 7),
  })

  if (error) {
    console.warn('[ReportGenerator] Completion trend fetch failed:', error.message)
    return { dataPoints: [], periodLabel: '' }
  }

  const dataPoints = ((data as { date: string; completed: number; created: number }[]) ?? [])
    .filter(d => d.date >= dateRange.start && d.date <= dateRange.end)

  const formatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
  const periodLabel = `${formatter.format(startDate)} – ${formatter.format(endDate)}`

  return { dataPoints, periodLabel }
}

async function fetchWeekAheadData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string
): Promise<WeekAheadSectionData> {
  const today = new Date()
  const nextWeek = new Date(today)
  nextWeek.setDate(today.getDate() + 7)

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, title, end_date, assignee_id, objective_id, profiles!tasks_assignee_id_fkey(full_name), objectives!tasks_objective_id_fkey(title)')
    .eq('foundry_id', foundryId)
    .in('status', ['Pending', 'Accepted'])
    .is('deleted_at', null)
    .not('end_date', 'is', null)
    .gte('end_date', today.toISOString().split('T')[0])
    .lte('end_date', nextWeek.toISOString().split('T')[0])
    .order('end_date', { ascending: true })
    .limit(20)

  if (error) {
    console.warn('[ReportGenerator] Week ahead fetch failed:', error.message)
    return { tasks: [], totalDueNextWeek: 0 }
  }

  const upcomingTasks: UpcomingTask[] = (tasks ?? []).map(t => {
    const profile = t.profiles as unknown as { full_name: string | null } | null
    const objective = t.objectives as unknown as { title: string | null } | null
    return {
      id: t.id,
      title: t.title,
      assigneeName: profile?.full_name ?? null,
      dueDate: t.end_date!,
      priority: null,
      objectiveTitle: objective?.title ?? null,
    }
  })

  return { tasks: upcomingTasks, totalDueNextWeek: upcomingTasks.length }
}

// ========================
// Narrative Context Builder
// ========================

// INTENT: Assemble the NarrativeContext from already-fetched section data so
// the AI has real numbers to work with. This avoids a second round of DB calls.
function buildNarrativeContext(
  companyName: string,
  reportTitle: string,
  dateRange: { start: string; end: string },
  sectionDataMap: Map<ReportSectionType, SectionData>,
): NarrativeContext {
  const metricsSection = sectionDataMap.get('key-metrics')
  const metrics = metricsSection?.type === 'key-metrics'
    ? (metricsSection.data as KeyMetricsSectionData)
    : null

  const objectivesSection = sectionDataMap.get('objectives-progress')
  const objectives = objectivesSection?.type === 'objectives-progress'
    ? (objectivesSection.data as ObjectivesProgressSectionData)
    : null

  const teamSection = sectionDataMap.get('team-activity')
  const team = teamSection?.type === 'team-activity'
    ? (teamSection.data as TeamActivitySectionData)
    : null

  const blockersSection = sectionDataMap.get('blockers-risks')
  const blockers = blockersSection?.type === 'blockers-risks'
    ? (blockersSection.data as BlockersRisksSectionData)
    : null

  const completedMetric = metrics?.metrics.find(m => m.label === 'Tasks Completed')
  const createdMetric = metrics?.metrics.find(m => m.label === 'Tasks Created')

  return {
    companyName,
    reportTitle,
    dateRange,
    tasksCompleted: completedMetric?.value ?? 0,
    tasksCreated: createdMetric?.value ?? 0,
    previousPeriodCompleted: completedMetric?.previousValue ?? 0,
    topContributors: (team?.members ?? [])
      .filter(m => m.tasksCompleted > 0)
      .slice(0, 3)
      .map(m => ({ name: m.name, count: m.tasksCompleted })),
    atRiskObjectives: (blockers?.atRiskObjectives ?? [])
      .map(o => ({ title: o.title, progress: o.progress })),
    blockersCount: blockers?.blockers.length ?? 0,
    objectivesProgressing: objectives?.objectives.filter(
      o => o.health === 'on-track' || o.health === 'at-risk'
    ).length ?? 0,
    totalActiveObjectives: objectives?.totalActive ?? 0,
  }
}

// ========================
// Save Report Snapshot
// ========================

/**
 * Save a generated report to the report_snapshots table for history.
 *
 * @param document - The generated ReportDocument to persist
 * @returns Success flag and optional error message
 */
export async function saveReportSnapshot(
  document: ReportDocument
): Promise<{ success: boolean; snapshotId?: string; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // INTENT: Extract a summary from the executive summary section if present
    const summarySection = document.sections.find(s => s.type === 'executive-summary')
    const summaryText = summarySection?.type === 'executive-summary'
      ? (summarySection.data as ExecutiveSummarySectionData).narrative
      : `${document.title} for ${document.dateRange.start} to ${document.dateRange.end}`

    const { data: inserted, error } = await supabase.from('report_snapshots').insert({
      foundry_id: document.foundryId,
      profile_id: user.id,
      report_type: document.templateId,
      report_date: document.dateRange.end,
      report_data: document as unknown as Json,
      summary_text: summaryText,
      generated_at: document.generatedAt,
    }).select('id').single()

    if (error) {
      console.error('[ReportGenerator] Failed to save snapshot:', error)
      return { success: false, error: sanitizeErrorMessage(error) }
    }

    return { success: true, snapshotId: inserted?.id }
  } catch (error) {
    console.error('[ReportGenerator] Unexpected error saving snapshot:', error)
    return { success: false, error: sanitizeErrorMessage(error) }
  }
}
