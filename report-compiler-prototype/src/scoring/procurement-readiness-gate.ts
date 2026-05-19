import type { ArchitectureReadiness, PipelineStageTrace, ProductDossier, SectionIssue } from '../schema/types'
import { buildArchitectureFreezeGate } from './architecture-freeze-gate'
import { buildBomAdmissionGate } from './bom-admission-gate'
import { buildBomCostingGate } from './bom-costing-gate'
import { buildBomEvidenceClosurePlan } from './bom-evidence-closure-plan'
import { buildBomEvidenceTraceMatrix } from './bom-evidence-trace'
import type { DepthBenchmarkModel } from './depth-benchmark'
import { buildEvidenceAuthenticityGate } from './evidence-authenticity'
import { buildSourceReferenceQualityGate } from './source-reference-quality-gate'
import { buildSourcingBatchPlan } from './sourcing-batch-plan'

export type ProcurementReadinessVerdict =
  | 'procurement_ready'
  | 'procurement_review_required'
  | 'procurement_blocked'
  | 'procurement_not_started'

export type ProcurementReadinessArea =
  | 'architecture_review'
  | 'bom_evidence_trace'
  | 'sourcing_batch_closure'
  | 'source_reference_quality'
  | 'evidence_authenticity'
  | 'bom_costing'
  | 'prototype_procurement_policy'

export type ProcurementReadinessAreaVerdict = 'pass' | 'review' | 'blocked'

export interface ProcurementReadinessGateRow {
  area: ProcurementReadinessArea
  verdict: ProcurementReadinessAreaVerdict
  signal: string
  passRatio: number
  blockers: string[]
  requiredAction: string
}

export interface ProcurementReadinessGate {
  verdict: ProcurementReadinessVerdict
  summary: {
    rows: number
    passRows: number
    reviewRows: number
    blockedRows: number
    passRatio: number
    architectureFreezeVerdict: string
    independentReviewAccepted: boolean
    productionEligibleRows: number
    productionEligibleCriticalRows: number
    criticalRows: number
    procurementBlockingRows: number
    activeSourcingBatchRows: number
    deferredSourcingBatchRows: number
    sourceQualityVerdict: string
    evidenceAuthenticityVerdict: string
    bomCostingVerdict: string
    bomAdmissionVerdict: string
    prototypeProcurementUseAllowed: boolean
    canUseForProcurement: boolean
    nextAction: string | null
  }
  rows: ProcurementReadinessGateRow[]
  blockers: string[]
  nextActions: string[]
}

export function buildProcurementReadinessGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  stageTrace: PipelineStageTrace[],
  issues: SectionIssue[],
  depthBenchmark?: DepthBenchmarkModel,
): ProcurementReadinessGate {
  const architectureFreeze = buildArchitectureFreezeGate(dossier, readiness, stageTrace, issues, depthBenchmark)
  const bomTrace = buildBomEvidenceTraceMatrix(dossier)
  const bomClosure = buildBomEvidenceClosurePlan(dossier)
  const sourcingBatches = buildSourcingBatchPlan(dossier)
  const sourceQuality = buildSourceReferenceQualityGate(dossier)
  const authenticity = buildEvidenceAuthenticityGate(dossier)
  const costing = buildBomCostingGate(dossier)
  const bomAdmission = buildBomAdmissionGate(dossier, readiness, stageTrace)
  const prototypeProcurementUseAllowed = bomAdmission.summary.canUseForProcurement

  const rows: ProcurementReadinessGateRow[] = [
    {
      area: 'architecture_review',
      verdict: architectureFreeze.summary.independentReviewAccepted
        ? 'pass'
        : architectureFreeze.summary.structurallyReadyForSourcing ? 'review' : 'blocked',
      signal: `${architectureFreeze.verdict}; structurally ready ${architectureFreeze.summary.structurallyReadyForSourcing ? 'yes' : 'no'}, independent review accepted ${architectureFreeze.summary.independentReviewAccepted ? 'yes' : 'no'}.`,
      passRatio: architectureFreeze.summary.passRatio,
      blockers: architectureFreeze.summary.structurallyReadyForSourcing ? [] : architectureFreeze.blockers,
      requiredAction: architectureFreeze.summary.independentReviewAccepted
        ? 'Architecture is independently accepted for downstream sourcing/procurement checks.'
        : architectureFreeze.summary.structurallyReadyForSourcing
          ? 'Collect accepted engineering/interface/requirement review evidence before procurement use.'
          : 'Resolve architecture freeze blockers before any procurement use.',
    },
    {
      area: 'bom_evidence_trace',
      verdict: bomTrace.summary.canUseForProcurement
        ? 'pass'
        : bomTrace.summary.productionEligibleCriticalRows > 0 ? 'review' : 'blocked',
      signal: `${bomTrace.summary.productionEligibleCriticalRows}/${bomTrace.summary.criticalLines} critical rows production-eligible; ${bomTrace.summary.criticalUnsourcedRows} critical unsourced, ${bomTrace.summary.protocolOnlyRows} protocol-only, ${bomTrace.summary.sourceReferenceBlockedRows} source-reference blocked.`,
      passRatio: ratio(bomTrace.summary.productionEligibleCriticalRows, bomTrace.summary.criticalLines),
      blockers: bomTrace.rows
        .filter(row => row.priority === 'critical' && !row.canUseForProcurement)
        .map(row => `${row.lineId}: ${row.requiredAction}`),
      requiredAction: bomTrace.summary.canUseForProcurement
        ? 'Every critical BoM row is production-eligible by source evidence trace.'
        : bomTrace.summary.productionEligibleCriticalRows > 0
          ? 'Continue sourcing until every critical BoM row is production-eligible.'
          : 'Collect production-quality source evidence for critical BoM rows before procurement use.',
    },
    {
      area: 'sourcing_batch_closure',
      verdict: bomClosure.summary.procurementBlockingRows === 0
        ? 'pass'
        : sourcingBatches.summary.activeRows > 0 ? 'blocked' : 'review',
      signal: `${bomClosure.summary.procurementBlockingRows} procurement-blocking closure row(s); ${sourcingBatches.summary.activeRows} active sourcing row(s), ${sourcingBatches.summary.deferredRows} deferred row(s).`,
      passRatio: ratio(bomClosure.summary.closureRows - bomClosure.summary.procurementBlockingRows, bomClosure.summary.closureRows),
      blockers: bomClosure.rows
        .filter(row => row.blocksProcurement)
        .map(row => `${row.id}: ${row.requiredAction}`),
      requiredAction: bomClosure.summary.procurementBlockingRows === 0
        ? 'No procurement-blocking BoM closure rows remain.'
        : 'Work the active sourcing batches until procurement-blocking closure rows are closed.',
    },
    {
      area: 'source_reference_quality',
      verdict: sourceQuality.verdict === 'source_quality_ready'
        ? 'pass'
        : sourceQuality.verdict === 'source_quality_blocked' || sourceQuality.verdict === 'no_sourcing_evidence'
          ? 'blocked'
          : 'review',
      signal: `${sourceQuality.verdict}; ${sourceQuality.summary.passRows}/${sourceQuality.summary.rows} source-reference row(s) pass; ${sourceQuality.summary.protocolFixtureRows} protocol, ${sourceQuality.summary.placeholderUrlRows} placeholder.`,
      passRatio: sourceQuality.summary.passRatio,
      blockers: sourceQuality.blockers,
      requiredAction: sourceQuality.verdict === 'source_quality_ready'
        ? 'Source references pass non-network quality checks; refresh before procurement.'
        : sourceQuality.verdict === 'no_sourcing_evidence'
          ? 'Admit production source evidence before procurement readiness can start.'
          : 'Replace protocol, placeholder, stale or weak source references before procurement use.',
    },
    {
      area: 'evidence_authenticity',
      verdict: authenticity.verdict === 'production_ready'
        ? 'pass'
        : authenticity.verdict === 'no_evidence' ? 'blocked' : 'review',
      signal: `${authenticity.verdict}; ${authenticity.summary.productionReadyRows}/${authenticity.summary.rows} evidence rows production-ready; ${authenticity.summary.protocolFixtureRows} protocol.`,
      passRatio: authenticity.summary.passRatio,
      blockers: authenticity.verdict === 'no_evidence' ? ['No evidence records are present.'] : authenticity.promotionBlockers,
      requiredAction: authenticity.verdict === 'production_ready'
        ? 'Evidence records are production-grade by authenticity checks.'
        : authenticity.verdict === 'no_evidence'
          ? 'Add source and reviewer evidence before procurement readiness can start.'
          : 'Replace protocol or weak evidence with production-grade evidence references.',
    },
    {
      area: 'bom_costing',
      verdict: costing.verdict === 'costing_ready'
        ? 'pass'
        : costing.verdict === 'costing_blocked' || costing.verdict === 'costing_not_started' ? 'blocked' : 'review',
      signal: `${costing.verdict}; critical priced ${costing.summary.pricedCriticalLines}/${costing.summary.criticalBomLines}; BoM total ${costing.summary.bomTotalCostGbp} GBP.`,
      passRatio: costing.summary.passRatio,
      blockers: costing.blockers,
      requiredAction: costing.verdict === 'costing_ready'
        ? 'BoM costing gate is ready.'
        : 'Close costing blockers before procurement use.',
    },
    {
      area: 'prototype_procurement_policy',
      verdict: prototypeProcurementUseAllowed ? 'pass' : bomAdmission.summary.canRenderPricedBom ? 'review' : 'review',
      signal: `${bomAdmission.verdict}; display mode ${bomAdmission.summary.displayMode}; prototype procurement use allowed ${prototypeProcurementUseAllowed ? 'yes' : 'no'}.`,
      passRatio: prototypeProcurementUseAllowed ? 1 : 0,
      blockers: [],
      requiredAction: prototypeProcurementUseAllowed
        ? 'Prototype policy allows procurement use.'
        : 'Prototype policy keeps procurement use disabled until external procurement review and approval are explicitly added.',
    },
  ]

  const blockedRows = rows.filter(row => row.verdict === 'blocked')
  const reviewRows = rows.filter(row => row.verdict === 'review')
  const canUseForProcurement = blockedRows.length === 0
    && reviewRows.length === 0
    && prototypeProcurementUseAllowed
  const verdict: ProcurementReadinessVerdict = dossier.sources.sourcingEvidence.length === 0
    ? 'procurement_not_started'
    : canUseForProcurement
      ? 'procurement_ready'
      : blockedRows.length > 0 ? 'procurement_blocked' : 'procurement_review_required'

  return {
    verdict,
    summary: {
      rows: rows.length,
      passRows: rows.filter(row => row.verdict === 'pass').length,
      reviewRows: reviewRows.length,
      blockedRows: blockedRows.length,
      passRatio: ratio(rows.filter(row => row.verdict === 'pass').length, rows.length),
      architectureFreezeVerdict: architectureFreeze.verdict,
      independentReviewAccepted: architectureFreeze.summary.independentReviewAccepted,
      productionEligibleRows: bomTrace.summary.productionEligibleRows,
      productionEligibleCriticalRows: bomTrace.summary.productionEligibleCriticalRows,
      criticalRows: bomTrace.summary.criticalLines,
      procurementBlockingRows: bomClosure.summary.procurementBlockingRows,
      activeSourcingBatchRows: sourcingBatches.summary.activeRows,
      deferredSourcingBatchRows: sourcingBatches.summary.deferredRows,
      sourceQualityVerdict: sourceQuality.verdict,
      evidenceAuthenticityVerdict: authenticity.verdict,
      bomCostingVerdict: costing.verdict,
      bomAdmissionVerdict: bomAdmission.verdict,
      prototypeProcurementUseAllowed,
      canUseForProcurement,
      nextAction: rows.find(row => row.verdict === 'blocked')?.requiredAction ?? rows.find(row => row.verdict === 'review')?.requiredAction ?? null,
    },
    rows,
    blockers: blockedRows.flatMap(row => row.blockers.length > 0 ? row.blockers : [`${row.area}: ${row.signal}`]),
    nextActions: Array.from(new Set(rows.filter(row => row.verdict !== 'pass').map(row => row.requiredAction))),
  }
}

export function renderProcurementReadinessGateCsv(gate: ProcurementReadinessGate): string {
  const header = [
    'area',
    'verdict',
    'signal',
    'passRatio',
    'blockers',
    'requiredAction',
  ]
  const rows = gate.rows.map(row => [
    row.area,
    row.verdict,
    row.signal,
    String(row.passRatio),
    row.blockers.join(' '),
    row.requiredAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 10000) / 10000
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
