import type { ProductDossier, SourcingEvidenceRecord, VerificationEvidenceRecord } from '../schema/types'

export type EvidenceAuthenticityVerdict =
  | 'production_ready'
  | 'protocol_only'
  | 'review_required'
  | 'no_evidence'

export type EvidenceAuthenticityKind = 'sourcing' | 'verification'

export type EvidenceReferenceClass =
  | 'external_url'
  | 'protocol_fixture'
  | 'local_file'
  | 'internal_reference'
  | 'unknown_reference'

export type EvidenceAuthenticityStatus =
  | 'accepted_production_evidence'
  | 'protocol_fixture'
  | 'review_required'
  | 'missing_metadata'

export interface EvidenceAuthenticityRow {
  id: string
  kind: EvidenceAuthenticityKind
  subjectId: string
  ref: string
  referenceClass: EvidenceReferenceClass
  status: EvidenceAuthenticityStatus
  reviewerName?: string
  timestamp?: string
  sourceGrade?: string
  reason: string
  requiredAction: string
}

export interface EvidenceAuthenticityGate {
  verdict: EvidenceAuthenticityVerdict
  summary: {
    rows: number
    sourcingRows: number
    verificationRows: number
    productionReadyRows: number
    protocolFixtureRows: number
    reviewRequiredRows: number
    missingMetadataRows: number
    externalUrlRows: number
    internalReferenceRows: number
    localFileRows: number
    unknownReferenceRows: number
    passRatio: number
  }
  rows: EvidenceAuthenticityRow[]
  promotionBlockers: string[]
  nextActions: string[]
}

export function buildEvidenceAuthenticityGate(dossier: ProductDossier): EvidenceAuthenticityGate {
  const rows = [
    ...dossier.sources.sourcingEvidence.map((record, index) => sourcingRow(record, index)),
    ...dossier.sources.verificationEvidence.map((record, index) => verificationRow(record, index)),
  ]
  const productionReadyRows = rows.filter(row => row.status === 'accepted_production_evidence').length
  const protocolFixtureRows = rows.filter(row => row.status === 'protocol_fixture').length
  const reviewRequiredRows = rows.filter(row => row.status === 'review_required').length
  const missingMetadataRows = rows.filter(row => row.status === 'missing_metadata').length
  const verdict: EvidenceAuthenticityVerdict = rows.length === 0
    ? 'no_evidence'
    : productionReadyRows === rows.length
      ? 'production_ready'
      : protocolFixtureRows === rows.length ? 'protocol_only' : 'review_required'

  return {
    verdict,
    summary: {
      rows: rows.length,
      sourcingRows: rows.filter(row => row.kind === 'sourcing').length,
      verificationRows: rows.filter(row => row.kind === 'verification').length,
      productionReadyRows,
      protocolFixtureRows,
      reviewRequiredRows,
      missingMetadataRows,
      externalUrlRows: rows.filter(row => row.referenceClass === 'external_url').length,
      internalReferenceRows: rows.filter(row => row.referenceClass === 'internal_reference').length,
      localFileRows: rows.filter(row => row.referenceClass === 'local_file').length,
      unknownReferenceRows: rows.filter(row => row.referenceClass === 'unknown_reference').length,
      passRatio: ratio(productionReadyRows, rows.length),
    },
    rows,
    promotionBlockers: rows
      .filter(row => row.status !== 'accepted_production_evidence')
      .map(row => `${row.id}: ${row.reason}`),
    nextActions: Array.from(new Set(rows
      .filter(row => row.status !== 'accepted_production_evidence')
      .map(row => row.requiredAction))),
  }
}

export function renderEvidenceAuthenticityGateCsv(gate: EvidenceAuthenticityGate): string {
  const header = [
    'id',
    'kind',
    'subjectId',
    'ref',
    'referenceClass',
    'status',
    'reviewerName',
    'timestamp',
    'sourceGrade',
    'reason',
    'requiredAction',
  ]
  const rows = gate.rows.map(row => [
    row.id,
    row.kind,
    row.subjectId,
    row.ref,
    row.referenceClass,
    row.status,
    row.reviewerName ?? '',
    row.timestamp ?? '',
    row.sourceGrade ?? '',
    row.reason,
    row.requiredAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function sourcingRow(record: SourcingEvidenceRecord, index: number): EvidenceAuthenticityRow {
  const referenceClass = classifyReference(record.evidence.ref)
  const missing = missingMetadata([
    ['supplierName', record.supplierName],
    ['unitCostGbp', Number.isFinite(record.unitCostGbp) && record.unitCostGbp > 0 ? String(record.unitCostGbp) : ''],
    ['retrievedAt', record.retrievedAt],
    ['evidence.quote', record.evidence.quote ?? ''],
  ])
  const status = statusForSourcing(referenceClass, missing)
  return {
    id: `sourcing:${index + 1}:${record.componentWordId}`,
    kind: 'sourcing',
    subjectId: record.componentWordId,
    ref: record.evidence.ref,
    referenceClass,
    status,
    timestamp: record.retrievedAt,
    sourceGrade: record.sourceGrade,
    reason: reasonFor(status, referenceClass, missing, 'source evidence'),
    requiredAction: actionFor(status, 'Replace protocol or non-external BoM evidence with a retrievable supplier/catalogue URL and refreshed timestamp.'),
  }
}

function verificationRow(record: VerificationEvidenceRecord, index: number): EvidenceAuthenticityRow {
  const referenceClass = classifyReference(record.evidenceRef)
  const protocolReviewer = record.reviewerName.toLowerCase().includes('protocol')
  const missing = missingMetadata([
    ['reviewerName', record.reviewerName],
    ['evidenceNote', record.evidenceNote],
    ['reviewedAt', record.reviewedAt],
  ])
  const status = statusForVerification(referenceClass, missing, protocolReviewer)
  return {
    id: `verification:${index + 1}:${record.activityId}`,
    kind: 'verification',
    subjectId: record.activityId,
    ref: record.evidenceRef,
    referenceClass,
    status,
    reviewerName: record.reviewerName,
    timestamp: record.reviewedAt,
    reason: reasonFor(status, referenceClass, missing, 'reviewer evidence'),
    requiredAction: actionFor(status, 'Replace protocol reviewer fixtures with named reviewer signoff evidence and a retrievable evidence reference.'),
  }
}

function statusForSourcing(
  referenceClass: EvidenceReferenceClass,
  missing: string[],
): EvidenceAuthenticityStatus {
  if (referenceClass === 'protocol_fixture') return 'protocol_fixture'
  if (missing.length > 0) return 'missing_metadata'
  if (referenceClass === 'external_url') return 'accepted_production_evidence'
  return 'review_required'
}

function statusForVerification(
  referenceClass: EvidenceReferenceClass,
  missing: string[],
  protocolReviewer: boolean,
): EvidenceAuthenticityStatus {
  if (referenceClass === 'protocol_fixture' || protocolReviewer) return 'protocol_fixture'
  if (missing.length > 0) return 'missing_metadata'
  if (referenceClass === 'unknown_reference') return 'review_required'
  return 'accepted_production_evidence'
}

function classifyReference(ref: string): EvidenceReferenceClass {
  const trimmed = ref.trim().toLowerCase()
  if (trimmed.startsWith('test-fixture://')) return 'protocol_fixture'
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return 'external_url'
  if (trimmed.startsWith('file://') || trimmed.startsWith('/')) return 'local_file'
  if (trimmed.startsWith('internal://') || trimmed.startsWith('review://') || trimmed.startsWith('app://')) return 'internal_reference'
  return 'unknown_reference'
}

function missingMetadata(fields: Array<[string, string]>): string[] {
  return fields
    .filter(([, value]) => !value.trim())
    .map(([field]) => field)
}

function reasonFor(
  status: EvidenceAuthenticityStatus,
  referenceClass: EvidenceReferenceClass,
  missing: string[],
  label: string,
): string {
  if (status === 'accepted_production_evidence') return `${label} has production-grade metadata and a ${referenceClass} reference.`
  if (status === 'protocol_fixture') return `${label} is a protocol fixture and proves mechanics only.`
  if (status === 'missing_metadata') return `${label} is missing required metadata: ${missing.join(', ')}.`
  return `${label} uses ${referenceClass}; production use needs a retrievable or governed evidence reference.`
}

function actionFor(status: EvidenceAuthenticityStatus, replacementAction: string): string {
  if (status === 'accepted_production_evidence') return 'Keep evidence reference attached and refresh before procurement or publication.'
  if (status === 'missing_metadata') return 'Complete the missing evidence metadata, then rerun evidence authenticity.'
  return replacementAction
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 100) / 100
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
