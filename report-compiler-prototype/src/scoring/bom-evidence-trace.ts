import type { ProductDossier } from '../schema/types'
import { buildSourcingLineLedger, type SourcingLineLedgerRow } from '../sourcing/ledger'
import { buildBomProvenanceManifest, type BomClaimStatus, type BomProvenanceClaim } from '../sourcing/provenance-manifest'
import { buildSourceReferenceQualityGate, type SourceReferenceClass, type SourceReferenceQualityStatus } from './source-reference-quality-gate'

export type BomEvidenceTraceStatus =
  | 'candidate_only'
  | 'critical_unsourced'
  | 'rejected_evidence'
  | 'duplicate_identity_review_required'
  | 'protocol_only'
  | 'source_reference_blocked'
  | 'source_admitted_needs_reference_review'
  | 'production_eligible'

export interface BomEvidenceTraceRow {
  id: string
  lineId: string
  componentWordId: string
  description: string
  priority: 'critical' | 'candidate'
  quantity: number
  unit: string
  traceStatus: BomEvidenceTraceStatus
  ledgerStatus: SourcingLineLedgerRow['ledgerStatus']
  duplicateResolution: SourcingLineLedgerRow['duplicateResolution']
  supplier?: string
  manufacturer?: string
  mpn?: string
  unitCostGbp: number | null
  totalCostGbp: number | null
  sourceRef?: string
  sourceReferenceClass?: SourceReferenceClass
  sourceReferenceStatus?: SourceReferenceQualityStatus
  sourceQualityIssues: string[]
  requiredClaimStatuses: Record<'supplier' | 'manufacturer' | 'mpn' | 'unit_cost_gbp', BomClaimStatus>
  sourceBackedRequiredClaims: number
  missingRequiredClaims: number
  provenanceViolations: number
  canDisplayCandidate: boolean
  canDisplayPricedReview: boolean
  canUseForProcurement: boolean
  requiredAction: string
}

export interface BomEvidenceTraceMatrix {
  summary: {
    lines: number
    criticalLines: number
    candidateOnlyRows: number
    criticalUnsourcedRows: number
    admittedPricedRows: number
    pricedReviewRows: number
    productionEligibleRows: number
    productionEligibleCriticalRows: number
    protocolOnlyRows: number
    sourceReferenceBlockedRows: number
    rejectedEvidenceRows: number
    duplicateReviewRows: number
    canRenderCandidateBom: boolean
    canRenderPricedReviewBom: boolean
    canUseForProcurement: boolean
    nextRowId: string | null
  }
  rows: BomEvidenceTraceRow[]
}

const REQUIRED_CLAIM_FIELDS = ['supplier', 'manufacturer', 'mpn', 'unit_cost_gbp'] as const

export function buildBomEvidenceTraceMatrix(dossier: ProductDossier): BomEvidenceTraceMatrix {
  const ledger = buildSourcingLineLedger(dossier)
  const manifest = buildBomProvenanceManifest(dossier)
  const sourceQuality = buildSourceReferenceQualityGate(dossier)
  const claimsByLine = claimsByLineId(manifest.rows)
  const sourceQualityByComponent = new Map(sourceQuality.rows.map(row => [row.componentWordId, row]))

  const rows = ledger.rows.map(row => traceRow(row, claimsByLine.get(row.lineId) ?? [], sourceQualityByComponent.get(row.componentWordId)))
  const criticalRows = rows.filter(row => row.priority === 'critical')

  return {
    summary: {
      lines: rows.length,
      criticalLines: criticalRows.length,
      candidateOnlyRows: rows.filter(row => row.traceStatus === 'candidate_only').length,
      criticalUnsourcedRows: rows.filter(row => row.traceStatus === 'critical_unsourced').length,
      admittedPricedRows: rows.filter(row => row.ledgerStatus === 'admitted_priced').length,
      pricedReviewRows: rows.filter(row => row.canDisplayPricedReview).length,
      productionEligibleRows: rows.filter(row => row.traceStatus === 'production_eligible').length,
      productionEligibleCriticalRows: criticalRows.filter(row => row.traceStatus === 'production_eligible').length,
      protocolOnlyRows: rows.filter(row => row.traceStatus === 'protocol_only').length,
      sourceReferenceBlockedRows: rows.filter(row => row.traceStatus === 'source_reference_blocked').length,
      rejectedEvidenceRows: rows.filter(row => row.traceStatus === 'rejected_evidence').length,
      duplicateReviewRows: rows.filter(row => row.traceStatus === 'duplicate_identity_review_required').length,
      canRenderCandidateBom: rows.length > 0,
      canRenderPricedReviewBom: rows.some(row => row.canDisplayPricedReview),
      canUseForProcurement: criticalRows.length > 0 && criticalRows.every(row => row.canUseForProcurement),
      nextRowId: rows.find(row => !row.canUseForProcurement && (row.priority === 'critical' || row.ledgerStatus === 'admitted_priced'))?.id
        ?? rows.find(row => !row.canUseForProcurement)?.id
        ?? null,
    },
    rows,
  }
}

export function renderBomEvidenceTraceMatrixCsv(matrix: BomEvidenceTraceMatrix): string {
  const header = [
    'id',
    'lineId',
    'componentWordId',
    'description',
    'priority',
    'quantity',
    'unit',
    'traceStatus',
    'ledgerStatus',
    'duplicateResolution',
    'supplier',
    'manufacturer',
    'mpn',
    'unitCostGbp',
    'totalCostGbp',
    'sourceRef',
    'sourceReferenceClass',
    'sourceReferenceStatus',
    'sourceQualityIssues',
    'supplierClaim',
    'manufacturerClaim',
    'mpnClaim',
    'unitCostClaim',
    'sourceBackedRequiredClaims',
    'missingRequiredClaims',
    'provenanceViolations',
    'canDisplayCandidate',
    'canDisplayPricedReview',
    'canUseForProcurement',
    'requiredAction',
  ]
  const rows = matrix.rows.map(row => [
    row.id,
    row.lineId,
    row.componentWordId,
    row.description,
    row.priority,
    String(row.quantity),
    row.unit,
    row.traceStatus,
    row.ledgerStatus,
    row.duplicateResolution,
    row.supplier ?? '',
    row.manufacturer ?? '',
    row.mpn ?? '',
    row.unitCostGbp === null ? '' : String(row.unitCostGbp),
    row.totalCostGbp === null ? '' : String(row.totalCostGbp),
    row.sourceRef ?? '',
    row.sourceReferenceClass ?? '',
    row.sourceReferenceStatus ?? '',
    row.sourceQualityIssues.join('; '),
    row.requiredClaimStatuses.supplier,
    row.requiredClaimStatuses.manufacturer,
    row.requiredClaimStatuses.mpn,
    row.requiredClaimStatuses.unit_cost_gbp,
    String(row.sourceBackedRequiredClaims),
    String(row.missingRequiredClaims),
    String(row.provenanceViolations),
    row.canDisplayCandidate ? 'yes' : 'no',
    row.canDisplayPricedReview ? 'yes' : 'no',
    row.canUseForProcurement ? 'yes' : 'no',
    row.requiredAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function traceRow(
  ledger: SourcingLineLedgerRow,
  claims: BomProvenanceClaim[],
  sourceQuality: ReturnType<typeof buildSourceReferenceQualityGate>['rows'][number] | undefined,
): BomEvidenceTraceRow {
  const requiredClaimStatuses = requiredClaimStatusesFor(claims)
  const sourceBackedRequiredClaims = REQUIRED_CLAIM_FIELDS.filter(field => requiredClaimStatuses[field] === 'source_backed').length
  const missingRequiredClaims = REQUIRED_CLAIM_FIELDS.filter(field => requiredClaimStatuses[field] === 'missing_source').length
  const provenanceViolations = REQUIRED_CLAIM_FIELDS.filter(field => requiredClaimStatuses[field] === 'provenance_violation').length
  const traceStatus = statusFor(ledger, sourceQuality, sourceBackedRequiredClaims, provenanceViolations)
  const canDisplayPricedReview = ledger.ledgerStatus === 'admitted_priced' && provenanceViolations === 0 && sourceBackedRequiredClaims === REQUIRED_CLAIM_FIELDS.length
  const canUseForProcurement = traceStatus === 'production_eligible'

  return {
    id: `bom-trace:${ledger.lineId}`,
    lineId: ledger.lineId,
    componentWordId: ledger.componentWordId,
    description: ledger.description,
    priority: ledger.priority,
    quantity: ledger.quantity,
    unit: ledger.unit,
    traceStatus,
    ledgerStatus: ledger.ledgerStatus,
    duplicateResolution: ledger.duplicateResolution,
    supplier: ledger.supplier,
    manufacturer: ledger.manufacturer,
    mpn: ledger.mpn,
    unitCostGbp: ledger.unitCostGbp,
    totalCostGbp: ledger.totalCostGbp,
    sourceRef: ledger.evidenceRef,
    sourceReferenceClass: sourceQuality?.referenceClass,
    sourceReferenceStatus: sourceQuality?.status,
    sourceQualityIssues: sourceQuality?.issues ?? [],
    requiredClaimStatuses,
    sourceBackedRequiredClaims,
    missingRequiredClaims,
    provenanceViolations,
    canDisplayCandidate: true,
    canDisplayPricedReview,
    canUseForProcurement,
    requiredAction: actionFor(traceStatus, ledger, sourceQuality),
  }
}

function statusFor(
  ledger: SourcingLineLedgerRow,
  sourceQuality: ReturnType<typeof buildSourceReferenceQualityGate>['rows'][number] | undefined,
  sourceBackedRequiredClaims: number,
  provenanceViolations: number,
): BomEvidenceTraceStatus {
  if (ledger.duplicateResolution === 'canonical_review_required') return 'duplicate_identity_review_required'
  if (ledger.ledgerStatus === 'rejected_evidence') return 'rejected_evidence'
  if (ledger.ledgerStatus === 'critical_unpriced') return 'critical_unsourced'
  if (ledger.ledgerStatus === 'candidate_unpriced') return 'candidate_only'
  if (!sourceQuality || provenanceViolations > 0 || sourceBackedRequiredClaims < REQUIRED_CLAIM_FIELDS.length) return 'source_reference_blocked'
  if (sourceQuality.referenceClass === 'protocol_fixture') return 'protocol_only'
  if (sourceQuality.status === 'blocked') return 'source_reference_blocked'
  if (sourceQuality.status === 'review') return 'source_admitted_needs_reference_review'
  return 'production_eligible'
}

function actionFor(
  status: BomEvidenceTraceStatus,
  ledger: SourcingLineLedgerRow,
  sourceQuality: ReturnType<typeof buildSourceReferenceQualityGate>['rows'][number] | undefined,
): string {
  if (status === 'production_eligible') return 'Line is source-backed and reference-quality checked; refresh evidence before procurement.'
  if (status === 'protocol_only') return 'Replace protocol fixture with production supplier/catalogue evidence before procurement use.'
  if (status === 'source_admitted_needs_reference_review') return sourceQuality?.requiredAction ?? 'Review admitted source reference before procurement use.'
  if (status === 'source_reference_blocked') return sourceQuality?.requiredAction ?? 'Attach source-backed supplier/manufacturer/MPN/unit-cost claims and pass source-reference quality.'
  if (status === 'duplicate_identity_review_required') return 'Resolve duplicate component identity before pricing or using this line.'
  if (status === 'rejected_evidence') return ledger.rejectionReasons.join(' ') || 'Repair rejected sourcing evidence and rerun admission.'
  if (status === 'critical_unsourced') return 'Collect admissible source evidence for this critical line before BoM can pass.'
  return 'Keep as candidate-only until critical sourcing is complete or procurement planning starts.'
}

function requiredClaimStatusesFor(claims: BomProvenanceClaim[]): Record<'supplier' | 'manufacturer' | 'mpn' | 'unit_cost_gbp', BomClaimStatus> {
  return {
    supplier: claimStatus(claims, 'supplier'),
    manufacturer: claimStatus(claims, 'manufacturer'),
    mpn: claimStatus(claims, 'mpn'),
    unit_cost_gbp: claimStatus(claims, 'unit_cost_gbp'),
  }
}

function claimStatus(claims: BomProvenanceClaim[], field: (typeof REQUIRED_CLAIM_FIELDS)[number]): BomClaimStatus {
  return claims.find(claim => claim.field === field)?.status ?? 'missing_source'
}

function claimsByLineId(claims: BomProvenanceClaim[]): Map<string, BomProvenanceClaim[]> {
  const map = new Map<string, BomProvenanceClaim[]>()
  for (const claim of claims) {
    const current = map.get(claim.lineId) ?? []
    current.push(claim)
    map.set(claim.lineId, current)
  }
  return map
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
