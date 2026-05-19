import type { ProductDossier, SourcingEvidenceRecord } from '../schema/types'

export type SourceReferenceQualityVerdict =
  | 'source_quality_ready'
  | 'protocol_source_only'
  | 'source_quality_review_required'
  | 'source_quality_blocked'
  | 'no_sourcing_evidence'

export type SourceReferenceClass =
  | 'candidate_external_url'
  | 'placeholder_url'
  | 'protocol_fixture'
  | 'local_or_internal_reference'
  | 'unknown_reference'

export type SourceReferenceQualityStatus = 'pass' | 'review' | 'blocked'

export interface SourceReferenceQualityRow {
  id: string
  componentWordId: string
  supplierName: string
  manufacturer?: string
  mpn?: string
  ref: string
  referenceClass: SourceReferenceClass
  status: SourceReferenceQualityStatus
  hasHttps: boolean
  hasCompleteMetadata: boolean
  quoteAnchoredToManufacturerOrMpn: boolean
  timestampFresh: boolean
  sourceGrade: string
  issues: string[]
  requiredAction: string
}

export interface SourceReferenceQualityGate {
  verdict: SourceReferenceQualityVerdict
  summary: {
    rows: number
    passRows: number
    reviewRows: number
    blockedRows: number
    passRatio: number
    candidateExternalUrlRows: number
    placeholderUrlRows: number
    protocolFixtureRows: number
    localOrInternalRows: number
    unknownReferenceRows: number
    httpsRows: number
    completeMetadataRows: number
    quoteAnchoredRows: number
    freshTimestampRows: number
  }
  rows: SourceReferenceQualityRow[]
  blockers: string[]
  nextActions: string[]
}

const MAX_SOURCE_AGE_DAYS = 370

export function buildSourceReferenceQualityGate(
  dossier: ProductDossier,
  now = new Date(),
): SourceReferenceQualityGate {
  const rows = dossier.sources.sourcingEvidence.map((record, index) => qualityRow(record, index, now))
  const passRows = rows.filter(row => row.status === 'pass').length
  const reviewRows = rows.filter(row => row.status === 'review').length
  const blockedRows = rows.filter(row => row.status === 'blocked').length
  const protocolFixtureRows = rows.filter(row => row.referenceClass === 'protocol_fixture').length
  const verdict: SourceReferenceQualityVerdict = rows.length === 0
    ? 'no_sourcing_evidence'
    : passRows === rows.length
      ? 'source_quality_ready'
      : protocolFixtureRows === rows.length ? 'protocol_source_only'
        : blockedRows > 0 ? 'source_quality_blocked' : 'source_quality_review_required'

  return {
    verdict,
    summary: {
      rows: rows.length,
      passRows,
      reviewRows,
      blockedRows,
      passRatio: ratio(passRows, rows.length),
      candidateExternalUrlRows: rows.filter(row => row.referenceClass === 'candidate_external_url').length,
      placeholderUrlRows: rows.filter(row => row.referenceClass === 'placeholder_url').length,
      protocolFixtureRows,
      localOrInternalRows: rows.filter(row => row.referenceClass === 'local_or_internal_reference').length,
      unknownReferenceRows: rows.filter(row => row.referenceClass === 'unknown_reference').length,
      httpsRows: rows.filter(row => row.hasHttps).length,
      completeMetadataRows: rows.filter(row => row.hasCompleteMetadata).length,
      quoteAnchoredRows: rows.filter(row => row.quoteAnchoredToManufacturerOrMpn).length,
      freshTimestampRows: rows.filter(row => row.timestampFresh).length,
    },
    rows,
    blockers: rows
      .filter(row => row.status === 'blocked')
      .map(row => `${row.id}: ${row.issues.join('; ')}`),
    nextActions: Array.from(new Set(rows
      .filter(row => row.status !== 'pass')
      .map(row => row.requiredAction))),
  }
}

export function renderSourceReferenceQualityGateCsv(gate: SourceReferenceQualityGate): string {
  const header = [
    'id',
    'componentWordId',
    'supplierName',
    'manufacturer',
    'mpn',
    'ref',
    'referenceClass',
    'status',
    'hasHttps',
    'hasCompleteMetadata',
    'quoteAnchoredToManufacturerOrMpn',
    'timestampFresh',
    'sourceGrade',
    'issues',
    'requiredAction',
  ]
  const rows = gate.rows.map(row => [
    row.id,
    row.componentWordId,
    row.supplierName,
    row.manufacturer ?? '',
    row.mpn ?? '',
    row.ref,
    row.referenceClass,
    row.status,
    String(row.hasHttps),
    String(row.hasCompleteMetadata),
    String(row.quoteAnchoredToManufacturerOrMpn),
    String(row.timestampFresh),
    row.sourceGrade,
    row.issues.join('; '),
    row.requiredAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function qualityRow(record: SourcingEvidenceRecord, index: number, now: Date): SourceReferenceQualityRow {
  const referenceClass = classifySourceReference(record.evidence.ref)
  const hasHttps = record.evidence.ref.trim().toLowerCase().startsWith('https://')
  const missingMetadata = missingRequiredMetadata(record)
  const hasCompleteMetadata = missingMetadata.length === 0
  const quoteAnchoredToManufacturerOrMpn = quoteAnchored(record)
  const timestampFresh = freshTimestamp(record.retrievedAt, now)
  const issues = rowIssues(record, referenceClass, hasHttps, missingMetadata, quoteAnchoredToManufacturerOrMpn, timestampFresh)
  const status = rowStatus(referenceClass, issues)
  return {
    id: `source-quality:${index + 1}:${record.componentWordId}`,
    componentWordId: record.componentWordId,
    supplierName: record.supplierName,
    manufacturer: record.manufacturer,
    mpn: record.mpn,
    ref: record.evidence.ref,
    referenceClass,
    status,
    hasHttps,
    hasCompleteMetadata,
    quoteAnchoredToManufacturerOrMpn,
    timestampFresh,
    sourceGrade: record.sourceGrade,
    issues,
    requiredAction: actionFor(referenceClass, issues),
  }
}

function classifySourceReference(ref: string): SourceReferenceClass {
  const trimmed = ref.trim()
  const lower = trimmed.toLowerCase()
  if (lower.startsWith('test-fixture://')) return 'protocol_fixture'
  if (lower.startsWith('file://') || lower.startsWith('/') || lower.startsWith('internal://') || lower.startsWith('review://') || lower.startsWith('app://')) return 'local_or_internal_reference'
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return 'unknown_reference'
  try {
    const host = new URL(trimmed).hostname.toLowerCase()
    return isPlaceholderHost(host) ? 'placeholder_url' : 'candidate_external_url'
  } catch {
    return 'unknown_reference'
  }
}

function rowIssues(
  record: SourcingEvidenceRecord,
  referenceClass: SourceReferenceClass,
  hasHttps: boolean,
  missingMetadata: string[],
  quoteAnchoredToManufacturerOrMpn: boolean,
  timestampFresh: boolean,
): string[] {
  const issues: string[] = []
  if (referenceClass === 'placeholder_url') issues.push('Source URL uses a reserved or placeholder host.')
  if (referenceClass === 'local_or_internal_reference') issues.push('Sourcing evidence must be backed by a retrievable supplier or catalogue reference.')
  if (referenceClass === 'unknown_reference') issues.push('Source reference is not a recognised URL or governed source reference.')
  if (!hasHttps && referenceClass === 'candidate_external_url') issues.push('External source URL should use HTTPS.')
  for (const field of missingMetadata) issues.push(`Missing or invalid ${field}.`)
  if (!quoteAnchoredToManufacturerOrMpn && referenceClass === 'candidate_external_url') issues.push('Source quote must mention the manufacturer or MPN.')
  if (!timestampFresh) issues.push(`retrievedAt must be a valid timestamp no more than ${MAX_SOURCE_AGE_DAYS} days old and not in the future.`)
  return issues
}

function rowStatus(referenceClass: SourceReferenceClass, issues: string[]): SourceReferenceQualityStatus {
  if (referenceClass === 'protocol_fixture') return 'review'
  if (issues.length === 0 && referenceClass === 'candidate_external_url') return 'pass'
  return 'blocked'
}

function actionFor(referenceClass: SourceReferenceClass, issues: string[]): string {
  if (referenceClass === 'protocol_fixture') return 'Replace protocol fixture with a retrievable supplier/catalogue URL before production costing.'
  if (issues.length === 0) return 'Keep source metadata attached and refresh before procurement.'
  return 'Replace or complete the source record: use HTTPS, avoid placeholder domains, include supplier/manufacturer/MPN/unit cost, anchor the quote to manufacturer or MPN, and refresh retrievedAt.'
}

function missingRequiredMetadata(record: SourcingEvidenceRecord): string[] {
  const fields: Array<[string, boolean]> = [
    ['supplierName', record.supplierName.trim().length > 0],
    ['manufacturer', (record.manufacturer ?? '').trim().length > 0],
    ['mpn', (record.mpn ?? '').trim().length > 0],
    ['unitCostGbp', Number.isFinite(record.unitCostGbp) && record.unitCostGbp > 0],
    ['evidence.quote', (record.evidence.quote ?? '').trim().length > 0],
    ['retrievedAt', record.retrievedAt.trim().length > 0],
  ]
  return fields.filter(([, present]) => !present).map(([field]) => field)
}

function quoteAnchored(record: SourcingEvidenceRecord): boolean {
  const quote = normalise(record.evidence.quote ?? '')
  const manufacturer = normalise(record.manufacturer ?? '')
  const mpn = normalise(record.mpn ?? '')
  return Boolean((manufacturer && quote.includes(manufacturer)) || (mpn && quote.includes(mpn)))
}

function freshTimestamp(value: string, now: Date): boolean {
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return false
  const ageMs = now.getTime() - timestamp.getTime()
  if (ageMs < 0) return false
  const ageDays = ageMs / (24 * 60 * 60 * 1000)
  return ageDays <= MAX_SOURCE_AGE_DAYS
}

function isPlaceholderHost(host: string): boolean {
  return host === 'example.com'
    || host === 'example.org'
    || host === 'example.net'
    || host.endsWith('.example')
    || host.endsWith('.test')
    || host.endsWith('.invalid')
    || host.endsWith('.localhost')
    || host === 'localhost'
    || host === '127.0.0.1'
    || host === '0.0.0.0'
    || host === '::1'
}

function normalise(value: string): string {
  return value.trim().toLowerCase()
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 100) / 100
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
