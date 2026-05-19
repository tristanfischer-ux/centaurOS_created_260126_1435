import { buildEngineeringVerificationPlan } from './architecture/verification-plan'
import { runReportCompiler } from './pipeline/run-report-compiler'
import {
  buildEvidenceAcquisitionPlan,
  renderEvidenceAcquisitionPlanCsv,
} from './scoring/evidence-acquisition-plan'
import type { ReportRunResult, SourcingEvidenceRecord, VerificationEvidenceRecord } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const initial = await runReportCompiler({ id: 'audit-evidence-acquisition-initial', briefText: brief })
  const initialPlan = buildEvidenceAcquisitionPlan(initial.dossier, initial.architectureReadiness, initial.issues, initial.score)
  const csv = renderEvidenceAcquisitionPlanCsv(initialPlan)

  assert(initialPlan.summary.rows > 0, 'Unsourced run should produce evidence acquisition rows.')
  assert(initialPlan.summary.sourcingRows > 0, 'Unsourced run should produce sourcing acquisition rows.')
  assert(initialPlan.summary.verificationRows > 0, 'Unsourced run should produce verification acquisition rows.')
  assert(initialPlan.summary.bomBlockingRows === initialPlan.summary.sourcingRows, 'Sourcing rows should be the BoM-blocking acquisition rows.')
  assert(initialPlan.summary.publishBlockingRows === initialPlan.summary.rows, 'Every acquisition row should block publishable trust until resolved.')
  assert(initialPlan.rows.every(row => row.requiredFields.length > 0), 'Every acquisition row should declare required fields.')
  assert(initialPlan.rows.every(row => row.disallowedEvidence.some(item => item.includes('test-fixture://') || item.includes('LLM'))), 'Rows should explicitly reject weak/protocol evidence.')
  assert(csv.trim().split('\n').length === initialPlan.summary.rows + 1, 'Acquisition CSV should contain one header plus one row per acquisition row.')

  const closed = await runReportCompiler({
    id: 'audit-evidence-acquisition-closed',
    briefText: brief,
    sourcingEvidence: protocolSourcingEvidence(initial),
    verificationEvidence: protocolVerificationEvidence(buildEngineeringVerificationPlan(initial.dossier, initial.architectureReadiness, initial.issues)),
  })
  const closedPlan = buildEvidenceAcquisitionPlan(closed.dossier, closed.architectureReadiness, closed.issues, closed.score)

  assert(closedPlan.summary.rows === 0, 'Filled sourcing and verification evidence should close missing-evidence acquisition rows.')

  console.log('Evidence acquisition plan audit passed')
  console.log({
    initial: initialPlan.summary,
    closed: closedPlan.summary,
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
        ref: `test-fixture://evidence-acquisition/source/${line.componentWordId}`,
        quote: 'Protocol-only fixture proving source-backed closure. Not a real supplier quote.',
      },
      retrievedAt: '2026-05-17T15:40:00.000+01:00',
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
      evidenceRef: `test-fixture://evidence-acquisition/review/${activity.id}`,
      evidenceNote: 'Protocol-only fixture proving reviewer evidence closure. Not a real engineering signoff.',
      reviewedAt: '2026-05-17T15:40:00.000+01:00',
    }))
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
