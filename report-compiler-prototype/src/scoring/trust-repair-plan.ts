import type { ArchitectureReadiness, BatchSectionScore, ProductDossier, SectionIssue } from '../schema/types'
import { buildClosurePlan } from './closure-plan'
import { buildDocumentTrustGate, type DocumentTrustGate, type DocumentTrustVerdict } from './document-trust-gate'

export type TrustRepairPackageId =
  | 'architecture_revision'
  | 'sourcing_intake'
  | 'engineering_review'
  | 'verification_intake'
  | 'evidence_authenticity_review'
  | 'compliance_risk_review'
  | 'score_repair'

export interface TrustRepairPackage {
  id: TrustRepairPackageId
  sequence: number
  title: string
  status: 'ready' | 'waiting'
  gateAreas: string[]
  closureRows: number
  trustBlockers: number
  requiredInputs: string[]
  sourceArtifacts: string[]
  exitCriteria: string[]
  topBlockers: string[]
}

export interface TrustRepairPlan {
  summary: {
    trustVerdict: DocumentTrustVerdict
    packages: number
    readyPackages: number
    waitingPackages: number
    closureRows: number
    trustBlockers: number
    nextPackage: TrustRepairPackageId | null
  }
  packages: TrustRepairPackage[]
}

export function buildTrustRepairPlan(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
  score?: BatchSectionScore,
): TrustRepairPlan {
  const trustGate = buildDocumentTrustGate(dossier, readiness, issues, score)
  return trustRepairPlanFromGate(trustGate, buildClosurePlan(dossier, readiness, issues, score))
}

export function trustRepairPlanFromGate(
  trustGate: DocumentTrustGate,
  closurePlan: ReturnType<typeof buildClosurePlan>,
): TrustRepairPlan {
  if (trustGate.verdict === 'publishable_trusted') {
    return {
      summary: {
        trustVerdict: trustGate.verdict,
        packages: 0,
        readyPackages: 0,
        waitingPackages: 0,
        closureRows: 0,
        trustBlockers: 0,
        nextPackage: null,
      },
      packages: [],
    }
  }

  const packages = [
    packageFor('architecture_revision', trustGate, closurePlan),
    packageFor('sourcing_intake', trustGate, closurePlan),
    packageFor('engineering_review', trustGate, closurePlan),
    packageFor('verification_intake', trustGate, closurePlan),
    packageFor('evidence_authenticity_review', trustGate, closurePlan),
    packageFor('compliance_risk_review', trustGate, closurePlan),
    packageFor('score_repair', trustGate, closurePlan),
  ].filter((item): item is TrustRepairPackage => item !== null)

  const nextReadyPackage = packages.find(item => item.status === 'ready' && item.gateAreas.length > 0)
    ?? packages.find(item => item.status === 'ready')
    ?? packages[0]

  return {
    summary: {
      trustVerdict: trustGate.verdict,
      packages: packages.length,
      readyPackages: packages.filter(item => item.status === 'ready').length,
      waitingPackages: packages.filter(item => item.status === 'waiting').length,
      closureRows: packages.reduce((sum, item) => sum + item.closureRows, 0),
      trustBlockers: packages.reduce((sum, item) => sum + item.trustBlockers, 0),
      nextPackage: nextReadyPackage?.id ?? null,
    },
    packages,
  }
}

export function renderTrustRepairPlanCsv(plan: TrustRepairPlan): string {
  const header = [
    'id',
    'sequence',
    'title',
    'status',
    'gateAreas',
    'closureRows',
    'trustBlockers',
    'requiredInputs',
    'sourceArtifacts',
    'exitCriteria',
    'topBlockers',
  ]
  const rows = plan.packages.map(item => [
    item.id,
    String(item.sequence),
    item.title,
    item.status,
    item.gateAreas.join('; '),
    String(item.closureRows),
    String(item.trustBlockers),
    item.requiredInputs.join(' '),
    item.sourceArtifacts.join('; '),
    item.exitCriteria.join(' '),
    item.topBlockers.join(' '),
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function packageFor(
  id: TrustRepairPackageId,
  trustGate: DocumentTrustGate,
  closurePlan: ReturnType<typeof buildClosurePlan>,
): TrustRepairPackage | null {
  const gateRows = trustGate.rows.filter(row => packageOwnsGateArea(id, row.area, row.verdict))
  const closureRows = closureRowCount(id, closurePlan)
  if (gateRows.length === 0 && closureRows === 0) return null

  const architectureBlocked = trustGate.rows.some(row => row.area === 'architecture_readiness' && row.verdict === 'blocked')
  const status: TrustRepairPackage['status'] = id === 'architecture_revision' || !architectureBlocked ? 'ready' : 'waiting'

  return {
    id,
    sequence: sequenceFor(id),
    title: titleFor(id),
    status,
    gateAreas: gateRows.map(row => row.area),
    closureRows,
    trustBlockers: gateRows.reduce((sum, row) => sum + row.blockers.length, 0),
    requiredInputs: requiredInputsFor(id),
    sourceArtifacts: sourceArtifactsFor(id),
    exitCriteria: exitCriteriaFor(id),
    topBlockers: gateRows.flatMap(row => row.blockers).slice(0, 16),
  }
}

function packageOwnsGateArea(
  id: TrustRepairPackageId,
  area: DocumentTrustGate['rows'][number]['area'],
  verdict: DocumentTrustGate['rows'][number]['verdict'],
): boolean {
  if (verdict === 'pass') return false
  if (id === 'architecture_revision') return area === 'architecture_readiness'
  if (id === 'sourcing_intake') return area === 'bom_provenance' || area === 'claim_evidence'
  if (id === 'engineering_review') return area === 'requirement_assurance' || area === 'claim_evidence'
  if (id === 'verification_intake') return area === 'reviewer_evidence'
  if (id === 'evidence_authenticity_review') return area === 'evidence_authenticity'
  if (id === 'compliance_risk_review') return area === 'claim_evidence'
  return area === 'section_scores'
}

function closureRowCount(id: TrustRepairPackageId, closurePlan: ReturnType<typeof buildClosurePlan>): number {
  if (id === 'compliance_risk_review' || id === 'evidence_authenticity_review') return 0
  const phaseId = id === 'sourcing_intake' || id === 'engineering_review' || id === 'verification_intake' || id === 'score_repair' || id === 'architecture_revision'
    ? id
    : null
  return phaseId ? closurePlan.phases.find(phase => phase.id === phaseId)?.rowCount ?? 0 : 0
}

function sequenceFor(id: TrustRepairPackageId): number {
  if (id === 'architecture_revision') return 1
  if (id === 'sourcing_intake') return 2
  if (id === 'engineering_review') return 3
  if (id === 'verification_intake') return 4
  if (id === 'evidence_authenticity_review') return 5
  if (id === 'compliance_risk_review') return 6
  return 7
}

function titleFor(id: TrustRepairPackageId): string {
  if (id === 'architecture_revision') return 'Revise Architecture Until Reviewable'
  if (id === 'sourcing_intake') return 'Admit Source-Backed BoM Claims'
  if (id === 'engineering_review') return 'Resolve Engineering Review Questions'
  if (id === 'verification_intake') return 'Admit Reviewer Verification Evidence'
  if (id === 'evidence_authenticity_review') return 'Validate Evidence Authenticity'
  if (id === 'compliance_risk_review') return 'Review Compliance And Risk Claims'
  return 'Repair Residual Section Scores'
}

function requiredInputsFor(id: TrustRepairPackageId): string[] {
  if (id === 'architecture_revision') return [
    'Corrected module, submodule, interface or calculation model changes.',
    'A rerun showing architecture readiness passes.',
  ]
  if (id === 'sourcing_intake') return [
    'Supplier, manufacturer, MPN, unit cost, lead time, retrieved-at timestamp and source reference for critical BoM lines.',
    'Rejected or duplicate component identities resolved before pricing shared items.',
  ]
  if (id === 'engineering_review') return [
    'Accepted/corrected/rejected answers to review-pack questions.',
    'Calculation and assumption decisions tied to reviewer evidence references.',
  ]
  if (id === 'verification_intake') return [
    'Accepted, rejected or deferred verification evidence for every non-source verification activity.',
  ]
  if (id === 'evidence_authenticity_review') return [
    'Production supplier/catalogue URLs for BoM source records.',
    'Named reviewer evidence references that are not protocol fixtures.',
  ]
  if (id === 'compliance_risk_review') return [
    'Compliance-domain review of class-pack standards, hazards and mitigation claims.',
  ]
  return [
    'A rerun after evidence intake, plus score-ledger fixes for any section still below target.',
  ]
}

function sourceArtifactsFor(id: TrustRepairPackageId): string[] {
  if (id === 'architecture_revision') return [
    '*.interface-contracts.json',
    '*.module-review.json',
    '*.engineering-calculations.csv',
    '*.engineering-review-pack.csv',
  ]
  if (id === 'sourcing_intake') return [
    '*.sourcing-intake-template.csv',
    '*.sourcing-pack.csv',
    '*.bom-provenance-manifest.csv',
    '*.component-identity.csv',
  ]
  if (id === 'engineering_review') return [
    '*.engineering-review-pack.csv',
    '*.engineering-assurance-matrix.csv',
    '*.engineering-assumptions.csv',
    '*.engineering-calculations.csv',
  ]
  if (id === 'verification_intake') return [
    '*.verification-intake-template.csv',
    '*.verification-plan.csv',
    '*.verification-ledger.csv',
  ]
  if (id === 'evidence_authenticity_review') return [
    '*.evidence-authenticity-gate.csv',
    '*.sourcing-ledger.csv',
    '*.verification-ledger.csv',
    '*.claim-ledger.csv',
  ]
  if (id === 'compliance_risk_review') return [
    '*.claim-ledger.csv',
    '*.engineering-review-pack.csv',
  ]
  return [
    '*.score-ledger.csv',
    '*.readiness-gate.csv',
    '*.document-trust-gate.csv',
  ]
}

function exitCriteriaFor(id: TrustRepairPackageId): string[] {
  if (id === 'architecture_revision') return [
    'Document Trust Gate architecture_readiness row is pass.',
    'No architecture_revision closure rows remain.',
  ]
  if (id === 'sourcing_intake') return [
    'BoM provenance has zero critical missing-source claims.',
    'Claim Evidence Gate BoM sourcing area is no longer evidence_blocked.',
  ]
  if (id === 'engineering_review') return [
    'Requirement assurance rows have accepted or explicitly deferred engineering review evidence.',
    'Generated architecture and calculation claims are accepted, corrected or rejected.',
  ]
  if (id === 'verification_intake') return [
    'Every non-source verification activity has accepted reviewer evidence or an explicit defer decision.',
  ]
  if (id === 'evidence_authenticity_review') return [
    'Evidence Authenticity Gate verdict is production_ready.',
    'No protocol_fixture, unknown_reference or missing_metadata evidence rows remain.',
  ]
  if (id === 'compliance_risk_review') return [
    'Compliance and risk claims are accepted, corrected or rejected by a domain reviewer.',
  ]
  return [
    'All scored sections are at or above target and Document Trust Gate is no longer blocked by scoring.',
  ]
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
