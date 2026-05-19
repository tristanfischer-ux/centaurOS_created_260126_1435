import { runReportCompiler } from './pipeline/run-report-compiler'

async function main(): Promise<void> {
  const bess = await runReportCompiler({
    id: 'audit-sanity-bess',
    briefText: 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.',
  })
  const farm = await runReportCompiler({
    id: 'audit-sanity-farm',
    briefText: 'Design a compact vertical farm for leafy greens using LED grow lights, hydroponic fertigation, CO2 monitoring, and a 2.4 m by 1.4 m envelope.',
  })
  const heatPump = await runReportCompiler({
    id: 'audit-sanity-heat-pump',
    briefText: 'Design an 8 kW thermal air-source heat pump with COP 3.5, inverter compressor, outdoor evaporator coil, plate heat exchanger, hydronic circulation pump and monobloc enclosure.',
  })
  const evCharger = await runReportCompiler({
    id: 'audit-sanity-ev-charger',
    briefText: 'Design a 150 kW DC fast EV charger with CCS2 liquid-cooled cable, OCPP backend, ISO 15118 PLC communication, MID metering and insulation monitoring.',
  })
  const bioreactor = await runReportCompiler({
    id: 'audit-sanity-bioreactor',
    briefText: 'Design a 50 L single-use mammalian-cell bioreactor with sterile bag, agitation drive, sparger gas manifold, peristaltic feed pumps, dissolved oxygen control, pH sensing, temperature loop, exhaust filter and batch-record controller.',
  })
  const auv = await runReportCompiler({
    id: 'audit-sanity-auv',
    briefText: 'Design a 300 m depth-rated autonomous underwater vehicle with 8 hour survey endurance, pressure hull, thruster set, DVL, battery pack, acoustic modem, leak detection, forward sonar payload and recovery beacon.',
  })
  const edgeAi = await runReportCompiler({
    id: 'audit-sanity-edge-ai',
    briefText: 'Design a 1U rack-mount edge AI inference appliance with 200 TOPS accelerator throughput, 700 W power budget, GPU module, redundant power supplies, high-speed NIC, NVMe model cache, BMC management, secure boot and front-to-back thermal management.',
  })
  const haps = await runReportCompiler({
    id: 'audit-sanity-haps',
    briefText: 'Design a solar-electric high-altitude pseudo-satellite for 20 km altitude, 30 day station-keeping endurance and 35 m wingspan with wing structure, solar cell array, MPPT power tracker, stratospheric battery pack, electric propulsion pods, flight control computer, GNSS INS navigation, communications payload, thermal insulation and recovery parachute.',
  })
  const cgm = await runReportCompiler({
    id: 'audit-sanity-cgm',
    briefText: 'Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings, MARD 9%, glucose sensing filament, enzyme reagent membrane, reference electrode, adhesive skin interface, thin-film battery, BLE radio module, protective transmitter housing, sterile barrier pouch and disposable applicator.',
  })
  const drone = await runReportCompiler({
    id: 'audit-sanity-drone',
    briefText: 'Design a prosumer cinematography drone with 4K camera payload, 40 minutes flight endurance, brushless motors, ESCs, and flight controller.',
  })
  const impossibleDrone = await runReportCompiler({
    id: 'audit-sanity-impossible-drone',
    briefText: 'Design a prosumer cinematography drone with 4K camera payload, 55 minutes flight endurance, brushless motors, ESCs, and flight controller.',
  })

  assert(status(bess, 'bess_c_rate') === 'pass', 'BESS C-rate should pass for 1 MW / 3.5 MWh.')
  assert(status(bess, 'bess_container_energy_density') === 'pass', 'BESS container energy density should pass for 3.5 MWh / 28 t.')
  assert(status(farm, 'farm_wet_electrical_separation') === 'pass', 'Farm should include wet/electrical separation interfaces.')
  assert(status(farm, 'farm_process_closure') === 'pass', 'Farm should include climate, nutrient, sensing and control closure.')
  assert(status(heatPump, 'heatpump_cop_input_power') === 'pass', 'Heat pump COP/input sanity should pass for 8 kW at COP 3.5.')
  assert(status(heatPump, 'heatpump_refrigerant_hydronic_closure') === 'pass', 'Heat pump should include refrigerant, hydronic, sensing and control closure.')
  assert(status(heatPump, 'heatpump_safety_serviceability') === 'pass', 'Heat pump should expose safety and service interfaces.')
  assert(status(evCharger, 'evcharger_power_level') === 'pass', '150 kW EV charger should pass the DC fast charger power sanity check.')
  assert(status(evCharger, 'evcharger_protocol_closure') === 'pass', 'EV charger should close CCS2, ISO 15118, OCPP and metering paths.')
  assert(status(evCharger, 'evcharger_power_safety_chain') === 'pass', 'EV charger should expose power, cooling, IMD, E-stop and earth interfaces.')
  assert(status(bioreactor, 'bioreactor_working_volume') === 'pass', '50 L single-use bioreactor should pass the working-volume sanity check.')
  assert(status(bioreactor, 'bioreactor_process_closure') === 'pass', 'Bioreactor should close sterile fluid, gas, sensing and pump-control paths.')
  assert(status(bioreactor, 'bioreactor_aseptic_pressure_safety') === 'pass', 'Bioreactor should expose sterile pressure and exhaust safety paths.')
  assert(status(auv, 'auv_depth_rating') === 'pass', '300 m inspection AUV should pass the depth-rating sanity check.')
  assert(status(auv, 'auv_endurance_target') === 'pass', '8 hour AUV should pass the endurance sanity check before detailed energy budget.')
  assert(status(auv, 'auv_navigation_control_closure') === 'pass', 'AUV should close navigation, payload, acoustic and thrust-command paths.')
  assert(status(auv, 'auv_pressure_power_recovery_safety') === 'pass', 'AUV should expose pressure, leak, power and recovery safety interfaces.')
  assert(status(edgeAi, 'edgeai_compute_throughput') === 'pass', '200 TOPS edge AI appliance should pass the throughput sanity check.')
  assert(status(edgeAi, 'edgeai_power_density') === 'pass', '700 W in 1U should pass the rack power-density sanity check.')
  assert(status(edgeAi, 'edgeai_data_compute_closure') === 'pass', 'Edge AI should close accelerator, network, storage and management paths.')
  assert(status(edgeAi, 'edgeai_thermal_power_safety') === 'pass', 'Edge AI should expose thermal, airflow, power and trip paths.')
  assert(status(edgeAi, 'edgeai_secure_management') === 'pass', 'Edge AI should expose secure boot and management paths.')
  assert(status(haps, 'haps_altitude_band') === 'pass', '20 km HAPS should pass the stratospheric altitude-band sanity check.')
  assert(status(haps, 'haps_endurance_target') === 'pass', '30 day HAPS should pass the endurance sanity check before detailed energy budget.')
  assert(status(haps, 'haps_wingspan_envelope') === 'pass', '35 m HAPS should pass the wingspan-envelope sanity check.')
  assert(status(haps, 'haps_energy_flight_closure') === 'pass', 'HAPS should close solar, battery, power, propulsion and flight-control paths.')
  assert(status(haps, 'haps_payload_comms_safety') === 'pass', 'HAPS should expose payload, telemetry, recovery and thermal safety paths.')
  assert(status(cgm, 'cgm_wear_duration') === 'pass', '14 day CGM should pass the wear-duration sanity check.')
  assert(status(cgm, 'cgm_reading_interval') === 'pass', '5 minute CGM readings should pass the reading-interval sanity check.')
  assert(status(cgm, 'cgm_accuracy_target') === 'pass', '9% MARD CGM target should pass the deterministic accuracy-target sanity check before clinical evidence.')
  assert(status(cgm, 'cgm_biofluid_signal_closure') === 'pass', 'CGM should close biofluid, electrode, signal and calibration paths.')
  assert(status(cgm, 'cgm_patch_power_comms_safety') === 'pass', 'CGM should expose adhesive, sterile, BLE, power and alarm safety paths.')
  assert(status(drone, 'drone_endurance_target') === 'warn', '40 minute drone target should warn, not pass silently.')
  assert(status(drone, 'drone_propulsion_quads') === 'pass', 'Drone should allocate four motor/ESC channels.')
  assert(status(impossibleDrone, 'drone_endurance_target') === 'fail', '55 minute drone target should fail without mass/power evidence.')
  assert(impossibleDrone.dossier.feasibility.verdict === 'not_feasible', 'Failed sanity check should force not_feasible verdict.')

  console.log('Engineering sanity audit passed')
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
    impossibleDrone: {
      verdict: impossibleDrone.dossier.feasibility.verdict,
      checks: summary(impossibleDrone),
    },
  })
}

function status(result: Awaited<ReturnType<typeof runReportCompiler>>, id: string): string | undefined {
  return result.dossier.feasibility.engineeringSanityChecks.find(check => check.id === id)?.status
}

function summary(result: Awaited<ReturnType<typeof runReportCompiler>>): string[] {
  return result.dossier.feasibility.engineeringSanityChecks.map(check => `${check.id}:${check.status}:${check.value}${check.unit ?? ''}`)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
