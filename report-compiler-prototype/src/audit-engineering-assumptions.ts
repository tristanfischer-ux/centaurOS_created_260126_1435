import { buildEngineeringAssumptionLedger, renderEngineeringAssumptionLedgerCsv } from './architecture/engineering-assumptions'
import { evaluateArchitectureReadiness } from './gates/architecture-ready'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { ProductDossier } from './schema/types'

const cgmBrief = 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.'
const bessBrief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const cgm = await runReportCompiler({ id: 'audit-assumptions-cgm', briefText: cgmBrief })
  const ledger = buildEngineeringAssumptionLedger(cgm.dossier, cgm.architectureReadiness)
  const csv = renderEngineeringAssumptionLedgerCsv(ledger)

  assert(ledger.summary.rows >= 30, 'CGM assumption ledger should include requirements, checks, interfaces, critical components and compliance rows.')
  assert(ledger.summary.reviewRequired > 0, 'CGM assumption ledger should force engineering review for plausible-but-unverified envelopes.')
  assert(ledger.summary.sourceRequired >= cgm.dossier.sourcing.admission.unpricedCriticalLines, 'CGM source-required rows should cover unpriced critical components.')
  assert(ledger.summary.bomBlockers >= cgm.dossier.sourcing.admission.unpricedCriticalLines, 'CGM assumption ledger should block BoM for critical unsourced components.')
  assert(ledger.summary.architectureBlockers === 0, 'Valid CGM architecture should not have assumption-ledger architecture blockers.')
  assert(ledger.rows.some(row => row.id === 'sanity:cgm_accuracy_target' && row.status === 'review_required'), 'CGM MARD target should require reviewer evidence even when deterministic sanity passes.')
  assert(ledger.rows.some(row => row.category === 'critical_component' && row.status === 'source_required'), 'Critical CGM components should require sourcing evidence.')
  assert(csv.trim().split('\n').length === ledger.summary.rows + 1, 'Assumption ledger CSV should include one header plus one row per assumption.')

  const bess = await runReportCompiler({ id: 'audit-assumptions-bess', briefText: bessBrief })
  const brokenDossier = removeInterface(bess.dossier, 'energy_storage_source', 'dc_bus')
  const brokenReadiness = evaluateArchitectureReadiness(brokenDossier)
  const brokenLedger = buildEngineeringAssumptionLedger(brokenDossier, brokenReadiness)

  assert(brokenLedger.summary.architectureBlockers > 0, 'Broken BESS assumption ledger should expose the missing required interface as an architecture blocker.')
  assert(brokenLedger.rows.some(row => row.category === 'interface_closure' && row.status === 'blocked'), 'Broken BESS should have a blocked interface assumption row.')

  console.log('Engineering assumption ledger audit passed')
  console.log({
    cgm: ledger.summary,
    brokenBess: brokenLedger.summary,
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
  copy.architecture.crossModuleInterfaces = copy.architecture.crossModuleInterfaces.filter(item => item !== interfaceId)
  return copy
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
