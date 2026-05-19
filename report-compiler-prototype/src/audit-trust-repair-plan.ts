import { evaluateArchitectureReadiness, architectureBomGateIssues } from './gates/architecture-ready'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { ProductDossier, SourcingEvidenceRecord, VerificationEvidenceRecord } from './schema/types'
import { buildTrustRepairPlan } from './scoring/trust-repair-plan'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const unsourced = await runReportCompiler({ id: 'audit-trust-repair-plan-unsourced', briefText: brief })
  const unsourcedPlan = buildTrustRepairPlan(unsourced.dossier, unsourced.architectureReadiness, unsourced.issues, unsourced.score)
  const sourcingPackage = unsourcedPlan.packages.find(item => item.id === 'sourcing_intake')
  const verificationPackage = unsourcedPlan.packages.find(item => item.id === 'verification_intake')

  assert(unsourcedPlan.summary.trustVerdict === 'evidence_blocked', 'Unsourced BESS trust repair plan should inherit evidence_blocked verdict.')
  assert(unsourcedPlan.summary.nextPackage === 'sourcing_intake', 'Architecture-ready unsourced BESS should start with sourcing intake.')
  assert(sourcingPackage?.status === 'ready', 'Sourcing package should be ready when architecture passes.')
  assert(sourcingPackage?.sourceArtifacts.includes('*.sourcing-intake-template.csv'), 'Sourcing package should point to sourcing intake CSV.')
  assert((sourcingPackage?.closureRows ?? 0) > 0, 'Sourcing package should carry closure rows for missing source evidence.')
  assert(verificationPackage?.sourceArtifacts.includes('*.verification-intake-template.csv'), 'Verification package should point to verification intake CSV.')

  const sourceEvidence: SourcingEvidenceRecord = {
    componentWordId: 'lfp_prismatic_cells',
    supplierName: 'Protocol Test Supplier',
    manufacturer: 'Protocol Test Manufacturer',
    mpn: 'PROTOCOL-ONLY-NOT-A-REAL-PART',
    unitCostGbp: 75,
    leadTimeWeeks: 12,
    sourceGrade: 'priced',
    evidence: {
      kind: 'source',
      ref: 'test-fixture://trust-repair-plan/lfp-prismatic-cells',
      quote: 'Protocol-only fixture proving trust repair plan accounting. Not a real supplier quote.',
    },
    retrievedAt: '2026-05-17T09:40:00.000+01:00',
  }
  const verificationEvidence: VerificationEvidenceRecord = {
    activityId: 'design_review:energy_storage_source',
    evidenceKind: 'design_review',
    reviewerName: 'Protocol Test Reviewer',
    verdict: 'accepted',
    evidenceRef: 'test-fixture://trust-repair-plan/design-review/energy-storage-source',
    evidenceNote: 'Protocol-only fixture proving partial evidence keeps repair packages open.',
    reviewedAt: '2026-05-17T09:40:00.000+01:00',
  }
  const evidenced = await runReportCompiler({
    id: 'audit-trust-repair-plan-evidenced',
    briefText: brief,
    sourcingEvidence: [sourceEvidence],
    verificationEvidence: [verificationEvidence],
  })
  const evidencedPlan = buildTrustRepairPlan(evidenced.dossier, evidenced.architectureReadiness, evidenced.issues, evidenced.score)

  assert(evidencedPlan.summary.trustVerdict === 'evidence_blocked', 'Partial evidence should not close the trust repair plan.')
  assert(evidencedPlan.summary.packages >= 1, 'Partial evidence should leave repair packages open.')

  const brokenDossier = removeInterface(unsourced.dossier, 'energy_storage_source', 'dc_bus')
  const brokenReadiness = evaluateArchitectureReadiness(brokenDossier)
  const brokenIssues = [...unsourced.issues, ...architectureBomGateIssues(brokenReadiness)]
  const brokenPlan = buildTrustRepairPlan(brokenDossier, brokenReadiness, brokenIssues, unsourced.score)
  const brokenSourcing = brokenPlan.packages.find(item => item.id === 'sourcing_intake')

  assert(brokenPlan.summary.trustVerdict === 'not_reviewable', 'Broken architecture should make trust repair plan not_reviewable.')
  assert(brokenPlan.summary.nextPackage === 'architecture_revision', 'Broken architecture should start with architecture revision.')
  assert(brokenSourcing?.status === 'waiting', 'Sourcing should wait when architecture revision is still required.')

  console.log('Trust repair plan audit passed')
  console.log({
    unsourced: unsourcedPlan.summary,
    unsourcedPackages: unsourcedPlan.packages,
    evidenced: evidencedPlan.summary,
    broken: brokenPlan.summary,
    brokenPackages: brokenPlan.packages,
  })
}

function removeInterface(dossier: ProductDossier, moduleId: string, interfaceId: string): ProductDossier {
  const copy = JSON.parse(JSON.stringify(dossier)) as ProductDossier
  const module = copy.architecture.modules.find(item => item.id === moduleId)
  if (!module) return copy
  module.interfaces = module.interfaces.filter(item => item !== interfaceId)
  for (const subModule of module.subModules) {
    subModule.interfaces = subModule.interfaces.filter(item => item !== interfaceId)
  }
  return copy
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
