/**
 * @file workshop.ts
 *
 * @description Fetches data for the 4 CAD Lab workshop report sections:
 * Design, Specify, Source, and Assemble. Each fetcher follows the same
 * pattern as engineering.ts — takes an authenticated Supabase client,
 * foundryId, and dateRange, returns a typed DTO.
 *
 * GOTCHA: All JSONB columns are keyed by moduleId (Record<string, T>),
 * NOT arrays. See engineering.ts for the full JSONB documentation.
 *
 * @related
 * - src/actions/report-sections/engineering.ts — Shared JSONB parsing pattern
 * - src/actions/report-generator.ts — Orchestrates these fetchers
 * - src/lib/reports/report-document-types.ts — Type definitions
 */

import type { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.types'
import type {
  WorkshopDesignSectionData,
  WorkshopDesignProject,
  GenerationMetricsSummary,
  WorkshopSpecifySectionData,
  SpecifyReviewHealth,
  SpecifyCostOverview,
  SpecifyDiagnosticRow,
  WorkshopSourceSectionData,
  RFQPipelineSummary,
  RFQResponseStats,
  SourceOrderSummary,
  WorkshopAssembleSectionData,
  AssemblyOrder,
  AssemblyStatusCounts,
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

const CONFIDENCE_MAP: Record<string, number> = {
  low: 0.3,
  medium: 0.6,
  high: 0.9,
}

// ========================
// Workshop: Design
// ========================

/**
 * Fetch design phase data: projects, modules, and generation metrics.
 *
 * @param supabase - Authenticated Supabase client
 * @param foundryId - Foundry to scope queries to
 * @param _dateRange - Period start and end dates (unused — shows all active)
 * @returns Workshop design section data
 */
export async function fetchWorkshopDesignData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  _dateRange: { start: string; end: string },
): Promise<WorkshopDesignSectionData> {
  const [{ data: projects }, { data: metrics }] = await Promise.all([
    supabase
      .from('cad_lab_projects')
      .select('id, name, stage, status, modules, created_at')
      .eq('foundry_id', foundryId)
      .not('status', 'eq', 'archived')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('cad_lab_generation_metrics')
      .select('model_used, success, generation_time_ms, project_id')
      .eq('project_id', foundryId) // generation_metrics has project_id, filtered below
      .limit(500),
  ])

  const allProjects = projects ?? []

  // INTENT: generation_metrics references project IDs, not foundry IDs directly.
  // We fetch all projects for the foundry, then filter metrics by those project IDs.
  const projectIds = new Set(allProjects.map(p => p.id))

  // Re-fetch generation metrics scoped by project IDs
  const { data: genMetrics } = projectIds.size > 0
    ? await supabase
        .from('cad_lab_generation_metrics')
        .select('model_used, success, generation_time_ms')
        .in('project_id', Array.from(projectIds))
    : { data: [] }

  const mappedProjects: WorkshopDesignProject[] = allProjects.map(p => ({
    id: p.id,
    name: p.name,
    stage: p.stage,
    status: p.status,
    moduleCount: Array.isArray(p.modules) ? (p.modules as Json[]).length : 0,
    createdAt: p.created_at,
  }))

  let generationMetrics: GenerationMetricsSummary | undefined
  const allMetrics = genMetrics ?? metrics ?? []
  if (allMetrics.length > 0) {
    const successCount = allMetrics.filter(m => m.success).length
    const timings = allMetrics
      .map(m => m.generation_time_ms)
      .filter((t): t is number => t != null)
    const modelCounts = new Map<string, number>()
    for (const m of allMetrics) {
      if (m.model_used) {
        modelCounts.set(m.model_used, (modelCounts.get(m.model_used) ?? 0) + 1)
      }
    }

    generationMetrics = {
      totalGenerations: allMetrics.length,
      successRate: Math.round((successCount / allMetrics.length) * 100),
      averageTimeMs: timings.length > 0
        ? Math.round(timings.reduce((a, b) => a + b, 0) / timings.length)
        : 0,
      topModels: Array.from(modelCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([model, count]) => ({ model, count })),
    }
  }

  return {
    totalProjects: allProjects.length,
    activeProjects: allProjects.filter(p => p.status !== 'completed').length,
    projects: mappedProjects,
    generationMetrics,
  }
}

// ========================
// Workshop: Specify
// ========================

/**
 * Fetch specify phase data: diagnostic answers, reviews, cost estimates.
 *
 * @param supabase - Authenticated Supabase client
 * @param foundryId - Foundry to scope queries to
 * @param _dateRange - Period dates (unused — shows all active)
 * @returns Workshop specify section data
 */
export async function fetchWorkshopSpecifyData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  _dateRange: { start: string; end: string },
): Promise<WorkshopSpecifySectionData> {
  const { data: projects } = await supabase
    .from('cad_lab_projects')
    .select('id, modules, reviews, ai_cost_estimates, diagnostic_answers, review_skipped')
    .eq('foundry_id', foundryId)
    .not('status', 'eq', 'archived')

  const allProjects = projects ?? []

  // Review health
  const reviewHealth: SpecifyReviewHealth = { pass: 0, warn: 0, fail: 0, pending: 0, skipped: 0 }
  for (const p of allProjects) {
    const hasModules = Array.isArray(p.modules) && p.modules.length > 0
    if (!hasModules) continue

    if (p.review_skipped) {
      reviewHealth.skipped++
      continue
    }

    if (!p.reviews || !isRecord(p.reviews)) {
      reviewHealth.pending++
      continue
    }

    const moduleReviewArrays = Object.values(p.reviews)
    if (moduleReviewArrays.length === 0) {
      reviewHealth.pending++
      continue
    }

    // Worst verdict across modules determines project health
    let worst: 'pass' | 'warn' | 'fail' = 'pass'
    for (const moduleReviews of moduleReviewArrays) {
      if (!Array.isArray(moduleReviews)) continue
      for (const review of moduleReviews) {
        if (!isRecord(review)) continue
        const verdict = isString(review.verdict) ? review.verdict.toLowerCase() : ''
        if (verdict === 'fail') worst = 'fail'
        else if (verdict === 'warn' && worst !== 'fail') worst = 'warn'
      }
    }

    reviewHealth[worst]++
  }

  // Cost overview
  let costOverview: SpecifyCostOverview | undefined
  let totalCost = 0
  let totalConfidence = 0
  let confidenceCount = 0
  let projectsCosted = 0

  for (const p of allProjects) {
    if (!p.ai_cost_estimates || !isRecord(p.ai_cost_estimates)) continue
    const moduleEstimates = Object.values(p.ai_cost_estimates)
    if (moduleEstimates.length === 0) continue

    let hasEstimate = false
    for (const est of moduleEstimates) {
      if (!isRecord(est)) continue
      const perUnit = isNumber(est.totalPerUnit) ? est.totalPerUnit : null
      if (perUnit === null) continue

      hasEstimate = true
      totalCost += perUnit

      if (isString(est.confidence)) {
        const num = CONFIDENCE_MAP[est.confidence.toLowerCase()]
        if (num !== undefined) {
          totalConfidence += num
          confidenceCount++
        }
      }
    }
    if (hasEstimate) projectsCosted++
  }

  if (projectsCosted > 0) {
    costOverview = {
      totalEstimatedCost: Math.round(totalCost * 100) / 100,
      projectsCosted,
      averageConfidence: confidenceCount > 0
        ? Math.round((totalConfidence / confidenceCount) * 100) / 100
        : 0,
    }
  }

  // Diagnostic breakdowns
  const processCounts = new Map<string, number>()
  const materialCounts = new Map<string, number>()
  const questionAnswers = new Map<string, Map<string, number>>()

  const DIAGNOSTIC_KEYS = ['mfg_process', 'material', 'tolerance', 'finish', 'batch_size', 'environment']
  const DIAGNOSTIC_LABELS: Record<string, string> = {
    mfg_process: 'Manufacturing Process',
    material: 'Material',
    tolerance: 'Tolerance',
    finish: 'Finish',
    batch_size: 'Batch Size',
    environment: 'Environment',
  }

  for (const p of allProjects) {
    if (!p.diagnostic_answers || !isRecord(p.diagnostic_answers)) continue

    for (const moduleAnswers of Object.values(p.diagnostic_answers)) {
      if (!isRecord(moduleAnswers)) continue

      for (const key of DIAGNOSTIC_KEYS) {
        const val = isString(moduleAnswers[key]) ? moduleAnswers[key].trim() : null
        if (!val) continue

        if (key === 'mfg_process') processCounts.set(val, (processCounts.get(val) ?? 0) + 1)
        if (key === 'material') materialCounts.set(val, (materialCounts.get(val) ?? 0) + 1)

        if (!questionAnswers.has(key)) questionAnswers.set(key, new Map())
        const answerMap = questionAnswers.get(key)!
        answerMap.set(val, (answerMap.get(val) ?? 0) + 1)
      }
    }
  }

  const processBreakdown = Array.from(processCounts.entries())
    .map(([process, count]) => ({ process, count }))
    .sort((a, b) => b.count - a.count)

  const materialBreakdown = Array.from(materialCounts.entries())
    .map(([material, count]) => ({ material, count }))
    .sort((a, b) => b.count - a.count)

  const diagnosticTable: SpecifyDiagnosticRow[] = DIAGNOSTIC_KEYS
    .filter(key => questionAnswers.has(key))
    .map(key => ({
      question: DIAGNOSTIC_LABELS[key] ?? key,
      topAnswers: Array.from(questionAnswers.get(key)!.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([answer, count]) => ({ answer, count })),
    }))

  return {
    reviewHealth,
    costOverview,
    processBreakdown,
    materialBreakdown,
    diagnosticTable,
  }
}

// ========================
// Workshop: Source
// ========================

/**
 * Fetch sourcing phase data: RFQs, responses, manufacturing orders.
 *
 * @param supabase - Authenticated Supabase client
 * @param foundryId - Foundry to scope queries to
 * @param _dateRange - Period dates
 * @returns Workshop source section data
 */
export async function fetchWorkshopSourceData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  _dateRange: { start: string; end: string },
): Promise<WorkshopSourceSectionData> {
  const [{ data: rfqs }, { data: orders }] = await Promise.all([
    supabase
      .from('rfqs')
      .select('id, status, awarded_to')
      .eq('foundry_id', foundryId),
    supabase
      .from('manufacturing_orders')
      .select('id, status, total_estimated_cost_gbp')
      .eq('foundry_id', foundryId),
  ])

  const allRfqs = rfqs ?? []

  // RFQ pipeline
  const rfqPipeline: RFQPipelineSummary = {
    total: allRfqs.length,
    open: allRfqs.filter(r => r.status === 'Open').length,
    bidding: allRfqs.filter(r => r.status === 'Bidding' || r.status === 'priority_hold').length,
    awarded: allRfqs.filter(r => r.status === 'Awarded').length,
    closed: allRfqs.filter(r => r.status === 'Closed' || r.status === 'cancelled').length,
  }

  // Response stats — count RFQs that have an awarded_to as a proxy for responses
  const rfqsWithResponses = allRfqs.filter(r => r.awarded_to != null)
  const rfqResponseStats: RFQResponseStats = {
    totalResponses: rfqsWithResponses.length,
    averagePerRFQ: allRfqs.length > 0
      ? Math.round((rfqsWithResponses.length / allRfqs.length) * 100) / 100
      : 0,
  }

  // Manufacturing orders
  const allOrders = orders ?? []
  const statusCounts = new Map<string, number>()
  let totalValue = 0
  for (const o of allOrders) {
    statusCounts.set(o.status, (statusCounts.get(o.status) ?? 0) + 1)
    if (o.total_estimated_cost_gbp != null) totalValue += o.total_estimated_cost_gbp
  }

  const orderSummary: SourceOrderSummary = {
    total: allOrders.length,
    byStatus: Array.from(statusCounts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    totalEstimatedValue: Math.round(totalValue * 100) / 100,
  }

  return { rfqPipeline, rfqResponseStats, orderSummary }
}

// ========================
// Workshop: Assemble
// ========================

/**
 * Fetch assembly phase data: manufacturing orders joined to projects.
 *
 * @param supabase - Authenticated Supabase client
 * @param foundryId - Foundry to scope queries to
 * @param _dateRange - Period dates
 * @returns Workshop assemble section data
 */
export async function fetchWorkshopAssembleData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  _dateRange: { start: string; end: string },
): Promise<WorkshopAssembleSectionData> {
  const { data: orders } = await supabase
    .from('manufacturing_orders')
    .select('id, order_number, title, status, required_by, total_estimated_cost_gbp, cad_lab_project_id, cad_lab_projects!manufacturing_orders_cad_lab_project_id_fkey(name)')
    .eq('foundry_id', foundryId)
    .order('created_at', { ascending: false })
    .limit(50)

  const allOrders = orders ?? []

  const statusCounts: AssemblyStatusCounts = {
    inProduction: 0,
    assembling: 0,
    shipping: 0,
    delivered: 0,
    atRisk: 0,
  }

  const mapped: AssemblyOrder[] = allOrders.map(o => {
    const project = o.cad_lab_projects as unknown as { name: string } | null

    // Count status
    if (o.status === 'in_production') statusCounts.inProduction++
    else if (o.status === 'assembling') statusCounts.assembling++
    else if (o.status === 'shipping') statusCounts.shipping++
    else if (o.status === 'delivered') statusCounts.delivered++

    // At-risk: has required_by date in the past and not delivered
    const isAtRisk = o.required_by != null
      && new Date(o.required_by) < new Date()
      && o.status !== 'delivered' && o.status !== 'cancelled'
    if (isAtRisk) statusCounts.atRisk++

    return {
      id: o.id,
      orderNumber: o.order_number,
      title: o.title ?? o.order_number,
      status: o.status,
      projectName: project?.name ?? null,
      requiredBy: o.required_by,
      estimatedCost: o.total_estimated_cost_gbp,
    }
  })

  return {
    orders: mapped,
    statusCounts,
    totalOrders: allOrders.length,
  }
}
