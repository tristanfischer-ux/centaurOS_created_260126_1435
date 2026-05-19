import { runReportCompiler } from './pipeline/run-report-compiler'
import { validateDossier } from './sections/contracts'

async function main(): Promise<void> {
  const bess = await runReportCompiler({
    id: 'audit-trace-bess',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.',
  })
  const farm = await runReportCompiler({
    id: 'audit-trace-farm',
    briefText: 'Design a compact vertical farm for leafy greens using LED grow lights, hydroponic fertigation, CO2 monitoring, and a 2.4 m by 1.4 m envelope.',
  })
  const heatPump = await runReportCompiler({
    id: 'audit-trace-heat-pump',
    briefText: 'Design an 8 kW thermal air-source heat pump with COP 3.5, inverter compressor, outdoor evaporator coil, plate heat exchanger, hydronic circulation pump and monobloc enclosure.',
  })
  const evCharger = await runReportCompiler({
    id: 'audit-trace-ev-charger',
    briefText: 'Design a 150 kW DC fast EV charger with CCS2 liquid-cooled cable, OCPP backend, ISO 15118 PLC communication, MID metering and insulation monitoring.',
  })
  const bioreactor = await runReportCompiler({
    id: 'audit-trace-bioreactor',
    briefText: 'Design a 50 L single-use mammalian-cell bioreactor with sterile bag, agitation drive, sparger gas manifold, peristaltic feed pumps, dissolved oxygen control, pH sensing, temperature loop, exhaust filter and batch-record controller.',
  })
  const auv = await runReportCompiler({
    id: 'audit-trace-auv',
    briefText: 'Design a 300 m depth-rated autonomous underwater vehicle with 8 hour survey endurance, pressure hull, thruster set, DVL, battery pack, acoustic modem, leak detection, forward sonar payload and recovery beacon.',
  })
  const edgeAi = await runReportCompiler({
    id: 'audit-trace-edge-ai',
    briefText: 'Design a 1U rack-mount edge AI inference appliance with 200 TOPS accelerator throughput, 700 W power budget, GPU module, redundant power supplies, high-speed NIC, NVMe model cache, BMC management, secure boot and front-to-back thermal management.',
  })
  const haps = await runReportCompiler({
    id: 'audit-trace-haps',
    briefText: 'Design a solar-electric high-altitude pseudo-satellite for 20 km altitude, 30 day station-keeping endurance and 35 m wingspan with wing structure, solar cell array, MPPT power tracker, stratospheric battery pack, electric propulsion pods, flight control computer, GNSS INS navigation, communications payload, thermal insulation and recovery parachute.',
  })
  const cgm = await runReportCompiler({
    id: 'audit-trace-cgm',
    briefText: 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.',
  })
  const drone = await runReportCompiler({
    id: 'audit-trace-drone',
    briefText: 'Design a prosumer cinematography drone with 4K camera payload, 40 minutes flight endurance, brushless motors, ESCs, and flight controller.',
  })

  for (const result of [bess, farm, heatPump, evCharger, bioreactor, auv, edgeAi, haps, cgm, drone]) {
    assert(result.dossier.requirementTrace.length === result.dossier.brief.requirements.length, `${result.dossier.id} should trace every parsed requirement.`)
    assert(result.dossier.requirementTrace.every(trace => trace.status === 'covered'), `${result.dossier.id} should have full requirement coverage.`)
    assert(result.dossier.requirementTrace.every(trace => trace.architectureLinks.length > 0), `${result.dossier.id} should link requirements to architecture.`)
    assert(result.dossier.requirementTrace.every(trace => trace.keyMetricIds.length > 0 || trace.engineeringSanityCheckIds.length > 0), `${result.dossier.id} should link requirements to an evaluator.`)
  }

  const broken = JSON.parse(JSON.stringify(bess.dossier)) as typeof bess.dossier
  broken.requirementTrace[0].architectureLinks = []
  broken.requirementTrace[0].status = 'uncovered'
  const brokenIssues = validateDossier(broken).filter(issue => issue.section === 'brief_requirements')
  assert(brokenIssues.some(issue => issue.code === 'requirement_uncovered'), 'Broken trace should produce a requirement_uncovered issue.')

  console.log('Requirement trace audit passed')
  console.log({
    bess: summary(bess),
    farm: summary(farm),
    heatPump: summary(heatPump),
    evCharger: summary(evCharger),
    bioreactor: summary(bioreactor),
    auv: summary(auv),
    edgeAi: summary(edgeAi),
    haps: summary(haps),
    cgm: summary(cgm),
    drone: summary(drone),
    brokenIssues: brokenIssues.map(issue => `${issue.severity}/${issue.code}`),
  })
}

function summary(result: Awaited<ReturnType<typeof runReportCompiler>>): string[] {
  return result.dossier.requirementTrace.map(trace => `${trace.requirementId}:${trace.status}:${trace.architectureLinks.map(link => link.moduleId).join('+')}`)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
