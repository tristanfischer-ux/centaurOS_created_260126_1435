import type { ProductDossier } from './schema/types'
import { runReportCompiler } from './pipeline/run-report-compiler'
import { buildSourcingAuthorizationGate, renderSourcingAuthorizationGateCsv } from './scoring/sourcing-authorization-gate'

const bessBrief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const bess = await runReportCompiler({ id: 'audit-sourcing-authorization-bess', briefText: bessBrief })
  const bessGate = buildSourcingAuthorizationGate(bess.dossier, bess.architectureReadiness, bess.stageTrace)
  const bessCsv = renderSourcingAuthorizationGateCsv(bessGate)

  assert(bessGate.verdict === 'sourcing_authorized', 'Rich BESS should be authorized for evidence-gated sourcing.')
  assert(bessGate.summary.sourcingAuthorized, 'Authorized BESS summary should expose sourcingAuthorized=true.')
  assert(bessGate.summary.criticalIntakeRows === bessGate.summary.criticalUnpricedRows, 'Critical intake rows should cover critical unpriced lines.')
  assert(bessGate.summary.fullIntakeRows === bessGate.summary.criticalUnpricedRows + bessGate.summary.candidateUnpricedRows, 'Full intake rows should cover all unpriced lines.')
  assert(bessCsv.split('\n')[0]?.includes('area,verdict,signal'), 'Sourcing authorization CSV should include the expected header.')

  const sparseDrone = await runReportCompiler({ id: 'audit-sourcing-authorization-sparse-drone', briefText: 'Design a drone.' })
  const sparseGate = buildSourcingAuthorizationGate(sparseDrone.dossier, sparseDrone.architectureReadiness, sparseDrone.stageTrace)

  assert(sparseGate.verdict === 'sourcing_authorization_review_required', 'Sparse review-only architecture should keep sourcing review-required.')
  assert(!sparseGate.summary.sourcingAuthorized, 'Review-required sourcing should not be marked authorized.')
  assert(sparseGate.summary.architectureAdmissionVerdict === 'architecture_generation_review_required', 'Sparse gate should point back to architecture admission.')

  const unknown = await runReportCompiler({ id: 'audit-sourcing-authorization-unknown', briefText: 'Design a nice thing.' })
  const unknownGate = buildSourcingAuthorizationGate(unknown.dossier, unknown.architectureReadiness, unknown.stageTrace)

  assert(unknownGate.verdict === 'sourcing_authorization_blocked', 'Unknown blocked architecture should block sourcing authorization.')
  assert(!unknownGate.summary.sourcingAuthorized, 'Blocked sourcing should not be authorized.')
  assert(unknownGate.summary.architectureAdmissionVerdict === 'architecture_generation_blocked', 'Unknown gate should expose blocked architecture admission.')

  const rejectedEvidence = await runReportCompiler({
    id: 'audit-sourcing-authorization-rejected',
    briefText: bessBrief,
    sourcingEvidence: [{
      componentWordId: bess.dossier.bom.lines[0]?.componentWordId ?? 'missing',
      supplierName: '',
      manufacturer: '',
      mpn: '',
      unitCostGbp: 0,
      sourceGrade: 'priced',
      evidence: { kind: 'source', ref: '', quote: '' },
      retrievedAt: '',
    }],
  })
  const rejectedGate = buildSourcingAuthorizationGate(rejectedEvidence.dossier, rejectedEvidence.architectureReadiness, rejectedEvidence.stageTrace)

  assert(rejectedGate.verdict === 'sourcing_authorization_review_required', 'Rejected source evidence should force sourcing authorization review.')
  assert(rejectedGate.summary.rejectedSourcingEvidenceRows === 1, 'Rejected evidence should be counted in sourcing authorization.')

  const broken = cloneDossier(bess.dossier)
  broken.bom.lines[0] = {
    ...broken.bom.lines[0],
    unitCostGbp: 12,
    totalCostGbp: 12 * broken.bom.lines[0].quantity.value,
    supplier: 'Unprovenanced Supplier',
  }
  const brokenGate = buildSourcingAuthorizationGate(broken, bess.architectureReadiness, bess.stageTrace)

  assert(brokenGate.verdict === 'sourcing_authorization_blocked', 'Unprovenanced sourcing claims should block sourcing authorization.')
  assert(brokenGate.summary.provenanceViolations > 0, 'Broken sourcing authorization should expose provenance violations.')

  console.log('Sourcing authorization gate audit passed')
  console.log({
    bess: bessGate.summary,
    sparseDrone: sparseGate.summary,
    unknown: unknownGate.summary,
    rejected: rejectedGate.summary,
    broken: brokenGate.summary,
  })
}

function cloneDossier(dossier: ProductDossier): ProductDossier {
  return JSON.parse(JSON.stringify(dossier)) as ProductDossier
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
