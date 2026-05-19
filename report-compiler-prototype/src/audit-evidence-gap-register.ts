import { buildEngineeringVerificationPlan } from './architecture/verification-plan'
import { runReportCompiler } from './pipeline/run-report-compiler'
import { buildEvidenceGapRegister } from './scoring/evidence-gap-register'
import type { SourcingEvidenceRecord, VerificationEvidenceRecord } from './schema/types'

const cgmBrief = 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.'
const bessBrief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const cgm = await runReportCompiler({ id: 'audit-gap-cgm', briefText: cgmBrief })
  const cgmRegister = buildEvidenceGapRegister(cgm.dossier, cgm.architectureReadiness, cgm.issues, cgm.score)

  assert(cgmRegister.summary.rows > 40, 'CGM evidence gap register should consolidate many proof gaps.')
  assert(cgmRegister.rows.some(row => row.kind === 'sourcing_evidence' && row.closurePath === 'sourcing_intake'), 'CGM should include sourcing intake rows.')
  assert(cgmRegister.rows.some(row => row.kind === 'verification_evidence' && row.closurePath === 'verification_intake'), 'CGM should include verification intake rows.')
  assert(cgmRegister.rows.some(row => row.kind === 'calculation_review' && row.closurePath === 'engineering_review'), 'CGM should include calculation review rows.')
  assert(cgmRegister.summary.bomBlockingRows >= cgm.dossier.sourcing.admission.unpricedCriticalLines, 'CGM gap register should expose BoM-blocking gaps.')
  assert(cgmRegister.summary.publishBlockingRows === cgmRegister.summary.rows, 'Every current gap row should block publication.')

  const initialBess = await runReportCompiler({ id: 'audit-gap-bess-initial', briefText: bessBrief })
  const firstVerificationActivity = buildEngineeringVerificationPlan(initialBess.dossier, initialBess.architectureReadiness, initialBess.issues)
    .activities
    .find(activity => activity.evidenceKind !== 'source_evidence')
  assert(firstVerificationActivity, 'BESS should have at least one non-source verification activity.')
  const firstVerificationEvidenceKind = firstVerificationActivity.evidenceKind
  assert(firstVerificationEvidenceKind !== 'source_evidence', 'Selected verification activity should not require sourcing intake.')

  const sourcingEvidence: SourcingEvidenceRecord = {
    componentWordId: 'lfp_prismatic_cells',
    supplierName: 'Protocol Gap Supplier',
    manufacturer: 'Protocol Gap Manufacturer',
    mpn: 'PROTOCOL-GAP-NOT-A-REAL-PART',
    unitCostGbp: 75,
    leadTimeWeeks: 12,
    sourceGrade: 'priced',
    evidence: {
      kind: 'source',
      ref: 'test-fixture://evidence-gap/lfp-prismatic-cells',
      quote: 'Protocol-only fixture proving source-backed gap closure. Not a real supplier quote.',
    },
    retrievedAt: '2026-05-17T01:00:00.000+01:00',
  }
  const verificationEvidence: VerificationEvidenceRecord = {
    activityId: firstVerificationActivity.id,
    evidenceKind: firstVerificationEvidenceKind,
    reviewerName: 'Protocol Gap Reviewer',
    verdict: 'accepted',
    evidenceRef: `test-fixture://evidence-gap/${firstVerificationActivity.id}`,
    evidenceNote: 'Protocol-only fixture proving verification gap closure. Not a real engineering signoff.',
    reviewedAt: '2026-05-17T01:00:00.000+01:00',
  }
  const admittedBess = await runReportCompiler({
    id: 'audit-gap-bess-admitted',
    briefText: bessBrief,
    sourcingEvidence: [sourcingEvidence],
    verificationEvidence: [verificationEvidence],
  })
  const admittedRegister = buildEvidenceGapRegister(admittedBess.dossier, admittedBess.architectureReadiness, admittedBess.issues, admittedBess.score)

  assert(!admittedRegister.rows.some(row => row.id === 'sourcing:lfp_prismatic_cells'), 'Admitted source evidence should remove the matching sourcing gap row.')
  assert(!admittedRegister.rows.some(row => row.id === `verification:${firstVerificationActivity.id}`), 'Accepted verification evidence should remove the matching verification gap row.')
  assert(admittedRegister.summary.sourcingIntakeRows < cgmRegister.summary.sourcingIntakeRows || admittedRegister.summary.verificationIntakeRows < cgmRegister.summary.verificationIntakeRows, 'Admitted evidence should reduce at least one closure queue.')

  const unrealistic = await runReportCompiler({
    id: 'audit-gap-unrealistic-bess',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 5 tonne gross mass limit, and LFP prismatic cells.',
  })
  const unrealisticRegister = buildEvidenceGapRegister(unrealistic.dossier, unrealistic.architectureReadiness, unrealistic.issues, unrealistic.score)
  assert(unrealisticRegister.rows.some(row => row.id === 'calculation:bess_system_energy_density_wh_per_kg' && row.closurePath === 'architecture_revision'), 'Outside-envelope energy density should require architecture revision.')

  console.log('Evidence gap register audit passed')
  console.log({
    cgm: cgmRegister.summary,
    admittedBess: admittedRegister.summary,
    closed: {
      sourcing: 'sourcing:lfp_prismatic_cells',
      verification: `verification:${firstVerificationActivity.id}`,
    },
    unrealistic: unrealisticRegister.rows.find(row => row.id === 'calculation:bess_system_energy_density_wh_per_kg'),
  })
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
