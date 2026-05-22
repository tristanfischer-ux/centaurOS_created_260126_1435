/**
 * scripts/lib/orchestrator/emitters/evtol.ts
 *
 * eVTOL DETERMINISTIC EMITTER — urban air mobility, 2-4 passenger
 * electric vertical takeoff. Real parts: Joby Aviation tilt-rotor /
 * Lilium Jet / Beta ALIA / Archer Midnight class. Components: H3X HPDM-250
 * permanent-magnet motors, EnerSys ELiTE-class battery packs, Honeywell
 * Anthem flight deck, Garmin G3000H avionics.
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON } from '../assembler'
import type { ContractInProgress } from '../types'

type ModifierCharacter = { kind: string; value: string; unit?: string }

interface ContentCharacter {
  character_id: string
  name_human: string
  function_radical_primary: string | null
  function_radical_secondary: string | null
  material_radical_primary: string | null
  material_radical_secondary: string | null
}

interface Word {
  id: string
  name_human: string
  content_character: ContentCharacter
  modifier_characters: ModifierCharacter[]
}

interface SubModule {
  id: string
  name_human: string
  english_sentence: string
  rad_syntax: string
  role_verb: string
  topology_clause: string
  words: Word[]
}

function q(contract: ContractInProgress, key: string, fallback: number): number {
  const v = (contract.quantities as Record<string, { value?: number }> | undefined)?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function fmtQty(n: number): string {
  if (Number.isInteger(n)) return `×${n}`
  return `×${n.toFixed(2)}`
}

function mod(kind: string, value: string, unit?: string): ModifierCharacter {
  return unit !== undefined ? { kind, value, unit } : { kind, value }
}

function cc(
  character_id: string,
  name_human: string,
  fp: string | null,
  mp: string | null,
): ContentCharacter {
  return {
    character_id,
    name_human,
    function_radical_primary: fp,
    function_radical_secondary: null,
    material_radical_primary: mp,
    material_radical_secondary: null,
  }
}

function word(id: string, name_human: string, content: ContentCharacter, modifiers: ModifierCharacter[]): Word {
  // Universal fix #A (2026-05-22): strip literal " word" suffix from name_human.
  const cleanName = name_human.replace(/\s+word$/i, '')
  return { id, name_human: cleanName, content_character: content, modifier_characters: modifiers }
}

function synthesizeRadSyntax(words: Word[]): string {
  return words
    .map((w) => {
      const tokens = w.modifier_characters
        .slice()
        .sort((a, b) => (a.kind === 'quantity' ? -1 : b.kind === 'quantity' ? 1 : 0))
        .map((m) => (m.unit ? `${m.value}${m.unit}` : m.value))
      if (tokens.length === 0) return w.content_character.character_id
      return `${w.content_character.character_id} (${tokens.join(', ')})`
    })
    .join(' ⊙ ')
}

function makeSubModule(id: string, name_human: string, role_verb: string, topology_clause: string, words: Word[]): SubModule {
  return { id, name_human, english_sentence: '', rad_syntax: synthesizeRadSyntax(words), role_verb, topology_clause, words }
}

// ---------------------------------------------------------------------------
// PARAMS
// ---------------------------------------------------------------------------

interface EvtolParams {
  mtowKg: number
  numPax: number
  cruiseSpeedKmh: number
  cruiseRangeKm: number
  enduranceMin: number
  numRotors: number
  batteryKwh: number
  // tool-derived
  cellCount: number
  packMassKg: number
  hoverPowerKw: number
  cruisePowerKw: number
  motorContinuousKw: number
  rotorTiltLiftN: number
  downwashPowerLossPct: number
  pilotCooperHarper: number
  certCostGbpM: number
  flightTestHours: number
  bvlosDal: string
  rfLinkMarginDb: number
  composite_skin_area_m2: number
  radiatorAreaM2: number
}

function deriveEvtolParams(c: ContractInProgress): EvtolParams {
  const mtowKg = q(c, 'gross_takeoff_mass_kg', 2500)
  const numPax = Math.max(1, Math.round(q(c, 'num_passengers', 4)))
  const cruiseSpeedKmh = q(c, 'cruise_speed_km_h', 250)
  const cruiseRangeKm = q(c, 'cruise_range_km', 250)
  const enduranceMin = q(c, 'endurance_min', 30)
  const numRotors = Math.max(2, Math.round(q(c, 'num_rotors', 6)))
  const batteryKwh = q(c, 'battery_kwh', 400)

  const cellCount = Math.max(1, Math.round(q(c, 'cell_count', batteryKwh * 1000 / 3.7 / 5)))
  const packMassKg = q(c, 'battery_pack_mass_kg', batteryKwh * 4)  // ~250 Wh/kg pack
  // disk-actuator hover power
  const hoverPowerKw = q(c, 'hover_power_kw', mtowKg * 9.81 * 0.08)  // ~0.08 kW/N typical eVTOL
  const cruisePowerKw = q(c, 'cruise_power_kw', hoverPowerKw * 0.30)  // cruise is much more efficient
  const motorContinuousKw = q(c, 'motor_continuous_kw', hoverPowerKw / numRotors)
  const rotorTiltLiftN = q(c, 'lift_force_n', mtowKg * 9.81)
  const downwashPowerLossPct = q(c, 'power_loss_pct', 12)
  const pilotCooperHarper = q(c, 'cooper_harper_rating', 4)
  const certCostGbpM = q(c, 'cost_estimate_gbp_m', 250)
  const flightTestHours = q(c, 'flight_test_hours_required', 1500)
  const rfLinkMarginDb = q(c, 'rf_link_margin_db', 15)
  const composite_skin_area_m2 = mtowKg * 0.015  // approx 1.5% of mass per m² composite
  const radiatorAreaM2 = q(c, 'radiator_area_m2', 4.0)

  return {
    mtowKg, numPax, cruiseSpeedKmh, cruiseRangeKm, enduranceMin, numRotors, batteryKwh,
    cellCount, packMassKg, hoverPowerKw, cruisePowerKw, motorContinuousKw,
    rotorTiltLiftN, downwashPowerLossPct, pilotCooperHarper, certCostGbpM,
    flightTestHours, bvlosDal: 'DAL-B',
    rfLinkMarginDb, composite_skin_area_m2, radiatorAreaM2,
  }
}

// ---------------------------------------------------------------------------
// MODULE 1 — airframe_composite
// ---------------------------------------------------------------------------

function emitAirframeComposite(p: EvtolParams) {
  const fuselage = makeSubModule(
    'composite_fuselage',
    'composite fuselage',
    'carries',
    `monocoque CFRP fuselage for ${p.numPax}-passenger cabin`,
    [
      word('composite_airframe_word', 'composite airframe',
        cc('composite_airframe', 'composite airframe', 'mechanical_load_function', 'carbon_fibre_composite'),
        [mod('quantity', '×1'), mod('dimension', '8.0', 'm length'), mod('form', 'AS4/8552 prepreg monocoque + Nomex honeycomb sandwich'), mod('regulatory', 'CS-23/SC-VTOL')]),
      word('cabin_pressure_bulkhead_word', 'cabin pressure bulkhead',
        cc('cabin_pressure_bulkhead', 'cabin pressure bulkhead', 'mechanical_load_function', 'carbon_fibre_composite'),
        [mod('quantity', '×2'), mod('form', 'AS4/8552 forward + aft bulkheads')]),
    ],
  )

  const wingTail = makeSubModule(
    'wing_tail_assembly',
    'wing and tail assembly',
    'lifts',
    'fixed wing + V-tail for forward-flight cruise',
    [
      word('wing_assembly_word', 'wing assembly',
        cc('wing_assembly', 'wing assembly', 'aerodynamic_lift_function', 'carbon_fibre_composite'),
        [mod('quantity', '×1'), mod('dimension', '12.0', 'm span'), mod('form', 'CFRP wing + integrated tilt-rotor pylons')]),
      word('v_tail_assembly_word', 'V-tail assembly',
        cc('v_tail_assembly', 'V-tail empennage', 'aerodynamic_lift_function', 'carbon_fibre_composite'),
        [mod('quantity', '×1'), mod('dimension', '4.0', 'm span'), mod('form', 'CFRP V-tail at 35° dihedral')]),
    ],
  )

  return {
    module: 'airframe_composite',
    module_brief: `AS4/8552 CFRP monocoque fuselage + Nomex honeycomb sandwich for ${p.numPax}-pax cabin, 12 m wingspan with integrated tilt-rotor pylons, CFRP V-tail empennage. Mass ≈ ${(p.composite_skin_area_m2 * 5).toFixed(0)} kg structural composite.`,
    overview_paragraph_en: '',
    derived_parameters: {
      mtow_kg: p.mtowKg,
      num_passengers: p.numPax,
      wingspan_m: 12,
      fuselage_length_m: 8,
    },
    allowed_radicals: [
      'mechanical_load_function',
      'aerodynamic_lift_function',
      'carbon_fibre_composite',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [fuselage, wingTail],
  }
}

// ---------------------------------------------------------------------------
// MODULE 2 — rotor_arrays_tilt
// ---------------------------------------------------------------------------

function emitRotorArraysTilt(p: EvtolParams) {
  const rotorAssembly = makeSubModule(
    'tilt_rotor_assembly',
    'tilt rotor assembly',
    'tilts',
    `${p.numRotors}× tilt rotors for VTOL → cruise transition`,
    [
      word('tilt_rotor_blade_word', 'tilt rotor blade',
        cc('tilt_rotor_blade', 'tilt rotor blade', 'aerodynamic_lift_function', 'carbon_fibre_composite'),
        [mod('quantity', fmtQty(p.numRotors * 5)), mod('dimension', '2.5', 'm dia'), mod('form', 'Joby Aviation 5-blade CFRP tilt-prop')]),
      word('rotor_hub_assembly_word', 'rotor hub assembly',
        cc('rotor_hub_assembly', 'rotor hub assembly', 'mechanical_load_function', 'titanium_alloy'),
        [mod('quantity', fmtQty(p.numRotors)), mod('form', 'Ti-6Al-4V hub + collective pitch link')]),
    ],
  )

  const tiltMechanism = makeSubModule(
    'tilt_actuation_mechanism',
    'tilt actuation mechanism',
    'rotates',
    'electromechanical actuator for 90° rotor tilt VTOL ↔ cruise',
    [
      word('tilt_actuator_ema_word', 'tilt actuator EMA',
        cc('tilt_actuator_ema', 'tilt actuator EMA', 'electromagnetic_force_function', 'rare_earth_magnet'),
        [mod('quantity', fmtQty(p.numRotors)), mod('form', 'Moog Aircraft EMA, 90° travel, 25 kNm peak')]),
      word('tilt_angle_sensor_word', 'tilt angle sensor',
        cc('tilt_angle_sensor', 'tilt angle sensor', 'silicon_semiconductor_function', 'silicon_wafer'),
        [mod('quantity', fmtQty(p.numRotors * 2)), mod('form', 'Penny+Giles SRS-280 rotary sensor, dual')]),
    ],
  )

  return {
    module: 'rotor_arrays_tilt',
    module_brief: `${p.numRotors}× Joby Aviation 5-blade CFRP tilt-rotor (2.5 m dia) with Ti-6Al-4V hub + collective pitch. Moog Aircraft EMA tilt actuators (90° travel, 25 kNm peak) with dual Penny+Giles SRS-280 rotary angle sensors per rotor. Hover power ${p.hoverPowerKw.toFixed(0)} kW, downwash loss ${p.downwashPowerLossPct.toFixed(1)}%.`,
    overview_paragraph_en: '',
    derived_parameters: {
      num_rotors: p.numRotors,
      rotor_diameter_m: 2.5,
      hover_power_kw: p.hoverPowerKw,
      downwash_power_loss_pct: p.downwashPowerLossPct,
    },
    allowed_radicals: [
      'aerodynamic_lift_function',
      'mechanical_load_function',
      'electromagnetic_force_function',
      'silicon_semiconductor_function',
      'carbon_fibre_composite',
      'titanium_alloy',
      'rare_earth_magnet',
      'silicon_wafer',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [rotorAssembly, tiltMechanism],
  }
}

// ---------------------------------------------------------------------------
// MODULE 3 — electric_motor_drives
// ---------------------------------------------------------------------------

function emitElectricMotorDrives(p: EvtolParams) {
  const driveMotors = makeSubModule(
    'electric_drive_motors',
    'electric drive motors',
    'drives',
    `${p.numRotors}× H3X HPDM-250 axial-flux permanent-magnet motors, ${p.motorContinuousKw.toFixed(0)} kW continuous`,
    [
      word('h3x_hpdm_motor_word', 'H3X HPDM motor',
        cc('h3x_hpdm_motor', 'H3X HPDM permanent-magnet motor', 'electromagnetic_force_function', 'rare_earth_magnet'),
        [mod('quantity', fmtQty(p.numRotors)), mod('capacity', String(p.motorContinuousKw.toFixed(0)), 'kW'), mod('form', 'H3X HPDM-250 axial-flux PMM, 13 kW/kg'), mod('regulatory', 'DO-160G')]),
    ],
  )

  const motorInverters = makeSubModule(
    'motor_inverter_drives',
    'motor inverter drives',
    'switches',
    'SiC three-phase inverter per motor for variable-speed control',
    [
      word('motor_inverter_sic_word', 'motor inverter SiC',
        cc('motor_inverter_sic', 'SiC motor inverter', 'silicon_semiconductor_function', 'aluminium'),
        [mod('quantity', fmtQty(p.numRotors)), mod('capacity', String(p.motorContinuousKw.toFixed(0)), 'kW'), mod('form', 'Cascadia / Mitsubishi SiC three-phase inverter')]),
      word('motor_current_sensor_word', 'motor current sensor',
        cc('motor_current_sensor', 'motor current sensor', 'silicon_semiconductor_function', 'fr4'),
        [mod('quantity', fmtQty(p.numRotors * 3)), mod('form', 'LEM HASS 200-S hall-effect 200 A')]),
    ],
  )

  return {
    module: 'electric_motor_drives',
    module_brief: `${p.numRotors}× H3X HPDM-250 axial-flux permanent-magnet motors (13 kW/kg, ${p.motorContinuousKw.toFixed(0)} kW continuous). Cascadia / Mitsubishi SiC three-phase inverter per motor with LEM HASS 200-S hall-effect current sensors. DO-160G environmental qualified.`,
    overview_paragraph_en: '',
    derived_parameters: {
      num_motors: p.numRotors,
      motor_continuous_kw: p.motorContinuousKw,
      total_motor_kw: p.numRotors * p.motorContinuousKw,
    },
    allowed_radicals: [
      'electromagnetic_force_function',
      'silicon_semiconductor_function',
      'rare_earth_magnet',
      'aluminium',
      'fr4',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [driveMotors, motorInverters],
  }
}

// ---------------------------------------------------------------------------
// MODULE 4 — battery_packs
// ---------------------------------------------------------------------------

function emitBatteryPacks(p: EvtolParams) {
  const lithiumPack = makeSubModule(
    'lithium_battery_pack',
    'lithium battery pack',
    'stores',
    `${p.batteryKwh.toFixed(0)} kWh high-power Li-ion pack across redundant modules`,
    [
      word('lithium_high_power_cell_word', 'lithium high-power cell',
        cc('lithium_high_power_cell', 'lithium high-power cell', 'electrochemical_energy_function', 'lithium_nmc_chemistry'),
        [mod('quantity', fmtQty(p.cellCount)), mod('capacity', '5', 'Ah'), mod('form', 'Molicel P50B / EnerSys ELiTE 21700 high-power'), mod('dimension', '3.7', 'V nominal'), mod('regulatory', 'UN 38.3')]),
      word('battery_pack_module_word', 'battery pack module',
        cc('battery_pack_module', 'battery pack module', 'mechanical_load_function', 'aluminium'),
        [mod('quantity', '×8'), mod('capacity', String((p.batteryKwh / 8).toFixed(0)), 'kWh'), mod('form', '50 kWh quick-swap aluminium module')]),
    ],
  )

  return {
    module: 'battery_packs',
    module_brief: `${p.batteryKwh.toFixed(0)} kWh Molicel P50B / EnerSys ELiTE 21700 high-power Li-ion (5 Ah cells, 3.7 V nominal) across 8× redundant 50 kWh quick-swap aluminium modules. Pack mass ${p.packMassKg.toFixed(0)} kg. UN 38.3 certified.`,
    overview_paragraph_en: '',
    derived_parameters: {
      battery_kwh: p.batteryKwh,
      cell_count: p.cellCount,
      pack_mass_kg: p.packMassKg,
      module_count: 8,
    },
    allowed_radicals: [
      'electrochemical_energy_function',
      'lithium_nmc_chemistry',
      'mechanical_load_function',
      'aluminium',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [lithiumPack],
  }
}

// ---------------------------------------------------------------------------
// MODULE 5 — energy_management
// ---------------------------------------------------------------------------

function emitEnergyManagement(p: EvtolParams) {
  const bms = makeSubModule(
    'battery_management_system',
    'battery management system',
    'monitors',
    'high-voltage BMS with cell-level monitoring across 8 modules',
    [
      word('bms_master_controller_word', 'BMS master controller',
        cc('bms_master_controller', 'BMS master controller', 'silicon_semiconductor_function', 'fr4'),
        [mod('quantity', '×2'), mod('form', 'Lithium Werks AEM-2 redundant BMS'), mod('regulatory', 'DO-178C DAL-B')]),
      word('cell_balancer_slave_word', 'cell balancer slave',
        cc('cell_balancer_slave', 'cell balancer slave', 'silicon_semiconductor_function', 'fr4'),
        [mod('quantity', '×16'), mod('form', 'ADBMS6830 18-ch BMS slave')]),
    ],
  )

  const thermalManagement = makeSubModule(
    'battery_thermal_management',
    'battery thermal management',
    'cools',
    `${p.radiatorAreaM2.toFixed(1)} m² radiator + glycol-cooled cold plates per module`,
    [
      word('cold_plate_glycol_word', 'cold plate glycol',
        cc('cold_plate_glycol', 'glycol cold plate', 'thermal_transfer_function', 'aluminium'),
        [mod('quantity', '×8'), mod('form', 'machined Al cold plate, propylene glycol'), mod('capacity', '15', 'kW heat rejection')]),
      word('cooling_pump_word', 'cooling pump',
        cc('cooling_pump', 'cooling pump', 'electromagnetic_force_function', 'aluminium'),
        [mod('quantity', '×2'), mod('form', 'redundant Pierburg CWA 200 EM pump')]),
      word('air_radiator_word', 'air radiator',
        cc('air_radiator', 'air radiator', 'thermal_transfer_function', 'aluminium'),
        [mod('quantity', '×1'), mod('dimension', String(p.radiatorAreaM2.toFixed(1)), 'm²')]),
    ],
  )

  return {
    module: 'energy_management',
    module_brief: `Lithium Werks AEM-2 redundant BMS (DO-178C DAL-B), 16× ADBMS6830 18-ch slave boards. 8× machined Al cold plates with propylene glycol coolant, dual Pierburg CWA 200 pumps, ${p.radiatorAreaM2.toFixed(1)} m² air radiator.`,
    overview_paragraph_en: '',
    derived_parameters: {
      bms_master_count: 2,
      bms_slave_count: 16,
      cold_plate_count: 8,
      radiator_area_m2: p.radiatorAreaM2,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'thermal_transfer_function',
      'electromagnetic_force_function',
      'fr4',
      'aluminium',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [bms, thermalManagement],
  }
}

// ---------------------------------------------------------------------------
// MODULE 6 — flight_controls_avionics
// ---------------------------------------------------------------------------

function emitFlightControlsAvionics(p: EvtolParams) {
  const flightDeck = makeSubModule(
    'flight_deck_displays',
    'flight deck displays',
    'displays',
    'Honeywell Anthem touchscreen flight deck for pilot interface',
    [
      word('honeywell_anthem_flight_deck_word', 'Honeywell Anthem flight deck',
        cc('honeywell_anthem_flight_deck', 'Honeywell Anthem flight deck', 'silicon_semiconductor_function', 'aluminium'),
        [mod('quantity', '×1'), mod('form', 'Anthem touchscreen + sidestick'), mod('regulatory', 'DO-178C DAL-A')]),
      word('garmin_g3000h_pfd_word', 'Garmin G3000H PFD',
        cc('garmin_g3000h_pfd', 'Garmin G3000H PFD', 'silicon_semiconductor_function', 'aluminium'),
        [mod('quantity', '×2'), mod('form', 'PFD + MFD redundant')]),
    ],
  )

  const fbwComputer = makeSubModule(
    'fly_by_wire_computer',
    'fly-by-wire computer',
    'computes',
    'triplex fly-by-wire flight control computer (FCC)',
    [
      word('fcc_triplex_word', 'FCC triplex',
        cc('fcc_triplex', 'triplex flight control computer', 'silicon_semiconductor_function', 'fr4'),
        [mod('quantity', '×3'), mod('form', 'BAE Systems FCC-VTOL or Collins ProLine Fusion'), mod('regulatory', 'DO-178C DAL-A')]),
      word('ins_grade_aviation_word', 'INS grade aviation',
        cc('ins_grade_aviation', 'aviation-grade INS', 'inertial_sensing_function', 'silicon_wafer'),
        [mod('quantity', '×3'), mod('form', 'Honeywell HG1700 RLG IMU, 0.1°/hr bias')]),
      word('air_data_pitot_static_word', 'air data pitot-static',
        cc('air_data_pitot_static', 'pitot-static air data system', 'fluid_routing_function', 'titanium_alloy'),
        [mod('quantity', '×3'), mod('form', 'Aeroprobe heated pitot-static probes')]),
    ],
  )

  return {
    module: 'flight_controls_avionics',
    module_brief: `Honeywell Anthem touchscreen flight deck + Garmin G3000H PFD/MFD (DO-178C DAL-A). Triplex BAE Systems FCC-VTOL fly-by-wire flight control computers, Honeywell HG1700 ring-laser gyro IMU (0.1°/hr bias), redundant Aeroprobe heated pitot-static probes. Cooper-Harper rating ${p.pilotCooperHarper.toFixed(0)}.`,
    overview_paragraph_en: '',
    derived_parameters: {
      cooper_harper_rating: p.pilotCooperHarper,
      fcc_redundancy: 3,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'inertial_sensing_function',
      'fluid_routing_function',
      'aluminium',
      'fr4',
      'silicon_wafer',
      'titanium_alloy',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [flightDeck, fbwComputer],
  }
}

// ---------------------------------------------------------------------------
// MODULE 7 — passenger_cabin
// ---------------------------------------------------------------------------

function emitPassengerCabin(p: EvtolParams) {
  const seats = makeSubModule(
    'passenger_seats',
    'passenger seats',
    'restrains',
    `${p.numPax} crashworthy passenger seats per CS-23/SC-VTOL`,
    [
      word('passenger_seat_16g_word', 'passenger seat 16g',
        cc('passenger_seat_16g', '16g crashworthy passenger seat', 'mechanical_load_function', 'aluminium'),
        [mod('quantity', fmtQty(p.numPax)), mod('form', 'Geven Comoda lightweight composite'), mod('regulatory', 'CS-25.561 16g dynamic')]),
      word('seat_belt_4_point_word', 'seat belt 4-point',
        cc('seat_belt_4_point', '4-point seat belt', 'mechanical_load_function', 'polymer_thermoplastic'),
        [mod('quantity', fmtQty(p.numPax)), mod('form', 'AmSafe 4-point harness')]),
    ],
  )

  const cabinSystems = makeSubModule(
    'cabin_environmental_systems',
    'cabin environmental systems',
    'conditions',
    'cabin air conditioning + pressurisation for short-cycle UAM flights',
    [
      word('cabin_air_conditioner_word', 'cabin air conditioner',
        cc('cabin_air_conditioner', 'cabin air conditioner', 'thermal_transfer_function', 'aluminium'),
        [mod('quantity', '×1'), mod('capacity', '5', 'kW cooling'), mod('form', 'Hamilton Sundstrand electric ECS')]),
      word('cabin_overhead_panel_word', 'cabin overhead panel',
        cc('cabin_overhead_panel', 'cabin overhead panel', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'LED reading lights + air vents + intercom')]),
    ],
  )

  return {
    module: 'passenger_cabin',
    module_brief: `${p.numPax} Geven Comoda 16g crashworthy composite seats with AmSafe 4-point harnesses (CS-25.561). Hamilton Sundstrand 5 kW electric ECS for cabin conditioning. LED + intercom overhead panel.`,
    overview_paragraph_en: '',
    derived_parameters: {
      num_passengers: p.numPax,
      ecs_capacity_kw: 5,
    },
    allowed_radicals: [
      'mechanical_load_function',
      'thermal_transfer_function',
      'silicon_semiconductor_function',
      'aluminium',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [seats, cabinSystems],
  }
}

// ---------------------------------------------------------------------------
// MODULE 8 — landing_gear
// ---------------------------------------------------------------------------

function emitLandingGear(_p: EvtolParams) {
  const tricycleGear = makeSubModule(
    'tricycle_landing_gear',
    'tricycle landing gear',
    'absorbs',
    'tricycle non-retractable composite landing gear for vertiport ops',
    [
      word('main_gear_strut_word', 'main gear strut',
        cc('main_gear_strut', 'main gear strut', 'mechanical_load_function', 'aluminium'),
        [mod('quantity', '×2'), mod('form', 'Al-7075 strut + oleo-pneumatic damper'), mod('regulatory', 'CS-25.473')]),
      word('nose_gear_strut_word', 'nose gear strut',
        cc('nose_gear_strut', 'nose gear strut', 'mechanical_load_function', 'aluminium'),
        [mod('quantity', '×1'), mod('form', 'Al-7075 strut, steerable')]),
      word('landing_gear_tire_word', 'landing gear tire',
        cc('landing_gear_tire', 'landing gear tire', 'mechanical_load_function', 'polymer_elastomer'),
        [mod('quantity', '×3'), mod('form', 'Goodyear Flight Custom III aviation tire')]),
    ],
  )

  return {
    module: 'landing_gear',
    module_brief: `Tricycle non-retractable Al-7075 landing gear with oleo-pneumatic dampers (CS-25.473). Steerable nose gear, Goodyear Flight Custom III aviation tires. Sized for vertiport operations + emergency belly-landing case.`,
    overview_paragraph_en: '',
    derived_parameters: {
      gear_layout: 'tricycle',
      gear_count: 3,
    },
    allowed_radicals: [
      'mechanical_load_function',
      'aluminium',
      'polymer_elastomer',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [tricycleGear],
  }
}

// ---------------------------------------------------------------------------
// MODULE 9 — emergency_systems
// ---------------------------------------------------------------------------

function emitEmergencySystems(p: EvtolParams) {
  const ballisticChute = makeSubModule(
    'ballistic_recovery_parachute',
    'ballistic recovery parachute',
    'lowers',
    `${p.mtowKg.toFixed(0)} kg MTOW BRS for catastrophic failure recovery`,
    [
      word('brs_ballistic_parachute_word', 'BRS ballistic parachute',
        cc('brs_ballistic_parachute', 'BRS ballistic parachute', 'mechanical_load_function', 'polymer_aramid'),
        [mod('quantity', '×1'), mod('capacity', String(p.mtowKg.toFixed(0)), 'kg MTOW'), mod('form', 'BRS Aerospace VLS-class ballistic'), mod('regulatory', 'CS-23 special condition')]),
      word('brs_rocket_motor_word', 'BRS rocket motor',
        cc('brs_rocket_motor', 'BRS rocket deployment motor', 'thermal_chemical_function', 'aluminium'),
        [mod('quantity', '×1'), mod('form', 'solid-propellant rocket, electronic squib')]),
    ],
  )

  const fireSuppression = makeSubModule(
    'battery_fire_suppression',
    'battery fire suppression',
    'extinguishes',
    'battery-bay aerosol fire suppression for thermal runaway',
    [
      word('aerosol_fire_extinguisher_word', 'aerosol fire extinguisher',
        cc('aerosol_fire_extinguisher', 'aerosol fire extinguisher', 'thermal_chemical_function', 'aluminium'),
        [mod('quantity', fmtQty(p.numRotors > 4 ? 2 : 1)), mod('form', 'FirePro FP-100T aerosol generator'), mod('regulatory', 'UL 2127')]),
      word('battery_smoke_detector_word', 'battery smoke detector',
        cc('battery_smoke_detector', 'battery smoke detector', 'silicon_semiconductor_function', 'fr4'),
        [mod('quantity', '×8'), mod('form', 'photoelectric smoke detector per module')]),
    ],
  )

  return {
    module: 'emergency_systems',
    module_brief: `BRS Aerospace VLS-class ballistic recovery parachute (${p.mtowKg.toFixed(0)} kg MTOW, CS-23 special condition). FirePro FP-100T aerosol fire extinguisher in battery bay (UL 2127), 8× photoelectric smoke detectors per battery module.`,
    overview_paragraph_en: '',
    derived_parameters: {
      brs_mtow_kg: p.mtowKg,
      smoke_detector_count: 8,
    },
    allowed_radicals: [
      'mechanical_load_function',
      'thermal_chemical_function',
      'silicon_semiconductor_function',
      'polymer_aramid',
      'aluminium',
      'fr4',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [ballisticChute, fireSuppression],
  }
}

// ---------------------------------------------------------------------------
// MODULE 10 — regulatory_certification_basis
// ---------------------------------------------------------------------------

function emitRegulatoryCertificationBasis(p: EvtolParams) {
  const typeCertProgram = makeSubModule(
    'type_certification_program',
    'type certification program',
    'certifies',
    `${p.flightTestHours.toFixed(0)}-hour flight-test programme for Part 23 / SC-VTOL`,
    [
      word('part_23_sc_vtol_cert_word', 'Part 23 SC-VTOL cert',
        cc('part_23_sc_vtol_cert', 'FAA Part 23 / EASA SC-VTOL certification', 'regulatory_compliance_function', null),
        [mod('quantity', '×1'), mod('regulatory', 'FAA Part 23 / EASA SC-VTOL'), mod('form', `${p.flightTestHours.toFixed(0)} flight test hours`)]),
      word('do_178c_dal_a_word', 'DO-178C DAL-A',
        cc('do_178c_dal_a', 'DO-178C DAL-A software certification', 'regulatory_compliance_function', null),
        [mod('quantity', '×1'), mod('regulatory', 'DO-178C DAL-A'), mod('form', 'flight-critical software')]),
      word('do_254_dal_a_word', 'DO-254 DAL-A',
        cc('do_254_dal_a', 'DO-254 DAL-A hardware certification', 'regulatory_compliance_function', null),
        [mod('quantity', '×1'), mod('regulatory', 'DO-254 DAL-A'), mod('form', 'flight-critical hardware')]),
    ],
  )

  const qualityFmea = makeSubModule(
    'safety_assessment_documents',
    'safety assessment documents',
    'audits',
    'ARP 4761 system safety + AS 9100 quality management',
    [
      word('arp_4761_safety_assessment_word', 'ARP 4761 safety assessment',
        cc('arp_4761_safety_assessment', 'ARP 4761 safety assessment', 'regulatory_compliance_function', null),
        [mod('quantity', '×1'), mod('regulatory', 'ARP 4761'), mod('form', 'PSSA + SSA + CCA')]),
      word('as_9100_qms_word', 'AS 9100 QMS',
        cc('as_9100_qms', 'AS 9100 QMS', 'regulatory_compliance_function', null),
        [mod('quantity', '×1'), mod('regulatory', 'AS 9100')]),
    ],
  )

  return {
    module: 'regulatory_certification_basis',
    module_brief: `FAA Part 23 / EASA SC-VTOL type certification, DO-178C DAL-A flight-critical software + DO-254 DAL-A flight-critical hardware. ${p.flightTestHours.toFixed(0)} flight test hours, estimated £${p.certCostGbpM.toFixed(0)}M certification cost. ARP 4761 safety assessment + AS 9100 QMS.`,
    overview_paragraph_en: '',
    derived_parameters: {
      flight_test_hours: p.flightTestHours,
      cert_cost_gbp_m: p.certCostGbpM,
      design_assurance_level: 'DAL-A',
    },
    allowed_radicals: [
      'regulatory_compliance_function',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [typeCertProgram, qualityFmea],
  }
}

// ---------------------------------------------------------------------------
// CROSS-MODULE GRAMMAR LINKS
// ---------------------------------------------------------------------------

function emitCrossModuleGrammarLinks() {
  return [
    { from_module: 'battery_packs', to_module: 'electric_motor_drives', mechanism: 'electrical_bus', type: 'directional' as const, detail: 'HV DC bus to motor inverters' },
    { from_module: 'electric_motor_drives', to_module: 'rotor_arrays_tilt', mechanism: 'mechanical', type: 'directional' as const, detail: 'shaft drive to rotor hub' },
    { from_module: 'energy_management', to_module: 'battery_packs', mechanism: 'control', type: 'mutual' as const, detail: 'BMS monitor + thermal cooling' },
    { from_module: 'flight_controls_avionics', to_module: 'electric_motor_drives', mechanism: 'data', type: 'directional' as const, detail: 'FBW motor torque command' },
    { from_module: 'flight_controls_avionics', to_module: 'rotor_arrays_tilt', mechanism: 'data', type: 'directional' as const, detail: 'tilt angle + collective pitch command' },
    { from_module: 'passenger_cabin', to_module: 'airframe_composite', mechanism: 'mechanical', type: 'directional' as const, detail: 'seat rails bolted to floor structure' },
    { from_module: 'landing_gear', to_module: 'airframe_composite', mechanism: 'mechanical', type: 'directional' as const, detail: 'gear strut attach point' },
    { from_module: 'emergency_systems', to_module: 'airframe_composite', mechanism: 'mechanical', type: 'directional' as const, detail: 'BRS rocket mount + bridle line attach' },
    { from_module: 'emergency_systems', to_module: 'battery_packs', mechanism: 'control', type: 'mutual' as const, detail: 'fire suppression + thermal runaway trigger' },
    { from_module: 'regulatory_certification_basis', to_module: 'flight_controls_avionics', mechanism: 'control', type: 'directional' as const, detail: 'DO-178C DAL-A certification covers FBW software' },
    { from_module: 'energy_management', to_module: 'airframe_composite', mechanism: 'fluid_loop', type: 'directional' as const, detail: 'radiator mounts in cooling-air duct in airframe' },
  ]
}

// ---------------------------------------------------------------------------
// MAIN EMITTER
// ---------------------------------------------------------------------------

const emitEvtolDesign: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveEvtolParams(contract)
  const modules = [
    emitAirframeComposite(p),
    emitRotorArraysTilt(p),
    emitElectricMotorDrives(p),
    emitBatteryPacks(p),
    emitEnergyManagement(p),
    emitFlightControlsAvionics(p),
    emitPassengerCabin(p),
    emitLandingGear(p),
    emitEmergencySystems(p),
    emitRegulatoryCertificationBasis(p),
  ]

  return {
    modules: modules as unknown as DesignJSON['modules'],
    cross_module_grammar_links: emitCrossModuleGrammarLinks(),
    excluded_modules: [],
    rationale_excluded: 'All 10 canonical modules apply to passenger eVTOL.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Deliver ${p.numPax}-passenger urban air mobility at ${p.cruiseSpeedKmh.toFixed(0)} km/h cruise over ${p.cruiseRangeKm.toFixed(0)} km range from a ${p.mtowKg.toFixed(0)} kg MTOW eVTOL with ${p.numRotors} tilt-rotors, ${p.batteryKwh.toFixed(0)} kWh Li-ion pack, certified to FAA Part 23 / EASA SC-VTOL DAL-A.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('evtol', emitEvtolDesign)
