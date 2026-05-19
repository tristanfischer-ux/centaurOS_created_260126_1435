import { buildModuleReview } from './architecture/module-review'
import { evaluateArchitectureReadiness } from './gates/architecture-ready'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { ProductDossier } from './schema/types'

const examples = [
  {
    id: 'audit-module-review-bess',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.',
  },
  {
    id: 'audit-module-review-farm',
    briefText: 'Design a compact vertical farm for leafy greens using LED grow lights, hydroponic fertigation, CO2 monitoring, and a 2.4 m by 1.4 m envelope.',
  },
  {
    id: 'audit-module-review-heat-pump',
    briefText: 'Design an 8 kW thermal air-source heat pump with COP 3.5, inverter compressor, R290 refrigerant, outdoor evaporator coil, plate heat exchanger, hydronic circulation pump, monobloc enclosure, and defrost control.',
  },
  {
    id: 'audit-module-review-ev-charger',
    briefText: 'Design a 150 kW DC fast EV charger with CCS2 liquid-cooled cable, OCPP backend, ISO 15118 PLC communication, MID metering, insulation monitoring, emergency stop, and outdoor cabinet.',
  },
  {
    id: 'audit-module-review-bioreactor',
    briefText: 'Design a 50 L single-use mammalian-cell bioreactor with sterile bag, agitation drive, sparger gas manifold, peristaltic feed pumps, dissolved oxygen control, pH sensing, temperature loop, exhaust filter and batch-record controller.',
  },
  {
    id: 'audit-module-review-auv',
    briefText: 'Design a 300 m depth-rated autonomous underwater vehicle with 8 hour survey endurance, pressure hull, thruster set, DVL, battery pack, acoustic modem, leak detection, forward sonar payload and recovery beacon.',
  },
  {
    id: 'audit-module-review-edge-ai',
    briefText: 'Design a 1U rack-mount edge AI inference appliance with 200 TOPS accelerator throughput, 700 W power budget, GPU module, redundant power supplies, high-speed NIC, NVMe model cache, BMC management, secure boot and front-to-back thermal management.',
  },
  {
    id: 'audit-module-review-haps',
    briefText: 'Design a solar-electric high-altitude pseudo-satellite for 20 km altitude, 30 day station-keeping endurance and 35 m wingspan with wing structure, solar cell array, MPPT power tracker, stratospheric battery pack, electric propulsion pods, flight control computer, GNSS INS navigation, communications payload, thermal insulation and recovery parachute.',
  },
  {
    id: 'audit-module-review-cgm',
    briefText: 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.',
  },
  {
    id: 'audit-module-review-drone',
    briefText: 'Design a prosumer cinematography drone with 4K camera payload, 40 minutes flight endurance, brushless motors, ESCs, and flight controller.',
  },
]

async function main(): Promise<void> {
  const summaries = []

  for (const example of examples) {
    const result = await runReportCompiler(example)
    const review = buildModuleReview(result.dossier, result.architectureReadiness, result.issues)
    const componentCount = review.modules.reduce((sum, module) => sum + module.componentCount, 0)

    assert(review.summary.modules === result.architectureReadiness.moduleCount, `${example.id} module count should match readiness.`)
    assert(componentCount === result.architectureReadiness.componentWordCount, `${example.id} component count should match readiness.`)
    assert(review.summary.criticalUnpricedLines === result.dossier.sourcing.admission.unpricedCriticalLines, `${example.id} critical unpriced count should match sourcing admission.`)
    assert(review.summary.attentionModules === 0, `${example.id} should have no module-level engineering attention items in the valid sample.`)
    assert(review.summary.sourcingBlockedModules > 0, `${example.id} should show source-blocked modules while BoM evidence is absent.`)
    const reviewModuleIds = new Set(review.modules.map(module => module.moduleId))
    const tracedModuleIds = result.dossier.requirementTrace.flatMap(trace => trace.architectureLinks.map(link => link.moduleId))
    assert(tracedModuleIds.length > 0, `${example.id} should include architecture links from brief requirements.`)
    assert(tracedModuleIds.every(moduleId => reviewModuleIds.has(moduleId)), `${example.id} every requirement-linked module should appear in the module review.`)

    summaries.push({
      id: example.id,
      modules: review.summary.modules,
      readyModules: review.summary.readyModules,
      sourcingBlockedModules: review.summary.sourcingBlockedModules,
      attentionModules: review.summary.attentionModules,
      criticalUnpricedLines: review.summary.criticalUnpricedLines,
    })
  }

  const broken = await runReportCompiler(examples[0])
  const brokenDossier = removeInterface(broken.dossier, 'energy_storage_source', 'dc_bus')
  const brokenReadiness = evaluateArchitectureReadiness(brokenDossier)
  const brokenReview = buildModuleReview(brokenDossier, brokenReadiness, broken.issues)
  const brokenModule = brokenReview.modules.find(module => module.moduleId === 'energy_storage_source')

  assert(brokenReadiness.requiredInterfaceLinks.some(link => !link.present), 'Broken BESS readiness should mark a required interface missing.')
  assert(brokenReview.summary.attentionModules > 0, 'Broken BESS review should surface at least one attention module.')
  assert(brokenModule?.status === 'attention', 'Broken BESS energy-storage source module should move to attention.')
  assert((brokenModule?.missingRequiredInterfaceEdges ?? 0) > 0, 'Broken BESS module should count the missing required interface edge.')

  console.log('Module review audit passed')
  console.log({
    summaries,
    broken: {
      attentionModules: brokenReview.summary.attentionModules,
      moduleId: brokenModule?.moduleId,
      missingRequiredInterfaceEdges: brokenModule?.missingRequiredInterfaceEdges,
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
