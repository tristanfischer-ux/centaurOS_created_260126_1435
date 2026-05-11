/**
 * @file character-hierarchy.ts — Deterministic parent-mapping for the Radical library
 *
 * Extracted from the Week 2–5 decomposition JSONs.
 * Every character maps to a canonical "word" (subsystem group), and every
 * word maps to a canonical "sentence" (top-level module).
 *
 * This file is the ONLY source of truth for tree-building hierarchy.
 * It is intentionally side-effect-free — pure constant exports only.
 *
 * Hierarchy (bottom-up):
 *   character  →  word (subsystem group)  →  sentence (top-level module)
 *
 * For Phase 1: BESS is fully populated.
 * Heat-pump, vfarm, drone, EV-charger, bioreactor, edge-AI, AUV, CGM, HAPS
 * characters are included where their module assignments are clear from the
 * week-3/4/5 decomposition JSONs.
 *
 * EXTENSION RULE:
 *   When a new character is commissioned (Week N), add it here under the
 *   appropriate word and sentence. Do NOT hard-code hierarchy inside the
 *   structural-builder — this file is the single source.
 */

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/**
 * Canonical product-class keys used for cross-domain leakage prevention.
 *
 * These are the SHORT keys used in `HierarchySentence.allowed_classes` and
 * matched by `normaliseProductClass()`. They are NOT the same as the free-form
 * classification strings the LLM emits (e.g. "battery_energy_storage",
 * "30 kW monobloc air-to-water heat pump"). The normaliser collapses all of
 * those down to the keys below.
 *
 * If you add a new product class, you MUST:
 *   1. Add the key here.
 *   2. Add a `cls.includes(...)` branch in `normaliseProductClass()`.
 *   3. Tag every relevant sentence with the new key in `allowed_classes`.
 */
export type ProductClass =
  | 'bess'
  | 'heat_pump'
  | 'vfarm'
  | 'drone'
  | 'ev_charger'
  | 'bioreactor'
  | 'edge_ai'
  | 'auv'
  | 'cgm'
  | 'haps'

/** A "word" is a subsystem group (e.g. "battery_string" within "battery_rack_assembly"). */
export interface HierarchyWord {
  /** snake_case subsystem group ID */
  id: string
  /** Human-readable label */
  label: string
  /** The sentence-level module this word belongs to */
  sentence_id: string
  /** Characters (function-class IDs) that belong to this word */
  characters: string[]
}

/** A "sentence" is a top-level module (e.g. "battery_rack_assembly"). */
export interface HierarchySentence {
  /** snake_case module ID — matches the `module` field in decomposition JSONs */
  id: string
  /** Human-readable label */
  label: string
  /** All word IDs that belong to this sentence */
  words: string[]
  /**
   * Whitelist of product classes that may legitimately use this sentence as a
   * destination. The structural builder filters out wrong-class matches at the
   * character → word resolution step, preventing wrong-domain leakage
   * (e.g. `refrigerant_circuit` showing up on an AUV/drone/HAPS BOM because
   * `copper_wire` happens to live in `refrigerant_distribution` first).
   *
   * MUST be set on every sentence. Use ALL_PRODUCT_CLASSES for genuinely
   * cross-domain sentences. An empty array means "no class can use this"
   * (treated as a configuration error by the filter).
   *
   * Phase B Iter 1 (Bug P0-7 / 2026-05-11): added to plug the universality
   * leakage detected by the engine-accuracy-scorecard.
   */
  allowed_classes: ProductClass[]
}

/** Convenience constant for sentences that genuinely apply to every class. */
export const ALL_PRODUCT_CLASSES: ProductClass[] = [
  'bess',
  'heat_pump',
  'vfarm',
  'drone',
  'ev_charger',
  'bioreactor',
  'edge_ai',
  'auv',
  'cgm',
  'haps',
]

/**
 * Normalise the free-form classification string emitted by the LLM (e.g.
 * "battery_energy_storage", "30 kW air-to-water heat pump", "haps_001",
 * "Modular Indoor Vertical Farm Unit") to one of the canonical
 * `ProductClass` keys. Returns null when no rule matches — callers should
 * skip the allowed_classes filter rather than block the build.
 *
 * The matching rules MIRROR `deriveClassMandatoryCharacters()` in
 * `structural-builder.ts`. Keep them in sync.
 */
export function normaliseProductClass(classification: string): ProductClass | null {
  const cls = classification.toLowerCase()

  if (cls === 'battery_energy_storage' || cls === 'bess' || cls.includes('energy_storage')) return 'bess'
  if (cls.includes('drone') || cls.includes('uav') || cls.includes('quadcopter') || cls.includes('multirotor')) return 'drone'
  if (cls.includes('cgm') || cls.includes('glucose') || cls.includes('wearable') || cls.includes('biosensor')) return 'cgm'
  if (cls.includes('heat_pump') || cls.includes('thermal_system') || cls.includes('heat pump')) return 'heat_pump'
  if (cls.includes('vertical_farm') || cls.includes('farm') || cls.includes('cea') || cls.includes('greenhouse')) return 'vfarm'
  if (cls.includes('ev_charger') || cls.includes('charger') || cls.includes('ev charger')) return 'ev_charger'
  if (cls.includes('bioreactor') || cls.includes('ferment')) return 'bioreactor'
  if (cls.includes('edge_ai') || cls.includes('edge ai') || cls.includes('server') || cls.includes('compute')) return 'edge_ai'
  if (cls.includes('auv') || cls.includes('underwater') || cls.includes('subsea') || cls.includes('rov')) return 'auv'
  if (cls.includes('haps') || cls.includes('stratospheric') || cls.includes('pseudo-satellite')) return 'haps'

  return null
}

// ---------------------------------------------------------------------------
// Sentences (top-level modules)
// Ordered roughly as they appear in a BESS BOM — deterministic sort is done
// by the builder, not here.
// ---------------------------------------------------------------------------

export const SENTENCES: HierarchySentence[] = [
  // ── BESS ─────────────────────────────────────────────────────────────────
  {
    id: 'battery_rack_assembly',
    label: 'Battery Rack Assembly',
    words: ['cell_string', 'rack_structure'],
    allowed_classes: ['bess'],
  },
  {
    id: 'battery_management_system_bms',
    label: 'Battery Management System (BMS)',
    words: ['bms_master', 'bms_slave'],
    allowed_classes: ['bess'],
  },
  {
    id: 'power_conversion_system_pcs',
    label: 'Power Conversion System (PCS)',
    words: ['pcs_inverter_group', 'grid_transformer_group'],
    allowed_classes: ['bess'],
  },
  {
    id: 'dc_distribution_switchgear',
    label: 'DC Distribution and Switchgear',
    words: ['dc_switching', 'dc_protection', 'dc_buswork'],
    // BESS only — EV chargers have their own AC/DC distribution under charger_pcs.
    allowed_classes: ['bess'],
  },
  {
    id: 'thermal_management_system',
    label: 'Thermal Management System',
    words: ['active_cooling', 'passive_insulation'],
    // Active liquid cooling + insulation: BESS, edge AI server racks, EV chargers
    // (DC fast chargers liquid-cooled), HAPS payload thermal. NOT heat pump (it
    // has its own refrigerant_circuit / hydronic_circuit).
    allowed_classes: ['bess', 'edge_ai', 'ev_charger', 'haps'],
  },
  {
    id: 'fire_detection_and_suppression_system_fss',
    label: 'Fire Detection and Suppression System (FSS)',
    words: ['suppression_hardware', 'detection_sensors'],
    // BESS-style fire suppression (NOVEC, gas detect, arc detect, suppression
    // pressure vessel). Also legitimate on EV chargers (containerised DC fast
    // chargers carry similar suppression). NOT bioreactors / vfarm / drones —
    // those have CO2 sensors / smoke sensors but NOT BESS-grade FSS.
    allowed_classes: ['bess', 'ev_charger'],
  },
  {
    id: 'energy_management_system_ems_scada',
    label: 'Energy Management System / SCADA',
    words: ['ems_compute', 'ems_network'],
    allowed_classes: ['bess'],
  },
  {
    id: 'container_enclosure_fit_out',
    label: 'Container Enclosure and Fit-Out',
    words: ['container_access', 'container_services'],
    // Containerised systems: BESS containers, containerised EV chargers,
    // bioreactor skids (single-use bioreactor cleanrooms), vertical farm
    // shipping-container farms. NOT vehicle/airframe classes.
    allowed_classes: ['bess', 'ev_charger', 'bioreactor', 'vfarm'],
  },
  // ── Heat pump ─────────────────────────────────────────────────────────────
  {
    id: 'refrigerant_circuit',
    label: 'Refrigerant Circuit',
    words: ['refrigerant_cycle', 'compressor_word', 'heat_exchanger_word', 'expansion_valve_word', 'pressure_monitoring_word', 'fan_word', 'refrigerant_distribution'],
    allowed_classes: ['heat_pump'],
  },
  {
    id: 'hydronic_circuit',
    label: 'Hydronic Circuit',
    words: ['hydronic_flow', 'hydronic_connections'],
    allowed_classes: ['heat_pump'],
  },
  {
    id: 'heat_pump_controls',
    label: 'Heat Pump Controls',
    words: ['hp_controls_compute'],
    allowed_classes: ['heat_pump'],
  },
  {
    id: 'heat_pump_enclosure',
    label: 'Heat Pump Enclosure and Frame',
    words: ['hp_enclosure_structure'],
    allowed_classes: ['heat_pump'],
  },
  // ── Vertical farm ─────────────────────────────────────────────────────────
  {
    id: 'growing_rack_system',
    label: 'Growing Rack System',
    words: ['rack_structure_vfarm'],
    allowed_classes: ['vfarm'],
  },
  {
    id: 'lighting_system',
    label: 'Lighting System',
    words: ['lighting_fixtures'],
    allowed_classes: ['vfarm'],
  },
  {
    id: 'fertigation_loop',
    label: 'Fertigation Loop',
    words: ['fertigation_flow'],
    allowed_classes: ['vfarm'],
  },
  {
    id: 'hvac_co2_system',
    label: 'HVAC / CO2 Dosing System',
    words: ['hvac_flow', 'co2_dosing'],
    allowed_classes: ['vfarm'],
  },
  // ── Drone / UAV ───────────────────────────────────────────────────────────
  {
    id: 'airframe_structure',
    label: 'Airframe Structure',
    words: ['airframe_body'],
    allowed_classes: ['drone'],
  },
  {
    id: 'propulsion_system',
    label: 'Propulsion System',
    // Electric propulsion (motors + wiring) is shared between drones, AUVs
    // (thrusters), and HAPS (electric prop motors).
    words: ['propulsion_motors'],
    allowed_classes: ['drone', 'auv', 'haps'],
  },
  {
    id: 'flight_computer',
    label: 'Flight Computer and Avionics',
    // Avionics / nav-compute is shared by drones, AUVs (mission computer), HAPS.
    words: ['avionics_compute'],
    allowed_classes: ['drone', 'auv', 'haps'],
  },
  // ── EV Charger ───────────────────────────────────────────────────────────
  {
    id: 'charger_power_conversion',
    label: 'Charger Power Conversion',
    words: ['charger_pcs'],
    allowed_classes: ['ev_charger'],
  },
  {
    id: 'charger_enclosure',
    label: 'Charger Enclosure',
    words: ['charger_enclosure_structure'],
    allowed_classes: ['ev_charger'],
  },
  // ── Bioreactor ────────────────────────────────────────────────────────────
  {
    id: 'bioreactor_vessel',
    label: 'Bioreactor Vessel',
    words: ['bioreactor_vessel_body'],
    allowed_classes: ['bioreactor'],
  },
  {
    id: 'bioreactor_controls',
    label: 'Bioreactor Controls and Sensing',
    words: ['bioreactor_sensing'],
    allowed_classes: ['bioreactor'],
  },
  // ── Edge AI / AUV / CGM / HAPS ────────────────────────────────────────────
  {
    id: 'edge_compute_system',
    label: 'Edge Compute System',
    words: ['edge_compute_hardware'],
    // The on-board compute substrate is shared by edge AI servers, AUVs and
    // HAPS payloads. CGM has its own biosensor_system.
    allowed_classes: ['edge_ai', 'auv', 'haps'],
  },
  {
    id: 'hull_and_buoyancy',
    label: 'Hull and Buoyancy System',
    words: ['hull_structure'],
    allowed_classes: ['auv'],
  },
  // Phase B Iter 1 (2026-05-11): domain-specific AUV sentence to deepen the
  // tree beyond hull_structure. A real AUV's pressure-vessel section is its
  // single most expensive subsystem (pressure-rated end caps, dive-rated
  // O-ring seals, ballast/buoyancy). hull_and_buoyancy currently flattens
  // the whole vehicle into one structural word; this sentence splits out
  // the pressure-vessel-specific characters that gate dive depth.
  {
    id: 'subsea_pressure_vessel',
    label: 'Subsea Pressure Vessel',
    words: ['pressure_hull_word', 'buoyancy_compensation_word'],
    allowed_classes: ['auv'],
  },
  {
    id: 'biosensor_system',
    label: 'Biosensor System',
    words: ['biosensor_hardware'],
    allowed_classes: ['cgm'],
  },
  // Bug P0-5 fix (2026-05-11): a medical wearable (CGM patch) is not a
  // submarine — it must NOT decompose under hull_and_buoyancy. This sentence
  // is the wearable-specific enclosure with biocompatibility and disposable-
  // patch sub-archetypes.
  {
    id: 'medical_wearable_enclosure',
    label: 'Medical Wearable Enclosure',
    words: ['wearable_housing', 'wearable_skin_interface'],
    allowed_classes: ['cgm'],
  },
  {
    id: 'haps_airframe',
    label: 'HAPS Airframe',
    words: ['haps_structure'],
    allowed_classes: ['haps'],
  },
  // Phase B Iter 1 (2026-05-11): HAPS-specific power+thermal sentence. Real
  // HAPS aircraft (Airbus Zephyr, BAE PHASA-35, ESA-funded designs) are
  // defined by their wing-integrated photovoltaic array + Li-S/Li-ion night-
  // storage battery + ultra-light composite spar. The composite spar IS the
  // primary load path — and the PV array IS the wing skin. This sentence
  // captures the energy/airframe-coupled subsystem that has no analogue in
  // any other product class.
  {
    id: 'solar_electric_airframe',
    label: 'Solar-Electric Airframe',
    words: ['composite_spar_word', 'photovoltaic_array_word', 'night_storage_battery_word'],
    allowed_classes: ['haps'],
  },
]

// ---------------------------------------------------------------------------
// Words (subsystem groups within sentences)
// ---------------------------------------------------------------------------

export const WORDS: HierarchyWord[] = [
  // ── battery_rack_assembly ─────────────────────────────────────────────────
  {
    id: 'cell_string',
    label: 'Cell String',
    sentence_id: 'battery_rack_assembly',
    characters: ['lfp_prismatic_cell'],
  },
  {
    id: 'rack_structure',
    label: 'Rack Structure',
    sentence_id: 'battery_rack_assembly',
    characters: ['steel_rack_frame'],
  },
  // ── battery_management_system_bms ────────────────────────────────────────
  {
    id: 'bms_master',
    label: 'BMS Master Controller',
    sentence_id: 'battery_management_system_bms',
    characters: ['pcb_controller'],
  },
  {
    id: 'bms_slave',
    label: 'BMS Slave Cell Monitors',
    sentence_id: 'battery_management_system_bms',
    // pcb_controller also used here — word distinguishes the role
    characters: ['pcb_controller'],
  },
  // ── power_conversion_system_pcs ──────────────────────────────────────────
  {
    id: 'pcs_inverter_group',
    label: 'PCS Inverter Group',
    sentence_id: 'power_conversion_system_pcs',
    characters: ['power_converter'],
  },
  {
    id: 'grid_transformer_group',
    label: 'Grid Step-up Transformer',
    sentence_id: 'power_conversion_system_pcs',
    characters: ['transformer'],
  },
  // ── dc_distribution_switchgear ───────────────────────────────────────────
  {
    id: 'dc_switching',
    label: 'DC Switching',
    sentence_id: 'dc_distribution_switchgear',
    characters: ['dc_contactor'],
  },
  {
    id: 'dc_protection',
    label: 'DC Protection',
    sentence_id: 'dc_distribution_switchgear',
    characters: ['circuit_breaker', 'protection_relay', 'resistor'],
  },
  {
    id: 'dc_buswork',
    label: 'DC Buswork',
    sentence_id: 'dc_distribution_switchgear',
    characters: ['copper_busbar'],
  },
  // ── thermal_management_system ────────────────────────────────────────────
  {
    id: 'active_cooling',
    label: 'Active Liquid Cooling',
    sentence_id: 'thermal_management_system',
    characters: ['liquid_cooling_system'],
  },
  {
    id: 'passive_insulation',
    label: 'Passive Thermal Insulation',
    sentence_id: 'thermal_management_system',
    characters: ['thermal_insulation_panel', 'aluminium_heatsink'],
  },
  // ── fire_detection_and_suppression_system_fss ────────────────────────────
  {
    id: 'suppression_hardware',
    label: 'Suppression Hardware',
    sentence_id: 'fire_detection_and_suppression_system_fss',
    characters: ['fire_suppression_system', 'pressure_vessel'],
  },
  {
    id: 'detection_sensors',
    label: 'Detection Sensors',
    sentence_id: 'fire_detection_and_suppression_system_fss',
    characters: ['gas_sensor', 'optical_arc_sensor'],
  },
  // ── energy_management_system_ems_scada ───────────────────────────────────
  {
    id: 'ems_compute',
    label: 'EMS / SCADA Compute',
    sentence_id: 'energy_management_system_ems_scada',
    characters: ['ems_controller'],
  },
  {
    id: 'ems_network',
    label: 'EMS Network Infrastructure',
    sentence_id: 'energy_management_system_ems_scada',
    characters: ['network_switch', 'power_converter'],
  },
  // ── container_enclosure_fit_out ──────────────────────────────────────────
  {
    id: 'container_access',
    label: 'Container Access',
    sentence_id: 'container_enclosure_fit_out',
    characters: ['steel_door'],
  },
  {
    id: 'container_services',
    label: 'Container Services',
    sentence_id: 'container_enclosure_fit_out',
    characters: ['cable_transit_frame', 'switchboard_enclosure', 'thermal_insulation_panel'],
  },
  // ── refrigerant_circuit ──────────────────────────────────────────────────
  // Bug P0-6 fix (2026-05-11): a real 30 kW R290 heat pump's refrigerant
  // circuit decomposes into compressor + heat exchanger + expansion valve +
  // pressure monitoring + fan, not just "liquid_cooling_system".
  {
    id: 'refrigerant_cycle',
    label: 'Refrigerant Cycle',
    sentence_id: 'refrigerant_circuit',
    characters: ['liquid_cooling_system'],
  },
  {
    id: 'compressor_word',
    label: 'Compressor',
    sentence_id: 'refrigerant_circuit',
    characters: ['compressor_unit', 'refrigerant_lubricant'],
  },
  {
    id: 'heat_exchanger_word',
    label: 'Heat Exchanger',
    sentence_id: 'refrigerant_circuit',
    characters: ['evaporator', 'condenser'],
  },
  {
    id: 'expansion_valve_word',
    label: 'Expansion Valve and Drier',
    sentence_id: 'refrigerant_circuit',
    characters: ['txv_or_eev', 'refrigerant_drier_filter'],
  },
  {
    id: 'pressure_monitoring_word',
    label: 'Pressure Monitoring',
    sentence_id: 'refrigerant_circuit',
    characters: ['high_pressure_transducer', 'low_pressure_transducer', 'safety_pressure_switch'],
  },
  {
    id: 'fan_word',
    label: 'EC Fan',
    sentence_id: 'refrigerant_circuit',
    characters: ['ec_fan_motor', 'fan_impeller'],
  },
  {
    id: 'refrigerant_distribution',
    label: 'Refrigerant Distribution',
    sentence_id: 'refrigerant_circuit',
    characters: ['copper_wire', 'polymer_gasket'],
  },
  // ── hydronic_circuit ─────────────────────────────────────────────────────
  {
    id: 'hydronic_flow',
    label: 'Hydronic Flow',
    sentence_id: 'hydronic_circuit',
    characters: ['liquid_cooling_system'],
  },
  {
    id: 'hydronic_connections',
    label: 'Hydronic Connections',
    sentence_id: 'hydronic_circuit',
    characters: ['copper_terminal', 'polymer_gasket', 'copper_wire'],
  },
  // ── heat_pump_controls ───────────────────────────────────────────────────
  {
    id: 'hp_controls_compute',
    label: 'HP Controls Compute',
    sentence_id: 'heat_pump_controls',
    characters: ['pcb_controller'],
  },
  // ── heat_pump_enclosure ──────────────────────────────────────────────────
  {
    id: 'hp_enclosure_structure',
    label: 'HP Enclosure and Frame',
    sentence_id: 'heat_pump_enclosure',
    characters: ['polymer_enclosure', 'aluminium_extrusion', 'steel_plate', 'steel_bolt'],
  },
  // ── growing_rack_system ──────────────────────────────────────────────────
  {
    id: 'rack_structure_vfarm',
    label: 'Growing Rack Structure',
    sentence_id: 'growing_rack_system',
    characters: ['aluminium_extrusion', 'steel_bolt'],
  },
  // ── lighting_system ──────────────────────────────────────────────────────
  {
    id: 'lighting_fixtures',
    label: 'Lighting Fixtures',
    sentence_id: 'lighting_system',
    characters: ['pcb_controller', 'copper_wire'],
  },
  // ── fertigation_loop ─────────────────────────────────────────────────────
  {
    id: 'fertigation_flow',
    label: 'Fertigation Flow',
    sentence_id: 'fertigation_loop',
    characters: ['liquid_cooling_system', 'polymer_gasket', 'copper_wire'],
  },
  // ── hvac_co2_system ──────────────────────────────────────────────────────
  {
    id: 'hvac_flow',
    label: 'HVAC Flow',
    sentence_id: 'hvac_co2_system',
    characters: ['liquid_cooling_system', 'copper_wire'],
  },
  {
    id: 'co2_dosing',
    label: 'CO2 Dosing',
    sentence_id: 'hvac_co2_system',
    characters: ['pressure_vessel', 'gas_sensor'],
  },
  // ── airframe_structure ────────────────────────────────────────────────────
  {
    id: 'airframe_body',
    label: 'Airframe Body',
    sentence_id: 'airframe_structure',
    characters: ['aluminium_extrusion', 'steel_bolt', 'polymer_enclosure'],
  },
  // ── propulsion_system ────────────────────────────────────────────────────
  {
    id: 'propulsion_motors',
    label: 'Propulsion Motors',
    sentence_id: 'propulsion_system',
    characters: ['power_converter', 'copper_wire'],
  },
  // ── flight_computer ──────────────────────────────────────────────────────
  {
    id: 'avionics_compute',
    label: 'Avionics Compute',
    sentence_id: 'flight_computer',
    characters: ['pcb_controller', 'network_switch'],
  },
  // ── charger_power_conversion ─────────────────────────────────────────────
  {
    id: 'charger_pcs',
    label: 'Charger PCS',
    sentence_id: 'charger_power_conversion',
    characters: ['power_converter', 'transformer', 'circuit_breaker'],
  },
  // ── charger_enclosure ────────────────────────────────────────────────────
  {
    id: 'charger_enclosure_structure',
    label: 'Charger Enclosure',
    sentence_id: 'charger_enclosure',
    characters: ['switchboard_enclosure', 'polymer_enclosure'],
  },
  // ── bioreactor_vessel ────────────────────────────────────────────────────
  {
    id: 'bioreactor_vessel_body',
    label: 'Bioreactor Vessel Body',
    sentence_id: 'bioreactor_vessel',
    characters: ['pressure_vessel', 'polymer_gasket', 'steel_plate'],
  },
  // ── bioreactor_controls ──────────────────────────────────────────────────
  {
    id: 'bioreactor_sensing',
    label: 'Bioreactor Sensing',
    sentence_id: 'bioreactor_controls',
    characters: ['gas_sensor', 'pcb_controller', 'optical_arc_sensor'],
  },
  // ── edge_compute_system ──────────────────────────────────────────────────
  {
    id: 'edge_compute_hardware',
    label: 'Edge Compute Hardware',
    sentence_id: 'edge_compute_system',
    characters: ['pcb_controller', 'network_switch', 'copper_wire'],
  },
  // ── hull_and_buoyancy ────────────────────────────────────────────────────
  {
    id: 'hull_structure',
    label: 'Hull Structure',
    sentence_id: 'hull_and_buoyancy',
    characters: ['polymer_enclosure', 'aluminium_extrusion', 'polymer_gasket'],
  },
  // ── subsea_pressure_vessel (Phase B Iter 1, 2026-05-11) ──────────────────
  // Pressure-rated end caps + dive-rated O-rings + structural ribs. Reuses
  // existing characters (no new radicals) plus two new function-class IDs:
  //   - 'pressure_rated_endcap' (pressure_vessel_function + steel/aluminium)
  //   - 'dive_oring_seal' (polymer_thermoplastic + sealing function)
  // Both ride on existing radicals via the convention used elsewhere in this
  // file — full Character entries are not required for hierarchy routing.
  {
    id: 'pressure_hull_word',
    label: 'Pressure Hull and End Caps',
    sentence_id: 'subsea_pressure_vessel',
    characters: ['pressure_rated_endcap', 'dive_oring_seal', 'aluminium_extrusion', 'pressure_vessel'],
  },
  {
    id: 'buoyancy_compensation_word',
    label: 'Buoyancy Compensation and Ballast',
    sentence_id: 'subsea_pressure_vessel',
    // Syntactic foam block + ballast trim weight + buoyancy control valve.
    // Reuses steel_plate (trim weights) + polymer_gasket (foam encapsulation seals).
    characters: ['syntactic_foam_block', 'ballast_trim_weight', 'steel_plate', 'polymer_gasket'],
  },
  // ── biosensor_system ─────────────────────────────────────────────────────
  {
    id: 'biosensor_hardware',
    label: 'Biosensor Hardware',
    sentence_id: 'biosensor_system',
    characters: ['pcb_controller', 'copper_wire'],
  },
  // ── medical_wearable_enclosure ───────────────────────────────────────────
  // Bug P0-5 fix: CGM-class enclosure characters must NOT map to
  // hull_structure (under hull_and_buoyancy / AUV).
  {
    id: 'wearable_housing',
    label: 'Wearable Housing',
    sentence_id: 'medical_wearable_enclosure',
    characters: ['polymer_enclosure'],
  },
  {
    id: 'wearable_skin_interface',
    label: 'Skin Interface and Sealing',
    sentence_id: 'medical_wearable_enclosure',
    characters: ['polymer_gasket'],
  },
  // ── haps_airframe ────────────────────────────────────────────────────────
  {
    id: 'haps_structure',
    label: 'HAPS Airframe Structure',
    sentence_id: 'haps_airframe',
    characters: ['aluminium_extrusion', 'steel_bolt', 'polymer_enclosure'],
  },
  // ── solar_electric_airframe (Phase B Iter 1, 2026-05-11) ─────────────────
  // Wing-integrated PV + composite spar + Li-S night-storage battery —
  // tightly coupled airframe-energy subsystem unique to HAPS / stratospheric
  // pseudo-satellite craft. New function-class IDs:
  //   - 'composite_spar' (carbon_fibre_composite radical, structural)
  //   - 'wing_integrated_pv_module' (silicon_semiconductor_function +
  //     optical_transduction_function radicals — already in library)
  //   - 'lithium_sulfur_night_battery' (electrochemical_energy_function radical)
  //   - 'mppt_charge_controller' (silicon_semiconductor_function +
  //     digital_logic_function radicals)
  // All characters reuse the 22 existing radicals via the same string-only
  // hierarchy convention used by the heat-pump and AUV characters.
  {
    id: 'composite_spar_word',
    label: 'Composite Spar and Wing Skin',
    sentence_id: 'solar_electric_airframe',
    characters: ['composite_spar', 'aluminium_extrusion', 'polymer_enclosure'],
  },
  {
    id: 'photovoltaic_array_word',
    label: 'Wing-Integrated Photovoltaic Array',
    sentence_id: 'solar_electric_airframe',
    characters: ['wing_integrated_pv_module', 'mppt_charge_controller', 'copper_wire'],
  },
  {
    id: 'night_storage_battery_word',
    label: 'Night-Storage Battery Pack',
    sentence_id: 'solar_electric_airframe',
    characters: ['lithium_sulfur_night_battery', 'pcb_controller'],
  },
  // ── Seed-only characters with no domain-specific parent yet ──────────────
  // These appear in multiple product classes — they route to their nearest sentence
  // via the word that contains them. Fallback for builder: 'unknown_subsystem'.
  {
    id: 'steel_bolt_generic',
    label: 'Generic Steel Fasteners',
    sentence_id: 'container_enclosure_fit_out',
    characters: ['steel_bolt', 'steel_threaded_rod'],
  },
  {
    id: 'copper_wire_generic',
    label: 'Generic Cable Runs',
    sentence_id: 'container_enclosure_fit_out',
    characters: ['copper_wire', 'copper_terminal'],
  },
]

// ---------------------------------------------------------------------------
// Lookup helpers (built once, used by structural-builder)
// ---------------------------------------------------------------------------

/** Map from character ID → all words that contain it. */
export function buildCharacterToWords(): Map<string, HierarchyWord[]> {
  const map = new Map<string, HierarchyWord[]>()
  for (const word of WORDS) {
    for (const charId of word.characters) {
      const existing = map.get(charId) ?? []
      existing.push(word)
      map.set(charId, existing)
    }
  }
  return map
}

/** Map from word ID → sentence. */
export function buildWordToSentence(): Map<string, HierarchySentence> {
  const map = new Map<string, HierarchySentence>()
  const sentenceById = new Map<string, HierarchySentence>(SENTENCES.map(s => [s.id, s]))
  for (const word of WORDS) {
    const sentence = sentenceById.get(word.sentence_id)
    if (sentence) map.set(word.id, sentence)
  }
  return map
}

/** Map from sentence ID → HierarchySentence. */
export const SENTENCE_BY_ID: Map<string, HierarchySentence> = new Map(
  SENTENCES.map(s => [s.id, s])
)

/** Map from word ID → HierarchyWord. */
export const WORD_BY_ID: Map<string, HierarchyWord> = new Map(
  WORDS.map(w => [w.id, w])
)

/** Total character → word mappings in the hierarchy. */
export const HIERARCHY_STATS = {
  sentences: SENTENCES.length,
  words: WORDS.length,
  characterMappings: WORDS.reduce((n, w) => n + w.characters.length, 0),
}
