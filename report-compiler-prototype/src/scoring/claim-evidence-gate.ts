import type { ArchitectureReadiness, ProductDossier, SectionIssue } from '../schema/types'
import { buildClaimLedger, type ClaimKind, type ClaimLedger, type ClaimStatus } from './claim-ledger'

export type ClaimEvidenceArea =
  | 'brief_requirements'
  | 'architecture_design'
  | 'engineering_math'
  | 'bom_sourcing'
  | 'compliance_risk'

export type ClaimEvidenceVerdict =
  | 'claim_evidence_complete'
  | 'review_required'
  | 'evidence_blocked'

export interface ClaimEvidenceGateRow {
  area: ClaimEvidenceArea
  verdict: ClaimEvidenceVerdict
  rows: number
  passedClaims: number
  reviewRequiredClaims: number
  blockedClaims: number
  sourceRequiredClaims: number
  generatedNeedsReviewClaims: number
  calculatedNeedsReviewClaims: number
  acceptedClaims: number
  sourceBackedClaims: number
  briefSuppliedClaims: number
  bomBlockingClaims: number
  publishBlockingClaims: number
  passRatio: number
  requiredAction: string
}

export interface ClaimEvidenceGate {
  verdict: ClaimEvidenceVerdict
  summary: {
    areas: number
    passAreas: number
    reviewRequiredAreas: number
    blockedAreas: number
    claimRows: number
    passedClaims: number
    reviewRequiredClaims: number
    blockedClaims: number
    sourceRequiredClaims: number
    acceptedClaims: number
    sourceBackedClaims: number
    bomBlockingClaims: number
    publishBlockingClaims: number
    passRatio: number
  }
  rows: ClaimEvidenceGateRow[]
  promotionBlockers: string[]
  nextActions: string[]
}

const AREA_ORDER: ClaimEvidenceArea[] = [
  'brief_requirements',
  'architecture_design',
  'engineering_math',
  'bom_sourcing',
  'compliance_risk',
]

export function buildClaimEvidenceGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
): ClaimEvidenceGate {
  return claimEvidenceGateFromLedger(buildClaimLedger(dossier, readiness, issues))
}

export function claimEvidenceGateFromLedger(ledger: ClaimLedger): ClaimEvidenceGate {
  const rows = AREA_ORDER.map(area => rowForArea(area, ledger))
  const verdict = rows.some(row => row.verdict === 'evidence_blocked')
    ? 'evidence_blocked'
    : rows.some(row => row.verdict === 'review_required') ? 'review_required' : 'claim_evidence_complete'
  const promotionBlockers = rows
    .filter(row => row.verdict !== 'claim_evidence_complete')
    .map(row => `${labelForArea(row.area)} has ${row.blockedClaims} blocked/source-required claim(s) and ${row.reviewRequiredClaims} review-required claim(s).`)
  const nextActions = rows
    .filter(row => row.verdict !== 'claim_evidence_complete')
    .map(row => row.requiredAction)

  return {
    verdict,
    summary: {
      areas: rows.length,
      passAreas: rows.filter(row => row.verdict === 'claim_evidence_complete').length,
      reviewRequiredAreas: rows.filter(row => row.verdict === 'review_required').length,
      blockedAreas: rows.filter(row => row.verdict === 'evidence_blocked').length,
      claimRows: sum(rows, 'rows'),
      passedClaims: sum(rows, 'passedClaims'),
      reviewRequiredClaims: sum(rows, 'reviewRequiredClaims'),
      blockedClaims: sum(rows, 'blockedClaims'),
      sourceRequiredClaims: sum(rows, 'sourceRequiredClaims'),
      acceptedClaims: sum(rows, 'acceptedClaims'),
      sourceBackedClaims: sum(rows, 'sourceBackedClaims'),
      bomBlockingClaims: sum(rows, 'bomBlockingClaims'),
      publishBlockingClaims: sum(rows, 'publishBlockingClaims'),
      passRatio: ratio(sum(rows, 'passedClaims'), sum(rows, 'rows')),
    },
    rows,
    promotionBlockers,
    nextActions: Array.from(new Set(nextActions)),
  }
}

export function renderClaimEvidenceGateCsv(gate: ClaimEvidenceGate): string {
  const header = [
    'area',
    'verdict',
    'rows',
    'passedClaims',
    'reviewRequiredClaims',
    'blockedClaims',
    'sourceRequiredClaims',
    'generatedNeedsReviewClaims',
    'calculatedNeedsReviewClaims',
    'acceptedClaims',
    'sourceBackedClaims',
    'briefSuppliedClaims',
    'bomBlockingClaims',
    'publishBlockingClaims',
    'passRatio',
    'requiredAction',
  ]
  const rows = gate.rows.map(row => [
    row.area,
    row.verdict,
    String(row.rows),
    String(row.passedClaims),
    String(row.reviewRequiredClaims),
    String(row.blockedClaims),
    String(row.sourceRequiredClaims),
    String(row.generatedNeedsReviewClaims),
    String(row.calculatedNeedsReviewClaims),
    String(row.acceptedClaims),
    String(row.sourceBackedClaims),
    String(row.briefSuppliedClaims),
    String(row.bomBlockingClaims),
    String(row.publishBlockingClaims),
    String(row.passRatio),
    row.requiredAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function rowForArea(area: ClaimEvidenceArea, ledger: ClaimLedger): ClaimEvidenceGateRow {
  const claims = ledger.rows.filter(row => areaForKind(row.kind) === area)
  const sourceRequiredClaims = countStatus(claims, 'source_required')
  const blockedStatusClaims = countStatus(claims, 'blocked')
  const generatedNeedsReviewClaims = countStatus(claims, 'generated_needs_review')
  const calculatedNeedsReviewClaims = countStatus(claims, 'calculated_needs_review')
  const acceptedClaims = countStatus(claims, 'accepted')
  const sourceBackedClaims = countStatus(claims, 'source_backed')
  const briefSuppliedClaims = countStatus(claims, 'brief_supplied')
  const blockedClaims = sourceRequiredClaims + blockedStatusClaims
  const reviewRequiredClaims = generatedNeedsReviewClaims + calculatedNeedsReviewClaims
  const passedClaims = acceptedClaims + sourceBackedClaims + briefSuppliedClaims
  const verdict: ClaimEvidenceVerdict = blockedClaims > 0
    ? 'evidence_blocked'
    : reviewRequiredClaims > 0 ? 'review_required' : 'claim_evidence_complete'

  return {
    area,
    verdict,
    rows: claims.length,
    passedClaims,
    reviewRequiredClaims,
    blockedClaims,
    sourceRequiredClaims,
    generatedNeedsReviewClaims,
    calculatedNeedsReviewClaims,
    acceptedClaims,
    sourceBackedClaims,
    briefSuppliedClaims,
    bomBlockingClaims: claims.filter(row => row.blocksBom).length,
    publishBlockingClaims: claims.filter(row => row.blocksPublish).length,
    passRatio: ratio(passedClaims, claims.length),
    requiredAction: actionForArea(area, verdict),
  }
}

function areaForKind(kind: ClaimKind): ClaimEvidenceArea {
  if (kind === 'brief_requirement') return 'brief_requirements'
  if (kind === 'module_allocation' || kind === 'submodule_allocation') return 'architecture_design'
  if (kind === 'headline_metric' || kind === 'engineering_calculation') return 'engineering_math'
  if (kind === 'component_candidate' || kind === 'bom_source_field') return 'bom_sourcing'
  return 'compliance_risk'
}

function actionForArea(area: ClaimEvidenceArea, verdict: ClaimEvidenceVerdict): string {
  if (verdict === 'claim_evidence_complete') return 'No claim-evidence action required for this area.'
  if (area === 'brief_requirements') return 'Confirm brief-supplied requirements and keep original brief refs attached.'
  if (area === 'architecture_design') return 'Accept, correct or reject generated module and submodule allocation claims through engineering review.'
  if (area === 'engineering_math') return 'Accept, correct or reject calculated metrics and engineering envelopes through reviewer evidence.'
  if (area === 'bom_sourcing') return 'Admit source-backed supplier, manufacturer, MPN, unit-cost and lead-time evidence for required BoM claims.'
  return 'Accept, correct or reject class-pack regulatory and risk claims through compliance/domain review.'
}

function labelForArea(area: ClaimEvidenceArea): string {
  return area.replaceAll('_', ' ')
}

function countStatus(claims: ClaimLedger['rows'], status: ClaimStatus): number {
  return claims.filter(row => row.status === status).length
}

function sum(rows: ClaimEvidenceGateRow[], key: keyof Pick<ClaimEvidenceGateRow, 'rows' | 'passedClaims' | 'reviewRequiredClaims' | 'blockedClaims' | 'sourceRequiredClaims' | 'acceptedClaims' | 'sourceBackedClaims' | 'bomBlockingClaims' | 'publishBlockingClaims'>): number {
  return rows.reduce((total, row) => total + Number(row[key]), 0)
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 1
  return Math.round((numerator / denominator) * 100) / 100
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
