import { buildEngineeringVerificationPlan } from './architecture/verification-plan'
import { runReportCompiler } from './pipeline/run-report-compiler'
import { buildClosurePlan } from './scoring/closure-plan'
import type { SourcingEvidenceRecord, VerificationEvidenceRecord } from './schema/types'

const cgmBrief = 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.'
const bessBrief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const cgm = await runReportCompiler({ id: 'audit-closure-cgm', briefText: cgmBrief })
  const cgmPlan = buildClosurePlan(cgm.dossier, cgm.architectureReadiness, cgm.issues, cgm.score)

  assert(cgmPlan.summary.phases >= 4, 'CGM closure plan should have sourcing, engineering, verification and score phases.')
  assert(cgmPlan.summary.nextPhase === 'sourcing_intake', `CGM next phase should be sourcing_intake, got ${cgmPlan.summary.nextPhase}.`)
  assert(cgmPlan.phases[0].id === 'sourcing_intake', 'CGM should start with source-backed critical BoM evidence while architecture is ready.')
  assert(cgmPlan.phases.some(phase => phase.id === 'engineering_review' && phase.rowCount > 0), 'CGM should include engineering review phase.')
  assert(cgmPlan.phases.some(phase => phase.id === 'verification_intake' && phase.rowCount > 0), 'CGM should include verification intake phase.')
  assert(cgmPlan.phases.every(phase => phase.exitCriteria.length > 0), 'Every closure phase should have exit criteria.')

  const unrealistic = await runReportCompiler({
    id: 'audit-closure-unrealistic',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 5 tonne gross mass limit, and LFP prismatic cells.',
  })
  const unrealisticPlan = buildClosurePlan(unrealistic.dossier, unrealistic.architectureReadiness, unrealistic.issues, unrealistic.score)
  assert(unrealisticPlan.summary.nextPhase === 'architecture_revision', 'Outside-envelope BESS should start with architecture revision.')
  assert(unrealisticPlan.phases[0].topRows.some(row => row.id === 'calculation:bess_system_energy_density_wh_per_kg'), 'Architecture revision phase should include the outside-envelope energy-density calculation.')

  const initialBess = await runReportCompiler({ id: 'audit-closure-bess-initial', briefText: bessBrief })
  const firstVerificationActivity = buildEngineeringVerificationPlan(initialBess.dossier, initialBess.architectureReadiness, initialBess.issues)
    .activities
    .find(activity => activity.evidenceKind !== 'source_evidence')
  assert(firstVerificationActivity, 'BESS should have at least one non-source verification activity.')
  const evidenceKind = firstVerificationActivity.evidenceKind
  assert(evidenceKind !== 'source_evidence', 'Selected activity must not be source evidence.')

  const admitted = await runReportCompiler({
    id: 'audit-closure-bess-admitted',
    briefText: bessBrief,
    sourcingEvidence: [sourceEvidence()],
    verificationEvidence: [{
      activityId: firstVerificationActivity.id,
      evidenceKind,
      reviewerName: 'Protocol Closure Reviewer',
      verdict: 'accepted',
      evidenceRef: `test-fixture://closure/${firstVerificationActivity.id}`,
      evidenceNote: 'Protocol-only fixture proving closure-plan reduction. Not a real engineering signoff.',
      reviewedAt: '2026-05-17T03:00:00.000+01:00',
    }],
  })
  const admittedPlan = buildClosurePlan(admitted.dossier, admitted.architectureReadiness, admitted.issues, admitted.score)

  assert(!containsGap(admittedPlan, 'sourcing:lfp_prismatic_cells'), 'Admitted source evidence should remove lfp_prismatic_cells from closure plan.')
  assert(!containsGap(admittedPlan, `verification:${firstVerificationActivity.id}`), 'Accepted reviewer evidence should remove that verification gap from closure plan.')
  assert(admittedPlan.summary.sourcingIntakeRows < cgmPlan.summary.sourcingIntakeRows || admittedPlan.summary.verificationIntakeRows < cgmPlan.summary.verificationIntakeRows, 'Admitted evidence should reduce at least one phase queue.')

  console.log('Closure plan audit passed')
  console.log({
    cgm: cgmPlan.summary,
    unrealistic: unrealisticPlan.summary,
    admitted: admittedPlan.summary,
  })
}

function sourceEvidence(): SourcingEvidenceRecord {
  return {
    componentWordId: 'lfp_prismatic_cells',
    supplierName: 'Protocol Closure Supplier',
    manufacturer: 'Protocol Closure Manufacturer',
    mpn: 'PROTOCOL-CLOSURE-NOT-A-REAL-PART',
    unitCostGbp: 75,
    leadTimeWeeks: 12,
    sourceGrade: 'priced',
    evidence: {
      kind: 'source',
      ref: 'test-fixture://closure/lfp-prismatic-cells',
      quote: 'Protocol-only fixture proving closure-plan source evidence. Not a real supplier quote.',
    },
    retrievedAt: '2026-05-17T03:00:00.000+01:00',
  }
}

function containsGap(plan: ReturnType<typeof buildClosurePlan>, id: string): boolean {
  return plan.phases.some(phase => phase.topRows.some(row => row.id === id))
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
