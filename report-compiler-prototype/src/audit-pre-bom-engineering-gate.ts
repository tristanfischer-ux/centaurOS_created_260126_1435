import { evaluateArchitectureReadiness } from './gates/architecture-ready'
import { runReportCompiler } from './pipeline/run-report-compiler'
import {
  buildPreBomEngineeringGate,
  renderPreBomEngineeringGateCsv,
} from './scoring/pre-bom-engineering-gate'
import type { ProductDossier } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const initial = await runReportCompiler({ id: 'audit-pre-bom-engineering-initial', briefText: brief })
  const initialGate = buildPreBomEngineeringGate(initial.dossier, initial.architectureReadiness, initial.issues)
  const csv = renderPreBomEngineeringGateCsv(initialGate)

  assert(initialGate.verdict === 'engineering_review_ready', 'Initial BESS should be ready for engineering review before BoM trust.')
  assert(initialGate.summary.rows === 6, 'Pre-BoM gate should emit six engineering areas.')
  assert(initialGate.summary.blockedRows === 0, 'Initial BESS should have no pre-BoM engineering blockers.')
  assert(initialGate.rows.some(row => row.area === 'calculation_envelope' && row.verdict === 'review'), 'Initial BESS should keep needs-review calculations visible.')
  assert(initialGate.rows.some(row => row.area === 'engineering_assumptions' && row.verdict === 'review'), 'Initial BESS should keep review/source assumptions visible.')
  assert(csv.trim().split('\n').length === initialGate.summary.rows + 1, 'Pre-BoM gate CSV should contain one header plus one row per gate area.')

  const impossible = await runReportCompiler({
    id: 'audit-pre-bom-engineering-impossible',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 5 tonne gross mass limit, and LFP prismatic cells.',
  })
  const impossibleGate = buildPreBomEngineeringGate(impossible.dossier, impossible.architectureReadiness, impossible.issues)

  assert(impossibleGate.verdict === 'engineering_review_blocked', 'Impossible mass should block pre-BoM engineering review.')
  assert(impossibleGate.rows.some(row => row.area === 'calculation_envelope' && row.verdict === 'blocked'), 'Impossible mass should block calculation envelope.')

  const brokenInterface = removeInterface(initial.dossier, 'energy_storage_source', 'dc_bus')
  const brokenReadiness = evaluateArchitectureReadiness(brokenInterface)
  const brokenGate = buildPreBomEngineeringGate(brokenInterface, brokenReadiness, initial.issues)

  assert(brokenGate.verdict === 'engineering_review_blocked', 'Missing required interface should block pre-BoM engineering review.')
  assert(brokenGate.rows.some(row => row.area === 'architecture_readiness' && row.verdict === 'blocked'), 'Missing required interface should block architecture readiness row.')
  assert(brokenGate.rows.some(row => row.area === 'interface_verification' && row.verdict === 'blocked'), 'Missing required interface should block interface verification row.')

  console.log('Pre-BoM engineering gate audit passed')
  console.log({
    initial: initialGate.summary,
    impossible: impossibleGate.summary,
    brokenInterface: brokenGate.summary,
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
