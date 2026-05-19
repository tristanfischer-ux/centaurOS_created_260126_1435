import { buildEngineeringAssuranceMatrix } from './architecture/engineering-assurance-matrix'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { VerificationEvidenceRecord } from './schema/types'

const cgmBrief = 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.'
const bessBrief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const cgm = await runReportCompiler({ id: 'audit-engineering-assurance-matrix-cgm', briefText: cgmBrief })
  const cgmMatrix = buildEngineeringAssuranceMatrix(cgm.dossier, cgm.architectureReadiness, cgm.issues)
  assert(cgmMatrix.summary.rows === cgm.dossier.requirementTrace.length, 'Assurance matrix should emit one row per requirement trace row.')
  assert(cgmMatrix.summary.rowsWithReviewQuestions === cgmMatrix.summary.rows, 'Every CGM requirement should be connected to reviewer questions.')
  assert(cgmMatrix.rows.every(row => row.architectureModuleIds.length > 0), 'Every CGM assurance row should have architecture module links.')
  assert(cgmMatrix.rows.some(row => row.calculationIds.includes('cgm_total_wear_readings')), 'CGM assurance matrix should expose the total wear-readings calculation.')

  const unrealisticBess = await runReportCompiler({
    id: 'audit-engineering-assurance-matrix-unrealistic-bess',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 5 tonne gross mass limit, and LFP prismatic cells.',
  })
  const unrealisticMatrix = buildEngineeringAssuranceMatrix(unrealisticBess.dossier, unrealisticBess.architectureReadiness, unrealisticBess.issues)
  const massRow = unrealisticMatrix.rows.find(row => row.requirementId === 'mass_kg')
  assert(massRow?.overallStatus === 'blocked', 'Unrealistic BESS mass requirement should be blocked by energy-density calculation.')
  assert(massRow?.blockers.some(blocker => blocker.includes('700 Wh/kg')), 'Blocked BESS row should carry the energy-density interpretation.')

  const acceptedEvidence: VerificationEvidenceRecord = {
    activityId: 'design_review:energy_storage_source',
    evidenceKind: 'design_review',
    reviewerName: 'Protocol Test Reviewer',
    verdict: 'accepted',
    evidenceRef: 'test-fixture://engineering-assurance-matrix/design_review/energy_storage_source',
    evidenceNote: 'Protocol-only fixture proving accepted design-review evidence is visible on requirement assurance rows.',
    reviewedAt: '2026-05-17T05:40:00.000+01:00',
  }
  const reviewedBess = await runReportCompiler({
    id: 'audit-engineering-assurance-matrix-reviewed-bess',
    briefText: bessBrief,
    verificationEvidence: [acceptedEvidence],
  })
  const reviewedMatrix = buildEngineeringAssuranceMatrix(reviewedBess.dossier, reviewedBess.architectureReadiness, reviewedBess.issues)
  assert(reviewedMatrix.summary.rowsWithAcceptedVerification > 0, 'Accepted reviewer evidence should appear in at least one assurance row.')
  assert(reviewedMatrix.rows.some(row => row.acceptedVerificationActivityIds.includes(acceptedEvidence.activityId)), 'Accepted design-review activity should be linked to affected requirements.')

  console.log('Engineering assurance matrix audit passed')
  console.log({
    cgm: cgmMatrix.summary,
    unrealisticBess: {
      massRequirement: massRow,
    },
    reviewedBess: reviewedMatrix.summary,
  })
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
