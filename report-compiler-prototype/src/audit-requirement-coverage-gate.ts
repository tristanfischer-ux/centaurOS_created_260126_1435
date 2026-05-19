import { buildEngineeringVerificationPlan } from './architecture/verification-plan'
import { runReportCompiler } from './pipeline/run-report-compiler'
import {
  buildRequirementCoverageGate,
  renderRequirementCoverageGateCsv,
} from './scoring/requirement-coverage-gate'
import type { ReportRunResult, SourcingEvidenceRecord, VerificationEvidenceRecord } from './schema/types'

const bessBrief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const initial = await runReportCompiler({ id: 'audit-requirement-coverage-initial', briefText: bessBrief })
  const initialGate = buildRequirementCoverageGate(initial.dossier, initial.architectureReadiness, initial.issues)
  const initialCsv = renderRequirementCoverageGateCsv(initialGate)

  assert(initialGate.verdict === 'coverage_review_ready', 'Initial BESS requirement coverage should be structurally ready for review.')
  assert(initialGate.summary.rows === initial.dossier.requirementTrace.length, 'Coverage gate should emit one row per parsed requirement.')
  assert(initialGate.summary.architectureLinkedRows === initialGate.summary.rows, 'Every BESS requirement should have architecture module coverage.')
  assert(initialGate.summary.reviewQuestionRows === initialGate.summary.rows, 'Every BESS requirement should have review-question coverage.')
  assert(initialGate.summary.verificationActivityRows === initialGate.summary.rows, 'Every BESS requirement should have verification activity coverage.')
  assert(initialGate.summary.acceptedEvidenceRows === 0, 'Initial BESS should not pretend reviewer evidence is accepted.')
  assert(initialCsv.trim().split('\n').length === initialGate.summary.rows + 1, 'Coverage CSV should contain one header plus one row per requirement.')

  const impossible = await runReportCompiler({
    id: 'audit-requirement-coverage-impossible',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 5 tonne gross mass limit, and LFP prismatic cells.',
  })
  const impossibleGate = buildRequirementCoverageGate(impossible.dossier, impossible.architectureReadiness, impossible.issues)

  assert(impossibleGate.verdict === 'coverage_blocked', 'Impossible BESS mass should block requirement coverage.')
  assert(impossibleGate.rows.some(row => row.requirementId === 'mass_kg' && row.status === 'blocked'), 'Mass requirement should be the blocked coverage row.')

  const evidenced = await runReportCompiler({
    id: 'audit-requirement-coverage-evidenced',
    briefText: bessBrief,
    sourcingEvidence: protocolSourcingEvidence(initial),
    verificationEvidence: protocolVerificationEvidence(buildEngineeringVerificationPlan(initial.dossier, initial.architectureReadiness, initial.issues)),
  })
  const evidencedGate = buildRequirementCoverageGate(evidenced.dossier, evidenced.architectureReadiness, evidenced.issues)

  assert(evidencedGate.verdict === 'accepted_evidence', 'Full protocol reviewer evidence should mark requirement coverage accepted mechanically.')
  assert(evidencedGate.summary.acceptedEvidenceRows === evidencedGate.summary.rows, 'Every evidenced requirement row should be accepted.')

  console.log('Requirement coverage gate audit passed')
  console.log({
    initial: initialGate.summary,
    impossible: impossibleGate.summary,
    evidenced: evidencedGate.summary,
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
        ref: `test-fixture://requirement-coverage/source/${line.componentWordId}`,
        quote: 'Protocol-only fixture proving source-backed closure. Not a real supplier quote.',
      },
      retrievedAt: '2026-05-17T16:40:00.000+01:00',
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
      evidenceRef: `test-fixture://requirement-coverage/review/${activity.id}`,
      evidenceNote: 'Protocol-only fixture proving reviewer evidence closure. Not a real engineering signoff.',
      reviewedAt: '2026-05-17T16:40:00.000+01:00',
    }))
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
