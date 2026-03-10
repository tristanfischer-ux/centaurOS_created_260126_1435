/**
 * @file engineering.ts
 *
 * @description Fetches engineering/CAD Lab data for the report
 * engineering-activity section. Queries cad_lab_projects and
 * extracts module stats, review health, cost estimates, design
 * health, and process/material breakdowns from JSONB columns.
 *
 * GOTCHA: All JSONB columns are keyed by moduleId (Record<string, T>),
 * NOT arrays. reviews = Record<moduleId, SpecialistReview[]>,
 * ai_cost_estimates = Record<moduleId, AiCostEstimate>,
 * diagnostic_answers = Record<moduleId, Record<questionId, string>>.
 *
 * @related
 * - src/actions/report-generator.ts — Orchestrates this fetcher
 * - src/lib/reports/report-document-types.ts — EngineeringActivitySectionData
 */

import type { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.types'
import type {
  EngineeringActivitySectionData,
  RecentProject,
  ReviewSummary,
  CostSummary,
  ManufacturingFunnel,
  DesignHealth,
} from '@/lib/reports/report-document-types'

// ========================
// Type guards for JSONB
// ========================

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v)
}

// INTENT: confidence is stored as "low"/"medium"/"high" string enum, not a number.
// Map to numeric 0-1 scale for averaging.
const CONFIDENCE_MAP: Record<string, number> = {
  low: 0.3,
  medium: 0.6,
  high: 0.9,
}

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
    { data: manufacturingOrders },
  ] = await Promise.all([
    // All active projects (not archived) — expanded select for deep analysis
    supabase
      .from('cad_lab_projects')
      .select('id, name, stage, status, modules, created_at, reviews, ai_cost_estimates, diagnostic_answers, design_revision, images_generated_at_revision')
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
    // Manufacturing orders for funnel counting
    supabase
      .from('manufacturing_orders')
      .select('id, cad_lab_project_id')
      .eq('foundry_id', foundryId),
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

  // ========================
  // Deep Forge Analytics
  // ========================

  const reviewSummary = computeReviewSummary(projects)
  const costSummary = computeCostSummary(projects)
  const manufacturingFunnel = computeManufacturingFunnel(projects, manufacturingOrders ?? [])
  const designHealth = computeDesignHealth(projects)
  const { processBreakdown, materialBreakdown } = computeDiagnosticBreakdowns(projects)

  return {
    totalActive: projects.filter(p => p.status !== 'completed').length,
    createdThisPeriod: createdThisPeriod?.length ?? 0,
    completedThisPeriod: completedThisPeriod?.length ?? 0,
    byStage,
    byStatus,
    totalModulesGenerated,
    recentProjects,
    reviewSummary,
    costSummary,
    manufacturingFunnel,
    designHealth,
    processBreakdown,
    materialBreakdown,
  }
}

// ========================
// JSONB Computation Helpers
// ========================

/**
 * Parse the `reviews` JSONB column across all projects.
 *
 * GOTCHA: reviews is Record<moduleId, SpecialistReview[]>, NOT a flat array.
 * Each SpecialistReview has verdict: "pass"/"warn"/"fail" (not approved/rejected).
 * Issues are objects { severity, category, message }, not strings.
 */
function computeReviewSummary(
  projects: { id: string; reviews: Json | null }[],
): ReviewSummary | undefined {
  try {
    const totalProjects = projects.length
    if (totalProjects === 0) return undefined

    const verdicts = { approved: 0, conditional: 0, rejected: 0, pending: 0 }
    let totalReviewed = 0
    const issueFrequency = new Map<string, number>()

    for (const p of projects) {
      if (!p.reviews || !isRecord(p.reviews)) {
        verdicts.pending++
        continue
      }

      // reviews is Record<moduleId, SpecialistReview[]>
      const moduleReviewArrays = Object.values(p.reviews)
      if (moduleReviewArrays.length === 0) {
        verdicts.pending++
        continue
      }

      totalReviewed++

      // Aggregate verdicts across all modules for this project.
      // Project-level verdict = worst verdict across modules (fail > warn > pass).
      let projectWorstVerdict: 'pass' | 'warn' | 'fail' = 'pass'

      for (const moduleReviews of moduleReviewArrays) {
        if (!Array.isArray(moduleReviews)) continue

        for (const review of moduleReviews) {
          if (!isRecord(review)) continue

          const verdict = isString(review.verdict) ? review.verdict.toLowerCase() : ''
          if (verdict === 'fail') projectWorstVerdict = 'fail'
          else if (verdict === 'warn' && projectWorstVerdict !== 'fail') projectWorstVerdict = 'warn'

          // Collect issues — issues are objects with { severity, category, message }
          if (Array.isArray(review.issues)) {
            for (const issue of review.issues) {
              if (isRecord(issue) && isString(issue.message)) {
                const normalized = issue.message.slice(0, 80).trim()
                if (normalized) {
                  issueFrequency.set(normalized, (issueFrequency.get(normalized) ?? 0) + 1)
                }
              }
            }
          }
        }
      }

      // Map pass/warn/fail → approved/conditional/rejected
      if (projectWorstVerdict === 'pass') verdicts.approved++
      else if (projectWorstVerdict === 'warn') verdicts.conditional++
      else verdicts.rejected++
    }

    const topIssues = Array.from(issueFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([issue]) => issue)

    return { totalReviewed, totalProjects, verdicts, topIssues }
  } catch {
    return undefined
  }
}

/**
 * Parse `ai_cost_estimates` JSONB across all projects.
 *
 * GOTCHA: ai_cost_estimates is Record<moduleId, AiCostEstimate>, NOT an array.
 * confidence is "low"/"medium"/"high" string, NOT a number.
 * buy/make is per-part in parts[] array, NOT a top-level recommendation.
 */
function computeCostSummary(
  projects: { id: string; ai_cost_estimates: Json | null }[],
): CostSummary | undefined {
  try {
    let totalCost = 0
    let totalConfidence = 0
    let confidenceCount = 0
    let projectsWithEstimates = 0
    let buyCount = 0
    let makeCount = 0

    for (const p of projects) {
      if (!p.ai_cost_estimates || !isRecord(p.ai_cost_estimates)) continue

      // ai_cost_estimates is Record<moduleId, AiCostEstimate>
      const moduleEstimates = Object.values(p.ai_cost_estimates)
      if (moduleEstimates.length === 0) continue

      let projectHasEstimate = false

      for (const est of moduleEstimates) {
        if (!isRecord(est)) continue

        const perUnit = isNumber(est.totalPerUnit) ? est.totalPerUnit : null
        if (perUnit === null) continue

        projectHasEstimate = true
        totalCost += perUnit

        // confidence is a string enum "low"/"medium"/"high"
        if (isString(est.confidence)) {
          const numericConfidence = CONFIDENCE_MAP[est.confidence.toLowerCase()]
          if (numericConfidence !== undefined) {
            totalConfidence += numericConfidence
            confidenceCount++
          }
        }

        // buy/make classification from parts[] array
        if (Array.isArray(est.parts)) {
          for (const part of est.parts) {
            if (isRecord(part) && isString(part.type)) {
              if (part.type === 'buy') buyCount++
              else if (part.type === 'make') makeCount++
            }
          }
        }
      }

      if (projectHasEstimate) projectsWithEstimates++
    }

    if (projectsWithEstimates === 0) return undefined

    return {
      totalEstimatedCost: Math.round(totalCost * 100) / 100,
      averageCostPerUnit: Math.round((totalCost / projectsWithEstimates) * 100) / 100,
      averageConfidence: confidenceCount > 0 ? Math.round((totalConfidence / confidenceCount) * 100) / 100 : 0,
      projectsWithEstimates,
      buyVsMake: { buy: buyCount, make: makeCount },
    }
  } catch {
    return undefined
  }
}

/**
 * Count projects at each stage of the design-to-manufacture funnel.
 */
function computeManufacturingFunnel(
  projects: { id: string; modules: Json | null; reviews: Json | null; ai_cost_estimates: Json | null }[],
  orders: { id: string; cad_lab_project_id: string | null }[],
): ManufacturingFunnel | undefined {
  try {
    if (projects.length === 0) return undefined

    const orderProjectIds = new Set(
      orders.filter(o => o.cad_lab_project_id).map(o => o.cad_lab_project_id!)
    )

    let designed = 0
    let reviewed = 0
    let costed = 0
    let ordered = 0

    for (const p of projects) {
      const hasModules = Array.isArray(p.modules) && p.modules.length > 0
      if (hasModules) designed++

      // reviews is Record<moduleId, SpecialistReview[]>
      const hasReviews = p.reviews != null && isRecord(p.reviews) && Object.keys(p.reviews).length > 0
      if (hasReviews) reviewed++

      // ai_cost_estimates is Record<moduleId, AiCostEstimate>
      const hasCosts = p.ai_cost_estimates != null && isRecord(p.ai_cost_estimates) && Object.keys(p.ai_cost_estimates).length > 0
      if (hasCosts) costed++

      if (orderProjectIds.has(p.id)) ordered++
    }

    return { designed, reviewed, costed, ordered }
  } catch {
    return undefined
  }
}

/**
 * Compute design iteration health metrics.
 */
function computeDesignHealth(
  projects: { id: string; modules: Json | null; design_revision: number; images_generated_at_revision: number }[],
): DesignHealth | undefined {
  try {
    if (projects.length === 0) return undefined

    let totalRevisions = 0
    let staleCount = 0
    let totalModules = 0

    for (const p of projects) {
      totalRevisions += p.design_revision
      if (p.images_generated_at_revision < p.design_revision) staleCount++
      if (Array.isArray(p.modules)) totalModules += p.modules.length
    }

    return {
      averageRevisions: Math.round((totalRevisions / projects.length) * 10) / 10,
      projectsWithStaleImages: staleCount,
      totalModulesAcrossProjects: totalModules,
    }
  } catch {
    return undefined
  }
}

/**
 * Parse `diagnostic_answers` JSONB to extract process and material distributions.
 *
 * GOTCHA: diagnostic_answers is Record<moduleId, Record<questionId, string>>.
 * Question IDs are "mfg_process" (not "primaryProcess") and "material" (not "primaryMaterial").
 */
function computeDiagnosticBreakdowns(
  projects: { id: string; diagnostic_answers: Json | null }[],
): {
  processBreakdown?: { process: string; count: number }[]
  materialBreakdown?: { material: string; count: number }[]
} {
  try {
    const processCounts = new Map<string, number>()
    const materialCounts = new Map<string, number>()

    for (const p of projects) {
      if (!p.diagnostic_answers || !isRecord(p.diagnostic_answers)) continue

      // diagnostic_answers is Record<moduleId, Record<questionId, string>>
      for (const moduleAnswers of Object.values(p.diagnostic_answers)) {
        if (!isRecord(moduleAnswers)) continue

        const process = isString(moduleAnswers.mfg_process) ? moduleAnswers.mfg_process.trim() : null
        const material = isString(moduleAnswers.material) ? moduleAnswers.material.trim() : null

        if (process) processCounts.set(process, (processCounts.get(process) ?? 0) + 1)
        if (material) materialCounts.set(material, (materialCounts.get(material) ?? 0) + 1)
      }
    }

    const processBreakdown = processCounts.size > 0
      ? Array.from(processCounts.entries())
          .map(([process, count]) => ({ process, count }))
          .sort((a, b) => b.count - a.count)
      : undefined

    const materialBreakdown = materialCounts.size > 0
      ? Array.from(materialCounts.entries())
          .map(([material, count]) => ({ material, count }))
          .sort((a, b) => b.count - a.count)
      : undefined

    return { processBreakdown, materialBreakdown }
  } catch {
    return {}
  }
}
