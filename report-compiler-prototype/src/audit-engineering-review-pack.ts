import { buildEngineeringReviewPack } from './architecture/engineering-review-pack'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { VerificationEvidenceRecord } from './schema/types'

const cgmBrief = 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.'
const bessBrief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const cgm = await runReportCompiler({ id: 'audit-engineering-review-pack-cgm', briefText: cgmBrief })
  const cgmPack = buildEngineeringReviewPack(cgm.dossier, cgm.architectureReadiness, cgm.issues)
  const subModuleCount = cgm.dossier.architecture.modules.reduce((sum, module) => sum + module.subModules.length, 0)

  assert(cgmPack.summary.moduleQuestions === cgm.architectureReadiness.moduleCount, 'CGM pack should include one module-allocation question per module.')
  assert(cgmPack.summary.subModuleQuestions === subModuleCount, 'CGM pack should include one submodule-allocation question per submodule.')
  assert(cgmPack.summary.interfaceQuestions === cgm.architectureReadiness.requiredInterfaceLinks.length, 'CGM pack should include one question per required interface contract.')
  assert(cgmPack.questions.every(question => question.reviewerQuestion.length > 30), 'Every review-pack row should include a concrete reviewer question.')
  assert(cgmPack.questions.every(question => question.evidenceRequired.length > 20), 'Every review-pack row should name evidence required.')
  assert(cgmPack.questions.every(question => question.kind !== 'assumption_resolution' || question.status !== 'accepted'), 'Assumptions should not become accepted without explicit reviewer evidence.')

  const unrealisticBess = await runReportCompiler({
    id: 'audit-engineering-review-pack-unrealistic-bess',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 5 tonne gross mass limit, and LFP prismatic cells.',
  })
  const unrealisticPack = buildEngineeringReviewPack(unrealisticBess.dossier, unrealisticBess.architectureReadiness, unrealisticBess.issues)
  const energyDensity = unrealisticPack.questions.find(question => question.id === 'calculation_envelope:bess_system_energy_density_wh_per_kg')
  assert(energyDensity?.status === 'blocked', 'Unrealistic BESS energy-density calculation should become a blocked review question.')
  assert(energyDensity?.priority === 'blocker', 'Blocked calculation review questions should be blocker priority.')

  const acceptedEvidence: VerificationEvidenceRecord = {
    activityId: 'design_review:energy_storage_source',
    evidenceKind: 'design_review',
    reviewerName: 'Protocol Test Reviewer',
    verdict: 'accepted',
    evidenceRef: 'test-fixture://engineering-review-pack/design_review/energy_storage_source',
    evidenceNote: 'Protocol-only fixture proving accepted design-review evidence flows into the engineering review pack.',
    reviewedAt: '2026-05-17T04:40:00.000+01:00',
  }
  const reviewedBess = await runReportCompiler({
    id: 'audit-engineering-review-pack-reviewed-bess',
    briefText: bessBrief,
    verificationEvidence: [acceptedEvidence],
  })
  const reviewedPack = buildEngineeringReviewPack(reviewedBess.dossier, reviewedBess.architectureReadiness, reviewedBess.issues)
  const acceptedModule = reviewedPack.questions.find(question => question.id === 'module_allocation:energy_storage_source')
  const acceptedSubModules = reviewedPack.questions.filter(question => question.kind === 'submodule_allocation' && question.linkedModuleIds.includes('energy_storage_source') && question.status === 'accepted')
  assert(acceptedModule?.status === 'accepted', 'Accepted design-review evidence should mark the matching module-allocation question accepted.')
  assert(acceptedSubModules.length > 0, 'Accepted module design-review evidence should also accept its submodule allocation questions.')
  assert(reviewedPack.summary.accepted > 1, 'Review pack should count downstream rows accepted by the fixture evidence.')

  console.log('Engineering review pack audit passed')
  console.log({
    cgm: cgmPack.summary,
    unrealisticBess: {
      status: energyDensity?.status,
      priority: energyDensity?.priority,
      blockers: energyDensity?.blockers,
    },
    reviewedBess: reviewedPack.summary,
  })
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
