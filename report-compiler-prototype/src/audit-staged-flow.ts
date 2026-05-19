import { runReportCompiler } from './pipeline/run-report-compiler'
import type { PipelineStageId, ReportRunResult } from './schema/types'

const EXPECTED_STAGE_IDS: PipelineStageId[] = [
  'brief_parsing',
  'product_class_selection',
  'universal_module_architecture',
  'submodule_expansion',
  'interface_graph',
  'component_candidates',
  'architecture_readiness_gate',
  'sourcing_bom_admission',
]

const bessBrief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'
const farmBrief = 'Design a compact vertical farm for leafy greens using LED grow lights, hydroponic fertigation, CO2 monitoring, and a 2.4 m by 1.4 m envelope.'
const heatPumpBrief = 'Design an 8 kW thermal air-source heat pump with COP 3.5, inverter compressor, outdoor evaporator coil, plate heat exchanger, hydronic circulation pump and monobloc enclosure.'
const evChargerBrief = 'Design a 150 kW DC fast EV charger with CCS2 liquid-cooled cable, OCPP backend, ISO 15118 PLC communication, MID metering and insulation monitoring.'
const bioreactorBrief = 'Design a 50 L single-use mammalian-cell bioreactor with sterile bag, agitation drive, sparger gas manifold, peristaltic feed pumps, dissolved oxygen control, pH sensing, temperature loop, exhaust filter and batch-record controller.'
const auvBrief = 'Design a 300 m depth-rated autonomous underwater vehicle with 8 hour survey endurance, pressure hull, thruster set, DVL, battery pack, acoustic modem, leak detection, forward sonar payload and recovery beacon.'
const edgeAiBrief = 'Design a 1U rack-mount edge AI inference appliance with 200 TOPS accelerator throughput, 700 W power budget, GPU module, redundant power supplies, high-speed NIC, NVMe model cache, BMC management, secure boot and front-to-back thermal management.'
const hapsBrief = 'Design a solar-electric high-altitude pseudo-satellite for 20 km altitude, 30 day station-keeping endurance and 35 m wingspan with wing structure, solar cell array, MPPT power tracker, stratospheric battery pack, electric propulsion pods, flight control computer, GNSS INS navigation, communications payload, thermal insulation and recovery parachute.'
const cgmBrief = 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.'
const droneBrief = 'Design a prosumer cinematography drone with 4K camera payload, 40 minutes flight endurance, brushless motors, ESCs, and flight controller.'

async function main(): Promise<void> {
  const bess = await runReportCompiler({ id: 'audit-staged-bess', briefText: bessBrief })
  const farm = await runReportCompiler({ id: 'audit-staged-farm', briefText: farmBrief })
  const heatPump = await runReportCompiler({ id: 'audit-staged-heat-pump', briefText: heatPumpBrief })
  const evCharger = await runReportCompiler({ id: 'audit-staged-ev-charger', briefText: evChargerBrief })
  const bioreactor = await runReportCompiler({ id: 'audit-staged-bioreactor', briefText: bioreactorBrief })
  const auv = await runReportCompiler({ id: 'audit-staged-auv', briefText: auvBrief })
  const edgeAi = await runReportCompiler({ id: 'audit-staged-edge-ai', briefText: edgeAiBrief })
  const haps = await runReportCompiler({ id: 'audit-staged-haps', briefText: hapsBrief })
  const cgm = await runReportCompiler({ id: 'audit-staged-cgm', briefText: cgmBrief })
  const drone = await runReportCompiler({ id: 'audit-staged-drone', briefText: droneBrief })

  assertStageSequence(bess)
  assertStageSequence(farm)
  assertStageSequence(heatPump)
  assertStageSequence(evCharger)
  assertStageSequence(bioreactor)
  assertStageSequence(auv)
  assertStageSequence(edgeAi)
  assertStageSequence(haps)
  assertStageSequence(cgm)
  assertStageSequence(drone)
  assert(bess.dossier.productClass === 'energy_storage', 'BESS brief should classify as energy_storage.')
  assert(farm.dossier.productClass === 'vertical_farm', 'Farm brief should classify as vertical_farm.')
  assert(heatPump.dossier.productClass === 'heat_pump', 'Heat pump brief should classify as heat_pump.')
  assert(evCharger.dossier.productClass === 'ev_charger', 'EV charger brief should classify as ev_charger.')
  assert(bioreactor.dossier.productClass === 'bioreactor', 'Bioreactor brief should classify as bioreactor.')
  assert(auv.dossier.productClass === 'auv', 'AUV brief should classify as auv.')
  assert(edgeAi.dossier.productClass === 'edge_ai', 'Edge AI brief should classify as edge_ai.')
  assert(haps.dossier.productClass === 'haps', 'HAPS brief should classify as haps.')
  assert(cgm.dossier.productClass === 'cgm', 'CGM brief should classify as cgm.')
  assert(drone.dossier.productClass === 'drone', 'Drone brief should classify as drone.')
  assert(bess.dossier.brief.requirements.some(item => item.id === 'mass_kg' && item.value === 28000), 'BESS brief should parse 28 tonne as 28000 kg.')
  assert(farm.dossier.brief.requirements.some(item => item.id === 'footprint_m2' && item.value === 3.36), 'Farm brief should parse 2.4 m by 1.4 m footprint.')
  assert(heatPump.dossier.brief.requirements.some(item => item.id === 'thermal_output_kw' && item.value === 8), 'Heat pump brief should parse 8 kW thermal output.')
  assert(heatPump.dossier.brief.requirements.some(item => item.id === 'cop' && item.value === 3.5), 'Heat pump brief should parse COP 3.5.')
  assert(evCharger.dossier.brief.requirements.some(item => item.id === 'dc_power_kw' && item.value === 150), 'EV charger brief should parse 150 kW DC output.')
  assert(bioreactor.dossier.brief.requirements.some(item => item.id === 'working_volume_l' && item.value === 50), 'Bioreactor brief should parse 50 L working volume.')
  assert(auv.dossier.brief.requirements.some(item => item.id === 'depth_rating_m' && item.value === 300), 'AUV brief should parse 300 m depth rating.')
  assert(auv.dossier.brief.requirements.some(item => item.id === 'endurance_hours' && item.value === 8), 'AUV brief should parse 8 hour endurance.')
  assert(edgeAi.dossier.brief.requirements.some(item => item.id === 'compute_tops' && item.value === 200), 'Edge AI brief should parse 200 TOPS throughput.')
  assert(edgeAi.dossier.brief.requirements.some(item => item.id === 'rack_units' && item.value === 1), 'Edge AI brief should parse 1U rack height.')
  assert(edgeAi.dossier.brief.requirements.some(item => item.id === 'power_budget_w' && item.value === 700), 'Edge AI brief should parse 700 W power budget.')
  assert(haps.dossier.brief.requirements.some(item => item.id === 'altitude_km' && item.value === 20), 'HAPS brief should parse 20 km altitude.')
  assert(haps.dossier.brief.requirements.some(item => item.id === 'endurance_days' && item.value === 30), 'HAPS brief should parse 30 day station-keeping endurance.')
  assert(haps.dossier.brief.requirements.some(item => item.id === 'wingspan_m' && item.value === 35), 'HAPS brief should parse 35 m wingspan.')
  assert(cgm.dossier.brief.requirements.some(item => item.id === 'wear_days' && item.value === 14), 'CGM brief should parse 14 day wear duration.')
  assert(cgm.dossier.brief.requirements.some(item => item.id === 'reading_interval_minutes' && item.value === 5), 'CGM brief should parse 5 minute readings.')
  assert(cgm.dossier.brief.requirements.some(item => item.id === 'mard_percent' && item.value === 9), 'CGM brief should parse 9% MARD.')
  assert(drone.dossier.brief.requirements.some(item => item.id === 'duration_minutes' && item.value === 40), 'Drone brief should parse 40 minute endurance.')
  assert(bess.architectureReadiness.readyForBom, 'BESS architecture should pass readiness before sourcing.')
  assert(farm.architectureReadiness.readyForBom, 'Farm architecture should pass readiness before sourcing.')
  assert(heatPump.architectureReadiness.readyForBom, 'Heat pump architecture should pass readiness before sourcing.')
  assert(evCharger.architectureReadiness.readyForBom, 'EV charger architecture should pass readiness before sourcing.')
  assert(bioreactor.architectureReadiness.readyForBom, 'Bioreactor architecture should pass readiness before sourcing.')
  assert(auv.architectureReadiness.readyForBom, 'AUV architecture should pass readiness before sourcing.')
  assert(edgeAi.architectureReadiness.readyForBom, 'Edge AI architecture should pass readiness before sourcing.')
  assert(haps.architectureReadiness.readyForBom, 'HAPS architecture should pass readiness before sourcing.')
  assert(cgm.architectureReadiness.readyForBom, 'CGM architecture should pass readiness before sourcing.')
  assert(drone.architectureReadiness.readyForBom, 'Drone architecture should pass readiness before sourcing.')
  assert(bess.architectureReadiness.moduleCount >= 10 && bess.architectureReadiness.componentWordCount >= 100, 'BESS scratch grammar should remain deep.')
  assert(farm.architectureReadiness.moduleCount >= 8 && farm.architectureReadiness.componentWordCount >= 80, 'Farm scratch grammar should be deeper than class-pack fallback.')
  assert(heatPump.architectureReadiness.moduleCount >= 8 && heatPump.architectureReadiness.componentWordCount >= 90, 'Heat pump scratch grammar should be deeper than class-pack fallback.')
  assert(evCharger.architectureReadiness.moduleCount >= 8 && evCharger.architectureReadiness.componentWordCount >= 100, 'EV charger scratch grammar should be deeper than class-pack fallback.')
  assert(bioreactor.architectureReadiness.moduleCount >= 8 && bioreactor.architectureReadiness.componentWordCount >= 100, 'Bioreactor scratch grammar should be deeper than class-pack fallback.')
  assert(auv.architectureReadiness.moduleCount >= 8 && auv.architectureReadiness.componentWordCount >= 100, 'AUV scratch grammar should be deeper than class-pack fallback.')
  assert(edgeAi.architectureReadiness.moduleCount >= 8 && edgeAi.architectureReadiness.componentWordCount >= 100, 'Edge AI scratch grammar should be deeper than class-pack fallback.')
  assert(haps.architectureReadiness.moduleCount >= 10 && haps.architectureReadiness.componentWordCount >= 120, 'HAPS scratch grammar should be deeper than class-pack fallback.')
  assert(cgm.architectureReadiness.moduleCount >= 10 && cgm.architectureReadiness.componentWordCount >= 120, 'CGM scratch grammar should be deeper than class-pack fallback.')
  assert(drone.architectureReadiness.moduleCount >= 8 && drone.architectureReadiness.componentWordCount >= 80, 'Drone scratch grammar should be deeper than class-pack fallback.')
  assert(bess.dossier.sources.sourcingEvidence.length === 0, 'Unsourced run must not admit sourcing evidence.')
  assert(bess.dossier.sourcing.admission.admittedLines === 0, 'Unsourced run must not admit priced BoM lines.')
  assert([bess, farm, heatPump, evCharger, bioreactor, auv, edgeAi, haps, cgm, drone].every(result => result.dossier.bom.lines.every(line => line.unitCostGbp === null && line.totalCostGbp === null)), 'Unsourced scratch BoM lines must remain unpriced.')
  assert(farm.dossier.sourcing.admission.admittedLines === 0, 'Farm scratch runs must not admit priced BoM lines without evidence.')
  assert(heatPump.dossier.sourcing.admission.admittedLines === 0, 'Heat pump scratch runs must not admit priced BoM lines without evidence.')
  assert(evCharger.dossier.sourcing.admission.admittedLines === 0, 'EV charger scratch runs must not admit priced BoM lines without evidence.')
  assert(bioreactor.dossier.sourcing.admission.admittedLines === 0, 'Bioreactor scratch runs must not admit priced BoM lines without evidence.')
  assert(auv.dossier.sourcing.admission.admittedLines === 0, 'AUV scratch runs must not admit priced BoM lines without evidence.')
  assert(edgeAi.dossier.sourcing.admission.admittedLines === 0, 'Edge AI scratch runs must not admit priced BoM lines without evidence.')
  assert(haps.dossier.sourcing.admission.admittedLines === 0, 'HAPS scratch runs must not admit priced BoM lines without evidence.')
  assert(cgm.dossier.sourcing.admission.admittedLines === 0, 'CGM scratch runs must not admit priced BoM lines without evidence.')
  assert(drone.dossier.sourcing.admission.admittedLines === 0, 'Drone scratch runs must not admit priced BoM lines without evidence.')
  assert(farm.stageTrace.find(stage => stage.id === 'universal_module_architecture')?.status === 'passed', 'Farm should use scratch universal architecture.')
  assert(heatPump.stageTrace.find(stage => stage.id === 'universal_module_architecture')?.status === 'passed', 'Heat pump should use scratch universal architecture.')
  assert(evCharger.stageTrace.find(stage => stage.id === 'universal_module_architecture')?.status === 'passed', 'EV charger should use scratch universal architecture.')
  assert(bioreactor.stageTrace.find(stage => stage.id === 'universal_module_architecture')?.status === 'passed', 'Bioreactor should use scratch universal architecture.')
  assert(auv.stageTrace.find(stage => stage.id === 'universal_module_architecture')?.status === 'passed', 'AUV should use scratch universal architecture.')
  assert(edgeAi.stageTrace.find(stage => stage.id === 'universal_module_architecture')?.status === 'passed', 'Edge AI should use scratch universal architecture.')
  assert(haps.stageTrace.find(stage => stage.id === 'universal_module_architecture')?.status === 'passed', 'HAPS should use scratch universal architecture.')
  assert(cgm.stageTrace.find(stage => stage.id === 'universal_module_architecture')?.status === 'passed', 'CGM should use scratch universal architecture.')
  assert(drone.stageTrace.find(stage => stage.id === 'universal_module_architecture')?.status === 'passed', 'Drone should use scratch universal architecture.')
  assert(farm.stageTrace.find(stage => stage.id === 'sourcing_bom_admission')?.status === 'warning', 'Farm sourcing stage should warn while pricing is unsourced.')
  assert(heatPump.stageTrace.find(stage => stage.id === 'sourcing_bom_admission')?.status === 'warning', 'Heat pump sourcing stage should warn while pricing is unsourced.')
  assert(evCharger.stageTrace.find(stage => stage.id === 'sourcing_bom_admission')?.status === 'warning', 'EV charger sourcing stage should warn while pricing is unsourced.')
  assert(bioreactor.stageTrace.find(stage => stage.id === 'sourcing_bom_admission')?.status === 'warning', 'Bioreactor sourcing stage should warn while pricing is unsourced.')
  assert(auv.stageTrace.find(stage => stage.id === 'sourcing_bom_admission')?.status === 'warning', 'AUV sourcing stage should warn while pricing is unsourced.')
  assert(edgeAi.stageTrace.find(stage => stage.id === 'sourcing_bom_admission')?.status === 'warning', 'Edge AI sourcing stage should warn while pricing is unsourced.')
  assert(haps.stageTrace.find(stage => stage.id === 'sourcing_bom_admission')?.status === 'warning', 'HAPS sourcing stage should warn while pricing is unsourced.')
  assert(cgm.stageTrace.find(stage => stage.id === 'sourcing_bom_admission')?.status === 'warning', 'CGM sourcing stage should warn while pricing is unsourced.')
  assert(drone.stageTrace.find(stage => stage.id === 'sourcing_bom_admission')?.status === 'warning', 'Drone sourcing stage should warn while pricing is unsourced.')

  console.log('Staged flow audit passed')
  console.log({
    bessStages: summariseStages(bess),
    bessArchitectureReady: bess.architectureReadiness.readyForBom,
    bessRequirements: bess.dossier.brief.requirements.map(item => `${item.id}=${item.value}${item.unit ?? ''}`),
    bessBoMAdmission: bess.dossier.sourcing.admission,
    farmStages: summariseStages(farm),
    farmCoverage: coverage(farm),
    farmRequirements: farm.dossier.brief.requirements.map(item => `${item.id}=${item.value}${item.unit ?? ''}`),
    heatPumpStages: summariseStages(heatPump),
    heatPumpCoverage: coverage(heatPump),
    heatPumpRequirements: heatPump.dossier.brief.requirements.map(item => `${item.id}=${item.value}${item.unit ?? ''}`),
    evChargerStages: summariseStages(evCharger),
    evChargerCoverage: coverage(evCharger),
    evChargerRequirements: evCharger.dossier.brief.requirements.map(item => `${item.id}=${item.value}${item.unit ?? ''}`),
    bioreactorStages: summariseStages(bioreactor),
    bioreactorCoverage: coverage(bioreactor),
    bioreactorRequirements: bioreactor.dossier.brief.requirements.map(item => `${item.id}=${item.value}${item.unit ?? ''}`),
    auvStages: summariseStages(auv),
    auvCoverage: coverage(auv),
    auvRequirements: auv.dossier.brief.requirements.map(item => `${item.id}=${item.value}${item.unit ?? ''}`),
    edgeAiStages: summariseStages(edgeAi),
    edgeAiCoverage: coverage(edgeAi),
    edgeAiRequirements: edgeAi.dossier.brief.requirements.map(item => `${item.id}=${item.value}${item.unit ?? ''}`),
    hapsStages: summariseStages(haps),
    hapsCoverage: coverage(haps),
    hapsRequirements: haps.dossier.brief.requirements.map(item => `${item.id}=${item.value}${item.unit ?? ''}`),
    cgmStages: summariseStages(cgm),
    cgmCoverage: coverage(cgm),
    cgmRequirements: cgm.dossier.brief.requirements.map(item => `${item.id}=${item.value}${item.unit ?? ''}`),
    droneStages: summariseStages(drone),
    droneCoverage: coverage(drone),
    droneRequirements: drone.dossier.brief.requirements.map(item => `${item.id}=${item.value}${item.unit ?? ''}`),
  })
}

function assertStageSequence(result: ReportRunResult): void {
  const actual = result.stageTrace.map(stage => stage.id)
  assert(
    JSON.stringify(actual) === JSON.stringify(EXPECTED_STAGE_IDS),
    `${result.dossier.id} stage sequence mismatch: ${actual.join(', ')}`,
  )
}

function summariseStages(result: ReportRunResult): string[] {
  return result.stageTrace.map(stage => `${stage.id}:${stage.status}`)
}

function coverage(result: ReportRunResult): string {
  return `${result.architectureReadiness.moduleCount} modules / ${result.architectureReadiness.subModuleCount} submodules / ${result.architectureReadiness.componentWordCount} components`
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
