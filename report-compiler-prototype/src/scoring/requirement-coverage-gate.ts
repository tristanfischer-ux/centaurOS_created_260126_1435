import { buildEngineeringAssuranceMatrix } from '../architecture/engineering-assurance-matrix'
import type { ArchitectureReadiness, ProductDossier, SectionIssue } from '../schema/types'

export type RequirementCoverageVerdict =
  | 'accepted_evidence'
  | 'coverage_review_ready'
  | 'coverage_blocked'
  | 'no_requirements'

export type RequirementCoverageRowStatus =
  | 'accepted_evidence'
  | 'covered_review_ready'
  | 'covered_needs_review'
  | 'blocked'
  | 'unlinked'

export type RequirementCoverageSignal =
  | 'architecture_link'
  | 'submodule_link'
  | 'component_link'
  | 'calculation_link'
  | 'review_question'
  | 'verification_activity'
  | 'accepted_verification'

export interface RequirementCoverageGateRow {
  requirementId: string
  label: string
  value: string
  status: RequirementCoverageRowStatus
  presentSignals: RequirementCoverageSignal[]
  missingSignals: RequirementCoverageSignal[]
  architectureModuleIds: string[]
  subModuleIds: string[]
  componentWordIds: string[]
  calculationIds: string[]
  reviewQuestionIds: string[]
  verificationActivityIds: string[]
  acceptedVerificationActivityIds: string[]
  blockers: string[]
  requiredAction: string
}

export interface RequirementCoverageGate {
  verdict: RequirementCoverageVerdict
  summary: {
    rows: number
    acceptedEvidenceRows: number
    reviewReadyRows: number
    needsReviewRows: number
    blockedRows: number
    unlinkedRows: number
    architectureLinkedRows: number
    subModuleLinkedRows: number
    componentLinkedRows: number
    calculationLinkedRows: number
    reviewQuestionRows: number
    verificationActivityRows: number
    structuralCoverageRatio: number
    acceptedEvidenceRatio: number
  }
  rows: RequirementCoverageGateRow[]
  blockers: string[]
  nextActions: string[]
}

export function buildRequirementCoverageGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
): RequirementCoverageGate {
  const matrix = buildEngineeringAssuranceMatrix(dossier, readiness, issues)
  const rows = matrix.rows.map(row => {
    const presentSignals: RequirementCoverageSignal[] = [
      ...(row.architectureModuleIds.length > 0 ? ['architecture_link' as const] : []),
      ...(row.subModuleIds.length > 0 ? ['submodule_link' as const] : []),
      ...(row.componentWordIds.length > 0 ? ['component_link' as const] : []),
      ...(row.calculationIds.length > 0 ? ['calculation_link' as const] : []),
      ...(row.reviewQuestionIds.length > 0 ? ['review_question' as const] : []),
      ...(row.verificationActivityIds.length > 0 ? ['verification_activity' as const] : []),
      ...(row.acceptedVerificationActivityIds.length > 0 ? ['accepted_verification' as const] : []),
    ]
    const missingSignals: RequirementCoverageSignal[] = [
      ...(row.architectureModuleIds.length === 0 ? ['architecture_link' as const] : []),
      ...(row.subModuleIds.length === 0 ? ['submodule_link' as const] : []),
      ...(row.componentWordIds.length === 0 ? ['component_link' as const] : []),
      ...(row.reviewQuestionIds.length === 0 ? ['review_question' as const] : []),
      ...(row.verificationActivityIds.length === 0 ? ['verification_activity' as const] : []),
      ...(row.acceptedVerificationActivityIds.length === 0 ? ['accepted_verification' as const] : []),
    ]
    const status = statusFor(row.overallStatus, missingSignals)
    return {
      requirementId: row.requirementId,
      label: row.label,
      value: row.value,
      status,
      presentSignals,
      missingSignals,
      architectureModuleIds: row.architectureModuleIds,
      subModuleIds: row.subModuleIds,
      componentWordIds: row.componentWordIds,
      calculationIds: row.calculationIds,
      reviewQuestionIds: row.reviewQuestionIds,
      verificationActivityIds: row.verificationActivityIds,
      acceptedVerificationActivityIds: row.acceptedVerificationActivityIds,
      blockers: row.blockers,
      requiredAction: actionFor(status, missingSignals, row.nextAction),
    }
  })

  const acceptedEvidenceRows = rows.filter(row => row.status === 'accepted_evidence').length
  const reviewReadyRows = rows.filter(row => row.status === 'covered_review_ready').length
  const needsReviewRows = rows.filter(row => row.status === 'covered_needs_review').length
  const blockedRows = rows.filter(row => row.status === 'blocked').length
  const unlinkedRows = rows.filter(row => row.status === 'unlinked').length
  const verdict: RequirementCoverageVerdict = rows.length === 0
    ? 'no_requirements'
    : blockedRows > 0 || unlinkedRows > 0
      ? 'coverage_blocked'
      : acceptedEvidenceRows === rows.length
        ? 'accepted_evidence'
        : 'coverage_review_ready'

  return {
    verdict,
    summary: {
      rows: rows.length,
      acceptedEvidenceRows,
      reviewReadyRows,
      needsReviewRows,
      blockedRows,
      unlinkedRows,
      architectureLinkedRows: rows.filter(row => row.presentSignals.includes('architecture_link')).length,
      subModuleLinkedRows: rows.filter(row => row.presentSignals.includes('submodule_link')).length,
      componentLinkedRows: rows.filter(row => row.presentSignals.includes('component_link')).length,
      calculationLinkedRows: rows.filter(row => row.presentSignals.includes('calculation_link')).length,
      reviewQuestionRows: rows.filter(row => row.presentSignals.includes('review_question')).length,
      verificationActivityRows: rows.filter(row => row.presentSignals.includes('verification_activity')).length,
      structuralCoverageRatio: ratio(rows.filter(row => row.status !== 'blocked' && row.status !== 'unlinked').length, rows.length),
      acceptedEvidenceRatio: ratio(acceptedEvidenceRows, rows.length),
    },
    rows,
    blockers: rows
      .filter(row => row.status === 'blocked' || row.status === 'unlinked')
      .map(row => `${row.requirementId}: ${row.requiredAction}`),
    nextActions: Array.from(new Set(rows
      .filter(row => row.status !== 'accepted_evidence')
      .map(row => row.requiredAction))),
  }
}

export function renderRequirementCoverageGateCsv(gate: RequirementCoverageGate): string {
  const header = [
    'requirementId',
    'label',
    'value',
    'status',
    'presentSignals',
    'missingSignals',
    'architectureModuleIds',
    'subModuleIds',
    'componentWordIds',
    'calculationIds',
    'reviewQuestionIds',
    'verificationActivityIds',
    'acceptedVerificationActivityIds',
    'blockers',
    'requiredAction',
  ]
  const rows = gate.rows.map(row => [
    row.requirementId,
    row.label,
    row.value,
    row.status,
    row.presentSignals.join('; '),
    row.missingSignals.join('; '),
    row.architectureModuleIds.join('; '),
    row.subModuleIds.join('; '),
    row.componentWordIds.join('; '),
    row.calculationIds.join('; '),
    row.reviewQuestionIds.join('; '),
    row.verificationActivityIds.join('; '),
    row.acceptedVerificationActivityIds.join('; '),
    row.blockers.join(' '),
    row.requiredAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function statusFor(
  assuranceStatus: ReturnType<typeof buildEngineeringAssuranceMatrix>['rows'][number]['overallStatus'],
  missingSignals: RequirementCoverageSignal[],
): RequirementCoverageRowStatus {
  if (assuranceStatus === 'blocked') return 'blocked'
  if (assuranceStatus === 'unlinked') return 'unlinked'
  if (assuranceStatus === 'accepted') return 'accepted_evidence'
  const missingStructural = missingSignals.some(signal => signal !== 'accepted_verification')
  if (missingStructural) return 'covered_needs_review'
  return 'covered_review_ready'
}

function actionFor(
  status: RequirementCoverageRowStatus,
  missingSignals: RequirementCoverageSignal[],
  assuranceAction: string,
): string {
  if (status === 'accepted_evidence') return 'Requirement has accepted architecture/reviewer evidence in the current ledger.'
  if (status === 'blocked') return assuranceAction
  if (status === 'unlinked') return `Add missing coverage signals: ${missingSignals.join(', ')}.`
  if (status === 'covered_needs_review') return `Complete structural review coverage: ${missingSignals.filter(signal => signal !== 'accepted_verification').join(', ')}.`
  return 'Collect accepted reviewer evidence; structural requirement coverage is ready for review.'
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 1
  return Math.round((numerator / denominator) * 100) / 100
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
