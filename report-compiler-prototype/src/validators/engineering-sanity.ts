import type {
  ArchitectureModel,
  EngineeringSanityCheck,
  EngineeringSanityStatus,
  ProductClass,
  ProvenanceRef,
} from '../schema/types'
import type { ParsedBrief } from '../pipeline/parse-brief'

const briefRef: ProvenanceRef = { kind: 'brief', ref: 'input.brief' }
const modelRef = (productClass: ProductClass): ProvenanceRef => ({ kind: 'model', ref: `engineering_sanity.${productClass}` })
const formulaRef = (ref: string): ProvenanceRef => ({ kind: 'formula', ref })

export function buildEngineeringSanityChecks(
  productClass: ProductClass,
  parsed: ParsedBrief,
  architecture: ArchitectureModel,
): EngineeringSanityCheck[] {
  if (productClass === 'energy_storage') return energyStorageChecks(parsed, productClass)
  if (productClass === 'heat_pump') return heatPumpChecks(parsed, architecture, productClass)
  if (productClass === 'ev_charger') return evChargerChecks(parsed, architecture, productClass)
  if (productClass === 'bioreactor') return bioreactorChecks(parsed, architecture, productClass)
  if (productClass === 'auv') return auvChecks(parsed, architecture, productClass)
  if (productClass === 'edge_ai') return edgeAiChecks(parsed, architecture, productClass)
  if (productClass === 'haps') return hapsChecks(parsed, architecture, productClass)
  if (productClass === 'cgm') return cgmChecks(parsed, architecture, productClass)
  if (productClass === 'vertical_farm') return verticalFarmChecks(parsed, architecture, productClass)
  if (productClass === 'drone') return droneChecks(parsed, architecture, productClass)
  return [
    check(
      productClass,
      'generic_architecture_only',
      'Generic Architecture Only',
      'warn',
      'not class-specific',
      undefined,
      'class-specific sanity rules available',
      'No class-specific engineering sanity rules are implemented for this product class yet.',
      [modelRef(productClass)],
    ),
  ]
}

function cgmChecks(parsed: ParsedBrief, architecture: ArchitectureModel, productClass: ProductClass): EngineeringSanityCheck[] {
  const wearDays = parsed.numericFacts.wear_days
  const intervalMinutes = parsed.numericFacts.reading_interval_minutes
  const mardPercent = parsed.numericFacts.mard_percent
  const checks: EngineeringSanityCheck[] = []

  if (wearDays) {
    checks.push(check(
      productClass,
      'cgm_wear_duration',
      'Wear Duration',
      between(wearDays, 7, 15) ? 'pass' : wearDays <= 30 ? 'warn' : 'fail',
      wearDays,
      'days',
      '7 to 15 days for common disposable CGM patch wear; longer wear needs adhesive, biocompatibility and sensor-drift evidence',
      `${wearDays} days is plausible only after adhesive retention, irritation, sterile boundary and sensor-drift evidence are reviewed.`,
      [briefRef, modelRef(productClass)],
    ))
  } else {
    checks.push(missing(productClass, 'cgm_wear_duration', 'Wear Duration', 'wear_days'))
  }

  if (intervalMinutes) {
    checks.push(check(
      productClass,
      'cgm_reading_interval',
      'Reading Interval',
      between(intervalMinutes, 1, 15) ? 'pass' : intervalMinutes <= 60 ? 'warn' : 'fail',
      intervalMinutes,
      'minutes',
      '1 to 15 minute reading intervals for wearable trend monitoring before battery and radio duty-cycle evidence',
      `${intervalMinutes} minute readings are credible after sensor settling, BLE duty cycle, buffering and battery budget are validated.`,
      [briefRef, modelRef(productClass)],
    ))
  } else {
    checks.push(missing(productClass, 'cgm_reading_interval', 'Reading Interval', 'reading_interval_minutes'))
  }

  if (mardPercent) {
    checks.push(check(
      productClass,
      'cgm_accuracy_target',
      'MARD Accuracy Target',
      mardPercent <= 10 ? 'pass' : mardPercent <= 15 ? 'warn' : 'fail',
      mardPercent,
      '%',
      '<=10% MARD target before clinical validation; 10-15% needs strong use-case constraints, >15% is weak for dosing-adjacent use',
      `${mardPercent}% MARD is a target only; it still needs clinical protocol, comparator method, calibration and population evidence.`,
      [briefRef, modelRef(productClass)],
    ))
  } else {
    checks.push(missing(productClass, 'cgm_accuracy_target', 'MARD Accuracy Target', 'mard_percent'))
  }

  checks.push(check(
    productClass,
    'cgm_biofluid_signal_closure',
    'Biofluid/Signal Closure',
    hasModules(architecture, ['skin_patient_interface', 'sensing_instrumentation', 'control_compute_communication'])
      && hasInterfaces(architecture, ['interstitial_fluid_path', 'electrode_signal_path', 'sensor_signal_bus', 'calibration_data_bus']) ? 'pass' : 'fail',
    hasInterfaces(architecture, ['interstitial_fluid_path', 'electrode_signal_path', 'sensor_signal_bus', 'calibration_data_bus']) ? 'present' : 'missing',
    undefined,
    'interstitial fluid path, electrode signal, sensor signal bus and calibration data bus present',
    'Patient-contact fluid access, electrochemical readout and calibration state are connected before BoM sourcing.',
    [modelRef(productClass)],
  ))

  checks.push(check(
    productClass,
    'cgm_patch_power_comms_safety',
    'Patch/Power/Comms/Safety Closure',
    hasInterfaces(architecture, ['adhesive_skin_boundary', 'sterile_boundary', 'ble_link', 'low_power_rail', 'alarm_state_bus'])
      && hasComponentQuantity(architecture, 'disposable_applicator', 1) ? 'pass' : 'fail',
    hasInterfaces(architecture, ['adhesive_skin_boundary', 'sterile_boundary', 'ble_link', 'low_power_rail', 'alarm_state_bus'])
      && hasComponentQuantity(architecture, 'disposable_applicator', 1) ? 'present' : 'missing',
    undefined,
    'adhesive skin boundary, sterile boundary, BLE link, low-power rail, alarm bus and disposable applicator present',
    'Wear attachment, sterility, telemetry, energy and patient safety paths are named before sourcing or clinical claims.',
    [modelRef(productClass)],
  ))

  return checks
}

function bioreactorChecks(parsed: ParsedBrief, architecture: ArchitectureModel, productClass: ProductClass): EngineeringSanityCheck[] {
  const workingVolumeL = parsed.numericFacts.working_volume_l
  const checks: EngineeringSanityCheck[] = []
  if (workingVolumeL) {
    checks.push(check(
      productClass,
      'bioreactor_working_volume',
      'Single-Use Working Volume',
      between(workingVolumeL, 1, 2000) ? 'pass' : workingVolumeL <= 5000 ? 'warn' : 'fail',
      workingVolumeL,
      'L',
      '1 to 2000 L for common single-use mammalian-cell systems; larger volumes need platform-specific bag and mixing evidence',
      `${workingVolumeL} L is plausible for a single-use mammalian-cell bioreactor before detailed mixing, oxygen-transfer and bag-platform evidence.`,
      [briefRef, modelRef(productClass)],
    ))
  } else {
    checks.push(missing(productClass, 'bioreactor_working_volume', 'Single-Use Working Volume', 'working_volume_l'))
  }

  checks.push(check(
    productClass,
    'bioreactor_process_closure',
    'Sterile Process Closure',
    hasModules(architecture, ['structure_containment', 'mass_fluid_transport_process', 'sensing_instrumentation', 'control_compute_communication'])
      && hasInterfaces(architecture, ['sterile_fluid_path', 'gas_path', 'sensor_bus', 'pump_control']) ? 'pass' : 'fail',
    hasInterfaces(architecture, ['sterile_fluid_path', 'gas_path', 'sensor_bus', 'pump_control']) ? 'present' : 'missing',
    undefined,
    'sterile fluid path, gas path, sensor bus and pump control present',
    'Media/feed/harvest paths, gas transfer, sensors and controller actions are connected before sourcing.',
    [modelRef(productClass)],
  ))

  checks.push(check(
    productClass,
    'bioreactor_aseptic_pressure_safety',
    'Aseptic And Pressure Safety',
    hasInterfaces(architecture, ['sterile_boundary', 'pressure_relief', 'exhaust_path', 'alarm_bus', 'service_access']) ? 'pass' : 'fail',
    hasInterfaces(architecture, ['sterile_boundary', 'pressure_relief', 'exhaust_path', 'alarm_bus', 'service_access']) ? 'present' : 'missing',
    undefined,
    'sterile boundary, pressure relief, exhaust path, alarm bus and service access present',
    'The architecture names the sterile and overpressure controls needed before BoM sourcing.',
    [modelRef(productClass)],
  ))

  return checks
}

function hapsChecks(parsed: ParsedBrief, architecture: ArchitectureModel, productClass: ProductClass): EngineeringSanityCheck[] {
  const altitudeKm = parsed.numericFacts.altitude_km
  const enduranceDays = parsed.numericFacts.endurance_days
  const wingspanM = parsed.numericFacts.wingspan_m
  const checks: EngineeringSanityCheck[] = []

  if (altitudeKm) {
    checks.push(check(
      productClass,
      'haps_altitude_band',
      'Stratospheric Altitude Band',
      between(altitudeKm, 15, 25) ? 'pass' : altitudeKm >= 10 && altitudeKm <= 30 ? 'warn' : 'fail',
      altitudeKm,
      'km',
      '15 to 25 km for common HAPS station-keeping concepts; outside this band needs atmospheric, power and airspace evidence',
      `${altitudeKm} km sits in the stratospheric operating band before detailed wind, airspace and thermal environment evidence.`,
      [briefRef, modelRef(productClass)],
    ))
  } else {
    checks.push(missing(productClass, 'haps_altitude_band', 'Stratospheric Altitude Band', 'altitude_km'))
  }

  if (enduranceDays) {
    checks.push(check(
      productClass,
      'haps_endurance_target',
      'Station-Keeping Endurance',
      enduranceDays <= 60 ? 'pass' : enduranceDays <= 180 ? 'warn' : 'fail',
      enduranceDays,
      'days',
      '<=60 days plausible for early solar HAPS concept, 60-180 days needs strong degradation and energy evidence, >180 days is high risk',
      `${enduranceDays} days requires solar day/night balance, degradation allowance, battery reserve and stratospheric wind validation.`,
      [briefRef, modelRef(productClass)],
    ))
  } else {
    checks.push(missing(productClass, 'haps_endurance_target', 'Station-Keeping Endurance', 'endurance_days'))
  }

  if (wingspanM) {
    checks.push(check(
      productClass,
      'haps_wingspan_envelope',
      'Wing Span Envelope',
      between(wingspanM, 10, 80) ? 'pass' : wingspanM <= 120 ? 'warn' : 'fail',
      wingspanM,
      'm',
      '10 to 80 m for lightweight demonstrator-to-service HAPS concepts before aeroelastic proof',
      `${wingspanM} m is plausible for a solar HAPS wing, but still needs aeroelastic, transport and launch-handling evidence.`,
      [briefRef, modelRef(productClass)],
    ))
  } else {
    checks.push(missing(productClass, 'haps_wingspan_envelope', 'Wing Span Envelope', 'wingspan_m'))
  }

  checks.push(check(
    productClass,
    'haps_energy_flight_closure',
    'Solar/Energy/Flight Closure',
    hasModules(architecture, ['energy_harvesting', 'energy_storage_source', 'power_distribution', 'actuation_kinematics', 'control_compute_communication'])
      && hasInterfaces(architecture, ['solar_dc_bus', 'battery_dc_bus', 'propulsion_power_bus', 'flight_control_bus', 'battery_monitor_bus']) ? 'pass' : 'fail',
    hasInterfaces(architecture, ['solar_dc_bus', 'battery_dc_bus', 'propulsion_power_bus', 'flight_control_bus', 'battery_monitor_bus']) ? 'present' : 'missing',
    undefined,
    'solar DC, battery DC, propulsion power, flight control and battery monitor paths present',
    'Solar generation, night-cycle battery storage, propulsion loads and flight control are connected before BoM sourcing.',
    [modelRef(productClass)],
  ))

  checks.push(check(
    productClass,
    'haps_payload_comms_safety',
    'Payload/Telemetry/Safety Closure',
    hasInterfaces(architecture, ['payload_data_link', 'payload_power_bus', 'telemetry_link', 'hardwired_trip', 'thermal_path'])
      && hasComponentQuantity(architecture, 'recovery_parachute_system', 1) ? 'pass' : 'fail',
    hasInterfaces(architecture, ['payload_data_link', 'payload_power_bus', 'telemetry_link', 'hardwired_trip', 'thermal_path'])
      && hasComponentQuantity(architecture, 'recovery_parachute_system', 1) ? 'present' : 'missing',
    undefined,
    'payload data, payload power, telemetry, hardwired trip, thermal path and recovery parachute present',
    'Payload relay, ground command, thermal protection and recovery paths are named before sourcing or flight-readiness claims.',
    [modelRef(productClass)],
  ))

  return checks
}

function edgeAiChecks(parsed: ParsedBrief, architecture: ArchitectureModel, productClass: ProductClass): EngineeringSanityCheck[] {
  const computeTops = parsed.numericFacts.compute_tops
  const rackUnits = parsed.numericFacts.rack_units
  const powerBudgetW = parsed.numericFacts.power_budget_w
  const checks: EngineeringSanityCheck[] = []

  if (computeTops) {
    checks.push(check(
      productClass,
      'edgeai_compute_throughput',
      'Inference Throughput',
      between(computeTops, 10, 2000) ? 'pass' : computeTops <= 10000 ? 'warn' : 'fail',
      computeTops,
      'TOPS',
      '10 to 2000 TOPS for a rack edge inference appliance before model and latency derating',
      `${computeTops} TOPS is plausible only after model benchmark, precision mode, batching and accelerator thermal derating evidence.`,
      [briefRef, modelRef(productClass)],
    ))
  } else {
    checks.push(missing(productClass, 'edgeai_compute_throughput', 'Inference Throughput', 'compute_tops'))
  }

  if (rackUnits && powerBudgetW) {
    const wattsPerU = round(powerBudgetW / rackUnits)
    checks.push(check(
      productClass,
      'edgeai_power_density',
      'Rack Power Density',
      between(wattsPerU, 100, 1500) ? 'pass' : wattsPerU <= 2500 ? 'warn' : 'fail',
      wattsPerU,
      'W/U',
      '100 to 1500 W/U for forced-air edge appliances; higher density needs detailed rack inlet and cooling proof',
      `${powerBudgetW} W in ${rackUnits}U implies ${wattsPerU} W/U before rack inlet temperature, airflow and PSU derating evidence.`,
      [briefRef, formulaRef('power_budget_w / rack_units'), modelRef(productClass)],
    ))
  } else {
    checks.push(missing(productClass, 'edgeai_power_density', 'Rack Power Density', 'rack_units and power_budget_w'))
  }

  checks.push(check(
    productClass,
    'edgeai_data_compute_closure',
    'Data/Compute Closure',
    hasModules(architecture, ['compute_acceleration', 'network_io', 'data_storage', 'control_compute_communication'])
      && hasInterfaces(architecture, ['pcie_fabric', 'inference_network', 'storage_bus', 'management_network']) ? 'pass' : 'fail',
    hasInterfaces(architecture, ['pcie_fabric', 'inference_network', 'storage_bus', 'management_network']) ? 'present' : 'missing',
    undefined,
    'PCIe fabric, inference network, storage bus and management network present',
    'Accelerator, host control, network ingress and model storage are connected before BoM sourcing.',
    [modelRef(productClass)],
  ))

  checks.push(check(
    productClass,
    'edgeai_thermal_power_safety',
    'Thermal/Power Safety',
    hasInterfaces(architecture, ['thermal_path', 'airflow_path', 'fan_control_bus', 'ac_input_bus', 'protective_earth', 'thermal_alarm_bus', 'hardwired_trip'])
      && hasComponentQuantity(architecture, 'fan_wall_assembly', 1) ? 'pass' : 'fail',
    hasInterfaces(architecture, ['thermal_path', 'airflow_path', 'fan_control_bus', 'ac_input_bus', 'protective_earth', 'thermal_alarm_bus', 'hardwired_trip'])
      && hasComponentQuantity(architecture, 'fan_wall_assembly', 1) ? 'present' : 'missing',
    undefined,
    'thermal path, airflow path, fan control, AC input, protective earth, thermal alarm and hardwired trip present',
    'Rack thermal management and hardware shutdown paths are named before any sourced BoM or cost claim.',
    [modelRef(productClass)],
  ))

  checks.push(check(
    productClass,
    'edgeai_secure_management',
    'Secure Management',
    hasInterfaces(architecture, ['secure_boot_chain', 'management_network', 'service_access'])
      && hasComponentQuantity(architecture, 'tpm_security_module', 1) ? 'pass' : 'fail',
    hasInterfaces(architecture, ['secure_boot_chain', 'management_network', 'service_access'])
      && hasComponentQuantity(architecture, 'tpm_security_module', 1) ? 'present' : 'missing',
    undefined,
    'secure boot chain, management network, service access and TPM present',
    'The architecture includes a measurable secure-management path before fleet deployment claims.',
    [modelRef(productClass)],
  ))

  return checks
}

function auvChecks(parsed: ParsedBrief, architecture: ArchitectureModel, productClass: ProductClass): EngineeringSanityCheck[] {
  const depthRatingM = parsed.numericFacts.depth_rating_m
  const enduranceHours = parsed.numericFacts.endurance_hours
  const checks: EngineeringSanityCheck[] = []

  if (depthRatingM) {
    checks.push(check(
      productClass,
      'auv_depth_rating',
      'Depth Rating',
      between(depthRatingM, 10, 600) ? 'pass' : depthRatingM <= 6000 ? 'warn' : 'fail',
      depthRatingM,
      'm',
      '10 to 600 m for inspection-class AUV prototypes; deeper missions need dedicated pressure-vessel, seal and recovery evidence',
      `${depthRatingM} m is plausible for an inspection AUV before detailed pressure-boundary calculation, material selection and proof testing.`,
      [briefRef, modelRef(productClass)],
    ))
  } else {
    checks.push(missing(productClass, 'auv_depth_rating', 'Depth Rating', 'depth_rating_m'))
  }

  if (enduranceHours) {
    checks.push(check(
      productClass,
      'auv_endurance_target',
      'Survey Endurance Target',
      enduranceHours <= 12 ? 'pass' : enduranceHours <= 24 ? 'warn' : 'fail',
      enduranceHours,
      'hours',
      '<=12 h plausible for compact inspection AUV concept, 12-24 h needs battery/drag budget, >24 h is high risk without a detailed energy model',
      `${enduranceHours} hours is credible only after drag, hotel-load, payload-load and reserve-energy calculations are completed.`,
      [briefRef, modelRef(productClass)],
    ))
  } else {
    checks.push(missing(productClass, 'auv_endurance_target', 'Survey Endurance Target', 'endurance_hours'))
  }

  checks.push(check(
    productClass,
    'auv_navigation_control_closure',
    'Navigation/Control Closure',
    hasModules(architecture, ['control_compute_communication', 'sensing_instrumentation', 'actuation_kinematics'])
      && hasInterfaces(architecture, ['navigation_sensor_bus', 'payload_data_bus', 'acoustic_link', 'thrust_command_bus']) ? 'pass' : 'fail',
    hasInterfaces(architecture, ['navigation_sensor_bus', 'payload_data_bus', 'acoustic_link', 'thrust_command_bus']) ? 'present' : 'missing',
    undefined,
    'navigation sensor bus, payload data bus, acoustic link and thrust command bus present',
    'DVL/INS/depth sensing, payload data, acoustic messages and thruster commands are connected before BoM sourcing.',
    [modelRef(productClass)],
  ))

  checks.push(check(
    productClass,
    'auv_pressure_power_recovery_safety',
    'Pressure/Power/Recovery Safety',
    hasInterfaces(architecture, ['pressure_boundary', 'leak_alarm_bus', 'alarm_bus', 'dc_power_bus', 'service_access'])
      && hasComponentQuantity(architecture, 'recovery_beacon', 1) ? 'pass' : 'fail',
    hasInterfaces(architecture, ['pressure_boundary', 'leak_alarm_bus', 'alarm_bus', 'dc_power_bus', 'service_access'])
      && hasComponentQuantity(architecture, 'recovery_beacon', 1) ? 'present' : 'missing',
    undefined,
    'pressure boundary, leak alarm, alarm bus, DC power, service access and recovery beacon present',
    'The architecture names the hull boundary, leak detection, power isolation and recovery mechanisms needed before sourcing components.',
    [modelRef(productClass)],
  ))

  return checks
}

function evChargerChecks(parsed: ParsedBrief, architecture: ArchitectureModel, productClass: ProductClass): EngineeringSanityCheck[] {
  const dcPowerKw = parsed.numericFacts.dc_power_kw
  const checks: EngineeringSanityCheck[] = []
  if (dcPowerKw) {
    checks.push(check(
      productClass,
      'evcharger_power_level',
      'DC Charger Power Level',
      between(dcPowerKw, 50, 350) ? 'pass' : dcPowerKw > 350 && dcPowerKw <= 500 ? 'warn' : 'fail',
      dcPowerKw,
      'kW',
      '50 to 350 kW for common public DC fast-charger classes; >350 kW needs heavier cable, grid and cooling evidence',
      `${dcPowerKw} kW is a plausible DC fast-charger output before detailed grid, cable and thermal derating evidence.`,
      [briefRef, modelRef(productClass)],
    ))
  } else {
    checks.push(missing(productClass, 'evcharger_power_level', 'DC Charger Power Level', 'dc_power_kw'))
  }

  checks.push(check(
    productClass,
    'evcharger_protocol_closure',
    'Vehicle/Backend Protocol Closure',
    hasModules(architecture, ['charging_connector_interface', 'control_compute_communication', 'sensing_instrumentation'])
      && hasInterfaces(architecture, ['ccs2_vehicle_interface', 'iso15118_plc', 'ocpp_network', 'metering_bus']) ? 'pass' : 'fail',
    hasInterfaces(architecture, ['ccs2_vehicle_interface', 'iso15118_plc', 'ocpp_network', 'metering_bus']) ? 'present' : 'missing',
    undefined,
    'CCS2, ISO 15118 PLC, OCPP network and metering bus present',
    'Vehicle handshake, backend session state and billable metering are connected before sourcing.',
    [modelRef(productClass)],
  ))

  checks.push(check(
    productClass,
    'evcharger_power_safety_chain',
    'Power And Safety Chain',
    hasInterfaces(architecture, ['ac_input_bus', 'dc_output_bus', 'coolant_loop', 'insulation_monitoring', 'emergency_stop', 'protective_earth']) ? 'pass' : 'fail',
    hasInterfaces(architecture, ['ac_input_bus', 'dc_output_bus', 'coolant_loop', 'insulation_monitoring', 'emergency_stop', 'protective_earth']) ? 'present' : 'missing',
    undefined,
    'AC input, DC output, cooling, insulation monitoring, emergency stop and protective earth present',
    'High-power conversion and user/service safety interfaces are explicitly allocated.',
    [modelRef(productClass)],
  ))

  return checks
}

function heatPumpChecks(parsed: ParsedBrief, architecture: ArchitectureModel, productClass: ProductClass): EngineeringSanityCheck[] {
  const thermalOutputKw = parsed.numericFacts.thermal_output_kw
  const cop = parsed.numericFacts.cop
  const checks: EngineeringSanityCheck[] = []

  if (thermalOutputKw && cop) {
    const electricInputKw = round(thermalOutputKw / cop)
    checks.push(check(
      productClass,
      'heatpump_cop_input_power',
      'COP And Input Power',
      between(cop, 2.5, 5.5) ? 'pass' : cop >= 1.8 && cop <= 7 ? 'warn' : 'fail',
      `${cop} COP / ${electricInputKw} kW electric input`,
      undefined,
      'COP 2.5 to 5.5 for plausible air-source heat-pump operating points',
      `A ${thermalOutputKw} kW thermal target at COP ${cop} implies roughly ${electricInputKw} kW electrical input before detailed operating-point curves.`,
      [briefRef, formulaRef('thermal_output_kw / cop'), modelRef(productClass)],
    ))
  } else {
    checks.push(missing(productClass, 'heatpump_cop_input_power', 'COP And Input Power', 'thermal_output_kw and cop'))
  }

  checks.push(check(
    productClass,
    'heatpump_refrigerant_hydronic_closure',
    'Refrigerant/Hydronic Closure',
    hasModules(architecture, ['energy_conversion_transduction', 'environmental_interface', 'mass_fluid_transport_process', 'control_compute_communication', 'sensing_instrumentation'])
      && hasInterfaces(architecture, ['refrigerant_loop', 'hydronic_loop', 'control_bus', 'sensor_bus']) ? 'pass' : 'fail',
    hasInterfaces(architecture, ['refrigerant_loop', 'hydronic_loop', 'control_bus', 'sensor_bus']) ? 'present' : 'missing',
    undefined,
    'refrigerant loop, hydronic loop, control bus and sensor bus present',
    'Heat extraction, compression, water-side delivery, control and sensing are connected before BoM sourcing.',
    [modelRef(productClass)],
  ))

  checks.push(check(
    productClass,
    'heatpump_safety_serviceability',
    'Safety And Serviceability Interfaces',
    hasInterfaces(architecture, ['pressure_relief', 'protective_earth', 'condensate_drain', 'service_access']) ? 'pass' : 'fail',
    hasInterfaces(architecture, ['pressure_relief', 'protective_earth', 'condensate_drain', 'service_access']) ? 'present' : 'missing',
    undefined,
    'pressure relief, protective earth, condensate drain and service access present',
    'The architecture names the main safety and service interfaces needed for a monobloc heat-pump review.',
    [modelRef(productClass)],
  ))

  return checks
}

function energyStorageChecks(parsed: ParsedBrief, productClass: ProductClass): EngineeringSanityCheck[] {
  const capacityMwh = parsed.numericFacts.capacity_mwh
  const powerMw = parsed.numericFacts.power_mw
  const massKg = parsed.numericFacts.mass_kg
  const checks: EngineeringSanityCheck[] = []

  if (capacityMwh && powerMw) {
    const cRate = round(powerMw / capacityMwh)
    checks.push(check(
      productClass,
      'bess_c_rate',
      'BESS C-Rate',
      between(cRate, 0.1, 1.0) ? 'pass' : cRate <= 2 ? 'warn' : 'fail',
      cRate,
      'C',
      '0.1C to 1.0C for typical grid-storage duration systems',
      `Power-to-energy ratio implies ${cRate}C, equivalent to roughly ${round(capacityMwh / powerMw)} hours at rated power.`,
      [briefRef, formulaRef('power_mw / capacity_mwh'), modelRef(productClass)],
    ))
    const durationHours = round(capacityMwh / powerMw)
    checks.push(check(
      productClass,
      'bess_duration',
      'Rated Duration',
      between(durationHours, 1, 6) ? 'pass' : durationHours < 1 ? 'warn' : 'warn',
      durationHours,
      'hours',
      '1 to 6 hours for common containerised BESS applications',
      `${durationHours} hours is plausible for a containerised grid-support BESS before detailed cell count and PCS sizing.`,
      [briefRef, formulaRef('capacity_mwh / power_mw'), modelRef(productClass)],
    ))
  } else {
    checks.push(missing(productClass, 'bess_c_rate', 'BESS C-Rate', 'capacity_mwh and power_mw'))
  }

  if (capacityMwh && massKg) {
    const whPerKg = round((capacityMwh * 1_000_000) / massKg)
    checks.push(check(
      productClass,
      'bess_container_energy_density',
      'Container-Level Energy Density',
      between(whPerKg, 50, 200) ? 'pass' : whPerKg <= 260 ? 'warn' : 'fail',
      whPerKg,
      'Wh/kg',
      '50 to 200 Wh/kg at container/system level before detailed structural mass review',
      `${whPerKg} Wh/kg is within a plausible container-level range, but it still needs a mass roll-up by rack, PCS, HVAC and enclosure.`,
      [briefRef, formulaRef('(capacity_mwh * 1000000) / mass_kg'), modelRef(productClass)],
    ))
  } else {
    checks.push(missing(productClass, 'bess_container_energy_density', 'Container-Level Energy Density', 'capacity_mwh and mass_kg'))
  }

  return checks
}

function verticalFarmChecks(parsed: ParsedBrief, architecture: ArchitectureModel, productClass: ProductClass): EngineeringSanityCheck[] {
  const footprint = parsed.numericFacts.footprint_m2
  const checks: EngineeringSanityCheck[] = []
  if (footprint) {
    checks.push(check(
      productClass,
      'farm_footprint',
      'Grow Unit Footprint',
      between(footprint, 1, 20) ? 'pass' : 'warn',
      footprint,
      'm2',
      '1 to 20 m2 for compact prototype grow units',
      `${footprint} m2 is a compact but workable footprint if stacked trays and service access are resolved.`,
      [briefRef, formulaRef('length_m * width_m'), modelRef(productClass)],
    ))
  } else {
    checks.push(missing(productClass, 'farm_footprint', 'Grow Unit Footprint', 'footprint_m2'))
  }

  checks.push(check(
    productClass,
    'farm_wet_electrical_separation',
    'Wet/Electrical Separation',
    hasInterfaces(architecture, ['washdown_boundary', 'mains_supply', 'protective_earth']) ? 'pass' : 'fail',
    hasInterfaces(architecture, ['washdown_boundary', 'mains_supply', 'protective_earth']) ? 'present' : 'missing',
    undefined,
    'washdown boundary, mains supply and protective-earth interfaces present',
    'The architecture declares a wet-zone boundary and protected electrical distribution before sourcing components.',
    [modelRef(productClass)],
  ))

  checks.push(check(
    productClass,
    'farm_process_closure',
    'Climate/Nutrient/Control Closure',
    hasModules(architecture, ['environmental_interface', 'mass_fluid_transport_process', 'control_compute_communication', 'sensing_instrumentation']) ? 'pass' : 'fail',
    hasModules(architecture, ['environmental_interface', 'mass_fluid_transport_process', 'control_compute_communication', 'sensing_instrumentation']) ? 'present' : 'missing',
    undefined,
    'environmental, nutrient transport, sensing and control modules all present',
    'Crop growth has a closed loop for light/climate, nutrient movement, sensing and controller action.',
    [modelRef(productClass)],
  ))

  return checks
}

function droneChecks(parsed: ParsedBrief, architecture: ArchitectureModel, productClass: ProductClass): EngineeringSanityCheck[] {
  const endurance = parsed.numericFacts.duration_minutes
  const checks: EngineeringSanityCheck[] = []
  if (endurance) {
    checks.push(check(
      productClass,
      'drone_endurance_target',
      'Endurance Target',
      endurance <= 30 ? 'pass' : endurance <= 45 ? 'warn' : 'fail',
      endurance,
      'minutes',
      '<=30 min typical, 30-45 min aggressive, >45 min high-risk without mass/power budget',
      `${endurance} minutes is an aggressive cinematography-drone target and needs a mass, propeller and battery energy budget before design freeze.`,
      [briefRef, modelRef(productClass)],
    ))
  } else {
    checks.push(missing(productClass, 'drone_endurance_target', 'Endurance Target', 'duration_minutes'))
  }

  checks.push(check(
    productClass,
    'drone_propulsion_quads',
    'Quad Propulsion Allocation',
    hasComponentQuantity(architecture, 'brushless_motors', 4) && hasComponentQuantity(architecture, 'esc', 4) ? 'pass' : 'fail',
    hasComponentQuantity(architecture, 'brushless_motors', 4) && hasComponentQuantity(architecture, 'esc', 4) ? '4 motors / 4 ESCs' : 'incomplete',
    undefined,
    'four motors and four ESCs allocated for quadcopter layout',
    'The architecture allocates one motor-drive channel per rotor before BoM sourcing.',
    [modelRef(productClass)],
  ))

  checks.push(check(
    productClass,
    'drone_control_power_chain',
    'Control/Power/Actuation Chain',
    hasInterfaces(architecture, ['power_bus', 'motor_drive', 'sensor_bus', 'radio_link']) ? 'pass' : 'fail',
    hasInterfaces(architecture, ['power_bus', 'motor_drive', 'sensor_bus', 'radio_link']) ? 'present' : 'missing',
    undefined,
    'power bus, motor drive, sensor bus and radio link all present',
    'Flight battery, flight controller, radio/navigation link and propulsion are connected by explicit interfaces.',
    [modelRef(productClass)],
  ))

  return checks
}

function check(
  productClass: ProductClass,
  id: string,
  label: string,
  status: EngineeringSanityStatus,
  value: number | string,
  unit: string | undefined,
  expectedRange: string,
  interpretation: string,
  provenance: ProvenanceRef[],
): EngineeringSanityCheck {
  return { id, label, status, value, unit, expectedRange, interpretation, provenance: [...provenance, modelRef(productClass)] }
}

function missing(productClass: ProductClass, id: string, label: string, missingInputs: string): EngineeringSanityCheck {
  return check(
    productClass,
    id,
    label,
    'warn',
    'not evaluated',
    undefined,
    `requires ${missingInputs}`,
    `Brief did not provide ${missingInputs}, so this sanity check is deferred.`,
    [briefRef, modelRef(productClass)],
  )
}

function hasModules(architecture: ArchitectureModel, moduleIds: string[]): boolean {
  const present = new Set(architecture.modules.map(module => module.id))
  return moduleIds.every(moduleId => present.has(moduleId))
}

function hasInterfaces(architecture: ArchitectureModel, interfaceIds: string[]): boolean {
  const present = new Set(architecture.modules.flatMap(module => [
    ...module.interfaces,
    ...module.subModules.flatMap(subModule => subModule.interfaces),
  ]))
  return interfaceIds.every(interfaceId => present.has(interfaceId))
}

function hasComponentQuantity(architecture: ArchitectureModel, componentId: string, minimum: number): boolean {
  return architecture.modules.some(module =>
    module.subModules.some(subModule =>
      subModule.words.some(word => word.id === componentId && word.quantity.value >= minimum),
    ),
  )
}

function between(value: number, low: number, high: number): boolean {
  return value >= low && value <= high
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
