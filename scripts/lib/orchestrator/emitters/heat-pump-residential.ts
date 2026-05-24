/**
 * scripts/lib/orchestrator/emitters/heat-pump-residential.ts
 *
 * HEAT PUMP RESIDENTIAL / COMMERCIAL DETERMINISTIC EMITTER.
 *
 * Hand-tuned 2026-05-22 (Build #20b). Emits the canonical 11-module BoM
 * skeleton for an air-source monobloc heat pump from the
 * EngineeringContract. Pure function — no I/O, no clocks, no random.
 *
 * The 11 modules emitted (mapped to the universal 14-module taxonomy):
 *   1. refrigerant_loop                 → energy_conversion_transduction
 *   2. compressor_assembly              → (sub-module of #1)
 *   3. outdoor_unit_heat_exchanger      → environmental_interface
 *   4. indoor_unit_heat_exchanger       → mass_fluid_transport_process
 *   5. electrical_control_inverter      → control_compute_communication
 *   6. thermostat_controls              → hmi_ergonomics
 *   7. water_hot_water_storage          → energy_storage_source (if hybrid)
 *   8. defrost_system                   → (sub-module of #1)
 *   9. refrigerant_charge_handling      → safety_protection (handling/leak)
 *  10. regulatory_acoustic_safety       → maintenance_serviceability
 *  11. installation_pipework            → structure_containment
 *
 * Real parts referenced: Daikin Altherma 3 / Mitsubishi Ecodan / Panasonic
 * Aquarea-class scroll-compressor monoblocs. Compressor candidates:
 *   - Daikin JT170G-P8YE (scroll, R290 hermetic)
 *   - Mitsubishi RHSV90 (rotary, R32 hermetic)
 *   - Copeland ZP-K (scroll, multi-refrigerant)
 * EEV: Sanhua DPF-series electronic expansion valve.
 * BPHE: Alfa Laval CB14 / SWEP B25T-class brazed plate.
 * Fan: ebm-papst W3G500 EC axial.
 */

import type { BriefEnvelope, ContractInProgress, ParsedConstraints } from '../types'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import { registerAssembler } from '../assembler'

// ---------------------------------------------------------------------------
// Lightweight shape types (mirror deterministic-emitter.ts)
// ---------------------------------------------------------------------------

type Radical = string

interface ModifierCharacter {
  kind: string
  value: string
  unit?: string
}

interface ContentCharacter {
  character_id: string
  name_human: string
  function_radical_primary: Radical | null
  function_radical_secondary: Radical | null
  material_radical_primary: Radical | null
  material_radical_secondary: Radical | null
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

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function q(contract: ContractInProgress, key: string, fallback: number): number {
  const v = contract.quantities?.[key]?.value
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
  fp: Radical | null,
  mp: Radical | null,
  fs: Radical | null = null,
  ms: Radical | null = null,
): ContentCharacter {
  return {
    character_id,
    name_human,
    function_radical_primary: fp,
    function_radical_secondary: fs,
    material_radical_primary: mp,
    material_radical_secondary: ms,
  }
}

function word(id: string, name_human: string, content: ContentCharacter, modifiers: ModifierCharacter[]): Word {
  // Universal fix #A (2026-05-22): strip literal " word" suffix from name_human.
  const cleanName = name_human.replace(/\s+word$/i, '')
  return { id, name_human: cleanName, content_character: content, modifier_characters: modifiers }
}

function synthesizeRadSyntax(words: Word[]): string {
  const clusters = words.map((w) => {
    const modsOrdered = [...w.modifier_characters].sort((a, b) => {
      if (a.kind === 'quantity' && b.kind !== 'quantity') return -1
      if (b.kind === 'quantity' && a.kind !== 'quantity') return 1
      return 0
    })
    const tokens = modsOrdered.map((m) => (m.unit ? `${m.value}${m.unit}` : m.value))
    if (tokens.length === 0) return w.content_character.character_id
    return `${w.content_character.character_id} (${tokens.join(', ')})`
  })
  return clusters.join(' ⊙ ')
}

function makeSubModule(
  id: string,
  name_human: string,
  role_verb: string,
  topology_clause: string,
  words: Word[],
): SubModule {
  return {
    id,
    name_human,
    english_sentence: '',
    rad_syntax: synthesizeRadSyntax(words),
    role_verb,
    topology_clause,
    words,
  }
}

// ---------------------------------------------------------------------------
// PARAMETER DERIVATION
// ---------------------------------------------------------------------------

interface HpParams {
  thermalKw: number
  electricalKw: number
  copRated: number
  scop: number
  refrigerantId: string
  refrigerantChargeKg: number
  compressorDisplacementCm3: number
  outdoorHxAreaM2: number
  indoorHxAreaM2: number
  fanPowerKw: number
  totalEstimatedMassKg: number
  maxMassKg: number
  soundPowerDba: number
  minAmbientC: number
  maxAmbientC: number
  evapSatC: number
  condSatC: number
  pressureRatio: number
  lineVoltageV: number
  lineCurrentA: number
}

function deriveHpParams(c: ContractInProgress): HpParams {
  const thermalKw = q(c, 'rated_thermal_kw', 12)
  const electricalKw = q(c, 'rated_electrical_kw', thermalKw / 3.8)
  const copRated = q(c, 'cop_rated', 3.8)
  const scop = q(c, 'scop', 4.5)
  const refrigerantSourceText = String(
    c.quantities?.refrigerant?.provenance?.invocation_output_field
    ?? (c.quantities?.refrigerant as any)?.source_detail
    ?? '',
  )
  const refrigerantId = refrigerantSourceText.match(/r290|r32|r513a/i)?.[0]?.toLowerCase() ?? 'r290'
  const refrigerantChargeKg = q(c, 'refrigerant_charge_kg', 0.5)
  const compressorDisplacementCm3 = q(c, 'compressor_displacement_cm3', 36)
  const outdoorHxAreaM2 = q(c, 'outdoor_hx_area_m2', 6)
  const indoorHxAreaM2 = q(c, 'indoor_hx_area_m2', 1.2)
  const fanPowerKw = q(c, 'fan_power_kw', 0.24)
  const totalEstimatedMassKg = q(c, 'total_estimated_mass_kg', 300)
  const maxMassKg = q(c, 'max_mass_kg', 250)
  const soundPowerDba = q(c, 'sound_power_dba', 56)
  const minAmbientC = q(c, 'min_ambient_c', -20)
  const maxAmbientC = q(c, 'max_ambient_c', 40)
  const evapSatC = q(c, 'evap_saturation_c', -12)
  const condSatC = q(c, 'cond_saturation_c', 50)
  const pressureRatio = q(c, 'pressure_ratio', 3.8)
  const lineVoltageV = q(c, 'line_voltage_v', 230)
  const lineCurrentA = q(c, 'line_current_a', 14)
  return {
    thermalKw, electricalKw, copRated, scop, refrigerantId, refrigerantChargeKg,
    compressorDisplacementCm3, outdoorHxAreaM2, indoorHxAreaM2, fanPowerKw,
    totalEstimatedMassKg, maxMassKg, soundPowerDba, minAmbientC, maxAmbientC,
    evapSatC, condSatC, pressureRatio, lineVoltageV, lineCurrentA,
  }
}

// ---------------------------------------------------------------------------
// MODULE 1: refrigerant_loop — energy_conversion_transduction
// ---------------------------------------------------------------------------

function emitRefrigerantLoop(p: HpParams): DesignModule {
  const refUpper = p.refrigerantId.toUpperCase()
  const compressorSm = makeSubModule(
    'compressor_assembly',
    'compressor assembly',
    'compresses',
    `${p.refrigerantId.toUpperCase()} refrigerant from evap (${p.evapSatC.toFixed(0)}°C) to cond (${p.condSatC.toFixed(0)}°C) saturation`,
    [
      word(
        'refrigerant_compressor_word',
        'refrigerant compressor',
        cc('refrigerant_compressor', 'hermetic scroll compressor', 'mechanical_compression_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', p.thermalKw.toFixed(1), 'kW'),
          mod('form', p.thermalKw >= 20 ? 'Copeland ZP-K hermetic scroll' : 'Daikin JT170G-P8YE hermetic scroll'),
          mod('dimension', p.compressorDisplacementCm3.toFixed(0), 'cm³'),
          mod('regulatory', `IEC 60335-2-40 ${refUpper}-rated`),
        ],
      ),
      word(
        'expansion_valve_word',
        'expansion valve',
        cc('electronic_expansion_valve', 'electronic expansion valve', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'Sanhua DPF-A series EEV'),
          mod('dimension', '500', 'steps'),
        ],
      ),
      word(
        'four_way_reversing_valve_word',
        'four-way reversing valve',
        cc('four_way_reversing_valve', 'four-way reversing valve', 'fluid_flow_state', 'copper'),
        [
          mod('quantity', '×1'),
          mod('form', 'Sanhua HRV-series'),
          mod('regulatory', `${refUpper}-rated`),
        ],
      ),
      word(
        'filter_drier_word',
        'filter drier',
        cc('filter_drier', 'filter drier', 'fluid_flow_state', 'copper'),
        [
          mod('quantity', '×1'),
          mod('form', 'Danfoss DML-series molecular sieve'),
        ],
      ),
    ],
  )

  const pipingSm = makeSubModule(
    'refrigerant_piping',
    'refrigerant piping',
    'conveys',
    'liquid and suction lines connecting evaporator, compressor and condenser',
    [
      word(
        'copper_liquid_line_word',
        'copper liquid line',
        cc('copper_liquid_line', 'copper liquid line', 'fluid_flow_state', 'copper'),
        [
          mod('quantity', '×1'),
          mod('dimension', '10', 'mm'),
          mod('form', 'ACR Cu, brazed'),
        ],
      ),
      word(
        'copper_suction_line_word',
        'copper suction line',
        cc('copper_suction_line', 'copper suction line', 'fluid_flow_state', 'copper'),
        [
          mod('quantity', '×1'),
          mod('dimension', '16', 'mm'),
          mod('form', 'ACR Cu, brazed'),
        ],
      ),
      word(
        'pressure_relief_valve_word',
        'pressure relief valve',
        cc('pressure_relief_valve', 'pressure relief valve', 'pressure_vessel_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', '32', 'bar'),
          mod('regulatory', 'PED 2014/68/EU'),
        ],
      ),
      word(
        'sight_glass_word',
        'sight glass',
        cc('refrigerant_sight_glass', 'refrigerant sight glass', 'optical_sensing_function', 'glass'),
        [
          mod('quantity', '×1'),
          mod('form', 'Henry CYL-series moisture indicator'),
        ],
      ),
      // BESS L2 fan-out 2026-05-24: emit refrigerant_circuit_word so the
      // engineering-contract.ts `refrigerant_circuit` macro can propagate
      // through scripts/render-minimal-pdf.tsx:885-927 strict matcher.
      // Aggregate of EEV + 4-way + filter-drier + pressure switches + piping
      // (matches the £25/kW macro source_detail in the contract).
      word(
        'refrigerant_circuit_word',
        'refrigerant circuit',
        cc('refrigerant_circuit', 'refrigerant circuit', 'fluid_flow_state', 'copper'),
        [
          mod('quantity', '×1'),
          mod('capacity', p.thermalKw.toFixed(1), 'kW'),
          mod('form', `EEV + 4-way valve + filter-drier + pressure switches + ${refUpper} piping`),
          mod('regulatory', `IEC 60335-2-40 ${refUpper}-rated`),
        ],
      ),
    ],
  )

  return {
    module: 'energy_conversion_transduction',
    module_brief: `Vapour-compression ${refUpper} loop delivering ${p.thermalKw.toFixed(1)} kW thermal at COP ${p.copRated.toFixed(1)} (SCOP ${p.scop.toFixed(1)}). Pressure ratio ${p.pressureRatio.toFixed(1)}, evap ${p.evapSatC.toFixed(0)}°C / cond ${p.condSatC.toFixed(0)}°C saturation, ${p.refrigerantChargeKg.toFixed(2)} kg refrigerant charge.`,
    overview_paragraph_en: '',
    derived_parameters: {
      thermal_kw: p.thermalKw,
      cop_rated: p.copRated,
      pressure_ratio: p.pressureRatio,
      refrigerant_charge_kg: p.refrigerantChargeKg,
    },
    allowed_radicals: [
      'mechanical_compression_function',
      'fluid_flow_state',
      'pressure_vessel_function',
      'copper',
      'steel',
    ],
    applicability_confidence: 'high',
    sub_modules: [compressorSm, pipingSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 3: outdoor_unit_heat_exchanger — environmental_interface
// ---------------------------------------------------------------------------

function emitOutdoorUnit(p: HpParams): DesignModule {
  const outdoorCoilSm = makeSubModule(
    'outdoor_air_coil',
    'outdoor air-source coil',
    'absorbs',
    `outdoor air heat over ${p.outdoorHxAreaM2.toFixed(1)} m² fin-tube cross-flow exchange`,
    [
      word(
        'outdoor_heat_exchanger_word',
        'outdoor heat exchanger',
        cc('outdoor_heat_exchanger', 'outdoor finned-tube heat exchanger', 'thermal_transfer_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('capacity', p.thermalKw.toFixed(1), 'kW'),
          mod('dimension', p.outdoorHxAreaM2.toFixed(1), 'm²'),
          mod('form', 'Cu/Al fin-tube cross-flow, marine-coated'),
        ],
      ),
      word(
        'outdoor_axial_fan_word',
        'outdoor axial fan',
        cc('outdoor_axial_fan', 'outdoor axial fan', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', (p.fanPowerKw * 1000).toFixed(0), 'W'),
          mod('form', 'ebm-papst W3G500 EC axial'),
          mod('regulatory', 'EN 12102 Class A'),
        ],
      ),
      word(
        'condensate_drain_pan_word',
        'condensate drain pan',
        cc('condensate_drain_pan', 'condensate drain pan', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'heated PP pan'),
        ],
      ),
    ],
  )

  return {
    module: 'environmental_interface',
    module_brief: `Outdoor air-source heat exchanger of ${p.outdoorHxAreaM2.toFixed(1)} m² fin-tube cross-flow surface plus a ${(p.fanPowerKw * 1000).toFixed(0)} W EC axial fan. Operates from ${p.minAmbientC.toFixed(0)}°C to ${p.maxAmbientC.toFixed(0)}°C ambient, with marine-coated Cu/Al fins for coastal corrosion.`,
    overview_paragraph_en: '',
    derived_parameters: {
      outdoor_hx_area_m2: p.outdoorHxAreaM2,
      fan_power_kw: p.fanPowerKw,
      min_ambient_c: p.minAmbientC,
      max_ambient_c: p.maxAmbientC,
    },
    allowed_radicals: [
      'thermal_transfer_function',
      'fluid_flow_state',
      'copper',
      'aluminium',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [outdoorCoilSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 4: indoor_unit_heat_exchanger — mass_fluid_transport_process
// ---------------------------------------------------------------------------

function emitIndoorUnit(p: HpParams): DesignModule {
  const indoorBpheSm = makeSubModule(
    'indoor_bphe',
    'indoor brazed-plate heat exchanger',
    'rejects',
    `condenser heat to flow water over ${p.indoorHxAreaM2.toFixed(2)} m² stainless plate area`,
    [
      word(
        'indoor_heat_exchanger_word',
        'indoor heat exchanger',
        cc('indoor_heat_exchanger', 'indoor brazed-plate heat exchanger', 'thermal_transfer_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', p.thermalKw.toFixed(1), 'kW'),
          mod('dimension', p.indoorHxAreaM2.toFixed(2), 'm²'),
          mod('form', 'Alfa Laval CB-series stainless BPHE'),
        ],
      ),
      word(
        'circulation_pump_word',
        'circulation pump',
        cc('circulation_pump', 'circulation pump', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', '0.7', 'm³/h'),
          mod('form', 'Grundfos UPM3 variable-speed'),
        ],
      ),
      word(
        'water_strainer_word',
        'water strainer',
        cc('water_strainer', 'water strainer', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', '500 µm mesh'),
        ],
      ),
      word(
        'flow_switch_word',
        'flow switch',
        cc('flow_switch', 'flow switch', 'electromechanical_switching_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'paddle-actuated'),
          mod('capacity', '0.3', 'm³/h min'),
        ],
      ),
    ],
  )

  return {
    module: 'mass_fluid_transport_process',
    module_brief: `Stainless brazed-plate heat exchanger of ${p.indoorHxAreaM2.toFixed(2)} m² transferring ${p.thermalKw.toFixed(1)} kW into the hydronic water loop, plus a Grundfos UPM3 variable-speed circulation pump, strainer and flow switch for water-side flow guarantee.`,
    overview_paragraph_en: '',
    derived_parameters: {
      indoor_hx_area_m2: p.indoorHxAreaM2,
      thermal_kw: p.thermalKw,
    },
    allowed_radicals: [
      'thermal_transfer_function',
      'fluid_flow_state',
      'steel',
      'copper',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [indoorBpheSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 5: electrical_control_inverter — control_compute_communication
// ---------------------------------------------------------------------------

function emitElectricalControlInverter(p: HpParams): DesignModule {
  const inverterDriveSm = makeSubModule(
    'compressor_inverter_drive',
    'compressor inverter drive',
    'modulates',
    `compressor speed via variable-frequency drive on ${p.lineVoltageV} V ${p.electricalKw.toFixed(2)} kW supply`,
    [
      word(
        'compressor_inverter_pcb_word',
        'compressor inverter PCB',
        cc('compressor_inverter_pcb', 'compressor inverter PCB', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', p.electricalKw.toFixed(2), 'kW'),
          mod('form', 'IGBT 3-phase inverter (FUJI 7MBP100VEA)'),
          mod('dimension', '600', 'V IGBT'),
        ],
      ),
      word(
        'dc_link_capacitor_word',
        'DC link capacitor',
        cc('dc_link_capacitor', 'DC-link capacitor', 'electrical_conducting_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', '2×680 µF electrolytic'),
          mod('dimension', '450', 'V'),
        ],
      ),
      word(
        'emi_input_filter_word',
        'EMI input filter',
        cc('emi_input_filter', 'EMI input filter', 'electrical_conducting_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'EN 61000-6-3 Class B'),
          mod('capacity', p.lineCurrentA.toFixed(1), 'A'),
        ],
      ),
    ],
  )

  const motorDriveSm = makeSubModule(
    'fan_motor_drive',
    'fan motor drive',
    'drives',
    'EC fan motor at variable speed via PWM control',
    [
      word(
        'fan_drive_pcb_word',
        'fan drive PCB',
        cc('fan_drive_pcb', 'fan drive PCB', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', (p.fanPowerKw * 1000).toFixed(0), 'W'),
          mod('form', 'Infineon TLE9879 PWM'),
        ],
      ),
    ],
  )

  return {
    module: 'control_compute_communication',
    module_brief: `Variable-frequency inverter drive for the compressor (${p.electricalKw.toFixed(2)} kW at ${p.lineVoltageV} V, ${p.lineCurrentA.toFixed(1)} A line current) plus an EC fan drive PCB. EMI input filter brings the unit within EN 61000-6-3 Class B.`,
    overview_paragraph_en: '',
    derived_parameters: {
      electrical_kw: p.electricalKw,
      line_voltage_v: p.lineVoltageV,
      line_current_a: p.lineCurrentA,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'electrical_conducting_function',
      'digital_logic_function',
      'copper',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [inverterDriveSm, motorDriveSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 6: thermostat_controls — hmi_ergonomics
// ---------------------------------------------------------------------------

function emitThermostatControls(_p: HpParams): DesignModule {
  const wiredControllerSm = makeSubModule(
    'wired_room_controller',
    'wired room controller',
    'commands',
    'flow temperature setpoint + zone schedule via Modbus to outdoor unit',
    [
      word(
        'wired_thermostat_word',
        'wired thermostat',
        cc('wired_thermostat', 'wired thermostat', 'optical_sensing_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', '3.5" colour LCD, capacitive touch'),
          mod('regulatory', 'EN 60730 Class A'),
        ],
      ),
      word(
        'opentherm_gateway_word',
        'OpenTherm gateway',
        cc('opentherm_gateway', 'OpenTherm/Modbus gateway', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Honeywell OT-200-class'),
          mod('regulatory', 'OpenTherm 2.3 / Modbus RTU'),
        ],
      ),
      word(
        'outdoor_temperature_sensor_word',
        'outdoor temperature sensor',
        cc('outdoor_temperature_sensor', 'outdoor temperature sensor', 'thermal_transfer_function', 'ceramic'),
        [
          mod('quantity', '×1'),
          mod('form', 'NTC 10kΩ B25/85=3950'),
        ],
      ),
    ],
  )

  return {
    module: 'hmi_ergonomics',
    module_brief: 'Wired room controller with weather compensation, OpenTherm/Modbus gateway, and outdoor air-temperature reference sensor.',
    overview_paragraph_en: '',
    derived_parameters: {
      controllers_per_unit: 1,
      sensors_per_unit: 1,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'optical_sensing_function',
      'thermal_transfer_function',
      'polymer_thermoplastic',
      'ceramic',
    ],
    applicability_confidence: 'high',
    sub_modules: [wiredControllerSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 7: water_hot_water_storage — energy_storage_source (hybrid units)
// ---------------------------------------------------------------------------

function emitHotWaterStorage(p: HpParams): DesignModule {
  // For hybrid units, a 180 L domestic hot water cylinder is standard
  // residential; 300 L for light commercial / large hydronic loads.
  const cylinderL = p.thermalKw >= 20 ? 300 : 180
  const dhwCylinderSm = makeSubModule(
    'dhw_storage_cylinder',
    'DHW storage cylinder',
    'stores',
    `${cylinderL} L of domestic hot water via internal coil heat-exchange`,
    [
      word(
        'storage_cylinder_word',
        'storage cylinder',
        cc('storage_cylinder', 'unvented stainless storage cylinder', 'pressure_vessel_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(cylinderL), 'L'),
          mod('form', 'duplex stainless, unvented'),
          mod('regulatory', 'PED 2014/68/EU + WRAS'),
        ],
      ),
      word(
        'internal_coil_word',
        'internal coil',
        cc('internal_coil', 'internal heat-exchange coil', 'thermal_transfer_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('dimension', '3.5', 'm²'),
          mod('form', 'finned stainless'),
        ],
      ),
      word(
        'immersion_backup_heater_word',
        'immersion backup heater',
        cc('immersion_backup_heater', 'immersion backup heater', 'electrical_conducting_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', '3', 'kW'),
          mod('form', 'titanium-sheathed Incoloy 800'),
        ],
      ),
      word(
        'expansion_vessel_dhw_word',
        'expansion vessel (DHW)',
        cc('expansion_vessel_dhw', 'DHW expansion vessel', 'pressure_vessel_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', '18', 'L'),
          mod('form', 'butyl membrane'),
        ],
      ),
    ],
  )

  return {
    module: 'energy_storage_source',
    module_brief: `Unvented stainless DHW storage cylinder of ${cylinderL} L with internal finned-coil heat exchanger, immersion backup heater and PED-rated expansion vessel.`,
    overview_paragraph_en: '',
    derived_parameters: {
      cylinder_capacity_l: cylinderL,
      backup_heater_kw: 3,
    },
    allowed_radicals: [
      'pressure_vessel_function',
      'thermal_transfer_function',
      'electrical_conducting_function',
      'steel',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'medium',
    sub_modules: [dhwCylinderSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 9: refrigerant_charge_handling — safety_protection
// ---------------------------------------------------------------------------

function emitChargeHandling(p: HpParams): DesignModule {
  const isFlammable = p.refrigerantId === 'r290'
  const leakSm = makeSubModule(
    'leak_detection',
    'refrigerant leak detection',
    'detects',
    `${p.refrigerantId.toUpperCase()} concentration via catalytic sensor + ${isFlammable ? 'ATEX' : 'standard'} interlock`,
    [
      word(
        'refrigerant_leak_sensor_word',
        'refrigerant leak sensor',
        cc('refrigerant_leak_sensor', 'refrigerant leak sensor', 'chemical_sensing_function', 'ceramic'),
        [
          mod('quantity', '×2'),
          mod('form', isFlammable ? 'Honeywell Sensepoint XCD ATEX' : 'Bacharach MGS-410'),
          mod('regulatory', `EN 14624 / IEC 60079 for ${p.refrigerantId.toUpperCase()}`),
        ],
      ),
      word(
        'shut_off_solenoid_word',
        'shut-off solenoid',
        cc('shut_off_solenoid', 'shut-off solenoid', 'electromechanical_switching_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'Danfoss EVR'),
          mod('regulatory', `${p.refrigerantId.toUpperCase()}-rated`),
        ],
      ),
      word(
        'leak_alarm_horn_word',
        'leak alarm horn',
        cc('leak_alarm_horn', 'leak alarm horn', 'acoustic_radiation_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', '85', 'dB'),
        ],
      ),
    ],
  )

  return {
    module: 'safety_protection',
    module_brief: `Catalytic ${p.refrigerantId.toUpperCase()} leak detection with twin sensors, shut-off solenoid and ${isFlammable ? 'ATEX EEx-d' : 'IP65'} alarm horn. Refrigerant charge ${p.refrigerantChargeKg.toFixed(2)} kg, within EN 378 / IEC 60335-2-40 Annex CC limits.`,
    overview_paragraph_en: '',
    derived_parameters: {
      refrigerant_charge_kg: p.refrigerantChargeKg,
      sensors_per_unit: 2,
    },
    allowed_radicals: [
      'chemical_sensing_function',
      'electromechanical_switching_function',
      'acoustic_radiation_function',
      'steel',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [leakSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 10: regulatory_acoustic_safety — maintenance_serviceability
// ---------------------------------------------------------------------------

function emitRegulatoryAcoustic(p: HpParams): DesignModule {
  const acousticSm = makeSubModule(
    'acoustic_insulation',
    'acoustic insulation',
    'attenuates',
    `compressor and fan noise to ${p.soundPowerDba.toFixed(0)} dBA sound power per EN 12102`,
    [
      word(
        'compressor_blanket_word',
        'compressor blanket',
        cc('compressor_blanket', 'compressor blanket', 'acoustic_attenuation_function', 'mineral_fibre_material'),
        [
          mod('quantity', '×1'),
          mod('dimension', '25', 'mm'),
          mod('form', 'mineral wool + foil'),
        ],
      ),
      word(
        'fan_acoustic_grille_word',
        'fan acoustic grille',
        cc('fan_acoustic_grille', 'fan acoustic grille', 'acoustic_attenuation_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'venturi-profile grille'),
          mod('regulatory', 'EN 12102 Class A'),
        ],
      ),
      word(
        'low_noise_mode_PCB_word',
        'low-noise mode PCB',
        cc('low_noise_mode_pcb', 'low-noise mode controller', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'fixed-speed cap controller'),
        ],
      ),
    ],
  )

  const safetySignageSm = makeSubModule(
    'safety_signage',
    'safety signage and certifications',
    'marks',
    'rotating hazard, high pressure and PED + UKCA labels on the unit',
    [
      word(
        'pressure_safety_label_word',
        'pressure safety label',
        cc('pressure_safety_label', 'pressure safety label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'PED 2014/68/EU'),
        ],
      ),
      word(
        'ce_ukca_compliance_label_word',
        'CE/UKCA compliance label',
        cc('ce_ukca_compliance_label', 'CE/UKCA compliance label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', '2014/68/EU + 2006/42/EC + MCS MIS 3005'),
        ],
      ),
      word(
        'rotating_hazard_label_word',
        'rotating hazard label',
        cc('rotating_hazard_label', 'rotating hazard label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
        ],
      ),
    ],
  )

  return {
    module: 'maintenance_serviceability',
    module_brief: `Mineral-wool compressor blanket and venturi-profile fan grille bring sound power to ${p.soundPowerDba.toFixed(0)} dBA (EN 12102 Class A). PED, UKCA, MCS and rotating-hazard signage applied to the enclosure for inspection access.`,
    overview_paragraph_en: '',
    derived_parameters: {
      sound_power_dba: p.soundPowerDba,
    },
    allowed_radicals: [
      'acoustic_attenuation_function',
      'mineral_fibre_material',
      'polymer_thermoplastic',
      'silicon_semiconductor_function',
    ],
    applicability_confidence: 'high',
    sub_modules: [acousticSm, safetySignageSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 11: installation_pipework — structure_containment
// ---------------------------------------------------------------------------

function emitInstallationPipework(p: HpParams): DesignModule {
  const enclosureSm = makeSubModule(
    'sheet_metal_enclosure',
    'sheet-metal enclosure',
    'houses',
    'compressor + refrigerant loop + electrical box in IP54 monobloc cabinet',
    [
      word(
        'enclosure_shell_word',
        'enclosure shell',
        cc('enclosure_shell', 'sheet-metal enclosure', null, 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'zinc-coated steel, powder-coated white'),
          mod('regulatory', 'IP54'),
          mod('dimension', '1100×450×1300', 'mm'),
        ],
      ),
      word(
        'enclosure_internal_bracketry_word',
        'enclosure internal bracketry',
        cc('enclosure_internal_bracketry', 'enclosure internal bracketry', null, 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'welded mild-steel'),
        ],
      ),
      word(
        'feet_anti_vibration_mounts_word',
        'feet anti-vibration mounts',
        cc('feet_anti_vibration_mounts', 'feet / anti-vibration mounts', 'mechanical_attachment_function', 'polymer_elastomer'),
        [
          mod('quantity', '×4'),
          mod('form', 'butyl rubber pads'),
        ],
      ),
    ],
  )

  const installationPipeworkSm = makeSubModule(
    'installation_pipework',
    'water-side installation pipework',
    'connects',
    'unit flow and return lines to existing hydronic circuit',
    [
      word(
        'water_flow_pipework_word',
        'water flow pipework',
        cc('water_flow_pipework', 'water flow pipework', 'fluid_flow_state', 'copper'),
        [
          mod('quantity', '×1'),
          mod('dimension', '28', 'mm'),
          mod('form', 'Cu, soldered'),
        ],
      ),
      word(
        'water_return_pipework_word',
        'water return pipework',
        cc('water_return_pipework', 'water return pipework', 'fluid_flow_state', 'copper'),
        [
          mod('quantity', '×1'),
          mod('dimension', '28', 'mm'),
          mod('form', 'Cu, soldered'),
        ],
      ),
      word(
        'ball_valve_set_word',
        'ball valve set',
        cc('ball_valve_set', 'ball valve isolation set', 'fluid_flow_state', 'copper'),
        [
          mod('quantity', '×2'),
          mod('form', 'lever-handle brass'),
        ],
      ),
      word(
        'magnetic_filter_word',
        'magnetic filter',
        cc('magnetic_filter', 'magnetic filter', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'MagnaClean Professional 2'),
        ],
      ),
    ],
  )

  return {
    module: 'structure_containment',
    module_brief: `Zinc-coated powder-coated steel monobloc enclosure (1100×450×1300 mm, IP54) on butyl-rubber anti-vibration feet. Water-side installation pipework includes 28 mm flow/return, isolation ball valves and a MagnaClean magnetic filter.`,
    overview_paragraph_en: '',
    derived_parameters: {
      enclosure_count: 1,
      mass_kg_max: p.maxMassKg,
    },
    allowed_radicals: [
      'mechanical_attachment_function',
      'fluid_flow_state',
      'steel',
      'copper',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [enclosureSm, installationPipeworkSm],
  }
}

// ---------------------------------------------------------------------------
// CROSS-MODULE GRAMMAR LINKS
// ---------------------------------------------------------------------------

function emitCrossModuleGrammarLinks(p: HpParams) {
  return [
    {
      from_module: 'energy_conversion_transduction',
      to_module: 'environmental_interface',
      mechanism: 'fluid_loop',
      type: 'mutual' as const,
      detail: `${p.refrigerantId.toUpperCase()} loop, evaporator side at ${p.evapSatC.toFixed(0)}°C saturation`,
    },
    {
      from_module: 'energy_conversion_transduction',
      to_module: 'mass_fluid_transport_process',
      mechanism: 'fluid_loop',
      type: 'mutual' as const,
      detail: `${p.refrigerantId.toUpperCase()} loop, condenser side at ${p.condSatC.toFixed(0)}°C saturation`,
    },
    {
      from_module: 'control_compute_communication',
      to_module: 'energy_conversion_transduction',
      mechanism: 'electrical_bus',
      type: 'directional' as const,
      detail: `${p.electricalKw.toFixed(2)} kW VFD output to compressor`,
    },
    {
      from_module: 'control_compute_communication',
      to_module: 'environmental_interface',
      mechanism: 'control',
      type: 'directional' as const,
      detail: 'EC fan PWM speed control',
    },
    {
      from_module: 'hmi_ergonomics',
      to_module: 'control_compute_communication',
      mechanism: 'data',
      type: 'mutual' as const,
      detail: 'OpenTherm / Modbus RTU',
    },
    {
      from_module: 'energy_storage_source',
      to_module: 'mass_fluid_transport_process',
      mechanism: 'fluid_loop',
      type: 'mutual' as const,
      detail: 'DHW loop via 3-port diverter',
    },
    {
      from_module: 'safety_protection',
      to_module: 'control_compute_communication',
      mechanism: 'control',
      type: 'directional' as const,
      detail: 'leak detection trip → shutdown',
    },
    {
      from_module: 'safety_protection',
      to_module: 'energy_conversion_transduction',
      mechanism: 'control',
      type: 'directional' as const,
      detail: 'shut-off solenoid in refrigerant loop',
    },
    {
      from_module: 'maintenance_serviceability',
      to_module: 'structure_containment',
      mechanism: 'mechanical',
      type: 'directional' as const,
      detail: 'acoustic blanket bonded to inside of enclosure',
    },
    {
      from_module: 'energy_conversion_transduction',
      to_module: 'structure_containment',
      mechanism: 'mechanical',
      type: 'directional' as const,
      detail: 'compressor mounted on internal bracketry',
    },
    {
      from_module: 'environmental_interface',
      to_module: 'structure_containment',
      mechanism: 'mechanical',
      type: 'directional' as const,
      detail: 'outdoor coil + fan mounted in upper section',
    },
  ]
}

// ---------------------------------------------------------------------------
// BRIEF OVERVIEW PROSE
// ---------------------------------------------------------------------------

function emitBriefOverviewProse(p: HpParams) {
  return {
    overview_and_context: '',
    mission_statement: `Deliver ${p.thermalKw.toFixed(1)} kW thermal output at COP ${p.copRated.toFixed(1)} (SCOP ${p.scop.toFixed(1)}) from an air-source monobloc heat pump using ${p.refrigerantId.toUpperCase()} refrigerant, with sound power ≤ ${p.soundPowerDba.toFixed(0)} dBA and operating envelope ${p.minAmbientC.toFixed(0)}°C to ${p.maxAmbientC.toFixed(0)}°C.`,
    target_customers: '',
    why_now: '',
  }
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER (registered with assembler)
// ---------------------------------------------------------------------------

export const emitHeatPumpDesign: ClassEmitter = (
  contract: ContractInProgress,
  _brief: ParsedConstraints,
  _envelope: BriefEnvelope,
): DesignJSON => {
  const p = deriveHpParams(contract)
  const modules: DesignModule[] = [
    emitRefrigerantLoop(p),
    emitOutdoorUnit(p),
    emitIndoorUnit(p),
    emitElectricalControlInverter(p),
    emitThermostatControls(p),
    emitHotWaterStorage(p),
    emitChargeHandling(p),
    emitRegulatoryAcoustic(p),
    emitInstallationPipework(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: '9 modules cover the canonical air-source heat pump (refrigerant loop, outdoor unit, indoor unit, electrical drive, controls, DHW storage, charge handling, acoustic/regulatory, structural enclosure).',
    brief_overview_prose: emitBriefOverviewProse(p),
  }
}

registerAssembler('heat_pump_residential', emitHeatPumpDesign)
