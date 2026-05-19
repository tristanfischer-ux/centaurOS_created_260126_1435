import { buildEngineeringVerificationPlan } from '../architecture/verification-plan'
import { buildVerificationEvidenceLedger } from '../architecture/verification-ledger'
import type {
  ArchitectureReadiness,
  BatchSectionScore,
  PdfSectionId,
  ProductDossier,
  SectionIssue,
  Severity,
} from '../schema/types'

export type ReportReadinessVerdict = 'publishable' | 'architecture_review_ready' | 'blocked'

export interface ReportReadinessSection {
  section: PdfSectionId
  score: number | null
  targetScore: number
  passesTarget: boolean
  issueCount: number
  blockerCount: number
  majorCount: number
  minorCount: number
  actions: string[]
}

export interface ReportReadinessGate {
  targetSectionScore: number
  verdict: ReportReadinessVerdict
  summary: {
    sections: number
    sectionsAtOrAboveTarget: number
    sectionsBelowTarget: number
    meanScore: number | null
    architectureReadyForBom: boolean
    verificationBlockedActivities: number
    verificationOpenActivities: number
    verificationEvidenceEligibleActivities: number
    verificationAcceptedActivities: number
    verificationRejectedActivities: number
    verificationDeferredActivities: number
    verificationPendingActivities: number
    verificationUnacceptedActivities: number
    verificationReviewCoverageRatio: number
    verificationAcceptanceRatio: number
    sourcingAdmissionStatus: ProductDossier['sourcing']['admission']['status']
    unpricedCriticalLines: number
    blockerIssues: number
    majorIssues: number
    minorIssues: number
  }
  sections: ReportReadinessSection[]
  promotionBlockers: string[]
  nextActions: string[]
}

const DEFAULT_TARGET = 8

export function buildReportReadinessGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
  score?: BatchSectionScore,
  targetSectionScore = DEFAULT_TARGET,
): ReportReadinessGate {
  const verification = buildEngineeringVerificationPlan(dossier, readiness, issues)
  const verificationLedger = buildVerificationEvidenceLedger(verification, dossier.sources.verificationEvidence)
  const sections = Object.entries(score?.sectionScores ?? {}).map(([section, value]) => {
    const sectionIssues = issues.filter(issue => issue.section === section)
    return sectionReadiness(section as PdfSectionId, value ?? null, targetSectionScore, sectionIssues)
  })
  const sectionsBelowTarget = sections.filter(section => !section.passesTarget)
  const promotionBlockers = [
    ...sectionsBelowTarget.map(section => `${section.section} score ${section.score ?? 'n/a'} is below ${targetSectionScore}.`),
    ...(readiness.readyForBom ? [] : [`Architecture readiness gate has ${readiness.blockingIssues.length} blocker or major issue(s).`]),
    ...(dossier.sourcing.admission.unpricedCriticalLines > 0
      ? [`${dossier.sourcing.admission.unpricedCriticalLines} critical BoM line(s) lack source-backed cost evidence.`]
      : []),
    ...(verification.summary.blocked > 0
      ? [`${verification.summary.blocked} verification activity/activities remain blocked.`]
      : []),
    ...(verificationLedger.summary.accepted < verificationLedger.summary.evidenceEligibleActivities
      ? [`${verificationLedger.summary.accepted}/${verificationLedger.summary.evidenceEligibleActivities} non-sourcing verification activity/activities have accepted reviewer evidence.`]
      : []),
  ]
  const verdict: ReportReadinessVerdict = promotionBlockers.length === 0
    ? 'publishable'
    : readiness.readyForBom && sectionsBelowTarget.every(section => section.section === 'bom') && dossier.sourcing.admission.unpricedCriticalLines > 0
      ? 'architecture_review_ready'
      : 'blocked'

  return {
    targetSectionScore,
    verdict,
    summary: {
      sections: sections.length,
      sectionsAtOrAboveTarget: sections.filter(section => section.passesTarget).length,
      sectionsBelowTarget: sectionsBelowTarget.length,
      meanScore: score?.mean ?? null,
      architectureReadyForBom: readiness.readyForBom,
      verificationBlockedActivities: verification.summary.blocked,
      verificationOpenActivities: verification.summary.open,
      verificationEvidenceEligibleActivities: verificationLedger.summary.evidenceEligibleActivities,
      verificationAcceptedActivities: verificationLedger.summary.accepted,
      verificationRejectedActivities: verificationLedger.summary.rejected,
      verificationDeferredActivities: verificationLedger.summary.deferred,
      verificationPendingActivities: verificationLedger.summary.pending + verificationLedger.summary.blockedWithoutEvidence,
      verificationUnacceptedActivities: verificationLedger.summary.evidenceEligibleActivities - verificationLedger.summary.accepted,
      verificationReviewCoverageRatio: verificationLedger.summary.reviewCoverageRatio,
      verificationAcceptanceRatio: verificationLedger.summary.acceptanceRatio,
      sourcingAdmissionStatus: dossier.sourcing.admission.status,
      unpricedCriticalLines: dossier.sourcing.admission.unpricedCriticalLines,
      blockerIssues: issues.filter(issue => issue.severity === 'blocker').length,
      majorIssues: issues.filter(issue => issue.severity === 'major').length,
      minorIssues: issues.filter(issue => issue.severity === 'minor').length,
    },
    sections,
    promotionBlockers,
    nextActions: dedupe([
      ...sectionsBelowTarget.flatMap(section => section.actions),
      ...(verificationLedger.summary.pending + verificationLedger.summary.blockedWithoutEvidence > 0 ? ['Collect engineering-review evidence for pending verification activities.'] : []),
      ...(verificationLedger.summary.accepted < verificationLedger.summary.evidenceEligibleActivities ? ['Accept reviewer evidence for every non-sourcing verification activity before treating the report as publishable.'] : []),
      ...(verification.summary.blocked > 0 ? ['Clear blocked verification activities or explicitly defer them with reviewer evidence.'] : []),
      ...(dossier.sourcing.admission.unpricedCriticalLines > 0 ? ['Use sourcing intake to admit source-backed supplier, manufacturer, MPN and cost evidence for critical BoM lines.'] : []),
    ]),
  }
}

export function renderReportReadinessGateCsv(gate: ReportReadinessGate): string {
  const header = [
    'section',
    'score',
    'targetScore',
    'passesTarget',
    'issueCount',
    'blockerCount',
    'majorCount',
    'minorCount',
    'actions',
  ]
  const rows = gate.sections.map(section => [
    section.section,
    section.score === null ? '' : String(section.score),
    String(section.targetScore),
    String(section.passesTarget),
    String(section.issueCount),
    String(section.blockerCount),
    String(section.majorCount),
    String(section.minorCount),
    section.actions.join(' '),
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function sectionReadiness(
  section: PdfSectionId,
  score: number | null,
  targetScore: number,
  issues: SectionIssue[],
): ReportReadinessSection {
  return {
    section,
    score,
    targetScore,
    passesTarget: score !== null && score >= targetScore,
    issueCount: issues.length,
    blockerCount: issueCount(issues, 'blocker'),
    majorCount: issueCount(issues, 'major'),
    minorCount: issueCount(issues, 'minor'),
    actions: actionsForIssues(section, issues),
  }
}

function actionsForIssues(section: PdfSectionId, issues: SectionIssue[]): string[] {
  if (issues.length === 0) return ['No deterministic issue currently blocks this section from the target score; external verification evidence may still be pending.']
  return dedupe(issues.map(issue => actionForIssue(section, issue)))
}

function actionForIssue(section: PdfSectionId, issue: SectionIssue): string {
  if (issue.code === 'critical_part_unpriced') return 'Admit source-backed evidence for every critical BoM line through sourcing intake.'
  if (issue.code === 'low_priced_line_ratio') return 'Increase priced-line coverage with admissible supplier evidence, not estimates.'
  if (issue.code === 'architecture_not_ready_for_bom') return 'Resolve architecture blockers before reviewing BoM or costs.'
  if (issue.code === 'missing_required_interface_link') return 'Restore the missing required interface on both endpoint modules and submodule carriers.'
  if (issue.code === 'missing_required_module') return 'Restore the missing class-required functional module.'
  if (issue.code === 'critical_part_not_allocated_to_module') return 'Allocate every critical part to a concrete submodule before BoM review.'
  if (issue.code === 'requirement_uncovered') return 'Map the uncovered brief requirement to modules, metrics and sanity checks.'
  if (issue.code === 'missing_headline_output') return 'Restore a headline output metric with provenance.'
  if (issue.code === 'too_few_sources') return 'Add source-ledger references for claims that depend on external evidence.'
  return issue.repairHint || `Resolve ${section} ${issue.severity} issue ${issue.code}.`
}

function issueCount(issues: SectionIssue[], severity: Severity): number {
  return issues.filter(issue => issue.severity === severity).length
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
