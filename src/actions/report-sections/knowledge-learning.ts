/**
 * @file knowledge-learning.ts
 *
 * @description Fetches knowledge vault and apprenticeship data for the report
 * knowledge-learning section. No RPC needed — tables are small enough for
 * direct queries.
 *
 * @related
 * - src/actions/report-generator.ts — Orchestrates this fetcher
 * - src/lib/reports/report-document-types.ts — KnowledgeLearningSectionData
 */

import type { createClient } from '@/lib/supabase/server'
import type { KnowledgeLearningSectionData } from '@/lib/reports/report-document-types'

/**
 * Fetch knowledge vault and apprenticeship data for a reporting period.
 *
 * @param supabase - Authenticated Supabase client
 * @param foundryId - Foundry to scope queries to
 * @param dateRange - Period start and end dates (ISO strings)
 * @returns Knowledge & learning section data
 */
export async function fetchKnowledgeLearningData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  dateRange: { start: string; end: string },
): Promise<KnowledgeLearningSectionData> {
  const [
    { count: totalNotes },
    { data: periodNotes },
    { count: verifiedCount },
    { data: enrollments },
    { data: moduleCompletions },
    { data: otjtLogs },
    { data: reviewsDue },
  ] = await Promise.all([
    // Total knowledge notes
    supabase
      .from('knowledge_notes')
      .select('*', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .eq('is_archived', false),
    // Notes added this period (with domain and type for breakdown)
    supabase
      .from('knowledge_notes')
      .select('id, note_type, domain_id, knowledge_domains!knowledge_notes_domain_id_fkey(name)')
      .eq('foundry_id', foundryId)
      .eq('is_archived', false)
      .gte('created_at', `${dateRange.start}T00:00:00`)
      .lte('created_at', `${dateRange.end}T23:59:59`),
    // Verified notes
    supabase
      .from('knowledge_notes')
      .select('*', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .eq('is_verified', true)
      .eq('is_archived', false),
    // Active apprenticeship enrollments
    supabase
      .from('apprenticeship_enrollments')
      .select('id, otjt_hours_logged, otjt_hours_target')
      .eq('foundry_id', foundryId)
      .eq('status', 'active'),
    // Module completions this period
    supabase
      .from('module_completions')
      .select('id, enrollment_id, status')
      .eq('status', 'completed')
      .gte('completed_at', `${dateRange.start}T00:00:00`)
      .lte('completed_at', `${dateRange.end}T23:59:59`),
    // OTJ training hours logged this period
    supabase
      .from('otjt_time_logs')
      .select('hours, enrollment_id')
      .gte('log_date', dateRange.start)
      .lte('log_date', dateRange.end),
    // Progress reviews due (scheduled but not completed)
    supabase
      .from('progress_reviews')
      .select('id')
      .is('completed_date', null)
      .not('scheduled_date', 'is', null)
      .lte('scheduled_date', dateRange.end),
  ])

  // Knowledge: top domains
  const domainCounts = new Map<string, number>()
  for (const note of periodNotes ?? []) {
    const domain = note.knowledge_domains as unknown as { name: string } | null
    const domainName = domain?.name ?? 'Uncategorised'
    domainCounts.set(domainName, (domainCounts.get(domainName) ?? 0) + 1)
  }
  const topDomains = Array.from(domainCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Knowledge: by type
  const typeCounts = new Map<string, number>()
  for (const note of periodNotes ?? []) {
    typeCounts.set(note.note_type, (typeCounts.get(note.note_type) ?? 0) + 1)
  }
  const byType = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)

  // Apprenticeships: filter module completions and OTJ logs to active enrollments
  const activeEnrollmentIds = new Set((enrollments ?? []).map(e => e.id))

  const relevantModuleCompletions = (moduleCompletions ?? []).filter(
    mc => activeEnrollmentIds.has(mc.enrollment_id)
  )

  const otjtHoursLogged = (otjtLogs ?? [])
    .filter(l => activeEnrollmentIds.has(l.enrollment_id))
    .reduce((sum, l) => sum + (l.hours ?? 0), 0)

  // Average progress: otjt_hours_logged / otjt_hours_target across enrollments
  const activeEnrollmentList = enrollments ?? []
  const averageProgress = activeEnrollmentList.length > 0
    ? Math.round(
      activeEnrollmentList.reduce((sum, e) => {
        const target = e.otjt_hours_target ?? 1
        const logged = e.otjt_hours_logged ?? 0
        return sum + Math.min(100, (logged / target) * 100)
      }, 0) / activeEnrollmentList.length
    )
    : 0

  return {
    knowledge: {
      totalNotes: totalNotes ?? 0,
      addedThisPeriod: periodNotes?.length ?? 0,
      topDomains,
      byType,
      verifiedCount: verifiedCount ?? 0,
    },
    apprenticeships: {
      activeEnrollments: activeEnrollmentList.length,
      modulesCompleted: relevantModuleCompletions.length,
      otjtHoursLogged: Math.round(otjtHoursLogged * 10) / 10,
      reviewsDue: reviewsDue?.length ?? 0,
      averageProgress,
    },
  }
}
