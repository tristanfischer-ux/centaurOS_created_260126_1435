import type { ProductDossier } from '../schema/types'
import {
  buildEvidenceAuthenticityGate,
  type EvidenceAuthenticityGate,
  type EvidenceAuthenticityKind,
  type EvidenceAuthenticityRow,
  type EvidenceAuthenticityStatus,
  type EvidenceAuthenticityVerdict,
  type EvidenceReferenceClass,
} from './evidence-authenticity'

export type EvidenceReplacementTarget =
  | 'external_supplier_or_catalogue_url'
  | 'governed_reviewer_reference'
  | 'complete_metadata_then_reclassify'

export interface EvidenceReplacementRow {
  id: string
  sequence: number
  kind: EvidenceAuthenticityKind
  subjectId: string
  currentRef: string
  currentReferenceClass: EvidenceReferenceClass
  currentStatus: EvidenceAuthenticityStatus
  replacementTarget: EvidenceReplacementTarget
  acceptedReferenceClasses: EvidenceReferenceClass[]
  requiredFields: string[]
  sourceArtifacts: string[]
  exitCriteria: string[]
  blocksBom: boolean
  blocksPublish: boolean
  action: string
}

export interface EvidenceReplacementPlan {
  summary: {
    authenticityVerdict: EvidenceAuthenticityVerdict
    rows: number
    sourcingRows: number
    verificationRows: number
    protocolRows: number
    reviewRequiredRows: number
    missingMetadataRows: number
    blocksBomRows: number
    blocksPublishRows: number
    nextRowId: string | null
  }
  rows: EvidenceReplacementRow[]
}

export function buildEvidenceReplacementPlan(dossier: ProductDossier): EvidenceReplacementPlan {
  return evidenceReplacementPlanFromGate(buildEvidenceAuthenticityGate(dossier))
}

export function evidenceReplacementPlanFromGate(gate: EvidenceAuthenticityGate): EvidenceReplacementPlan {
  const rows = gate.rows
    .filter(row => row.status !== 'accepted_production_evidence')
    .map((row, index) => replacementRow(row, index + 1))

  return {
    summary: {
      authenticityVerdict: gate.verdict,
      rows: rows.length,
      sourcingRows: rows.filter(row => row.kind === 'sourcing').length,
      verificationRows: rows.filter(row => row.kind === 'verification').length,
      protocolRows: rows.filter(row => row.currentStatus === 'protocol_fixture').length,
      reviewRequiredRows: rows.filter(row => row.currentStatus === 'review_required').length,
      missingMetadataRows: rows.filter(row => row.currentStatus === 'missing_metadata').length,
      blocksBomRows: rows.filter(row => row.blocksBom).length,
      blocksPublishRows: rows.filter(row => row.blocksPublish).length,
      nextRowId: rows[0]?.id ?? null,
    },
    rows,
  }
}

export function renderEvidenceReplacementPlanCsv(plan: EvidenceReplacementPlan): string {
  const header = [
    'id',
    'sequence',
    'kind',
    'subjectId',
    'currentRef',
    'currentReferenceClass',
    'currentStatus',
    'replacementTarget',
    'acceptedReferenceClasses',
    'requiredFields',
    'sourceArtifacts',
    'exitCriteria',
    'blocksBom',
    'blocksPublish',
    'action',
  ]
  const rows = plan.rows.map(row => [
    row.id,
    String(row.sequence),
    row.kind,
    row.subjectId,
    row.currentRef,
    row.currentReferenceClass,
    row.currentStatus,
    row.replacementTarget,
    row.acceptedReferenceClasses.join('; '),
    row.requiredFields.join('; '),
    row.sourceArtifacts.join('; '),
    row.exitCriteria.join('; '),
    row.blocksBom ? 'yes' : 'no',
    row.blocksPublish ? 'yes' : 'no',
    row.action,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function replacementRow(row: EvidenceAuthenticityRow, sequence: number): EvidenceReplacementRow {
  const target = replacementTargetFor(row)
  return {
    id: `replace:${sequence}:${row.id}`,
    sequence,
    kind: row.kind,
    subjectId: row.subjectId,
    currentRef: row.ref,
    currentReferenceClass: row.referenceClass,
    currentStatus: row.status,
    replacementTarget: target,
    acceptedReferenceClasses: acceptedReferenceClassesFor(row, target),
    requiredFields: requiredFieldsFor(row),
    sourceArtifacts: sourceArtifactsFor(row),
    exitCriteria: exitCriteriaFor(row, target),
    blocksBom: row.kind === 'sourcing',
    blocksPublish: true,
    action: actionFor(row, target),
  }
}

function replacementTargetFor(row: EvidenceAuthenticityRow): EvidenceReplacementTarget {
  if (row.status === 'missing_metadata') return 'complete_metadata_then_reclassify'
  if (row.kind === 'sourcing') return 'external_supplier_or_catalogue_url'
  return 'governed_reviewer_reference'
}

function acceptedReferenceClassesFor(
  row: EvidenceAuthenticityRow,
  target: EvidenceReplacementTarget,
): EvidenceReferenceClass[] {
  if (target === 'external_supplier_or_catalogue_url') return ['external_url']
  if (target === 'governed_reviewer_reference') return ['external_url', 'internal_reference', 'local_file']
  if (row.kind === 'sourcing') return ['external_url']
  return ['external_url', 'internal_reference', 'local_file']
}

function requiredFieldsFor(row: EvidenceAuthenticityRow): string[] {
  if (row.kind === 'sourcing') return [
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

function sourceArtifactsFor(row: EvidenceAuthenticityRow): string[] {
  if (row.kind === 'sourcing') return [
    '*.sourcing-intake-template.csv',
    '*.sourcing-ledger.csv',
    '*.bom-provenance-manifest.csv',
    '*.evidence-authenticity-gate.csv',
  ]
  return [
    '*.verification-intake-template.csv',
    '*.verification-ledger.csv',
    '*.engineering-review-pack.csv',
    '*.evidence-authenticity-gate.csv',
  ]
}

function exitCriteriaFor(
  row: EvidenceAuthenticityRow,
  target: EvidenceReplacementTarget,
): string[] {
  if (target === 'complete_metadata_then_reclassify') return [
    'Original evidence row has all required metadata populated.',
    'Evidence Authenticity Gate row no longer reports missing_metadata.',
  ]
  if (row.kind === 'sourcing') return [
    'Sourcing record uses a retrievable external supplier or catalogue URL.',
    'BoM provenance manifest marks supplier, manufacturer, MPN, unit cost and lead time as source-backed where claimed.',
    'Evidence Authenticity Gate row becomes accepted_production_evidence.',
  ]
  return [
    'Reviewer evidence uses a named reviewer and governed evidence reference.',
    'Verification ledger row remains accepted after intake.',
    'Evidence Authenticity Gate row becomes accepted_production_evidence.',
  ]
}

function actionFor(
  row: EvidenceAuthenticityRow,
  target: EvidenceReplacementTarget,
): string {
  if (target === 'complete_metadata_then_reclassify') {
    return `Complete required metadata for ${row.id}, then rerun evidence authenticity.`
  }
  if (row.kind === 'sourcing') {
    return `Replace ${row.id} with source-backed supplier/catalogue evidence before this BoM line can support trusted publication.`
  }
  return `Replace ${row.id} with named reviewer signoff evidence before this review can support trusted publication.`
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
