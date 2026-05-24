/**
 * scripts/lib/orchestrator/emitters/satellite_geo_comsat.ts
 *
 * Deterministic emitter for satellite_geo_comsat (1000-7000 kg GEO).
 *
 * 12 modules: all 10 smallsat slots + transponder_farm + deployable feed antenna.
 * Architecture references:
 *   - Lockheed A2100 / Modernised Lockheed LM-2100
 *   - Boeing 702SP (all-electric)
 *   - Airbus Eurostar Neo
 *   - Thales Alenia Space2000 / Spacebus 4000
 *   - Aerojet XR-5 / SPT-140 Hall thrusters
 *   - Northrop Grumman deployable radiator panels
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import type { BriefEnvelope, ContractInProgress, ParsedConstraints } from '../types'
import { qs, mod, cc, word, makeSubModule, fmtQty, buildDesignJSON } from './_shared-satellite'

interface GeoComsatParams {
  massKg: number
  designLifeYears: number
  bolPowerKw: number
  bolPowerW: number
  eolPowerW: number
  solarArrayAreaM2: number
  batteryCapacityWh: number
  reactionWheelCount: number
  reactionWheelTorqueNm: number
  reactionWheelMomentumNms: number
  radiatorAreaM2: number
  mliAreaM2: number
  heatPipeCount: number
  epThrustN: number
  epIspS: number
  epPowerW: number
  epThrusterCount: number
  chemThrustN: number
  chemIspS: number
  propellantMassKg: number
  propellantTankVolumeL: number
  totalSystemMassKg: number
  downlinkDataRateMbps: number
  downlinkEirpDbw: number
  downlinkMarginDb: number
}

function deriveParams(c: ContractInProgress): GeoComsatParams {
  return {
    massKg: qs(c, 'mass_kg', 5000),
    designLifeYears: qs(c, 'design_life_years', 15),
    bolPowerKw: qs(c, 'bol_power_kw', 12),
    bolPowerW: qs(c, 'bol_power_w', 12000),
    eolPowerW: qs(c, 'eol_power_w', 9600),
    solarArrayAreaM2: qs(c, 'solar_array_area_m2', 60),
    batteryCapacityWh: qs(c, 'battery_capacity_wh', 12000),
    reactionWheelCount: Math.round(qs(c, 'reaction_wheel_count', 4)),
    reactionWheelTorqueNm: qs(c, 'reaction_wheel_torque_nm', 0.2),
    reactionWheelMomentumNms: qs(c, 'reaction_wheel_momentum_nms', 70),
    radiatorAreaM2: qs(c, 'radiator_area_m2', 12),
    mliAreaM2: qs(c, 'mli_area_m2', 30),
    heatPipeCount: Math.round(qs(c, 'heat_pipe_count', 18)),
    epThrustN: qs(c, 'ep_thrust_n', 0.22),
    epIspS: qs(c, 'ep_isp_s', 1800),
    epPowerW: qs(c, 'ep_power_w', 5000),
    epThrusterCount: Math.round(qs(c, 'ep_thruster_count', 4)),
    chemThrustN: qs(c, 'chem_thrust_n', 400),
    chemIspS: qs(c, 'chem_isp_s', 320),
    propellantMassKg: qs(c, 'propellant_mass_kg', 380),
    propellantTankVolumeL: qs(c, 'propellant_tank_volume_l', 200),
    totalSystemMassKg: qs(c, 'total_system_mass_kg', 4700),
    downlinkDataRateMbps: qs(c, 'downlink_data_rate_mbps', 1200),
    downlinkEirpDbw: qs(c, 'downlink_eirp_dbw', 66.8),
    downlinkMarginDb: qs(c, 'downlink_margin_db', 6),
  }
}

// MODULE 1: energy_storage_source
function emitEnergyStorageSource(p: GeoComsatParams): DesignModule {
  const battModules = Math.max(4, Math.ceil(p.batteryCapacityWh / 600))
  const solar = makeSubModule(
    'deployable_solar_wings',
    'deployable solar wings',
    'harvests',
    `2 wings × 5 panels, ${p.solarArrayAreaM2.toFixed(0)} m² total at ${p.bolPowerW.toFixed(0)} W BoL`,
    [
      word('solar_panel_assembly_word', 'solar panel assembly',
        cc('solar_panel_assembly', 'GaAs triple-junction solar panel', 'photon_capture_function', 'gallium_arsenide_semiconductor'),
        [mod('quantity', '×10 panels'), mod('area', p.solarArrayAreaM2.toFixed(0), 'm²'),
         mod('form', 'Spectrolab UTJ 5-panel wings'), mod('capacity', p.bolPowerW.toFixed(0), 'W BoL')]),
      word('solar_array_yoke_word', 'solar array yoke',
        cc('solar_array_yoke', 'CFRP yoke', 'mechanical_load_bearing_function', 'cfrp'),
        [mod('quantity', '×2'), mod('form', 'CFRP truss')]),
      word('solar_array_drive_word', 'SADM',
        cc('solar_array_drive', 'solar array drive mechanism', 'mechanical_rotation_function', 'titanium_alloy'),
        [mod('quantity', '×2'), mod('form', 'MOOG SADM'), mod('regulatory', 'ECSS-E-ST-33-01')]),
      word('boom_release_mechanism_word', 'boom release mechanism',
        cc('boom_release_mechanism', 'redundant pin pullers', 'mechanical_release_function', 'stainless_steel'),
        [mod('quantity', '×8'), mod('form', 'Ensign-Bickford NEA')]),
    ],
  )

  const battery = makeSubModule(
    'battery_pack',
    'battery pack',
    'stores',
    `${(p.batteryCapacityWh / 1000).toFixed(1)} kWh li-ion in ${battModules} GEO-class modules`,
    [
      word('lithium_ion_battery_module_word', 'li-ion battery module',
        cc('lithium_ion_battery_module', 'li-ion battery module', 'electrochemical_energy_function', 'lithium_nickel_manganese_cobalt_oxide'),
        [mod('quantity', fmtQty(battModules)), mod('capacity', (p.batteryCapacityWh / battModules).toFixed(0), 'Wh'),
         mod('form', 'Saft VES100 / EaglePicher GEO module'), mod('regulatory', 'AIAA S-100')]),
      word('battery_management_unit_word', 'BMU',
        cc('battery_management_unit', 'battery management unit', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', 'redundant')]),
      word('battery_isolation_relay_word', 'battery isolation relay',
        cc('battery_isolation_relay', 'battery isolation relay', 'electrical_switching_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×4')]),
    ],
  )

  return {
    module: 'energy_storage_source',
    module_brief: `Generates ${p.bolPowerW.toFixed(0)} W BoL (degrades to ${p.eolPowerW.toFixed(0)} W EoL over 15 years) via 2× deployable wings × 5 panels (${p.solarArrayAreaM2.toFixed(0)} m² Spectrolab UTJ) and stores ${(p.batteryCapacityWh / 1000).toFixed(1)} kWh in ${battModules} Saft VES100-class li-ion modules.`,
    overview_paragraph_en: '',
    derived_parameters: { bol_power_w: p.bolPowerW, solar_array_area_m2: p.solarArrayAreaM2, battery_capacity_wh: p.batteryCapacityWh },
    allowed_radicals: ['photon_capture_function', 'electrochemical_energy_function', 'gallium_arsenide_semiconductor', 'lithium_nickel_manganese_cobalt_oxide', 'cfrp'],
    applicability_confidence: 'high',
    sub_modules: [solar, battery],
  }
}

// MODULE 2: energy_conversion_transduction
function emitEnergyConversionTransduction(p: GeoComsatParams): DesignModule {
  const eps = makeSubModule('eps_pcdu', 'EPS power-conditioning + distribution unit', 'regulates',
    `regulated 50 V + 28 V buses; ${p.bolPowerW.toFixed(0)} W BoL → ${p.eolPowerW.toFixed(0)} W EoL`,
    [
      word('eps_pcdu_module_word', 'EPS PCDU module',
        cc('eps_pcdu_module', 'EPS PCDU', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', 'TERMA EPS-15 / Airbus EPS'), mod('capacity', `${p.bolPowerW.toFixed(0)}`, 'W'), mod('regulatory', 'MIL-STD-461')]),
      word('mppt_regulator_word', 'MPPT regulator',
        cc('mppt_regulator', 'MPPT sequential switching shunt regulator', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×12 strings'), mod('form', 'SSSR')]),
      word('bus_regulator_50v_word', '50V bus regulator',
        cc('bus_regulator_50v', '50V regulator', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', 'hot-redundant')]),
    ],
  )
  return {
    module: 'energy_conversion_transduction',
    module_brief: `Conditions solar harvest into regulated 50 V + 28 V buses via redundant TERMA EPS-15 PCDU with 12-string MPPT and hot-redundant 50V regulators capable of ${p.bolPowerW.toFixed(0)} W peak.`,
    overview_paragraph_en: '',
    derived_parameters: { eps_peak_w: p.bolPowerW, mppt_strings: 12 },
    allowed_radicals: ['silicon_semiconductor_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [eps],
  }
}

// MODULE 3: control_compute_communication
function emitControlComputeCommunication(p: GeoComsatParams): DesignModule {
  const obc = makeSubModule('on_board_computer', 'on-board computer', 'executes',
    'dual-string rad-hard OBC on cold-redundant LEON3 + payload data handler',
    [
      word('on_board_computer_word', 'OBC',
        cc('on_board_computer', 'rad-hard OBC', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('form', 'cold-redundant Cobham GR740 / Aitech S950'), mod('regulatory', 'TID >300 krad')]),
      word('mass_memory_unit_word', 'mass memory unit',
        cc('mass_memory_unit', 'mass memory unit', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×2'), mod('capacity', '512', 'GB'), mod('form', 'rad-hard NAND')]),
    ])

  const adcs = makeSubModule('attitude_determination_control', 'attitude determination + control', 'controls',
    `4 reaction wheels (${p.reactionWheelTorqueNm.toFixed(2)} N·m, ${p.reactionWheelMomentumNms.toFixed(0)} N·m·s) + 4 EP thrusters (N-S/E-W stationkeeping)`,
    [
      word('reaction_wheel_assembly_word', 'reaction wheel assembly',
        cc('reaction_wheel_assembly', 'reaction wheel assembly', 'mechanical_momentum_function', 'aluminium_alloy'),
        [mod('quantity', fmtQty(p.reactionWheelCount)), mod('capacity', p.reactionWheelTorqueNm.toFixed(2), 'N·m'),
         mod('form', 'Honeywell HR16 / HR50')]),
      word('star_tracker_word', 'star tracker',
        cc('star_tracker', 'star tracker', 'optical_sensing_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×3'), mod('form', 'Sodern Hydra + Jena-Optronik ASTRO 15'), mod('tolerance', '±1', 'arcsec')]),
      word('imu_word', 'IMU',
        cc('imu', 'fibre-optic gyro IMU', 'mechanical_sensing_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×2'), mod('form', 'Honeywell HRG-128')]),
      word('sun_sensor_word', 'sun sensor',
        cc('sun_sensor', 'fine sun sensor', 'optical_sensing_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×6'), mod('form', 'BAE SLS400')]),
    ])

  const comms = makeSubModule('communications_subsystem', 'TT&C communications', 'transmits',
    `S-band TT&C + Ka-band telemetry independent of payload`,
    [
      word('s_band_transceiver_word', 'S-band transceiver',
        cc('s_band_transceiver', 'S-band TT&C transceiver', 'radio_frequency_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×2'), mod('form', 'redundant TESAT TC-SX')]),
      word('s_band_isoflux_antenna_word', 'S-band isoflux antenna',
        cc('s_band_isoflux_antenna', 'S-band isoflux antenna', 'radio_frequency_function', 'copper'),
        [mod('quantity', '×4'), mod('form', 'global coverage horn')]),
      word('omni_antenna_word', 'omni antenna',
        cc('omni_antenna', 'omni antenna for LEOP', 'radio_frequency_function', 'copper'),
        [mod('quantity', '×2'), mod('form', 'biconical')]),
    ])

  return {
    module: 'control_compute_communication',
    module_brief: `Flight software on cold-redundant rad-hard OBC + 512 GB MMU; ADCS uses ${p.reactionWheelCount} pyramidal reaction wheels + 3 star trackers + fibre-optic gyro IMU; redundant S-band TT&C separate from payload.`,
    overview_paragraph_en: '',
    derived_parameters: { wheel_count: p.reactionWheelCount, tt_c_redundancy: 2 },
    allowed_radicals: ['silicon_semiconductor_function', 'radio_frequency_function', 'optical_sensing_function', 'mechanical_momentum_function', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [obc, adcs, comms],
  }
}

// MODULE 4: power_distribution
function emitPowerDistribution(_p: GeoComsatParams): DesignModule {
  const pdu = makeSubModule('power_distribution_unit', 'power distribution unit', 'distributes',
    'switched 50V/28V channels + LCL protection per transponder',
    [
      word('lcl_switch_word', 'LCL switch',
        cc('lcl_switch', 'latching current limiter', 'electrical_switching_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×64 channels'), mod('form', 'Intersil ISL71026M')]),
      word('harness_word', 'harness',
        cc('harness', 'shielded power harness', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×1 bundle'), mod('form', 'multi-bundle MIL-W-22759'), mod('regulatory', 'NASA-STD-8739.4')]),
    ])
  return {
    module: 'power_distribution',
    module_brief: 'Distributes regulated 50V/28V via 64 latching current limiters with per-transponder protection and shielded MIL-W-22759 harness.',
    overview_paragraph_en: '',
    derived_parameters: { lcl_channel_count: 64 },
    allowed_radicals: ['electrical_switching_function', 'electrical_conducting_function', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [pdu],
  }
}

// MODULE 5: environmental_interface
function emitEnvironmentalInterface(p: GeoComsatParams): DesignModule {
  const thermal = makeSubModule('thermal_control_subsystem', 'thermal control subsystem', 'rejects',
    `${(p.bolPowerW * 0.65 / 1000).toFixed(1)} kW via ${p.radiatorAreaM2.toFixed(0)} m² deployable radiator + ${p.heatPipeCount} LHPs`,
    [
      word('deployable_radiator_word', 'deployable radiator',
        cc('deployable_radiator', 'deployable radiator panel', 'thermal_radiation_function', 'aluminium_alloy'),
        [mod('quantity', '×2'), mod('area', (p.radiatorAreaM2 / 2).toFixed(0), 'm² each'),
         mod('form', 'Northrop Grumman LHP-fed honeycomb panel')]),
      word('loop_heat_pipe_word', 'loop heat pipe',
        cc('loop_heat_pipe', 'ammonia loop heat pipe', 'thermal_transfer_function', 'aluminium_alloy'),
        [mod('quantity', fmtQty(p.heatPipeCount)), mod('form', 'Advanced Cooling Tech LHP')]),
      word('mli_thermal_blanket_word', 'MLI thermal blanket',
        cc('mli_thermal_blanket', 'MLI thermal blanket', 'thermal_insulation_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1 set'), mod('area', p.mliAreaM2.toFixed(0), 'm²'), mod('form', '22-layer Mylar/Kapton')]),
      word('pcm_thermal_storage_word', 'PCM thermal storage',
        cc('pcm_thermal_storage', 'phase-change material buffer', 'thermal_storage_function', 'paraffin_wax'),
        [mod('quantity', '×4 packs'), mod('form', 'n-octadecane in Al fins')]),
      word('survival_heater_word', 'survival heater',
        cc('survival_heater', 'thin-film survival heater', 'thermal_emission_function', 'nichrome'),
        [mod('quantity', '×32'), mod('capacity', '10', 'W each')]),
    ])
  return {
    module: 'environmental_interface',
    module_brief: `Rejects ${(p.bolPowerW * 0.65 / 1000).toFixed(1)} kW via 2× deployable radiator panels (${p.radiatorAreaM2.toFixed(0)} m² total) + ${p.heatPipeCount} loop heat pipes + 22-layer MLI on cold sides + 4 PCM buffer packs for transient loads.`,
    overview_paragraph_en: '',
    derived_parameters: { radiator_area_m2: p.radiatorAreaM2, heat_pipe_count: p.heatPipeCount, mli_area_m2: p.mliAreaM2 },
    allowed_radicals: ['thermal_radiation_function', 'thermal_transfer_function', 'thermal_insulation_function', 'thermal_storage_function', 'thermal_emission_function', 'aluminium_alloy', 'polymer_thermoplastic', 'paraffin_wax', 'nichrome'],
    applicability_confidence: 'high',
    sub_modules: [thermal],
  }
}

// MODULE 6: mass_fluid_transport_process
function emitMassFluidTransportProcess(p: GeoComsatParams): DesignModule {
  const ep = makeSubModule('electric_propulsion', 'electric propulsion (all-electric stationkeeping)', 'imparts',
    `${p.epThrusterCount}× Hall thrusters @ ${(p.epThrustN * 1000).toFixed(0)} mN Isp ${p.epIspS.toFixed(0)} s`,
    [
      word('electric_propulsion_thruster_word', 'EP thruster',
        cc('electric_propulsion_thruster', 'Hall-effect thruster', 'electric_acceleration_function', 'boron_nitride'),
        [mod('quantity', fmtQty(p.epThrusterCount)), mod('capacity', (p.epThrustN * 1000).toFixed(0), 'mN'),
         mod('form', 'Aerojet XR-5 / SPT-140'), mod('regulatory', 'ECSS-E-ST-35-06')]),
      word('ep_ppu_power_processing_unit_word', 'EP PPU',
        cc('ep_ppu_power_processing_unit', 'EP power processing unit', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×4'), mod('capacity', p.epPowerW.toFixed(0), 'W')]),
      word('xenon_propellant_tank_word', 'xenon propellant tank',
        cc('xenon_propellant_tank', 'xenon propellant tank', null, 'titanium_alloy'),
        [mod('quantity', '×2'), mod('capacity', (p.propellantTankVolumeL / 2).toFixed(0), 'L each'), mod('form', 'Ti-6Al-4V COPV @ 160 bar')]),
      word('xenon_flow_control_unit_word', 'xenon flow control unit',
        cc('xenon_flow_control_unit', 'xenon flow controller', 'fluid_metering_function', 'stainless_steel'),
        [mod('quantity', '×4'), mod('form', 'Bradford XFC')]),
      word('ep_pointing_gimbal_word', 'EP pointing gimbal',
        cc('ep_pointing_gimbal', '2-axis pointing gimbal', 'mechanical_rotation_function', 'titanium_alloy'),
        [mod('quantity', '×4'), mod('form', 'Honeybee Robotics 2-axis')]),
    ])

  const chem = makeSubModule('chemical_propulsion', 'chemical propulsion (apogee kick + backup)', 'imparts',
    `${p.chemThrustN.toFixed(0)} N MMH/MON3 bi-propellant for apogee kick + backup`,
    [
      word('apogee_kick_motor_word', 'apogee kick motor',
        cc('apogee_kick_motor', 'apogee kick motor', 'mass_ejection_function', 'titanium_alloy'),
        [mod('quantity', '×1'), mod('capacity', p.chemThrustN.toFixed(0), 'N'),
         mod('form', 'IHI BT-4 / Aerojet R-4D'), mod('regulatory', 'AIAA S-080')]),
      word('monopropellant_thruster_word', 'monopropellant RCS thruster',
        cc('monopropellant_thruster', 'monopropellant RCS thruster', 'mass_ejection_function', 'titanium_alloy'),
        [mod('quantity', '×16'), mod('capacity', '22', 'N each'),
         mod('form', 'Aerojet MR-103 hydrazine 22 N quad clusters'),
         mod('regulatory', 'AIAA S-080')]),
      word('hydrazine_propellant_tank_word', 'MMH/MON3 propellant tank',
        cc('hydrazine_propellant_tank', 'MMH/MON3 propellant tank', null, 'titanium_alloy'),
        [mod('quantity', '×4'), mod('form', 'PSI 80298 Ti-COPV')]),
      word('pressurant_tank_word', 'pressurant tank',
        cc('pressurant_tank', 'He pressurant tank', null, 'titanium_alloy'),
        [mod('quantity', '×2'), mod('form', 'Ti-6Al-4V high-pressure')]),
    ])

  return {
    module: 'mass_fluid_transport_process',
    module_brief: `All-electric N-S/E-W stationkeeping via ${p.epThrusterCount} Hall thrusters (XR-5/SPT-140 class, ${(p.epThrustN * 1000).toFixed(0)} mN @ Isp ${p.epIspS.toFixed(0)} s) on 2-axis pointing gimbals; chemical apogee kick motor (${p.chemThrustN.toFixed(0)} N MMH/MON3) for orbit raising + safe-mode backup.`,
    overview_paragraph_en: '',
    derived_parameters: { ep_thruster_count: p.epThrusterCount, ep_isp_s: p.epIspS, chem_thrust_n: p.chemThrustN, propellant_mass_kg: p.propellantMassKg },
    allowed_radicals: ['electric_acceleration_function', 'mass_ejection_function', 'mechanical_rotation_function', 'fluid_metering_function', 'titanium_alloy', 'boron_nitride'],
    applicability_confidence: 'high',
    sub_modules: [ep, chem],
  }
}

// MODULE 7: safety_protection
function emitSafetyProtection(_p: GeoComsatParams): DesignModule {
  const safe = makeSubModule('safety_interlocks', 'safety interlocks', 'protects',
    'dual-string safe-arm + thermal trip + cyber air-gap',
    [
      word('pyro_safe_arm_device_word', 'pyrotechnic safe-arm device',
        cc('pyro_safe_arm_device', 'safe-arm device', 'electrical_switching_function', 'aluminium_alloy'),
        [mod('quantity', '×4'), mod('regulatory', 'AFSPCMAN 91-710 V3 dual-string')]),
      word('thermal_runaway_trip_word', 'thermal runaway trip',
        cc('thermal_runaway_trip', 'thermal runaway trip comparator', 'electrical_switching_function', 'silicon_semiconductor_function'),
        [mod('quantity', '×8')]),
      word('cyber_air_gap_word', 'cyber air-gap',
        cc('cyber_air_gap', 'TT&C/payload air-gap separation', 'software_security_function', 'software'),
        [mod('quantity', '×1'), mod('form', 'physical separation + AES-256 SDLS')]),
    ])
  return {
    module: 'safety_protection',
    module_brief: 'Quad-redundant dual-string safe-arm devices guard hypergolic propellant valves; 8 analog thermal-runaway trip comparators isolate battery on over-temperature; physical air-gap separates TT&C from payload command path.',
    overview_paragraph_en: '',
    derived_parameters: { safe_arm_count: 4, thermal_trip_count: 8 },
    allowed_radicals: ['electrical_switching_function', 'software_security_function', 'aluminium_alloy', 'silicon_semiconductor_function'],
    applicability_confidence: 'high',
    sub_modules: [safe],
  }
}

// MODULE 8: structure_containment
function emitStructureContainment(p: GeoComsatParams): DesignModule {
  const structure = makeSubModule('primary_structure', 'primary structure', 'contains',
    'CFRP central tube + N+S panels host transponder farm + radiator',
    [
      word('central_thrust_tube_word', 'central thrust tube',
        cc('central_thrust_tube', 'CFRP central thrust tube', 'mechanical_load_bearing_function', 'cfrp'),
        [mod('quantity', '×1'), mod('form', 'CFRP cylinder Ø1.4m'), mod('regulatory', 'ECSS-E-ST-32-03')]),
      word('north_south_panel_word', 'N+S equipment panel',
        cc('north_south_panel', 'north / south equipment panel', 'mechanical_load_bearing_function', 'aluminium_alloy'),
        [mod('quantity', '×2'), mod('form', 'aluminium honeycomb + CFRP face-sheet'), mod('area', '5', 'm² each')]),
      word('east_west_panel_word', 'E+W equipment panel',
        cc('east_west_panel', 'east / west equipment panel', 'mechanical_load_bearing_function', 'aluminium_alloy'),
        [mod('quantity', '×2'), mod('form', 'CFRP face-sheet')]),
      word('separation_clampband_word', 'separation clampband',
        cc('separation_clampband', 'EELV separation clampband', 'mechanical_release_function', 'aluminium_alloy'),
        [mod('quantity', '×1'), mod('form', '1666 mm bolted clampband'), mod('regulatory', 'EELV SIB')]),
    ])
  return {
    module: 'structure_containment',
    module_brief: `CFRP central thrust tube (Ø1.4 m, ${p.massKg.toFixed(0)} kg load capacity) supports N+S equipment panels (radiator + transponder farm) and E+W panels (battery + EPS); 1666 mm EELV clampband interface.`,
    overview_paragraph_en: '',
    derived_parameters: { thrust_tube_diameter_m: 1.4, separation_clampband_mm: 1666 },
    allowed_radicals: ['mechanical_load_bearing_function', 'mechanical_release_function', 'aluminium_alloy', 'cfrp'],
    applicability_confidence: 'high',
    sub_modules: [structure],
  }
}

// MODULE 9: operator_interface
function emitOperatorInterface(_p: GeoComsatParams): DesignModule {
  const ops = makeSubModule('mission_operations_interface', 'mission operations interface', 'commands',
    '24/7 mission control + payload network management + AKE workflows',
    [
      word('mission_control_software_word', 'mission control software',
        cc('mission_control_software', 'mission control software', 'software_protocol_function', 'software'),
        [mod('quantity', '×1'), mod('form', 'GMV hifly / SES SkyDirector'), mod('regulatory', 'CCSDS 232.0-B-3')]),
      word('payload_network_management_word', 'payload network management',
        cc('payload_network_management', 'payload network management system', 'software_protocol_function', 'software'),
        [mod('quantity', '×1'), mod('form', 'Newtec MDM3100')]),
      word('encryption_module_word', 'encryption module',
        cc('encryption_module', 'CCSDS SDLS encryption', 'software_security_function', 'software'),
        [mod('quantity', '×1'), mod('form', 'AES-256 GCM'), mod('regulatory', 'CCSDS 355.0-B-2')]),
    ])
  return {
    module: 'operator_interface',
    module_brief: 'Mission control via GMV hifly + Newtec payload network management; AES-256 CCSDS SDLS encryption secures TT&C; 24/7 ops centre with redundant satellite control gateways.',
    overview_paragraph_en: '',
    derived_parameters: { encryption_bit_strength: 256 },
    allowed_radicals: ['software_protocol_function', 'software_security_function'],
    applicability_confidence: 'high',
    sub_modules: [ops],
  }
}

// MODULE 10: maintenance_serviceability
function emitMaintenanceServiceability(p: GeoComsatParams): DesignModule {
  const launchInterface = makeSubModule('launch_interface', 'launch interface', 'mates',
    'Ariane 6 / Falcon Heavy / Vulcan launch interface',
    [
      word('clampband_adapter_word', 'clampband adapter',
        cc('clampband_adapter', 'EELV clampband adapter', 'mechanical_load_bearing_function', 'aluminium_alloy'),
        [mod('quantity', '×1'), mod('form', '1666 mm clampband + EBM'), mod('regulatory', 'EELV SIB')]),
      word('umbilical_connector_word', 'umbilical connector',
        cc('umbilical_connector', 'umbilical connector', 'electrical_conducting_function', 'copper'),
        [mod('quantity', '×4'), mod('form', 'MIL-DTL-38999 fly-away')]),
      word('graveyard_disposal_plan_word', 'graveyard disposal plan',
        cc('graveyard_disposal_plan', 'graveyard orbit raise', 'mechanical_release_function', 'documentation'),
        [mod('quantity', '×1'), mod('form', '+250 km supersynchronous'), mod('regulatory', 'ITU-R S.1003')]),
    ])
  return {
    module: 'maintenance_serviceability',
    module_brief: `1666 mm EELV clampband adapter compatible with Ariane 6 / Falcon Heavy / Vulcan; 4 MIL-DTL-38999 umbilicals for ground servicing; EoL graveyard orbit (+250 km supersynchronous) per ITU-R S.1003; ${p.designLifeYears.toFixed(0)}-yr design life.`,
    overview_paragraph_en: '',
    derived_parameters: { clampband_diameter_mm: 1666, design_life_years: p.designLifeYears },
    allowed_radicals: ['mechanical_load_bearing_function', 'mechanical_release_function', 'electrical_conducting_function', 'aluminium_alloy', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [launchInterface],
  }
}

// MODULE 11: transponder_farm — payload (unique to GEO comsat)
function emitTransponderFarm(p: GeoComsatParams): DesignModule {
  const txFarm = makeSubModule('transponder_payload', 'transponder payload', 'amplifies',
    `${p.downlinkDataRateMbps.toFixed(0)} Mbps Ka-band downlink ${p.downlinkEirpDbw.toFixed(1)} dBW EIRP`,
    [
      word('ka_band_transponder_word', 'Ka-band transponder',
        cc('ka_band_transponder', 'Ka-band transponder', 'radio_frequency_function', 'gallium_nitride_semiconductor'),
        [mod('quantity', '×48 channels'), mod('capacity', '300', 'W TWT'),
         mod('form', 'Thales TWTA + EPC'), mod('regulatory', 'ITU-R S.524')]),
      word('low_noise_amplifier_word', 'LNA',
        cc('low_noise_amplifier', 'low-noise amplifier', 'radio_frequency_function', 'gallium_arsenide_semiconductor'),
        [mod('quantity', '×48'), mod('form', 'GaAs HEMT LNA')]),
      word('redundancy_ring_switch_word', 'redundancy ring switch',
        cc('redundancy_ring_switch', 'R-switch ring redundancy', 'radio_frequency_function', 'waveguide_metal'),
        [mod('quantity', '×24'), mod('form', 'Honeywell waveguide R-switch')]),
      word('input_multiplexer_word', 'input multiplexer',
        cc('input_multiplexer', 'input multiplexer', 'radio_frequency_function', 'invar'),
        [mod('quantity', '×4'), mod('form', 'IMUX waveguide')]),
      word('output_multiplexer_word', 'output multiplexer',
        cc('output_multiplexer', 'output multiplexer', 'radio_frequency_function', 'invar'),
        [mod('quantity', '×4'), mod('form', 'OMUX waveguide')]),
    ])
  return {
    module: 'control_compute_communication',  // Map to taxonomy slot; payload is a sub-module
    module_brief: `Ka-band transponder farm: 48 channels with 300 W TWTAs (Thales/L3Harris) on R-switch redundancy ring; total downlink ${p.downlinkDataRateMbps.toFixed(0)} Mbps at ${p.downlinkEirpDbw.toFixed(1)} dBW EIRP with ${p.downlinkMarginDb.toFixed(1)} dB margin.`,
    overview_paragraph_en: '',
    derived_parameters: { transponder_count: 48, eirp_dbw: p.downlinkEirpDbw, data_rate_mbps: p.downlinkDataRateMbps },
    allowed_radicals: ['radio_frequency_function', 'gallium_nitride_semiconductor', 'gallium_arsenide_semiconductor', 'waveguide_metal', 'invar'],
    applicability_confidence: 'high',
    sub_modules: [txFarm],
  }
}

// MODULE 12: deployable_feed_antenna — payload antenna (unique to GEO comsat)
function emitDeployableFeedAntenna(_p: GeoComsatParams): DesignModule {
  const antenna = makeSubModule('deployable_feed_antenna', 'deployable feed antenna', 'shapes',
    '2× 2.6 m deployable Ka-band reflectors + multi-beam feed array',
    [
      word('deployable_reflector_word', 'deployable reflector',
        cc('deployable_reflector', 'deployable mesh reflector', 'radio_frequency_function', 'gold_plated_molybdenum'),
        [mod('quantity', '×2'), mod('dimension', '2.6', 'm aperture'),
         mod('form', 'Northrop Grumman AstroMesh deployable'), mod('regulatory', 'ITU-R BO.652')]),
      word('feed_horn_array_word', 'feed horn array',
        cc('feed_horn_array', 'feed horn cluster', 'radio_frequency_function', 'aluminium_alloy'),
        [mod('quantity', '×128 beams'), mod('form', 'multi-beam feed cluster')]),
      word('antenna_pointing_mechanism_word', 'antenna pointing mechanism',
        cc('antenna_pointing_mechanism', 'antenna pointing mechanism', 'mechanical_rotation_function', 'titanium_alloy'),
        [mod('quantity', '×2'), mod('form', '2-axis APM stepper')]),
      word('hold_down_release_mechanism_word', 'reflector hold-down release mechanism',
        cc('hold_down_release_mechanism', 'reflector hold-down release mechanism', 'mechanical_release_function', 'stainless_steel'),
        [mod('quantity', '×6'), mod('form', 'Ensign-Bickford NEA pin puller')]),
    ])
  return {
    module: 'environmental_interface',  // taxonomy slot — antenna is structural+RF
    module_brief: '2× 2.6 m AstroMesh deployable reflectors with 128-beam feed horn cluster + 2-axis antenna pointing mechanism for high-throughput Ka-band coverage; redundant pin-puller hold-down release.',
    overview_paragraph_en: '',
    derived_parameters: { reflector_count: 2, reflector_aperture_m: 2.6, beam_count: 128 },
    allowed_radicals: ['radio_frequency_function', 'mechanical_rotation_function', 'mechanical_release_function', 'gold_plated_molybdenum', 'aluminium_alloy', 'titanium_alloy', 'stainless_steel'],
    applicability_confidence: 'high',
    sub_modules: [antenna],
  }
}

function emitCrossModuleGrammarLinks(p: GeoComsatParams): unknown[] {
  return [
    { from_module: 'energy_storage_source', to_module: 'energy_conversion_transduction', mechanism: 'dc_bus', type: 'mutual', detail: `${p.bolPowerW.toFixed(0)} W BoL to PCDU` },
    { from_module: 'energy_conversion_transduction', to_module: 'power_distribution', mechanism: 'dc_bus', type: 'mutual', detail: '50V regulated bus' },
    { from_module: 'power_distribution', to_module: 'control_compute_communication', mechanism: 'switched_dc', type: 'directional', detail: 'transponder farm power' },
    { from_module: 'control_compute_communication', to_module: 'mass_fluid_transport_process', mechanism: 'control_signal', type: 'directional', detail: 'EP firing schedule N-S/E-W' },
    { from_module: 'environmental_interface', to_module: 'energy_storage_source', mechanism: 'thermal', type: 'mutual', detail: 'battery + transponder cooling' },
    { from_module: 'safety_protection', to_module: 'mass_fluid_transport_process', mechanism: 'interlock', type: 'directional', detail: 'safe-arm gates apogee kick' },
    { from_module: 'structure_containment', to_module: 'energy_storage_source', mechanism: 'mechanical_mount', type: 'directional', detail: 'solar wings + battery rack' },
    { from_module: 'structure_containment', to_module: 'control_compute_communication', mechanism: 'mechanical_mount', type: 'directional', detail: 'transponder farm on N+S panels' },
    { from_module: 'operator_interface', to_module: 'control_compute_communication', mechanism: 'tc_tm', type: 'mutual', detail: 'CCSDS uplink/downlink' },
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
    emitTransponderFarm(p),
    emitDeployableFeedAntenna(p),
  ]
  return buildDesignJSON(
    modules,
    emitCrossModuleGrammarLinks(p),
    `Deliver a ${(p.totalSystemMassKg / 1000).toFixed(2)} t geostationary communications satellite at 35,786 km with ${p.designLifeYears.toFixed(0)}-year mission life, ${(p.bolPowerW / 1000).toFixed(0)} kW BoL power, 48-channel Ka-band transponder farm (${p.downlinkDataRateMbps.toFixed(0)} Mbps, ${p.downlinkEirpDbw.toFixed(1)} dBW EIRP), and all-electric stationkeeping (${p.epThrusterCount} Hall thrusters @ Isp ${p.epIspS.toFixed(0)} s).`,
  )
}

registerAssembler('satellite_geo_comsat', emit)
