/**
 * scripts/lib/orchestrator/emitters/satellite_cubesat.ts
 *
 * Deterministic emitter for satellite_cubesat (1U-12U, ≤30 kg LEO).
 *
 * Output: 10 modules emitted in canonical 14-module taxonomy slots:
 *   1. energy_storage_source        (battery pack + solar array harvest)
 *   2. energy_conversion_transduction (EPS PCDU + boost converters)
 *   3. control_compute_communication  (OBC + comms + payload data handler)
 *   4. power_distribution             (LCL switches + harness)
 *   5. environmental_interface        (passive thermal + radiator + MLI)
 *   6. mass_fluid_transport_process   (propulsion: cold-gas or iodine Hall)
 *   7. safety_protection              (deployer interlock + ground-link safe-mode)
 *   8. structure_containment          (Al-alloy frame, 1U-12U)
 *   9. operator_interface             (operations interface / TT&C)
 *  10. maintenance_serviceability     (ground-segment + launch interface)
 *
 * Industry references:
 *   - GomSpace NanoMind A3200 (OBC), NanoCom AX100 (UHF TT&C)
 *   - EnduroSat NanoADCS / Blue Canyon RWP015 wheels
 *   - VACCO MEPSI cold-gas / ThrustMe NPT30-I2 iodine Hall thruster
 *   - Spectrolab UTJ GaAs triple-junction solar cells
 *   - EaglePicher NanoSat 18650 li-ion modules
 *   - ISIS QuadPack deployer (PSLV / Falcon 9 rideshare)
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import type { BriefEnvelope, ContractInProgress, ParsedConstraints } from '../types'
import { qs, mod, cc, word, makeSubModule, fmtQty, buildDesignJSON } from './_shared-satellite'

// ---------------------------------------------------------------------------
// PARAMS — derived once from Contract
// ---------------------------------------------------------------------------

interface CubesatParams {
  cubesatU: number
  massKg: number
  altitudeKm: number
  designLifeYears: number
  avgPowerW: number
  bolPowerW: number
  solarArrayAreaM2: number
  solarCellCount: number
  batteryCapacityWh: number
  reactionWheelCount: number
  reactionWheelTorqueNm: number
  coldGasThrustN: number
  coldGasIspS: number
  propellantMassKg: number
  propellantTankVolumeL: number
  hotCaseTempC: number
  coldCaseTempC: number
  mliAreaM2: number
  radiatorAreaM2: number
  totalSystemMassKg: number
  downlinkDataRateMbps: number
  downlinkMarginDb: number
  deorbitLifetimeYears: number
}

function deriveParams(c: ContractInProgress): CubesatParams {
  const cubesatU = Math.max(1, Math.round(qs(c, 'cubesat_u', 3)))
  return {
    cubesatU,
    massKg: qs(c, 'mass_kg', cubesatU * 1.33),
    altitudeKm: qs(c, 'orbital_altitude_km', 500),
    designLifeYears: qs(c, 'design_life_years', 3),
    avgPowerW: qs(c, 'avg_power_w', cubesatU * 5),
    bolPowerW: qs(c, 'bol_power_w', cubesatU * 11),
    solarArrayAreaM2: qs(c, 'solar_array_area_m2', 0.15),
    solarCellCount: Math.round(qs(c, 'solar_cell_count', 50)),
    batteryCapacityWh: qs(c, 'battery_capacity_wh', 50),
    reactionWheelCount: Math.round(qs(c, 'reaction_wheel_count', 3)),
    reactionWheelTorqueNm: qs(c, 'reaction_wheel_torque_nm', 0.002),
    coldGasThrustN: qs(c, 'cold_gas_thrust_n', 0.05),
    coldGasIspS: qs(c, 'cold_gas_isp_s', 70),
    propellantMassKg: qs(c, 'propellant_mass_kg', 0.15),
    propellantTankVolumeL: qs(c, 'propellant_tank_volume_l', 0.3),
    hotCaseTempC: qs(c, 'hot_case_temp_c', 35),
    coldCaseTempC: qs(c, 'cold_case_temp_c', -25),
    mliAreaM2: qs(c, 'mli_area_m2', 0.12),
    radiatorAreaM2: qs(c, 'radiator_area_m2', 0.03),
    totalSystemMassKg: qs(c, 'total_system_mass_kg', cubesatU * 1.33),
    downlinkDataRateMbps: qs(c, 'downlink_data_rate_mbps', 4),
    downlinkMarginDb: qs(c, 'downlink_margin_db', 8),
    deorbitLifetimeYears: qs(c, 'deorbit_lifetime_years', 25),
  }
}

// ---------------------------------------------------------------------------
// 1. ENERGY STORAGE SOURCE — solar array + battery + harvest electronics
// ---------------------------------------------------------------------------
function emitEnergyStorageSource(p: CubesatParams): DesignModule {
  const battCells = Math.max(2, Math.ceil(p.batteryCapacityWh / 12.96))  // 18650 = 3.6V × 3.6Ah = 12.96 Wh per cell
  const solarPanel = makeSubModule(
    'solar_panel_assembly',
    'solar panel assembly',
    'harvests',
    `${p.cubesatU <= 3 ? 'body-mounted' : 'deployable'} GaAs triple-junction array generates ${p.bolPowerW.toFixed(1)} W BoL on ${p.solarArrayAreaM2.toFixed(3)} m²`,
    [
      word(
        'solar_panel_assembly_word',
        'solar panel assembly',
        cc('solar_panel_assembly', 'GaAs triple-junction solar panel', 'photon_capture_function', 'gallium_arsenide_semiconductor'),
        [
          mod('quantity', fmtQty(p.cubesatU <= 3 ? 4 : 6)),
          mod('area', p.solarArrayAreaM2.toFixed(3), 'm²'),
          mod('form', 'Spectrolab UTJ CIC'),
          mod('capacity', p.bolPowerW.toFixed(1), 'W BoL'),
        ],
      ),
      word(
        'solar_cell_word',
        'solar cell',
        cc('solar_cell', 'GaAs triple-junction cell', 'photon_capture_function', 'gallium_arsenide_semiconductor'),
        [
          mod('quantity', fmtQty(p.solarCellCount)),
          mod('dimension', '4.0×7.0', 'cm'),
          mod('regulatory', 'AIAA S-111'),
        ],
      ),
      word(
        'solar_panel_substrate_word',
        'solar panel substrate',
        cc('solar_panel_substrate', 'composite face-sheet panel', null, 'cfrp'),
        [
          mod('quantity', fmtQty(p.cubesatU <= 3 ? 4 : 6)),
          mod('form', 'aluminium honeycomb + CFRP face sheets'),
        ],
      ),
      word(
        'solar_panel_hinge_word',
        'solar panel hinge',
        cc('solar_panel_hinge', 'spring-loaded hinge', 'mechanical_release_function', 'titanium_alloy'),
        [
          mod('quantity', fmtQty(p.cubesatU <= 3 ? 0 : 4)),
          mod('form', 'spring-loaded one-shot'),
        ],
      ),
    ],
  )

  const batteryPack = makeSubModule(
    'battery_pack',
    'battery pack',
    'stores',
    `${p.batteryCapacityWh.toFixed(0)} Wh li-ion at 30% max DoD across ${battCells} 18650 cells`,
    [
      word(
        'lithium_ion_cell_18650_word',
        'lithium-ion 18650 cell',
        cc('lithium_ion_cell_18650', 'space-qualified 18650 li-ion cell', 'electrochemical_energy_function', 'lithium_nickel_manganese_cobalt_oxide'),
        [
          mod('quantity', fmtQty(battCells)),
          mod('capacity', '3.6', 'Ah'),
          mod('dimension', '3.6', 'V'),
          mod('form', 'EaglePicher NanoSat 18650'),
          mod('regulatory', 'JSC-20793'),
        ],
      ),
      word(
        'battery_cell_holder_word',
        'battery cell holder',
        cc('battery_cell_holder', 'cell holder', null, 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(battCells)),
          mod('form', 'PEEK retainer'),
        ],
      ),
      word(
        'battery_thermal_pad_word',
        'battery thermal pad',
        cc('battery_thermal_pad', 'thermal interface pad', 'thermal_transfer_function', 'silicone_thermal_pad'),
        [
          mod('quantity', fmtQty(battCells)),
          mod('form', 'Bergquist Sil-Pad'),
        ],
      ),
    ],
  )

  return {
    module: 'energy_storage_source',
    module_brief: `Generates ${p.bolPowerW.toFixed(1)} W BoL via ${p.solarArrayAreaM2.toFixed(3)} m² GaAs triple-junction solar array (${p.solarCellCount} cells, ${p.cubesatU <= 3 ? 'body-mounted' : 'deployable'}) and stores ${p.batteryCapacityWh.toFixed(0)} Wh in a ${battCells}-cell 18650 li-ion pack at 30% maximum depth-of-discharge.`,
    overview_paragraph_en: '',
    derived_parameters: {
      bol_power_w: p.bolPowerW,
      solar_array_area_m2: p.solarArrayAreaM2,
      battery_capacity_wh: p.batteryCapacityWh,
      cell_count: battCells,
    },
    allowed_radicals: [
      'photon_capture_function',
      'electrochemical_energy_function',
      'gallium_arsenide_semiconductor',
      'lithium_nickel_manganese_cobalt_oxide',
      'cfrp',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [solarPanel, batteryPack],
  }
}

// ---------------------------------------------------------------------------
// 2. ENERGY CONVERSION TRANSDUCTION — EPS PCDU + MPPT
// ---------------------------------------------------------------------------
function emitEnergyConversionTransduction(_p: CubesatParams): DesignModule {
  const pcdu = makeSubModule(
    'eps_pcdu',
    'EPS power-conditioning + distribution unit',
    'regulates',
    'MPPT solar tracking → 3.3 V / 5 V / 12 V regulated buses',
    [
      word(
        'eps_pcdu_module_word',
        'EPS PCDU module',
        cc('eps_pcdu_module', 'EPS PCDU module', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'GomSpace NanoPower P31u'),
          mod('capacity', '30', 'W'),
        ],
      ),
      word(
        'mppt_tracker_word',
        'MPPT tracker',
        cc('mppt_tracker', 'MPPT solar tracker', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×3'),
          mod('form', 'STM32G4 + LT3652'),
          mod('regulatory', 'AIAA S-111'),
        ],
      ),
      word(
        'bus_dc_converter_word',
        'bus DC-DC converter',
        cc('bus_dc_converter', 'point-of-load DC-DC converter', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×3'),
          mod('form', '3.3V/5V/12V LMZ31700'),
          mod('capacity', '7', 'A'),
        ],
      ),
    ],
  )

  return {
    module: 'energy_conversion_transduction',
    module_brief: 'Conditions solar harvest into regulated 3.3 V, 5 V, and 12 V buses via a GomSpace NanoPower P31u-class EPS with 3 MPPT channels and 3 point-of-load converters.',
    overview_paragraph_en: '',
    derived_parameters: { bus_count: 3, mppt_channels: 3, eps_max_power_w: 30 },
    allowed_radicals: ['silicon_semiconductor_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [pcdu],
  }
}

// ---------------------------------------------------------------------------
// 3. CONTROL COMPUTE COMMUNICATION — OBC + ADCS + Comms
// ---------------------------------------------------------------------------
function emitControlComputeCommunication(p: CubesatParams): DesignModule {
  const obc = makeSubModule(
    'on_board_computer',
    'on-board computer',
    'executes',
    'flight software + payload scheduling on Cortex-A9-class SoC',
    [
      word(
        'on_board_computer_word',
        'on-board computer',
        cc('on_board_computer', 'OBC SBC', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'GomSpace NanoMind A3200'),
          mod('capacity', '533', 'MHz Cortex-A9'),
          mod('regulatory', 'ECSS-Q-ST-60'),
        ],
      ),
      word(
        'flash_memory_word',
        'flash memory',
        cc('flash_memory', 'NAND flash memory', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('capacity', '128', 'GB'),
          mod('form', 'redundant SSD'),
        ],
      ),
      word(
        'rad_tolerant_mcu_word',
        'radiation-tolerant MCU',
        cc('rad_tolerant_mcu', 'rad-tolerant MCU watchdog', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Vorago VA10820 (Cortex-M0)'),
          mod('regulatory', 'TID >100 krad'),
        ],
      ),
    ],
  )

  const adcs = makeSubModule(
    'attitude_determination_control',
    'attitude determination + control',
    'controls',
    `3-axis stabilisation via ${p.reactionWheelCount} reaction wheels + 3 magnetorquers + sun-sensors + magnetometer`,
    [
      word(
        'reaction_wheel_assembly_word',
        'reaction wheel assembly',
        cc('reaction_wheel_assembly', 'reaction wheel assembly', 'mechanical_momentum_function', 'aluminium_alloy'),
        [
          mod('quantity', fmtQty(p.reactionWheelCount)),
          mod('capacity', p.reactionWheelTorqueNm.toExponential(2), 'N·m'),
          mod('form', 'Blue Canyon RWP015 / EnduroSat'),
        ],
      ),
      word(
        'magnetorquer_word',
        'magnetorquer',
        cc('magnetorquer', 'air-core magnetorquer rod', 'electromagnetic_actuator_function', 'copper'),
        [
          mod('quantity', '×3'),
          mod('form', 'embedded coil'),
        ],
      ),
      word(
        'sun_sensor_word',
        'sun sensor',
        cc('sun_sensor', 'fine sun sensor', 'optical_sensing_function', 'silicon_semiconductor_function'),
        [
          mod('quantity', '×6'),
          mod('form', 'CubeSpace CSS'),
          mod('tolerance', '±0.5', '°'),
        ],
      ),
      word(
        'magnetometer_word',
        'magnetometer',
        cc('magnetometer', '3-axis magnetometer', 'magnetic_sensing_function', 'silicon_semiconductor_function'),
        [
          mod('quantity', '×2'),
          mod('form', 'PNI RM3100'),
          mod('tolerance', '±50', 'nT'),
        ],
      ),
      word(
        'star_tracker_word',
        'star tracker',
        cc('star_tracker', 'star tracker assembly', 'optical_sensing_function', 'silicon_semiconductor_function'),
        [
          mod('quantity', p.cubesatU >= 3 ? '×2' : '×1'),
          mod('form', 'Sodern Hydra-M / KU Leuven ST200'),
          mod('tolerance', '±10', 'arcsec'),
        ],
      ),
    ],
  )

  const comms = makeSubModule(
    'communications_subsystem',
    'communications subsystem',
    'transmits',
    `S-band downlink ${p.downlinkDataRateMbps.toFixed(1)} Mbps + UHF TT&C beacon ${p.downlinkMarginDb.toFixed(1)} dB margin`,
    [
      word(
        's_band_transceiver_word',
        'S-band transceiver',
        cc('s_band_transceiver', 'S-band transceiver', 'radio_frequency_function', 'gallium_nitride_semiconductor'),
        [
          mod('quantity', '×1'),
          mod('capacity', '2', 'W output'),
          mod('form', 'EnduroSat S-band TXRX'),
          mod('regulatory', 'ITU-R SA.1023'),
        ],
      ),
      word(
        'uhf_transceiver_word',
        'UHF transceiver',
        cc('uhf_transceiver', 'UHF transceiver', 'radio_frequency_function', 'silicon_semiconductor_function'),
        [
          mod('quantity', '×1'),
          mod('form', 'GomSpace NanoCom AX100'),
          mod('capacity', '9.6', 'kbps'),
          mod('regulatory', 'FCC Part 97'),
        ],
      ),
      word(
        'patch_antenna_s_band_word',
        'patch antenna S-band',
        cc('patch_antenna_s_band', 'S-band patch antenna', 'radio_frequency_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('form', 'isoflux patch'),
          mod('capacity', '7', 'dBi'),
        ],
      ),
      word(
        'uhf_dipole_antenna_word',
        'UHF dipole antenna',
        cc('uhf_dipole_antenna', 'deployable UHF dipole', 'radio_frequency_function', 'beryllium_copper'),
        [
          mod('quantity', '×4'),
          mod('form', 'measuring-tape monopole'),
        ],
      ),
    ],
  )

  return {
    module: 'control_compute_communication',
    module_brief: `Executes flight software on a NanoMind A3200 OBC; ADCS provides 3-axis stabilisation via ${p.reactionWheelCount} reaction wheels + 3 magnetorquers + 6 sun-sensors + 2 star-trackers; communications use S-band (${p.downlinkDataRateMbps.toFixed(1)} Mbps) + UHF for TT&C.`,
    overview_paragraph_en: '',
    derived_parameters: { wheel_count: p.reactionWheelCount, data_rate_mbps: p.downlinkDataRateMbps, link_margin_db: p.downlinkMarginDb },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'radio_frequency_function',
      'optical_sensing_function',
      'mechanical_momentum_function',
      'electromagnetic_actuator_function',
      'copper',
      'aluminium_alloy',
    ],
    applicability_confidence: 'high',
    sub_modules: [obc, adcs, comms],
  }
}

// ---------------------------------------------------------------------------
// 4. POWER DISTRIBUTION — harness + LCL switches
// ---------------------------------------------------------------------------
function emitPowerDistribution(_p: CubesatParams): DesignModule {
  const lcls = makeSubModule(
    'power_distribution_harness',
    'power distribution harness',
    'distributes',
    'switched 3.3/5/12 V LCL channels + flat-flex harness',
    [
      word(
        'lcl_switch_word',
        'LCL switch',
        cc('lcl_switch', 'latching current limiter', 'electrical_switching_function', 'silicon_semiconductor_function'),
        [
          mod('quantity', '×8'),
          mod('form', 'INTERSIL ISL71026M'),
          mod('regulatory', 'MIL-PRF-38535'),
        ],
      ),
      word(
        'flat_flex_harness_word',
        'flat-flex harness',
        cc('flat_flex_harness', 'flat-flex harness', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×6'),
          mod('form', 'Kapton flexcircuit'),
          mod('regulatory', 'NASA-STD-8739'),
        ],
      ),
    ],
  )

  return {
    module: 'power_distribution',
    module_brief: 'Distributes regulated bus voltages via 8 latching current limiters and Kapton flat-flex harness; trip thresholds protect downstream loads from over-current.',
    overview_paragraph_en: '',
    derived_parameters: { lcl_channel_count: 8 },
    allowed_radicals: ['electrical_switching_function', 'electrical_conducting_function', 'copper', 'silicon_semiconductor_function'],
    applicability_confidence: 'high',
    sub_modules: [lcls],
  }
}

// ---------------------------------------------------------------------------
// 5. ENVIRONMENTAL INTERFACE — MLI + radiator + thermal strap
// ---------------------------------------------------------------------------
function emitEnvironmentalInterface(p: CubesatParams): DesignModule {
  const passiveThermal = makeSubModule(
    'passive_thermal',
    'passive thermal control',
    'manages',
    `MLI on ${p.mliAreaM2.toFixed(3)} m² + radiator ${p.radiatorAreaM2.toFixed(3)} m² maintain ${p.coldCaseTempC.toFixed(0)}…${p.hotCaseTempC.toFixed(0)}°C`,
    [
      word(
        'mli_thermal_blanket_word',
        'MLI thermal blanket',
        cc('mli_thermal_blanket', 'multi-layer insulation blanket', 'thermal_insulation_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1 blanket'),
          mod('area', p.mliAreaM2.toFixed(3), 'm²'),
          mod('form', '8-layer Mylar/Kapton'),
          mod('regulatory', 'ECSS-Q-ST-70-71'),
        ],
      ),
      word(
        'optical_solar_reflector_word',
        'optical solar reflector',
        cc('optical_solar_reflector', 'OSR coating', 'thermal_radiation_function', 'silver'),
        [
          mod('quantity', '×1 panel'),
          mod('area', p.radiatorAreaM2.toFixed(3), 'm²'),
          mod('form', 'Optical Coating Lab OSR'),
        ],
      ),
      word(
        'thermal_strap_word',
        'thermal strap',
        cc('thermal_strap', 'flexible copper thermal strap', 'thermal_transfer_function', 'copper'),
        [
          mod('quantity', '×4'),
          mod('form', 'TAI flexible braid'),
        ],
      ),
      word(
        'survival_heater_word',
        'survival heater',
        cc('survival_heater', 'thin-film survival heater', 'thermal_emission_function', 'nichrome'),
        [
          mod('quantity', '×6'),
          mod('capacity', '2', 'W each'),
          mod('form', 'Minco HK5160'),
        ],
      ),
    ],
  )

  return {
    module: 'environmental_interface',
    module_brief: `Passive thermal control maintains the OBC + battery between ${p.coldCaseTempC.toFixed(0)}°C (eclipse) and ${p.hotCaseTempC.toFixed(0)}°C (full sun) using ${p.mliAreaM2.toFixed(3)} m² 8-layer MLI, ${p.radiatorAreaM2.toFixed(3)} m² OSR radiator coating, 4 copper braid thermal straps, and 6 survival heaters totalling 12 W.`,
    overview_paragraph_en: '',
    derived_parameters: { mli_area_m2: p.mliAreaM2, radiator_area_m2: p.radiatorAreaM2, hot_case_c: p.hotCaseTempC, cold_case_c: p.coldCaseTempC },
    allowed_radicals: ['thermal_insulation_function', 'thermal_radiation_function', 'thermal_transfer_function', 'thermal_emission_function', 'polymer_thermoplastic', 'copper', 'silver', 'nichrome'],
    applicability_confidence: 'high',
    sub_modules: [passiveThermal],
  }
}

// ---------------------------------------------------------------------------
// 6. MASS FLUID TRANSPORT PROCESS — propulsion
// ---------------------------------------------------------------------------
function emitMassFluidTransportProcess(p: CubesatParams): DesignModule {
  const propulsion = makeSubModule(
    'propulsion_subsystem',
    'propulsion subsystem',
    'imparts',
    `${p.coldGasThrustN.toFixed(3)} N cold-gas + ${p.propellantMassKg.toFixed(2)} kg butane → ${(p.coldGasIspS).toFixed(0)} s Isp`,
    [
      word(
        'cold_gas_thruster_assembly_word',
        'cold-gas thruster assembly',
        cc('cold_gas_thruster_assembly', 'cold-gas thruster nozzle', 'mass_ejection_function', 'titanium_alloy'),
        [
          mod('quantity', '×4'),
          mod('capacity', p.coldGasThrustN.toFixed(3), 'N'),
          mod('form', 'VACCO MEPSI / Hyperion PM200'),
          mod('regulatory', 'ECSS-E-ST-35-06'),
        ],
      ),
      word(
        'propellant_tank_word',
        'propellant tank',
        cc('propellant_tank', 'butane storage tank', null, 'aluminium_alloy'),
        [
          mod('quantity', '×1'),
          mod('capacity', p.propellantTankVolumeL.toFixed(2), 'L'),
          mod('form', 'Al-6061-T6 COPV'),
          mod('regulatory', 'AIAA S-080'),
        ],
      ),
      word(
        'propellant_isolation_valve_word',
        'propellant isolation valve',
        cc('propellant_isolation_valve', 'pyrotechnic isolation valve', 'mechanical_release_function', 'stainless_steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'VACCO miniature pyrovalve'),
        ],
      ),
      word(
        'propellant_pressure_transducer_word',
        'propellant pressure transducer',
        cc('propellant_pressure_transducer', 'pressure transducer', 'pressure_sensing_function', 'silicon_semiconductor_function'),
        [
          mod('quantity', '×2'),
          mod('tolerance', '±0.1', 'bar'),
        ],
      ),
    ],
  )

  return {
    module: 'mass_fluid_transport_process',
    module_brief: `Provides ${p.coldGasThrustN.toFixed(3)} N thrust × 4 nozzles with Isp ${p.coldGasIspS.toFixed(0)} s using ${p.propellantMassKg.toFixed(2)} kg of butane in a ${p.propellantTankVolumeL.toFixed(2)} L Al-6061 COPV tank, dispensed by a single pyrotechnic isolation valve.`,
    overview_paragraph_en: '',
    derived_parameters: { thrust_n: p.coldGasThrustN, isp_s: p.coldGasIspS, propellant_mass_kg: p.propellantMassKg, tank_volume_l: p.propellantTankVolumeL },
    allowed_radicals: ['mass_ejection_function', 'mechanical_release_function', 'pressure_sensing_function', 'aluminium_alloy', 'titanium_alloy', 'stainless_steel'],
    applicability_confidence: 'high',
    sub_modules: [propulsion],
  }
}

// ---------------------------------------------------------------------------
// 7. SAFETY PROTECTION — deployer interlock + ground-link safe-mode
// ---------------------------------------------------------------------------
function emitSafetyProtection(_p: CubesatParams): DesignModule {
  const safetyInterlocks = makeSubModule(
    'safety_interlocks',
    'safety interlocks',
    'protects',
    'separation switches gate power-up; battery isolation until orbit',
    [
      word(
        'separation_switch_word',
        'separation switch',
        cc('separation_switch', 'deployer separation switch', 'electrical_switching_function', 'stainless_steel'),
        [
          mod('quantity', '×3'),
          mod('form', 'redundant micro-switch'),
          mod('regulatory', 'CDS Rev 14.1'),
        ],
      ),
      word(
        'remove_before_flight_pin_word',
        'remove-before-flight pin',
        cc('remove_before_flight_pin', 'remove-before-flight pin', 'mechanical_release_function', 'stainless_steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'RBF flag'),
        ],
      ),
      word(
        'pyro_safe_arm_device_word',
        'pyro safe-arm device',
        cc('pyro_safe_arm_device', 'safe-arm device', 'electrical_switching_function', 'aluminium_alloy'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'AFSPCMAN 91-710 V3'),
        ],
      ),
    ],
  )

  return {
    module: 'safety_protection',
    module_brief: 'Three redundant separation switches gate primary power until ejected from the deployer; a Remove-Before-Flight pin provides ground safing, and a safe-arm device protects pyrotechnic isolation valves through launch.',
    overview_paragraph_en: '',
    derived_parameters: { separation_switch_count: 3, rbf_pin_count: 1 },
    allowed_radicals: ['electrical_switching_function', 'mechanical_release_function', 'stainless_steel', 'aluminium_alloy'],
    applicability_confidence: 'high',
    sub_modules: [safetyInterlocks],
  }
}

// ---------------------------------------------------------------------------
// 8. STRUCTURE CONTAINMENT — Al-alloy frame
// ---------------------------------------------------------------------------
function emitStructureContainment(p: CubesatParams): DesignModule {
  const structure = makeSubModule(
    'primary_structure',
    'primary structure',
    'contains',
    `${p.cubesatU}U Al-6061 chassis (${(p.cubesatU * 0.15).toFixed(2)} kg) with PC/104 internal stack`,
    [
      word(
        'cubesat_chassis_word',
        'CubeSat chassis',
        cc('cubesat_chassis', `${p.cubesatU}U CubeSat chassis`, 'mechanical_load_bearing_function', 'aluminium_alloy'),
        [
          mod('quantity', '×1'),
          mod('dimension', `${(10 * Math.cbrt(p.cubesatU)).toFixed(1)}×10×${10 * p.cubesatU}`, 'cm'),
          mod('form', 'machined Al-6061-T6'),
          mod('regulatory', 'CDS Rev 14.1'),
        ],
      ),
      word(
        'pc104_stack_word',
        'PC/104 stack',
        cc('pc104_stack', 'PC/104 internal board stack', 'electrical_conducting_function', 'pcb_substrate'),
        [
          mod('quantity', `×${Math.max(4, p.cubesatU * 2)}`),
          mod('form', 'M3 standoff stack'),
          mod('regulatory', 'IPC-6011'),
        ],
      ),
      word(
        'deployable_solar_panel_hinge_word',
        'deployable solar panel hinge',
        cc('deployable_solar_panel_hinge', 'deployable solar panel hinge', 'mechanical_release_function', 'titanium_alloy'),
        [
          mod('quantity', p.cubesatU <= 3 ? '×0' : '×4'),
          mod('form', 'tape-spring hinge'),
        ],
      ),
      word(
        'launch_rail_word',
        'launch rail',
        cc('launch_rail', 'launch rail', 'mechanical_load_bearing_function', 'aluminium_alloy'),
        [
          mod('quantity', '×4'),
          mod('dimension', `${10 * p.cubesatU}`, 'cm'),
          mod('regulatory', 'CDS Rev 14.1 §3.1'),
        ],
      ),
    ],
  )

  return {
    module: 'structure_containment',
    module_brief: `Machined Al-6061-T6 ${p.cubesatU}U chassis (${(p.cubesatU * 0.15).toFixed(2)} kg, ${(10 * p.cubesatU).toFixed(0)} cm height) houses a PC/104 internal stack and ${p.cubesatU <= 3 ? 'body-mounted' : '4 deployable'} solar panels; 4 corner launch rails interface with the deployer.`,
    overview_paragraph_en: '',
    derived_parameters: { cubesat_u: p.cubesatU, chassis_mass_kg: p.cubesatU * 0.15, pc104_count: Math.max(4, p.cubesatU * 2) },
    allowed_radicals: ['mechanical_load_bearing_function', 'mechanical_release_function', 'electrical_conducting_function', 'aluminium_alloy', 'titanium_alloy', 'pcb_substrate'],
    applicability_confidence: 'high',
    sub_modules: [structure],
  }
}

// ---------------------------------------------------------------------------
// 9. OPERATOR INTERFACE — TT&C ground interface
// ---------------------------------------------------------------------------
function emitOperatorInterface(_p: CubesatParams): DesignModule {
  const opsInterface = makeSubModule(
    'operations_interface',
    'operations interface',
    'commands',
    'CCSDS telecommand uplink + telemetry downlink at scheduled passes',
    [
      word(
        'ground_command_interface_word',
        'ground command interface',
        cc('ground_command_interface', 'CCSDS TC/TM software', 'software_protocol_function', 'software'),
        [
          mod('quantity', '×1'),
          mod('form', 'GomSpace MCS'),
          mod('regulatory', 'CCSDS 232.0-B-3'),
        ],
      ),
      word(
        'encryption_module_word',
        'encryption module',
        cc('encryption_module', 'CCSDS SDLS encryption', 'software_security_function', 'software'),
        [
          mod('quantity', '×1'),
          mod('form', 'AES-256 GCM'),
          mod('regulatory', 'CCSDS 355.0-B-2'),
        ],
      ),
    ],
  )

  return {
    module: 'operator_interface',
    module_brief: 'Operations interface exposes CCSDS telecommand uplink and telemetry downlink via GomSpace MCS; AES-256 GCM CCSDS SDLS encryption secures the ground link.',
    overview_paragraph_en: '',
    derived_parameters: { tc_protocol: 1, encryption_bit_strength: 256 },
    allowed_radicals: ['software_protocol_function', 'software_security_function'],
    applicability_confidence: 'high',
    sub_modules: [opsInterface],
  }
}

// ---------------------------------------------------------------------------
// 10. MAINTENANCE SERVICEABILITY — ground-segment + launch interface
// ---------------------------------------------------------------------------
function emitMaintenanceServiceability(p: CubesatParams): DesignModule {
  const launchInterface = makeSubModule(
    'launch_interface',
    'launch interface',
    'mates',
    `ISIS QuadPack deployer compatible; ${p.deorbitLifetimeYears.toFixed(0)}-yr passive deorbit`,
    [
      word(
        'deployer_interface_word',
        'deployer interface',
        cc('deployer_interface', 'deployer interface', 'mechanical_load_bearing_function', 'aluminium_alloy'),
        [
          mod('quantity', '×1'),
          mod('form', 'ISIS QuadPack / Tyvak P-POD'),
          mod('regulatory', 'CDS Rev 14.1'),
        ],
      ),
      word(
        'umbilical_connector_word',
        'umbilical connector',
        cc('umbilical_connector', 'umbilical connector', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('form', 'Glenair MIL-DTL-38999'),
        ],
      ),
      word(
        'deorbit_device_word',
        'deorbit device',
        cc('deorbit_device', 'passive drag deorbit sail', 'mechanical_release_function', 'polymer_thermoplastic'),
        [
          mod('quantity', p.altitudeKm > 600 ? '×1' : '×0'),
          mod('form', 'CubeSail / ADEO drag-sail'),
          mod('regulatory', 'IADC 21.1'),
        ],
      ),
    ],
  )

  return {
    module: 'maintenance_serviceability',
    module_brief: `ISIS QuadPack-compatible launch interface with umbilical connector for ground charging${p.altitudeKm > 600 ? '; passive drag-sail deorbit device ensures < 25-yr de-orbit per IADC' : '; natural decay at this altitude is < 25 yr'}.`,
    overview_paragraph_en: '',
    derived_parameters: { altitude_km: p.altitudeKm, deorbit_years: p.deorbitLifetimeYears },
    allowed_radicals: ['mechanical_load_bearing_function', 'mechanical_release_function', 'electrical_conducting_function', 'aluminium_alloy', 'copper', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [launchInterface],
  }
}

// ---------------------------------------------------------------------------
// CROSS-MODULE GRAMMAR LINKS
// ---------------------------------------------------------------------------
function emitCrossModuleGrammarLinks(p: CubesatParams): unknown[] {
  return [
    { from_module: 'energy_storage_source', to_module: 'energy_conversion_transduction', mechanism: 'dc_bus', type: 'mutual', detail: `${p.bolPowerW.toFixed(0)} W BoL to PCDU` },
    { from_module: 'energy_conversion_transduction', to_module: 'power_distribution', mechanism: 'dc_bus', type: 'mutual', detail: '3.3/5/12 V regulated buses to LCL switches' },
    { from_module: 'power_distribution', to_module: 'control_compute_communication', mechanism: 'switched_dc', type: 'directional', detail: 'OBC + ADCS + comms loads' },
    { from_module: 'control_compute_communication', to_module: 'mass_fluid_transport_process', mechanism: 'control_signal', type: 'directional', detail: 'OBC commands cold-gas firing' },
    { from_module: 'environmental_interface', to_module: 'energy_storage_source', mechanism: 'thermal', type: 'mutual', detail: 'battery thermal pad + survival heater' },
    { from_module: 'safety_protection', to_module: 'energy_storage_source', mechanism: 'interlock', type: 'directional', detail: 'separation switch gates battery output' },
    { from_module: 'structure_containment', to_module: 'energy_storage_source', mechanism: 'mechanical_mount', type: 'directional', detail: 'PC/104 stack mounts battery + EPS' },
    { from_module: 'structure_containment', to_module: 'mass_fluid_transport_process', mechanism: 'mechanical_mount', type: 'directional', detail: 'thruster bracket' },
    { from_module: 'operator_interface', to_module: 'control_compute_communication', mechanism: 'tc_tm', type: 'mutual', detail: 'CCSDS uplink/downlink' },
    { from_module: 'maintenance_serviceability', to_module: 'structure_containment', mechanism: 'mechanical_interface', type: 'mutual', detail: 'deployer rails + umbilical' },
  ]
}

// ---------------------------------------------------------------------------
// EMITTER ENTRY POINT
// ---------------------------------------------------------------------------
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
  ]
  return buildDesignJSON(
    modules,
    emitCrossModuleGrammarLinks(p),
    `Deliver a ${p.cubesatU}U CubeSat (${p.totalSystemMassKg.toFixed(1)} kg) on a ${p.altitudeKm.toFixed(0)} km LEO orbit with ${p.designLifeYears.toFixed(0)}-year design life, ${p.avgPowerW.toFixed(1)} W average power, ${p.downlinkDataRateMbps.toFixed(1)} Mbps S-band downlink, and IADC-compliant ${p.deorbitLifetimeYears.toFixed(0)}-year deorbit.`,
  )
}

registerAssembler('satellite_cubesat', emit)
