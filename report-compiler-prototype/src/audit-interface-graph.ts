import { buildInterfaceGraph, renderInterfaceGraphMermaid } from './architecture/interface-graph'
import { evaluateArchitectureReadiness } from './gates/architecture-ready'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { ProductDossier } from './schema/types'

const examples = [
  {
    id: 'audit-graph-bess',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.',
  },
  {
    id: 'audit-graph-farm',
    briefText: 'Design a compact vertical farm for leafy greens using LED grow lights, hydroponic fertigation, CO2 monitoring, and a 2.4 m by 1.4 m envelope.',
  },
  {
    id: 'audit-graph-heat-pump',
    briefText: 'Design an 8 kW thermal air-source heat pump with COP 3.5, inverter compressor, R290 refrigerant, outdoor evaporator coil, plate heat exchanger, hydronic circulation pump, monobloc enclosure, and defrost control.',
  },
  {
    id: 'audit-graph-ev-charger',
    briefText: 'Design a 150 kW DC fast EV charger with CCS2 liquid-cooled cable, OCPP backend, ISO 15118 PLC communication, MID metering, insulation monitoring, emergency stop, and outdoor cabinet.',
  },
  {
    id: 'audit-graph-bioreactor',
    briefText: 'Design a 50 L single-use mammalian-cell bioreactor with sterile bag, agitation drive, sparger gas manifold, peristaltic feed pumps, dissolved oxygen control, pH sensing, temperature loop, exhaust filter and batch-record controller.',
  },
  {
    id: 'audit-graph-auv',
    briefText: 'Design a 300 m depth-rated autonomous underwater vehicle with 8 hour survey endurance, pressure hull, thruster set, DVL, battery pack, acoustic modem, leak detection, forward sonar payload and recovery beacon.',
  },
  {
    id: 'audit-graph-edge-ai',
    briefText: 'Design a 1U rack-mount edge AI inference appliance with 200 TOPS accelerator throughput, 700 W power budget, GPU module, redundant power supplies, high-speed NIC, NVMe model cache, BMC management, secure boot and front-to-back thermal management.',
  },
  {
    id: 'audit-graph-haps',
    briefText: 'Design a solar-electric high-altitude pseudo-satellite for 20 km altitude, 30 day station-keeping endurance and 35 m wingspan with wing structure, solar cell array, MPPT power tracker, stratospheric battery pack, electric propulsion pods, flight control computer, GNSS INS navigation, communications payload, thermal insulation and recovery parachute.',
  },
  {
    id: 'audit-graph-cgm',
    briefText: 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.',
  },
  {
    id: 'audit-graph-drone',
    briefText: 'Design a prosumer cinematography drone with 4K camera payload, 40 minutes flight endurance, brushless motors, ESCs, and flight controller.',
  },
]

async function main(): Promise<void> {
  const summaries = []
  for (const example of examples) {
    const result = await runReportCompiler(example)
    const graph = buildInterfaceGraph(result.dossier, result.architectureReadiness)
    const mermaid = renderInterfaceGraphMermaid(graph)

    assert(graph.summary.moduleNodes === result.architectureReadiness.moduleCount, `${example.id} module node count should match readiness.`)
    assert(graph.summary.subModuleNodes === result.architectureReadiness.subModuleCount, `${example.id} submodule node count should match readiness.`)
    assert(graph.summary.containsEdges === result.architectureReadiness.subModuleCount, `${example.id} should have one containment edge per submodule.`)
    assert(graph.summary.requiredInterfaceEdges === result.architectureReadiness.requiredInterfaceLinks.length, `${example.id} should export every required interface link.`)
    assert(graph.summary.missingRequiredInterfaceEdges === 0, `${example.id} should have no missing required interface graph edges.`)
    assert(mermaid.startsWith('flowchart LR'), `${example.id} Mermaid graph should render as a flowchart.`)

    summaries.push({
      id: example.id,
      moduleNodes: graph.summary.moduleNodes,
      subModuleNodes: graph.summary.subModuleNodes,
      requiredEdges: graph.summary.requiredInterfaceEdges,
      sharedEdges: graph.summary.sharedInterfaceEdges,
    })
  }

  const broken = await runReportCompiler(examples[0])
  const brokenDossier = removeInterface(broken.dossier, 'energy_storage_source', 'dc_bus')
  const brokenReadiness = evaluateArchitectureReadiness(brokenDossier)
  const brokenGraph = buildInterfaceGraph(brokenDossier, brokenReadiness)
  assert(brokenGraph.summary.missingRequiredInterfaceEdges > 0, 'Broken BESS graph should surface missing required interface edge.')

  console.log('Interface graph audit passed')
  console.log({
    summaries,
    brokenMissingRequiredEdges: brokenGraph.summary.missingRequiredInterfaceEdges,
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
