import { architectureBomGateIssues, evaluateArchitectureReadiness } from './gates/architecture-ready'
import { runReportCompiler } from './pipeline/run-report-compiler'
import type { ProductDossier } from './schema/types'
import { scoreFromIssues } from './scoring/score-from-issues'
import { buildReportReadinessGate, renderReportReadinessGateCsv } from './scoring/report-readiness'
import { validateDossier } from './sections/contracts'

const examples = [
  {
    id: 'audit-readiness-bess',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.',
  },
  {
    id: 'audit-readiness-farm',
    briefText: 'Design a compact vertical farm for leafy greens using LED grow lights, hydroponic fertigation, CO2 monitoring, and a 2.4 m by 1.4 m envelope.',
  },
  {
    id: 'audit-readiness-heat-pump',
    briefText: 'Design an 8 kW thermal air-source heat pump with COP 3.5, inverter compressor, R290 refrigerant, outdoor evaporator coil, plate heat exchanger, hydronic circulation pump, monobloc enclosure, and defrost control.',
  },
  {
    id: 'audit-readiness-ev-charger',
    briefText: 'Design a 150 kW DC fast EV charger with CCS2 liquid-cooled cable, OCPP backend, ISO 15118 PLC communication, MID metering, insulation monitoring, emergency stop, and outdoor cabinet.',
  },
  {
    id: 'audit-readiness-bioreactor',
    briefText: 'Design a 50 L single-use mammalian-cell bioreactor with sterile bag, agitation drive, sparger gas manifold, peristaltic feed pumps, dissolved oxygen control, pH sensing, temperature loop, exhaust filter and batch-record controller.',
  },
  {
    id: 'audit-readiness-auv',
    briefText: 'Design a 300 m depth-rated autonomous underwater vehicle with 8 hour survey endurance, pressure hull, thruster set, DVL, battery pack, acoustic modem, leak detection, forward sonar payload and recovery beacon.',
  },
  {
    id: 'audit-readiness-edge-ai',
    briefText: 'Design a 1U rack-mount edge AI inference appliance with 200 TOPS accelerator throughput, 700 W power budget, GPU module, redundant power supplies, high-speed NIC, NVMe model cache, BMC management, secure boot and front-to-back thermal management.',
  },
  {
    id: 'audit-readiness-haps',
    briefText: 'Design a solar-electric high-altitude pseudo-satellite for 20 km altitude, 30 day station-keeping endurance and 35 m wingspan with wing structure, solar cell array, MPPT power tracker, stratospheric battery pack, electric propulsion pods, flight control computer, GNSS INS navigation, communications payload, thermal insulation and recovery parachute.',
  },
  {
    id: 'audit-readiness-cgm',
    briefText: 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.',
  },
  {
    id: 'audit-readiness-drone',
    briefText: 'Design a prosumer cinematography drone with 4K camera payload, 40 minutes flight endurance, brushless motors, ESCs, and flight controller.',
  },
]

async function main(): Promise<void> {
  const summaries = []

  for (const example of examples) {
    const result = await runReportCompiler(example)
    const gate = buildReportReadinessGate(result.dossier, result.architectureReadiness, result.issues, result.score)
    const bom = gate.sections.find(section => section.section === 'bom')
    const csv = renderReportReadinessGateCsv(gate)

    assert(gate.verdict === 'architecture_review_ready', `${example.id} should be architecture-review-ready, not publishable.`)
    assert(gate.summary.sectionsBelowTarget === 1, `${example.id} should have exactly one section below target.`)
    assert(bom?.passesTarget === false, `${example.id} BoM should remain below target.`)
    assert((bom?.score ?? 0) < gate.targetSectionScore, `${example.id} BoM score should be below target.`)
    assert(gate.promotionBlockers.some(item => item.includes('critical BoM line')), `${example.id} should name critical unpriced BoM lines as a blocker.`)
    assert(gate.promotionBlockers.some(item => item.includes('accepted reviewer evidence')), `${example.id} should name missing accepted reviewer evidence as a blocker.`)
    assert(gate.nextActions.some(item => item.includes('sourcing intake')), `${example.id} next actions should route cost evidence through sourcing intake.`)
    assert(gate.nextActions.some(item => item.includes('Accept reviewer evidence')), `${example.id} next actions should require accepted reviewer evidence before publication.`)
    assert(csv.trim().split('\n').length === gate.summary.sections + 1, `${example.id} readiness CSV should have one header plus one row per scored section.`)

    summaries.push({
      id: example.id,
      verdict: gate.verdict,
      meanScore: gate.summary.meanScore,
      sectionsAtOrAboveTarget: gate.summary.sectionsAtOrAboveTarget,
      sectionsBelowTarget: gate.summary.sectionsBelowTarget,
      unpricedCriticalLines: gate.summary.unpricedCriticalLines,
      verificationAccepted: `${gate.summary.verificationAcceptedActivities}/${gate.summary.verificationEvidenceEligibleActivities}`,
      promotionBlockers: gate.promotionBlockers.length,
    })
  }

  const broken = await runReportCompiler(examples[0])
  const brokenDossier = removeInterface(broken.dossier, 'energy_storage_source', 'dc_bus')
  const brokenReadiness = evaluateArchitectureReadiness(brokenDossier)
  const brokenIssues = [
    ...validateDossier(brokenDossier),
    ...architectureBomGateIssues(brokenReadiness),
  ]
  const brokenScore = scoreFromIssues(brokenIssues)
  const brokenGate = buildReportReadinessGate(brokenDossier, brokenReadiness, brokenIssues, brokenScore)

  assert(brokenGate.verdict === 'blocked', 'Broken BESS should be blocked, not architecture-review-ready.')
  assert(brokenGate.promotionBlockers.some(item => item.includes('Architecture readiness gate')), 'Broken BESS should name architecture readiness as a blocker.')

  console.log('Report readiness gate audit passed')
  console.log({
    summaries,
    broken: {
      verdict: brokenGate.verdict,
      promotionBlockers: brokenGate.promotionBlockers,
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
