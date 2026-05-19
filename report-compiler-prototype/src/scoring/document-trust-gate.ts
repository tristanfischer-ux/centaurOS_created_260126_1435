import { buildEngineeringAssuranceMatrix } from '../architecture/engineering-assurance-matrix'
import { buildVerificationEvidenceLedger } from '../architecture/verification-ledger'
import { buildEngineeringVerificationPlan } from '../architecture/verification-plan'
import type { ArchitectureReadiness, BatchSectionScore, ProductDossier, SectionIssue } from '../schema/types'
import { buildBomProvenanceManifest } from '../sourcing/provenance-manifest'
import { buildClaimEvidenceGate } from './claim-evidence-gate'
import { buildEvidenceAuthenticityGate } from './evidence-authenticity'
import { buildReportReadinessGate } from './report-readiness'

export type DocumentTrustVerdict =
  | 'publishable_trusted'
  | 'architecture_review_only'
  | 'evidence_blocked'
  | 'not_reviewable'

export type DocumentTrustArea =
  | 'architecture_readiness'
  | 'section_scores'
  | 'claim_evidence'
  | 'requirement_assurance'
  | 'reviewer_evidence'
  | 'bom_provenance'
  | 'evidence_authenticity'

export type DocumentTrustAreaVerdict = 'pass' | 'review' | 'blocked'

export interface DocumentTrustGateRow {
  area: DocumentTrustArea
  verdict: DocumentTrustAreaVerdict
  signal: string
  passRatio: number
  blockers: string[]
  requiredAction: string
}

export interface DocumentTrustGate {
  verdict: DocumentTrustVerdict
  summary: {
    rows: number
    passRows: number
    reviewRows: number
    blockedRows: number
    passRatio: number
    architectureReady: boolean
    sectionsAtTarget: number
    sections: number
    claimEvidenceVerdict: string
    assuranceAcceptedRows: number
    assuranceRows: number
    reviewerAcceptedActivities: number
    reviewerEligibleActivities: number
    sourceBackedBomClaims: number
    criticalMissingBomClaims: number
    provenanceViolations: number
    evidenceAuthenticityVerdict: string
    evidenceRows: number
    productionReadyEvidenceRows: number
    protocolEvidenceRows: number
    evidenceReviewRequiredRows: number
  }
  rows: DocumentTrustGateRow[]
  promotionBlockers: string[]
  nextActions: string[]
}

export function buildDocumentTrustGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
  score?: BatchSectionScore,
): DocumentTrustGate {
  const reportReadiness = buildReportReadinessGate(dossier, readiness, issues, score)
  const claimEvidence = buildClaimEvidenceGate(dossier, readiness, issues)
  const assurance = buildEngineeringAssuranceMatrix(dossier, readiness, issues)
  const verificationPlan = buildEngineeringVerificationPlan(dossier, readiness, issues)
  const verificationLedger = buildVerificationEvidenceLedger(verificationPlan, dossier.sources.verificationEvidence)
  const bomProvenance = buildBomProvenanceManifest(dossier)
  const authenticity = buildEvidenceAuthenticityGate(dossier)

  const rows: DocumentTrustGateRow[] = [
    {
      area: 'architecture_readiness',
      verdict: readiness.readyForBom ? 'pass' : 'blocked',
      signal: readiness.readyForBom
        ? `${readiness.moduleCount} modules, ${readiness.subModuleCount} submodules and ${readiness.requiredInterfaceLinks.length} required links pass deterministic architecture gates.`
        : `${readiness.blockingIssues.length} architecture blocker or major issue(s) remain.`,
      passRatio: readiness.readyForBom ? 1 : 0,
      blockers: readiness.blockingIssues.map(issue => `${issue.code}: ${issue.message}`),
      requiredAction: readiness.readyForBom
        ? 'No deterministic architecture blocker remains; continue with reviewer evidence before treating it as accepted.'
        : 'Resolve architecture blockers before BoM, sourcing or publication review.',
    },
    {
      area: 'section_scores',
      verdict: reportReadiness.summary.sectionsBelowTarget === 0 ? 'pass' : 'blocked',
      signal: `${reportReadiness.summary.sectionsAtOrAboveTarget}/${reportReadiness.summary.sections} scored sections are at or above ${reportReadiness.targetSectionScore}; mean ${reportReadiness.summary.meanScore ?? 'n/a'}.`,
      passRatio: ratio(reportReadiness.summary.sectionsAtOrAboveTarget, reportReadiness.summary.sections),
      blockers: reportReadiness.sections
        .filter(section => !section.passesTarget)
        .map(section => `${section.section}: score ${section.score ?? 'n/a'} below ${section.targetScore}`),
      requiredAction: reportReadiness.summary.sectionsBelowTarget === 0
        ? 'Keep score ledger attached; external evidence gates may still block trust.'
        : 'Repair below-target sections through the specific score-ledger actions.',
    },
    {
      area: 'claim_evidence',
      verdict: claimEvidence.verdict === 'claim_evidence_complete'
        ? 'pass'
        : claimEvidence.verdict === 'evidence_blocked' ? 'blocked' : 'review',
      signal: `${claimEvidence.summary.passedClaims}/${claimEvidence.summary.claimRows} claims pass; ${claimEvidence.summary.blockedClaims} blocked/source-required, ${claimEvidence.summary.reviewRequiredClaims} review-required.`,
      passRatio: claimEvidence.summary.passRatio,
      blockers: claimEvidence.promotionBlockers,
      requiredAction: claimEvidence.nextActions.join(' ') || 'No claim-evidence action required.',
    },
    {
      area: 'requirement_assurance',
      verdict: assurance.summary.blocked > 0 || assurance.summary.unlinked > 0
        ? 'blocked'
        : assurance.summary.needsReview > 0 || assurance.summary.readyForReview > 0 ? 'review' : 'pass',
      signal: `${assurance.summary.accepted}/${assurance.summary.rows} requirements have accepted assurance; ${assurance.summary.needsReview} need review, ${assurance.summary.blocked} blocked, ${assurance.summary.unlinked} unlinked.`,
      passRatio: ratio(assurance.summary.accepted, assurance.summary.rows),
      blockers: assurance.rows
        .filter(row => row.overallStatus === 'blocked' || row.overallStatus === 'unlinked')
        .map(row => `${row.requirementId}: ${row.nextAction}`),
      requiredAction: assurance.summary.blocked > 0 || assurance.summary.unlinked > 0
        ? 'Resolve blocked or unlinked requirement assurance rows before trust.'
        : assurance.summary.accepted === assurance.summary.rows
          ? 'All requirement assurance rows have accepted evidence.'
          : 'Collect reviewer evidence for requirement assurance rows before publication.',
    },
    {
      area: 'reviewer_evidence',
      verdict: verificationLedger.summary.rejected > 0 || verificationLedger.summary.blockedWithoutEvidence > 0
        ? 'blocked'
        : verificationLedger.summary.accepted === verificationLedger.summary.evidenceEligibleActivities ? 'pass' : 'review',
      signal: `${verificationLedger.summary.accepted}/${verificationLedger.summary.evidenceEligibleActivities} non-sourcing verification activities accepted; ${verificationLedger.summary.rejected} rejected, ${verificationLedger.summary.deferred} deferred, ${verificationLedger.summary.pending + verificationLedger.summary.blockedWithoutEvidence} pending/blocked.`,
      passRatio: verificationLedger.summary.acceptanceRatio,
      blockers: verificationLedger.rows
        .filter(row => row.ledgerStatus === 'rejected' || row.ledgerStatus === 'blocked_without_evidence')
        .map(row => `${row.activityId}: ${row.residualAction}`),
      requiredAction: verificationLedger.summary.accepted === verificationLedger.summary.evidenceEligibleActivities
        ? 'All non-sourcing verification activities have accepted reviewer evidence.'
        : 'Collect accepted reviewer evidence for every non-sourcing verification activity.',
    },
    {
      area: 'bom_provenance',
      verdict: bomProvenance.summary.provenanceViolations > 0 || bomProvenance.summary.criticalMissingSourceClaims > 0
        ? 'blocked'
        : bomProvenance.summary.missingSourceClaims > 0 ? 'review' : 'pass',
      signal: `${bomProvenance.summary.sourceBackedClaims} source-backed BoM claims, ${bomProvenance.summary.criticalMissingSourceClaims} critical missing-source claims, ${bomProvenance.summary.provenanceViolations} provenance violations.`,
      passRatio: ratio(
        bomProvenance.summary.sourceBackedClaims + bomProvenance.summary.notClaimedRows,
        bomProvenance.summary.claimRows,
      ),
      blockers: bomProvenance.rows
        .filter(row => row.status === 'provenance_violation' || (row.critical && row.status === 'missing_source'))
        .map(row => `${row.lineId}/${row.field}: ${row.nextAction}`),
      requiredAction: bomProvenance.summary.provenanceViolations > 0 || bomProvenance.summary.criticalMissingSourceClaims > 0
        ? 'Admit source-backed evidence for critical BoM supplier, manufacturer, MPN and cost claims.'
        : 'Keep source refs attached and refresh before procurement use.',
    },
    {
      area: 'evidence_authenticity',
      verdict: authenticity.verdict === 'production_ready' ? 'pass' : 'review',
      signal: `${authenticity.summary.productionReadyRows}/${authenticity.summary.rows} evidence row(s) are production-ready; ${authenticity.summary.protocolFixtureRows} protocol fixture, ${authenticity.summary.reviewRequiredRows + authenticity.summary.missingMetadataRows} review/missing metadata.`,
      passRatio: authenticity.summary.passRatio,
      blockers: authenticity.promotionBlockers,
      requiredAction: authenticity.verdict === 'production_ready'
        ? 'Evidence references are production-ready; keep source/review records attached.'
        : authenticity.verdict === 'no_evidence'
          ? 'Admit source and reviewer evidence before trusting the document.'
          : 'Replace protocol fixtures or weak references with production evidence before calling the document trusted.',
    },
  ]

  const blockedRows = rows.filter(row => row.verdict === 'blocked')
  const reviewRows = rows.filter(row => row.verdict === 'review')
  const nonBomSectionsBelowTarget = reportReadiness.sections.some(section => !section.passesTarget && section.section !== 'bom')
  const verdict: DocumentTrustVerdict = !readiness.readyForBom || nonBomSectionsBelowTarget
    ? 'not_reviewable'
    : blockedRows.length > 0
      ? 'evidence_blocked'
      : reviewRows.length > 0 ? 'architecture_review_only' : 'publishable_trusted'

  return {
    verdict,
    summary: {
      rows: rows.length,
      passRows: rows.filter(row => row.verdict === 'pass').length,
      reviewRows: reviewRows.length,
      blockedRows: blockedRows.length,
      passRatio: ratio(rows.filter(row => row.verdict === 'pass').length, rows.length),
      architectureReady: readiness.readyForBom,
      sectionsAtTarget: reportReadiness.summary.sectionsAtOrAboveTarget,
      sections: reportReadiness.summary.sections,
      claimEvidenceVerdict: claimEvidence.verdict,
      assuranceAcceptedRows: assurance.summary.accepted,
      assuranceRows: assurance.summary.rows,
      reviewerAcceptedActivities: verificationLedger.summary.accepted,
      reviewerEligibleActivities: verificationLedger.summary.evidenceEligibleActivities,
      sourceBackedBomClaims: bomProvenance.summary.sourceBackedClaims,
      criticalMissingBomClaims: bomProvenance.summary.criticalMissingSourceClaims,
      provenanceViolations: bomProvenance.summary.provenanceViolations,
      evidenceAuthenticityVerdict: authenticity.verdict,
      evidenceRows: authenticity.summary.rows,
      productionReadyEvidenceRows: authenticity.summary.productionReadyRows,
      protocolEvidenceRows: authenticity.summary.protocolFixtureRows,
      evidenceReviewRequiredRows: authenticity.summary.reviewRequiredRows + authenticity.summary.missingMetadataRows,
    },
    rows,
    promotionBlockers: blockedRows.flatMap(row => row.blockers.length > 0 ? row.blockers : [`${row.area}: ${row.signal}`]),
    nextActions: Array.from(new Set(rows.filter(row => row.verdict !== 'pass').map(row => row.requiredAction))),
  }
}

export function renderDocumentTrustGateCsv(gate: DocumentTrustGate): string {
  const header = [
    'area',
    'verdict',
    'signal',
    'passRatio',
    'blockers',
    'requiredAction',
  ]
  const rows = gate.rows.map(row => [
    row.area,
    row.verdict,
    row.signal,
    String(row.passRatio),
    row.blockers.join(' '),
    row.requiredAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 1
  return Math.round((numerator / denominator) * 100) / 100
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
