import type { ProductDossier } from './schema/types'
import { runReportCompiler } from './pipeline/run-report-compiler'
import { buildComponentCandidateGate, renderComponentCandidateGateCsv } from './scoring/component-candidate-gate'

const bessBrief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const bess = await runReportCompiler({ id: 'audit-component-candidate-bess', briefText: bessBrief })
  const bessGate = buildComponentCandidateGate(bess.dossier)
  const bessCsv = renderComponentCandidateGateCsv(bessGate)

  assert(bessGate.verdict === 'component_candidates_ready_for_sourcing', 'Rich BESS candidates should be ready for evidence-gated sourcing.')
  assert(bessGate.summary.bomLines > 0, 'Candidate gate should see BoM candidate lines.')
  assert(bessGate.summary.candidateWorklistRows === bessGate.summary.bomLines, 'Unpriced candidates should all appear in the sourcing worklist.')
  assert(bessGate.summary.provenanceViolations === 0, 'Unsourced candidates should not contain unprovenanced sourcing claims.')
  assert(bessCsv.split('\n')[0]?.includes('area,verdict,signal'), 'Candidate gate CSV should contain the expected header.')

  const sourced = await runReportCompiler({
    id: 'audit-component-candidate-sourced',
    briefText: bessBrief,
    sourcingEvidence: [{
      componentWordId: bess.dossier.bom.lines[0]?.componentWordId ?? 'missing',
      supplierName: 'Protocol Test Supplier',
      manufacturer: 'Protocol Test Manufacturer',
      mpn: 'PROTOCOL-CANDIDATE-1',
      unitCostGbp: 100,
      leadTimeWeeks: 4,
      sourceGrade: 'priced',
      evidence: {
        kind: 'source',
        ref: 'test-fixture://component-candidate/source/1',
        quote: 'Protocol-only source fixture for candidate gate testing.',
      },
      retrievedAt: '2026-05-18T03:40:00.000+01:00',
    }],
  })
  const sourcedGate = buildComponentCandidateGate(sourced.dossier)

  assert(sourcedGate.verdict === 'component_candidates_ready_for_sourcing', 'Admitted source evidence should keep candidates ready.')
  assert(sourcedGate.summary.sourceEvidenceRows === 1, 'Candidate gate should count admitted source evidence rows.')
  assert(sourcedGate.summary.candidateWorklistRows === sourcedGate.summary.bomLines - 1, 'Priced evidence should remove one line from the unpriced worklist.')
  assert(sourcedGate.summary.provenanceViolations === 0, 'Admitted evidence should not create provenance violations.')

  const broken = cloneDossier(bess.dossier)
  broken.bom.lines[0] = {
    ...broken.bom.lines[0],
    unitCostGbp: 12,
    totalCostGbp: 12 * broken.bom.lines[0].quantity.value,
    supplier: 'Unprovenanced Supplier',
  }
  const brokenGate = buildComponentCandidateGate(broken)

  assert(brokenGate.verdict === 'component_candidates_blocked', 'Unprovenanced sourcing claims should block candidate admission.')
  assert(brokenGate.summary.provenanceViolations > 0, 'Broken candidate gate should expose provenance violations.')
  assert(!brokenGate.summary.readyForSourcing, 'Broken candidates should not be marked ready for sourcing.')

  console.log('Component candidate gate audit passed')
  console.log({
    bess: bessGate.summary,
    sourced: sourcedGate.summary,
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
