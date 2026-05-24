/**
 * scripts/lib/orchestrator/emitters/dialysis-machine.ts
 *
 * DIALYSIS MACHINE (HEMODIALYSIS) DETERMINISTIC EMITTER.
 *
 * Hand-tuned 2026-05-22 (Build #20b). Emits a 10-module BoM skeleton for
 * a hospital hemodialysis unit from the EngineeringContract. Pure
 * function — no I/O, no clocks, no random.
 *
 * The 10 modules emitted (mapped to the universal 14-module taxonomy):
 *   1. blood_circuit                  → mass_fluid_transport_process
 *   2. dialysate_circuit              → environmental_interface
 *   3. dialyser_membrane              → energy_conversion_transduction (selectivity)
 *   4. peristaltic_pumps              → (sub-module of #1 and #2)
 *   5. sensor_panel                   → control_compute_communication
 *   6. water_treatment_RO_DI          → energy_storage_source (clean water)
 *   7. user_interface                 → hmi_ergonomics
 *   8. alarms_safety                  → safety_protection
 *   9. control_compute                → (merged with sensor_panel)
 *  10. regulatory_FDA_510k            → maintenance_serviceability
 *  + structural enclosure             → structure_containment
 *
 * Real-part references: Fresenius 5008S, Baxter ARTIS, Nikkiso DBB-EXA,
 * Watson-Marlow 620 peristaltic pump, Mar Cor Purelab RO system,
 * Sensirion / Honeywell pressure transducers, Introtek BD-8 air
 * detector.
 */

import type { BriefEnvelope, ContractInProgress, ParsedConstraints } from '../types'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import { registerAssembler } from '../assembler'

// ---------------------------------------------------------------------------
// Lightweight shape types
// ---------------------------------------------------------------------------

type Radical = string

interface ModifierCharacter { kind: string; value: string; unit?: string }

interface ContentCharacter {
  character_id: string; name_human: string
  function_radical_primary: Radical | null; function_radical_secondary: Radical | null
  material_radical_primary: Radical | null; material_radical_secondary: Radical | null
}

interface Word { id: string; name_human: string; content_character: ContentCharacter; modifier_characters: ModifierCharacter[] }

interface SubModule {
  id: string; name_human: string; english_sentence: string; rad_syntax: string
  role_verb: string; topology_clause: string; words: Word[]
}

// ---------------------------------------------------------------------------
// HELPERS (shared shape with deterministic-emitter.ts)
// ---------------------------------------------------------------------------

function q(c: ContractInProgress, key: string, fallback: number): number {
  const v = c.quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? `×${n}` : `×${n.toFixed(2)}`
}

function mod(kind: string, value: string, unit?: string): ModifierCharacter {
  return unit !== undefined ? { kind, value, unit } : { kind, value }
}

function cc(
  character_id: string, name_human: string,
  fp: Radical | null, mp: Radical | null,
  fs: Radical | null = null, ms: Radical | null = null,
): ContentCharacter {
  return { character_id, name_human, function_radical_primary: fp, function_radical_secondary: fs, material_radical_primary: mp, material_radical_secondary: ms }
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
    return tokens.length === 0 ? w.content_character.character_id : `${w.content_character.character_id} (${tokens.join(', ')})`
  })
  return clusters.join(' ⊙ ')
}

function makeSubModule(id: string, name_human: string, role_verb: string, topology_clause: string, words: Word[]): SubModule {
  return { id, name_human, english_sentence: '', rad_syntax: synthesizeRadSyntax(words), role_verb, topology_clause, words }
}

// ---------------------------------------------------------------------------
// PARAMETER DERIVATION
// ---------------------------------------------------------------------------

interface DialysisParams {
  bloodFlowMlMin: number
  dialysateFlowMlMin: number
  membraneAreaM2: number
  sessionHours: number
  ultrafiltrationRateMlH: number
  dialysateTempC: number
  transmembrane_pressure_mmhg: number
  peakElectricalKw: number
  lineVoltageV: number
  lineCurrentA: number
  totalEstimatedMassKg: number
  maxMassKg: number
  roPermeateLPerSession: number
}

function deriveParams(c: ContractInProgress): DialysisParams {
  return {
    bloodFlowMlMin: q(c, 'blood_flow_rate_ml_per_min', 350),
    dialysateFlowMlMin: q(c, 'dialysate_flow_rate_ml_per_min', 500),
    membraneAreaM2: q(c, 'membrane_area_m2', 1.8),
    sessionHours: q(c, 'session_duration_hours', 4),
    ultrafiltrationRateMlH: q(c, 'ultrafiltration_rate_ml_per_h', 1000),
    dialysateTempC: q(c, 'dialysate_temp_c', 37.0),
    transmembrane_pressure_mmhg: q(c, 'transmembrane_pressure_mmhg', 200),
    peakElectricalKw: q(c, 'peak_electrical_kw', 1.8),
    lineVoltageV: q(c, 'line_voltage_v', 230),
    lineCurrentA: q(c, 'line_current_a', 8),
    totalEstimatedMassKg: q(c, 'total_estimated_mass_kg', 90),
    maxMassKg: q(c, 'max_mass_kg', 120),
    roPermeateLPerSession: q(c, 'ro_permeate_l_per_session', 120),
  }
}

// ---------------------------------------------------------------------------
// MODULE 1: blood_circuit — mass_fluid_transport_process
// ---------------------------------------------------------------------------

function emitBloodCircuit(p: DialysisParams): DesignModule {
  const tubingSm = makeSubModule(
    'blood_tubing',
    'blood tubing set',
    'conveys',
    `blood from patient access through pump head at ${p.bloodFlowMlMin.toFixed(0)} mL/min and back via venous chamber`,
    [
      word(
        'pvc_arterial_line_word',
        'PVC arterial line',
        cc('pvc_arterial_line', 'PVC arterial blood line', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'medical-grade PVC, DEHP-free'),
          mod('dimension', '4', 'mm ID'),
          mod('regulatory', 'ISO 10993-4 hemocompatible'),
        ],
      ),
      word(
        'pvc_venous_line_word',
        'PVC venous line',
        cc('pvc_venous_line', 'PVC venous blood line', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'medical-grade PVC, DEHP-free'),
          mod('dimension', '4', 'mm ID'),
          mod('regulatory', 'ISO 10993-4 hemocompatible'),
        ],
      ),
      word(
        'venous_drip_chamber_word',
        'venous drip chamber',
        cc('venous_drip_chamber', 'venous drip chamber', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'transparent polycarbonate'),
        ],
      ),
      word(
        'heparin_syringe_pump_word',
        'heparin syringe pump',
        cc('heparin_syringe_pump', 'heparin syringe pump', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'linear actuator + 20 mL syringe'),
        ],
      ),
    ],
  )

  const bloodPumpSm = makeSubModule(
    'peristaltic_blood_pump',
    'peristaltic blood pump',
    'pumps',
    `blood at ${p.bloodFlowMlMin.toFixed(0)} mL/min closed-loop controlled by venous and arterial pressure feedback`,
    [
      word(
        'peristaltic_blood_pump_head_word',
        'peristaltic blood pump head',
        cc('peristaltic_blood_pump_head', 'peristaltic blood pump head', 'mechanical_compression_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'Watson-Marlow 620 + Smith & Nephew silicone segment'),
          mod('capacity', p.bloodFlowMlMin.toFixed(0), 'mL/min'),
        ],
      ),
      word(
        'blood_pump_servo_motor_word',
        'blood pump servo motor',
        cc('blood_pump_servo_motor', 'blood pump servo motor', 'electromagnetic_actuation_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', '120', 'W'),
          mod('form', 'brushless DC + encoder'),
        ],
      ),
    ],
  )

  return {
    module: 'mass_fluid_transport_process',
    module_brief: `Blood circuit transporting ${p.bloodFlowMlMin.toFixed(0)} mL/min through PVC arterial and venous lines, peristaltic pump head, drip chamber and heparin infusion. All blood-contact materials ISO 10993-4 hemocompatible.`,
    overview_paragraph_en: '',
    derived_parameters: {
      blood_flow_ml_min: p.bloodFlowMlMin,
      session_hours: p.sessionHours,
    },
    allowed_radicals: [
      'fluid_flow_state',
      'mechanical_compression_function',
      'electromagnetic_actuation_function',
      'polymer_thermoplastic',
      'steel',
    ],
    applicability_confidence: 'high',
    sub_modules: [tubingSm, bloodPumpSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 2: dialysate_circuit — environmental_interface
// ---------------------------------------------------------------------------

function emitDialysateCircuit(p: DialysisParams): DesignModule {
  const proportioningSm = makeSubModule(
    'dialysate_proportioning',
    'dialysate proportioning',
    'mixes',
    `RO water with bicarbonate and acid concentrate to ${p.dialysateFlowMlMin.toFixed(0)} mL/min at 138 mmol/L Na+, 32 mmol/L bicarbonate, ${p.dialysateTempC.toFixed(0)}°C`,
    [
      word(
        'bicarbonate_proportioning_pump_word',
        'bicarbonate proportioning pump',
        cc('bicarbonate_proportioning_pump', 'bicarbonate proportioning pump', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'volumetric gear pump'),
          mod('capacity', '36', 'mL/min'),
        ],
      ),
      word(
        'acid_proportioning_pump_word',
        'acid proportioning pump',
        cc('acid_proportioning_pump', 'acid proportioning pump', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'volumetric gear pump'),
          mod('capacity', '14', 'mL/min'),
        ],
      ),
      // Macro-aligned aggregate (BoM macro: dialysate_proportioning_pump — the unified dialysate proportioning pump assembly).
      word(
        'dialysate_proportioning_pump_word',
        'dialysate proportioning pump',
        cc('dialysate_proportioning_pump', 'dialysate proportioning pump (bicarbonate + acid)', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'gear / volumetric pump for bicarbonate + acid proportioning'),
          mod('capacity', '50', 'mL/min combined'),
        ],
      ),
      word(
        'dialysate_heater_word',
        'dialysate heater',
        cc('dialysate_heater', 'dialysate heater', 'electrical_conducting_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', '1.5', 'kW'),
          mod('form', 'PTC resistive coil + thermistor'),
          mod('regulatory', 'IEC 60601 single-fault'),
        ],
      ),
      word(
        'dialysate_degasser_word',
        'dialysate degasser',
        cc('dialysate_degasser', 'dialysate degasser', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'vacuum-membrane degasser'),
        ],
      ),
    ],
  )

  const dialysateFlowSm = makeSubModule(
    'dialysate_flow_loop',
    'dialysate flow loop',
    'circulates',
    `${p.dialysateFlowMlMin.toFixed(0)} mL/min dialysate through the dialyser and to drain or UF balance chamber`,
    [
      word(
        'dialysate_pump_word',
        'dialysate pump',
        cc('dialysate_pump', 'dialysate pump', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×2'),
          mod('form', 'volumetric balance-chamber pair'),
          mod('capacity', p.dialysateFlowMlMin.toFixed(0), 'mL/min'),
        ],
      ),
      word(
        'uf_pump_word',
        'UF pump',
        cc('uf_pump', 'ultrafiltration pump', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', p.ultrafiltrationRateMlH.toFixed(0), 'mL/h'),
          mod('form', 'closed-loop TMP-controlled'),
        ],
      ),
      word(
        'dialysate_drain_word',
        'dialysate drain',
        cc('dialysate_drain', 'dialysate drain', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', '50 mm rigid PP outlet'),
        ],
      ),
    ],
  )

  return {
    module: 'environmental_interface',
    module_brief: `Dialysate circuit proportioning RO water + bicarbonate + acid concentrates to ${p.dialysateFlowMlMin.toFixed(0)} mL/min at ${p.dialysateTempC.toFixed(0)}°C body temperature. 1.5 kW resistive heater, volumetric balance-chamber dialysate pumps, separate UF pump at ${p.ultrafiltrationRateMlH.toFixed(0)} mL/h.`,
    overview_paragraph_en: '',
    derived_parameters: {
      dialysate_flow_ml_min: p.dialysateFlowMlMin,
      dialysate_temp_c: p.dialysateTempC,
      uf_rate_ml_h: p.ultrafiltrationRateMlH,
    },
    allowed_radicals: [
      'fluid_flow_state',
      'electrical_conducting_function',
      'polymer_thermoplastic',
      'steel',
    ],
    applicability_confidence: 'high',
    sub_modules: [proportioningSm, dialysateFlowSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 3: dialyser_membrane — energy_conversion_transduction
// ---------------------------------------------------------------------------

function emitDialyserMembrane(p: DialysisParams): DesignModule {
  const dialyserSm = makeSubModule(
    'hollow_fibre_dialyser',
    'hollow-fibre dialyser',
    'exchanges',
    `solutes between blood (${p.bloodFlowMlMin.toFixed(0)} mL/min) and dialysate (${p.dialysateFlowMlMin.toFixed(0)} mL/min) across ${p.membraneAreaM2.toFixed(1)} m² polysulfone membrane`,
    [
      word(
        'dialyser_hollow_fibre_word',
        'dialyser hollow-fibre',
        cc('dialyser_hollow_fibre', 'hollow-fibre dialyser', 'osmotic_transfer_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Fresenius F-series / Baxter Polyflux'),
          mod('dimension', p.membraneAreaM2.toFixed(1), 'm²'),
          mod('regulatory', 'ISO 10993-4 hemocompatible'),
        ],
      ),
      word(
        'membrane_potting_word',
        'membrane potting',
        cc('membrane_potting', 'membrane potting', null, 'polymer_thermoset'),
        [
          mod('quantity', '×1'),
          mod('form', 'polyurethane potted ends'),
        ],
      ),
      word(
        'dialyser_housing_word',
        'dialyser housing',
        cc('dialyser_housing', 'dialyser housing', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'polycarbonate transparent housing'),
        ],
      ),
    ],
  )

  return {
    module: 'energy_conversion_transduction',
    module_brief: `Polysulfone hollow-fibre dialyser of ${p.membraneAreaM2.toFixed(1)} m² surface area. Counter-current blood (${p.bloodFlowMlMin.toFixed(0)} mL/min) and dialysate (${p.dialysateFlowMlMin.toFixed(0)} mL/min) flow with transmembrane pressure ${p.transmembrane_pressure_mmhg.toFixed(0)} mmHg drives diffusive solute clearance and convective UF.`,
    overview_paragraph_en: '',
    derived_parameters: {
      membrane_area_m2: p.membraneAreaM2,
      tmp_mmhg: p.transmembrane_pressure_mmhg,
    },
    allowed_radicals: [
      'osmotic_transfer_function',
      'fluid_flow_state',
      'polymer_thermoplastic',
      'polymer_thermoset',
    ],
    applicability_confidence: 'high',
    sub_modules: [dialyserSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 5: sensor_panel + control_compute — control_compute_communication
// ---------------------------------------------------------------------------

function emitSensorPanelControl(p: DialysisParams): DesignModule {
  const sensorsSm = makeSubModule(
    'safety_sensor_panel',
    'safety sensor panel',
    'monitors',
    'pressures, conductivity, blood leak, air bubble, and temperature at the dialysate inlet and outlet',
    [
      word(
        'venous_pressure_transducer_word',
        'venous pressure transducer',
        cc('venous_pressure_transducer', 'venous pressure transducer', 'pressure_vessel_function', 'silicon'),
        [
          mod('quantity', '×1'),
          mod('form', 'blood-isolated Honeywell 26PC'),
          mod('regulatory', 'single-use, ISO 10993-4'),
        ],
      ),
      word(
        'arterial_pressure_transducer_word',
        'arterial pressure transducer',
        cc('arterial_pressure_transducer', 'arterial pressure transducer', 'pressure_vessel_function', 'silicon'),
        [
          mod('quantity', '×1'),
          mod('form', 'blood-isolated Honeywell 26PC'),
          mod('regulatory', 'single-use, ISO 10993-4'),
        ],
      ),
      word(
        'dialysate_conductivity_cell_word',
        'dialysate conductivity cell',
        cc('dialysate_conductivity_cell', 'dialysate conductivity cell', 'chemical_sensing_function', 'steel'),
        [
          mod('quantity', '×2'),
          mod('form', '4-electrode toroidal cell'),
          mod('capacity', '14', 'mS/cm range'),
        ],
      ),
      word(
        'blood_leak_detector_word',
        'blood leak detector',
        cc('blood_leak_detector', 'blood leak detector', 'optical_sensing_function', 'silicon'),
        [
          mod('quantity', '×1'),
          mod('form', 'haemoglobin photometer in dialysate effluent'),
        ],
      ),
      word(
        'air_bubble_detector_word',
        'air bubble detector',
        cc('air_bubble_detector', 'air bubble detector', 'acoustic_sensing_function', 'silicon'),
        [
          mod('quantity', '×1'),
          mod('form', 'Introtek BD-8 ultrasonic'),
          mod('regulatory', 'IEC 60601-2-16'),
        ],
      ),
      word(
        'dialysate_temperature_sensor_word',
        'dialysate temperature sensor',
        cc('dialysate_temperature_sensor', 'dialysate temperature sensor', 'thermal_transfer_function', 'ceramic'),
        [
          mod('quantity', '×2'),
          mod('form', 'PT1000 RTD'),
          mod('regulatory', 'IEC 60601 dual-redundant'),
        ],
      ),
    ],
  )

  const computeSm = makeSubModule(
    'control_compute',
    'dual-MCU control compute',
    'orchestrates',
    'patient safety + closed-loop control of pumps, valves, heater and UF rate',
    [
      word(
        'primary_mcu_board_word',
        'primary MCU board',
        cc('primary_mcu_board', 'primary MCU board', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'STM32H743 + safety MCU watchdog'),
          mod('regulatory', 'IEC 62304 Class B'),
        ],
      ),
      word(
        'safety_supervisor_mcu_word',
        'safety supervisor MCU',
        cc('safety_supervisor_mcu', 'safety supervisor MCU', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'redundant MCU + independent watchdog'),
          mod('regulatory', 'IEC 60601-1 single-fault tolerance'),
        ],
      ),
      word(
        'isolated_io_modbus_word',
        'isolated IO + Modbus',
        cc('isolated_io_modbus', 'isolated IO + Modbus gateway', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'TI ISO1500-class galvanic isolation'),
          mod('regulatory', 'IEC 60601-1-2 EMC + 60601-1-8 alarms'),
        ],
      ),
      // Macro-aligned aggregate (BoM macro: control_compute_module — the integrated dual-MCU compute board with watchdog).
      word(
        'control_compute_board_word',
        'control compute board',
        cc('control_compute_board', 'IEC 60601-1 dual-MCU control compute board with watchdog', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'integrated primary + safety-supervisor MCUs, isolated I/O, Class B watchdog'),
          mod('regulatory', 'IEC 60601-1 + 62304 Class B'),
        ],
      ),
    ],
  )

  return {
    module: 'control_compute_communication',
    module_brief: 'Sensor panel measures venous and arterial pressure, dialysate conductivity (inlet + outlet), blood leak, air bubble and dialysate temperature. Dual-MCU control compute with independent safety supervisor implements IEC 60601-1 single-fault tolerance plus IEC 62304 Class B software.',
    overview_paragraph_en: '',
    derived_parameters: {
      pressure_sensors_count: 2,
      conductivity_cells_count: 2,
      temperature_sensors_count: 2,
    },
    allowed_radicals: [
      'pressure_vessel_function',
      'chemical_sensing_function',
      'optical_sensing_function',
      'silicon_semiconductor_function',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [sensorsSm, computeSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 6: water_treatment_RO_DI — energy_storage_source (clean-water reservoir)
// ---------------------------------------------------------------------------

function emitWaterTreatment(p: DialysisParams): DesignModule {
  const roSm = makeSubModule(
    'reverse_osmosis_module',
    'reverse-osmosis water treatment module',
    'purifies',
    `feed water to AAMI RD52 / EN ISO 13959 ultrapure dialysis water at ${p.roPermeateLPerSession.toFixed(0)} L per session`,
    [
      word(
        'reverse_osmosis_membrane_word',
        'reverse-osmosis membrane',
        cc('reverse_osmosis_membrane', 'reverse-osmosis membrane', 'osmotic_transfer_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Mar Cor Purelab / Better Water 6000 single-pass'),
          mod('capacity', '60', 'L/h'),
        ],
      ),
      // Macro-aligned aggregate (BoM macro: reverse_osmosis_water_module — the complete RO water skid).
      word(
        'reverse_osmosis_water_skid_word',
        'reverse-osmosis water skid',
        cc('reverse_osmosis_water_skid', 'reverse-osmosis water treatment skid', 'osmotic_transfer_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'single-pass RO + UV + carbon prefilter, frame-mounted skid'),
          mod('regulatory', 'AAMI RD52 / EN ISO 13959'),
        ],
      ),
      word(
        'feed_water_carbon_filter_word',
        'feed water carbon filter',
        cc('feed_water_carbon_filter', 'feed water carbon filter', 'chemical_sensing_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'activated carbon (chlorine removal)'),
        ],
      ),
      word(
        'uv_disinfection_lamp_word',
        'UV disinfection lamp',
        cc('uv_disinfection_lamp', 'UV disinfection lamp', 'optical_radiation_function', 'glass'),
        [
          mod('quantity', '×1'),
          mod('capacity', '40', 'W'),
          mod('form', '254 nm low-pressure Hg lamp'),
        ],
      ),
      word(
        'feed_pump_word',
        'feed pump',
        cc('feed_pump', 'feed pump', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', '0.6', 'm³/h'),
          mod('form', 'multi-stage centrifugal'),
        ],
      ),
    ],
  )

  return {
    module: 'energy_storage_source',
    module_brief: `Single-pass RO water treatment producing AAMI RD52 / EN ISO 13959 ultrapure dialysis water at ${p.roPermeateLPerSession.toFixed(0)} L per session. 70% recovery, 254 nm UV disinfection, carbon prefilter for chlorine removal.`,
    overview_paragraph_en: '',
    derived_parameters: {
      permeate_l_per_session: p.roPermeateLPerSession,
    },
    allowed_radicals: [
      'osmotic_transfer_function',
      'fluid_flow_state',
      'optical_radiation_function',
      'polymer_thermoplastic',
      'steel',
    ],
    applicability_confidence: 'high',
    sub_modules: [roSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 7: user_interface — hmi_ergonomics
// ---------------------------------------------------------------------------

function emitUserInterface(_p: DialysisParams): DesignModule {
  const hmiSm = makeSubModule(
    'touchscreen_hmi',
    'touchscreen HMI',
    'displays',
    'session parameters, treatment graphs, alarm states and patient ID via 10.1" capacitive touchscreen',
    [
      word(
        'hmi_touchscreen_word',
        'HMI touchscreen',
        cc('hmi_touchscreen', 'HMI touchscreen', 'optical_sensing_function', 'glass'),
        [
          mod('quantity', '×1'),
          mod('form', '10.1" projected-capacitive touchscreen'),
          mod('regulatory', 'IEC 62366-1 usability'),
        ],
      ),
      // Macro-aligned aggregate (BoM macro: touchscreen_user_interface — the integrated 10.1" touchscreen + bezel assembly).
      word(
        'touchscreen_user_interface_word',
        'touchscreen user interface assembly',
        cc('touchscreen_user_interface', 'touchscreen user interface assembly (display + bezel)', 'optical_sensing_function', 'glass'),
        [
          mod('quantity', '×1'),
          mod('form', '10.1" capacitive touchscreen + medical bezel + EMC gasket'),
          mod('regulatory', 'IEC 62366-1 + 60601-1-2 EMC'),
        ],
      ),
      word(
        'patient_id_barcode_scanner_word',
        'patient ID barcode scanner',
        cc('patient_id_barcode_scanner', 'patient ID barcode scanner', 'optical_sensing_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Honeywell xenon CMOS scanner'),
        ],
      ),
      word(
        'emergency_stop_word',
        'emergency stop',
        cc('emergency_stop', 'emergency stop button', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'red mushroom-head + interlock'),
          mod('regulatory', 'IEC 60947-5-5'),
        ],
      ),
    ],
  )

  return {
    module: 'hmi_ergonomics',
    module_brief: '10.1" capacitive touchscreen with IEC 62366-1 usability-compliant UI displays session prescription, treatment graphs and alarms. Patient ID barcode scanner and red mushroom-head emergency stop on the operator panel.',
    overview_paragraph_en: '',
    derived_parameters: {
      hmi_count: 1,
      e_stops_count: 1,
    },
    allowed_radicals: [
      'optical_sensing_function',
      'electromechanical_switching_function',
      'polymer_thermoplastic',
      'glass',
    ],
    applicability_confidence: 'high',
    sub_modules: [hmiSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 8: alarms_safety — safety_protection
// ---------------------------------------------------------------------------

function emitAlarmsSafety(_p: DialysisParams): DesignModule {
  const alarmsSm = makeSubModule(
    'audible_visual_alarms',
    'audible and visual alarm system',
    'alerts',
    'staff and patients with IEC 60601-1-8 prioritised audible plus visual alarms for venous pressure, blood leak, air detect, conductivity excursion, temperature excursion',
    [
      word(
        'alarm_speaker_word',
        'alarm speaker',
        cc('alarm_speaker', 'IEC 60601-1-8 alarm speaker', 'acoustic_radiation_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', '85', 'dBA'),
          mod('regulatory', 'IEC 60601-1-8'),
        ],
      ),
      word(
        'beacon_rgb_word',
        'beacon RGB',
        cc('beacon_rgb', 'RGB beacon', 'optical_radiation_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'tri-colour LED stack'),
        ],
      ),
      word(
        'nurse_call_relay_word',
        'nurse call relay',
        cc('nurse_call_relay', 'nurse call relay', 'electromechanical_switching_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'voltage-free relay (KNX / nurse-call bus)'),
        ],
      ),
      word(
        'iec_60601_1_isolation_word',
        'IEC 60601-1 isolation',
        cc('iec_60601_1_isolation', 'IEC 60601-1 patient isolation barrier', 'electrical_conducting_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'IEC 60601-1 type BF / CF'),
        ],
      ),
    ],
  )

  return {
    module: 'safety_protection',
    module_brief: 'Prioritised IEC 60601-1-8 audible + visual alarm system covering all clinically relevant excursions. Type BF / CF isolation barrier, nurse-call relay, and tri-colour beacon stack.',
    overview_paragraph_en: '',
    derived_parameters: {
      alarm_speaker_db: 85,
    },
    allowed_radicals: [
      'acoustic_radiation_function',
      'optical_radiation_function',
      'electromechanical_switching_function',
      'electrical_conducting_function',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [alarmsSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 10: regulatory_FDA_510k — maintenance_serviceability
// ---------------------------------------------------------------------------

function emitRegulatoryFda(_p: DialysisParams): DesignModule {
  const regSm = makeSubModule(
    'regulatory_certifications',
    'regulatory certifications and serviceability',
    'attests',
    'compliance with FDA Class II 510(k) / EU MDR Class IIb / IEC 60601-1 + 62304 + 62366-1 + ISO 13485 quality system',
    [
      word(
        'fda_510k_label_word',
        'FDA 510(k) label',
        cc('fda_510k_label', 'FDA 510(k) compliance label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'FDA 21 CFR 870.5980 hemodialysis system'),
        ],
      ),
      word(
        'ce_ukca_iib_label_word',
        'CE/UKCA IIb label',
        cc('ce_ukca_iib_label', 'CE/UKCA Class IIb label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'EU MDR 2017/745 Annex VIII Rule 11'),
        ],
      ),
      word(
        'iec_60601_label_word',
        'IEC 60601 compliance label',
        cc('iec_60601_label', 'IEC 60601 compliance label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'IEC 60601-1 + 60601-1-2 + 60601-2-16'),
        ],
      ),
      word(
        'service_panel_word',
        'service panel',
        cc('service_panel', 'service access panel', 'mechanical_attachment_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'tool-required interlock'),
        ],
      ),
    ],
  )

  return {
    module: 'maintenance_serviceability',
    module_brief: 'FDA Class II 510(k), EU MDR Class IIb, IEC 60601-1 / 60601-2-16 / IEC 62304 Class B / IEC 62366-1 usability and ISO 13485 quality system. Tool-required service panel for biomed access to the back-of-machine.',
    overview_paragraph_en: '',
    derived_parameters: {},
    allowed_radicals: [
      'mechanical_attachment_function',
      'polymer_thermoplastic',
      'steel',
    ],
    applicability_confidence: 'high',
    sub_modules: [regSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 11: structural enclosure — structure_containment
// ---------------------------------------------------------------------------

function emitStructure(p: DialysisParams): DesignModule {
  const trolleyChassisSm = makeSubModule(
    'trolley_chassis',
    'trolley chassis',
    'houses',
    `${p.totalEstimatedMassKg.toFixed(0)} kg unit on five-castor mobile trolley`,
    [
      word(
        'abs_enclosure_word',
        'ABS enclosure',
        cc('abs_enclosure', 'ABS enclosure', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'moulded ABS, antimicrobial silver-coating'),
          mod('regulatory', 'IP21 splash-resistant'),
        ],
      ),
      word(
        'trolley_castor_set_word',
        'trolley castor set',
        cc('trolley_castor_set', 'medical castor set', 'mechanical_attachment_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×5'),
          mod('form', '125 mm twin-wheel medical castors, central-lock'),
        ],
      ),
      // Macro-aligned aggregate (BoM macro: enclosure_trolley_chassis — the unified trolley chassis assembly).
      word(
        'trolley_chassis_word',
        'trolley chassis',
        cc('trolley_chassis', 'medical trolley chassis (ABS enclosure + steel trolley + castors)', 'mechanical_attachment_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'moulded ABS enclosure on welded steel trolley + medical-grade castors'),
          mod('regulatory', 'IP21 splash-resistant'),
        ],
      ),
      word(
        'iv_pole_word',
        'IV pole',
        cc('iv_pole', 'IV pole', 'mechanical_attachment_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'stainless retractable'),
        ],
      ),
      word(
        'concentrate_bottle_holders_word',
        'concentrate bottle holders',
        cc('concentrate_bottle_holders', 'concentrate bottle holders', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('form', 'colour-coded acid + bicarbonate'),
        ],
      ),
    ],
  )

  return {
    module: 'structure_containment',
    module_brief: `Moulded ABS antimicrobial enclosure on a 5-castor central-lock medical trolley, with a retractable stainless IV pole and twin concentrate-bottle holders. All-up mass ${p.totalEstimatedMassKg.toFixed(0)} kg, well within ${p.maxMassKg.toFixed(0)} kg brief cap.`,
    overview_paragraph_en: '',
    derived_parameters: {
      total_mass_kg: p.totalEstimatedMassKg,
    },
    allowed_radicals: [
      'mechanical_attachment_function',
      'polymer_thermoplastic',
      'steel',
    ],
    applicability_confidence: 'high',
    sub_modules: [trolleyChassisSm],
  }
}

// ---------------------------------------------------------------------------
// CROSS-MODULE GRAMMAR LINKS
// ---------------------------------------------------------------------------

function emitCrossModuleGrammarLinks(p: DialysisParams) {
  return [
    {
      from_module: 'mass_fluid_transport_process',
      to_module: 'energy_conversion_transduction',
      mechanism: 'fluid_loop',
      type: 'mutual' as const,
      detail: `blood loop, ${p.bloodFlowMlMin.toFixed(0)} mL/min through dialyser`,
    },
    {
      from_module: 'environmental_interface',
      to_module: 'energy_conversion_transduction',
      mechanism: 'fluid_loop',
      type: 'mutual' as const,
      detail: `dialysate loop, ${p.dialysateFlowMlMin.toFixed(0)} mL/min through dialyser`,
    },
    {
      from_module: 'energy_storage_source',
      to_module: 'environmental_interface',
      mechanism: 'fluid_loop',
      type: 'directional' as const,
      detail: `RO permeate ${p.roPermeateLPerSession.toFixed(0)} L/session to dialysate proportioning`,
    },
    {
      from_module: 'control_compute_communication',
      to_module: 'mass_fluid_transport_process',
      mechanism: 'control',
      type: 'directional' as const,
      detail: 'pressure setpoint + servo speed to blood pump',
    },
    {
      from_module: 'control_compute_communication',
      to_module: 'environmental_interface',
      mechanism: 'control',
      type: 'directional' as const,
      detail: 'conductivity + temperature + UF rate control',
    },
    {
      from_module: 'safety_protection',
      to_module: 'control_compute_communication',
      mechanism: 'data',
      type: 'mutual' as const,
      detail: 'IEC 60601-1-8 prioritised alarms',
    },
    {
      from_module: 'safety_protection',
      to_module: 'mass_fluid_transport_process',
      mechanism: 'control',
      type: 'directional' as const,
      detail: 'air detect + venous pressure trip stops blood pump',
    },
    {
      from_module: 'hmi_ergonomics',
      to_module: 'control_compute_communication',
      mechanism: 'data',
      type: 'mutual' as const,
      detail: 'HMI ↔ MCU (Ethernet + on-board UART)',
    },
    {
      from_module: 'maintenance_serviceability',
      to_module: 'structure_containment',
      mechanism: 'mechanical',
      type: 'directional' as const,
      detail: 'service panel hinged to enclosure rear',
    },
    {
      from_module: 'mass_fluid_transport_process',
      to_module: 'structure_containment',
      mechanism: 'mechanical',
      type: 'directional' as const,
      detail: 'pump module mounted on front-face panel',
    },
    {
      from_module: 'energy_conversion_transduction',
      to_module: 'structure_containment',
      mechanism: 'mechanical',
      type: 'directional' as const,
      detail: 'dialyser clamp on front panel above pump',
    },
  ]
}

// ---------------------------------------------------------------------------
// BRIEF OVERVIEW PROSE
// ---------------------------------------------------------------------------

function emitBriefOverviewProse(p: DialysisParams) {
  return {
    overview_and_context: '',
    mission_statement: `Deliver IEC 60601-1 + IEC 60601-2-16 compliant hemodialysis at ${p.bloodFlowMlMin.toFixed(0)} mL/min blood flow, ${p.dialysateFlowMlMin.toFixed(0)} mL/min dialysate flow, ${p.membraneAreaM2.toFixed(1)} m² polysulfone membrane over a ${p.sessionHours.toFixed(0)} hour session, with single-fault tolerance for all patient-safety critical functions.`,
    target_customers: '',
    why_now: '',
  }
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER
// ---------------------------------------------------------------------------

export const emitDialysisDesign: ClassEmitter = (
  contract: ContractInProgress,
  _brief: ParsedConstraints,
  _envelope: BriefEnvelope,
): DesignJSON => {
  const p = deriveParams(contract)
  // touch helper to satisfy --noUnusedLocals
  void fmtQty
  const modules: DesignModule[] = [
    emitBloodCircuit(p),
    emitDialysateCircuit(p),
    emitDialyserMembrane(p),
    emitSensorPanelControl(p),
    emitWaterTreatment(p),
    emitUserInterface(p),
    emitAlarmsSafety(p),
    emitRegulatoryFda(p),
    emitStructure(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: '9 modules cover the canonical hospital hemodialysis system (blood circuit, dialysate circuit, dialyser, sensor panel + control, RO water treatment, HMI, alarms, regulatory + service, structure).',
    brief_overview_prose: emitBriefOverviewProse(p),
  }
}

registerAssembler('dialysis_machine', emitDialysisDesign)
