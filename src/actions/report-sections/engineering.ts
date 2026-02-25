/**
 * @file engineering.ts
 *
 * @description Fetches engineering/CAD Lab data for the report
 * engineering-activity section. Queries cad_lab_projects and
 * extracts module stats from the JSONB modules column.
 *
 * @related
 * - src/actions/report-generator.ts — Orchestrates this fetcher
 * - src/lib/reports/report-document-types.ts — EngineeringActivitySectionData
 */

import type { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.types'
import type { EngineeringActivitySectionData, RecentProject } from '@/lib/reports/report-document-types'

/**
 * Fetch engineering activity data for a reporting period.
 *
 * @param supabase - Authenticated Supabase client
 * @param foundryId - Foundry to scope queries to
 * @param dateRange - Period start and end dates (ISO strings)
 * @returns Engineering activity section data
 */
export async function fetchEngineeringActivityData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  dateRange: { start: string; end: string },
): Promise<EngineeringActivitySectionData> {
  const [
    { data: allProjects },
    { data: createdThisPeriod },
    { data: completedThisPeriod },
  ] = await Promise.all([
    // All active projects (not completed/archived)
    supabase
      .from('cad_lab_projects')
      .select('id, name, stage, status, modules, created_at')
      .eq('foundry_id', foundryId)
      .not('status', 'eq', 'archived'),
    // Projects created this period
    supabase
      .from('cad_lab_projects')
      .select('id')
      .eq('foundry_id', foundryId)
      .gte('created_at', `${dateRange.start}T00:00:00`)
      .lte('created_at', `${dateRange.end}T23:59:59`),
    // Projects completed this period
    supabase
      .from('cad_lab_projects')
      .select('id')
      .eq('foundry_id', foundryId)
      .eq('status', 'completed')
      .gte('updated_at', `${dateRange.start}T00:00:00`)
      .lte('updated_at', `${dateRange.end}T23:59:59`),
  ])

  const projects = allProjects ?? []

  // By stage
  const stageCounts = new Map<string, number>()
  for (const p of projects) {
    stageCounts.set(p.stage, (stageCounts.get(p.stage) ?? 0) + 1)
  }
  const byStage = Array.from(stageCounts.entries())
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count)

  // By status
  const statusCounts = new Map<string, number>()
  for (const p of projects) {
    statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1)
  }
  const byStatus = Array.from(statusCounts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count)

  // INTENT: Count total modules generated across all projects.
  // The modules column is JSONB — typically an array of module objects.
  let totalModulesGenerated = 0
  for (const p of projects) {
    if (Array.isArray(p.modules)) {
      totalModulesGenerated += (p.modules as Json[]).length
    }
  }

  // Recent projects (most recently created, limited to 5)
  const recentProjects: RecentProject[] = projects
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map(p => ({
      id: p.id,
      name: p.name,
      stage: p.stage,
      status: p.status,
      createdAt: p.created_at,
    }))

  return {
    totalActive: projects.filter(p => p.status !== 'completed').length,
    createdThisPeriod: createdThisPeriod?.length ?? 0,
    completedThisPeriod: completedThisPeriod?.length ?? 0,
    byStage,
    byStatus,
    totalModulesGenerated,
    recentProjects,
  }
}
