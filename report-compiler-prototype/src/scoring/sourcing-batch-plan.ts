import type { ProductDossier } from '../schema/types'
import { buildSourcingEvidencePack, type SourcingEvidencePacket } from '../sourcing/evidence-pack'
import { buildBomEvidenceClosurePlan, type BomEvidenceClosureAction, type BomEvidenceClosurePlan, type BomEvidenceClosureRow } from './bom-evidence-closure-plan'

export type SourcingBatchKind =
  | 'component_identity_resolution'
  | 'critical_source_collection'
  | 'source_evidence_repair'
  | 'protocol_source_replacement'
  | 'source_reference_review'
  | 'candidate_sourcing_deferred'

export type SourcingBatchStatus = 'active' | 'waiting' | 'deferred'

export interface SourcingBatchItem {
  id: string
  closureRowId: string
  action: BomEvidenceClosureAction
  priority: BomEvidenceClosureRow['priority']
  status: BomEvidenceClosureRow['status']
  componentWordId: string
  description: string
  searchTerms: string[]
  requiredEvidence: string[]
  acceptanceCriteria: string[]
  rejectionCriteria: string[]
  targetOutcome: string
  blocksProcurement: boolean
}

export interface SourcingBatch {
  id: string
  sequence: number
  kind: SourcingBatchKind
  title: string
  status: SourcingBatchStatus
  rowCount: number
  readyRows: number
  blockedRows: number
  deferredRows: number
  procurementBlockingRows: number
  entryCriteria: string[]
  exitCriteria: string[]
  sourceArtifacts: string[]
  items: SourcingBatchItem[]
}

export interface SourcingBatchPlan {
  summary: {
    closureRows: number
    batches: number
    activeBatches: number
    waitingBatches: number
    deferredBatches: number
    activeRows: number
    waitingRows: number
    deferredRows: number
    procurementBlockingRows: number
    criticalSourceRows: number
    repairRows: number
    protocolReplacementRows: number
    identityRows: number
    candidateDeferredRows: number
    nextBatchId: string | null
    nextItemId: string | null
    canUseForProcurement: boolean
  }
  batches: SourcingBatch[]
}

const BATCH_ORDER: SourcingBatchKind[] = [
  'component_identity_resolution',
  'critical_source_collection',
  'source_evidence_repair',
  'protocol_source_replacement',
  'source_reference_review',
  'candidate_sourcing_deferred',
]

export function buildSourcingBatchPlan(dossier: ProductDossier): SourcingBatchPlan {
  const closure = buildBomEvidenceClosurePlan(dossier)
  const packetByComponent = packetMap(dossier)
  return sourcingBatchPlanFromClosure(closure, packetByComponent)
}

export function sourcingBatchPlanFromClosure(
  closure: BomEvidenceClosurePlan,
  packetByComponent = new Map<string, SourcingEvidencePacket>(),
): SourcingBatchPlan {
  const batches = BATCH_ORDER
    .map((kind, index) => batchFor(kind, index + 1, closure.rows.filter(row => kindForAction(row.action) === kind), packetByComponent))
    .filter((batch): batch is SourcingBatch => batch !== null)

  return {
    summary: {
      closureRows: closure.summary.closureRows,
      batches: batches.length,
      activeBatches: batches.filter(batch => batch.status === 'active').length,
      waitingBatches: batches.filter(batch => batch.status === 'waiting').length,
      deferredBatches: batches.filter(batch => batch.status === 'deferred').length,
      activeRows: batches.reduce((sum, batch) => sum + (batch.status === 'active' ? batch.rowCount : 0), 0),
      waitingRows: batches.reduce((sum, batch) => sum + (batch.status === 'waiting' ? batch.rowCount : 0), 0),
      deferredRows: batches.reduce((sum, batch) => sum + (batch.status === 'deferred' ? batch.rowCount : 0), 0),
      procurementBlockingRows: closure.summary.procurementBlockingRows,
      criticalSourceRows: closure.summary.collectSourceRows,
      repairRows: closure.summary.repairReferenceRows + closure.summary.repairRejectedRows,
      protocolReplacementRows: closure.summary.replaceProtocolRows,
      identityRows: closure.summary.resolveIdentityRows,
      candidateDeferredRows: closure.summary.deferCandidateRows,
      nextBatchId: batches.find(batch => batch.status === 'active')?.id ?? batches.find(batch => batch.status === 'waiting')?.id ?? null,
      nextItemId: batches.find(batch => batch.status === 'active')?.items[0]?.id ?? batches.find(batch => batch.status === 'waiting')?.items[0]?.id ?? null,
      canUseForProcurement: closure.summary.canUseForProcurement,
    },
    batches,
  }
}

export function renderSourcingBatchPlanCsv(plan: SourcingBatchPlan): string {
  const header = [
    'batchId',
    'batchSequence',
    'batchKind',
    'batchTitle',
    'batchStatus',
    'itemId',
    'closureRowId',
    'action',
    'priority',
    'status',
    'componentWordId',
    'description',
    'searchTerms',
    'requiredEvidence',
    'acceptanceCriteria',
    'rejectionCriteria',
    'targetOutcome',
    'blocksProcurement',
    'sourceArtifacts',
  ]
  const rows = plan.batches.flatMap(batch => batch.items.map(item => [
    batch.id,
    String(batch.sequence),
    batch.kind,
    batch.title,
    batch.status,
    item.id,
    item.closureRowId,
    item.action,
    item.priority,
    item.status,
    item.componentWordId,
    item.description,
    item.searchTerms.join('; '),
    item.requiredEvidence.join('; '),
    item.acceptanceCriteria.join('; '),
    item.rejectionCriteria.join('; '),
    item.targetOutcome,
    item.blocksProcurement ? 'yes' : 'no',
    batch.sourceArtifacts.join('; '),
  ]))
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function batchFor(
  kind: SourcingBatchKind,
  sequence: number,
  rows: BomEvidenceClosureRow[],
  packetByComponent: Map<string, SourcingEvidencePacket>,
): SourcingBatch | null {
  if (rows.length === 0) return null
  const items = rows.map((row, index) => itemFor(row, index + 1, kind, packetByComponent.get(row.componentWordId)))
  return {
    id: `sourcing-batch:${sequence}:${kind}`,
    sequence,
    kind,
    title: titleFor(kind),
    status: statusFor(rows, kind),
    rowCount: rows.length,
    readyRows: rows.filter(row => row.status === 'ready').length,
    blockedRows: rows.filter(row => row.status === 'blocked').length,
    deferredRows: rows.filter(row => row.status === 'deferred').length,
    procurementBlockingRows: rows.filter(row => row.blocksProcurement).length,
    entryCriteria: entryCriteriaFor(kind),
    exitCriteria: exitCriteriaFor(kind),
    sourceArtifacts: sourceArtifactsFor(kind),
    items,
  }
}

function itemFor(
  row: BomEvidenceClosureRow,
  sequence: number,
  kind: SourcingBatchKind,
  packet: SourcingEvidencePacket | undefined,
): SourcingBatchItem {
  return {
    id: `${kind}:${sequence}:${row.componentWordId}`,
    closureRowId: row.id,
    action: row.action,
    priority: row.priority,
    status: row.status,
    componentWordId: row.componentWordId,
    description: row.description,
    searchTerms: packet?.searchTerms ?? fallbackSearchTerms(row),
    requiredEvidence: row.requiredEvidence,
    acceptanceCriteria: row.acceptanceCriteria,
    rejectionCriteria: row.rejectionCriteria,
    targetOutcome: targetOutcomeFor(row.action),
    blocksProcurement: row.blocksProcurement,
  }
}

function packetMap(dossier: ProductDossier): Map<string, SourcingEvidencePacket> {
  const pack = buildSourcingEvidencePack(dossier)
  return new Map([...pack.criticalPackets, ...pack.candidatePackets].map(packet => [packet.componentWordId, packet]))
}

function kindForAction(action: BomEvidenceClosureAction): SourcingBatchKind {
  if (action === 'resolve_component_identity') return 'component_identity_resolution'
  if (action === 'collect_source_evidence') return 'critical_source_collection'
  if (action === 'repair_rejected_evidence' || action === 'repair_source_reference') return 'source_evidence_repair'
  if (action === 'replace_protocol_source') return 'protocol_source_replacement'
  if (action === 'review_source_reference') return 'source_reference_review'
  return 'candidate_sourcing_deferred'
}

function statusFor(rows: BomEvidenceClosureRow[], kind: SourcingBatchKind): SourcingBatchStatus {
  if (kind === 'candidate_sourcing_deferred') return 'deferred'
  if (rows.some(row => row.status === 'ready')) return 'active'
  return 'waiting'
}

function titleFor(kind: SourcingBatchKind): string {
  if (kind === 'component_identity_resolution') return 'Resolve Component Identity Before Pricing'
  if (kind === 'critical_source_collection') return 'Collect Critical Source Evidence'
  if (kind === 'source_evidence_repair') return 'Repair Rejected Or Weak Source Evidence'
  if (kind === 'protocol_source_replacement') return 'Replace Protocol Sources'
  if (kind === 'source_reference_review') return 'Review Source References'
  return 'Defer Candidate-Only Sourcing'
}

function entryCriteriaFor(kind: SourcingBatchKind): string[] {
  if (kind === 'component_identity_resolution') return ['Duplicate component identities exist and must be resolved before pricing.']
  if (kind === 'critical_source_collection') return ['Architecture has identified critical BoM lines that are not source-backed.']
  if (kind === 'source_evidence_repair') return ['Sourcing intake has admitted weak references or rejected evidence rows that can be repaired.']
  if (kind === 'protocol_source_replacement') return ['Protocol/test-fixture source rows exist and must be replaced before production use.']
  if (kind === 'source_reference_review') return ['A source row exists but source-reference quality still requires review.']
  return ['Candidate lines remain outside immediate procurement scope.']
}

function exitCriteriaFor(kind: SourcingBatchKind): string[] {
  if (kind === 'component_identity_resolution') return ['Component identity worklist no longer reports ambiguous duplicate rows.']
  if (kind === 'critical_source_collection') return ['Every critical line has admitted supplier/manufacturer/MPN/unit-cost evidence.']
  if (kind === 'source_evidence_repair') return ['Rejected or weak evidence rows pass admission and source-reference quality checks.']
  if (kind === 'protocol_source_replacement') return ['No protocol-only source rows remain in the BoM evidence trace.']
  if (kind === 'source_reference_review') return ['Source Reference Quality Gate rows pass or are removed from procurement scope.']
  return ['Candidate lines are either still explicitly deferred or promoted to critical sourcing scope.']
}

function sourceArtifactsFor(kind: SourcingBatchKind): string[] {
  if (kind === 'component_identity_resolution') return [
    '*.component-identity.csv',
    '*.component-allocation-gate.csv',
    '*.bom-evidence-closure-plan.csv',
  ]
  if (kind === 'candidate_sourcing_deferred') return [
    '*.sourcing-pack.csv',
    '*.bom-evidence-trace.csv',
    '*.bom-evidence-closure-plan.csv',
  ]
  return [
    '*.sourcing-intake-template.csv',
    '*.sourcing-pack.csv',
    '*.sourcing-ledger.csv',
    '*.bom-provenance-manifest.csv',
    '*.source-reference-quality-gate.csv',
    '*.bom-evidence-closure-plan.csv',
  ]
}

function targetOutcomeFor(action: BomEvidenceClosureAction): string {
  if (action === 'collect_source_evidence' || action === 'repair_rejected_evidence') return 'source evidence admitted'
  if (action === 'resolve_component_identity') return 'component identity unambiguous'
  if (action === 'replace_protocol_source' || action === 'repair_source_reference' || action === 'review_source_reference') return 'source reference quality passes'
  return 'candidate remains out of procurement totals'
}

function fallbackSearchTerms(row: BomEvidenceClosureRow): string[] {
  return [
    row.description,
    `${row.description} manufacturer part number`,
    `${row.description} catalogue price`,
    `${row.description} datasheet`,
  ]
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
