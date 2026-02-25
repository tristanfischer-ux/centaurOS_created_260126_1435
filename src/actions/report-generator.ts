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
import { generateExecutiveNarrative, generateSectionNarrative } from '@/lib/reports/ai-narrative'
import { fetchFinancialSnapshotData } from '@/actions/report-sections/financial'
import { fetchSalesPipelineData } from '@/actions/report-sections/sales-pipeline'
import { fetchEngineeringActivityData } from '@/actions/report-sections/engineering'
import { fetchKnowledgeLearningData } from '@/actions/report-sections/knowledge-learning'
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
  FinancialSnapshotSectionData,
  SalesPipelineSectionData,
  EngineeringActivitySectionData,
  KnowledgeLearningSectionData,
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
      .select('name, logo_url, report_primary_color, report_accent_color')
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

    if (requestedSections.includes('financial-snapshot')) {
      fetchPromises.push(
        fetchFinancialSnapshotData(supabase, foundryId, dateRange).then(data => {
          sectionDataMap.set('financial-snapshot', { type: 'financial-snapshot', data })
        })
      )
    }

    if (requestedSections.includes('sales-pipeline')) {
      fetchPromises.push(
        fetchSalesPipelineData(supabase, foundryId, dateRange).then(data => {
          sectionDataMap.set('sales-pipeline', { type: 'sales-pipeline', data })
        })
      )
    }

    if (requestedSections.includes('engineering-activity')) {
      fetchPromises.push(
        fetchEngineeringActivityData(supabase, foundryId, dateRange).then(data => {
          sectionDataMap.set('engineering-activity', { type: 'engineering-activity', data })
        })
      )
    }

    if (requestedSections.includes('knowledge-learning')) {
      fetchPromises.push(
        fetchKnowledgeLearningData(supabase, foundryId, dateRange).then(data => {
          sectionDataMap.set('knowledge-learning', { type: 'knowledge-learning', data })
        })
      )
    }

    await Promise.all(fetchPromises)

    // INTENT: After all data is fetched, enhance the executive summary with
    // an AI-generated narrative via Gemini. The raw metrics are passed as
    // context so the narrative is grounded in real data, not hallucinated.
    const narrativeOpts: NarrativeOptions = {
      tone: tone ?? 'internal',
      detailLevel: detailLevel ?? 'standard',
    }

    if (requestedSections.includes('executive-summary')) {
      const narrativeContext = buildNarrativeContext(
        foundryName,
        templateId === 'board-pack' ? 'Board Pack' : 'Weekly Update',
        dateRange,
        sectionDataMap,
      )

      try {
        const aiResult = await generateExecutiveNarrative(narrativeContext, narrativeOpts)
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

    // INTENT: Generate AI section narratives for all non-cover/non-executive-summary
    // sections in parallel. Each call is wrapped in .catch() so failures are silent —
    // sections render as before if the AI call fails.
    const narrativeSectionTypes: ReportSectionType[] = [
      'key-metrics', 'objectives-progress', 'team-activity',
      'blockers-risks', 'completion-trend', 'week-ahead',
      'financial-snapshot', 'sales-pipeline', 'engineering-activity', 'knowledge-learning',
    ]

    await Promise.all(
      narrativeSectionTypes
        .filter(sType => sectionDataMap.has(sType))
        .map(async (sType) => {
          const section = sectionDataMap.get(sType)!
          const narrative = await generateSectionNarrative(
            sType,
            section.data as unknown as Record<string, unknown>,
            narrativeOpts,
          ).catch(() => undefined)

          if (narrative) {
            const updatedData = { ...section.data, sectionNarrative: narrative }
            sectionDataMap.set(sType, { ...section, data: updatedData } as SectionData)
          }
        })
    )

    // INTENT: Build a dynamic title that reflects the actual content of the
    // report, rather than a generic "Weekly Update" / "Board Pack".
    const dynamicTitle = buildDynamicTitle(templateId, sectionDataMap)

    // Update cover data with the dynamic title now that we have all the data
    if (sectionDataMap.has('cover')) {
      const coverSection = sectionDataMap.get('cover')!
      const coverData = coverSection.data as CoverSectionData
      sectionDataMap.set('cover', {
        ...coverSection,
        data: { ...coverData, reportTitle: dynamicTitle },
      } as SectionData)
    }

    // Re-assemble in case cover was updated
    const finalSections: SectionData[] = requestedSections
      .filter(type => sectionDataMap.has(type))
      .map(type => sectionDataMap.get(type)!)

    const document: ReportDocument = {
      id: uuidv4(),
      templateId,
      title: dynamicTitle,
      dateRange,
      generatedAt: new Date().toISOString(),
      foundryId,
      foundryName,
      sections: finalSections,
      branding: {
        logoUrl: foundry?.logo_url ?? null,
        primaryColor: foundry?.report_primary_color ?? null,
        accentColor: foundry?.report_accent_color ?? null,
      },
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

  // INTENT: Fetch overdue tasks and compute on-time completion rate as extra KPIs.
  // Overdue = past end_date and not completed. On-time = completed within period
  // that had an end_date on or after completion.
  const [{ count: overdueCount }, { data: periodTasks }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .is('deleted_at', null)
      .in('status', ['Pending', 'Accepted'])
      .not('end_date', 'is', null)
      .lt('end_date', new Date().toISOString().split('T')[0]),
    supabase
      .from('tasks')
      .select('status, end_date, updated_at')
      .eq('foundry_id', foundryId)
      .eq('status', 'Completed')
      .is('deleted_at', null)
      .not('end_date', 'is', null)
      .gte('updated_at', `${dateRange.start}T00:00:00`)
      .lte('updated_at', `${dateRange.end}T23:59:59`),
  ])

  const overdueTasks = overdueCount ?? 0
  const completedWithDeadline = periodTasks ?? []
  const onTimeCount = completedWithDeadline.filter(t =>
    t.end_date && t.updated_at && t.updated_at.split('T')[0] <= t.end_date
  ).length
  const onTimeRate = completedWithDeadline.length > 0
    ? Math.round((onTimeCount / completedWithDeadline.length) * 100)
    : null

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
  ]

  // Only show velocity when there's actual task creation data to compare against
  if (rollup.stats.tasks_created > 0) {
    kpiMetrics.push({
      label: 'Velocity',
      value: velocity,
      previousValue: 100,
      format: 'percentage',
      trend: 'stable',
      changePercent: 0,
    })
  }

  kpiMetrics.push(
    {
      label: 'Blockers Reported',
      value: rollup.stats.blockers_reported,
      previousValue: 0,
      format: 'number',
      trend: rollup.stats.blockers_reported > 3 ? 'down' : 'stable',
      changePercent: 0,
    },
    {
      label: 'Overdue Tasks',
      value: overdueTasks,
      previousValue: 0,
      format: 'number',
      trend: overdueTasks > 0 ? 'down' : 'stable',
      changePercent: 0,
    },
  )

  // Only show on-time rate when there are completed tasks with deadlines
  if (onTimeRate !== null) {
    kpiMetrics.push({
      label: 'On-Time Rate',
      value: onTimeRate,
      previousValue: onTimeRate,
      format: 'percentage',
      trend: onTimeRate >= 90 ? 'up' : onTimeRate >= 70 ? 'stable' : 'down',
      changePercent: 0,
    })
  }

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
  dateRange: { start: string; end: string }
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

  // Get task counts per objective, period-completed tasks, and completed objectives count
  // in parallel for performance
  const objectiveIds = (objectives ?? []).map(o => o.id)
  const safeObjectiveIds = objectiveIds.length > 0 ? objectiveIds : ['__none__']

  const [{ data: taskCounts }, { data: periodCompletedTasks }, { count: completedCount }] = await Promise.all([
    supabase
      .from('tasks')
      .select('objective_id, status')
      .in('objective_id', safeObjectiveIds)
      .is('deleted_at', null)
      .limit(5000),
    supabase
      .from('tasks')
      .select('objective_id')
      .in('objective_id', safeObjectiveIds)
      .eq('status', 'Completed')
      .is('deleted_at', null)
      .gte('updated_at', `${dateRange.start}T00:00:00`)
      .lte('updated_at', `${dateRange.end}T23:59:59`),
    supabase
      .from('objectives')
      .select('*', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .eq('status', 'Completed')
      .is('deleted_at', null),
  ])

  const taskCountMap = new Map<string, { completed: number; total: number }>()
  for (const task of taskCounts ?? []) {
    if (!task.objective_id) continue
    const existing = taskCountMap.get(task.objective_id) ?? { completed: 0, total: 0 }
    existing.total++
    if (task.status === 'Completed') existing.completed++
    taskCountMap.set(task.objective_id, existing)
  }

  const periodCompletedByObjective = new Map<string, number>()
  for (const t of periodCompletedTasks ?? []) {
    if (!t.objective_id) continue
    periodCompletedByObjective.set(t.objective_id, (periodCompletedByObjective.get(t.objective_id) ?? 0) + 1)
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

    // Approximate progress delta: if the objective has tasks, each completed
    // task in-period represents roughly (100 / totalTasks) progress points.
    const periodCompleted = periodCompletedByObjective.get(o.id) ?? 0
    const progressDelta = counts.total > 0
      ? Math.round((periodCompleted / counts.total) * 100)
      : 0

    return {
      id: o.id,
      title: o.title,
      progress: o.progress ?? 0,
      status: o.status ?? 'Not Started',
      health,
      tasksCompleted: counts.completed,
      tasksRemaining: remaining,
      endDate: o.end_date,
      progressDelta: progressDelta > 0 ? progressDelta : undefined,
    }
  })

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

  // INTENT: Compute standup participation rate. Count distinct users who
  // submitted standups in the period, divided by total active team members,
  // adjusted for working days.
  const [{ count: standupCount }, { count: teamMemberCount }] = await Promise.all([
    supabase
      .from('standups')
      .select('*', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .gte('standup_date', dateRange.start)
      .lte('standup_date', dateRange.end),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('foundry_id', foundryId),
  ])

  const totalMembers = teamMemberCount ?? 1
  const startDate = new Date(dateRange.start)
  const endDate = new Date(dateRange.end)
  const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  // Approximate working days (exclude weekends)
  const workingDays = Math.max(1, Math.round(daysDiff * (5 / 7)))
  const expectedStandups = totalMembers * workingDays
  const participationRate = expectedStandups > 0
    ? Math.min(100, Math.round(((standupCount ?? 0) / expectedStandups) * 100))
    : null

  return {
    members,
    totalTeamCompleted: completedTasks?.length ?? 0,
    standupParticipationRate: participationRate,
  }
}

async function fetchBlockersData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  dateRange: { start: string; end: string }
): Promise<BlockersRisksSectionData> {
  const { data: standups, error } = await supabase
    .from('standups')
    .select('id, user_id, standup_date, blockers, blocker_severity, needs_help, profiles!standups_user_id_fkey(full_name, role)')
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
    const reportedDate = (s as Record<string, unknown>).standup_date as string | undefined
    const ageInDays = reportedDate
      ? Math.floor((Date.now() - new Date(reportedDate).getTime()) / (1000 * 60 * 60 * 24))
      : undefined

    return {
      id: s.id,
      reporterName: profile?.full_name ?? 'Unknown',
      reporterRole: profile?.role ?? null,
      description: s.blockers ?? '',
      severity: s.blocker_severity as BlockerRow['severity'],
      needsHelp: s.needs_help ?? false,
      reportedDate,
      ageInDays,
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

  // Run detail query (limited to 20) and count query (unlimited) in parallel
  const [{ data: tasks, error }, { count: totalCount, error: countError }] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, end_date, risk_level, assignee_id, objective_id, profiles!tasks_assignee_id_fkey(full_name), objectives!tasks_objective_id_fkey(title)')
      .eq('foundry_id', foundryId)
      .in('status', ['Pending', 'Accepted'])
      .is('deleted_at', null)
      .not('end_date', 'is', null)
      .gte('end_date', today.toISOString().split('T')[0])
      .lte('end_date', nextWeek.toISOString().split('T')[0])
      .order('end_date', { ascending: true })
      .limit(20),
    supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .in('status', ['Pending', 'Accepted'])
      .is('deleted_at', null)
      .not('end_date', 'is', null)
      .gte('end_date', today.toISOString().split('T')[0])
      .lte('end_date', nextWeek.toISOString().split('T')[0]),
  ])

  if (error) {
    console.warn('[ReportGenerator] Week ahead fetch failed:', error.message)
    return { tasks: [], totalDueNextWeek: 0 }
  }

  if (countError) {
    console.warn('[ReportGenerator] Week ahead count query failed:', countError.message)
  }

  const upcomingTasks: UpcomingTask[] = (tasks ?? []).map(t => {
    const profile = t.profiles as unknown as { full_name: string | null } | null
    const objective = t.objectives as unknown as { title: string | null } | null
    return {
      id: t.id,
      title: t.title,
      assigneeName: profile?.full_name ?? null,
      dueDate: t.end_date!,
      priority: (t as Record<string, unknown>).risk_level as string | null ?? null,
      objectiveTitle: objective?.title ?? null,
    }
  })

  return { tasks: upcomingTasks, totalDueNextWeek: totalCount ?? upcomingTasks.length }
}

// ========================
// Dynamic Title Builder
// ========================

// INTENT: Create a content-aware title that reflects the actual data in the
// report. Reads metrics and blockers to construct titles like
// "Weekly Update: Strong Sprint, 2 Blockers Need Attention".
function buildDynamicTitle(
  templateId: string,
  sectionDataMap: Map<ReportSectionType, SectionData>,
): string {
  const baseTitle = templateId === 'board-pack' ? 'Board Pack' : 'Weekly Update'

  const metricsSection = sectionDataMap.get('key-metrics')
  const metrics = metricsSection?.type === 'key-metrics'
    ? (metricsSection.data as KeyMetricsSectionData)
    : null

  const blockersSection = sectionDataMap.get('blockers-risks')
  const blockers = blockersSection?.type === 'blockers-risks'
    ? (blockersSection.data as BlockersRisksSectionData)
    : null

  const financialSection = sectionDataMap.get('financial-snapshot')
  const financial = financialSection?.type === 'financial-snapshot'
    ? (financialSection.data as FinancialSnapshotSectionData)
    : null

  const pipelineSection = sectionDataMap.get('sales-pipeline')
  const pipeline = pipelineSection?.type === 'sales-pipeline'
    ? (pipelineSection.data as SalesPipelineSectionData)
    : null

  const completedMetric = metrics?.metrics.find(m => m.label === 'Tasks Completed')
  const blockerCount = blockers?.blockers.length ?? 0
  const criticalBlockers = blockers?.blockers.filter(b => b.severity === 'critical').length ?? 0

  const fragments: string[] = []

  // Financial signals (highest priority for board packs)
  if (financial) {
    const revenueGrowth = financial.previousPeriodRevenue > 0
      ? ((financial.periodRevenue - financial.previousPeriodRevenue) / financial.previousPeriodRevenue) * 100
      : 0
    if (revenueGrowth > 10) {
      fragments.push('Strong Revenue Week')
    } else if (financial.netPosition < 0) {
      fragments.push('Cash Position Needs Review')
    } else if (financial.overBudgetCount > 0) {
      fragments.push(`${financial.overBudgetCount} Budget${financial.overBudgetCount > 1 ? 's' : ''} Over`)
    }
  }

  // Pipeline signals
  if (pipeline && pipeline.rfqs.responsesReceived > 0) {
    fragments.push(`${pipeline.rfqs.responsesReceived} Pipeline Response${pipeline.rfqs.responsesReceived > 1 ? 's' : ''}`)
  }

  // Completion momentum
  if (completedMetric) {
    if (completedMetric.trend === 'up' && completedMetric.changePercent > 10) {
      fragments.push('Strong Sprint')
    } else if (completedMetric.trend === 'down' && completedMetric.changePercent < -10) {
      fragments.push('Slower Week')
    } else if (completedMetric.value > 0 && fragments.length === 0) {
      fragments.push(`${completedMetric.value} Tasks Shipped`)
    }
  }

  // Blocker awareness
  if (criticalBlockers > 0) {
    fragments.push(`${criticalBlockers} Critical Blocker${criticalBlockers > 1 ? 's' : ''}`)
  } else if (blockerCount > 0) {
    fragments.push(`${blockerCount} Blocker${blockerCount > 1 ? 's' : ''} Need Attention`)
  }

  // INTENT: Keep title concise — max 2 fragments
  const selected = fragments.slice(0, 2)
  if (selected.length === 0) return baseTitle
  return `${baseTitle}: ${selected.join(', ')}`
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

  // INTENT: Pull cross-cutting data from new sections for richer executive narratives
  const financialSection = sectionDataMap.get('financial-snapshot')
  const financial = financialSection?.type === 'financial-snapshot'
    ? (financialSection.data as FinancialSnapshotSectionData)
    : null

  const pipelineSection = sectionDataMap.get('sales-pipeline')
  const pipeline = pipelineSection?.type === 'sales-pipeline'
    ? (pipelineSection.data as SalesPipelineSectionData)
    : null

  const engineeringSection = sectionDataMap.get('engineering-activity')
  const engineering = engineeringSection?.type === 'engineering-activity'
    ? (engineeringSection.data as EngineeringActivitySectionData)
    : null

  const knowledgeSection = sectionDataMap.get('knowledge-learning')
  const knowledge = knowledgeSection?.type === 'knowledge-learning'
    ? (knowledgeSection.data as KnowledgeLearningSectionData)
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
    overdueTaskCount: metrics?.metrics.find(m => m.label === 'Overdue Tasks')?.value,
    standupParticipationRate: team?.standupParticipationRate ?? undefined,
    objectivesCompleted: objectives?.totalCompleted,
    // Cross-cutting business context
    periodRevenue: financial?.periodRevenue,
    periodExpenses: financial?.periodExpenses,
    previousPeriodRevenue: financial?.previousPeriodRevenue,
    pipelineReplies: pipeline?.outreach.repliesReceived,
    pipelineRFQsAwarded: pipeline?.rfqs.awarded,
    cadProjectsCompleted: engineering?.completedThisPeriod,
    knowledgeNotesAdded: knowledge?.knowledge.addedThisPeriod,
    overBudgetCategories: financial?.overBudgetCount,
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
