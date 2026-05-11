/**
 * @file structural-builder.ts — Deterministic tree construction from a leaf list
 *
 * Phase 1.5 — Stage 2 of the two-stage decomposition:
 *   Stage 1 (LLM): identify LEAVES only → flat LeafRecord[]
 *   Stage 2 (this file): build the hierarchical RadicalTree deterministically
 *
 * Given the same leaf list, this function ALWAYS produces the same tree.
 * There is NO LLM call here — pure deterministic code.
 *
 * Algorithm:
 *   1. Look up each leaf's character from the leaf's character_id field (or
 *      derive it from the archetype lookup on the library when not explicit).
 *   2. Use character-hierarchy.ts to find the canonical word and sentence for
 *      each leaf.
 *   3. Group leaves by sentence → word → leaf (archetype).
 *   4. Emit a RadicalTree with those groups as children, sorted deterministically
 *      at every level by their IDs.
 *   5. UNKNOWN leaves are collected separately and never appear in the tree.
 *
 * Archetype validation:
 *   - Leaves with a known archetype_id map directly.
 *   - Leaves whose character_id maps to a word/sentence are placed there.
 *   - Leaves with no hierarchy match go to a synthetic UNKNOWN_SUBSYSTEM sentence.
 */

import type { RadicalTree, CompositionNode } from './schema.js'
import { CURRENT_RADICAL_SPEC_VERSION } from './schema.js'
import {
  buildCharacterToWords,
  buildWordToSentence,
  SENTENCE_BY_ID,
  WORD_BY_ID,
  HIERARCHY_STATS,
  normaliseProductClass,
  type HierarchyWord,
  type ProductClass,
} from './character-hierarchy.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single leaf record from Stage 1 (LLM output). */
export interface LeafRecord {
  /** Must be from the known character library, OR '<UNKNOWN>' for unmapped parts */
  character_id: string
  /** archetype_id if the LLM knows a specific archetype — optional */
  archetype_id?: string | null
  /** Quantity of this leaf relative to its parent (the word/subsystem group) */
  multiplicity: number
  /** Optional MPN hint from the LLM */
  mpn_hint?: string | null
  /** Optional manufacturer hint from the LLM */
  manufacturer_hint?: string | null
  /** Optional price estimate from the LLM */
  estimated_unit_price_gbp?: number | null
  /** Human-readable description — used for UNKNOWN leaves */
  description?: string | null
}

/** Summary of unknowns emitted during tree construction */
export interface BuildResult {
  tree: RadicalTree
  /**
   * Characters the LLM identified but that have no hierarchy mapping.
   * Each entry is the original character_id string (may be '<UNKNOWN>: ...')
   */
  unmappedCharacters: string[]
  /** Count of leaves that were placed correctly */
  placedLeafCount: number
  /** Summary stats for logging */
  stats: {
    sentences: number
    words: number
    leaves: number
    unmapped: number
    hierarchyStats: typeof HIERARCHY_STATS
  }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface GroupedLeaf {
  leaf: LeafRecord
  wordId: string
  sentenceId: string
  archetypeId: string
}

// ---------------------------------------------------------------------------
// Lookup caches (built once per call via closure — no module-level mutation)
// ---------------------------------------------------------------------------

/**
 * Derive the archetype ID to use for a leaf in the tree.
 *
 * DETERMINISM RULE: Always use character_id, never the LLM's archetype_id.
 *
 * Why: The LLM's archetype_id is a free-form string that varies between runs
 * even at temperature=0.0 (e.g. "lfp_prismatic_cell_280Ah" vs "lfp_280ah_3.2v").
 * The character_id is constrained to the known library and is deterministic.
 *
 * UNKNOWN leaves get a descriptive placeholder.
 */
function resolveArchetypeId(leaf: LeafRecord): string {
  if (leaf.character_id === '<UNKNOWN>' || leaf.character_id.startsWith('<UNKNOWN>')) {
    const desc = leaf.description ?? leaf.character_id
    return `<UNKNOWN_RADICAL>: ${desc}`
  }
  // Always use character_id — it's constrained to the known library, deterministic.
  // The LLM's archetype_id is discarded here: it's free-form and non-deterministic.
  return leaf.character_id
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Physics-based quantity overrides
// ---------------------------------------------------------------------------

/**
 * Optional deterministic quantity overrides keyed by character_id.
 * When provided, the builder uses these quantities instead of LLM-provided
 * multiplicities. This is the primary mechanism for achieving quantity
 * determinism — physics derivations are always reproducible.
 */
export type QuantityOverrideMap = Record<string, number>

/**
 * Derive quantity overrides AND mandatory baseline characters for a BESS brief.
 *
 * Returns:
 *   - quantities: QuantityOverrideMap keyed by character_id (always applied)
 *   - mandatoryCharacters: character_ids that MUST appear in the tree regardless
 *     of what the LLM identified. Ensures tree shape is deterministic even when
 *     the LLM misses or adds characters between runs.
 *
 * All calculations are deterministic — same brief always gives same quantities.
 * The LLM-provided multiplicity values are IGNORED for these character_ids.
 *
 * @param usableKwh       Usable energy in kWh (from brief)
 * @param dodFraction     Depth of discharge as fraction (e.g. 0.80 for LFP)
 * @param cellVoltage     Nominal cell voltage in V (e.g. 3.2 for LFP)
 * @param cellCapacityAh  Cell capacity in Ah (e.g. 280)
 * @param rackCount       Optional explicit rack count (derived from cells if absent)
 */
export function deriveBessQuantityOverrides(params: {
  usableKwh: number
  dodFraction?: number
  cellVoltage?: number
  cellCapacityAh?: number
  rackCount?: number
}): { quantities: QuantityOverrideMap; mandatoryCharacters: string[] } {
  const {
    usableKwh,
    dodFraction = 0.80,
    cellVoltage = 3.2,
    cellCapacityAh = 280,
    rackCount,
  } = params

  // Cell count: round up to nearest multiple of 16 (string-alignment)
  const rawCellCount = (usableKwh * 1000) / (dodFraction * cellVoltage * cellCapacityAh)
  const cellCount = Math.ceil(rawCellCount / 16) * 16

  // Rack count: 1 rack per ~50 cells (BMS slave board count drives this)
  const derivedRackCount = rackCount ?? Math.ceil(cellCount / 50)

  // BMS slave boards: ~10-14 per rack, use 12 as deterministic default
  const bmsSlaveCount = derivedRackCount * 12

  // All BESS characters that must appear in the tree — defines the mandatory shape
  // Phase B Iter 2 (2026-05-11): expanded from 21 → ~75 characters to give the
  // tree the depth a real 3.5 MWh BESS BoM would have. Each new character maps
  // into the words added to character-hierarchy.ts in the same iteration.
  const mandatoryCharacters = [
    // Battery rack (cell-string + structure ancillaries)
    'lfp_prismatic_cell',
    'cell_busbar_link',
    'cell_compression_pad',
    'cell_top_cap_assembly',
    'steel_rack_frame',
    'rack_caster_wheel',
    'rack_earthing_strap',
    'rack_lifting_eye',
    // BMS — master + slave + comm
    'pcb_controller',
    'bms_isolation_ic',
    'current_shunt_resistor',
    'voltage_divider_resistor',
    'esd_protection_diode',
    'bms_master_connector',
    'bms_slave_monitor_ic',
    'cell_balance_resistor',
    'cell_thermistor_ntc',
    'cell_tap_connector',
    'can_transceiver_ic',
    'isolation_transceiver_ic',
    'bms_can_harness',
    'can_termination_resistor',
    // PCS power conversion
    'dc_contactor',
    'circuit_breaker',
    'resistor',
    'protection_relay',
    'transformer',
    'power_converter',
    'transformer_bushing',
    'tap_changer_assembly',
    'ac_circuit_breaker', // council fix (GLM): grid-side AC breaker, distinct from DC circuit_breaker
    'igbt_power_module',
    'gate_driver_board',
    'gate_drive_isolated_dcdc', // council fix (Gemini): IGBT gate driver power supply
    'dc_link_capacitor',
    'snubber_capacitor',
    'ac_filter_inductor',
    'ac_filter_capacitor',
    'ac_emi_filter',
    // DC switchgear
    'dc_isolator_switch',
    'dc_fuse_holder',
    'dc_fuse_link',
    'pre_charge_contactor',
    'busbar_support_insulator',
    'busbar_heat_shrink',
    'surge_arrester_dc',
    'earthing_busbar',
    'insulation_monitoring_device',  // renamed from earth_fault_relay (council fix: Bender ISOMETER is an IMD on floating-IT DC)
    'earthing_lug',
    'earthing_electrode_rod', // moved here from container_security (council fix)
    // Thermal management
    'liquid_cooling_system',
    'cold_plate',
    'coolant_distribution_manifold',
    'thermal_insulation_panel',
    'thermal_interface_material',
    'coolant_pump',
    'coolant_reservoir_tank',
    'coolant_temperature_sensor',
    'coolant_flow_switch',
    // FSS
    'fire_suppression_system',
    'pressure_vessel',
    'pressure_gauge_fss',
    'gas_sensor',
    'optical_arc_sensor',
    'smoke_detector_aspirating',
    'thermal_linear_detector',
    'suppression_nozzle',
    'suppression_discharge_pipe',
    'manual_pull_station',
    'fss_control_panel',
    'fss_alarm_strobe',
    'fss_warning_horn',
    // EMS / SCADA
    'ems_controller',
    'ems_hmi_panel',
    'network_switch',
    'ems_gateway_modem',
    'ems_fibre_patch_panel',
    'ems_psu_24v',
    'ups_module',
    'mcb_low_voltage',
    'revenue_meter',
    'metering_ct',
    'monitoring_relay',
    // Container fit-out
    'copper_busbar',
    'steel_door',
    'door_intrusion_switch',
    'access_control_reader',
    'cable_transit_frame',
    'switchboard_enclosure',
    'cable_tray',
    'cable_gland',
    'container_iso_shell', // council fix (GLM): the literal 40' ISO container shell
    'hvac_split_unit',
    'hvac_condensate_pump',
    'hvac_thermostat',
    'interior_led_luminaire',
    'emergency_light',
    'convenience_outlet',
    'distribution_board_aux',
    'cctv_camera',
    'intrusion_detector_pir',  // replaces earthing_electrode_rod (council fix: rod moved to dc_earthing)
  ]

  const quantities: QuantityOverrideMap = {
    'lfp_prismatic_cell': cellCount,
    'steel_rack_frame': derivedRackCount,
    'pcb_controller': bmsSlaveCount,
    'dc_contactor': derivedRackCount * 2,
    'circuit_breaker': derivedRackCount + 2,
    'resistor': derivedRackCount * 2,
    'protection_relay': 1,
    'transformer': 1,
    'power_converter': 1,
    'liquid_cooling_system': 1,
    'fire_suppression_system': 1,
    'pressure_vessel': 2,
    'gas_sensor': derivedRackCount,
    'optical_arc_sensor': 2,
    'ems_controller': 1,
    'network_switch': 2,
    'copper_busbar': derivedRackCount,
    'thermal_insulation_panel': 1,
    'steel_door': 2,
    'cable_transit_frame': 6,
    'switchboard_enclosure': 1,
  }

  return { quantities, mandatoryCharacters }
}

// ---------------------------------------------------------------------------
// Per-class mandatory character sets for non-BESS product classes
// Prevents cross-contamination: without a mandatory set, LLM outputs generic
// shared characters (e.g. liquid_cooling_system) that map to BESS/heat-pump
// sentences via the character hierarchy. The mandatory set pins the tree shape.
// ---------------------------------------------------------------------------

/**
 * Mandatory character list for Drone/UAV briefs.
 * Characters only appear in drone-specific words (airframe_body, propulsion_motors,
 * avionics_compute). Does NOT include liquid_cooling_system (would land in BESS
 * thermal sentence), fire_suppression_system, ems_controller etc.
 */
export function deriveDroneMandatoryCharacters(): string[] {
  return [
    // Airframe body
    'aluminium_extrusion',  // airframe_body
    'steel_bolt',           // airframe_body fasteners
    'polymer_enclosure',    // airframe_body housing
    'carbon_fibre_arm',     // airframe_body (Iter 2)
    // Landing gear (Iter 2)
    'landing_skid_polymer',
    'landing_gear_strut',
    // Payload bay (Iter 2)
    'battery_tray_polymer',
    'battery_strap_velcro',
    'payload_release_servo',
    // Propulsion motors
    'power_converter',      // propulsion_motors (ESC / motor driver)
    'copper_wire',          // propulsion_motors wiring
    'brushless_dc_motor',         // Iter 2
    'electronic_speed_controller', // Iter 2
    // Propeller (Iter 2)
    'propeller_carbon_blade',
    'propeller_retention_nut',
    'propeller_hub',
    // Drive train (Iter 2)
    'motor_mount_aluminium',
    'motor_bearing_set',
    'propulsion_current_sensor',
    // Avionics compute
    'pcb_controller',       // avionics_compute (flight computer)
    'network_switch',       // avionics_compute (comm hub)
    // IMU/sensors (Iter 2)
    'imu_6dof_module',
    'magnetometer_3axis',
    'barometer_pressure_sensor',
    // GNSS / radios (Iter 2)
    'gnss_receiver_module',
    'telemetry_radio_modem',
    'rc_receiver_module',
    'antenna_pcb',
    // Avionics power (Iter 2)
    'avionics_pdb',
    'avionics_bec_5v',
    'avionics_current_sensor',
  ]
}

/**
 * Mandatory character list for CGM (Continuous Glucose Monitor) wearable briefs.
 * Maps to biosensor_hardware (front-end) and medical_wearable_enclosure (housing/seal).
 * Bug P0-5 fix (2026-05-11): NO LONGER routes polymer_enclosure / polymer_gasket
 * through hull_structure / hull_and_buoyancy — that's the AUV (underwater
 * vehicle) sentence. New medical_wearable_enclosure sentence in
 * character-hierarchy.ts owns wearable housing and skin interface.
 * No BESS, heat pump, drone, or AUV characters.
 */
export function deriveCgmMandatoryCharacters(): string[] {
  return [
    // Biosensor system — hardware
    'pcb_controller',   // biosensor_hardware (analogue front-end + MCU)
    'copper_wire',      // biosensor_hardware (flex harness)
    'glucose_electrode_strip',   // Iter 2 — Pt/Au-on-polymer electrode
    'analogue_front_end_ic',     // Iter 2
    // Biosensor radio (Iter 2)
    'ble_soc_module',
    'antenna_pcb',
    'radio_crystal_oscillator',
    // Biosensor power (Iter 2)
    'coin_cell_battery_cr1632',
    'biosensor_regulator_ldo',
    // Biosensor motion (Iter 2)
    'accelerometer_3axis_lp',
    // Wearable enclosure (existing + Iter 2)
    'polymer_enclosure',  // wearable_housing (outer biocompatible shell)
    'polymer_gasket',     // wearable_skin_interface
    'adhesive_skin_patch', // Iter 2 — 3M Tegaderm-class
    // Wearable applicator (Iter 2)
    'applicator_housing_polymer',
    'insertion_needle_assembly',
    // Wearable overmould (Iter 2)
    'silicone_overmould',
    'biocompatible_label_layer',
  ]
}

/**
 * Mandatory character list for Heat Pump briefs.
 * Pins to refrigerant_circuit, hydronic_circuit, heat_pump_controls, heat_pump_enclosure.
 * Excludes BESS/battery characters.
 *
 * Bug P0-6 fix (2026-05-11): the refrigerant circuit was previously just
 * liquid_cooling_system + copper_wire + polymer_gasket. A real 30 kW
 * R290 heat pump needs a scroll compressor (the single largest line),
 * brazed-plate heat exchanger × 2, expansion valve, pressure transducers,
 * EC fan motor. These are now mandatory.
 */
export function deriveHeatPumpMandatoryCharacters(): string[] {
  return [
    // Refrigerant cycle (legacy hint — kept for back-compat with hydronic loop)
    'liquid_cooling_system',  // refrigerant_cycle (compressor + loop)
    // Bug P0-6: real compressor + heat exchanger + valve + pressure stack
    'compressor_unit',           // compressor_word (scroll/rotary)
    'refrigerant_lubricant',     // compressor_word (POE/PAG oil charge)
    'evaporator',                // heat_exchanger_word (low-side BPHE)
    'condenser',                 // heat_exchanger_word (high-side BPHE)
    'txv_or_eev',                // expansion_valve_word (electronic expansion valve)
    'refrigerant_drier_filter',  // expansion_valve_word (filter-drier)
    'high_pressure_transducer',  // pressure_monitoring_word
    'low_pressure_transducer',   // pressure_monitoring_word
    'safety_pressure_switch',    // pressure_monitoring_word
    'ec_fan_motor',              // fan_word (EC condenser fan)
    'fan_impeller',              // fan_word
    // Distribution / sealing
    'copper_wire',            // refrigerant_distribution (wiring)
    'polymer_gasket',         // refrigerant_distribution (seals)
    // Hydronic side (Iter 2 expansion)
    'copper_terminal',        // hydronic_connections
    'hydronic_flow_meter',         // hydronic_flow (Iter 2)
    'hydronic_isolation_valve',    // hydronic_connections (Iter 2)
    'hydronic_circulator_pump',    // hydronic_pump (Iter 2)
    'pump_motor_capacitor',        // hydronic_pump (Iter 2)
    'expansion_vessel',            // hydronic_safety (Iter 2)
    'pressure_relief_valve',       // hydronic_safety (Iter 2)
    'air_separator_vent',          // hydronic_safety (Iter 2)
    'hydronic_manifold',           // hydronic_manifold (Iter 2)
    'thermal_balance_valve',       // hydronic_manifold (Iter 2)
    'hydronic_pressure_gauge',     // hydronic_manifold (Iter 2)
    // Controls (Iter 2)
    'pcb_controller',         // hp_controls_compute
    'hp_relay_board',         // hp_controls_compute (Iter 2)
    'hp_hmi_display',         // hp_controls_hmi (Iter 2)
    'hp_user_interface_pcb',  // hp_controls_hmi (Iter 2)
    'water_temperature_sensor_ntc', // hp_controls_sensors (Iter 2)
    'outdoor_temp_sensor',         // hp_controls_sensors (Iter 2)
    'defrost_sensor',              // hp_controls_sensors (Iter 2)
    'safety_relay_compressor',     // hp_controls_protection (Iter 2)
    'flow_switch_safety',          // hp_controls_protection (Iter 2)
    'high_limit_thermostat',       // hp_controls_protection (Iter 2)
    // Enclosure
    'polymer_enclosure',      // hp_enclosure_structure
    'aluminium_extrusion',    // hp_enclosure_structure frame
    'steel_plate',            // hp_enclosure_structure sheet metal
    'steel_bolt',             // hp_enclosure_structure fasteners
    // Mounting / drainage (Iter 2)
    'vibration_isolator_mount',
    'wall_bracket_assembly',
    'condensate_drip_tray',
    'condensate_drain_hose',
    'condensate_heater_strip',
  ]
}

/**
 * Mandatory character list for Vertical Farm briefs.
 * Pins to growing_rack_system, lighting_system, fertigation_loop, hvac_co2_system.
 */
export function deriveVerticalFarmMandatoryCharacters(): string[] {
  return [
    // Growing rack
    'aluminium_extrusion',    // rack_structure_vfarm
    'steel_bolt',             // rack_structure_vfarm fasteners
    'rack_caster_wheel',      // rack_structure_vfarm (Iter 2 — mobile racks)
    // Tray + grow media (Iter 2)
    'growing_tray_polymer',
    'grow_media_rockwool',
    // Lighting
    'pcb_controller',         // lighting_fixtures (LED driver board)
    'copper_wire',            // lighting_fixtures wiring
    'led_grow_module',                 // Iter 2
    'led_constant_current_driver',     // Iter 2
    'lighting_dali_controller',        // Iter 2
    // Fertigation
    'liquid_cooling_system',  // fertigation_flow (pump/loop — closest character)
    'polymer_gasket',         // fertigation_flow (seals)
    'nutrient_dosing_pump',         // Iter 2
    'nutrient_reservoir_tank',      // Iter 2
    'ec_conductivity_sensor',       // Iter 2
    'ph_sensor_inline',             // Iter 2
    'water_temperature_sensor_ntc', // Iter 2 — shared
    // HVAC/CO2
    'pressure_vessel',        // co2_dosing (CO2 cylinder)
    'gas_sensor',             // co2_dosing (CO2 sensor)
    'duct_fan_ec',            // hvac_flow (Iter 2)
    'co2_solenoid_valve',     // co2_dosing (Iter 2)
    'hepa_filter_element',    // hvac_filtration (Iter 2)
    'pre_filter_g4',          // hvac_filtration (Iter 2)
  ]
}

/**
 * Mandatory character list for EV Charger briefs.
 * Pins to charger_power_conversion, charger_enclosure.
 */
export function deriveEvChargerMandatoryCharacters(): string[] {
  return [
    // Charger PCS
    'power_converter',        // charger_pcs (rectifier/PFC)
    'transformer',            // charger_pcs (isolation transformer)
    'circuit_breaker',        // charger_pcs (protection)
    'pfc_inductor',           // charger_pcs (Iter 2)
    // DC-DC stage (Iter 2)
    'dc_dc_module',
    'igbt_power_module',
    'gate_driver_board',
    // Input filter (Iter 2)
    'ac_emi_filter',
    'inrush_current_limiter',
    'input_contactor',
    // DC link (Iter 2)
    'dc_link_capacitor',
    'dc_link_busbar',
    'dc_link_voltage_sensor',
    // Enclosure
    'switchboard_enclosure',  // charger_enclosure_structure
    'polymer_enclosure',      // charger_enclosure_structure (door/front)
    // HMI / payment (Iter 2)
    'hmi_capacitive_touch_panel',
    'rfid_reader_module',
    'payment_terminal_module',
    // Safety circuits (Iter 2)
    'rcd_type_b_module',
    'emergency_stop_button',
    'door_interlock_switch',
    // Cable assembly (Iter 2)
    'ccs_charging_cable',
    'ccs_connector_assembly',
    'cable_management_arm',
  ]
}

/**
 * Mandatory character list for Bioreactor briefs.
 * Pins to bioreactor_vessel, bioreactor_controls, bioprocess_vessel.
 *
 * Phase B Iter 1 (2026-05-11): added bioprocess_vessel characters covering
 * the agitator drive, sparger, thermal jacket and single-use bag interface.
 * Without these the BOM is just a static vessel body + sensor stack and
 * misses the actual bioprocess machinery (the largest cost driver on a
 * 200 L mammalian-cell skid).
 */
export function deriveBioreactorMandatoryCharacters(): string[] {
  return [
    // Vessel body
    'pressure_vessel',  // bioreactor_vessel_body (steel autoclave vessel)
    'polymer_gasket',   // bioreactor_vessel_body (seals)
    'steel_plate',      // bioreactor_vessel_body (flanges)
    // Vessel ports + valves (Iter 2)
    'cip_sip_port_assembly',
    'sample_port_aseptic',
    'harvest_valve_sanitary',
    'tri_clamp_fitting',
    // Vessel inspection (Iter 2)
    'sight_glass_assembly',
    'vessel_inspection_light',
    // Controls and sensing
    'gas_sensor',         // bioreactor_sensing (pH/DO/temp sensor)
    'pcb_controller',     // bioreactor_sensing (controller)
    'optical_arc_sensor', // bioreactor_sensing (optical sensor for OD)
    'ph_probe_sterilisable',  // Iter 2 (Mettler InPro 3253)
    'do_probe_optical',       // Iter 2 (Hamilton OneFerm)
    'level_sensor_capacitive', // Iter 2
    // Process control (Iter 2)
    'mass_flow_controller_gas',
    'peristaltic_dosing_pump',
    'foam_breaker_actuator',
    // Calibration loop (Iter 2)
    'calibration_buffer_kit',
    'temperature_calibration_probe',
    // Bioprocess vessel (Phase B Iter 1)
    'sterile_agitator_drive',       // agitation_drive_word
    'gas_sparger_assembly',         // gas_sparger_word
    'sterile_filter_membrane',      // gas_sparger_word (0.2 um filter)
    'thermal_jacket',               // thermal_jacket_word
    'single_use_biocompatible_bag', // single_use_bag_word
  ]
}

/**
 * Mandatory character list for Edge AI Server briefs.
 * Pins to edge_compute_system.
 */
export function deriveEdgeAiMandatoryCharacters(): string[] {
  return [
    // Edge compute hardware
    'pcb_controller',  // edge_compute_hardware (GPU/TPU board)
    'network_switch',  // edge_compute_hardware (comm switch)
    'copper_wire',     // edge_compute_hardware (harness)
    'gpu_accelerator_module',   // Iter 2 (NVIDIA H100/L40 class)
    'ddr5_dimm_module',         // Iter 2
    // Storage (Iter 2)
    'nvme_ssd_module',
    'sata_storage_drive',
    // Power (Iter 2)
    'server_psu_redundant',
    'pdu_rack_outlet',
    // Thermal (Iter 2)
    'cooling_fan_axial',
    'thermal_interface_material',
  ]
}

/**
 * Mandatory character list for AUV (Autonomous Underwater Vehicle) briefs.
 * Pins to hull_and_buoyancy, subsea_pressure_vessel, edge_compute_system.
 *
 * Phase B Iter 1 (2026-05-11): added subsea_pressure_vessel characters so the
 * tree carries the AUV-specific pressure-rated end caps, dive-rated O-rings,
 * syntactic foam buoyancy and trim weights — the parts that gate dive depth
 * and dominate the BOM. hull_and_buoyancy alone was too thin.
 */
export function deriveAuvMandatoryCharacters(): string[] {
  return [
    // Hull and buoyancy
    'polymer_enclosure',  // hull_structure (pressure hull)
    'aluminium_extrusion', // hull_structure (frame)
    'polymer_gasket',     // hull_structure (O-ring seals)
    // Hull frame + brackets + fairing (Iter 2)
    'hull_internal_frame',
    'instrument_mount_bracket',
    'hydrodynamic_fairing',
    'antifouling_coating',
    // Subsea pressure vessel (Phase B Iter 1)
    'pressure_rated_endcap',  // pressure_hull_word (depth-rated end caps)
    'dive_oring_seal',        // pressure_hull_word (high-pressure O-ring stack)
    'syntactic_foam_block',   // buoyancy_compensation_word (positive buoyancy)
    'ballast_trim_weight',    // buoyancy_compensation_word (trim/ballast)
    // Compute (existing + Iter 2)
    'pcb_controller',     // edge_compute_hardware (mission computer)
    'network_switch',     // edge_compute_hardware (acoustic/ethernet switch)
    'copper_wire',        // edge_compute_hardware (harness)
    'ddr5_dimm_module',
    'nvme_ssd_module',
    'cooling_fan_axial',
    // Avionics (Iter 2 — flight_computer sentence; AUV uses flight_computer for nav)
    'imu_6dof_module',
    'magnetometer_3axis',
    'barometer_pressure_sensor',
    'gnss_receiver_module',
    'antenna_pcb',
    // Propulsion (Iter 2)
    'power_converter',
    'brushless_dc_motor',
    'electronic_speed_controller',
    'propeller_carbon_blade',
    'motor_mount_aluminium',
    'motor_bearing_set',
  ]
}

/**
 * Mandatory character list for HAPS (High Altitude Pseudo-Satellite) briefs.
 * Pins to haps_airframe, solar_electric_airframe, propulsion_system,
 * edge_compute_system.
 *
 * Phase B Iter 1 (2026-05-11): added solar_electric_airframe characters —
 * the wing-integrated PV array, composite spar and Li-S night-storage
 * battery are the defining subsystems of any 30-day endurance HAPS.
 * Without them the BOM is just generic airframe bolts and avionics.
 */
export function deriveHapsMandatoryCharacters(): string[] {
  return [
    // HAPS airframe
    'aluminium_extrusion', // haps_structure (spar/frame)
    'steel_bolt',          // haps_structure (fasteners)
    'polymer_enclosure',   // haps_structure (nacelle/pod)
    'haps_rib_assembly',   // haps_structure (Iter 2)
    'haps_skin_film',      // haps_structure (Iter 2)
    // Control surfaces + servos (Iter 2)
    'haps_elevon_assembly',
    'haps_aileron_assembly',
    'mass_balance_weight',
    'servo_actuator_high_torque',
    'servo_pushrod_carbon',
    // Solar-electric airframe (Phase B Iter 1)
    'composite_spar',                 // composite_spar_word (carbon-fibre primary spar)
    'wing_integrated_pv_module',      // photovoltaic_array_word (wing-skin PV)
    'mppt_charge_controller',         // photovoltaic_array_word (MPPT)
    'lithium_sulfur_night_battery',   // night_storage_battery_word (Li-S 30-day pack)
    // Propulsion (existing + Iter 2)
    'power_converter',     // propulsion_motors (motor driver)
    'copper_wire',         // propulsion_motors (wiring)
    'brushless_dc_motor',                // Iter 2
    'electronic_speed_controller',       // Iter 2
    'propeller_carbon_blade',            // Iter 2
    'motor_mount_aluminium',             // Iter 2
    'motor_bearing_set',                 // Iter 2
    // Avionics (existing + Iter 2)
    'pcb_controller',      // edge_compute_hardware (flight computer)
    'network_switch',      // edge_compute_hardware (comms)
    'imu_6dof_module',                   // Iter 2
    'magnetometer_3axis',                // Iter 2
    'barometer_pressure_sensor',         // Iter 2
    'gnss_receiver_module',              // Iter 2
    'antenna_pcb',                       // Iter 2
    'telemetry_radio_modem',             // Iter 2
    // Edge compute payload (Iter 2 — HAPS often carries payload server)
    'ddr5_dimm_module',
    'nvme_ssd_module',
  ]
}

/**
 * Resolve the mandatory character set and optional quantity overrides for ANY
 * product class. Returns undefined for quantity overrides when the class has no
 * physics-derived quantities (all quantities come from LLM then).
 *
 * This is the single call site for 2-decompose.ts — it replaces the ad-hoc
 * BESS-only check that caused cross-contamination for all other classes.
 */
export function deriveClassMandatoryCharacters(
  classification: string,
  parsedBriefConstraints?: { target_performance?: { value?: number | null } },
): {
  mandatoryCharacters: string[]
  quantityOverrides?: Record<string, number>
  preferredWordIds?: Record<string, string>
} {
  const cls = classification.toLowerCase()

  // BESS — physics-derived quantities from brief
  if (cls === 'battery_energy_storage' || cls === 'bess' || cls.includes('energy_storage')) {
    const perfValue = parsedBriefConstraints?.target_performance?.value
    if (typeof perfValue === 'number') {
      const derived = deriveBessQuantityOverrides({ usableKwh: perfValue })
      return { mandatoryCharacters: derived.mandatoryCharacters, quantityOverrides: derived.quantities }
    }
    // BESS without energy figure — use mandatory set only, no quantity overrides
    const derived = deriveBessQuantityOverrides({ usableKwh: 3500 }) // safe fallback
    return { mandatoryCharacters: derived.mandatoryCharacters, quantityOverrides: undefined }
  }

  // Drone / UAV
  if (cls.includes('drone') || cls.includes('uav') || cls.includes('quadcopter') || cls.includes('multirotor')) {
    return {
      mandatoryCharacters: deriveDroneMandatoryCharacters(),
      preferredWordIds: {
        'pcb_controller': 'avionics_compute',    // flight computer (flight_computer sentence), not bms_master
        'polymer_enclosure': 'airframe_body',    // airframe housing (airframe_structure), not hp_enclosure_structure
        'aluminium_extrusion': 'airframe_body',  // airframe frame (airframe_structure), not hp_enclosure_structure
        'steel_bolt': 'airframe_body',           // airframe fasteners, not hp/farm
        'copper_wire': 'avionics_compute',       // avionics wiring (flight_computer), not refrigerant_distribution
        'power_converter': 'propulsion_motors',  // ESC/motor driver (propulsion_system), not charger_pcs
        'network_switch': 'avionics_compute',    // avionics comm hub, not ems
      },
    }
  }

  // CGM / wearable medical
  // Bug P0-5 fix (2026-05-11): polymer_enclosure / polymer_gasket now map to
  // wearable_housing / wearable_skin_interface under the new
  // medical_wearable_enclosure sentence — NOT hull_and_buoyancy.
  if (cls.includes('cgm') || cls.includes('glucose') || cls.includes('wearable') || cls.includes('biosensor')) {
    return {
      mandatoryCharacters: deriveCgmMandatoryCharacters(),
      preferredWordIds: {
        'pcb_controller': 'biosensor_hardware',       // CGM analogue front-end (biosensor_system)
        'copper_wire': 'biosensor_hardware',          // flex harness wiring
        'polymer_enclosure': 'wearable_housing',      // biocompatible outer shell
        'polymer_gasket': 'wearable_skin_interface',  // skin seal / IP67 boundary
      },
    }
  }

  // Heat pump / thermal system
  if (cls.includes('heat_pump') || cls.includes('thermal_system') || cls.includes('heat pump')) {
    return {
      mandatoryCharacters: deriveHeatPumpMandatoryCharacters(),
      preferredWordIds: {
        'liquid_cooling_system': 'refrigerant_cycle',    // refrigerant loop (refrigerant_circuit), not active_cooling
        'pcb_controller': 'hp_controls_compute',         // HP controller (heat_pump_controls), not bms_master
        // copper_wire, polymer_gasket, copper_terminal already first-map to heat pump words
        // polymer_enclosure, aluminium_extrusion, steel_plate, steel_bolt already first-map to hp_enclosure_structure
      },
    }
  }

  // Vertical farm / CEA
  if (cls.includes('vertical_farm') || cls.includes('farm') || cls.includes('cea') || cls.includes('greenhouse')) {
    return {
      mandatoryCharacters: deriveVerticalFarmMandatoryCharacters(),
      preferredWordIds: {
        'liquid_cooling_system': 'fertigation_flow',    // fertigation/hydroponics (fertigation_loop), not active_cooling
        'pcb_controller': 'lighting_fixtures',           // grow light controller (lighting_system), not bms_master
        'copper_wire': 'fertigation_flow',               // fertigation wiring, not refrigerant_distribution
        'polymer_gasket': 'fertigation_flow',            // fertigation seals, not refrigerant_distribution
        'aluminium_extrusion': 'rack_structure_vfarm',   // grow rack frame (growing_rack_system), not hp_enclosure_structure
        'steel_bolt': 'rack_structure_vfarm',            // rack fasteners, not hp_enclosure_structure
      },
    }
  }

  // EV charger
  if (cls.includes('ev_charger') || cls.includes('charger') || cls.includes('ev charger')) {
    return {
      mandatoryCharacters: deriveEvChargerMandatoryCharacters(),
      preferredWordIds: {
        'polymer_enclosure': 'charger_enclosure_structure', // charger housing (charger_enclosure), not hp_enclosure_structure
        'power_converter': 'charger_pcs',                   // DC power stack (charger_power_conversion), not propulsion_motors
        // pcb_controller: bms_master is first; charger may not have a better word in hierarchy
        // copper_wire: refrigerant_distribution is first; keep as there's no charger-specific wire word
      },
    }
  }

  // Bioreactor
  if (cls.includes('bioreactor') || cls.includes('ferment')) {
    return {
      mandatoryCharacters: deriveBioreactorMandatoryCharacters(),
      preferredWordIds: {
        'pcb_controller': 'bioreactor_sensing',       // bioreactor control (bioreactor_controls), not bms_master
        'copper_wire': 'bioreactor_sensing',          // sensor wiring, not refrigerant_distribution
        'polymer_gasket': 'bioreactor_vessel_body',   // vessel seals (bioreactor_vessel), not refrigerant_distribution
        'pressure_vessel': 'bioreactor_vessel_body',  // bioreactor vessel body (bioreactor_vessel)
      },
    }
  }

  // Edge AI / server
  if (cls.includes('edge_ai') || cls.includes('edge ai') || cls.includes('server') || cls.includes('compute')) {
    return {
      mandatoryCharacters: deriveEdgeAiMandatoryCharacters(),
      preferredWordIds: {
        'pcb_controller': 'edge_compute_hardware',   // compute board (edge_compute_system), not bms_master
        'copper_wire': 'edge_compute_hardware',      // board wiring, not refrigerant_distribution
        'network_switch': 'edge_compute_hardware',   // networking hardware, not ems_controller_board
        'liquid_cooling_system': 'active_cooling',   // server thermal (thermal_management_system) — already first
      },
    }
  }

  // AUV / underwater
  if (cls.includes('auv') || cls.includes('underwater') || cls.includes('subsea') || cls.includes('rov')) {
    return {
      mandatoryCharacters: deriveAuvMandatoryCharacters(),
      preferredWordIds: {
        'pcb_controller': 'avionics_compute',   // AUV nav computer (flight_computer), not bms_master
        'polymer_enclosure': 'hull_structure',  // pressure hull (hull_and_buoyancy)
        'polymer_gasket': 'hull_structure',     // hull O-rings (hull_and_buoyancy)
        'copper_wire': 'avionics_compute',      // avionics wiring (flight_computer)
        'power_converter': 'propulsion_motors', // thruster ESC (propulsion_system)
        // Phase B Iter 1: pressure_vessel now routes to subsea_pressure_vessel
        // (was hull_structure — but the new sentence is the better domain home).
        'pressure_vessel': 'pressure_hull_word', // pressure-rated body (subsea_pressure_vessel)
        'aluminium_extrusion': 'hull_structure', // hull frame (hull_and_buoyancy)
        'network_switch': 'avionics_compute',   // AUV comms (flight_computer)
        // New Phase B Iter 1 chars (pressure_rated_endcap, dive_oring_seal,
        // syntactic_foam_block, ballast_trim_weight) are unique to
        // subsea_pressure_vessel words — they self-route, no preferred id needed.
      },
    }
  }

  // HAPS / stratospheric
  if (cls.includes('haps') || cls.includes('stratospheric') || cls.includes('pseudo-satellite')) {
    return {
      mandatoryCharacters: deriveHapsMandatoryCharacters(),
      preferredWordIds: {
        'pcb_controller': 'avionics_compute',    // HAPS avionics (flight_computer), not bms_master
        'aluminium_extrusion': 'haps_structure', // HAPS airframe spar (haps_airframe), not hp_enclosure_structure
        'polymer_enclosure': 'haps_structure',   // HAPS nacelle (haps_airframe), not hp_enclosure_structure
        'steel_bolt': 'haps_structure',          // HAPS fasteners (haps_airframe), not hp_enclosure_structure
        'copper_wire': 'avionics_compute',       // avionics wiring (flight_computer), not refrigerant_distribution
        'power_converter': 'propulsion_motors',  // motor ESC (propulsion_system), not charger_pcs
        'network_switch': 'avionics_compute',    // avionics comms (flight_computer), not ems
        'liquid_cooling_system': 'active_cooling', // payload thermal (thermal_management_system) — already first
      },
    }
  }

  // Unknown class — return empty (no contamination protection, but no false mandatory chars)
  return { mandatoryCharacters: [] }
}

/**
 * Build a deterministic RadicalTree from a flat leaf list.
 *
 * @param leaves              Leaf records from Stage 1 LLM output
 * @param productSlug         e.g. "bess_container_3_5mwh" — used in composition.id
 * @param productClass        e.g. "battery_energy_storage" — used in meta
 * @param quantityOverrides   Optional physics-based quantity override map.
 *                            When set, LLM multiplicities are IGNORED for those character_ids.
 * @param mandatoryCharacters Optional list of character_ids that MUST appear in the tree.
 *                            Any character in this list that the LLM did not identify is
 *                            added with quantity=1 (or from quantityOverrides if present).
 *                            This ensures tree SHAPE is deterministic regardless of LLM variance.
 * @param preferredWordIds    Optional map of character_id → preferred word_id.
 *                            When a character maps to multiple words, this override takes
 *                            precedence over the default words[0] selection. Used to prevent
 *                            cross-class contamination: e.g. pcb_controller first maps to
 *                            bms_master (BESS) by insertion order, but for a heat pump it
 *                            should map to hp_controls_compute (heat_pump_controls).
 * @returns BuildResult containing the tree and diagnostics
 */
export function buildTreeFromLeaves(
  leaves: LeafRecord[],
  productSlug: string,
  productClass: string,
  quantityOverrides?: QuantityOverrideMap,
  mandatoryCharacters?: string[],
  preferredWordIds?: Record<string, string>,
): BuildResult {
  const characterToWords = buildCharacterToWords()
  const wordToSentence = buildWordToSentence()

  // ── Phase B Iter 1 (Bug P0-7 / 2026-05-11): allowed_classes filter ──────
  // Drop word candidates whose target sentence's allowed_classes whitelist
  // does NOT include the normalised product class. Without this filter the
  // builder used the first word in characterToWords order, causing wrong-
  // domain leakage (refrigerant_circuit on AUV/drone/HAPS, fss on bioreactor/
  // vfarm, heat_pump_enclosure on bioreactor). When the product class is
  // not recognised by normaliseProductClass(), the filter is a no-op so the
  // legacy behaviour is preserved for unknown classes — BUT we emit a
  // warning so silent regressions (e.g. a typo "heat_pup") are visible in
  // logs. This was flagged by all three council seats (Grok, Gemini, GLM)
  // as the primary residual risk of the no-op fallback.
  const normalisedClass: ProductClass | null = normaliseProductClass(productClass)
  if (!normalisedClass) {
    console.warn(
      `[structural-builder] Unrecognised product class "${productClass}" — ` +
      `allowed_classes filter disabled, wrong-domain leakage protection inactive. ` +
      `Add a normalisation rule in character-hierarchy.ts:normaliseProductClass().`,
    )
  }
  const isWordAllowed = (word: HierarchyWord): boolean => {
    if (!normalisedClass) return true // unknown class — skip filter (warned above)
    const sentence = wordToSentence.get(word.id)
    if (!sentence) return true // word with no sentence — handled separately
    return sentence.allowed_classes.includes(normalisedClass)
  }

  const unmappedCharacters: string[] = []
  const grouped: GroupedLeaf[] = []

  // ── Step 0: merge mandatory characters into leaf list ────────────────────
  // Any mandatory character not already present in the LLM leaf list is added
  // with quantity from quantityOverrides (or 1 as fallback).
  // This ensures tree shape is deterministic regardless of LLM variance.
  let effectiveLeaves = [...leaves]
  if (mandatoryCharacters && mandatoryCharacters.length > 0) {
    const llmCharacterIds = new Set(leaves.map(l => l.character_id))
    for (const charId of mandatoryCharacters) {
      if (!llmCharacterIds.has(charId)) {
        const fallbackQty = quantityOverrides?.[charId] ?? 1
        effectiveLeaves.push({
          character_id: charId,
          archetype_id: null,
          multiplicity: fallbackQty,
          mpn_hint: null,
          manufacturer_hint: null,
          estimated_unit_price_gbp: null,
          description: `mandatory baseline — added by builder (not identified by LLM)`,
        })
      }
    }
    // Remove LLM-provided leaves that are NOT in the mandatory set.
    // This is the critical determinism guarantee: only characters in the mandatory
    // set appear in the tree. The LLM may identify extra characters (or miss some),
    // but the mandatory set DEFINES the tree structure — it is invariant.
    // UNKNOWN leaves are always dropped (surfaced separately as unmapped).
    const mandatorySet = new Set(mandatoryCharacters)
    effectiveLeaves = effectiveLeaves.filter(l => {
      if (l.character_id === '<UNKNOWN>' || l.character_id.startsWith('<UNKNOWN>')) {
        return false // UNKNOWN leaves always dropped from tree
      }
      // Keep only leaves whose character_id is in the mandatory set
      return mandatorySet.has(l.character_id)
    })
  }

  // ── Step 1: classify each leaf ──────────────────────────────────────────
  for (const leaf of effectiveLeaves) {
    const archetypeId = resolveArchetypeId(leaf)

    if (archetypeId.startsWith('<UNKNOWN_RADICAL>')) {
      unmappedCharacters.push(leaf.character_id)
      // UNKNOWN leaves are NOT placed in the tree — surface to operator
      continue
    }

    // Find which words contain this character
    const allWords = characterToWords.get(leaf.character_id)
    if (!allWords || allWords.length === 0) {
      // Character exists in library but not in hierarchy — fall back to UNKNOWN_SUBSYSTEM
      unmappedCharacters.push(leaf.character_id)
      continue
    }

    // Phase B Iter 1: filter to class-allowed words BEFORE picking. This is
    // the universality guard — wrong-class candidates are stripped, so a
    // shared character like copper_wire on an AUV brief no longer cascades
    // to refrigerant_distribution → refrigerant_circuit just because that's
    // the first word in WORDS-insertion order.
    const allowedWords = allWords.filter(isWordAllowed)
    if (allowedWords.length === 0) {
      // No word for this character is valid for the current class. Surface
      // as unmapped so the operator notices a library gap rather than
      // silently misplacing the leaf in a wrong-domain sentence.
      unmappedCharacters.push(leaf.character_id)
      continue
    }

    // Pick the word: check preferredWordIds first (class-specific override
    // honoured ONLY if the preferred word itself is class-allowed), then
    // fall back to allowedWords[0] (WORDS insertion order, restricted to
    // class-allowed candidates).
    let word = allowedWords[0]
    if (preferredWordIds && leaf.character_id in preferredWordIds) {
      const preferredId = preferredWordIds[leaf.character_id]
      const preferred = allowedWords.find(w => w.id === preferredId)
      if (preferred) {
        word = preferred
      }
      // If preferred word not found in allowedWords, fall back to allowedWords[0]
    }
    const sentence = wordToSentence.get(word.id)
    if (!sentence) {
      unmappedCharacters.push(leaf.character_id)
      continue
    }

    grouped.push({
      leaf,
      wordId: word.id,
      sentenceId: sentence.id,
      archetypeId,
    })
  }

  // ── Step 2: group by sentence → word → leaves ──────────────────────────
  // Use sorted Maps so output is deterministic regardless of input order.

  // sentenceId → Map<wordId, GroupedLeaf[]>
  const bySentence = new Map<string, Map<string, GroupedLeaf[]>>()

  for (const item of grouped) {
    let wordMap = bySentence.get(item.sentenceId)
    if (!wordMap) {
      wordMap = new Map()
      bySentence.set(item.sentenceId, wordMap)
    }
    const leafList = wordMap.get(item.wordId) ?? []
    leafList.push(item)
    wordMap.set(item.wordId, leafList)
  }

  // ── Step 3: build sentence-level CompositionNodes ──────────────────────
  const sentenceNodes: CompositionNode[] = []

  // Sort sentence IDs alphabetically — deterministic
  const sortedSentenceIds = [...bySentence.keys()].sort()

  for (const sentenceId of sortedSentenceIds) {
    const wordMap = bySentence.get(sentenceId)!
    const sentenceDef = SENTENCE_BY_ID.get(sentenceId)
    const sentenceLabel = sentenceDef?.label ?? sentenceId

    // Build word-level nodes
    const wordNodes: CompositionNode[] = []
    const sortedWordIds = [...wordMap.keys()].sort()

    for (const wordId of sortedWordIds) {
      const wordLeaves = wordMap.get(wordId)!
      const wordDef = WORD_BY_ID.get(wordId)
      const wordLabel = wordDef?.label ?? wordId

      // Deduplicate leaves within the same word by archetypeId (= character_id after normalisation):
      // if the LLM emits the same character multiple times, take the MAX quantity
      // (LLM may split a component into multiple roles — max is more conservative than sum).
      const leafByArchetype = new Map<string, GroupedLeaf>()
      for (const item of wordLeaves) {
        const existing = leafByArchetype.get(item.archetypeId)
        if (existing) {
          // Take max quantity to avoid double-counting from LLM over-splitting
          if (item.leaf.multiplicity > existing.leaf.multiplicity) {
            existing.leaf = { ...item.leaf }
          }
        } else {
          leafByArchetype.set(item.archetypeId, { ...item })
        }
      }

      // Sort leaf nodes by archetypeId — deterministic
      const sortedLeafEntries = [...leafByArchetype.entries()].sort(([a], [b]) =>
        a.localeCompare(b)
      )

      const leafNodes: CompositionNode[] = sortedLeafEntries.map(([archetypeId, item]) => {
        // Apply physics-based quantity override if available for this character_id
        const override = quantityOverrides?.[archetypeId]
        const quantity = override !== undefined
          ? override
          : Math.max(1, Math.round(item.leaf.multiplicity))
        return {
          archetypeId,
          quantity,
          children: [],
        }
      })

      wordNodes.push({
        archetypeId: wordId,
        quantity: 1,
        children: leafNodes,
      })
    }

    // Sort word nodes by archetypeId — deterministic
    const sortedWordNodes = [...wordNodes].sort((a, b) =>
      a.archetypeId.localeCompare(b.archetypeId)
    )

    sentenceNodes.push({
      archetypeId: sentenceId,
      quantity: 1,
      children: sortedWordNodes,
    })
  }

  // Sort sentence nodes by archetypeId — deterministic
  const sortedSentenceNodes = [...sentenceNodes].sort((a, b) =>
    a.archetypeId.localeCompare(b.archetypeId)
  )

  // ── Step 4: build the root node ─────────────────────────────────────────
  const rootArchetypeId = `${productSlug.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}_system`

  const root: CompositionNode = {
    archetypeId: rootArchetypeId,
    quantity: 1,
    children: sortedSentenceNodes,
  }

  // ── Step 5: wrap in RadicalTree ─────────────────────────────────────────
  const tree: RadicalTree = {
    radical_spec_version: CURRENT_RADICAL_SPEC_VERSION,
    composition: {
      id: productSlug,
      description: `${productClass} system — two-stage deterministic build`,
      environment: ['industrial'],
      root,
    },
    meta: {
      created_at: new Date().toISOString(),
      product_slug: productSlug,
      authored_by: 'phase-1-5-structural-builder',
    },
  }

  // Count placed leaves (not counting sentence/word nodes)
  const placedLeafCount = grouped.length

  return {
    tree,
    unmappedCharacters,
    placedLeafCount,
    stats: {
      sentences: sortedSentenceIds.length,
      words: [...bySentence.values()].reduce((n, m) => n + m.size, 0),
      leaves: placedLeafCount,
      unmapped: unmappedCharacters.length,
      hierarchyStats: HIERARCHY_STATS,
    },
  }
}

// ---------------------------------------------------------------------------
// Leaf list validator
// ---------------------------------------------------------------------------

/**
 * Validate and normalise a raw LLM leaf-list response.
 * Returns validated LeafRecord[] or throws with a descriptive error.
 */
export function validateLeafList(raw: unknown): LeafRecord[] {
  if (!Array.isArray(raw)) {
    throw new Error(
      `Leaf-list validation failed: expected a JSON array, got ${typeof raw}`
    )
  }

  if (raw.length === 0) {
    throw new Error('Leaf-list validation failed: empty array — LLM returned no leaves')
  }

  if (raw.length > 200) {
    throw new Error(
      `Leaf-list validation failed: ${raw.length} leaves exceeds the 200-leaf cap`
    )
  }

  const validated: LeafRecord[] = []
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object') {
      throw new Error(`Leaf-list item at index ${i} is not an object`)
    }

    const characterId = (item as any).character_id
    if (typeof characterId !== 'string' || characterId.trim() === '') {
      throw new Error(
        `Leaf-list item at index ${i}: character_id must be a non-empty string`
      )
    }

    const rawMultiplicity = (item as any).multiplicity ?? (item as any).quantity ?? (item as any).qty ?? 1
    const multiplicity = typeof rawMultiplicity === 'number' && rawMultiplicity >= 1
      ? rawMultiplicity
      : 1

    validated.push({
      character_id: characterId.trim(),
      archetype_id: (item as any).archetype_id ?? null,
      multiplicity,
      mpn_hint: (item as any).mpn_hint ?? null,
      manufacturer_hint: (item as any).manufacturer_hint ?? null,
      estimated_unit_price_gbp: (item as any).estimated_unit_price_gbp ?? null,
      description: (item as any).description ?? null,
    })
  }

  return validated
}
