import type { Severity } from '../schema/types'
import { buildBomEvidenceTraceMatrix, type BomEvidenceTraceMatrix, type BomEvidenceTraceRow } from './bom-evidence-trace'
import type { ProductDossier } from '../schema/types'

export type BomEvidenceClosureAction =
  | 'collect_source_evidence'
  | 'repair_rejected_evidence'
  | 'resolve_component_identity'
  | 'replace_protocol_source'
  | 'repair_source_reference'
  | 'review_source_reference'
  | 'defer_candidate_sourcing'

export type BomEvidenceClosureStatus = 'ready' | 'blocked' | 'deferred'

export interface BomEvidenceClosureRow {
  id: string
  sequence: number
  action: BomEvidenceClosureAction
  status: BomEvidenceClosureStatus
  priority: Severity
  lineId: string
  componentWordId: string
  description: string
  traceStatus: BomEvidenceTraceRow['traceStatus']
  requiredEvidence: string[]
  intakeArtifacts: string[]
  acceptanceCriteria: string[]
  rejectionCriteria: string[]
  blocksCandidateDisplay: boolean
  blocksPricedReview: boolean
  blocksProcurement: boolean
  requiredAction: string
}

export interface BomEvidenceClosurePlan {
  summary: {
    traceRows: number
    closureRows: number
    readyRows: number
    blockedRows: number
    deferredRows: number
    blockerRows: number
    collectSourceRows: number
    repairRejectedRows: number
    resolveIdentityRows: number
    replaceProtocolRows: number
    repairReferenceRows: number
    reviewReferenceRows: number
    deferCandidateRows: number
    procurementBlockingRows: number
    pricedReviewBlockingRows: number
    nextRowId: string | null
    canUseForProcurement: boolean
  }
  rows: BomEvidenceClosureRow[]
}

export function buildBomEvidenceClosurePlan(dossier: ProductDossier): BomEvidenceClosurePlan {
  return bomEvidenceClosurePlanFromTrace(buildBomEvidenceTraceMatrix(dossier))
}

export function bomEvidenceClosurePlanFromTrace(trace: BomEvidenceTraceMatrix): BomEvidenceClosurePlan {
  const rows = trace.rows
    .filter(row => row.traceStatus !== 'production_eligible')
    .map((row, index) => closureRow(row, index + 1))
    .sort(compareRows)
    .map((row, index) => ({ ...row, sequence: index + 1 }))

  return {
    summary: {
      traceRows: trace.summary.lines,
      closureRows: rows.length,
      readyRows: rows.filter(row => row.status === 'ready').length,
      blockedRows: rows.filter(row => row.status === 'blocked').length,
      deferredRows: rows.filter(row => row.status === 'deferred').length,
      blockerRows: rows.filter(row => row.priority === 'blocker').length,
      collectSourceRows: rows.filter(row => row.action === 'collect_source_evidence').length,
      repairRejectedRows: rows.filter(row => row.action === 'repair_rejected_evidence').length,
      resolveIdentityRows: rows.filter(row => row.action === 'resolve_component_identity').length,
      replaceProtocolRows: rows.filter(row => row.action === 'replace_protocol_source').length,
      repairReferenceRows: rows.filter(row => row.action === 'repair_source_reference').length,
      reviewReferenceRows: rows.filter(row => row.action === 'review_source_reference').length,
      deferCandidateRows: rows.filter(row => row.action === 'defer_candidate_sourcing').length,
      procurementBlockingRows: rows.filter(row => row.blocksProcurement).length,
      pricedReviewBlockingRows: rows.filter(row => row.blocksPricedReview).length,
      nextRowId: rows.find(row => row.status === 'ready' && row.priority === 'blocker')?.id
        ?? rows.find(row => row.status === 'ready')?.id
        ?? rows.find(row => row.status === 'blocked')?.id
        ?? null,
      canUseForProcurement: trace.summary.canUseForProcurement,
    },
    rows,
  }
}

export function renderBomEvidenceClosurePlanCsv(plan: BomEvidenceClosurePlan): string {
  const header = [
    'id',
    'sequence',
    'action',
    'status',
    'priority',
    'lineId',
    'componentWordId',
    'description',
    'traceStatus',
    'requiredEvidence',
    'intakeArtifacts',
    'acceptanceCriteria',
    'rejectionCriteria',
    'blocksCandidateDisplay',
    'blocksPricedReview',
    'blocksProcurement',
    'requiredAction',
  ]
  const rows = plan.rows.map(row => [
    row.id,
    String(row.sequence),
    row.action,
    row.status,
    row.priority,
    row.lineId,
    row.componentWordId,
    row.description,
    row.traceStatus,
    row.requiredEvidence.join('; '),
    row.intakeArtifacts.join('; '),
    row.acceptanceCriteria.join('; '),
    row.rejectionCriteria.join('; '),
    row.blocksCandidateDisplay ? 'yes' : 'no',
    row.blocksPricedReview ? 'yes' : 'no',
    row.blocksProcurement ? 'yes' : 'no',
    row.requiredAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function closureRow(row: BomEvidenceTraceRow, sequence: number): BomEvidenceClosureRow {
  const action = actionForTrace(row)
  return {
    id: `bom-close:${row.lineId}`,
    sequence,
    action,
    status: statusFor(row, action),
    priority: priorityFor(row, action),
    lineId: row.lineId,
    componentWordId: row.componentWordId,
    description: row.description,
    traceStatus: row.traceStatus,
    requiredEvidence: requiredEvidenceFor(action),
    intakeArtifacts: intakeArtifactsFor(action),
    acceptanceCriteria: acceptanceCriteriaFor(action),
    rejectionCriteria: rejectionCriteriaFor(action),
    blocksCandidateDisplay: false,
    blocksPricedReview: blocksPricedReview(row, action),
    blocksProcurement: blocksProcurement(row, action),
    requiredAction: row.requiredAction,
  }
}

function actionForTrace(row: BomEvidenceTraceRow): BomEvidenceClosureAction {
  if (row.traceStatus === 'critical_unsourced') return 'collect_source_evidence'
  if (row.traceStatus === 'rejected_evidence') return 'repair_rejected_evidence'
  if (row.traceStatus === 'duplicate_identity_review_required') return 'resolve_component_identity'
  if (row.traceStatus === 'protocol_only') return 'replace_protocol_source'
  if (row.traceStatus === 'source_reference_blocked') return 'repair_source_reference'
  if (row.traceStatus === 'source_admitted_needs_reference_review') return 'review_source_reference'
  return 'defer_candidate_sourcing'
}

function statusFor(row: BomEvidenceTraceRow, action: BomEvidenceClosureAction): BomEvidenceClosureStatus {
  if (action === 'defer_candidate_sourcing') return 'deferred'
  if (action === 'resolve_component_identity') return 'blocked'
  if (row.traceStatus === 'candidate_only') return 'deferred'
  return 'ready'
}

function priorityFor(row: BomEvidenceTraceRow, action: BomEvidenceClosureAction): Severity {
  if (row.priority === 'critical') return 'blocker'
  if (action === 'defer_candidate_sourcing') return 'minor'
  return 'major'
}

function blocksPricedReview(row: BomEvidenceTraceRow, action: BomEvidenceClosureAction): boolean {
  if (action === 'defer_candidate_sourcing') return false
  if (row.canDisplayPricedReview) return false
  return row.priority === 'critical'
}

function blocksProcurement(row: BomEvidenceTraceRow, action: BomEvidenceClosureAction): boolean {
  if (action === 'defer_candidate_sourcing') return false
  return row.priority === 'critical' || row.ledgerStatus === 'admitted_priced'
}

function requiredEvidenceFor(action: BomEvidenceClosureAction): string[] {
  if (action === 'collect_source_evidence') return [
    'supplierName',
    'manufacturer',
    'mpn',
    'unitCostGbp',
    'evidence.ref',
    'evidence.quote',
    'retrievedAt',
  ]
  if (action === 'repair_rejected_evidence') return [
    'corrected rejected fields from sourcing admission',
    'same componentWordId as the BoM line',
    'positive unitCostGbp',
    'source evidence note/reference',
  ]
  if (action === 'resolve_component_identity') return [
    'canonical component identity decision',
    'whether repeated allocations are one shared physical item or separate installed lines',
    'updated componentWordId or quantity basis',
  ]
  if (action === 'replace_protocol_source') return [
    'production supplier/catalogue or quote URL',
    'fresh retrievedAt timestamp',
    'quote note anchored to manufacturer or MPN',
  ]
  if (action === 'repair_source_reference') return [
    'HTTPS non-placeholder supplier/catalogue URL',
    'complete source metadata',
    'quote note mentioning manufacturer or MPN',
    'fresh retrievedAt timestamp',
  ]
  if (action === 'review_source_reference') return [
    'source-reference quality review decision',
    'accepted production URL or explicit replacement instruction',
  ]
  return [
    'no immediate evidence required unless this candidate is promoted to procurement scope',
  ]
}

function intakeArtifactsFor(action: BomEvidenceClosureAction): string[] {
  if (action === 'resolve_component_identity') return [
    '*.component-identity.csv',
    '*.bom-evidence-trace.csv',
    '*.component-allocation-gate.csv',
  ]
  if (action === 'defer_candidate_sourcing') return [
    '*.sourcing-pack.csv',
    '*.bom-evidence-trace.csv',
  ]
  return [
    '*.sourcing-intake-template.csv',
    '*.sourcing-ledger.csv',
    '*.bom-provenance-manifest.csv',
    '*.source-reference-quality-gate.csv',
    '*.bom-evidence-trace.csv',
  ]
}

function acceptanceCriteriaFor(action: BomEvidenceClosureAction): string[] {
  if (action === 'collect_source_evidence' || action === 'repair_rejected_evidence') return [
    'Sourcing admission accepts the row.',
    'BoM provenance manifest shows supplier, manufacturer, MPN and unit cost as source_backed.',
    'BoM evidence trace leaves critical_unsourced/rejected_evidence for this line.',
  ]
  if (action === 'resolve_component_identity') return [
    'Component identity worklist no longer reports this component as duplicated.',
    'Sourcing evidence is admitted only after the line identity is unambiguous.',
  ]
  if (action === 'replace_protocol_source' || action === 'repair_source_reference' || action === 'review_source_reference') return [
    'Source Reference Quality Gate row passes.',
    'BoM evidence trace row becomes production_eligible, or an explicit reviewer decision keeps it out of procurement scope.',
  ]
  return [
    'Candidate remains candidate-only, or is promoted to sourcing intake with explicit procurement scope.',
  ]
}

function rejectionCriteriaFor(action: BomEvidenceClosureAction): string[] {
  if (action === 'defer_candidate_sourcing') return [
    'Candidate is used in procurement totals without source-backed evidence.',
  ]
  if (action === 'resolve_component_identity') return [
    'Same componentWordId continues to represent ambiguous physical quantities.',
  ]
  return [
    'LLM-estimated supplier/manufacturer/MPN/cost.',
    'benchmark average without source evidence.',
    'test-fixture:// source used as production evidence.',
    'placeholder URL or stale retrieval timestamp.',
  ]
}

function compareRows(a: BomEvidenceClosureRow, b: BomEvidenceClosureRow): number {
  const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority)
  if (priorityDelta !== 0) return priorityDelta
  const statusDelta = statusRank(a.status) - statusRank(b.status)
  if (statusDelta !== 0) return statusDelta
  const actionDelta = actionRank(a.action) - actionRank(b.action)
  if (actionDelta !== 0) return actionDelta
  return a.id.localeCompare(b.id)
}

function priorityRank(priority: Severity): number {
  if (priority === 'blocker') return 0
  if (priority === 'major') return 1
  return 2
}

function statusRank(status: BomEvidenceClosureStatus): number {
  if (status === 'ready') return 0
  if (status === 'blocked') return 1
  return 2
}

function actionRank(action: BomEvidenceClosureAction): number {
  if (action === 'collect_source_evidence') return 0
  if (action === 'repair_rejected_evidence') return 1
  if (action === 'resolve_component_identity') return 2
  if (action === 'repair_source_reference') return 3
  if (action === 'replace_protocol_source') return 4
  if (action === 'review_source_reference') return 5
  return 6
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
