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
  WorkshopFunnelStage,
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
// Period Comparison Helper
// ========================

function computePreviousPeriod(dateRange: { start: string; end: string }) {
  const startDate = new Date(dateRange.start)
  const endDate = new Date(dateRange.end)
  const periodMs = endDate.getTime() - startDate.getTime()
  const prevStart = new Date(startDate.getTime() - periodMs)
  const prevEnd = new Date(startDate.getTime() - 1)
  return {
    prevStart: prevStart.toISOString().split('T')[0],
    prevEnd: prevEnd.toISOString().split('T')[0],
  }
}

// ========================
// Workshop: Design
// ========================

/**
 * Fetch design phase data: projects, modules, generation metrics, funnel, and deltas.
 *
 * @param supabase - Authenticated Supabase client
 * @param foundryId - Foundry to scope queries to
 * @param dateRange - Period start and end dates
 * @returns Workshop design section data
 */
export async function fetchWorkshopDesignData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  dateRange: { start: string; end: string },
): Promise<WorkshopDesignSectionData> {
  const { prevStart, prevEnd } = computePreviousPeriod(dateRange)

  // INTENT: Fetch projects first, then use their IDs to scope generation_metrics.
  // generation_metrics.project_id references cad_lab_projects.id (NOT foundry_id).
  const [{ data: projects }, { data: allFunnelProjects }, { data: prevProjects }] = await Promise.all([
    supabase
      .from('cad_lab_projects')
      .select('id, name, stage, status, modules, created_at, pipeline_stage')
      .eq('foundry_id', foundryId)
      .not('status', 'eq', 'archived')
      .order('created_at', { ascending: false })
      .limit(20),
    // All non-archived projects for funnel (no limit)
    supabase
      .from('cad_lab_projects')
      .select('pipeline_stage')
      .eq('foundry_id', foundryId)
      .not('status', 'eq', 'archived'),
    // Previous period projects for deltas
    supabase
      .from('cad_lab_projects')
      .select('id, status')
      .eq('foundry_id', foundryId)
      .not('status', 'eq', 'archived')
      .gte('created_at', prevStart)
      .lte('created_at', prevEnd),
  ])

  const allProjects = projects ?? []
  const projectIds = allProjects.map(p => p.id)

  // Workshop funnel from all projects
  const funnelMap = new Map<string, number>()
  for (const p of (allFunnelProjects ?? [])) {
    const stage = p.pipeline_stage ?? 'design'
    funnelMap.set(stage, (funnelMap.get(stage) ?? 0) + 1)
  }
  const workshopFunnel: WorkshopFunnelStage[] = (
    ['design', 'specify', 'source', 'assemble', 'complete'] as const
  ).map(stage => ({ stage, count: funnelMap.get(stage) ?? 0 }))

  // Fetch generation metrics scoped by actual project IDs
  const { data: genMetrics } = projectIds.length > 0
    ? await supabase
        .from('cad_lab_generation_metrics')
        .select('model_used, success, generation_time_ms, created_at, first_attempt_success, quality_failure, repair_attempts, tokens_in, tokens_out')
        .in('project_id', projectIds)
    : { data: [] }

  // Previous period generation count
  const prevProjectIds = (prevProjects ?? []).map(p => p.id)
  const { count: prevGenCount } = prevProjectIds.length > 0
    ? await supabase
        .from('cad_lab_generation_metrics')
        .select('id', { count: 'exact', head: true })
        .in('project_id', prevProjectIds)
    : { count: 0 }

  const mappedProjects: WorkshopDesignProject[] = allProjects.map(p => ({
    id: p.id,
    name: p.name,
    stage: p.stage,
    status: p.status,
    moduleCount: Array.isArray(p.modules) ? (p.modules as Json[]).length : 0,
    createdAt: p.created_at,
  }))

  let generationMetrics: GenerationMetricsSummary | undefined
  const allMetrics = genMetrics ?? []

  // Generation trend (daily counts for sparkline)
  const trendMap = new Map<string, number>()
  for (const m of allMetrics) {
    const day = m.created_at.split('T')[0]
    trendMap.set(day, (trendMap.get(day) ?? 0) + 1)
  }
  const generationTrend = Array.from(trendMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }))

  // Enriched metrics
  let firstAttemptSuccessRate: number | undefined
  let qualityFailureRate: number | undefined
  let avgRepairAttempts: number | undefined
  let totalTokensUsed: number | undefined

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

    // First-attempt success rate
    const firstAttemptMetrics = allMetrics.filter(m => m.first_attempt_success != null)
    if (firstAttemptMetrics.length > 0) {
      const firstAttemptOk = firstAttemptMetrics.filter(m => m.first_attempt_success).length
      firstAttemptSuccessRate = Math.round((firstAttemptOk / firstAttemptMetrics.length) * 100)
    }

    // Quality failure rate
    const qualityMetrics = allMetrics.filter(m => m.quality_failure != null)
    if (qualityMetrics.length > 0) {
      const failures = qualityMetrics.filter(m => m.quality_failure).length
      qualityFailureRate = Math.round((failures / qualityMetrics.length) * 100)
    }

    // Avg repair attempts
    const repairs = allMetrics
      .map(m => m.repair_attempts)
      .filter((r): r is number => r != null)
    if (repairs.length > 0) {
      avgRepairAttempts = Math.round((repairs.reduce((a, b) => a + b, 0) / repairs.length) * 10) / 10
    }

    // Token usage
    const tokensIn = allMetrics.reduce((sum, m) => sum + (m.tokens_in ?? 0), 0)
    const tokensOut = allMetrics.reduce((sum, m) => sum + (m.tokens_out ?? 0), 0)
    totalTokensUsed = tokensIn + tokensOut
  }

  const prevAll = prevProjects ?? []
  return {
    totalProjects: allProjects.length,
    activeProjects: allProjects.filter(p => p.status !== 'completed').length,
    projects: mappedProjects,
    generationMetrics,
    workshopFunnel,
    previousTotalProjects: prevAll.length,
    previousActiveProjects: prevAll.filter(p => p.status !== 'completed').length,
    generationTrend: generationTrend.length > 1 ? generationTrend : undefined,
    firstAttemptSuccessRate,
    totalTokensUsed,
    qualityFailureRate,
    avgRepairAttempts,
    previousGenerationCount: prevGenCount ?? 0,
  }
}

// ========================
// Workshop: Specify
// ========================

/**
 * Fetch specify phase data: diagnostic answers, reviews, cost estimates, and deltas.
 *
 * @param supabase - Authenticated Supabase client
 * @param foundryId - Foundry to scope queries to
 * @param dateRange - Period dates
 * @returns Workshop specify section data
 */
export async function fetchWorkshopSpecifyData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  dateRange: { start: string; end: string },
): Promise<WorkshopSpecifySectionData> {
  const { prevStart, prevEnd } = computePreviousPeriod(dateRange)

  const [{ data: projects }, { data: prevProjectsRaw }] = await Promise.all([
    supabase
      .from('cad_lab_projects')
      .select('id, modules, reviews, ai_cost_estimates, diagnostic_answers, review_skipped')
      .eq('foundry_id', foundryId)
      .not('status', 'eq', 'archived'),
    supabase
      .from('cad_lab_projects')
      .select('id, modules, reviews, ai_cost_estimates, review_skipped')
      .eq('foundry_id', foundryId)
      .not('status', 'eq', 'archived')
      .gte('created_at', prevStart)
      .lte('created_at', prevEnd),
  ])

  const allProjects = projects ?? []

  // Review health (shared logic for current + previous)
  function computeReviewHealth(projectList: { modules: Json; reviews: Json; review_skipped: boolean | null }[]): SpecifyReviewHealth {
    const health: SpecifyReviewHealth = { pass: 0, warn: 0, fail: 0, pending: 0, skipped: 0 }
    for (const p of projectList) {
      const hasModules = Array.isArray(p.modules) && p.modules.length > 0
      if (!hasModules) continue

      if (p.review_skipped) { health.skipped++; continue }

      if (!p.reviews || !isRecord(p.reviews)) { health.pending++; continue }

      const moduleReviewArrays = Object.values(p.reviews)
      if (moduleReviewArrays.length === 0) { health.pending++; continue }

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
      health[worst]++
    }
    return health
  }

  const reviewHealth = computeReviewHealth(allProjects)
  const previousReviewHealth = computeReviewHealth(prevProjectsRaw ?? [])

  // Cost overview (shared logic)
  function computeCostOverview(projectList: { ai_cost_estimates: Json }[]): { costOverview?: SpecifyCostOverview; avgPerUnit: number } {
    let totalCost = 0
    let totalConfidence = 0
    let confidenceCount = 0
    let projectsCosted = 0
    let totalPerUnitSum = 0
    let totalPerUnitCount = 0

    for (const p of projectList) {
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
        totalPerUnitSum += perUnit
        totalPerUnitCount++

        if (isString(est.confidence)) {
          const num = CONFIDENCE_MAP[est.confidence.toLowerCase()]
          if (num !== undefined) { totalConfidence += num; confidenceCount++ }
        }
      }
      if (hasEstimate) projectsCosted++
    }

    if (projectsCosted > 0) {
      return {
        costOverview: {
          totalEstimatedCost: Math.round(totalCost * 100) / 100,
          projectsCosted,
          averageConfidence: confidenceCount > 0
            ? Math.round((totalConfidence / confidenceCount) * 100) / 100
            : 0,
        },
        avgPerUnit: totalPerUnitCount > 0
          ? Math.round((totalPerUnitSum / totalPerUnitCount) * 100) / 100
          : 0,
      }
    }
    return { costOverview: undefined, avgPerUnit: 0 }
  }

  const { costOverview, avgPerUnit: _currentAvg } = computeCostOverview(allProjects)
  const { avgPerUnit: prevAvgPerUnit } = computeCostOverview(prevProjectsRaw ?? [])

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
    previousReviewHealth,
    previousAveragePerUnitCost: prevAvgPerUnit > 0 ? prevAvgPerUnit : undefined,
  }
}

// ========================
// Workshop: Source
// ========================

/**
 * Fetch sourcing phase data: RFQs, responses, manufacturing orders, quotes, and deltas.
 *
 * @param supabase - Authenticated Supabase client
 * @param foundryId - Foundry to scope queries to
 * @param dateRange - Period dates
 * @returns Workshop source section data
 */
export async function fetchWorkshopSourceData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  dateRange: { start: string; end: string },
): Promise<WorkshopSourceSectionData> {
  const { prevStart, prevEnd } = computePreviousPeriod(dateRange)

  const [{ data: rfqs }, { data: orders }, { data: prevRfqs }, { data: prevOrders }] = await Promise.all([
    supabase
      .from('rfqs')
      .select('id, status, budget_min, budget_max, created_at')
      .eq('foundry_id', foundryId),
    supabase
      .from('manufacturing_orders')
      .select('id, status, total_estimated_cost_gbp')
      .eq('foundry_id', foundryId),
    // Previous period RFQs for delta
    supabase
      .from('rfqs')
      .select('id')
      .eq('foundry_id', foundryId)
      .gte('created_at', prevStart)
      .lte('created_at', prevEnd),
    // Previous period orders for delta
    supabase
      .from('manufacturing_orders')
      .select('id, total_estimated_cost_gbp')
      .eq('foundry_id', foundryId)
      .gte('created_at', prevStart)
      .lte('created_at', prevEnd),
  ])

  const allRfqs = rfqs ?? []
  const rfqIds = allRfqs.map(r => r.id)

  // Fetch actual rfq_responses scoped to this foundry's RFQs — expanded select
  const { data: actualResponses } = rfqIds.length > 0
    ? await supabase
        .from('rfq_responses')
        .select('id, rfq_id, quoted_price, timeline_weeks, buyer_shortlisted, responded_at, provider_id')
        .in('rfq_id', rfqIds)
    : { data: [] }

  // RFQ pipeline
  const rfqPipeline: RFQPipelineSummary = {
    total: allRfqs.length,
    open: allRfqs.filter(r => r.status === 'Open').length,
    bidding: allRfqs.filter(r => r.status === 'Bidding' || r.status === 'priority_hold').length,
    awarded: allRfqs.filter(r => r.status === 'Awarded').length,
    closed: allRfqs.filter(r => r.status === 'Closed' || r.status === 'cancelled').length,
  }

  // Response stats
  const allResponses = actualResponses ?? []
  const rfqResponseStats: RFQResponseStats = {
    totalResponses: allResponses.length,
    averagePerRFQ: allRfqs.length > 0
      ? Math.round((allResponses.length / allRfqs.length) * 10) / 10
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

  // Previous period deltas
  const prevOrderList = prevOrders ?? []
  let prevOrderValue = 0
  for (const o of prevOrderList) {
    if (o.total_estimated_cost_gbp != null) prevOrderValue += o.total_estimated_cost_gbp
  }

  // Quote stats from rfq_responses
  const quotedPrices = allResponses
    .map(r => r.quoted_price)
    .filter((p): p is number => p != null && p > 0)
  const quoteStats = quotedPrices.length > 0
    ? {
        avg: Math.round((quotedPrices.reduce((a, b) => a + b, 0) / quotedPrices.length) * 100) / 100,
        min: Math.min(...quotedPrices),
        max: Math.max(...quotedPrices),
        count: quotedPrices.length,
      }
    : undefined

  // Avg lead time
  const leadTimes = allResponses
    .map(r => r.timeline_weeks)
    .filter((w): w is number => w != null && w > 0)
  const avgLeadTimeWeeks = leadTimes.length > 0
    ? Math.round((leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) * 10) / 10
    : undefined

  // Shortlist rate
  const shortlisted = allResponses.filter(r => r.buyer_shortlisted === true).length
  const shortlistRate = allResponses.length > 0
    ? Math.round((shortlisted / allResponses.length) * 100)
    : undefined

  // Budget compliance: compare quoted_price to rfq budget_min/budget_max
  const rfqBudgetMap = new Map<string, { min: number | null; max: number | null }>()
  for (const rfq of allRfqs) {
    rfqBudgetMap.set(rfq.id, { min: rfq.budget_min, max: rfq.budget_max })
  }
  let withinBudget = 0, overBudget = 0, underBudget = 0, budgetTotal = 0
  for (const resp of allResponses) {
    if (resp.quoted_price == null) continue
    const budget = rfqBudgetMap.get(resp.rfq_id)
    if (!budget || (budget.min == null && budget.max == null)) continue
    budgetTotal++
    if (budget.max != null && resp.quoted_price > budget.max) overBudget++
    else if (budget.min != null && resp.quoted_price < budget.min) underBudget++
    else withinBudget++
  }
  const budgetCompliance = budgetTotal > 0
    ? { withinBudget, overBudget, underBudget, total: budgetTotal }
    : undefined

  // Response velocity: avg days from RFQ created_at to response responded_at
  const rfqCreatedMap = new Map<string, string>()
  for (const rfq of allRfqs) {
    if (rfq.created_at) rfqCreatedMap.set(rfq.id, rfq.created_at)
  }
  const responseDays: number[] = []
  for (const resp of allResponses) {
    if (!resp.responded_at) continue
    const rfqCreated = rfqCreatedMap.get(resp.rfq_id)
    if (!rfqCreated) continue
    const days = (new Date(resp.responded_at).getTime() - new Date(rfqCreated).getTime()) / (1000 * 60 * 60 * 24)
    if (days >= 0) responseDays.push(days)
  }
  const avgResponseDays = responseDays.length > 0
    ? Math.round((responseDays.reduce((a, b) => a + b, 0) / responseDays.length) * 10) / 10
    : undefined

  // Unique suppliers
  const supplierIds = new Set(allResponses.map(r => r.provider_id).filter(Boolean))

  return {
    rfqPipeline,
    rfqResponseStats,
    orderSummary,
    previousRfqTotal: (prevRfqs ?? []).length,
    previousOrderTotal: prevOrderList.length,
    previousOrderValue: Math.round(prevOrderValue * 100) / 100,
    quoteStats,
    avgLeadTimeWeeks,
    shortlistRate,
    budgetCompliance,
    avgResponseDays,
    uniqueSupplierCount: supplierIds.size > 0 ? supplierIds.size : undefined,
  }
}

// ========================
// Workshop: Assemble
// ========================

/**
 * Fetch assembly phase data: manufacturing orders joined to projects, with deltas.
 *
 * @param supabase - Authenticated Supabase client
 * @param foundryId - Foundry to scope queries to
 * @param dateRange - Period dates
 * @returns Workshop assemble section data
 */
export async function fetchWorkshopAssembleData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  dateRange: { start: string; end: string },
): Promise<WorkshopAssembleSectionData> {
  const { prevStart, prevEnd } = computePreviousPeriod(dateRange)

  const [{ data: orders }, { data: prevOrders }] = await Promise.all([
    supabase
      .from('manufacturing_orders')
      .select('id, order_number, title, status, required_by, total_estimated_cost_gbp, cad_lab_project_id, cad_lab_projects!manufacturing_orders_cad_lab_project_id_fkey(name)')
      .eq('foundry_id', foundryId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('manufacturing_orders')
      .select('id, status, required_by')
      .eq('foundry_id', foundryId)
      .gte('created_at', prevStart)
      .lte('created_at', prevEnd),
  ])

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

  // Previous period counts for deltas
  const prevAll = prevOrders ?? []
  let prevDelivered = 0
  let prevAtRisk = 0
  for (const o of prevAll) {
    if (o.status === 'delivered') prevDelivered++
    const wasAtRisk = o.required_by != null
      && new Date(o.required_by) < new Date()
      && o.status !== 'delivered' && o.status !== 'cancelled'
    if (wasAtRisk) prevAtRisk++
  }

  return {
    orders: mapped,
    statusCounts,
    totalOrders: allOrders.length,
    previousTotalOrders: prevAll.length,
    previousDelivered: prevDelivered,
    previousAtRisk: prevAtRisk,
  }
}
