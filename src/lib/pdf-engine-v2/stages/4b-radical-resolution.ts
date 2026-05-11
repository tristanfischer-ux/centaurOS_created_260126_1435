/**
 * @file stages/4b-radical-resolution.ts — Phase 2: Production Resolution Stage
 *
 * Lifts radical/demo/resolution.ts to production. Walks all leaves of a
 * RadicalTree and resolves each to: mpn, manufacturer, unit_price_gbp,
 * lead_weeks, verification_grade, source.
 *
 * Feature flag: RADICAL_PHASE_2_RESOLUTION=true enables this path.
 *
 * Input:  state.radicalTree (from Phase 1.5 / runDecomposeRadical)
 * Output: state.resolvedRadicalTree — same tree shape, each leaf annotated
 *
 * Routing per part_class:
 *   electronic_cots  → distributor aggregator (findSkuForPart)
 *   mechanical_cots  → distributor aggregator (findSkuForPart)
 *   oem_subsystem    → vendor-catalog lookup (Pattern C)
 *   structural_fabricated → Nightshift corpus stub (needs wiring separately)
 *   software_ip      → LLM estimated_unit_price_gbp from leaf
 *
 * Distributor priority (distributor-asymmetry memory):
 *   BESS / heat-pump / EV-charger / bioreactor (industrial) → Digi-Key first
 *   Drone / edge-AI / CGM (electronic)                       → Mouser first
 *   Farnell always third as UK-friendly fallback
 *
 * Budget guard: at most MAX_DISTRIBUTOR_CALLS live API calls per pipeline run.
 * High-value / MPN-hinted leaves are prioritised.
 *
 * Part-class validation: prevents the LFP/PWC0805 false-positive bug —
 * a distributor match is only accepted if its MPN's logical class matches
 * the leaf's expected class (electronic vs mechanical vs oem vs structural).
 *
 * Strictly additive — existing per-class BOM stage (Stage 4) is UNCHANGED.
 */

import type { RadicalTree, CompositionNode } from '../radical/schema.js'
import { findSkuForPart, type AggregateResult } from '../lib/distributors/index.js'
import { findEntriesByPartTerm, VENDOR_CATALOG, type VendorCatalogEntry } from '../lib/vendor-catalog.js'
import { findSuppliersBySpecialism } from '../lib/local-corpus.js'

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

/**
 * Check if Phase 2 Resolution is enabled.
 * Must be set to exactly "true" (case-insensitive), "1", "yes", or "on".
 */
export function isPhase2ResolutionEnabled(): boolean {
  const raw = (process.env.RADICAL_PHASE_2_RESOLUTION ?? '').toLowerCase().trim()
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on'
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * 5-class part taxonomy — same as used in Stage 4 / IntegratedBomLine.
 */
export type PartClass =
  | 'electronic_cots'
  | 'mechanical_cots'
  | 'oem_subsystem'
  | 'structural_fabricated'
  | 'software_ip'

/**
 * Verification grade hierarchy: verified > estimated > grade_c > grade_d > stub > data_gap
 *
 * Bug P1-8 fix (2026-05-11): grade_c is the new tier for vendor-catalog
 * resolutions (manufacturer + lead time present, but no unit price). It
 * sits between estimated (LLM price hint) and grade_d (price-only fallback
 * from a static table). The PDF renderer maps grade_c → amber and
 * grade_d → grey so the user can see the difference.
 */
export type VerificationGrade = 'verified' | 'estimated' | 'grade_c' | 'grade_d' | 'stub' | 'data_gap'

/**
 * A resolved leaf — one BOM line with all sourcing data populated.
 * Attached to a CompositionNode that was a tree leaf.
 */
export interface ResolvedLeafAnnotation {
  /** Archetype ID from the RadicalTree CompositionNode */
  archetype_id: string
  /** Inferred part class for this leaf */
  part_class: PartClass
  /** Quantity from the CompositionNode */
  qty: number
  /** Matched MPN (null if not resolved via distributor) */
  mpn: string | null
  /** Matched manufacturer */
  manufacturer: string | null
  /** Unit price in GBP (verified from distributor, estimated from vendor catalog / LLM, or Grade D table) */
  unit_price_gbp: number | null
  /** Lead time in weeks (from distributor or vendor catalog; null when not available) */
  lead_weeks: number | null
  /** Verification grade — see type definition */
  verification_grade: VerificationGrade
  /** Primary source for this resolution */
  source: 'mouser' | 'digikey' | 'farnell' | 'lcsc' | 'vendor_catalog' | 'llm_estimate' | 'grade_d_table' | 'bom_estimate' | 'stub' | 'budget_exhausted'
  /** Product page URL when available */
  source_url: string | null
  /** Which distributor hit, if applicable */
  distributor: 'mouser' | 'digikey' | 'farnell' | 'lcsc' | 'vendor_catalog' | 'estimated' | 'stub' | null
  /** Grade D basis string, when used */
  grade_d_basis: string | null
  /** Human-readable notes for the PDF audit log */
  notes: string | null
}

/**
 * A RadicalTree node annotated with resolution data for leaf nodes.
 */
export interface ResolvedCompositionNode extends CompositionNode {
  /** Present on leaf nodes (nodes with no children in the tree) */
  resolution?: ResolvedLeafAnnotation
  /** Recursively typed children */
  children: ResolvedCompositionNode[]
}

/**
 * The resolved radical tree — same outer shape as RadicalTree but composition
 * nodes carry resolution annotations on leaves.
 */
export interface ResolvedRadicalTree {
  radical_spec_version: string
  composition: {
    id: string
    description: string
    root: ResolvedCompositionNode
    environment: string[]
  }
  meta?: RadicalTree['meta']
  /** Resolution-specific metadata */
  resolution_meta: {
    product_class: string
    distributor_priority: 'industrial' | 'electronic'
    distributor_calls_made: number
    resolved_at: string
    stats: ResolutionStats
  }
}

export interface ResolutionStats {
  total_leaves: number
  verified_by_distributor: number
  from_vendor_catalog: number
  from_llm_estimate: number
  grade_d: number
  stub: number
  data_gap: number
  distributor_calls_made: number
}

// ---------------------------------------------------------------------------
// Part-class classifier — maps character_id (archetype_id in the tree) to
// a PartClass. This is the production equivalent of classifyPartClass in
// the demo. Uses character_id strings directly (post structural-builder).
// ---------------------------------------------------------------------------

/** Characters that map to electronic COTS */
const ELECTRONIC_COTS_CHARACTERS = new Set<string>([
  'gas_sensor',
  'optical_arc_sensor',
  'ems_controller',
  'network_switch',
  'pcb_controller',
  'dc_contactor',
  'circuit_breaker',
  'protection_relay',
  // Bug P0-6: refrigerant-circuit pressure transducers and safety switch.
  'high_pressure_transducer',
  'low_pressure_transducer',
  'safety_pressure_switch',
  // Phase B Iter 2 (2026-05-11): expanded part library for depth.
  // BMS electronics
  'bms_isolation_ic', 'bms_slave_monitor_ic', 'can_transceiver_ic',
  'isolation_transceiver_ic', 'esd_protection_diode',
  // Sensors / detection
  'smoke_detector_aspirating', 'thermal_linear_detector',
  'door_intrusion_switch', 'access_control_reader', 'cctv_camera',
  'coolant_temperature_sensor', 'coolant_flow_switch',
  'water_temperature_sensor_ntc', 'outdoor_temp_sensor', 'defrost_sensor',
  'flow_switch_safety', 'high_limit_thermostat',
  // EMS / metering
  'ems_hmi_panel', 'ems_gateway_modem', 'revenue_meter', 'metering_ct',
  'monitoring_relay', 'mcb_low_voltage', 'safety_relay_compressor',
  'hp_relay_board', 'hp_hmi_display', 'hp_user_interface_pcb',
  // Drone / avionics electronics
  'imu_6dof_module', 'magnetometer_3axis', 'barometer_pressure_sensor',
  'gnss_receiver_module', 'telemetry_radio_modem', 'rc_receiver_module',
  'avionics_pdb', 'avionics_bec_5v', 'avionics_current_sensor',
  'electronic_speed_controller', 'propulsion_current_sensor',
  // Bioreactor sensors
  'ph_probe_sterilisable', 'do_probe_optical', 'level_sensor_capacitive',
  // Vfarm sensors
  'ec_conductivity_sensor', 'ph_sensor_inline',
  // CGM electronics
  'analogue_front_end_ic', 'ble_soc_module', 'radio_crystal_oscillator',
  'biosensor_regulator_ldo', 'accelerometer_3axis_lp',
  // EV charger electronics
  'hmi_capacitive_touch_panel', 'rfid_reader_module', 'payment_terminal_module',
  'rcd_type_b_module', 'emergency_stop_button', 'door_interlock_switch',
  'dc_link_voltage_sensor', 'gate_driver_board',
  // Edge AI passives
  'ddr5_dimm_module', 'nvme_ssd_module',
  // EMS / charger DC link sensing electronics
  'ems_psu_24v', 'ups_module',
  // Heat pump
  'pump_motor_capacitor',
])

/** Characters that map to mechanical COTS */
const MECHANICAL_COTS_CHARACTERS = new Set<string>([
  'copper_busbar',
  'cable_transit_frame',
  'thermal_insulation_panel',
  // Generic hardware — stocked by RS / Farnell / Würth / McMaster; Grade D fallback below
  'steel_bolt',
  'steel_threaded_rod',
  'copper_wire',
  'copper_terminal',
  'polymer_gasket',
  'aluminium_heatsink',
  // Bug P0-6: small lubricants / consumables on the heat-pump refrigerant circuit.
  'refrigerant_lubricant',
  // Phase B Iter 2 (2026-05-11): expanded part library for depth.
  // BMS / cell mechanicals
  'cell_busbar_link', 'cell_compression_pad', 'cell_top_cap_assembly',
  'cell_balance_resistor', 'cell_thermistor_ntc', 'cell_tap_connector',
  'bms_master_connector', 'current_shunt_resistor', 'voltage_divider_resistor',
  'bms_can_harness', 'can_termination_resistor',
  // Rack mechanicals
  'rack_caster_wheel', 'rack_earthing_strap', 'rack_lifting_eye',
  // Switchgear mechanicals
  'dc_isolator_switch', 'dc_fuse_holder', 'dc_fuse_link', 'pre_charge_contactor',
  'busbar_support_insulator', 'busbar_heat_shrink',
  'surge_arrester_dc', 'earthing_busbar', 'earth_fault_relay', 'earthing_lug',
  // Thermal mechanicals
  'cold_plate', 'coolant_distribution_manifold', 'thermal_interface_material',
  'coolant_pump', 'coolant_reservoir_tank',
  // FSS mechanicals
  'pressure_gauge_fss', 'suppression_nozzle', 'suppression_discharge_pipe',
  'manual_pull_station', 'fss_alarm_strobe', 'fss_warning_horn',
  'fss_control_panel',
  // Container fit-out mechanicals
  'cable_tray', 'cable_gland', 'interior_led_luminaire', 'emergency_light',
  'convenience_outlet', 'distribution_board_aux', 'earthing_electrode_rod',
  'hvac_split_unit', 'hvac_condensate_pump', 'hvac_thermostat',
  'ems_fibre_patch_panel',
  // Heat pump mechanicals
  'hydronic_flow_meter', 'hydronic_isolation_valve', 'hydronic_circulator_pump',
  'expansion_vessel', 'pressure_relief_valve', 'air_separator_vent',
  'hydronic_manifold', 'thermal_balance_valve', 'hydronic_pressure_gauge',
  'vibration_isolator_mount', 'wall_bracket_assembly',
  'condensate_drip_tray', 'condensate_drain_hose', 'condensate_heater_strip',
  // Drone mechanicals
  'carbon_fibre_arm', 'landing_skid_polymer', 'landing_gear_strut',
  'battery_tray_polymer', 'battery_strap_velcro', 'payload_release_servo',
  'propeller_carbon_blade', 'propeller_retention_nut', 'propeller_hub',
  'motor_mount_aluminium', 'motor_bearing_set',
  // Bioreactor mechanicals
  'cip_sip_port_assembly', 'sample_port_aseptic', 'harvest_valve_sanitary',
  'tri_clamp_fitting', 'sight_glass_assembly', 'vessel_inspection_light',
  'foam_breaker_actuator', 'calibration_buffer_kit', 'temperature_calibration_probe',
  // Vfarm mechanicals
  'growing_tray_polymer', 'grow_media_rockwool', 'duct_fan_ec',
  'co2_solenoid_valve', 'hepa_filter_element', 'pre_filter_g4',
  'nutrient_dosing_pump', 'nutrient_reservoir_tank',
  // CGM mechanicals
  'glucose_electrode_strip', 'antenna_pcb', 'coin_cell_battery_cr1632',
  'adhesive_skin_patch', 'applicator_housing_polymer',
  'insertion_needle_assembly', 'silicone_overmould', 'biocompatible_label_layer',
  // EV charger mechanicals
  'pfc_inductor', 'ac_emi_filter', 'inrush_current_limiter', 'input_contactor',
  'dc_link_capacitor', 'snubber_capacitor', 'ac_filter_inductor',
  'ac_filter_capacitor', 'transformer_bushing', 'tap_changer_assembly',
  'igbt_power_module', 'dc_link_busbar',
  'ccs_charging_cable', 'ccs_connector_assembly', 'cable_management_arm',
  // HAPS mechanicals
  'haps_rib_assembly', 'haps_skin_film', 'haps_elevon_assembly',
  'haps_aileron_assembly', 'mass_balance_weight',
  'servo_actuator_high_torque', 'servo_pushrod_carbon',
  // AUV mechanicals
  'hull_internal_frame', 'instrument_mount_bracket', 'hydrodynamic_fairing',
  'antifouling_coating',
  // Edge AI mechanicals
  'sata_storage_drive', 'server_psu_redundant', 'pdu_rack_outlet',
  'cooling_fan_axial',
  // Bioreactor process control
  'mass_flow_controller_gas', 'peristaltic_dosing_pump',
  // Vfarm light driver / DALI
  'led_grow_module', 'led_constant_current_driver', 'lighting_dali_controller',
  // Charger DC-DC
  'dc_dc_module',
])

/** Characters that map to OEM subsystem */
const OEM_SUBSYSTEM_CHARACTERS = new Set<string>([
  'lfp_prismatic_cell',
  'power_converter',
  'transformer',
  'liquid_cooling_system',
  'fire_suppression_system',
  'switchboard_enclosure',
  'steel_door',
  'pressure_vessel',
  // Bug P0-6 fix (2026-05-11): heat-pump refrigerant subsystem characters.
  // These are quoted vendor units (Copeland scroll compressors, SWEP BPHEs,
  // Carel EEV, EBM-Papst EC fans) — classified as OEM so the engine looks
  // them up via the vendor catalog, then falls through to the new Grade-D
  // entries below.
  'compressor_unit',
  'evaporator',
  'condenser',
  'txv_or_eev',
  'refrigerant_drier_filter',
  'ec_fan_motor',
  'fan_impeller',
  // Phase B Iter 2: large units sourced as vendor sub-assemblies.
  'gpu_accelerator_module',     // NVIDIA / AMD board-level OEM
  'brushless_dc_motor',         // T-Motor / KDE / U-MOTOR class
])

/** Characters that map to structural fabricated */
const STRUCTURAL_FABRICATED_CHARACTERS = new Set<string>([
  'steel_rack_frame',
  // Structural raw-material profiles and sheet — fabricated or cut-to-length supply
  'aluminium_extrusion',
  'steel_plate',
  'polymer_enclosure',   // custom moulded / formed housing
])

/** Characters that map to software IP */
const SOFTWARE_IP_CHARACTERS = new Set<string>([
  'digital_logic_function',
])

/**
 * Classify a leaf's character_id to a PartClass.
 * Falls back to electronic_cots for unknown characters (generous default
 * so distributor lookup at least tries).
 */
function classifyLeafPartClass(archetypeId: string): PartClass {
  if (ELECTRONIC_COTS_CHARACTERS.has(archetypeId)) return 'electronic_cots'
  if (MECHANICAL_COTS_CHARACTERS.has(archetypeId)) return 'mechanical_cots'
  if (OEM_SUBSYSTEM_CHARACTERS.has(archetypeId)) return 'oem_subsystem'
  if (STRUCTURAL_FABRICATED_CHARACTERS.has(archetypeId)) return 'structural_fabricated'
  if (SOFTWARE_IP_CHARACTERS.has(archetypeId)) return 'software_ip'

  // Name-pattern fallback for archetypes not in the explicit sets
  const id = archetypeId.toLowerCase()
  if (id.includes('sensor') || id.includes('relay') || id.includes('switch') ||
      id.includes('controller') || id.includes('contactor') || id.includes('breaker') ||
      id.includes('pcb') || id.includes('ups') || id.includes('resistor')) {
    return 'electronic_cots'
  }
  if (id.includes('busbar') || id.includes('cable_transit') || id.includes('insulation') ||
      id.includes('bolt') || id.includes('panel')) {
    return 'mechanical_cots'
  }
  if (id.includes('inverter') || id.includes('pcs') || id.includes('transformer') ||
      id.includes('cooling') || id.includes('fire_suppression') || id.includes('bms') ||
      id.includes('ems') || id.includes('scada') || id.includes('lfp') ||
      id.includes('cell') || id.includes('door') || id.includes('enclosure')) {
    return 'oem_subsystem'
  }
  if (id.includes('rack_frame') || id.includes('frame') || id.includes('fabricat') ||
      id.includes('weld')) {
    return 'structural_fabricated'
  }
  if (id.includes('software') || id.includes('firmware') || id.includes('ip_core')) {
    return 'software_ip'
  }

  // Default: try electronic_cots — distributor lookup will return null if no hit
  return 'electronic_cots'
}

/**
 * Part-class validation guard.
 *
 * Prevents the LFP/PWC0805 false-positive bug (commit 434d7202): a distributor
 * result is only accepted if the matched MPN's logical class is plausible
 * for the leaf's expected class.
 *
 * Electronic COTS → distributor result always plausible (distributors stock electronics)
 * Mechanical COTS → distributor result plausible (passive / hardware)
 * OEM subsystem   → distributor result REJECTED (OEM units are not distributed via Mouser/Digi-Key)
 * Structural      → distributor result REJECTED
 * Software        → distributor result REJECTED
 */
function isDistributorResultPlausibleForClass(partClass: PartClass): boolean {
  return partClass === 'electronic_cots' || partClass === 'mechanical_cots'
}

/**
 * Per-archetype manufacturer/description guards.
 *
 * Bug P0-3 fix (2026-05-11): the resolution semantic matcher previously
 * accepted any keyword hit. copper_terminal MPN "476-9481" matched a
 * Banner Engineering 476-9481 photoelectric sensor at £148.75 — semantically
 * very wrong for a copper lug.
 *
 * For each archetype we declare:
 *   - allowedManufacturers (substring match, lowercase) — if non-empty,
 *     the distributor result must include one of these in its manufacturer
 *     name OR the description.
 *   - bannedManufacturers — if matched, the distributor result is rejected
 *     even when other guards pass (defence in depth).
 *   - requiredDescriptionKeywords — at least one must appear in description.
 *
 * Each guard is OPTIONAL. An archetype with no entry in this table is not
 * guarded (existing behaviour).
 */
interface ArchetypeGuard {
  allowedManufacturers?: string[]
  bannedManufacturers?: string[]
  requiredDescriptionKeywords?: string[]
}

const ARCHETYPE_RESULT_GUARDS: Record<string, ArchetypeGuard> = {
  copper_terminal: {
    // Lug / ring-terminal manufacturers
    allowedManufacturers: [
      'panduit', 'weidmüller', 'weidmuller', 'phoenix contact', 'te connectivity',
      'molex', 'amphenol', 'klauke', 'thomas & betts', 'abb',
    ],
    bannedManufacturers: ['banner', 'omron', 'sick', 'keyence'],
    requiredDescriptionKeywords: ['lug', 'terminal', 'crimp', 'ring tongue', 'ring terminal'],
  },
  copper_busbar: {
    allowedManufacturers: ['storm', 'methode', 'mersen', 'erico', 'lugsdirect', 'eriks'],
    requiredDescriptionKeywords: ['busbar', 'bus bar', 'bus-bar', 'copper bar'],
  },
  cable_transit_frame: {
    allowedManufacturers: ['roxtec', 'mct', 'beele'],
    requiredDescriptionKeywords: ['transit', 'cable seal', 'multi-cable', 'cable entry'],
  },
  thermal_insulation_panel: {
    allowedManufacturers: ['rockwool', 'kingspan', 'armacell', 'paroc'],
    requiredDescriptionKeywords: ['insulation', 'mineral wool', 'rockwool', 'pir'],
  },
  gas_sensor: {
    bannedManufacturers: ['banner', 'sick', 'keyence'],   // photoelectric vendors
    requiredDescriptionKeywords: ['gas', 'h2', 'hydrogen', 'co2', 'voc', 'mq', 'electrochem'],
  },
}

/**
 * Word-boundary token match. Both haystack and needle assumed lowercased.
 * Without this, 'mq' matched 'compose-mqsl' and 'abb' matched 'abbreviated' —
 * the very 'mq' keyword undermined the BESS gas_sensor pricing fix it was
 * meant to support.
 */
function tokenMatch(haystack: string, needle: string): boolean {
  if (!needle) return false
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack)
}

/**
 * Returns true when the distributor hit is consistent with the archetype's
 * declared guard. Returns true (no-op) when no guard is declared.
 */
function isDistributorResultConsistentWithArchetype(
  archetypeId: string,
  result: AggregateResult,
): { ok: boolean; reason?: string } {
  const guard = ARCHETYPE_RESULT_GUARDS[archetypeId]
  if (!guard) return { ok: true }

  const mfg = (result.best.manufacturer ?? '').toLowerCase()
  const desc = (result.best.description ?? '').toLowerCase()

  if (guard.bannedManufacturers && guard.bannedManufacturers.some(b => tokenMatch(mfg, b))) {
    return { ok: false, reason: `banned manufacturer "${result.best.manufacturer}" for ${archetypeId}` }
  }
  if (guard.allowedManufacturers && guard.allowedManufacturers.length > 0) {
    const okMfg = guard.allowedManufacturers.some(a => tokenMatch(mfg, a) || tokenMatch(desc, a))
    if (!okMfg) {
      return {
        ok: false,
        reason: `manufacturer "${result.best.manufacturer}" not on allowlist for ${archetypeId}`,
      }
    }
  }
  if (guard.requiredDescriptionKeywords && guard.requiredDescriptionKeywords.length > 0) {
    const okDesc = guard.requiredDescriptionKeywords.some(k => tokenMatch(desc, k))
    if (!okDesc) {
      return {
        ok: false,
        reason: `description "${result.best.description}" missing required keywords for ${archetypeId}`,
      }
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// MPN hint table — canonical MPNs keyed by archetype_id (character_id)
// These are the best-known queryable MPNs per character for the BESS class.
// Kept here (not in demo) so the production stage can query without the demo
// JSON dependency.
// ---------------------------------------------------------------------------

/**
 * Class-aware MPN hint overrides.
 *
 * Bug P0-2 fix (2026-05-11): the default pcb_controller MPN list above is
 * BESS-specific (ISL94212 = Renesas LFP battery management IC). Resolving
 * EVERY product's pcb_controller to ISL94212 is wrong for heat pumps
 * (HVAC controller MCU is the right family) and medical CGMs (low-power
 * BLE SoC).
 *
 * For each (productClass, archetype) pair we provide a ranked MPN list.
 * If we have a class-specific entry it is used in preference to the
 * default in MPN_HINTS_BY_CHARACTER. Empty array = "refuse to resolve;
 * tag as needs vendor selection" (handled by the caller).
 *
 * Class-key matching is substring-on-lowercase against productClass.
 */
const CLASS_AWARE_MPN_HINTS: Record<string, Record<string, string[]>> = {
  // BESS → keep ISL94212 default for pcb_controller; BUT gas_sensor must
  // be a calibrated Li-ion off-gas detector (Nexceris Li-ion Tamer-class
  // or NevadaNano MPS), NOT the hobbyist MQ135 air-quality sensor.
  // Bug P0-4 fix (2026-05-11).
  bess: {
    gas_sensor: ['LIT-MS', 'NEVNAN-MPS', 'KSD-G-COMBO', 'TGS6812-D00'],
  },
  // Same override for energy-storage / battery_energy_storage class names.
  energy_storage: {
    gas_sensor: ['LIT-MS', 'NEVNAN-MPS', 'KSD-G-COMBO', 'TGS6812-D00'],
  },
  battery_energy_storage: {
    gas_sensor: ['LIT-MS', 'NEVNAN-MPS', 'KSD-G-COMBO', 'TGS6812-D00'],
  },
  // Heat pump → STM32F407 family (HVAC control MCU; widely used in heat-pump
  // controller boards by EBM-Papst, Honeywell, Carel). gas_sensor here is
  // an R290 leak detector — keep MQ-style as fallback.
  heat_pump: {
    pcb_controller: ['STM32F407VGT6', 'STM32F407VET6'],
    gas_sensor: ['MQ-6', 'MQ-2'],   // propane leak detection
  },
  // CGM / wearable medical → Nordic nRF52832 (low-power BLE SoC, the
  // workhorse for Dexcom-class continuous glucose monitor patches).
  cgm: {
    pcb_controller: ['NRF52832-QFAA-R', 'NRF52832-QFAA-T'],
  },
  // Drone / UAV → STM32H7 (typical Pixhawk-class flight controller MCU)
  drone: {
    pcb_controller: ['STM32H743VIT6', 'STM32H743ZIT6'],
  },
  // Bioreactor → STM32F4 (process controller class, similar to heat pump)
  bioreactor: {
    pcb_controller: ['STM32F407VGT6'],
  },
  // EV charger → BMS+SCC stack class; ISL94212 still wrong but the canonical
  // CCS PLC chip is QCA7005-AL33; default to Texas TMS320F28069 DSP for
  // the high-side controller (most CCS chargers use a C2000 DSP family).
  ev_charger: {
    pcb_controller: ['TMS320F28069PZT', 'TMS320F28069PZ'],
  },
  // Edge AI / server → typically NVIDIA Jetson / Intel; the controller MCU
  // is BMC-class — pick AST2500 BMC family (commonest server BMC).
  edge_ai: {
    pcb_controller: ['STM32F407VGT6'],  // BMC sidekick — generic MCU placeholder
  },
}

/**
 * Resolve the MPN hint list for a (productClass, archetype) pair.
 *
 * Priority:
 *   1. Class-specific override from CLASS_AWARE_MPN_HINTS (substring match
 *      on lowercase productClass).
 *   2. Default from MPN_HINTS_BY_CHARACTER below.
 *   3. Empty list (no hint — distributor lookup is skipped).
 */
export function getMpnHintsForArchetype(
  archetypeId: string,
  productClass: string,
): string[] {
  const cls = (productClass ?? '').toLowerCase()
  for (const [classKey, hintsByArch] of Object.entries(CLASS_AWARE_MPN_HINTS)) {
    if (cls.includes(classKey) || cls.includes(classKey.replace(/_/g, ''))) {
      const classHints = hintsByArch[archetypeId]
      if (classHints) return classHints
    }
  }
  return MPN_HINTS_BY_CHARACTER[archetypeId] ?? []
}

const MPN_HINTS_BY_CHARACTER: Record<string, string[]> = {
  // 1500V DC Contactor — TE Kilovac EV200 is canonical
  'dc_contactor': ['EV200HAANA', 'LEV200A4ANA'],
  // Protection relay — Schneider Micom P127
  'protection_relay': ['P127C6A0350A0'],
  // Gas sensor (Li-ion off-gas / H2) — Hanwei MQ type
  'gas_sensor': ['712-MQ-2', 'MQ135'],
  // Arc flash detection
  'optical_arc_sensor': ['AFDA48D', 'AFDA24D'],
  // Network switch — Moxa industrial
  'network_switch': ['EDS-405A-EIP', 'EDS-405A'],
  // Pre-charge / HV resistor
  'resistor': ['HLP300R100J', 'HLP300R050J'],
  // Copper busbar (industrial supply — try Farnell / Digi-Key)
  'copper_busbar': ['BUSA-08X03-24-T', 'BUSA-10X03-24-T'],
  // Cable transit (Roxtec)
  'cable_transit_frame': ['S/S 32/0 R0', 'EXII32'],
  // Mineral wool insulation — limited distributor coverage; will likely fall to Grade D
  'thermal_insulation_panel': ['ROCKFLEX-80'],
  // Circuit breaker — ABB Tmax XT / Emax 2
  'circuit_breaker': ['XT5N 1000 Ekip Touch LSI 3p F F', 'E2.2N 2000 Ekip Hi-Touch LSI 4p WMP'],
  // BMS controller slave board
  'pcb_controller': ['NXP-BMS-SLAVE-REF', 'ISL94212'],
  // Generic M10 hex bolt DIN 933 A2 stainless — RS Components
  'steel_bolt': ['526-9064', '278-6010'],
  // M10 × 1000 mm A2 stainless threaded rod — RS / Würth
  'steel_threaded_rod': ['527-0104', '278-6090'],
  // 2.5 mm² LSZH single-core copper building wire (Prysmian H07Z1-U) — RS
  'copper_wire': ['224-4488', '879-7004'],
  // 16 mm² copper ring terminal M10 — try Panduit first (RB16-10-X);
  // 476-9481 is RS Components' lug catalogue number BUT collides with a
  // Banner Engineering photoelectric sensor on Mouser/Farnell — bug P0-3.
  // The archetype guard rejects the Banner hit; ordering Panduit first
  // gives us the right resolution on the first call.
  'copper_terminal': ['RB16-10-X', 'LCD16-14R-Q', 'P14-14R-T'],
  // Silicone O-ring cord stock (Ø 3.5 mm) — RS / Eriks
  'polymer_gasket': ['614-3249', '614-3231'],
  // 60 W black anodised aluminium heatsink — Fischer Elektronik / Aavid
  'aluminium_heatsink': ['460-1466', 'FA-T220-38E'],
  // ── Phase B Iter 2 (2026-05-11) MPN hints for known parts ────────────────
  // BMS isolation IC — Analog Devices ADuM family
  'bms_isolation_ic': ['ADUM1411ARWZ', 'ISO7741DWR'],
  // BMS slave cell-monitor IC — Analog Devices LTC6804 / Maxim MAX17841
  'bms_slave_monitor_ic': ['LTC6804-1', 'MAX17841BGTL+T'],
  // CAN transceiver — TI / NXP staples
  'can_transceiver_ic': ['TCAN1042HDR', 'TJA1051T'],
  // Isolated CAN/485 transceiver — TI ISO1042
  'isolation_transceiver_ic': ['ISO1042BDWVR', 'ISO1500DBQ'],
  // ESD diode — Bourns / Littelfuse SP05xx
  'esd_protection_diode': ['SP1004-04UTG', 'SP3010-04UTG'],
  // Smoke detector — Apollo / VESDA aspirating
  'smoke_detector_aspirating': ['VESDA-VLP-002'],
  // Vibration isolator — Vibratec / Kinetics
  'vibration_isolator_mount': ['VIB-25-A', 'NM50R'],
  // Pressure relief valve — Caleffi 3/4" 3 bar
  'pressure_relief_valve': ['CAL-553560', '316030'],
  // Expansion vessel — Reflex / Zilmet 18 L
  'expansion_vessel': ['REFLEX-N-18', 'ZILMET-18L'],
  // Hydronic circulator — Grundfos UPM3 / Wilo Yonos
  'hydronic_circulator_pump': ['UPM3-25-70', 'WILO-YONOS-25-7'],
  // RCD Type B — Doepke DFS4 040-4/0,03-B
  'rcd_type_b_module': ['DFS4-040-4-003-B'],
  // Emergency stop — Schlegel / Schneider XALK
  'emergency_stop_button': ['XALK178', 'XB4BS8442'],
  // CCS connector — Phoenix Contact CCS Type 2
  'ccs_connector_assembly': ['1404577', 'CCSDC-200A-PHOENIX'],
  // BLE SoC — Nordic nRF52
  'ble_soc_module': ['NRF52832-QFAA-R', 'NRF52840-QIAA-R'],
  // Coin cell battery — Renata / Murata
  'coin_cell_battery_cr1632': ['CR1632', 'CR1632MFR'],
  // 3-axis LP accelerometer — STMicro / Bosch
  'accelerometer_3axis_lp': ['LIS2DW12TR', 'BMA400'],
  // IMU 6-DOF — TDK / Bosch
  'imu_6dof_module': ['ICM-42688-P', 'BMI088'],
  // 3-axis magnetometer — STMicro / TDK
  'magnetometer_3axis': ['LIS3MDLTR', 'IIS2MDC'],
  // Barometer — Bosch BMP388
  'barometer_pressure_sensor': ['BMP388', 'BMP585'],
  // GNSS receiver — u-blox SAM-M10Q / NEO-M9
  'gnss_receiver_module': ['SAM-M10Q-00B', 'NEO-M9N-00B'],
  // Telemetry radio — RFD / Holybro
  'telemetry_radio_modem': ['RFD-900X', 'HOLYBRO-SIK-V3'],
  // RC receiver — FrSky R9
  'rc_receiver_module': ['R9MINI', 'X8R'],
  // Brushless DC motor — T-Motor / KDE
  'brushless_dc_motor': ['T-MOTOR-MN605S', 'KDE-700XF-295'],
  // ESC — Holybro Tekko32 / Hobbywing X-Rotor
  'electronic_speed_controller': ['TEKKO32-F4-65A', 'XROTOR-PRO-80A'],
  // Carbon prop — T-Motor / Master Airscrew
  'propeller_carbon_blade': ['T-MOTOR-G29x9.5-CF', 'MA-19x10-CF'],
}

// ---------------------------------------------------------------------------
// Vendor-catalog mapping — maps character_ids for OEM subsystems to
// vendor catalog partType search terms
// ---------------------------------------------------------------------------

const OEM_CATALOG_BY_CHARACTER: Record<string, string> = {
  'lfp_prismatic_cell': 'lfp_prismatic_cell',
  'pcb_controller': 'bms_controller',            // BMS master
  'power_converter': 'pcs_inverter',
  'transformer': 'hv_dc_switchgear',
  'liquid_cooling_system': 'thermal_management_liquid',
  'fire_suppression_system': 'fire_suppression_bess',
  'pressure_vessel': 'fire_suppression_bess',    // fire suppression cylinders
  'ems_controller': 'ems_controller',
  'switchboard_enclosure': 'hv_dc_switchgear',
  'steel_door': 'hv_dc_switchgear',             // nearest catalog class for personnel door
}

// ---------------------------------------------------------------------------
// Grade D fallback table — for leaves where distributor + vendor-catalog
// both fail and the leaf has no LLM price hint.
// Mirrors the GRADE_D_SUBSYSTEM_ESTIMATES_GBP table from Stage 4 (single
// source of truth is Stage 4; this is a reduced BESS-focused copy for Phase 2).
// ---------------------------------------------------------------------------

interface GradeD {
  typical: number
  basis: string
}

const GRADE_D_BY_CHARACTER: Record<string, GradeD> = {
  'lfp_prismatic_cell': { typical: 60, basis: 'CATL/EVE/BYD LFP prismatic 280Ah, 3.2V — OEM spot price 2025' },
  'steel_rack_frame': { typical: 2500, basis: 'Welded steel battery rack frame, powder-coated, 50-cell' },
  'pcb_controller': { typical: 400, basis: '16-cell BMS slave board with thermistor inputs' },
  'dc_contactor': { typical: 350, basis: 'High-voltage DC contactor / isolator for BESS (Gigavac / Sensata class)' },
  'circuit_breaker': { typical: 6500, basis: 'Air circuit breaker 2000A / MCCB 1500V DC (ABB Tmax class)' },
  'resistor': { typical: 45, basis: 'Pre-charge resistor HV (Ohmite HLP class)' },
  'protection_relay': { typical: 3500, basis: 'G99 protection relay (Schneider Micom P127 class)' },
  'transformer': { typical: 22000, basis: '1 MVA step-up transformer 400V→11kV, cast-resin ONAN' },
  'power_converter': { typical: 95000, basis: '1 MW grid-tie PCS, IEC 62920 / G99 certified' },
  'liquid_cooling_system': { typical: 35000, basis: 'Liquid cooling loop with chiller for 1 MW heat load' },
  'fire_suppression_system': { typical: 18000, basis: 'Aerosol or clean-agent panel for ~30 m³ container' },
  'pressure_vessel': { typical: 18000, basis: 'Fire suppression cylinder (Novec/FM-200) — per-cylinder' },
  // Bug P0-4 fix (2026-05-11): MQ-class hobbyist sensors (£5-15) are NOT
  // appropriate for UL 9540A BESS off-gas detection. Calibrated Li-ion
  // off-gas detectors (Nexceris Li-ion Tamer, NevadaNano MPS) cost
  // £600-£900 per zone. Default Grade-D revised upward to reflect the
  // industrial-grade product class.
  'gas_sensor': { typical: 750, basis: 'Calibrated Li-ion off-gas / H2 sensor for UL 9540A BESS (Nexceris Li-ion Tamer / NevadaNano MPS class), per zone. MQ-class hobbyist sensors are NOT suitable.' },
  'optical_arc_sensor': { typical: 650, basis: 'Arc flash detection sensor (Littelfuse LFGR / Arcteq class)' },
  'ems_controller': { typical: 18000, basis: 'Energy management system / SCADA with grid-tie' },
  'network_switch': { typical: 450, basis: 'Industrial managed Ethernet switch (Moxa EDS class)' },
  'copper_busbar': { typical: 280, basis: 'DC copper busbar assembly per rack (fabricated)' },
  'thermal_insulation_panel': { typical: 600, basis: 'Mineral wool insulation panel set for container interior' },
  'steel_door': { typical: 1200, basis: 'Fire-rated steel personnel door with panic hardware' },
  'cable_transit_frame': { typical: 180, basis: 'IP55 cable transit frame (Roxtec class), per frame' },
  'switchboard_enclosure': { typical: 3500, basis: 'AC distribution board IP55 enclosure' },
  // Generic hardware / mechanical COTS — Grade D basis prices per unit
  'steel_bolt': { typical: 2, basis: 'M10 × 40 mm A2 stainless hex bolt, DIN 933 (RS Components / Würth; per-bolt at OEM qty)' },
  'steel_threaded_rod': { typical: 8, basis: 'M10 × 1000 mm A2 stainless threaded rod (RS Components; per-rod)' },
  'copper_wire': { typical: 12, basis: '2.5 mm² LSZH single-core copper building wire, per 10 m (Prysmian H07Z1-U class)' },
  'copper_terminal': { typical: 4, basis: '16 mm² copper ring terminal M10 (Panduit / Weidmüller; per-terminal)' },
  'polymer_gasket': { typical: 18, basis: 'EPDM or silicone flat gasket / O-ring set, per enclosure or circuit (RS / Eriks class)' },
  'aluminium_heatsink': { typical: 45, basis: 'Extruded aluminium heatsink 60 W (Fischer Elektronik LA/Aavid class; per unit)' },
  // Structural fabricated — Grade D per-metre or per-sheet
  'aluminium_extrusion': { typical: 35, basis: '40 × 40 mm T-slot aluminium profile, per metre (Bosch Rexroth / MiniTec class)' },
  'steel_plate': { typical: 180, basis: '3 mm S235 HR steel plate 1000 × 500 mm, laser-cut (UK fabrication, per sheet)' },
  'polymer_enclosure': { typical: 280, basis: 'ABS or GRP moulded enclosure, mid-size (Spelsberg / nVent Hoffman class; per unit)' },
  // Bug P0-6 fix (2026-05-11): refrigerant-circuit characters for heat pump.
  'compressor_unit': { typical: 1100, basis: 'Scroll compressor, R290-rated, 30 kW class (Copeland ZH-class / Embraco). Single largest line in a heat pump BoM.' },
  'refrigerant_lubricant': { typical: 18, basis: 'POE/PAG oil charge (≈1 kg per compressor)' },
  'evaporator': { typical: 320, basis: 'Brazed-plate heat exchanger, low-side, 30 kW class (SWEP / Alfa Laval / Kaori)' },
  'condenser': { typical: 380, basis: 'Brazed-plate heat exchanger, high-side, 30 kW class (SWEP / Alfa Laval / Kaori)' },
  'txv_or_eev': { typical: 145, basis: 'Electronic expansion valve, R290-compatible (Carel E2V / Sanhua)' },
  'refrigerant_drier_filter': { typical: 28, basis: 'Filter-drier, brazed, R290 service' },
  'high_pressure_transducer': { typical: 78, basis: '0–60 bar pressure transducer, refrigerant service (Carel SPKT / Danfoss AKS)' },
  'low_pressure_transducer': { typical: 78, basis: '0–10 bar pressure transducer, refrigerant service (Carel SPKT / Danfoss AKS)' },
  'safety_pressure_switch': { typical: 35, basis: 'High-side safety pressure switch (Honeywell / Danfoss)' },
  'ec_fan_motor': { typical: 240, basis: 'EC fan motor for condenser, axial 800 mm class (EBM-Papst, Ziehl-Abegg)' },
  'fan_impeller': { typical: 65, basis: 'Composite axial fan impeller, 800 mm class' },
  // ── Phase B Iter 2 (2026-05-11) Grade-D entries for new characters ───────
  // BESS — battery rack ancillaries
  'cell_busbar_link': { typical: 12, basis: 'Inter-cell tin-plated copper busbar link, per pair (Mersen / Storm Power)' },
  'cell_compression_pad': { typical: 6, basis: 'EPDM compression pad between prismatic cells (per cell)' },
  'cell_top_cap_assembly': { typical: 18, basis: 'Cell top-cap interconnect with vent and tab' },
  'rack_caster_wheel': { typical: 45, basis: 'Heavy-duty 4" castor with brake (per wheel; 4 per rack)' },
  'rack_earthing_strap': { typical: 22, basis: 'Tinned copper braid earthing strap, M10' },
  'rack_lifting_eye': { typical: 28, basis: 'M16 lifting eye bolt, DIN 580 (per eye; 4 per rack)' },
  // BESS — BMS master
  'bms_isolation_ic': { typical: 4.5, basis: 'Digital isolator IC (ADuM / ISO77xx class) per channel' },
  'current_shunt_resistor': { typical: 8, basis: '50 µΩ Manganin current-shunt resistor for BMS pack' },
  'voltage_divider_resistor': { typical: 0.4, basis: '0.1% precision divider resistor 0805 (per resistor; many per board)' },
  'esd_protection_diode': { typical: 0.6, basis: 'TVS diode array (Bourns SP10xx class) per node' },
  'bms_master_connector': { typical: 6, basis: 'Locked Molex / TE Mini-Fit connector with crimp contacts' },
  // BESS — BMS slave
  'bms_slave_monitor_ic': { typical: 38, basis: 'Cell-monitor IC (LTC6804 / MAX17841 class) per slave board' },
  'cell_balance_resistor': { typical: 0.8, basis: 'Wirewound balance resistor 33 Ω 5 W (per cell)' },
  'cell_thermistor_ntc': { typical: 1.2, basis: 'NTC thermistor 10 kΩ B25/85=3950 (per cell tap)' },
  'cell_tap_connector': { typical: 4, basis: 'Per-rack cell-tap harness connector (Molex / TE)' },
  // BESS — BMS comms
  'can_transceiver_ic': { typical: 2.4, basis: 'CAN transceiver IC (TI TCAN1042 class)' },
  'isolation_transceiver_ic': { typical: 9, basis: 'Galvanically isolated CAN/485 transceiver (TI ISO1042)' },
  'bms_can_harness': { typical: 28, basis: 'Shielded twisted-pair CAN bus harness, per rack' },
  'can_termination_resistor': { typical: 0.9, basis: '120 Ω termination resistor (per bus end)' },
  // BESS — PCS
  'transformer_bushing': { typical: 320, basis: 'HV bushing 17.5 kV outdoor, oil-filled (per bushing)' },
  'tap_changer_assembly': { typical: 1800, basis: 'Off-load tap changer for 1 MVA transformer' },
  'igbt_power_module': { typical: 950, basis: 'Six-pack IGBT module 1700 V 600 A (Infineon / SEMIKRON)' },
  'gate_driver_board': { typical: 220, basis: 'Isolated IGBT gate driver board (Concept SCALE-2 class)' },
  'dc_link_capacitor': { typical: 380, basis: 'DC-link film capacitor 1100 µF 1500 V (KEMET / TDK)' },
  'snubber_capacitor': { typical: 28, basis: 'Snubber polypropylene capacitor 0.1 µF 1500 V' },
  'ac_filter_inductor': { typical: 280, basis: 'Three-phase line filter inductor 100 A (Hammond / SBE)' },
  'ac_filter_capacitor': { typical: 95, basis: 'Three-phase film capacitor for output filter' },
  'ac_emi_filter': { typical: 240, basis: 'Three-phase EMI filter 100 A (Schaffner / Schurter)' },
  // BESS — DC switchgear
  'dc_isolator_switch': { typical: 420, basis: 'DC load break isolator 1500 V 400 A (ABB / Socomec)' },
  'dc_fuse_holder': { typical: 65, basis: 'NH fuse holder for DC service (Mersen / Bussmann)' },
  'dc_fuse_link': { typical: 110, basis: 'NH gPV fuse 1500 V DC, 250 A (Mersen / Bussmann)' },
  'pre_charge_contactor': { typical: 180, basis: 'DC pre-charge contactor 1500 V 50 A (Gigavac / Sensata)' },
  'busbar_support_insulator': { typical: 14, basis: 'Cycloaliphatic epoxy busbar standoff (per insulator)' },
  'busbar_heat_shrink': { typical: 6, basis: '1500 V busbar heat-shrink, per metre' },
  'surge_arrester_dc': { typical: 320, basis: 'DC surge arrester Type 2, 1500 V (Phoenix Contact / Mersen)' },
  'earthing_busbar': { typical: 95, basis: 'Tinned copper earthing busbar 30×5 mm × 1 m' },
  'earth_fault_relay': { typical: 580, basis: 'DC residual current monitor (Bender ISOMETER class)' },
  'earthing_lug': { typical: 4, basis: 'Tinned copper earthing lug, M10 stud (per lug)' },
  // BESS — thermal management
  'cold_plate': { typical: 320, basis: 'Aluminium cold plate, 12-cell, brazed' },
  'coolant_distribution_manifold': { typical: 380, basis: 'PEX manifold with QC fittings, 8-port' },
  'thermal_interface_material': { typical: 18, basis: 'Thermal pad / paste per assembly (Bergquist / Henkel)' },
  'coolant_pump': { typical: 480, basis: 'BLDC coolant pump 30 L/min (Grundfos UPM3 class)' },
  'coolant_reservoir_tank': { typical: 280, basis: 'Stainless coolant reservoir 50 L with sight glass' },
  'coolant_temperature_sensor': { typical: 22, basis: 'PT100 in-line coolant temperature sensor' },
  'coolant_flow_switch': { typical: 95, basis: 'Paddle / vortex flow switch for coolant loop' },
  // BESS — FSS
  'pressure_gauge_fss': { typical: 65, basis: 'FSS bottle pressure gauge with low-pressure switch' },
  'smoke_detector_aspirating': { typical: 420, basis: 'VESDA-class aspirating smoke detector head, per zone' },
  'thermal_linear_detector': { typical: 280, basis: 'Linear heat-detection cable, per 30 m run' },
  'suppression_nozzle': { typical: 95, basis: 'NOVEC 1230 nozzle (per nozzle, 4-6 per container)' },
  'suppression_discharge_pipe': { typical: 28, basis: 'Stainless discharge pipework, per metre' },
  'manual_pull_station': { typical: 110, basis: 'Manual release station, weatherproof' },
  'fss_control_panel': { typical: 2200, basis: 'EN-54 fire-suppression panel (Honeywell / Notifier class)' },
  'fss_alarm_strobe': { typical: 95, basis: 'EN-54 alarm strobe with horn' },
  'fss_warning_horn': { typical: 65, basis: 'IP65 sounder/strobe combination' },
  // BESS — EMS
  'ems_hmi_panel': { typical: 1100, basis: '15" capacitive industrial HMI panel (Beijer / Pro-face)' },
  'ems_gateway_modem': { typical: 480, basis: 'Industrial 4G/5G cellular gateway (Teltonika / Sierra Wireless)' },
  'ems_fibre_patch_panel': { typical: 220, basis: '24-port fibre patch panel + LC patch leads' },
  'ems_psu_24v': { typical: 180, basis: 'DIN-rail 24 V 240 W PSU (Mean Well / Phoenix QUINT)' },
  'ups_module': { typical: 950, basis: 'DIN-rail 24 V 5 A UPS module with battery pack' },
  'mcb_low_voltage': { typical: 28, basis: 'B-curve LV MCB 6 A 1P (per MCB; many per panel)' },
  'revenue_meter': { typical: 850, basis: 'OFGEM-approved bidirectional revenue meter, MID-class B' },
  'metering_ct': { typical: 95, basis: 'MID-class current transformer, 1000:5 A (per CT)' },
  'monitoring_relay': { typical: 220, basis: 'Phase / voltage monitoring relay (Carlo Gavazzi / DOLD)' },
  // BESS — container fit-out
  'door_intrusion_switch': { typical: 65, basis: 'Magnetic / mechanical door switch with monitoring' },
  'access_control_reader': { typical: 280, basis: 'Mifare reader + access controller (HID / Paxton)' },
  'cable_tray': { typical: 28, basis: 'Galvanised cable tray 300 mm, per metre' },
  'cable_gland': { typical: 8, basis: 'Brass M25 IP68 cable gland (per gland)' },
  'hvac_split_unit': { typical: 2200, basis: 'Industrial HVAC 5 kW (containerised, Daikin / Mitsubishi)' },
  'hvac_condensate_pump': { typical: 95, basis: 'Mini split condensate pump (Aspen / Sauermann)' },
  'hvac_thermostat': { typical: 85, basis: 'DIN-rail HVAC thermostat with humidity (Honeywell)' },
  'interior_led_luminaire': { typical: 65, basis: 'IP65 LED batten 1.5 m (per luminaire; ~6 per container)' },
  'emergency_light': { typical: 95, basis: 'Maintained EN-1838 emergency luminaire' },
  'convenience_outlet': { typical: 28, basis: 'Schuko / 13A outlet, IP54 (per outlet)' },
  'distribution_board_aux': { typical: 480, basis: '12-way DIN-rail consumer unit with RCD' },
  'cctv_camera': { typical: 320, basis: 'PoE IP CCTV dome camera, 5 MP, IK10' },
  'earthing_electrode_rod': { typical: 95, basis: 'Copperbond earthing rod 1.2 m + clamp (per rod)' },
  // ── Heat pump (Iter 2 ancillaries) ────────────────────────────────────────
  'hydronic_flow_meter': { typical: 165, basis: 'Vortex / paddle flow meter for hydronic loop (Burkert / Kobold)' },
  'hydronic_isolation_valve': { typical: 38, basis: 'Brass full-bore isolation valve, 1" BSP (per valve, ≥4 per HP)' },
  'hydronic_circulator_pump': { typical: 380, basis: 'High-efficiency BLDC circulator (Grundfos UPM3 / Wilo Yonos)' },
  'pump_motor_capacitor': { typical: 18, basis: 'Pump start/run capacitor' },
  'expansion_vessel': { typical: 110, basis: '18 L diaphragm expansion vessel (Reflex N / Zilmet)' },
  'pressure_relief_valve': { typical: 38, basis: '3 bar PRV with discharge tundish (Caleffi)' },
  'air_separator_vent': { typical: 65, basis: 'Inline microbubble air separator + auto vent (Caleffi DiscalAir)' },
  'hydronic_manifold': { typical: 220, basis: '6-port stainless manifold with isolation' },
  'thermal_balance_valve': { typical: 95, basis: 'Thermostatic balancing valve (Caleffi 116/Honeywell)' },
  'hydronic_pressure_gauge': { typical: 28, basis: '0-6 bar hydronic system pressure gauge' },
  'hp_relay_board': { typical: 110, basis: 'Heat-pump relay-output board (8 channels, Schneider / Carel)' },
  'hp_hmi_display': { typical: 280, basis: '4.3" colour HMI for heat pump (Carel pGD touch)' },
  'hp_user_interface_pcb': { typical: 75, basis: 'User-interface PCB with rotary encoder and buttons' },
  'water_temperature_sensor_ntc': { typical: 18, basis: 'NTC water temperature sensor 10 kΩ with brass pocket' },
  'outdoor_temp_sensor': { typical: 22, basis: 'IP65 outdoor air temperature sensor' },
  'defrost_sensor': { typical: 28, basis: 'Capillary defrost sensor on evaporator coil' },
  'safety_relay_compressor': { typical: 145, basis: 'Compressor safety relay with phase loss + thermal protection' },
  'flow_switch_safety': { typical: 95, basis: 'Paddle flow switch for hydronic safety interlock' },
  'high_limit_thermostat': { typical: 65, basis: 'High-limit thermostat with manual reset' },
  'vibration_isolator_mount': { typical: 28, basis: 'Anti-vibration rubber mount (per mount; 4 per heat pump)' },
  'wall_bracket_assembly': { typical: 95, basis: 'Galvanised wall bracket for outdoor unit' },
  'condensate_drip_tray': { typical: 65, basis: 'Stainless / galvanised condensate drip tray' },
  'condensate_drain_hose': { typical: 18, basis: '2 m condensate drain hose with anti-syphon trap' },
  'condensate_heater_strip': { typical: 55, basis: 'Self-regulating heater cable for drain tray (frost protection)' },
  // ── Vfarm (Iter 2) ────────────────────────────────────────────────────────
  'growing_tray_polymer': { typical: 38, basis: 'Food-grade HDPE growing tray, per tray' },
  'grow_media_rockwool': { typical: 12, basis: 'Rockwool slab / cube, per growing-cell allotment' },
  'led_grow_module': { typical: 120, basis: '120 W full-spectrum LED grow bar (Fluence VYPR-class, per bar)' },
  'led_constant_current_driver': { typical: 65, basis: 'Mean Well HLG-class constant-current LED driver' },
  'lighting_dali_controller': { typical: 280, basis: 'DALI-2 lighting controller, 64 ECG' },
  'nutrient_dosing_pump': { typical: 220, basis: 'Peristaltic dosing pump for A/B nutrients (Stenner / Grundfos)' },
  'nutrient_reservoir_tank': { typical: 180, basis: 'Polyethylene 200 L reservoir with vented lid' },
  'ec_conductivity_sensor': { typical: 280, basis: 'Inline conductivity sensor 0-10 mS/cm (Atlas / Hanna)' },
  'ph_sensor_inline': { typical: 220, basis: 'Inline pH probe with pre-amp (Atlas / Hach)' },
  'duct_fan_ec': { typical: 380, basis: 'EC duct fan 250 mm 800 m³/h (Vortice / Helios)' },
  'co2_solenoid_valve': { typical: 95, basis: 'CO2 solenoid valve with regulator and gauge' },
  'hepa_filter_element': { typical: 220, basis: 'HEPA H14 filter element 600×600 mm' },
  'pre_filter_g4': { typical: 45, basis: 'G4 pre-filter pad 600×600 mm (per pad)' },
  // ── Drone (Iter 2) ────────────────────────────────────────────────────────
  'carbon_fibre_arm': { typical: 38, basis: 'Carbon-fibre quadcopter arm (per arm; 4 per quad)' },
  'landing_skid_polymer': { typical: 22, basis: 'Glass-reinforced nylon landing skid (per skid; 2 per drone)' },
  'landing_gear_strut': { typical: 18, basis: 'Aluminium landing-gear strut (per strut)' },
  'battery_tray_polymer': { typical: 28, basis: 'ABS battery tray with hold-downs' },
  'battery_strap_velcro': { typical: 6, basis: 'Hook-and-loop battery strap, 25×300 mm' },
  'payload_release_servo': { typical: 28, basis: 'Coreless analogue servo for payload release (Hitec HS-65)' },
  'brushless_dc_motor': { typical: 85, basis: 'BLDC outrunner 380 KV (T-Motor MN605S / KDE class) per motor' },
  'electronic_speed_controller': { typical: 95, basis: 'BLHeli32 / AM32 ESC, 65 A (Holybro Tekko32)' },
  'propeller_carbon_blade': { typical: 28, basis: 'Carbon-fibre propeller, 30×9.5 (per propeller)' },
  'propeller_retention_nut': { typical: 4, basis: 'Aluminium prop nut, M5 self-locking (per nut)' },
  'propeller_hub': { typical: 14, basis: 'Aluminium prop hub adapter' },
  'motor_mount_aluminium': { typical: 22, basis: 'CNC aluminium motor mount (per mount)' },
  'motor_bearing_set': { typical: 18, basis: 'Pair of 6800 ZZ bearings per motor' },
  'propulsion_current_sensor': { typical: 28, basis: 'Hall-effect current sensor 100 A (Mauch / Allegro)' },
  'imu_6dof_module': { typical: 18, basis: '6-DoF IMU breakout (TDK ICM-42688 / Bosch BMI088)' },
  'magnetometer_3axis': { typical: 12, basis: '3-axis magnetometer breakout (STM LIS3MDL)' },
  'barometer_pressure_sensor': { typical: 14, basis: 'High-accuracy barometer (Bosch BMP388)' },
  'gnss_receiver_module': { typical: 95, basis: 'L1/L5 GNSS receiver module (u-blox SAM-M10Q / NEO-M9N)' },
  'telemetry_radio_modem': { typical: 220, basis: '900 MHz long-range telemetry pair (RFD-900X / Holybro)' },
  'rc_receiver_module': { typical: 38, basis: 'FrSky / TBS RC receiver, S.BUS' },
  'antenna_pcb': { typical: 12, basis: 'PCB chip antenna or stamped antenna (per antenna)' },
  'avionics_pdb': { typical: 65, basis: 'Power distribution board with BEC' },
  'avionics_bec_5v': { typical: 28, basis: 'Switching BEC 5 V 10 A' },
  'avionics_current_sensor': { typical: 22, basis: 'Hall current sensor 100 A for avionics rail' },
  // ── Bioreactor (Iter 2) ───────────────────────────────────────────────────
  'cip_sip_port_assembly': { typical: 480, basis: 'CIP/SIP spray-ball port assembly with sanitary fittings' },
  'sample_port_aseptic': { typical: 320, basis: 'Aseptic sample port (Watson-Marlow / Sartorius)' },
  'harvest_valve_sanitary': { typical: 280, basis: 'Sanitary diaphragm valve (GEMU / ITT) with actuator' },
  'tri_clamp_fitting': { typical: 32, basis: 'Sanitary tri-clamp fitting (per fitting; many per vessel)' },
  'sight_glass_assembly': { typical: 220, basis: 'Borosilicate sight glass with light port' },
  'vessel_inspection_light': { typical: 145, basis: 'Sanitary LED inspection light (ATEX-rated for some uses)' },
  'ph_probe_sterilisable': { typical: 480, basis: 'Sterilisable pH probe (Mettler InPro 3253 class)' },
  'do_probe_optical': { typical: 950, basis: 'Optical DO probe (Hamilton OneFerm / Mettler InPro 6970i)' },
  'level_sensor_capacitive': { typical: 280, basis: 'Capacitive vessel level sensor (sanitary, KROHNE)' },
  'mass_flow_controller_gas': { typical: 1100, basis: 'Mass-flow controller for sparge gas (Bronkhorst / MKS)' },
  'peristaltic_dosing_pump': { typical: 380, basis: 'Lab-grade peristaltic pump for media addition (Watson-Marlow 120)' },
  'foam_breaker_actuator': { typical: 220, basis: 'Mechanical foam-breaker drive with motor' },
  'calibration_buffer_kit': { typical: 65, basis: 'pH buffer + DO calibration kit, single-use' },
  'temperature_calibration_probe': { typical: 280, basis: 'NIST-traceable temperature calibration probe' },
  // ── Edge AI (Iter 2) ──────────────────────────────────────────────────────
  'gpu_accelerator_module': { typical: 8500, basis: 'NVIDIA L40S / H100 PCIe GPU accelerator (per card)' },
  'ddr5_dimm_module': { typical: 220, basis: 'Server DDR5-4800 ECC RDIMM 32 GB (per DIMM)' },
  'nvme_ssd_module': { typical: 380, basis: 'Enterprise NVMe SSD U.2 3.84 TB (per SSD)' },
  'sata_storage_drive': { typical: 280, basis: 'Enterprise SATA HDD 16 TB (per drive)' },
  'server_psu_redundant': { typical: 480, basis: '1600 W 80+ Titanium redundant server PSU (per PSU)' },
  'pdu_rack_outlet': { typical: 380, basis: 'Switched managed PDU 32 A 24-outlet (Raritan / APC)' },
  'cooling_fan_axial': { typical: 38, basis: 'Server-grade 80 mm axial fan with PWM' },
  // ── AUV (Iter 2) ──────────────────────────────────────────────────────────
  'hull_internal_frame': { typical: 580, basis: 'Internal aluminium frame for AUV hull, fabricated' },
  'instrument_mount_bracket': { typical: 95, basis: 'Aluminium instrument-mounting bracket (per bracket)' },
  'hydrodynamic_fairing': { typical: 380, basis: 'GRP hydrodynamic fairing, custom-moulded' },
  'antifouling_coating': { typical: 220, basis: 'Antifouling coating per AUV (single application; International Paint)' },
  // ── HAPS (Iter 2) ─────────────────────────────────────────────────────────
  'haps_rib_assembly': { typical: 450, basis: 'CNC-machined CF rib assembly (per rib; many per wing)' },
  'haps_skin_film': { typical: 320, basis: 'Mylar / Tedlar wing-skin film (per panel)' },
  'haps_elevon_assembly': { typical: 950, basis: 'CF elevon control surface, fabricated' },
  'haps_aileron_assembly': { typical: 850, basis: 'CF aileron control surface, fabricated' },
  'mass_balance_weight': { typical: 65, basis: 'Tungsten mass-balance weight (per surface)' },
  'servo_actuator_high_torque': { typical: 220, basis: 'High-torque digital servo for HAPS control surface (Volz / Hitec)' },
  'servo_pushrod_carbon': { typical: 38, basis: 'Carbon-fibre servo pushrod with clevises (per pushrod)' },
  // ── CGM (Iter 2) ──────────────────────────────────────────────────────────
  'glucose_electrode_strip': { typical: 1.8, basis: 'Pt/Au-on-polymer enzymatic glucose electrode (per sensor)' },
  'analogue_front_end_ic': { typical: 6, basis: 'Low-noise transimpedance AFE IC for biosensor' },
  'ble_soc_module': { typical: 4.2, basis: 'BLE SoC (Nordic nRF52832 class) per device' },
  // antenna_pcb already declared above (drone section) — same Grade-D applies.
  'radio_crystal_oscillator': { typical: 0.4, basis: '32 MHz crystal oscillator for BLE SoC' },
  'coin_cell_battery_cr1632': { typical: 0.6, basis: 'CR1632 lithium coin cell (per device)' },
  'biosensor_regulator_ldo': { typical: 0.4, basis: 'Low-Iq LDO regulator (per device)' },
  'accelerometer_3axis_lp': { typical: 1.4, basis: 'Low-power 3-axis accelerometer (STM LIS2DW12)' },
  'adhesive_skin_patch': { typical: 0.45, basis: '3M Tegaderm-class skin adhesive layer (per patch)' },
  'applicator_housing_polymer': { typical: 1.8, basis: 'Single-use applicator housing (medical PC)' },
  'insertion_needle_assembly': { typical: 1.2, basis: 'Stainless insertion needle 26G (per applicator)' },
  'silicone_overmould': { typical: 0.95, basis: 'Medical-grade silicone overmould (per device)' },
  'biocompatible_label_layer': { typical: 0.25, basis: 'Printed biocompatible label / lot code' },
  // ── EV charger (Iter 2) ───────────────────────────────────────────────────
  'pfc_inductor': { typical: 220, basis: 'PFC boost inductor for charger rectifier' },
  'dc_dc_module': { typical: 1800, basis: 'Isolated DC-DC module 50 kW (Infineon HybridPACK / SEMIKRON)' },
  'inrush_current_limiter': { typical: 65, basis: 'NTC inrush limiter + bypass contactor' },
  'input_contactor': { typical: 280, basis: 'AC input contactor 100 A 3-pole (Schneider TeSys)' },
  'dc_link_busbar': { typical: 95, basis: 'Laminated DC-link busbar (custom, per assembly)' },
  'dc_link_voltage_sensor': { typical: 38, basis: 'Isolated voltage sensor for DC-link (LEM)' },
  'hmi_capacitive_touch_panel': { typical: 480, basis: 'Outdoor 7-15" capacitive touch HMI (Beijer / Pro-face)' },
  'rfid_reader_module': { typical: 95, basis: 'OCPP-compatible RFID reader (Mifare DESFire)' },
  'payment_terminal_module': { typical: 480, basis: 'PCI-PTS payment terminal module (Ingenico / Verifone)' },
  'rcd_type_b_module': { typical: 220, basis: 'Type-B RCD 40 A 30 mA (Doepke DFS4)' },
  'emergency_stop_button': { typical: 38, basis: 'Mushroom-head E-stop with safety contacts (Schneider XALK)' },
  'door_interlock_switch': { typical: 65, basis: 'Safety-rated door interlock switch (Pilz / Euchner)' },
  'ccs_charging_cable': { typical: 380, basis: 'CCS Type-2 liquid-cooled cable assembly, 200 A' },
  'ccs_connector_assembly': { typical: 480, basis: 'CCS Type-2 connector head with sensors' },
  'cable_management_arm': { typical: 380, basis: 'Cable retraction / spring-balanced arm assembly' },
  // rack_caster_wheel already declared in the BESS section above.
}

// ---------------------------------------------------------------------------
// Distributor priority selection
// ---------------------------------------------------------------------------

/**
 * Determine distributor priority class from product classification.
 *
 * Industrial-class products (BESS, heat pump, EV charger, bioreactor):
 *   → Digi-Key first (strongest industrial component coverage)
 * Electronic-class products (drone, edge AI, CGM):
 *   → Mouser first (stronger consumer-electronic and RF component coverage)
 * Farnell is always UK-friendly third.
 *
 * NOTE: findSkuForPart() already queries all three in parallel and returns
 * the best-priced result; distributor priority here means which distributor's
 * result we prefer when multiple hits are tied on price. The aggregator
 * always returns the cheapest in-stock option — this priority only matters
 * for the annotation in ResolvedLeafAnnotation.source.
 */
export function getDistributorPriority(productClass: string): 'industrial' | 'electronic' {
  const cls = productClass.toLowerCase()
  if (
    cls.includes('battery') || cls.includes('bess') || cls.includes('energy_storage') ||
    cls.includes('heat_pump') || cls.includes('ev_charger') || cls.includes('charger') ||
    cls.includes('bioreactor') || cls.includes('industrial')
  ) {
    return 'industrial'
  }
  // drone, edge_ai, cgm, consumer → electronic
  return 'electronic'
}

// ---------------------------------------------------------------------------
// Leaf resolution functions
// ---------------------------------------------------------------------------

/**
 * Resolve an electronic_cots or mechanical_cots leaf via distributor API.
 * Returns a verified annotation on hit, falls back to Grade D on miss.
 */
async function resolveDistributorLeaf(
  archetypeId: string,
  partClass: PartClass,
  qty: number,
  estimatedUnitPriceGbp: number | null,
  callsUsed: { count: number },
  maxCalls: number,
  productClass: string = 'unknown',
): Promise<ResolvedLeafAnnotation> {
  if (callsUsed.count >= maxCalls) {
    const gradeD = GRADE_D_BY_CHARACTER[archetypeId]
    return {
      archetype_id: archetypeId,
      part_class: partClass,
      qty,
      mpn: null,
      manufacturer: null,
      unit_price_gbp: gradeD?.typical ?? estimatedUnitPriceGbp,
      lead_weeks: null,
      verification_grade: (gradeD || estimatedUnitPriceGbp !== null) ? 'grade_d' : 'data_gap',
      source: 'budget_exhausted',
      source_url: null,
      distributor: 'estimated',
      grade_d_basis: gradeD?.basis ?? null,
      notes: 'Distributor call budget exhausted — using Grade D estimate',
    }
  }

  // Bug P0-2 fix (2026-05-11): use class-aware MPN hints so pcb_controller
  // (and any other context-sensitive archetype) resolves to a part appropriate
  // for the product class — heat pump → STM32F407, CGM → nRF52832, BESS → ISL94212.
  const hints = getMpnHintsForArchetype(archetypeId, productClass)
  let result: AggregateResult | null = null

  for (const mpn of hints) {
    if (callsUsed.count >= maxCalls) break
    callsUsed.count++
    console.log(`  [Phase2/API #${callsUsed.count}] ${archetypeId} → querying MPN: ${mpn}`)
    try {
      const candidate = await findSkuForPart(mpn)
      if (!candidate) continue
      // Bug P0-3 fix: check the result against per-archetype manufacturer /
      // category guards. If the hit is for a wrong-category part (e.g.
      // copper_terminal MPN matching a Banner photoelectric sensor), reject
      // and try the next hint.
      const guardCheck = isDistributorResultConsistentWithArchetype(archetypeId, candidate)
      if (!guardCheck.ok) {
        console.warn(
          `  [Phase2/guard] rejected ${candidate.best.source} hit for ${archetypeId} ` +
          `(MPN ${mpn} → ${candidate.best.manufacturer} "${candidate.best.description}"): ${guardCheck.reason}`
        )
        continue
      }
      result = candidate
      break
    } catch (err) {
      console.warn(`  [Phase2/warn] MPN lookup failed for ${mpn}: ${(err as Error).message}`)
    }
  }

  if (result && result.qty1GBP !== null) {
    return {
      archetype_id: archetypeId,
      part_class: partClass,
      qty,
      mpn: result.mpn,
      manufacturer: result.best.manufacturer,
      unit_price_gbp: result.qty1GBP,
      // Bug P0-1 fix (2026-05-11): distributors DO return lead-time on the
      // verified result (Mouser LeadTime, Digi-Key ManufacturerLeadWeeks,
      // Farnell leadTime). Propagate the value instead of dropping it.
      lead_weeks: result.best.leadWeeks ?? null,
      verification_grade: 'verified',
      source: result.best.source as ResolvedLeafAnnotation['source'],
      source_url: result.best.productUrl,
      distributor: result.best.source as ResolvedLeafAnnotation['distributor'],
      grade_d_basis: null,
      notes: result.best.description || null,
    }
  }

  // No distributor hit — try Grade D, then LLM estimate, then data_gap
  const gradeD = GRADE_D_BY_CHARACTER[archetypeId]
  if (gradeD) {
    return {
      archetype_id: archetypeId,
      part_class: partClass,
      qty,
      mpn: hints[0] ?? null,
      manufacturer: null,
      unit_price_gbp: gradeD.typical,
      lead_weeks: null,
      verification_grade: 'grade_d',
      source: 'grade_d_table',
      source_url: null,
      distributor: 'estimated',
      grade_d_basis: gradeD.basis,
      notes: hints.length > 0 ? `Attempted MPN: ${hints[0]}; no distributor hit` : 'No MPN hint; Grade D fallback',
    }
  }

  if (estimatedUnitPriceGbp !== null) {
    return {
      archetype_id: archetypeId,
      part_class: partClass,
      qty,
      mpn: hints[0] ?? null,
      manufacturer: null,
      unit_price_gbp: estimatedUnitPriceGbp,
      lead_weeks: null,
      verification_grade: 'estimated',
      source: 'bom_estimate',
      source_url: null,
      distributor: 'estimated',
      grade_d_basis: null,
      notes: 'LLM price estimate (no distributor hit, no Grade D entry)',
    }
  }

  return {
    archetype_id: archetypeId,
    part_class: partClass,
    qty,
    mpn: null,
    manufacturer: null,
    unit_price_gbp: null,
    lead_weeks: null,
    verification_grade: 'data_gap',
    source: 'stub',
    source_url: null,
    distributor: null,
    grade_d_basis: null,
    notes: 'No MPN hint, no distributor hit, no Grade D entry, no LLM estimate',
  }
}

/**
 * Resolve an oem_subsystem leaf via vendor-catalog lookup, then Nightshift
 * specialism lookup, then Grade D fallback.
 *
 * @param productClass  Used to select specialism tags for corpus lookup (Fix 2, task #59)
 */
function resolveOemSubsystemLeaf(
  archetypeId: string,
  qty: number,
  estimatedUnitPriceGbp: number | null,
  productClass: string = 'unknown',
): ResolvedLeafAnnotation {
  const catalogKey = OEM_CATALOG_BY_CHARACTER[archetypeId]
  let catalogEntry: VendorCatalogEntry | undefined

  if (catalogKey) {
    catalogEntry = VENDOR_CATALOG.find(e => e.partType === catalogKey)
  }

  if (!catalogEntry) {
    // Try keyword search using archetype_id as search term
    const searchTerm = archetypeId.replace(/_/g, ' ')
    const results = findEntriesByPartTerm(searchTerm)
    catalogEntry = results[0]
  }

  if (catalogEntry && catalogEntry.vendors.length > 0) {
    const topVendor = catalogEntry.vendors[0]
    return {
      archetype_id: archetypeId,
      part_class: 'oem_subsystem',
      qty,
      mpn: null,
      manufacturer: topVendor.name,
      unit_price_gbp: estimatedUnitPriceGbp, // vendor catalog has no pricing
      lead_weeks: topVendor.typicalLeadWeeks,
      // Bug P1-8 fix (2026-05-11): vendor_catalog gives us a real
      // manufacturer + lead time (stronger evidence than the price-only
      // grade_d table). Tag as grade_c when no LLM price; estimated
      // when an LLM price is provided.
      verification_grade: estimatedUnitPriceGbp !== null ? 'estimated' : 'grade_c',
      source: 'vendor_catalog',
      source_url: null,
      distributor: 'vendor_catalog',
      grade_d_basis: null,
      notes: topVendor.notes ?? null,
    }
  }

  // No catalog match — try Nightshift corpus specialism lookup (Fix 2, task #59)
  const corpusSuppliers = findSuppliersBySpecialism(productClass, 1)
  if (corpusSuppliers && corpusSuppliers.length > 0) {
    const top = corpusSuppliers[0]
    const gradeD = GRADE_D_BY_CHARACTER[archetypeId]
    return {
      archetype_id: archetypeId,
      part_class: 'oem_subsystem',
      qty,
      mpn: null,
      manufacturer: top.name,
      unit_price_gbp: gradeD?.typical ?? estimatedUnitPriceGbp,
      lead_weeks: null,
      verification_grade: (gradeD || estimatedUnitPriceGbp !== null) ? 'grade_d' : 'stub',
      source: 'vendor_catalog',
      source_url: top.website ?? null,
      distributor: 'vendor_catalog',
      grade_d_basis: gradeD?.basis ?? null,
      notes: `Nightshift corpus: ${top.name} (${top.country ?? '?'}); specialism match for ${productClass}`,
    }
  }

  // No corpus match — try Grade D
  const gradeD = GRADE_D_BY_CHARACTER[archetypeId]
  if (gradeD) {
    return {
      archetype_id: archetypeId,
      part_class: 'oem_subsystem',
      qty,
      mpn: null,
      manufacturer: null,
      unit_price_gbp: gradeD.typical,
      lead_weeks: null,
      verification_grade: 'grade_d',
      source: 'grade_d_table',
      source_url: null,
      distributor: 'estimated',
      grade_d_basis: gradeD.basis,
      notes: 'No vendor catalog match; Grade D fallback',
    }
  }

  if (estimatedUnitPriceGbp !== null) {
    return {
      archetype_id: archetypeId,
      part_class: 'oem_subsystem',
      qty,
      mpn: null,
      manufacturer: null,
      unit_price_gbp: estimatedUnitPriceGbp,
      lead_weeks: null,
      verification_grade: 'estimated',
      source: 'bom_estimate',
      source_url: null,
      distributor: 'estimated',
      grade_d_basis: null,
      notes: 'LLM price estimate; no vendor catalog entry found',
    }
  }

  return {
    archetype_id: archetypeId,
    part_class: 'oem_subsystem',
    qty,
    mpn: null,
    manufacturer: null,
    unit_price_gbp: null,
    lead_weeks: null,
    verification_grade: 'data_gap',
    source: 'stub',
    source_url: null,
    distributor: null,
    grade_d_basis: null,
    notes: 'OEM subsystem: no vendor catalog entry, no Nightshift corpus match, no Grade D entry, no LLM estimate',
  }
}

/**
 * Resolve a structural_fabricated leaf.
 * Uses Grade D if available; otherwise stubs out with "needs corpus query".
 * Full Nightshift corpus integration is deferred — see Phase 2 spec.
 *
 * Bug P1-9 fix (2026-05-11): if the archetype has a known MPN hint
 * (MPN_HINTS_BY_CHARACTER), try the distributor BEFORE stamping grade_d.
 * Some "structural" archetypes (copper_wire, polymer_gasket, copper_busbar,
 * cable_transit_frame) actually have RS/Farnell SKUs and the price-only
 * table is a strict downgrade from a real distributor hit.
 */
async function resolveStructuralFabricatedLeaf(
  archetypeId: string,
  qty: number,
  estimatedUnitPriceGbp: number | null,
  productClass: string = 'unknown',
  callsUsed?: { count: number },
  maxCalls?: number,
): Promise<ResolvedLeafAnnotation> {
  // Bug P1-9: opportunistic distributor lookup when MPN hint exists.
  const hints = getMpnHintsForArchetype(archetypeId, productClass)
  if (hints.length > 0 && callsUsed && maxCalls && callsUsed.count < maxCalls) {
    for (const mpn of hints) {
      if (callsUsed.count >= maxCalls) break
      callsUsed.count++
      try {
        const candidate = await findSkuForPart(mpn)
        if (!candidate) continue
        const guardCheck = isDistributorResultConsistentWithArchetype(archetypeId, candidate)
        if (!guardCheck.ok) continue
        if (candidate.qty1GBP === null) continue
        return {
          archetype_id: archetypeId,
          part_class: 'structural_fabricated',
          qty,
          mpn: candidate.mpn,
          manufacturer: candidate.best.manufacturer,
          unit_price_gbp: candidate.qty1GBP,
          lead_weeks: candidate.best.leadWeeks ?? null,
          verification_grade: 'verified',
          source: candidate.best.source as ResolvedLeafAnnotation['source'],
          source_url: candidate.best.productUrl,
          distributor: candidate.best.source as ResolvedLeafAnnotation['distributor'],
          grade_d_basis: null,
          notes: `Structural-fabricated upgraded to verified via ${candidate.best.source} ` +
            `(P1-9 opportunistic lookup): ${candidate.best.description ?? ''}`,
        }
      } catch (err) {
        console.warn(`  [Phase2/warn-P1-9] structural lookup failed for ${mpn}: ${(err as Error).message}`)
      }
    }
  }

  const gradeD = GRADE_D_BY_CHARACTER[archetypeId]
  if (gradeD) {
    return {
      archetype_id: archetypeId,
      part_class: 'structural_fabricated',
      qty,
      mpn: hints[0] ?? null,
      manufacturer: null,
      unit_price_gbp: gradeD.typical,
      lead_weeks: null,
      verification_grade: 'grade_d',
      source: 'grade_d_table',
      source_url: null,
      distributor: 'estimated',
      grade_d_basis: gradeD.basis,
      notes: hints.length > 0
        ? `Structural fabrication: distributor miss on ${hints.join('/')}; Grade D fallback`
        : 'Structural fabrication: Nightshift corpus query not yet wired; Grade D fallback',
    }
  }

  return {
    archetype_id: archetypeId,
    part_class: 'structural_fabricated',
    qty,
    mpn: hints[0] ?? null,
    manufacturer: null,
    unit_price_gbp: estimatedUnitPriceGbp,
    lead_weeks: null,
    verification_grade: 'stub',
    source: 'stub',
    source_url: null,
    distributor: 'stub',
    grade_d_basis: null,
    notes: 'Structural fabrication: needs Nightshift corpus query by specialism (steel_fabrication)',
  }
}

/**
 * Resolve a software_ip leaf — uses LLM price hint directly.
 */
function resolveSoftwareIpLeaf(
  archetypeId: string,
  qty: number,
  estimatedUnitPriceGbp: number | null,
): ResolvedLeafAnnotation {
  return {
    archetype_id: archetypeId,
    part_class: 'software_ip',
    qty,
    mpn: null,
    manufacturer: null,
    unit_price_gbp: estimatedUnitPriceGbp,
    lead_weeks: null,
    verification_grade: estimatedUnitPriceGbp !== null ? 'estimated' : 'data_gap',
    source: 'llm_estimate',
    source_url: null,
    distributor: 'estimated',
    grade_d_basis: null,
    notes: 'Software / IP: LLM-provided price estimate',
  }
}

// ---------------------------------------------------------------------------
// Tree walking utilities
// ---------------------------------------------------------------------------

/**
 * Determine if a CompositionNode is a tree leaf (no non-empty children).
 */
function isLeaf(node: CompositionNode): boolean {
  return !node.children || node.children.length === 0
}

/**
 * Collect all leaf nodes from a tree, preserving their archetypeId and qty.
 * Returns a flat list with the leaf's position context.
 */
interface LeafWithContext {
  node: CompositionNode
  archetypeId: string
  qty: number
  /** The LLM-provided estimated price from the LeafRecord if it was propagated */
  estimatedUnitPriceGbp: number | null
}

function collectLeaves(root: CompositionNode): LeafWithContext[] {
  const leaves: LeafWithContext[] = []

  function walk(node: CompositionNode): void {
    if (isLeaf(node)) {
      // estimatedUnitPriceGbp: check if the node carries it via any extension field
      // The LeafRecord.estimated_unit_price_gbp gets propagated onto the CompositionNode
      // by buildTreeFromLeaves — it's stored as an extension property.
      const estimatedPrice = (node as any).estimated_unit_price_gbp ?? null
      leaves.push({
        node,
        archetypeId: node.archetypeId,
        qty: node.quantity,
        estimatedUnitPriceGbp: typeof estimatedPrice === 'number' ? estimatedPrice : null,
      })
    } else {
      for (const child of node.children) {
        walk(child)
      }
    }
  }

  walk(root)
  return leaves
}

// ---------------------------------------------------------------------------
// Main resolution function
// ---------------------------------------------------------------------------

const MAX_DISTRIBUTOR_CALLS = 28

/**
 * Resolve all leaves in a RadicalTree, returning a ResolvedRadicalTree.
 *
 * @param tree          The Phase 1.5 RadicalTree from state.radicalTree
 * @param productClass  Product classification string (e.g. "battery_energy_storage")
 * @returns             Annotated tree with resolution data on each leaf
 */
export async function runRadicalResolution(
  tree: RadicalTree,
  productClass: string = 'unknown',
): Promise<ResolvedRadicalTree> {
  console.log('[Phase2/resolution] Starting Radical Phase 2 resolution...')

  const callsUsed = { count: 0 }
  const distributorPriority = getDistributorPriority(productClass)

  // ── Step 1: collect leaves and sort by priority ────────────────────────────
  // Priority: leaves with MPN hints come first (guaranteed distributor call);
  // then by partClass (electronic > mechanical > oem > structural > software),
  // so we spend the call budget on the most-resolvable leaves first.

  const leaves = collectLeaves(tree.composition.root)

  const PART_CLASS_PRIORITY: Record<PartClass, number> = {
    'electronic_cots': 0,
    'mechanical_cots': 1,
    'oem_subsystem': 2,
    'structural_fabricated': 3,
    'software_ip': 4,
  }

  const prioritised = [...leaves].sort((a, b) => {
    const aHasMpn = MPN_HINTS_BY_CHARACTER[a.archetypeId] !== undefined ? 0 : 1
    const bHasMpn = MPN_HINTS_BY_CHARACTER[b.archetypeId] !== undefined ? 0 : 1
    if (aHasMpn !== bHasMpn) return aHasMpn - bHasMpn
    const aClass = classifyLeafPartClass(a.archetypeId)
    const bClass = classifyLeafPartClass(b.archetypeId)
    return PART_CLASS_PRIORITY[aClass] - PART_CLASS_PRIORITY[bClass]
  })

  console.log(`[Phase2/resolution] ${leaves.length} leaves collected, priority: ${distributorPriority}`)

  // ── Step 2: resolve each leaf ──────────────────────────────────────────────

  const annotationMap = new Map<string, ResolvedLeafAnnotation>()

  for (const { archetypeId, qty, estimatedUnitPriceGbp } of prioritised) {
    const partClass = classifyLeafPartClass(archetypeId)

    // Part-class validation guard — prevents false-positive distributor lookups
    // for OEM/structural/software classes (LFP/PWC0805 bug pattern from 434d7202)
    let annotation: ResolvedLeafAnnotation

    if (partClass === 'software_ip') {
      annotation = resolveSoftwareIpLeaf(archetypeId, qty, estimatedUnitPriceGbp)
    } else if (partClass === 'structural_fabricated') {
      // Bug P1-9 fix (2026-05-11): pass distributor budget so structural
      // leaves with a known MPN hint try a verified lookup before falling
      // through to grade_d_table.
      annotation = await resolveStructuralFabricatedLeaf(
        archetypeId,
        qty,
        estimatedUnitPriceGbp,
        productClass,
        callsUsed,
        MAX_DISTRIBUTOR_CALLS,
      )
    } else if (partClass === 'oem_subsystem') {
      annotation = resolveOemSubsystemLeaf(archetypeId, qty, estimatedUnitPriceGbp, productClass)
    } else if (isDistributorResultPlausibleForClass(partClass)) {
      // electronic_cots or mechanical_cots — try distributor
      annotation = await resolveDistributorLeaf(
        archetypeId,
        partClass,
        qty,
        estimatedUnitPriceGbp,
        callsUsed,
        MAX_DISTRIBUTOR_CALLS,
        productClass,
      )
    } else {
      // Fallback for unknown partClass — should not happen given exhaustive coverage above
      annotation = resolveOemSubsystemLeaf(archetypeId, qty, estimatedUnitPriceGbp, productClass)
    }

    // Use archetypeId as the map key — multiple leaves can share the same archetypeId
    // (e.g. dc_contactor appears multiple times). Store the first resolution and reuse
    // for duplicates to avoid extra API calls.
    if (!annotationMap.has(archetypeId)) {
      annotationMap.set(archetypeId, annotation)
    } else {
      // Duplicate archetypeId — update the qty but reuse the resolution
      const existing = annotationMap.get(archetypeId)!
      // We don't merge here — each leaf in the tree has its own node with its own qty.
      // The annotation is stored per-archetypeId; the caller walks nodes and attaches.
    }
  }

  console.log(`[Phase2/resolution] ${callsUsed.count} distributor API calls made`)

  // ── Step 3: annotate the tree ──────────────────────────────────────────────

  function annotateNode(node: CompositionNode): ResolvedCompositionNode {
    if (isLeaf(node)) {
      const annotation = annotationMap.get(node.archetypeId)
      // Create a fresh annotation with the correct qty for this specific node
      let nodeAnnotation: ResolvedLeafAnnotation | undefined
      if (annotation) {
        nodeAnnotation = { ...annotation, qty: node.quantity }
      }
      return {
        ...node,
        children: [],
        resolution: nodeAnnotation,
      }
    }
    return {
      ...node,
      children: node.children.map(annotateNode),
    }
  }

  const annotatedRoot = annotateNode(tree.composition.root)

  // ── Step 4: compute stats ──────────────────────────────────────────────────

  const allAnnotations = Array.from(annotationMap.values())
  const stats: ResolutionStats = {
    total_leaves: leaves.length,
    verified_by_distributor: allAnnotations.filter(a => a.verification_grade === 'verified').length,
    from_vendor_catalog: allAnnotations.filter(a => a.distributor === 'vendor_catalog').length,
    from_llm_estimate: allAnnotations.filter(a => a.source === 'llm_estimate').length,
    grade_d: allAnnotations.filter(a => a.verification_grade === 'grade_d').length,
    stub: allAnnotations.filter(a => a.verification_grade === 'stub').length,
    data_gap: allAnnotations.filter(a => a.verification_grade === 'data_gap').length,
    distributor_calls_made: callsUsed.count,
  }

  console.log(
    `[Phase2/resolution] Done. Verified: ${stats.verified_by_distributor}, ` +
    `Catalog: ${stats.from_vendor_catalog}, LLM: ${stats.from_llm_estimate}, ` +
    `Grade-D: ${stats.grade_d}, Stub: ${stats.stub}, Data-gap: ${stats.data_gap}`
  )

  return {
    radical_spec_version: tree.radical_spec_version,
    composition: {
      ...tree.composition,
      root: annotatedRoot,
    },
    meta: tree.meta,
    resolution_meta: {
      product_class: productClass,
      distributor_priority: distributorPriority,
      distributor_calls_made: callsUsed.count,
      resolved_at: new Date().toISOString(),
      stats,
    },
  }
}
