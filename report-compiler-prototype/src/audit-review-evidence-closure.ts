import { buildEngineeringReviewPack } from './architecture/engineering-review-pack'
import { buildVerificationEvidenceLedger } from './architecture/verification-ledger'
import { buildEngineeringVerificationPlan } from './architecture/verification-plan'
import { runReportCompiler } from './pipeline/run-report-compiler'
import { buildClaimEvidenceGate } from './scoring/claim-evidence-gate'
import { buildClaimLedger } from './scoring/claim-ledger'
import { buildDocumentTrustGate } from './scoring/document-trust-gate'
import { buildEvidenceAuthenticityGate } from './scoring/evidence-authenticity'
import { buildTrustRepairPlan } from './scoring/trust-repair-plan'
import type { ReportRunResult, SourcingEvidenceRecord, VerificationEvidenceRecord } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const initial = await runReportCompiler({ id: 'audit-review-evidence-closure-initial', briefText: brief })
  const verificationPlan = buildEngineeringVerificationPlan(initial.dossier, initial.architectureReadiness, initial.issues)
  const sourcingEvidence = protocolSourcingEvidence(initial)
  const verificationEvidence = protocolVerificationEvidence(verificationPlan)

  const evidenced = await runReportCompiler({
    id: 'audit-review-evidence-closure-evidenced',
    briefText: brief,
    sourcingEvidence,
    verificationEvidence,
  })

  const evidencedPlan = buildEngineeringVerificationPlan(evidenced.dossier, evidenced.architectureReadiness, evidenced.issues)
  const verificationLedger = buildVerificationEvidenceLedger(evidencedPlan, verificationEvidence)
  const reviewPack = buildEngineeringReviewPack(evidenced.dossier, evidenced.architectureReadiness, evidenced.issues)
  const claimLedger = buildClaimLedger(evidenced.dossier, evidenced.architectureReadiness, evidenced.issues)
  const claimGate = buildClaimEvidenceGate(evidenced.dossier, evidenced.architectureReadiness, evidenced.issues)
  const authenticityGate = buildEvidenceAuthenticityGate(evidenced.dossier)
  const trustGate = buildDocumentTrustGate(evidenced.dossier, evidenced.architectureReadiness, evidenced.issues, evidenced.score)
  const trustRepairPlan = buildTrustRepairPlan(evidenced.dossier, evidenced.architectureReadiness, evidenced.issues, evidenced.score)
  const claimAreas = new Map(claimGate.rows.map(row => [row.area, row]))

  assert(sourcingEvidence.length > 0, 'Protocol fixture should create source evidence for candidate BoM lines.')
  assert(verificationEvidence.length === verificationLedger.summary.evidenceEligibleActivities, 'Protocol fixture should cover every non-source verification activity.')
  assert(evidenced.dossier.sourcing.admission.rejectedRecords.length === 0, 'Protocol fixture should not be rejected by sourcing admission.')
  assert(evidenced.dossier.sourcing.admission.unpricedCriticalLines === 0, 'Protocol source evidence should close every critical unpriced line.')
  assert(verificationLedger.summary.accepted === verificationLedger.summary.evidenceEligibleActivities, 'All non-source verification activities should be accepted.')
  assert(reviewPack.summary.accepted > initial.architectureReadiness.moduleCount, 'Accepted verification evidence should flow into review-pack rows beyond top-level modules.')
  assert(claimLedger.summary.accepted > initial.architectureReadiness.moduleCount, 'Accepted verification evidence should flow into claim ledger rows.')
  assert(claimAreas.get('architecture_design')?.verdict === 'claim_evidence_complete', 'Architecture-design claims should close under accepted design review evidence.')
  assert(claimAreas.get('engineering_math')?.verdict === 'claim_evidence_complete', 'Engineering-math claims should close under accepted calculation evidence and sourced cost evidence.')
  assert(claimAreas.get('bom_sourcing')?.verdict === 'claim_evidence_complete', 'BoM-sourcing claims should close under source-backed evidence plus design review.')
  assert(claimAreas.get('compliance_risk')?.verdict === 'claim_evidence_complete', 'Compliance and risk claims should close under accepted compliance/risk review evidence.')
  assert(trustGate.summary.reviewerAcceptedActivities === trustGate.summary.reviewerEligibleActivities, 'Trust gate should see full reviewer-evidence coverage.')
  assert(trustGate.summary.criticalMissingBomClaims === 0, 'Trust gate should see no critical missing BoM claims.')
  assert(trustGate.summary.assuranceAcceptedRows === trustGate.summary.assuranceRows, 'Accepted reviewer evidence should close every requirement assurance row.')
  assert(authenticityGate.verdict === 'protocol_only', 'Protocol evidence should be explicitly marked protocol_only, not production-ready.')
  assert(trustGate.verdict === 'architecture_review_only', 'Protocol evidence can close mechanics but must not make the document publishable_trusted.')
  assert(trustRepairPlan.summary.nextPackage === 'evidence_authenticity_review', 'Protocol evidence should leave an authenticity repair package open.')

  console.log('Review evidence closure audit passed')
  console.log({
    sourcingEvidence: sourcingEvidence.length,
    verificationEvidence: verificationEvidence.length,
    sourcingAdmission: evidenced.dossier.sourcing.admission,
    verification: verificationLedger.summary,
    reviewPack: reviewPack.summary,
    claimLedger: claimLedger.summary,
    claimGate: claimGate.summary,
    authenticityGate: authenticityGate.summary,
    trustGate: trustGate.summary,
    trustVerdict: trustGate.verdict,
    trustRepairPlan: trustRepairPlan.summary,
  })
}

function protocolSourcingEvidence(result: ReportRunResult): SourcingEvidenceRecord[] {
  const seen = new Set<string>()
  return result.dossier.bom.lines
    .filter(line => {
      if (seen.has(line.componentWordId)) return false
      seen.add(line.componentWordId)
      return true
    })
    .map((line, index) => ({
      componentWordId: line.componentWordId,
      supplierName: 'Protocol Evidence Supplier',
      manufacturer: 'Protocol Evidence Manufacturer',
      mpn: `PROTOCOL-${index + 1}-${line.componentWordId}`.slice(0, 80),
      unitCostGbp: 100 + index,
      leadTimeWeeks: 8,
      sourceGrade: 'priced',
      evidence: {
        kind: 'source',
        ref: `test-fixture://review-evidence-closure/source/${line.componentWordId}`,
        quote: 'Protocol-only fixture proving source-backed closure. Not a real supplier quote.',
      },
      retrievedAt: '2026-05-17T11:40:00.000+01:00',
    }))
}

function protocolVerificationEvidence(plan: ReturnType<typeof buildEngineeringVerificationPlan>): VerificationEvidenceRecord[] {
  return plan.activities
    .filter((activity): activity is typeof activity & { evidenceKind: VerificationEvidenceRecord['evidenceKind'] } => activity.evidenceKind !== 'source_evidence')
    .map(activity => ({
      activityId: activity.id,
      evidenceKind: activity.evidenceKind,
      reviewerName: 'Protocol Evidence Reviewer',
      verdict: 'accepted',
      evidenceRef: `test-fixture://review-evidence-closure/review/${activity.id}`,
      evidenceNote: 'Protocol-only fixture proving reviewer evidence closure. Not a real engineering signoff.',
      reviewedAt: '2026-05-17T11:40:00.000+01:00',
    }))
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
