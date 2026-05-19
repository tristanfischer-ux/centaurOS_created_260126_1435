import { runReportCompiler } from './pipeline/run-report-compiler'
import {
  buildStageIntegrityGate,
  EXPECTED_STAGE_SEQUENCE,
  renderStageIntegrityGateCsv,
} from './scoring/stage-integrity-gate'
import type { ProductDossier } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const result = await runReportCompiler({ id: 'audit-stage-integrity-bess', briefText: brief })
  const gate = buildStageIntegrityGate(result.stageTrace, result.dossier, result.architectureReadiness)
  const csv = renderStageIntegrityGateCsv(gate)

  assert(gate.verdict === 'stage_trace_accepted', 'BESS scratch run should have an accepted stage trace.')
  assert(gate.summary.presentStages === EXPECTED_STAGE_SEQUENCE.length, 'Stage trace should contain every expected stage.')
  assert(gate.summary.orderedStages, 'Stage trace should preserve canonical order.')
  assert(gate.summary.architectureSource === 'scratch_universal_architecture', 'Supported BESS class should use scratch universal architecture.')
  assert(gate.summary.admittedPricedLines === 0, 'Unsourced run should not admit priced BoM lines.')
  assert(gate.rows.find(row => row.area === 'sourcing_provenance_boundary')?.verdict === 'pass', 'Unsourced BoM should still respect provenance boundary.')
  assert(csv.trim().split('\n').length === gate.summary.rows + 1, 'Stage integrity CSV should contain one header plus one row per gate row.')

  const missingStageGate = buildStageIntegrityGate(
    result.stageTrace.filter(stage => stage.id !== 'component_candidates'),
    result.dossier,
    result.architectureReadiness,
  )

  assert(missingStageGate.verdict === 'stage_trace_blocked', 'Missing component candidate stage should block stage integrity.')
  assert(missingStageGate.summary.missingStages.includes('component_candidates'), 'Missing stage should be reported explicitly.')
  assert(missingStageGate.rows.find(row => row.area === 'stage_sequence')?.verdict === 'blocked', 'Stage sequence row should block on missing stage.')

  const taintedDossier: ProductDossier = structuredClone(result.dossier)
  taintedDossier.bom.lines[0] = {
    ...taintedDossier.bom.lines[0],
    supplier: 'Unprovenanced Supplier',
    manufacturer: 'Unprovenanced Manufacturer',
    mpn: 'UNPROVENANCED-1',
    unitCostGbp: 10,
    totalCostGbp: 10 * taintedDossier.bom.lines[0].quantity.value,
  }
  const taintedGate = buildStageIntegrityGate(result.stageTrace, taintedDossier, result.architectureReadiness)

  assert(taintedGate.verdict === 'stage_trace_blocked', 'Unprovenanced BoM cost claim should block stage integrity.')
  assert(taintedGate.rows.find(row => row.area === 'sourcing_provenance_boundary')?.verdict === 'blocked', 'Sourcing provenance boundary should catch tainted BoM fields.')

  console.log('Stage integrity gate audit passed')
  console.log({
    accepted: gate.summary,
    missingStage: missingStageGate.summary,
    tainted: taintedGate.summary,
  })
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
