import type { BomLine, ProductDossier, SourcingEvidenceRecord } from '../schema/types'

export type BomClaimField =
  | 'supplier'
  | 'manufacturer'
  | 'mpn'
  | 'unit_cost_gbp'
  | 'lead_time_weeks'

export type BomClaimStatus =
  | 'source_backed'
  | 'missing_source'
  | 'not_claimed'
  | 'provenance_violation'

export interface BomProvenanceClaim {
  lineId: string
  componentWordId: string
  description: string
  critical: boolean
  field: BomClaimField
  value: string
  status: BomClaimStatus
  sourceRef?: string
  sourceQuote?: string
  retrievedAt?: string
  nextAction: string
}

export interface BomProvenanceManifest {
  summary: {
    lines: number
    claimRows: number
    sourceBackedClaims: number
    missingSourceClaims: number
    notClaimedRows: number
    provenanceViolations: number
    criticalMissingSourceClaims: number
  }
  rows: BomProvenanceClaim[]
}

export function buildBomProvenanceManifest(dossier: ProductDossier): BomProvenanceManifest {
  const evidenceByComponent = latestEvidenceByComponent(dossier.sources.sourcingEvidence)
  const rows = dossier.bom.lines.flatMap(line => rowsForLine(line, evidenceByComponent.get(line.componentWordId)))
  return {
    summary: {
      lines: dossier.bom.lines.length,
      claimRows: rows.length,
      sourceBackedClaims: rows.filter(row => row.status === 'source_backed').length,
      missingSourceClaims: rows.filter(row => row.status === 'missing_source').length,
      notClaimedRows: rows.filter(row => row.status === 'not_claimed').length,
      provenanceViolations: rows.filter(row => row.status === 'provenance_violation').length,
      criticalMissingSourceClaims: rows.filter(row => row.critical && row.status === 'missing_source').length,
    },
    rows,
  }
}

export function renderBomProvenanceManifestCsv(manifest: BomProvenanceManifest): string {
  const header = [
    'lineId',
    'componentWordId',
    'description',
    'critical',
    'field',
    'value',
    'status',
    'sourceRef',
    'sourceQuote',
    'retrievedAt',
    'nextAction',
  ]
  const rows = manifest.rows.map(row => [
    row.lineId,
    row.componentWordId,
    row.description,
    String(row.critical),
    row.field,
    row.value,
    row.status,
    row.sourceRef ?? '',
    row.sourceQuote ?? '',
    row.retrievedAt ?? '',
    row.nextAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function rowsForLine(line: BomLine, evidence: SourcingEvidenceRecord | undefined): BomProvenanceClaim[] {
  return [
    claim(line, evidence, 'supplier', line.supplier),
    claim(line, evidence, 'manufacturer', line.manufacturer),
    claim(line, evidence, 'mpn', line.mpn),
    claim(line, evidence, 'unit_cost_gbp', line.unitCostGbp === null ? undefined : String(line.unitCostGbp)),
    claim(line, evidence, 'lead_time_weeks', line.leadTimeWeeks === undefined ? undefined : String(line.leadTimeWeeks), false),
  ]
}

function claim(
  line: BomLine,
  evidence: SourcingEvidenceRecord | undefined,
  field: BomClaimField,
  value: string | undefined,
  requiredForCritical = true,
): BomProvenanceClaim {
  const sourceRef = evidence?.evidence.ref
  const hasSource = Boolean(sourceRef)
  if (value && hasSource) return base(line, field, value, 'source_backed', evidence, 'Keep source record attached; refresh evidence before procurement use.')
  if (value && !hasSource) return base(line, field, value, 'provenance_violation', undefined, 'Remove the claim or attach an admissible source evidence record.')
  if (line.critical && requiredForCritical) return base(line, field, '', 'missing_source', undefined, 'Admit source-backed supplier/manufacturer/MPN/unit-cost evidence before BoM can pass.')
  return base(line, field, '', 'not_claimed', undefined, 'No claim is made for this field yet.')
}

function base(
  line: BomLine,
  field: BomClaimField,
  value: string,
  status: BomClaimStatus,
  evidence: SourcingEvidenceRecord | undefined,
  nextAction: string,
): BomProvenanceClaim {
  return {
    lineId: line.id,
    componentWordId: line.componentWordId,
    description: line.description,
    critical: line.critical,
    field,
    value,
    status,
    sourceRef: evidence?.evidence.ref,
    sourceQuote: evidence?.evidence.quote,
    retrievedAt: evidence?.retrievedAt,
    nextAction,
  }
}

function latestEvidenceByComponent(records: SourcingEvidenceRecord[]): Map<string, SourcingEvidenceRecord> {
  const map = new Map<string, SourcingEvidenceRecord>()
  for (const record of records) {
    const existing = map.get(record.componentWordId)
    if (!existing || record.retrievedAt >= existing.retrievedAt) map.set(record.componentWordId, record)
  }
  return map
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
