import { runReportCompiler } from './pipeline/run-report-compiler'
import { buildModuleEngineeringGate, renderModuleEngineeringGateCsv } from './scoring/module-engineering-gate'
import type { ProductDossier } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const result = await runReportCompiler({ id: 'audit-module-engineering-bess', briefText: brief })
  const gate = buildModuleEngineeringGate(result.dossier, result.architectureReadiness, result.issues)
  const csv = renderModuleEngineeringGateCsv(gate)

  assert(gate.verdict === 'module_engineering_review_required', 'Unsourced BESS modules should be structurally reviewable but not fully accepted.')
  assert(gate.summary.modules === result.architectureReadiness.moduleCount, 'Module gate should include every architecture module.')
  assert(gate.summary.blockedRows === 0, 'Baseline BESS module engineering should have no structural blockers.')
  assert(gate.summary.reviewRows > 0, 'Baseline BESS module engineering should show review rows before reviewer/source evidence.')
  assert(gate.summary.subModules === result.architectureReadiness.subModuleCount, 'Module gate should preserve submodule count.')
  assert(gate.summary.componentWords === result.architectureReadiness.componentWordCount, 'Module gate should preserve component word count.')
  assert(gate.summary.requiredInterfaceContracts === gate.summary.carrierCompleteInterfaceContracts, 'Baseline BESS required interface contracts should have carriers.')
  assert(gate.summary.unpricedCriticalLines > 0, 'Unsourced BESS should still surface critical sourcing blocks.')
  assert(csv.trim().split('\n').length === gate.summary.modules + 1, 'Module engineering CSV should contain one header plus one row per module.')

  const taintedDossier: ProductDossier = structuredClone(result.dossier)
  taintedDossier.architecture.modules[0] = {
    ...taintedDossier.architecture.modules[0],
    subModules: [],
  }
  const taintedGate = buildModuleEngineeringGate(taintedDossier, result.architectureReadiness, result.issues)

  assert(taintedGate.verdict === 'module_engineering_blocked', 'Module with no submodules should block module engineering.')
  assert(taintedGate.modules[0]?.verdict === 'blocked', 'Tainted module row should be blocked.')
  assert(taintedGate.blockers.some(blocker => blocker.includes('no submodules')), 'Tainted module blocker should explain missing submodules.')

  console.log('Module engineering gate audit passed')
  console.log({
    baseline: gate.summary,
    tainted: taintedGate.summary,
  })
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
