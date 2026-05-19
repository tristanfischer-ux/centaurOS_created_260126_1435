import { buildEngineeringCalculationLedger } from './engineering-calculations'
import { buildEngineeringReviewPack } from './engineering-review-pack'
import { buildVerificationEvidenceLedger } from './verification-ledger'
import { buildEngineeringVerificationPlan } from './verification-plan'
import type { ArchitectureReadiness, ProductDossier, RequirementTraceStatus, SectionIssue } from '../schema/types'

export type EngineeringAssuranceStatus =
  | 'accepted'
  | 'ready_for_review'
  | 'needs_review'
  | 'blocked'
  | 'unlinked'

export interface EngineeringAssuranceMatrixRow {
  requirementId: string
  label: string
  value: string
  architectureCoverage: RequirementTraceStatus
  architectureModuleIds: string[]
  architectureModuleNames: string[]
  subModuleIds: string[]
  componentWordIds: string[]
  calculationIds: string[]
  calculationStatuses: string[]
  reviewQuestionIds: string[]
  reviewStatus: EngineeringAssuranceStatus
  verificationActivityIds: string[]
  verificationStatuses: string[]
  acceptedVerificationActivityIds: string[]
  overallStatus: EngineeringAssuranceStatus
  blockers: string[]
  nextAction: string
}

export interface EngineeringAssuranceMatrix {
  summary: {
    rows: number
    accepted: number
    readyForReview: number
    needsReview: number
    blocked: number
    unlinked: number
    rowsWithCalculations: number
    rowsWithReviewQuestions: number
    rowsWithAcceptedVerification: number
  }
  rows: EngineeringAssuranceMatrixRow[]
}

export function buildEngineeringAssuranceMatrix(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
): EngineeringAssuranceMatrix {
  const calculations = buildEngineeringCalculationLedger(dossier)
  const reviewPack = buildEngineeringReviewPack(dossier, readiness, issues)
  const verificationPlan = buildEngineeringVerificationPlan(dossier, readiness, issues)
  const verificationLedger = buildVerificationEvidenceLedger(verificationPlan, dossier.sources.verificationEvidence)
  const ledgerByActivity = new Map(verificationLedger.rows.map(row => [row.activityId, row]))

  const rows = dossier.requirementTrace.map(trace => {
    const moduleIds = unique(trace.architectureLinks.map(link => link.moduleId))
    const moduleNames = unique(trace.architectureLinks.map(link => link.moduleName))
    const subModuleIds = unique(trace.architectureLinks.map(link => link.subModuleId).filter(isString))
    const componentWordIds = unique(trace.architectureLinks.map(link => link.componentWordId).filter(isString))
    const linkedCalculations = calculations.rows.filter(row => row.linkedRequirements.includes(trace.requirementId))
    const linkedReviewQuestions = reviewPack.questions.filter(question =>
      question.linkedRequirementIds.includes(trace.requirementId)
      || question.linkedModuleIds.some(moduleId => moduleIds.includes(moduleId))
    )
    const linkedActivities = verificationPlan.activities.filter(activity =>
      activity.evidenceKind !== 'source_evidence'
      && activity.requirementIds.includes(trace.requirementId)
    )
    const linkedLedgerRows = linkedActivities
      .map(activity => ledgerByActivity.get(activity.id))
      .filter(isDefined)

    const calculationStatuses = linkedCalculations.map(row => row.status)
    const reviewStatus = combineReviewStatuses(linkedReviewQuestions.map(row => row.status))
    const verificationStatuses = linkedLedgerRows.map(row => row.ledgerStatus)
    const blockers = [
      trace.status === 'uncovered' ? 'Requirement has no architecture coverage.' : undefined,
      ...linkedCalculations
        .filter(row => row.status === 'outside_envelope' || row.status === 'blocked')
        .map(row => `${row.id}: ${row.interpretation}`),
      ...linkedReviewQuestions
        .filter(row => row.status === 'blocked')
        .flatMap(row => row.blockers.length > 0 ? row.blockers.map(blocker => `${row.id}: ${blocker}`) : [`${row.id}: blocked review question`]),
      ...linkedLedgerRows
        .filter(row => row.ledgerStatus === 'rejected' || row.ledgerStatus === 'blocked_without_evidence')
        .map(row => `${row.activityId}: ${row.residualAction}`),
    ].filter(isString)
    const overallStatus = combineOverallStatus({
      architectureCoverage: trace.status,
      calculationStatuses,
      reviewStatus,
      verificationStatuses,
      blockers,
      hasArchitectureLinks: moduleIds.length > 0,
      hasReviewQuestions: linkedReviewQuestions.length > 0,
    })

    return {
      requirementId: trace.requirementId,
      label: trace.label,
      value: `${trace.value}${trace.unit ? ` ${trace.unit}` : ''}`,
      architectureCoverage: trace.status,
      architectureModuleIds: moduleIds,
      architectureModuleNames: moduleNames,
      subModuleIds,
      componentWordIds,
      calculationIds: linkedCalculations.map(row => row.id),
      calculationStatuses,
      reviewQuestionIds: linkedReviewQuestions.map(row => row.id),
      reviewStatus,
      verificationActivityIds: linkedActivities.map(row => row.id),
      verificationStatuses,
      acceptedVerificationActivityIds: linkedLedgerRows
        .filter(row => row.ledgerStatus === 'accepted')
        .map(row => row.activityId),
      overallStatus,
      blockers,
      nextAction: nextActionFor(overallStatus, linkedActivities.length, linkedLedgerRows.filter(row => row.ledgerStatus === 'accepted').length),
    }
  }).sort((a, b) => {
    const statusDelta = statusRank(a.overallStatus) - statusRank(b.overallStatus)
    if (statusDelta !== 0) return statusDelta
    return a.requirementId.localeCompare(b.requirementId)
  })

  return {
    summary: {
      rows: rows.length,
      accepted: rows.filter(row => row.overallStatus === 'accepted').length,
      readyForReview: rows.filter(row => row.overallStatus === 'ready_for_review').length,
      needsReview: rows.filter(row => row.overallStatus === 'needs_review').length,
      blocked: rows.filter(row => row.overallStatus === 'blocked').length,
      unlinked: rows.filter(row => row.overallStatus === 'unlinked').length,
      rowsWithCalculations: rows.filter(row => row.calculationIds.length > 0).length,
      rowsWithReviewQuestions: rows.filter(row => row.reviewQuestionIds.length > 0).length,
      rowsWithAcceptedVerification: rows.filter(row => row.acceptedVerificationActivityIds.length > 0).length,
    },
    rows,
  }
}

export function renderEngineeringAssuranceMatrixCsv(matrix: EngineeringAssuranceMatrix): string {
  const header = [
    'requirementId',
    'label',
    'value',
    'overallStatus',
    'architectureCoverage',
    'architectureModuleIds',
    'architectureModuleNames',
    'subModuleIds',
    'componentWordIds',
    'calculationIds',
    'calculationStatuses',
    'reviewStatus',
    'reviewQuestionIds',
    'verificationActivityIds',
    'verificationStatuses',
    'acceptedVerificationActivityIds',
    'blockers',
    'nextAction',
  ]
  const rows = matrix.rows.map(row => [
    row.requirementId,
    row.label,
    row.value,
    row.overallStatus,
    row.architectureCoverage,
    row.architectureModuleIds.join('; '),
    row.architectureModuleNames.join('; '),
    row.subModuleIds.join('; '),
    row.componentWordIds.join('; '),
    row.calculationIds.join('; '),
    row.calculationStatuses.join('; '),
    row.reviewStatus,
    row.reviewQuestionIds.join('; '),
    row.verificationActivityIds.join('; '),
    row.verificationStatuses.join('; '),
    row.acceptedVerificationActivityIds.join('; '),
    row.blockers.join(' '),
    row.nextAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function combineReviewStatuses(statuses: string[]): EngineeringAssuranceStatus {
  if (statuses.length === 0) return 'unlinked'
  if (statuses.includes('blocked')) return 'blocked'
  if (statuses.includes('needs_review')) return 'needs_review'
  if (statuses.every(status => status === 'accepted')) return 'accepted'
  return 'ready_for_review'
}

function combineOverallStatus(input: {
  architectureCoverage: RequirementTraceStatus
  calculationStatuses: string[]
  reviewStatus: EngineeringAssuranceStatus
  verificationStatuses: string[]
  blockers: string[]
  hasArchitectureLinks: boolean
  hasReviewQuestions: boolean
}): EngineeringAssuranceStatus {
  if (!input.hasArchitectureLinks || !input.hasReviewQuestions) return 'unlinked'
  if (input.blockers.length > 0 || input.architectureCoverage === 'uncovered') return 'blocked'
  if (input.calculationStatuses.some(status => status === 'outside_envelope' || status === 'blocked')) return 'blocked'
  if (input.verificationStatuses.some(status => status === 'rejected' || status === 'blocked_without_evidence')) return 'blocked'
  if (input.architectureCoverage === 'partial') return 'needs_review'
  if (input.verificationStatuses.includes('deferred')) return 'needs_review'
  if (
    input.reviewStatus === 'accepted'
    && input.verificationStatuses.length > 0
    && input.verificationStatuses.every(status => status === 'accepted')
  ) {
    return 'accepted'
  }
  if (input.calculationStatuses.includes('needs_review')) return 'needs_review'
  if (input.reviewStatus === 'needs_review') return 'needs_review'
  return 'ready_for_review'
}

function nextActionFor(status: EngineeringAssuranceStatus, verificationActivities: number, acceptedVerificationActivities: number): string {
  if (status === 'accepted') return 'Requirement has accepted engineering evidence in the current ledger.'
  if (status === 'blocked') return 'Resolve blockers through architecture revision or reviewer rejection handling before BoM sourcing.'
  if (status === 'unlinked') return 'Add architecture links, review questions or verification activities for this requirement.'
  if (status === 'needs_review') return 'Complete engineering review questions, calculations or deferred verification evidence.'
  if (verificationActivities === 0) return 'Add a verification activity or reviewer sign-off path for this requirement.'
  if (acceptedVerificationActivities === 0) return 'Collect reviewer evidence through verification intake.'
  return 'Complete remaining review-pack questions for this requirement.'
}

function statusRank(status: EngineeringAssuranceStatus): number {
  if (status === 'blocked') return 0
  if (status === 'unlinked') return 1
  if (status === 'needs_review') return 2
  if (status === 'ready_for_review') return 3
  return 4
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string'
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
