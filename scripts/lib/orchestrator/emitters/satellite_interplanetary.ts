/**
 * scripts/lib/orchestrator/emitters/satellite_interplanetary.ts
 *
 * Deterministic emitter for satellite_interplanetary (deep-space probe).
 *
 * 11 modules: 10 base + radiation_hardening_shield.
 * References: NASA MRO/MAVEN/Europa Clipper, ESA Mars Express/Juice,
 * JAXA Hayabusa-2, Lockheed Martin LM-2100 deep-space bus.
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import type { BriefEnvelope, ContractInProgress, ParsedConstraints } from '../types'
import { qs, mod, cc, word, makeSubModule, fmtQty, buildDesignJSON } from './_shared-satellite'

interface InterplanetaryParams {
  massKg: number
  missionDurYrs: number
  avgPowerW: number
  bolPowerW: number
  rtgPowerW: number
  rtgMassKg: number
  targetFluxWm2: number
  solarArrayAreaM2: number
  batteryCapacityWh: number
  reactionWheelCount: number
  radiatorAreaM2: number
  mliAreaM2: number
  heatPipeCount: number
  cryocoolerMassKg: number
  cryocoolerPowerW: number
  chemThrustN: number
  chemIspS: number
  epThrustN: number
  epIspS: number
  propellantMassKg: number
  propellantTankVolumeL: number
  totalSystemMassKg: number
  downlinkDataRateMbps: number
  downlinkMarginDb: number
  deltaVBudgetMs: number
  achievableDeltaVMs: number
}

function deriveParams(c: ContractInProgress): InterplanetaryParams {
  return {
    massKg: qs(c, 'mass_kg', 2000),
    missionDurYrs: qs(c, 'mission_duration_years', 7),
    avgPowerW: qs(c, 'avg_power_w', 600),
    bolPowerW: qs(c, 'bol_power_w', 1500),
    rtgPowerW: qs(c, 'rtg_electrical_power_w', 250),
    rtgMassKg: qs(c, 'rtg_mass_kg', 45),
    targetFluxWm2: qs(c, 'target_solar_flux_w_m2', 590),
    solarArrayAreaM2: qs(c, 'solar_array_area_m2', 22),
    batteryCapacityWh: qs(c, 'battery_capacity_wh', 4500),
    reactionWheelCount: Math.round(qs(c, 'reaction_wheel_count', 4)),
    radiatorAreaM2: qs(c, 'radiator_area_m2', 2.5),
    mliAreaM2: qs(c, 'mli_area_m2', 20),
    heatPipeCount: Math.round(qs(c, 'heat_pipe_count', 6)),
    cryocoolerMassKg: qs(c, 'cryocooler_mass_kg', 5),
    cryocoolerPowerW: qs(c, 'cryocooler_input_power_w', 75),
    chemThrustN: qs(c, 'chem_thrust_n', 450),
    chemIspS: qs(c, 'chem_isp_s', 320),
    epThrustN: qs(c, 'ep_thrust_n', 0.09),
    epIspS: qs(c, 'ep_isp_s', 3000),
    propellantMassKg: qs(c, 'propellant_mass_kg', 1100),
    propellantTankVolumeL: qs(c, 'propellant_tank_volume_l', 1300),
    totalSystemMassKg: qs(c, 'total_system_mass_kg', 1980),
    downlinkDataRateMbps: qs(c, 'downlink_data_rate_mbps', 4),
    downlinkMarginDb: qs(c, 'downlink_margin_db', 6),
    deltaVBudgetMs: qs(c, 'delta_v_budget_ms', 4500),
    achievableDeltaVMs: qs(c, 'achievable_delta_v_ms', 4650),
  }
}

function emitEnergyStorageSource(p: InterplanetaryParams): DesignModule {
  const battModules = Math.max(4, Math.ceil(p.batteryCapacityWh / 600))
  const solar = makeSubModule('lilt_solar_array', 'LILT-qualified solar array', 'harvests',
    `2 wings, ${p.solarArrayAreaM2.toFixed(1)} m² at ${p.targetFluxWm2.toFixed(0)} W/m² target flux`,
    [
      word('solar_panel_assembly_word', 'solar panel assembly',
        cc('solar_panel_assembly', 'LILT GaAs triple-junction solar panel', 'photon_capture_function', 'gallium_arsenide_semiconductor'),
        [mod('quantity', '×2 wings'), mod('area', p.solarArrayAreaM2.toFixed(1), 'm²'),
         mod('form', 'Spectrolab XTJ-Prime LILT-qualified'), mod('capacity', p.bolPowerW.toFixed(0), 'W BoL @ target flux')]),
      word('cover_glass_word', 'radiation cover glass',
        cc('cover_glass', 'radiation cover glass', 'photon_capture_function', 'fused_silica_glass'),
        [mod('quantity', '×8000'), mod('dimension', '6', 'mil cerium-doped')]),
      word('solar_array_drive_word', 'SADM',
        cc('solar_array_drive', 'solar array drive mechanism', 'mechanical_rotation_function', 'titanium_alloy'),
        [mod('quantity', '×2'), mod('form', 'MOOG SADM rad-tolerant')]),
    ])

  const battery = makeSubModule('battery_pack', 'LILT li-ion battery pack', 'stores',
    `${(p.batteryCapacityWh / 1000).toFixed(1)} kWh in ${battModules} LILT-qualified modules`,
    [
      word('lithium_ion_battery_module_word', 'li-ion battery module',
        cc('lithium_ion_battery_module', 'LILT li-ion battery module', 'electrochemical_energy_function', 'lithium_nickel_manganese_cobalt_oxide'),
        [mod('quantity', fmtQty(battModules)), mod('capacity', (p.batteryCapacityWh / battModules).toFixed(0), 'Wh'),
         mod('form', 'EaglePicher LP-39 / Saft VL51E'), mod('regulatory', 'NASA-STD-8739 + deep-space qual')]),
      word('battery_thermal_heater_word', 'battery thermal heater',
        cc('battery_thermal_heater', 'battery thermal heater', 'thermal_emission_function', 'nichrome'),
        [mod('quantity', '×8'), mod('capacity', '5', 'W each'),
         mod('regulatory', 'maintains battery >0°C in eclipse')]),
    ])

  return {
    module: 'energy_storage_source',
    module_brief: `Generates ${p.bolPowerW.toFixed(0)} W BoL at ${p.targetFluxWm2.toFixed(0)} W/m² target flux via 2× LILT-qualified Spectrolab XTJ-Prime solar wings (${p.solarArrayAreaM2.toFixed(1)} m²); stores ${(p.batteryCapacityWh / 1000).toFixed(1)} kWh in ${battModules} EaglePicher LP-39 modules with active thermal heaters for sub-zero eclipse operation.`,
    overview_paragraph_en: '',
    derived_parameters: { bol_power_w: p.bolPowerW, solar_array_area_m2: p.solarArrayAreaM2, battery_capacity_wh: p.batteryCapacityWh, target_flux_w_m2: p.targetFluxWm2 },
    allowed_radicals: ['photon_capture_function', 'electrochemical_energy_function', 'gallium_arsenide_semiconductor', 'lithium_nickel_manganese_cobalt_oxide', 'fused_silica_glass', 'titanium_alloy'],
    applicability_confidence: 'high',
    sub_modules: [solar, battery],
  }
}

function emitEnergyConversionTransduction(p: InterplanetaryParams): DesignModule {
  const rtg = makeSubModule('rtg_power_source', 'RTG radioisotope power source', 'generates',
    `${p.rtgPowerW.toFixed(0)} W BoL Pu-238 thermoelectric, ${p.rtgMassKg.toFixed(0)} kg`,
    [
      word('rtg_radioisotope_generator_word', 'RTG',
        cc('rtg_radioisotope_generator', 'Pu-238 MMRTG', 'radioisotope_decay_function', 'plutonium_238_oxide'),
        [mod('quantity', '×1'), mod('capacity', p.rtgPowerW.toFixed(0), 'W BoL'),
         mod('form', 'NASA MMRTG / eMMRTG'), mod('regulatory', 'DOE/NNSA SAR + NEPA')]),
      word('rtg_thermocouple_array_word', 'RTG thermocouple array',
        cc('rtg_thermocouple_array', 'SiGe + PbTe thermocouple array', 'thermoelectric_function', 'silicon_germanium_alloy'),
        [mod('quantity', '×768'), mod('form', 'ATEC SiGe + PbTe couples')]),
      word('rtg_general_purpose_heat_source_word', 'GPHS module',
        cc('rtg_general_purpose_heat_source', 'general-purpose heat source module', 'thermal_emission_function', 'iridium_clad'),
        [mod('quantity', '×8'), mod('form', 'iridium-clad GIS')]),
    ])

  const eps = makeSubModule('eps_pcdu', 'EPS power conditioning unit', 'regulates',
    'merges solar + RTG into 28V regulated bus',
    [
      word('eps_pcdu_module_word', 'EPS PCDU module',
        cc('eps_pcdu_module', 'EPS PCDU', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', 'rad-hard cold-redundant'), mod('regulatory', 'MIL-STD-461')]),
      word('mppt_regulator_word', 'MPPT regulator',
        cc('mppt_regulator', 'MPPT regulator', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×4'), mod('form', 'rad-hard SSSR')]),
      word('bus_regulator_28v_word', 'bus regulator',
        cc('bus_regulator_28v', '28V bus regulator', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', 'hot-redundant')]),
    ])

  return {
    module: 'energy_conversion_transduction',
    module_brief: `Hybrid power: ${p.rtgPowerW.toFixed(0)} W BoL Pu-238 MMRTG + ${p.bolPowerW.toFixed(0)} W solar array conditioned by cold-redundant rad-hard EPS PCDU into a 28V regulated bus; 4 MPPT regulators + hot-redundant 28V bus regulators.`,
    overview_paragraph_en: '',
    derived_parameters: { rtg_power_w: p.rtgPowerW, solar_power_w: p.bolPowerW },
    allowed_radicals: ['radioisotope_decay_function', 'thermoelectric_function', 'silicon_semiconductor_function', 'plutonium_238_oxide', 'silicon_germanium_alloy'],
    applicability_confidence: 'high',
    sub_modules: [rtg, eps],
  }
}

function emitControlComputeCommunication(p: InterplanetaryParams): DesignModule {
  const obc = makeSubModule('on_board_computer', 'rad-hard on-board computer', 'executes',
    'autonomous flight software with delayed-command fault tolerance',
    [
      word('on_board_computer_word', 'OBC',
        cc('on_board_computer', 'rad-hard OBC', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', 'cold-redundant BAE RAD750 / Cobham GR740'),
         mod('regulatory', 'TID >500 krad + neutron SEE-tolerant')]),
      word('mass_memory_unit_word', 'mass memory unit',
        cc('mass_memory_unit', 'rad-hard mass memory unit', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('capacity', '512', 'GB'), mod('form', 'rad-hard NAND')]),
      word('rad_tolerant_mcu_word', 'rad-tolerant safe-mode MCU',
        cc('rad_tolerant_mcu', 'safe-mode rad-tolerant MCU', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', 'Vorago VA10820'), mod('regulatory', 'TID >300 krad')]),
    ])

  const adcs = makeSubModule('attitude_determination_control', 'attitude determination + control', 'controls',
    `${p.reactionWheelCount} reaction wheels + 3 star trackers + fibre-optic gyro IMU + 6 sun sensors`,
    [
      word('reaction_wheel_assembly_word', 'reaction wheel assembly',
        cc('reaction_wheel_assembly', 'reaction wheel assembly', 'mechanical_momentum_function', 'aluminium_alloy'),
        [mod('quantity', fmtQty(p.reactionWheelCount)), mod('capacity', '0.06', 'N·m'),
         mod('form', 'Honeywell HR14 / Bradford W45')]),
      word('star_tracker_word', 'star tracker',
        cc('star_tracker', 'star tracker', 'optical_sensing_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×3'), mod('form', 'Sodern Hydra + Jena ASTRO 15'), mod('tolerance', '±1', 'arcsec')]),
      word('imu_word', 'fibre-optic IMU',
        cc('imu', 'fibre-optic gyro IMU', 'mechanical_sensing_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×2'), mod('form', 'Honeywell HRG-128 + Litton')]),
      word('sun_sensor_word', 'sun sensor',
        cc('sun_sensor', 'fine sun sensor', 'optical_sensing_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×6'), mod('form', 'BAE SLS400')]),
    ])

  const comms = makeSubModule('communications_subsystem', 'DSN communications', 'transmits',
    `X-band DSN downlink ${p.downlinkDataRateMbps.toFixed(0)} Mbps via 3m HGA, ${p.downlinkMarginDb.toFixed(1)} dB margin at max range`,
    [
      word('x_band_transponder_word', 'X-band deep-space transponder',
        cc('x_band_transponder', 'X-band deep-space transponder', 'radio_frequency_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×2'), mod('form', 'JPL SDST / General Dynamics LCT'),
         mod('regulatory', 'CCSDS 401.0-B + DSN compliant')]),
      word('high_gain_antenna_word', 'high-gain antenna',
        cc('high_gain_antenna', '3m X-band parabolic HGA', 'radio_frequency_function', 'copper'),
        [mod('quantity', '×1'), mod('dimension', '3', 'm'),
         mod('capacity', '47', 'dBi')]),
      word('low_gain_antenna_word', 'low-gain antenna',
        cc('low_gain_antenna', 'X-band omni LGA', 'radio_frequency_function', 'copper'),
        [mod('quantity', '×4'), mod('form', 'horn array')]),
      word('travelling_wave_tube_amplifier_word', 'TWTA',
        cc('travelling_wave_tube_amplifier', 'X-band TWTA', 'radio_frequency_function', 'gallium_nitride_semiconductor'),
        [mod('quantity', '×2'), mod('capacity', '100', 'W RF'), mod('form', 'Thales TH3877')]),
    ])

  return {
    module: 'control_compute_communication',
    module_brief: `Flight software on cold-redundant BAE RAD750 OBC + 512GB rad-hard MMU; ADCS with ${p.reactionWheelCount} wheels + 3 star trackers + fibre-optic gyros; DSN-compliant X-band transponder with 3m HGA via 100W TWTA achieves ${p.downlinkDataRateMbps.toFixed(0)} Mbps at ${p.downlinkMarginDb.toFixed(1)} dB margin.`,
    overview_paragraph_en: '',
    derived_parameters: { wheel_count: p.reactionWheelCount, data_rate_mbps: p.downlinkDataRateMbps, hga_diameter_m: 3, twta_rf_w: 100 },
    allowed_radicals: ['silicon_semiconductor_function', 'radio_frequency_function', 'optical_sensing_function', 'mechanical_momentum_function', 'copper', 'gallium_nitride_semiconductor'],
    applicability_confidence: 'high',
    sub_modules: [obc, adcs, comms],
  }
}

function emitPowerDistribution(_p: InterplanetaryParams): DesignModule {
  const pdu = makeSubModule('power_distribution_unit', 'rad-hard power distribution unit', 'distributes',
    'switched 28V channels with LCL + SEE-tolerant trip',
    [
      word('lcl_switch_word', 'rad-hard LCL switch',
        cc('lcl_switch', 'rad-hard latching current limiter', 'electrical_switching_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×32'), mod('form', 'Intersil ISL71026M rad-hard')]),
      word('harness_word', 'rad-hard harness',
        cc('harness', 'rad-hard shielded harness', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×1 bundle'), mod('form', 'MIL-W-22759 + Pb-Sn flux'), mod('regulatory', 'NASA-STD-8739.4')]),
    ])
  return {
    module: 'power_distribution',
    module_brief: '32 rad-hard latching current limiters distribute regulated 28V; MIL-W-22759 shielded harness with Pb-Sn solder for thermal cycling; SEE-tolerant trip thresholds.',
    overview_paragraph_en: '',
    derived_parameters: { lcl_channel_count: 32 },
    allowed_radicals: ['electrical_switching_function', 'electrical_conducting_function', 'copper', 'silicon_semiconductor_function'],
    applicability_confidence: 'high',
    sub_modules: [pdu],
  }
}

function emitEnvironmentalInterface(p: InterplanetaryParams): DesignModule {
  const thermal = makeSubModule('thermal_control_subsystem', 'thermal control subsystem', 'rejects',
    `${(p.avgPowerW * 0.85 / 1000).toFixed(2)} kW via ${p.radiatorAreaM2.toFixed(1)} m² radiator + ${p.heatPipeCount} heat pipes`,
    [
      word('body_radiator_panel_word', 'body radiator panel',
        cc('body_radiator_panel', 'cold-pointed radiator panel', 'thermal_radiation_function', 'aluminium_alloy'),
        [mod('quantity', '×2'), mod('area', (p.radiatorAreaM2 / 2).toFixed(1), 'm² each'),
         mod('form', 'OSR-coated cold-pointing')]),
      word('heat_pipe_word', 'heat pipe',
        cc('heat_pipe', 'ammonia heat pipe', 'thermal_transfer_function', 'aluminium_alloy'),
        [mod('quantity', fmtQty(p.heatPipeCount)), mod('form', 'CCHP + LHP')]),
      word('mli_thermal_blanket_word', 'MLI thermal blanket',
        cc('mli_thermal_blanket', '25-layer MLI', 'thermal_insulation_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1 set'), mod('area', p.mliAreaM2.toFixed(0), 'm²')]),
      word('cryocooler_assembly_word', 'cryocooler',
        cc('cryocooler_assembly', 'pulse-tube cryocooler', 'thermal_transfer_function', 'stainless_steel'),
        [mod('quantity', '×1'), mod('capacity', '0.5', 'W @ 80 K'),
         mod('form', 'Northrop HEC Stirling')]),
      word('thermostat_louver_word', 'thermal louver',
        cc('thermostat_louver', 'thermostatic louver', 'thermal_regulation_function', 'aluminium_alloy'),
        [mod('quantity', '×4'), mod('form', 'Starsys / SDL adjustable')]),
      word('survival_heater_word', 'survival heater',
        cc('survival_heater', 'thin-film survival heater', 'thermal_emission_function', 'nichrome'),
        [mod('quantity', '×24'), mod('capacity', '10', 'W each')]),
    ])
  return {
    module: 'environmental_interface',
    module_brief: `Rejects ${(p.avgPowerW * 0.85 / 1000).toFixed(2)} kW via ${p.radiatorAreaM2.toFixed(1)} m² cold-pointing OSR radiator + ${p.heatPipeCount} ammonia heat pipes + 25-layer MLI on ${p.mliAreaM2.toFixed(0)} m²; 4 thermostatic louvers regulate transient loads; Northrop HEC Stirling cryocooler cools IR instrument to 80K; 24 × 10W survival heaters guard against cold-soak.`,
    overview_paragraph_en: '',
    derived_parameters: { radiator_area_m2: p.radiatorAreaM2, heat_pipe_count: p.heatPipeCount, cryocooler_lift_w: 0.5 },
    allowed_radicals: ['thermal_radiation_function', 'thermal_transfer_function', 'thermal_insulation_function', 'thermal_regulation_function', 'thermal_emission_function', 'aluminium_alloy', 'polymer_thermoplastic', 'stainless_steel', 'nichrome'],
    applicability_confidence: 'high',
    sub_modules: [thermal],
  }
}

function emitMassFluidTransportProcess(p: InterplanetaryParams): DesignModule {
  const chem = makeSubModule('chemical_propulsion', 'bi-propellant chemical propulsion', 'imparts',
    `${p.chemThrustN.toFixed(0)} N MMH/MON3 main engine + ${p.propellantMassKg.toFixed(0)} kg propellant for ${p.deltaVBudgetMs.toFixed(0)} m/s ΔV`,
    [
      word('main_engine_word', 'main bi-propellant engine',
        cc('main_engine', 'main bi-propellant engine', 'mass_ejection_function', 'titanium_alloy'),
        [mod('quantity', '×1'), mod('capacity', p.chemThrustN.toFixed(0), 'N'),
         mod('form', 'IHI BT-4 / Aerojet R-4D')]),
      word('attitude_control_thruster_word', 'attitude control thruster',
        cc('attitude_control_thruster', '22N attitude thruster', 'mass_ejection_function', 'titanium_alloy'),
        [mod('quantity', '×12'), mod('capacity', '22', 'N'),
         mod('form', 'Aerojet MR-106')]),
      word('propellant_tank_word', 'propellant tank',
        cc('propellant_tank', 'MMH+MON3 PMD tank', null, 'titanium_alloy'),
        [mod('quantity', '×4'), mod('capacity', (p.propellantTankVolumeL / 4).toFixed(0), 'L each'),
         mod('form', 'PSI Ti-6Al-4V PMD')]),
      word('pressurant_tank_word', 'pressurant tank',
        cc('pressurant_tank', 'He pressurant tank', null, 'titanium_alloy'),
        [mod('quantity', '×2')]),
    ])
  return {
    module: 'mass_fluid_transport_process',
    module_brief: `Bi-propellant MMH/MON3 main engine (${p.chemThrustN.toFixed(0)} N, Isp ${p.chemIspS.toFixed(0)} s) for cruise + capture; 12 × 22N MR-106 thrusters for attitude control + momentum dumping; ${p.propellantMassKg.toFixed(0)} kg propellant in 4 Ti-6Al-4V PMD tanks delivers ${p.achievableDeltaVMs.toFixed(0)} m/s achievable ΔV (vs ${p.deltaVBudgetMs.toFixed(0)} m/s required).`,
    overview_paragraph_en: '',
    derived_parameters: { chem_thrust_n: p.chemThrustN, chem_isp_s: p.chemIspS, propellant_mass_kg: p.propellantMassKg, achievable_dv_ms: p.achievableDeltaVMs },
    allowed_radicals: ['mass_ejection_function', 'titanium_alloy'],
    applicability_confidence: 'high',
    sub_modules: [chem],
  }
}

function emitSafetyProtection(_p: InterplanetaryParams): DesignModule {
  const safe = makeSubModule('safety_interlocks', 'autonomous safe-mode + safe-arm', 'protects',
    'autonomous safe-mode entry + propellant safe-arm + watchdog reset',
    [
      word('autonomous_safe_mode_word', 'autonomous safe-mode software',
        cc('autonomous_safe_mode', 'autonomous safe-mode logic', 'software_protocol_function', 'software'),
        [mod('quantity', '×1'), mod('form', 'redundant fault detection + isolation + recovery (FDIR)'),
         mod('regulatory', 'ECSS-Q-ST-30 + NASA NPR 7150.2C Class A')]),
      word('pyro_safe_arm_device_word', 'pyrotechnic safe-arm device',
        cc('pyro_safe_arm_device', 'safe-arm device', 'electrical_switching_function', 'aluminium_alloy'),
        [mod('quantity', '×6'), mod('regulatory', 'AFSPCMAN 91-710 V3 dual-string')]),
      word('watchdog_timer_word', 'watchdog timer',
        cc('watchdog_timer', 'rad-hard watchdog timer', 'electrical_switching_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×2'), mod('form', 'rad-hard discrete logic')]),
      word('command_loss_timer_word', 'command-loss timer',
        cc('command_loss_timer', 'command-loss timer', 'software_protocol_function', 'software'),
        [mod('quantity', '×1'), mod('form', 'multi-week tolerance')]),
    ])
  return {
    module: 'safety_protection',
    module_brief: 'Autonomous FDIR logic detects faults during 30+ minute light-time and enters safe-mode without ground intervention; 6 dual-string pyrotechnic safe-arm devices guard hypergolic valves; rad-hard watchdog timers and multi-week command-loss timer guarantee recovery.',
    overview_paragraph_en: '',
    derived_parameters: { safe_arm_count: 6, fdir_active: 1 },
    allowed_radicals: ['software_protocol_function', 'electrical_switching_function', 'aluminium_alloy', 'silicon_semiconductor_function'],
    applicability_confidence: 'high',
    sub_modules: [safe],
  }
}

function emitStructureContainment(p: InterplanetaryParams): DesignModule {
  const structure = makeSubModule('primary_structure', 'primary structure', 'contains',
    'CFRP central tube + propellant tank ring + instrument deck',
    [
      word('central_thrust_tube_word', 'central thrust tube',
        cc('central_thrust_tube', 'CFRP central thrust tube', 'mechanical_load_bearing_function', 'cfrp'),
        [mod('quantity', '×1'), mod('form', 'CFRP cylinder Ø1.2m'),
         mod('regulatory', 'ECSS-E-ST-32-03')]),
      word('propellant_tank_ring_word', 'propellant tank ring',
        cc('propellant_tank_ring', 'propellant tank support ring', 'mechanical_load_bearing_function', 'aluminium_alloy'),
        [mod('quantity', '×1'), mod('form', 'isogrid Al-6061')]),
      word('instrument_deck_word', 'instrument deck',
        cc('instrument_deck', 'instrument deck', 'mechanical_load_bearing_function', 'cfrp'),
        [mod('quantity', '×1'), mod('form', 'CFRP isostatic deck')]),
      word('high_gain_antenna_boom_word', 'HGA boom',
        cc('high_gain_antenna_boom', 'HGA support boom', 'mechanical_load_bearing_function', 'cfrp'),
        [mod('quantity', '×1'), mod('form', 'deployable CFRP truss')]),
    ])
  return {
    module: 'structure_containment',
    module_brief: `CFRP central thrust tube (Ø1.2m, ${p.massKg.toFixed(0)} kg launch mass load capacity) supports 4 propellant tanks in isogrid Al-6061 ring; CFRP isostatic instrument deck mounts payload; CFRP truss boom carries 3m HGA.`,
    overview_paragraph_en: '',
    derived_parameters: { thrust_tube_diameter_m: 1.2, propellant_tank_count: 4 },
    allowed_radicals: ['mechanical_load_bearing_function', 'aluminium_alloy', 'cfrp'],
    applicability_confidence: 'high',
    sub_modules: [structure],
  }
}

function emitOperatorInterface(_p: InterplanetaryParams): DesignModule {
  const ops = makeSubModule('mission_operations_interface', 'DSN-coordinated mission operations', 'commands',
    'NASA Deep Space Network mission ops + autonomous sequence execution',
    [
      word('mission_control_software_word', 'mission control software',
        cc('mission_control_software', 'mission control software', 'software_protocol_function', 'software'),
        [mod('quantity', '×1'), mod('form', 'JPL AMMOS / ESA SCOS-2000'),
         mod('regulatory', 'CCSDS 232.0-B-3')]),
      word('sequence_planner_word', 'sequence planner',
        cc('sequence_planner', 'sequence planning tool', 'software_protocol_function', 'software'),
        [mod('quantity', '×1'), mod('form', 'JPL Sequence Engineering')]),
      word('encryption_module_word', 'encryption module',
        cc('encryption_module', 'CCSDS SDLS encryption', 'software_security_function', 'software'),
        [mod('quantity', '×1'), mod('form', 'AES-256 GCM with deep-space key rotation'),
         mod('regulatory', 'CCSDS 355.0-B-2')]),
    ])
  return {
    module: 'operator_interface',
    module_brief: 'Mission operations coordinated via NASA AMMOS or ESA SCOS-2000 with DSN scheduling; sequence planner uplinks 30-day command blocks; AES-256 CCSDS SDLS encryption with deep-space key rotation.',
    overview_paragraph_en: '',
    derived_parameters: { encryption_bit_strength: 256, dsn_compatible: 1 },
    allowed_radicals: ['software_protocol_function', 'software_security_function'],
    applicability_confidence: 'high',
    sub_modules: [ops],
  }
}

function emitMaintenanceServiceability(p: InterplanetaryParams): DesignModule {
  const launchInterface = makeSubModule('launch_interface', 'launch interface', 'mates',
    'Atlas V / Ariane 6 / Falcon Heavy launch adapter',
    [
      word('clampband_adapter_word', 'clampband adapter',
        cc('clampband_adapter', 'EELV clampband adapter', 'mechanical_load_bearing_function', 'aluminium_alloy'),
        [mod('quantity', '×1'), mod('form', '1666mm clampband'), mod('regulatory', 'EELV SIB')]),
      word('umbilical_connector_word', 'umbilical connector',
        cc('umbilical_connector', 'umbilical connector', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×6'), mod('form', 'MIL-DTL-38999 fly-away')]),
      word('rtg_safe_aluminum_shipping_container_word', 'RTG shipping container',
        cc('rtg_safe_aluminum_shipping_container', 'RTG safe shipping container', 'mechanical_load_bearing_function', 'lead'),
        [mod('quantity', '×1'), mod('form', 'lead-shielded Type B(U)'),
         mod('regulatory', 'DOE/IAEA Type B(U)')]),
    ])
  return {
    module: 'maintenance_serviceability',
    module_brief: `1666mm EELV clampband adapter for Atlas V/Ariane 6/Falcon Heavy launch; 6 MIL-DTL-38999 umbilicals for ground servicing; Type B(U) lead-shielded RTG shipping container per DOE/IAEA regs; ${p.missionDurYrs.toFixed(0)}-yr mission with passive operation post-launch.`,
    overview_paragraph_en: '',
    derived_parameters: { clampband_diameter_mm: 1666, mission_duration_years: p.missionDurYrs },
    allowed_radicals: ['mechanical_load_bearing_function', 'electrical_conducting_function', 'aluminium_alloy', 'copper', 'lead'],
    applicability_confidence: 'high',
    sub_modules: [launchInterface],
  }
}

// MODULE 11: radiation_hardening_shield — unique to interplanetary
function emitRadiationHardeningShield(_p: InterplanetaryParams): DesignModule {
  const shield = makeSubModule('radiation_shielding', 'radiation shielding', 'attenuates',
    'tantalum + Al spot shielding around critical electronics',
    [
      word('tantalum_spot_shield_word', 'tantalum spot shield',
        cc('tantalum_spot_shield', 'tantalum spot shield', 'radiation_attenuation_function', 'tantalum'),
        [mod('quantity', '×16'), mod('dimension', '3', 'mm thick'),
         mod('form', '99.95% pure Ta foil')]),
      word('aluminum_radiation_vault_word', 'aluminium radiation vault',
        cc('aluminum_radiation_vault', 'aluminium radiation vault', 'radiation_attenuation_function', 'aluminium_alloy'),
        [mod('quantity', '×1'), mod('dimension', '10', 'mm thick wall'),
         mod('form', 'milled Al-6061-T6 vault')]),
      word('rad_hard_isolation_layer_word', 'rad-hard isolation layer',
        cc('rad_hard_isolation_layer', 'silicon-on-insulator isolation layer', 'radiation_attenuation_function', 'silicon_dioxide'),
        [mod('quantity', '×1'), mod('form', 'SOI substrate in OBC')]),
      word('total_ionising_dose_monitor_word', 'TID monitor',
        cc('total_ionising_dose_monitor', 'TID monitor', 'radiation_sensing_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×4'), mod('form', 'rad-hard radiation monitor')]),
    ])
  return {
    module: 'safety_protection',  // map to taxonomy slot
    module_brief: '16 tantalum spot shields (3mm) protect critical chips; 10mm-thick milled Al-6061 radiation vault houses OBC + MMU; SOI substrate in OBC for SEE tolerance; 4 TID monitors track lifetime dose ≥ 300 krad design margin.',
    overview_paragraph_en: '',
    derived_parameters: { tantalum_shield_count: 16, vault_wall_mm: 10 },
    allowed_radicals: ['radiation_attenuation_function', 'radiation_sensing_function', 'tantalum', 'aluminium_alloy', 'silicon_dioxide', 'silicon_semiconductor_function'],
    applicability_confidence: 'high',
    sub_modules: [shield],
  }
}

function emitCrossModuleGrammarLinks(p: InterplanetaryParams): unknown[] {
  return [
    { from_module: 'energy_storage_source', to_module: 'energy_conversion_transduction', mechanism: 'dc_bus', type: 'mutual', detail: `${p.bolPowerW.toFixed(0)} W solar + ${p.rtgPowerW.toFixed(0)} W RTG to PCDU` },
    { from_module: 'energy_conversion_transduction', to_module: 'power_distribution', mechanism: 'dc_bus', type: 'mutual', detail: '28V regulated bus' },
    { from_module: 'power_distribution', to_module: 'control_compute_communication', mechanism: 'switched_dc', type: 'directional', detail: 'OBC + ADCS + comms + cryocooler' },
    { from_module: 'control_compute_communication', to_module: 'mass_fluid_transport_process', mechanism: 'control_signal', type: 'directional', detail: 'main-engine + RCS firing schedule' },
    { from_module: 'environmental_interface', to_module: 'energy_storage_source', mechanism: 'thermal', type: 'mutual', detail: 'battery thermal + RTG waste-heat reuse' },
    { from_module: 'safety_protection', to_module: 'control_compute_communication', mechanism: 'safe_mode_trigger', type: 'directional', detail: 'autonomous FDIR → safe-mode entry' },
    { from_module: 'structure_containment', to_module: 'energy_storage_source', mechanism: 'mechanical_mount', type: 'directional', detail: 'solar wings + battery rack' },
    { from_module: 'structure_containment', to_module: 'mass_fluid_transport_process', mechanism: 'mechanical_mount', type: 'directional', detail: 'main engine + RCS thrusters' },
    { from_module: 'operator_interface', to_module: 'control_compute_communication', mechanism: 'tc_tm', type: 'mutual', detail: 'DSN uplink + downlink' },
    { from_module: 'maintenance_serviceability', to_module: 'structure_containment', mechanism: 'mechanical_interface', type: 'mutual', detail: 'EELV clampband + umbilicals' },
  ]
}

const emit: ClassEmitter = (contract: ContractInProgress, _brief: ParsedConstraints, _envelope: BriefEnvelope): DesignJSON => {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitEnergyStorageSource(p),
    emitEnergyConversionTransduction(p),
    emitControlComputeCommunication(p),
    emitPowerDistribution(p),
    emitEnvironmentalInterface(p),
    emitMassFluidTransportProcess(p),
    emitSafetyProtection(p),
    emitStructureContainment(p),
    emitOperatorInterface(p),
    emitMaintenanceServiceability(p),
    emitRadiationHardeningShield(p),
  ]
  return buildDesignJSON(
    modules,
    emitCrossModuleGrammarLinks(p),
    `Deliver a ${p.totalSystemMassKg.toFixed(0)} kg interplanetary probe with ${p.missionDurYrs.toFixed(0)}-year mission to ${p.targetFluxWm2.toFixed(0)} W/m² destination flux; hybrid power from ${p.bolPowerW.toFixed(0)} W solar (LILT-qualified) + ${p.rtgPowerW.toFixed(0)} W Pu-238 MMRTG; ${p.deltaVBudgetMs.toFixed(0)} m/s ΔV budget with autonomous safe-mode and DSN X-band downlink at ${p.downlinkDataRateMbps.toFixed(0)} Mbps + ${p.downlinkMarginDb.toFixed(1)} dB margin at max range.`,
  )
}

registerAssembler('satellite_interplanetary', emit)
