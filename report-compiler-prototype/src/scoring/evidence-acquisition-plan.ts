import type { ArchitectureReadiness, BatchSectionScore, ProductDossier, SectionIssue, Severity } from '../schema/types'
import { buildEvidenceGapRegister, type EvidenceGapRow } from './evidence-gap-register'

export type EvidenceAcquisitionKind = 'sourcing' | 'verification'

export type EvidenceAcquisitionTarget =
  | 'supplier_catalogue_or_quote'
  | 'named_engineering_review'

export interface EvidenceAcquisitionRow {
  id: string
  sequence: number
  kind: EvidenceAcquisitionKind
  priority: Severity
  status: EvidenceGapRow['status']
  subjectId: string
  scope: string
  issue: string
  acquisitionTarget: EvidenceAcquisitionTarget
  requiredFields: string[]
  disallowedEvidence: string[]
  intakeArtifacts: string[]
  acceptanceCriteria: string[]
  blocksBom: boolean
  blocksPublish: boolean
}

export interface EvidenceAcquisitionPlan {
  summary: {
    rows: number
    sourcingRows: number
    verificationRows: number
    readyRows: number
    blockedRows: number
    bomBlockingRows: number
    publishBlockingRows: number
    nextRowId: string | null
  }
  rows: EvidenceAcquisitionRow[]
}

export function buildEvidenceAcquisitionPlan(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
  score?: BatchSectionScore,
): EvidenceAcquisitionPlan {
  const register = buildEvidenceGapRegister(dossier, readiness, issues, score)
  const rows = register.rows
    .filter(row => row.closurePath === 'sourcing_intake' || row.closurePath === 'verification_intake')
    .map((row, index) => acquisitionRow(row, index + 1))

  return {
    summary: {
      rows: rows.length,
      sourcingRows: rows.filter(row => row.kind === 'sourcing').length,
      verificationRows: rows.filter(row => row.kind === 'verification').length,
      readyRows: rows.filter(row => row.status === 'ready_for_intake').length,
      blockedRows: rows.filter(row => row.status === 'blocked').length,
      bomBlockingRows: rows.filter(row => row.blocksBom).length,
      publishBlockingRows: rows.filter(row => row.blocksPublish).length,
      nextRowId: rows.find(row => row.status === 'ready_for_intake')?.id ?? rows[0]?.id ?? null,
    },
    rows,
  }
}

export function renderEvidenceAcquisitionPlanCsv(plan: EvidenceAcquisitionPlan): string {
  const header = [
    'id',
    'sequence',
    'kind',
    'priority',
    'status',
    'subjectId',
    'scope',
    'issue',
    'acquisitionTarget',
    'requiredFields',
    'disallowedEvidence',
    'intakeArtifacts',
    'acceptanceCriteria',
    'blocksBom',
    'blocksPublish',
  ]
  const rows = plan.rows.map(row => [
    row.id,
    String(row.sequence),
    row.kind,
    row.priority,
    row.status,
    row.subjectId,
    row.scope,
    row.issue,
    row.acquisitionTarget,
    row.requiredFields.join('; '),
    row.disallowedEvidence.join('; '),
    row.intakeArtifacts.join('; '),
    row.acceptanceCriteria.join('; '),
    row.blocksBom ? 'yes' : 'no',
    row.blocksPublish ? 'yes' : 'no',
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function acquisitionRow(row: EvidenceGapRow, sequence: number): EvidenceAcquisitionRow {
  const kind: EvidenceAcquisitionKind = row.closurePath === 'sourcing_intake' ? 'sourcing' : 'verification'
  return {
    id: `acquire:${sequence}:${row.id}`,
    sequence,
    kind,
    priority: row.priority,
    status: row.status,
    subjectId: row.linkedIds[0] ?? row.id,
    scope: row.scope,
    issue: row.issue,
    acquisitionTarget: kind === 'sourcing' ? 'supplier_catalogue_or_quote' : 'named_engineering_review',
    requiredFields: requiredFieldsFor(kind),
    disallowedEvidence: disallowedEvidenceFor(kind),
    intakeArtifacts: intakeArtifactsFor(kind),
    acceptanceCriteria: acceptanceCriteriaFor(kind),
    blocksBom: row.blocks.includes('bom'),
    blocksPublish: row.blocks.includes('publishable'),
  }
}

function requiredFieldsFor(kind: EvidenceAcquisitionKind): string[] {
  if (kind === 'sourcing') return [
    'componentWordId',
    'supplierName',
    'manufacturer',
    'mpn where applicable',
    'unitCostGbp',
    'leadTimeWeeks where stated',
    'sourceGrade',
    'evidence.ref',
    'evidence.quote',
    'retrievedAt',
  ]
  return [
    'activityId',
    'evidenceKind',
    'reviewerName',
    'verdict',
    'evidenceRef',
    'evidenceNote',
    'reviewedAt',
  ]
}

function disallowedEvidenceFor(kind: EvidenceAcquisitionKind): string[] {
  if (kind === 'sourcing') return [
    'LLM-estimated cost',
    'benchmark average without supplier evidence',
    'class-pack default',
    'test-fixture:// source',
  ]
  return [
    'anonymous reviewer',
    'unchecked model assertion',
    'test-fixture:// review',
    'source-evidence claims that belong in sourcing intake',
  ]
}

function intakeArtifactsFor(kind: EvidenceAcquisitionKind): string[] {
  if (kind === 'sourcing') return [
    '*.sourcing-intake-template.csv',
    '*.sourcing-pack.csv',
    '*.sourcing-ledger.csv',
    '*.bom-provenance-manifest.csv',
  ]
  return [
    '*.verification-intake-template.csv',
    '*.verification-plan.csv',
    '*.verification-ledger.csv',
    '*.engineering-review-pack.csv',
  ]
}

function acceptanceCriteriaFor(kind: EvidenceAcquisitionKind): string[] {
  if (kind === 'sourcing') return [
    'Sourcing admission accepts the row.',
    'BoM ledger carries supplier/manufacturer/MPN/cost only from admitted evidence.',
    'BoM provenance manifest shows source_backed for claimed fields.',
  ]
  return [
    'Verification intake accepts the row.',
    'Verification ledger status is accepted, rejected or deferred with named evidence.',
    'Reviewer evidence can be traced back to the relevant architecture or calculation activity.',
  ]
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
