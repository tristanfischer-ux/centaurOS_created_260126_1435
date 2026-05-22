/**
 * scripts/lib/orchestrator/emitters/satellite_smallsat.ts
 *
 * Deterministic emitter for satellite_smallsat (50-500 kg ESPA-class).
 *
 * 10 modules:
 *   1. energy_storage_source        (deployable solar array + Li-ion battery)
 *   2. energy_conversion_transduction (EPS PCDU with redundant strings)
 *   3. control_compute_communication  (OBC + ADCS + X-band/S-band comms)
 *   4. power_distribution             (LCL + harness + breaker network)
 *   5. environmental_interface        (radiator + heat pipes + MLI)
 *   6. mass_fluid_transport_process   (electric propulsion + hydrazine backup)
 *   7. safety_protection              (deployer interlocks + thermal trips)
 *   8. structure_containment          (Al/CFRP hexagonal bus)
 *   9. operator_interface             (mission ops centre interface)
 *  10. maintenance_serviceability     (ESPA ring adapter + drag sail / EOL deorbit)
 *
 * Industry references:
 *   - SpaceX Starlink v2 bus (~300 kg)
 *   - Lockheed Martin LM-50 / LM-100 bus
 *   - Planet Pelican (50 kg) / Capella Whitney (165 kg SAR)
 *   - Iceye Generation 3 (85 kg SAR)
 *   - Sun Aurora-class bus
 *   - Busek BHT-200 Hall thruster (electric prop)
 *   - Aerojet MR-103 monoprop thruster (chemical backup)
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import type { BriefEnvelope, ContractInProgress, ParsedConstraints } from '../types'
import { qs, mod, cc, word, makeSubModule, fmtQty, buildDesignJSON } from './_shared-satellite'

interface SmallsatParams {
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
  reactionWheelMomentumNms: number
  epThrustN: number
  epIspS: number
  epPowerW: number
  chemThrustN: number
  chemIspS: number
  propellantMassKg: number
  propellantTankVolumeL: number
  hotCaseTempC: number
  coldCaseTempC: number
  mliAreaM2: number
  radiatorAreaM2: number
  heatPipeCount: number
  totalSystemMassKg: number
  downlinkDataRateMbps: number
  downlinkMarginDb: number
  deorbitLifetimeYears: number
}

function deriveParams(c: ContractInProgress): SmallsatParams {
  return {
    massKg: qs(c, 'mass_kg', 150),
    altitudeKm: qs(c, 'orbital_altitude_km', 600),
    designLifeYears: qs(c, 'design_life_years', 5),
    avgPowerW: qs(c, 'avg_power_w', 400),
    bolPowerW: qs(c, 'bol_power_w', 1000),
    solarArrayAreaM2: qs(c, 'solar_array_area_m2', 3.0),
    solarCellCount: Math.round(qs(c, 'solar_cell_count', 1100)),
    batteryCapacityWh: qs(c, 'battery_capacity_wh', 1200),
    reactionWheelCount: Math.round(qs(c, 'reaction_wheel_count', 4)),
    reactionWheelTorqueNm: qs(c, 'reaction_wheel_torque_nm', 0.025),
    reactionWheelMomentumNms: qs(c, 'reaction_wheel_momentum_nms', 0.4),
    epThrustN: qs(c, 'ep_thrust_n', 0.025),
    epIspS: qs(c, 'ep_isp_s', 1500),
    epPowerW: qs(c, 'ep_power_w', 250),
    chemThrustN: qs(c, 'chem_thrust_n', 1.0),
    chemIspS: qs(c, 'chem_isp_s', 220),
    propellantMassKg: qs(c, 'propellant_mass_kg', 2.5),
    propellantTankVolumeL: qs(c, 'propellant_tank_volume_l', 1.8),
    hotCaseTempC: qs(c, 'hot_case_temp_c', 38),
    coldCaseTempC: qs(c, 'cold_case_temp_c', -25),
    mliAreaM2: qs(c, 'mli_area_m2', 4),
    radiatorAreaM2: qs(c, 'radiator_area_m2', 1.5),
    heatPipeCount: Math.round(qs(c, 'heat_pipe_count', 4)),
    totalSystemMassKg: qs(c, 'total_system_mass_kg', 145),
    downlinkDataRateMbps: qs(c, 'downlink_data_rate_mbps', 250),
    downlinkMarginDb: qs(c, 'downlink_margin_db', 7.5),
    deorbitLifetimeYears: qs(c, 'deorbit_lifetime_years', 18),
  }
}

// ---------------------------------------------------------------------------
// 1. ENERGY STORAGE SOURCE
// ---------------------------------------------------------------------------
function emitEnergyStorageSource(p: SmallsatParams): DesignModule {
  const battModules = Math.max(2, Math.ceil(p.batteryCapacityWh / 250))
  const solar = makeSubModule(
    'deployable_solar_array',
    'deployable solar array',
    'harvests',
    `2× deployable wings × ${(p.solarArrayAreaM2 / 2).toFixed(2)} m² generate ${p.bolPowerW.toFixed(0)} W BoL`,
    [
      word(
        'solar_panel_assembly_word',
        'solar panel assembly',
        cc('solar_panel_assembly', 'GaAs triple-junction solar panel', 'photon_capture_function', 'gallium_arsenide_semiconductor'),
        [
          mod('quantity', '×2 wings'),
          mod('area', p.solarArrayAreaM2.toFixed(2), 'm² total'),
          mod('form', 'Spectrolab UTJ on CFRP substrate'),
          mod('capacity', p.bolPowerW.toFixed(0), 'W BoL'),
        ],
      ),
      word(
        'solar_cell_word',
        'solar cell',
        cc('solar_cell', 'GaAs triple-junction cell', 'photon_capture_function', 'gallium_arsenide_semiconductor'),
        [
          mod('quantity', fmtQty(p.solarCellCount)),
          mod('dimension', '40×80', 'mm'),
          mod('regulatory', 'AIAA S-111'),
        ],
      ),
      word(
        'solar_array_yoke_word',
        'solar array yoke',
        cc('solar_array_yoke', 'solar array yoke', 'mechanical_load_bearing_function', 'cfrp'),
        [
          mod('quantity', '×2'),
          mod('form', 'CFRP truss'),
        ],
      ),
      word(
        'solar_array_drive_word',
        'solar array drive mechanism',
        cc('solar_array_drive', 'solar array drive mechanism', 'mechanical_rotation_function', 'titanium_alloy'),
        [
          mod('quantity', '×2'),
          mod('form', 'MOOG SADM stepper-driven'),
          mod('regulatory', 'ECSS-E-ST-33-01'),
        ],
      ),
      word(
        'solar_array_hold_down_word',
        'solar array hold-down release mechanism',
        cc('solar_array_hold_down', 'pin puller hold-down release', 'mechanical_release_function', 'stainless_steel'),
        [
          mod('quantity', '×4'),
          mod('form', 'Ensign-Bickford pin puller'),
        ],
      ),
    ],
  )

  const battery = makeSubModule(
    'battery_pack',
    'battery pack',
    'stores',
    `${p.batteryCapacityWh.toFixed(0)} Wh li-ion across ${battModules} modules (25% max DoD)`,
    [
      word(
        'lithium_ion_battery_module_word',
        'lithium-ion battery module',
        cc('lithium_ion_battery_module', 'li-ion battery module', 'electrochemical_energy_function', 'lithium_nickel_manganese_cobalt_oxide'),
        [
          mod('quantity', fmtQty(battModules)),
          mod('capacity', (p.batteryCapacityWh / battModules).toFixed(0), 'Wh'),
          mod('form', 'Saft VL30P / EnerSys ABSL'),
          mod('regulatory', 'JSC-20793 + ECSS-E-ST-20'),
        ],
      ),
      word(
        'battery_management_unit_word',
        'battery management unit',
        cc('battery_management_unit', 'BMU', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('form', 'cold-redundant pair'),
        ],
      ),
      word(
        'battery_isolation_relay_word',
        'battery isolation relay',
        cc('battery_isolation_relay', 'battery isolation relay', 'electrical_switching_function', 'silicon_semiconductor_function'),
        [
          mod('quantity', '×2'),
          mod('form', 'Sensitron MIL-PRF-39016'),
        ],
      ),
    ],
  )

  return {
    module: 'energy_storage_source',
    module_brief: `Generates ${p.bolPowerW.toFixed(0)} W BoL via 2× deployable wings (${p.solarArrayAreaM2.toFixed(2)} m² GaAs triple-junction) and stores ${p.batteryCapacityWh.toFixed(0)} Wh in ${battModules} Saft VL30P-class li-ion modules with cold-redundant BMU.`,
    overview_paragraph_en: '',
    derived_parameters: {
      bol_power_w: p.bolPowerW,
      solar_array_area_m2: p.solarArrayAreaM2,
      battery_capacity_wh: p.batteryCapacityWh,
      battery_modules: battModules,
    },
    allowed_radicals: ['photon_capture_function', 'electrochemical_energy_function', 'gallium_arsenide_semiconductor', 'lithium_nickel_manganese_cobalt_oxide', 'cfrp'],
    applicability_confidence: 'high',
    sub_modules: [solar, battery],
  }
}

// ---------------------------------------------------------------------------
// 2. ENERGY CONVERSION TRANSDUCTION
// ---------------------------------------------------------------------------
function emitEnergyConversionTransduction(p: SmallsatParams): DesignModule {
  const eps = makeSubModule(
    'electrical_power_subsystem',
    'electrical power subsystem',
    'regulates',
    `unregulated bus 22-34 V from solar; conditioned 28 V + 12 V + 5 V buses; ${p.bolPowerW.toFixed(0)} W BoL → ${p.avgPowerW.toFixed(0)} W avg`,
    [
      word(
        'eps_pcdu_module_word',
        'EPS PCDU module',
        cc('eps_pcdu_module', 'EPS power conditioning + distribution unit', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'TERMA EPS / ÅAC Clyde KRYTEN'),
          mod('capacity', '1.5', 'kW'),
          mod('regulatory', 'MIL-STD-461'),
        ],
      ),
      word(
        'mppt_regulator_word',
        'MPPT regulator',
        cc('mppt_regulator', 'MPPT solar regulator', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×6 strings'),
          mod('form', 'sequential switching shunt regulator (SSSR)'),
        ],
      ),
      word(
        'bus_regulator_28v_word',
        '28 V bus regulator',
        cc('bus_regulator_28v', '28 V regulator', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('form', 'hot-redundant'),
        ],
      ),
    ],
  )

  return {
    module: 'energy_conversion_transduction',
    module_brief: `Conditions solar harvest into regulated 28 V / 12 V / 5 V buses with ${p.bolPowerW.toFixed(0)} W peak capability via a TERMA-class EPS PCDU and 6-string MPPT regulator + hot-redundant 28 V regulators.`,
    overview_paragraph_en: '',
    derived_parameters: { bus_count: 3, mppt_strings: 6, eps_peak_w: p.bolPowerW },
    allowed_radicals: ['silicon_semiconductor_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [eps],
  }
}

// ---------------------------------------------------------------------------
// 3. CONTROL COMPUTE COMMUNICATION
// ---------------------------------------------------------------------------
function emitControlComputeCommunication(p: SmallsatParams): DesignModule {
  const obc = makeSubModule(
    'on_board_computer',
    'on-board computer',
    'executes',
    'flight software on rad-hard LEON3 + payload data handler on FPGA',
    [
      word(
        'on_board_computer_word',
        'on-board computer',
        cc('on_board_computer', 'OBC rad-hard SoC', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('form', 'cold-redundant LEON3 / Cobham GR740'),
          mod('regulatory', 'ECSS-Q-ST-60 + TID 300 krad'),
        ],
      ),
      word(
        'mass_memory_unit_word',
        'mass memory unit',
        cc('mass_memory_unit', 'mass memory unit', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', '256', 'GB'),
          mod('form', 'rad-hardened NAND array'),
        ],
      ),
      word(
        'payload_data_handler_fpga_word',
        'payload data handler FPGA',
        cc('payload_data_handler_fpga', 'payload data handler FPGA', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Xilinx Kintex UltraScale KU060 (rad-hard)'),
        ],
      ),
    ],
  )

  const adcs = makeSubModule(
    'attitude_determination_control',
    'attitude determination + control',
    'controls',
    `4 reaction wheels (pyramidal) + 3 magnetorquers + 2 star trackers + IMU achieve <0.05° pointing`,
    [
      word(
        'reaction_wheel_assembly_word',
        'reaction wheel assembly',
        cc('reaction_wheel_assembly', 'reaction wheel assembly', 'mechanical_momentum_function', 'aluminium_alloy'),
        [
          mod('quantity', fmtQty(p.reactionWheelCount)),
          mod('capacity', p.reactionWheelTorqueNm.toFixed(3), 'N·m'),
          mod('form', 'Honeywell HR12 / Bradford W18'),
        ],
      ),
      word(
        'magnetorquer_rod_word',
        'magnetorquer rod',
        cc('magnetorquer_rod', 'magnetorquer rod', 'electromagnetic_actuator_function', 'copper'),
        [
          mod('quantity', '×3'),
          mod('form', 'air-core rod'),
        ],
      ),
      word(
        'star_tracker_word',
        'star tracker',
        cc('star_tracker', 'star tracker', 'optical_sensing_function', 'silicon_semiconductor_function'),
        [
          mod('quantity', '×2'),
          mod('form', 'Sodern Hydra / Jena-Optronik ASTRO 15'),
          mod('tolerance', '±2', 'arcsec'),
        ],
      ),
      word(
        'imu_word',
        'IMU',
        cc('imu', 'inertial measurement unit', 'mechanical_sensing_function', 'silicon_semiconductor_function'),
        [
          mod('quantity', '×1'),
          mod('form', 'Honeywell HG1700'),
        ],
      ),
      word(
        'sun_sensor_word',
        'sun sensor',
        cc('sun_sensor', 'fine sun sensor', 'optical_sensing_function', 'silicon_semiconductor_function'),
        [
          mod('quantity', '×6'),
          mod('form', 'BAE Systems SLS400'),
        ],
      ),
    ],
  )

  const comms = makeSubModule(
    'communications_subsystem',
    'communications subsystem',
    'transmits',
    `X-band downlink ${p.downlinkDataRateMbps.toFixed(0)} Mbps + S-band TT&C with ${p.downlinkMarginDb.toFixed(1)} dB margin`,
    [
      word(
        'x_band_transmitter_word',
        'X-band transmitter',
        cc('x_band_transmitter', 'X-band downlink transmitter', 'radio_frequency_function', 'gallium_nitride_semiconductor'),
        [
          mod('quantity', '×1'),
          mod('capacity', '15', 'W'),
          mod('form', 'Syrlinks XTX-9'),
          mod('regulatory', 'ITU-R SA.1023'),
        ],
      ),
      word(
        's_band_transceiver_word',
        'S-band transceiver',
        cc('s_band_transceiver', 'S-band TT&C transceiver', 'radio_frequency_function', 'silicon_semiconductor_function'),
        [
          mod('quantity', '×2'),
          mod('form', 'redundant Surrey SSC-23'),
          mod('capacity', '2', 'W'),
        ],
      ),
      word(
        'x_band_high_gain_antenna_word',
        'X-band high-gain antenna',
        cc('x_band_high_gain_antenna', 'X-band parabolic high-gain antenna', 'radio_frequency_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('dimension', '0.3', 'm dish'),
          mod('capacity', '32', 'dBi'),
        ],
      ),
      word(
        's_band_isoflux_antenna_word',
        'S-band isoflux antenna',
        cc('s_band_isoflux_antenna', 'S-band isoflux patch antenna', 'radio_frequency_function', 'copper'),
        [
          mod('quantity', '×2'),
          mod('form', 'hemispherical isoflux'),
        ],
      ),
    ],
  )

  return {
    module: 'control_compute_communication',
    module_brief: `Flight software on cold-redundant LEON3 OBC + Xilinx UltraScale FPGA payload data handler; ADCS pyramidal 4-wheel + 3-magnetorquer + 2-star-tracker achieves <0.05° pointing; X-band downlink ${p.downlinkDataRateMbps.toFixed(0)} Mbps + redundant S-band TT&C.`,
    overview_paragraph_en: '',
    derived_parameters: { wheel_count: p.reactionWheelCount, data_rate_mbps: p.downlinkDataRateMbps, link_margin_db: p.downlinkMarginDb },
    allowed_radicals: ['silicon_semiconductor_function', 'radio_frequency_function', 'optical_sensing_function', 'mechanical_momentum_function', 'electromagnetic_actuator_function', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [obc, adcs, comms],
  }
}

// ---------------------------------------------------------------------------
// 4. POWER DISTRIBUTION
// ---------------------------------------------------------------------------
function emitPowerDistribution(_p: SmallsatParams): DesignModule {
  const pdu = makeSubModule(
    'power_distribution_unit',
    'power distribution unit',
    'distributes',
    'switched 28 V channels + over-current LCL protection',
    [
      word(
        'lcl_switch_word',
        'LCL switch',
        cc('lcl_switch', 'latching current limiter', 'electrical_switching_function', 'silicon_semiconductor_function'),
        [
          mod('quantity', '×24 channels'),
          mod('form', 'Intersil ISL71026M'),
        ],
      ),
      word(
        'harness_word',
        'harness',
        cc('harness', 'electrical harness', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×1 bundle'),
          mod('form', 'shielded twisted-quad + power feeder'),
          mod('regulatory', 'NASA-STD-8739.4'),
        ],
      ),
      word(
        'd_sub_connector_word',
        'D-sub connector',
        cc('d_sub_connector', 'micro-D connector', 'electrical_conducting_function', 'gold'),
        [
          mod('quantity', '×48'),
          mod('form', 'Glenair micro-D'),
        ],
      ),
    ],
  )

  return {
    module: 'power_distribution',
    module_brief: 'Distributes regulated 28 V via 24 latching current limiters and a shielded twisted-quad harness with 48 Glenair micro-D connectors; LCL trip thresholds isolate downstream faults.',
    overview_paragraph_en: '',
    derived_parameters: { lcl_channel_count: 24, connector_count: 48 },
    allowed_radicals: ['electrical_switching_function', 'electrical_conducting_function', 'copper', 'gold'],
    applicability_confidence: 'high',
    sub_modules: [pdu],
  }
}

// ---------------------------------------------------------------------------
// 5. ENVIRONMENTAL INTERFACE
// ---------------------------------------------------------------------------
function emitEnvironmentalInterface(p: SmallsatParams): DesignModule {
  const thermal = makeSubModule(
    'thermal_control_subsystem',
    'thermal control subsystem',
    'rejects',
    `${(p.avgPowerW * 0.85 / 1000).toFixed(2)} kW via ${p.radiatorAreaM2.toFixed(2)} m² radiator + ${p.heatPipeCount} heat pipes`,
    [
      word(
        'body_radiator_panel_word',
        'body radiator panel',
        cc('body_radiator_panel', 'body-mounted radiator panel', 'thermal_radiation_function', 'aluminium_alloy'),
        [
          mod('quantity', '×2'),
          mod('area', (p.radiatorAreaM2 / 2).toFixed(2), 'm² each'),
          mod('form', 'aluminium honeycomb + OSR coating'),
        ],
      ),
      word(
        'heat_pipe_word',
        'heat pipe',
        cc('heat_pipe', 'ammonia heat pipe', 'thermal_transfer_function', 'aluminium_alloy'),
        [
          mod('quantity', fmtQty(p.heatPipeCount)),
          mod('form', 'NH3 axial-groove heat pipe'),
          mod('capacity', '200', 'W·m'),
        ],
      ),
      word(
        'mli_thermal_blanket_word',
        'MLI thermal blanket',
        cc('mli_thermal_blanket', 'MLI thermal blanket', 'thermal_insulation_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('area', p.mliAreaM2.toFixed(2), 'm²'),
          mod('form', '15-layer Mylar/Kapton'),
        ],
      ),
      word(
        'thermal_strap_word',
        'thermal strap',
        cc('thermal_strap', 'thermal strap', 'thermal_transfer_function', 'copper'),
        [
          mod('quantity', '×8'),
          mod('form', 'copper braid'),
        ],
      ),
      word(
        'survival_heater_word',
        'survival heater',
        cc('survival_heater', 'thin-film survival heater', 'thermal_emission_function', 'nichrome'),
        [
          mod('quantity', '×16'),
          mod('capacity', '5', 'W each'),
        ],
      ),
    ],
  )

  return {
    module: 'environmental_interface',
    module_brief: `Thermal control rejects ${(p.avgPowerW * 0.85 / 1000).toFixed(2)} kW into deep space through ${p.radiatorAreaM2.toFixed(2)} m² of body-mounted OSR-coated radiator panels, ${p.heatPipeCount} ammonia heat pipes spreading the load, and ${p.mliAreaM2.toFixed(2)} m² of 15-layer MLI on cold sides.`,
    overview_paragraph_en: '',
    derived_parameters: { radiator_area_m2: p.radiatorAreaM2, heat_pipe_count: p.heatPipeCount, mli_area_m2: p.mliAreaM2 },
    allowed_radicals: ['thermal_radiation_function', 'thermal_transfer_function', 'thermal_insulation_function', 'thermal_emission_function', 'aluminium_alloy', 'copper', 'polymer_thermoplastic', 'nichrome'],
    applicability_confidence: 'high',
    sub_modules: [thermal],
  }
}

// ---------------------------------------------------------------------------
// 6. MASS FLUID TRANSPORT PROCESS — EP + hydrazine backup
// ---------------------------------------------------------------------------
function emitMassFluidTransportProcess(p: SmallsatParams): DesignModule {
  const ep = makeSubModule(
    'electric_propulsion',
    'electric propulsion',
    'imparts',
    `${(p.epThrustN * 1000).toFixed(0)} mN at Isp ${p.epIspS.toFixed(0)} s; primary stationkeeping + orbit-raise`,
    [
      word(
        'electric_propulsion_thruster_word',
        'electric propulsion thruster',
        cc('electric_propulsion_thruster', 'Hall-effect thruster', 'electric_acceleration_function', 'boron_nitride'),
        [
          mod('quantity', '×1'),
          mod('capacity', (p.epThrustN * 1000).toFixed(0), 'mN'),
          mod('form', 'Busek BHT-200 / Apollo Constellation'),
          mod('regulatory', 'ECSS-E-ST-35-06'),
        ],
      ),
      word(
        'ep_ppu_power_processing_unit_word',
        'EP PPU power processing unit',
        cc('ep_ppu_power_processing_unit', 'EP power processing unit', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', p.epPowerW.toFixed(0), 'W'),
          mod('form', 'rad-tolerant DC-DC + anode HV converter'),
        ],
      ),
      word(
        'xenon_propellant_tank_word',
        'xenon propellant tank',
        cc('xenon_propellant_tank', 'xenon propellant tank', null, 'titanium_alloy'),
        [
          mod('quantity', '×1'),
          mod('capacity', p.propellantTankVolumeL.toFixed(1), 'L'),
          mod('form', 'Ti-6Al-4V COPV @ 100 bar'),
        ],
      ),
      word(
        'xenon_flow_control_unit_word',
        'xenon flow control unit',
        cc('xenon_flow_control_unit', 'xenon flow control unit', 'fluid_metering_function', 'stainless_steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'Bradford XFC'),
        ],
      ),
    ],
  )

  const chem = makeSubModule(
    'chemical_propulsion',
    'chemical propulsion',
    'imparts',
    `${p.chemThrustN.toFixed(2)} N hydrazine thrusters × 4 for safe-mode + collision avoidance`,
    [
      word(
        'monopropellant_thruster_word',
        'monopropellant thruster',
        cc('monopropellant_thruster', 'hydrazine monoprop thruster', 'mass_ejection_function', 'titanium_alloy'),
        [
          mod('quantity', '×4'),
          mod('capacity', p.chemThrustN.toFixed(2), 'N'),
          mod('form', 'Aerojet MR-103M / MR-401'),
          mod('regulatory', 'AIAA S-080'),
        ],
      ),
      word(
        'hydrazine_propellant_tank_word',
        'hydrazine propellant tank',
        cc('hydrazine_propellant_tank', 'hydrazine propellant tank', null, 'titanium_alloy'),
        [
          mod('quantity', '×1'),
          mod('capacity', '5', 'kg'),
          mod('form', 'Northrop Grumman PSI 80323-1'),
        ],
      ),
      word(
        'latch_valve_word',
        'latch valve',
        cc('latch_valve', 'isolation latch valve', 'mechanical_release_function', 'stainless_steel'),
        [
          mod('quantity', '×2'),
          mod('form', 'Moog 51-104'),
        ],
      ),
    ],
  )

  return {
    module: 'mass_fluid_transport_process',
    module_brief: `Electric propulsion: Busek BHT-200-class Hall thruster (${(p.epThrustN * 1000).toFixed(0)} mN, Isp ${p.epIspS.toFixed(0)} s) feeds from ${p.propellantTankVolumeL.toFixed(1)} L Ti-6Al-4V xenon COPV; backup hydrazine monoprop (4 × ${p.chemThrustN.toFixed(2)} N Aerojet MR-103M).`,
    overview_paragraph_en: '',
    derived_parameters: { ep_thrust_n: p.epThrustN, ep_isp_s: p.epIspS, chem_thrust_n: p.chemThrustN, propellant_mass_kg: p.propellantMassKg },
    allowed_radicals: ['electric_acceleration_function', 'mass_ejection_function', 'mechanical_release_function', 'fluid_metering_function', 'titanium_alloy', 'boron_nitride'],
    applicability_confidence: 'high',
    sub_modules: [ep, chem],
  }
}

// ---------------------------------------------------------------------------
// 7. SAFETY PROTECTION
// ---------------------------------------------------------------------------
function emitSafetyProtection(_p: SmallsatParams): DesignModule {
  const safe = makeSubModule(
    'safety_interlocks',
    'safety interlocks',
    'protects',
    'launch separation switches + propellant safe-arm + thermal trip',
    [
      word(
        'separation_switch_word',
        'separation switch',
        cc('separation_switch', 'separation switch', 'electrical_switching_function', 'stainless_steel'),
        [
          mod('quantity', '×4'),
          mod('form', 'redundant micro-switch'),
        ],
      ),
      word(
        'pyro_safe_arm_device_word',
        'pyrotechnic safe-arm device',
        cc('pyro_safe_arm_device', 'safe-arm device', 'electrical_switching_function', 'aluminium_alloy'),
        [
          mod('quantity', '×2'),
          mod('regulatory', 'AFSPCMAN 91-710 V3'),
        ],
      ),
      word(
        'thermal_runaway_trip_word',
        'thermal runaway trip',
        cc('thermal_runaway_trip', 'thermal-trip hardware comparator', 'electrical_switching_function', 'silicon_semiconductor_function'),
        [
          mod('quantity', '×2'),
          mod('form', 'redundant analog comparator'),
        ],
      ),
    ],
  )

  return {
    module: 'safety_protection',
    module_brief: 'Quad-redundant separation switches gate primary power; two pyrotechnic safe-arm devices guard propellant valves; redundant analog thermal-runaway trip comparators isolate battery on over-temperature.',
    overview_paragraph_en: '',
    derived_parameters: { separation_switch_count: 4, pyro_safe_arm_count: 2 },
    allowed_radicals: ['electrical_switching_function', 'stainless_steel', 'aluminium_alloy', 'silicon_semiconductor_function'],
    applicability_confidence: 'high',
    sub_modules: [safe],
  }
}

// ---------------------------------------------------------------------------
// 8. STRUCTURE CONTAINMENT — hexagonal bus
// ---------------------------------------------------------------------------
function emitStructureContainment(p: SmallsatParams): DesignModule {
  const structure = makeSubModule(
    'primary_structure',
    'primary structure',
    'contains',
    `hexagonal CFRP-skinned aluminium honeycomb bus, ${(p.massKg * 0.18).toFixed(1)} kg primary structure mass`,
    [
      word(
        'bus_structure_word',
        'bus structure',
        cc('bus_structure', 'hexagonal spacecraft bus', 'mechanical_load_bearing_function', 'aluminium_alloy'),
        [
          mod('quantity', '×1'),
          mod('form', 'aluminium honeycomb + CFRP face-sheet'),
          mod('regulatory', 'ECSS-E-ST-32-03'),
        ],
      ),
      word(
        'thrust_tube_word',
        'thrust tube',
        cc('thrust_tube', 'central thrust tube', 'mechanical_load_bearing_function', 'cfrp'),
        [
          mod('quantity', '×1'),
          mod('form', 'CFRP cylinder'),
        ],
      ),
      word(
        'instrument_optical_bench_word',
        'instrument optical bench',
        cc('instrument_optical_bench', 'CFRP optical bench', 'mechanical_load_bearing_function', 'cfrp'),
        [
          mod('quantity', '×1'),
          mod('form', 'CFRP isostatic mount'),
        ],
      ),
      word(
        'separation_ring_word',
        'separation ring',
        cc('separation_ring', 'separation ring 24-in', 'mechanical_release_function', 'aluminium_alloy'),
        [
          mod('quantity', '×1'),
          mod('form', 'Planetary Systems Lightband 24'),
          mod('regulatory', 'EELV SIB'),
        ],
      ),
    ],
  )

  return {
    module: 'structure_containment',
    module_brief: `Hexagonal aluminium honeycomb + CFRP face-sheet bus with central CFRP thrust tube and isostatic CFRP optical bench; Planetary Systems Lightband 24-in separation ring interfaces with the ESPA-class launch adapter.`,
    overview_paragraph_en: '',
    derived_parameters: { primary_structure_mass_kg: p.massKg * 0.18, separation_ring_size_in: 24 },
    allowed_radicals: ['mechanical_load_bearing_function', 'mechanical_release_function', 'aluminium_alloy', 'cfrp'],
    applicability_confidence: 'high',
    sub_modules: [structure],
  }
}

// ---------------------------------------------------------------------------
// 9. OPERATOR INTERFACE
// ---------------------------------------------------------------------------
function emitOperatorInterface(_p: SmallsatParams): DesignModule {
  const ops = makeSubModule(
    'mission_operations_interface',
    'mission operations interface',
    'commands',
    'CCSDS uplink + telemetry downlink + flight dynamics + COLA workflows',
    [
      word(
        'mission_control_software_word',
        'mission control software',
        cc('mission_control_software', 'mission control software', 'software_protocol_function', 'software'),
        [
          mod('quantity', '×1'),
          mod('form', 'Cobham SCISYS PCS'),
          mod('regulatory', 'CCSDS 232.0-B-3'),
        ],
      ),
      word(
        'encryption_module_word',
        'encryption module',
        cc('encryption_module', 'CCSDS SDLS encryption', 'software_security_function', 'software'),
        [
          mod('quantity', '×1'),
          mod('form', 'AES-256 GCM with PKI key management'),
          mod('regulatory', 'CCSDS 355.0-B-2'),
        ],
      ),
      word(
        'flight_dynamics_word',
        'flight dynamics',
        cc('flight_dynamics', 'flight dynamics software', 'software_protocol_function', 'software'),
        [
          mod('quantity', '×1'),
          mod('form', 'GMV focusOC / SpaceTrack TLE ingest'),
        ],
      ),
    ],
  )

  return {
    module: 'operator_interface',
    module_brief: 'Mission operations interface combines Cobham SCISYS PCS for CCSDS uplink/downlink, AES-256 SDLS encryption, and GMV focusOC flight dynamics for SpaceTrack TLE ingest + conjunction analysis workflows.',
    overview_paragraph_en: '',
    derived_parameters: { encryption_bit_strength: 256, mcs_count: 1 },
    allowed_radicals: ['software_protocol_function', 'software_security_function'],
    applicability_confidence: 'high',
    sub_modules: [ops],
  }
}

// ---------------------------------------------------------------------------
// 10. MAINTENANCE SERVICEABILITY
// ---------------------------------------------------------------------------
function emitMaintenanceServiceability(p: SmallsatParams): DesignModule {
  const launchInterface = makeSubModule(
    'launch_interface',
    'launch interface',
    'mates',
    `ESPA-class secondary payload adapter; ${p.deorbitLifetimeYears.toFixed(0)}-yr deorbit`,
    [
      word(
        'espa_ring_adapter_word',
        'ESPA ring adapter',
        cc('espa_ring_adapter', 'ESPA ring adapter', 'mechanical_load_bearing_function', 'aluminium_alloy'),
        [
          mod('quantity', '×1'),
          mod('form', 'CSA Engineering ESPA Grande'),
          mod('regulatory', 'EELV SIB'),
        ],
      ),
      word(
        'umbilical_connector_word',
        'umbilical connector',
        cc('umbilical_connector', 'umbilical connector', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('form', 'MIL-DTL-38999 with fly-away'),
        ],
      ),
      word(
        'deorbit_drag_sail_word',
        'deorbit drag sail',
        cc('deorbit_drag_sail', 'passive drag-sail deorbit device', 'mechanical_release_function', 'polymer_thermoplastic'),
        [
          mod('quantity', p.altitudeKm > 600 ? '×1' : '×0'),
          mod('form', 'High Performance Space Structure Systems / Cranfield ADEO'),
          mod('regulatory', 'IADC 21.1'),
        ],
      ),
    ],
  )

  return {
    module: 'maintenance_serviceability',
    module_brief: `ESPA Grande ring adapter (CSA Engineering) interfaces the bus with the launch adapter; MIL-DTL-38999 umbilical supports ground servicing${p.altitudeKm > 600 ? '; passive Cranfield ADEO drag-sail enforces IADC 25-yr deorbit' : '; natural decay enforces IADC 25-yr deorbit'}.`,
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
function emitCrossModuleGrammarLinks(p: SmallsatParams): unknown[] {
  return [
    { from_module: 'energy_storage_source', to_module: 'energy_conversion_transduction', mechanism: 'dc_bus', type: 'mutual', detail: `${p.bolPowerW.toFixed(0)} W BoL to PCDU` },
    { from_module: 'energy_conversion_transduction', to_module: 'power_distribution', mechanism: 'dc_bus', type: 'mutual', detail: '28 V regulated bus' },
    { from_module: 'power_distribution', to_module: 'control_compute_communication', mechanism: 'switched_dc', type: 'directional', detail: 'OBC + ADCS + comms' },
    { from_module: 'control_compute_communication', to_module: 'mass_fluid_transport_process', mechanism: 'control_signal', type: 'directional', detail: 'EP firing schedule' },
    { from_module: 'environmental_interface', to_module: 'energy_storage_source', mechanism: 'thermal', type: 'mutual', detail: 'battery heat reject' },
    { from_module: 'safety_protection', to_module: 'energy_storage_source', mechanism: 'interlock', type: 'directional', detail: 'separation switch + thermal trip' },
    { from_module: 'structure_containment', to_module: 'energy_storage_source', mechanism: 'mechanical_mount', type: 'directional', detail: 'solar array yoke + battery rack' },
    { from_module: 'structure_containment', to_module: 'mass_fluid_transport_process', mechanism: 'mechanical_mount', type: 'directional', detail: 'thruster bracket on thrust tube' },
    { from_module: 'operator_interface', to_module: 'control_compute_communication', mechanism: 'tc_tm', type: 'mutual', detail: 'CCSDS uplink/downlink' },
    { from_module: 'maintenance_serviceability', to_module: 'structure_containment', mechanism: 'mechanical_interface', type: 'mutual', detail: 'ESPA ring + umbilical' },
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
    `Deliver a ${p.totalSystemMassKg.toFixed(0)} kg ESPA-class smallsat on a ${p.altitudeKm.toFixed(0)} km LEO orbit with ${p.designLifeYears.toFixed(0)}-year design life, ${p.bolPowerW.toFixed(0)} W BoL power, ${p.downlinkDataRateMbps.toFixed(0)} Mbps X-band downlink, and electric-propulsion stationkeeping (${(p.epThrustN * 1000).toFixed(0)} mN Isp ${p.epIspS.toFixed(0)} s).`,
  )
}

registerAssembler('satellite_smallsat', emit)
