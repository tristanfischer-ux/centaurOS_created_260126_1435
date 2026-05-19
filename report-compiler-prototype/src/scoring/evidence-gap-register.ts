import { buildEngineeringAssumptionLedger } from '../architecture/engineering-assumptions'
import { buildEngineeringCalculationLedger } from '../architecture/engineering-calculations'
import { buildEngineeringVerificationPlan } from '../architecture/verification-plan'
import { buildVerificationEvidenceLedger } from '../architecture/verification-ledger'
import type { ArchitectureReadiness, BatchSectionScore, ProductDossier, SectionIssue, Severity } from '../schema/types'
import { buildReportReadinessGate } from './report-readiness'
import { buildSourcingWorklist } from '../sourcing/worklist'

export type EvidenceGapKind =
  | 'readiness_blocker'
  | 'calculation_review'
  | 'assumption_review'
  | 'sourcing_evidence'
  | 'verification_evidence'

export type EvidenceGapStatus =
  | 'open'
  | 'ready_for_intake'
  | 'needs_review'
  | 'blocked'

export type EvidenceGapClosurePath =
  | 'architecture_revision'
  | 'engineering_review'
  | 'sourcing_intake'
  | 'verification_intake'
  | 'score_repair'

export type EvidenceGapBlocker = 'architecture' | 'bom' | 'publishable'

export interface EvidenceGapRow {
  id: string
  kind: EvidenceGapKind
  priority: Severity
  status: EvidenceGapStatus
  scope: string
  issue: string
  requiredEvidence: string
  closurePath: EvidenceGapClosurePath
  blocks: EvidenceGapBlocker[]
  linkedIds: string[]
  source: string
}

export interface EvidenceGapRegister {
  summary: {
    rows: number
    blockers: number
    majors: number
    minors: number
    architectureBlockingRows: number
    bomBlockingRows: number
    publishBlockingRows: number
    sourcingIntakeRows: number
    verificationIntakeRows: number
    engineeringReviewRows: number
    architectureRevisionRows: number
  }
  rows: EvidenceGapRow[]
}

export function buildEvidenceGapRegister(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
  score?: BatchSectionScore,
): EvidenceGapRegister {
  const rows = dedupeRows([
    ...readinessRows(dossier, readiness, issues, score),
    ...calculationRows(dossier),
    ...assumptionRows(dossier, readiness),
    ...sourcingRows(dossier),
    ...verificationRows(dossier, readiness, issues),
  ])

  return {
    summary: {
      rows: rows.length,
      blockers: rows.filter(row => row.priority === 'blocker').length,
      majors: rows.filter(row => row.priority === 'major').length,
      minors: rows.filter(row => row.priority === 'minor').length,
      architectureBlockingRows: rows.filter(row => row.blocks.includes('architecture')).length,
      bomBlockingRows: rows.filter(row => row.blocks.includes('bom')).length,
      publishBlockingRows: rows.filter(row => row.blocks.includes('publishable')).length,
      sourcingIntakeRows: rows.filter(row => row.closurePath === 'sourcing_intake').length,
      verificationIntakeRows: rows.filter(row => row.closurePath === 'verification_intake').length,
      engineeringReviewRows: rows.filter(row => row.closurePath === 'engineering_review').length,
      architectureRevisionRows: rows.filter(row => row.closurePath === 'architecture_revision').length,
    },
    rows,
  }
}

export function renderEvidenceGapRegisterCsv(register: EvidenceGapRegister): string {
  const header = [
    'id',
    'kind',
    'priority',
    'status',
    'scope',
    'issue',
    'requiredEvidence',
    'closurePath',
    'blocks',
    'linkedIds',
    'source',
  ]
  const rows = register.rows.map(row => [
    row.id,
    row.kind,
    row.priority,
    row.status,
    row.scope,
    row.issue,
    row.requiredEvidence,
    row.closurePath,
    row.blocks.join('; '),
    row.linkedIds.join('; '),
    row.source,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function readinessRows(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
  score?: BatchSectionScore,
): EvidenceGapRow[] {
  const gate = buildReportReadinessGate(dossier, readiness, issues, score)
  return gate.promotionBlockers.map((blocker, index) => ({
    id: `readiness:${index + 1}`,
    kind: 'readiness_blocker',
    priority: 'blocker',
    status: blocker.includes('Architecture readiness') ? 'blocked' : 'open',
    scope: 'Report readiness gate',
    issue: blocker,
    requiredEvidence: gate.nextActions.join(' '),
    closurePath: closureForReadinessBlocker(blocker),
    blocks: blocker.includes('Architecture readiness') ? ['architecture', 'publishable'] : blocker.includes('BoM') || blocker.includes('cost') ? ['bom', 'publishable'] : ['publishable'],
    linkedIds: [],
    source: 'report_readiness_gate',
  }))
}

function calculationRows(dossier: ProductDossier): EvidenceGapRow[] {
  return buildEngineeringCalculationLedger(dossier).rows
    .filter(row => row.status !== 'within_envelope')
    .map(row => ({
      id: `calculation:${row.id}`,
      kind: 'calculation_review',
      priority: row.status === 'outside_envelope' || row.status === 'blocked' ? 'blocker' : 'major',
      status: row.status === 'blocked' || row.status === 'outside_envelope' ? 'blocked' : 'needs_review',
      scope: row.label,
      issue: row.interpretation,
      requiredEvidence: row.evidenceRequired,
      closurePath: row.status === 'blocked' || row.status === 'outside_envelope' ? 'architecture_revision' : 'engineering_review',
      blocks: row.status === 'blocked' || row.status === 'outside_envelope' ? ['architecture', 'publishable'] : ['publishable'],
      linkedIds: row.linkedRequirements,
      source: 'engineering_calculation_ledger',
    } satisfies EvidenceGapRow))
}

function assumptionRows(dossier: ProductDossier, readiness: ArchitectureReadiness): EvidenceGapRow[] {
  return buildEngineeringAssumptionLedger(dossier, readiness).rows
    .filter(row => row.status === 'blocked' || row.status === 'review_required' || (row.status === 'source_required' && row.category === 'derived_metric'))
    .map(row => ({
      id: `assumption:${row.id}`,
      kind: 'assumption_review',
      priority: row.status === 'blocked' || row.blocksBom ? 'blocker' : 'major',
      status: row.status === 'blocked' ? 'blocked' : row.status === 'source_required' ? 'ready_for_intake' : 'needs_review',
      scope: row.scope,
      issue: row.assumption,
      requiredEvidence: row.evidenceRequired,
      closurePath: row.status === 'blocked'
        ? 'architecture_revision'
        : row.status === 'source_required'
          ? 'sourcing_intake'
          : 'engineering_review',
      blocks: [
        ...(row.blocksArchitecture ? ['architecture' as const] : []),
        ...(row.blocksBom ? ['bom' as const] : []),
        'publishable' as const,
      ],
      linkedIds: [...row.linkedRequirements, ...row.linkedInterfaces, ...row.linkedComponents],
      source: 'engineering_assumption_ledger',
    } satisfies EvidenceGapRow))
}

function sourcingRows(dossier: ProductDossier): EvidenceGapRow[] {
  return buildSourcingWorklist(dossier).criticalUnpriced.map(item => ({
    id: `sourcing:${item.componentWordId}`,
    kind: 'sourcing_evidence',
    priority: 'blocker',
    status: 'ready_for_intake',
    scope: item.description,
    issue: item.reason,
    requiredEvidence: 'Supplier name, manufacturer, MPN where applicable, unit cost, lead time and source quote/reference through sourcing intake.',
    closurePath: 'sourcing_intake',
    blocks: ['bom', 'publishable'],
    linkedIds: [item.componentWordId],
    source: 'sourcing_worklist',
  }))
}

function verificationRows(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
): EvidenceGapRow[] {
  const plan = buildEngineeringVerificationPlan(dossier, readiness, issues)
  const ledger = buildVerificationEvidenceLedger(plan, dossier.sources.verificationEvidence)
  return ledger.rows
    .filter(row => row.evidenceKind !== 'source_evidence' && row.ledgerStatus !== 'accepted')
    .map(row => ({
      id: `verification:${row.activityId}`,
      kind: 'verification_evidence',
      priority: row.ledgerStatus === 'blocked_without_evidence' || row.ledgerStatus === 'rejected' ? 'blocker' : 'major',
      status: row.ledgerStatus === 'blocked_without_evidence' || row.ledgerStatus === 'rejected' ? 'blocked' : 'ready_for_intake',
      scope: row.moduleName,
      issue: row.activity,
      requiredEvidence: row.residualAction,
      closurePath: 'verification_intake',
      blocks: ['publishable'],
      linkedIds: [row.activityId],
      source: 'verification_evidence_ledger',
    } satisfies EvidenceGapRow))
}

function closureForReadinessBlocker(blocker: string): EvidenceGapClosurePath {
  if (blocker.includes('Architecture readiness')) return 'architecture_revision'
  if (blocker.includes('BoM') || blocker.includes('cost')) return 'sourcing_intake'
  if (blocker.includes('verification') || blocker.includes('reviewer')) return 'verification_intake'
  return 'score_repair'
}

function dedupeRows(rows: EvidenceGapRow[]): EvidenceGapRow[] {
  const byId = new Map<string, EvidenceGapRow>()
  for (const row of rows) byId.set(row.id, row)
  return Array.from(byId.values())
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
