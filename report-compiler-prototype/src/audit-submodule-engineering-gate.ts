import { runReportCompiler } from './pipeline/run-report-compiler'
import {
  buildSubModuleEngineeringGate,
  renderSubModuleEngineeringGateCsv,
} from './scoring/submodule-engineering-gate'
import type { ProductDossier, VerificationEvidenceRecord } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const initial = await runReportCompiler({ id: 'audit-submodule-engineering-initial', briefText: brief })
  const initialGate = buildSubModuleEngineeringGate(initial.dossier, initial.architectureReadiness, initial.issues)
  const initialCsv = renderSubModuleEngineeringGateCsv(initialGate)

  assert(initialGate.verdict === 'submodule_engineering_review_required', 'Unsourced BESS submodules should need review, not pass outright.')
  assert(initialGate.summary.rows === initial.architectureReadiness.subModuleCount, 'Gate should emit one row per architecture submodule.')
  assert(initialGate.summary.componentWords === initial.architectureReadiness.componentWordCount, 'Gate should count every component word.')
  assert(initialGate.summary.blockedRows === 0, 'Baseline BESS submodules should have no deterministic structural blockers.')
  assert(initialGate.summary.reviewRows > 0, 'Baseline BESS submodules should wait for review/source evidence.')
  assert(initialGate.summary.reviewQuestions > 0, 'Submodule gate should link engineering review questions.')
  assert(initialGate.summary.verificationActivities > 0, 'Submodule gate should link verification activities.')
  assert(initialGate.summary.criticalUnpricedLines > 0, 'Submodule gate should surface critical unpriced component rows.')
  assert(initialCsv.trim().split('\n').length === initialGate.summary.rows + 1, 'Submodule CSV should contain one header plus one row per submodule.')

  const emptyPurpose = removeFirstSubModulePurpose(initial.dossier)
  const emptyPurposeGate = buildSubModuleEngineeringGate(emptyPurpose, initial.architectureReadiness, initial.issues)

  assert(emptyPurposeGate.verdict === 'submodule_engineering_blocked', 'Blank submodule purpose should block submodule engineering.')
  assert(emptyPurposeGate.rows[0]?.verdict === 'blocked', 'Tainted submodule row should be blocked.')
  assert(emptyPurposeGate.blockers.some(blocker => blocker.includes('purpose is blank')), 'Blocked gate should name the blank-purpose issue.')

  const withoutComponents = removeFirstSubModuleComponents(initial.dossier)
  const withoutComponentsGate = buildSubModuleEngineeringGate(withoutComponents, initial.architectureReadiness, initial.issues)

  assert(withoutComponentsGate.verdict === 'submodule_engineering_blocked', 'Submodule without components should block submodule engineering.')
  assert(withoutComponentsGate.blockers.some(blocker => blocker.includes('no component candidates')), 'Blocked gate should name missing component candidates.')

  const accepted = await runReportCompiler({
    id: 'audit-submodule-engineering-accepted',
    briefText: brief,
    verificationEvidence: acceptedDesignReviewEvidence(initial.dossier),
  })
  const acceptedGate = buildSubModuleEngineeringGate(accepted.dossier, accepted.architectureReadiness, accepted.issues)

  assert(acceptedGate.summary.acceptedVerificationActivities >= initial.architectureReadiness.subModuleCount, 'Accepted design-review evidence should be visible on submodule rows.')
  assert(acceptedGate.summary.acceptedReviewQuestions > initialGate.summary.acceptedReviewQuestions, 'Accepted design-review evidence should increase accepted review questions.')

  console.log('Submodule engineering gate audit passed')
  console.log({
    initial: initialGate.summary,
    emptyPurpose: emptyPurposeGate.summary,
    withoutComponents: withoutComponentsGate.summary,
    accepted: acceptedGate.summary,
  })
}

function removeFirstSubModulePurpose(dossier: ProductDossier): ProductDossier {
  const copy = clone(dossier)
  const firstSubModule = copy.architecture.modules[0]?.subModules[0]
  if (firstSubModule) firstSubModule.purpose = ''
  return copy
}

function removeFirstSubModuleComponents(dossier: ProductDossier): ProductDossier {
  const copy = clone(dossier)
  const firstSubModule = copy.architecture.modules[0]?.subModules[0]
  if (firstSubModule) firstSubModule.words = []
  return copy
}

function acceptedDesignReviewEvidence(dossier: ProductDossier): VerificationEvidenceRecord[] {
  return dossier.architecture.modules.map(module => ({
    activityId: `design_review:${module.id}`,
    evidenceKind: 'design_review',
    reviewerName: 'Audit Reviewer',
    verdict: 'accepted',
    evidenceRef: `audit://design-review/${module.id}`,
    evidenceNote: `Accepted module boundary and submodule split for ${module.displayName}.`,
    reviewedAt: '2026-05-18T00:00:00.000Z',
  }))
}

function clone(dossier: ProductDossier): ProductDossier {
  return JSON.parse(JSON.stringify(dossier)) as ProductDossier
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
