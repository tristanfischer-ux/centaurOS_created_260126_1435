import { evaluateArchitectureReadiness, architectureBomGateIssues } from './gates/architecture-ready'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { ProductDossier, SourcingEvidenceRecord, VerificationEvidenceRecord } from './schema/types'
import { buildDocumentTrustGate } from './scoring/document-trust-gate'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const unsourced = await runReportCompiler({ id: 'audit-document-trust-gate-unsourced', briefText: brief })
  const unsourcedGate = buildDocumentTrustGate(unsourced.dossier, unsourced.architectureReadiness, unsourced.issues, unsourced.score)
  const unsourcedBom = unsourcedGate.rows.find(row => row.area === 'bom_provenance')
  const unsourcedClaim = unsourcedGate.rows.find(row => row.area === 'claim_evidence')

  assert(unsourcedGate.verdict === 'evidence_blocked', 'Unsourced but architecture-ready BESS should be evidence-blocked, not trusted.')
  assert(unsourcedBom?.verdict === 'blocked', 'Unsourced BESS BoM provenance should block document trust.')
  assert(unsourcedClaim?.verdict === 'blocked', 'Unsourced BESS claim evidence should block document trust.')
  assert(unsourcedGate.summary.passRows < unsourcedGate.summary.rows, 'Unsourced BESS must not pass all trust areas.')

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
      ref: 'test-fixture://document-trust-gate/lfp-prismatic-cells',
      quote: 'Protocol-only fixture proving document trust gate accounting. Not a real supplier quote.',
    },
    retrievedAt: '2026-05-17T08:40:00.000+01:00',
  }
  const verificationEvidence: VerificationEvidenceRecord = {
    activityId: 'design_review:energy_storage_source',
    evidenceKind: 'design_review',
    reviewerName: 'Protocol Test Reviewer',
    verdict: 'accepted',
    evidenceRef: 'test-fixture://document-trust-gate/design-review/energy-storage-source',
    evidenceNote: 'Protocol-only fixture proving reviewer evidence affects trust-gate counters.',
    reviewedAt: '2026-05-17T08:40:00.000+01:00',
  }
  const evidenced = await runReportCompiler({
    id: 'audit-document-trust-gate-evidenced',
    briefText: brief,
    sourcingEvidence: [sourceEvidence],
    verificationEvidence: [verificationEvidence],
  })
  const evidencedGate = buildDocumentTrustGate(evidenced.dossier, evidenced.architectureReadiness, evidenced.issues, evidenced.score)

  assert(evidencedGate.summary.sourceBackedBomClaims > unsourcedGate.summary.sourceBackedBomClaims, 'Source evidence should increase source-backed BoM claim count.')
  assert(evidencedGate.summary.reviewerAcceptedActivities > unsourcedGate.summary.reviewerAcceptedActivities, 'Reviewer evidence should increase accepted verification activity count.')
  assert(evidencedGate.verdict === 'evidence_blocked', 'Partial protocol evidence should not make the document trusted.')

  const brokenDossier = removeInterface(unsourced.dossier, 'energy_storage_source', 'dc_bus')
  const brokenReadiness = evaluateArchitectureReadiness(brokenDossier)
  const brokenIssues = [...unsourced.issues, ...architectureBomGateIssues(brokenReadiness)]
  const brokenGate = buildDocumentTrustGate(brokenDossier, brokenReadiness, brokenIssues, unsourced.score)

  assert(!brokenReadiness.readyForBom, 'Broken fixture should fail architecture readiness.')
  assert(brokenGate.verdict === 'not_reviewable', 'Architecture-broken fixture should be marked not reviewable.')
  assert(brokenGate.rows.find(row => row.area === 'architecture_readiness')?.verdict === 'blocked', 'Architecture readiness row should block trust.')

  console.log('Document trust gate audit passed')
  console.log({
    unsourced: unsourcedGate.summary,
    evidenced: evidencedGate.summary,
    broken: {
      verdict: brokenGate.verdict,
      summary: brokenGate.summary,
      blockers: brokenGate.promotionBlockers.slice(0, 5),
    },
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
