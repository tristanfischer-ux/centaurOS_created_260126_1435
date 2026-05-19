import { buildInterfaceContractMatrix } from './architecture/interface-contracts'
import { evaluateArchitectureReadiness } from './gates/architecture-ready'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { ProductDossier } from './schema/types'

const examples = [
  {
    id: 'audit-contracts-bess',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.',
  },
  {
    id: 'audit-contracts-farm',
    briefText: 'Design a compact vertical farm for leafy greens using LED grow lights, hydroponic fertigation, CO2 monitoring, and a 2.4 m by 1.4 m envelope.',
  },
  {
    id: 'audit-contracts-heat-pump',
    briefText: 'Design an 8 kW thermal air-source heat pump with COP 3.5, inverter compressor, R290 refrigerant, outdoor evaporator coil, plate heat exchanger, hydronic circulation pump, monobloc enclosure, and defrost control.',
  },
  {
    id: 'audit-contracts-ev-charger',
    briefText: 'Design a 150 kW DC fast EV charger with CCS2 liquid-cooled cable, OCPP backend, ISO 15118 PLC communication, MID metering, insulation monitoring, emergency stop, and outdoor cabinet.',
  },
  {
    id: 'audit-contracts-bioreactor',
    briefText: 'Design a 50 L single-use mammalian-cell bioreactor with sterile bag, agitation drive, sparger gas manifold, peristaltic feed pumps, dissolved oxygen control, pH sensing, temperature loop, exhaust filter and batch-record controller.',
  },
  {
    id: 'audit-contracts-auv',
    briefText: 'Design a 300 m depth-rated autonomous underwater vehicle with 8 hour survey endurance, pressure hull, thruster set, DVL, battery pack, acoustic modem, leak detection, forward sonar payload and recovery beacon.',
  },
  {
    id: 'audit-contracts-edge-ai',
    briefText: 'Design a 1U rack-mount edge AI inference appliance with 200 TOPS accelerator throughput, 700 W power budget, GPU module, redundant power supplies, high-speed NIC, NVMe model cache, BMC management, secure boot and front-to-back thermal management.',
  },
  {
    id: 'audit-contracts-haps',
    briefText: 'Design a solar-electric high-altitude pseudo-satellite for 20 km altitude, 30 day station-keeping endurance and 35 m wingspan with wing structure, solar cell array, MPPT power tracker, stratospheric battery pack, electric propulsion pods, flight control computer, GNSS INS navigation, communications payload, thermal insulation and recovery parachute.',
  },
  {
    id: 'audit-contracts-cgm',
    briefText: 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.',
  },
  {
    id: 'audit-contracts-drone',
    briefText: 'Design a prosumer cinematography drone with 4K camera payload, 40 minutes flight endurance, brushless motors, ESCs, and flight controller.',
  },
]

async function main(): Promise<void> {
  const summaries = []

  for (const example of examples) {
    const result = await runReportCompiler(example)
    const matrix = buildInterfaceContractMatrix(result.dossier, result.architectureReadiness)

    assert(matrix.summary.requiredContracts === result.architectureReadiness.requiredInterfaceLinks.length, `${example.id} should emit one row per required interface contract.`)
    assert(matrix.summary.missingContracts === 0, `${example.id} should have no missing required interface contracts.`)
    assert(matrix.summary.presentContracts === matrix.summary.requiredContracts, `${example.id} should mark every required contract present.`)
    assert(matrix.requiredContracts.every(contract => contract.from.carrierSubModules.length > 0), `${example.id} every source endpoint should expose a submodule carrier.`)
    assert(matrix.requiredContracts.every(contract => contract.to.carrierSubModules.length > 0), `${example.id} every target endpoint should expose a submodule carrier.`)

    summaries.push({
      id: example.id,
      requiredContracts: matrix.summary.requiredContracts,
      sharedInterfaces: matrix.summary.sharedInterfaces,
      localOnlyInterfaces: matrix.summary.localOnlyInterfaces,
    })
  }

  const broken = await runReportCompiler(examples[0])
  const brokenDossier = removeInterface(broken.dossier, 'energy_storage_source', 'dc_bus')
  const brokenReadiness = evaluateArchitectureReadiness(brokenDossier)
  const brokenMatrix = buildInterfaceContractMatrix(brokenDossier, brokenReadiness)
  const brokenContract = brokenMatrix.requiredContracts.find(contract => contract.interfaceId === 'dc_bus')

  assert(brokenMatrix.summary.missingContracts > 0, 'Broken BESS matrix should mark a missing required contract.')
  assert(brokenContract?.status === 'missing', 'Broken BESS dc_bus contract should be missing.')
  assert(brokenContract.from.carrierSubModules.length === 0, 'Broken BESS source endpoint should have no dc_bus carrier after removal.')

  console.log('Interface contract matrix audit passed')
  console.log({
    summaries,
    broken: {
      missingContracts: brokenMatrix.summary.missingContracts,
      interfaceId: brokenContract?.interfaceId,
      fromCarrierSubModules: brokenContract?.from.carrierSubModules.length,
      notes: brokenContract?.notes,
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
