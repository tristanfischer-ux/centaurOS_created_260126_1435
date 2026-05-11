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
 * Verification grade hierarchy: verified > estimated > grade_d > stub > data_gap
 */
export type VerificationGrade = 'verified' | 'estimated' | 'grade_d' | 'stub' | 'data_gap'

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
 * Returns true when the distributor hit is consistent with the archetype's
 * declared guard. Returns true (no-op) when no guard is declared.
 *
 * Bug P0-3 fix (2026-05-11).
 */
function isDistributorResultConsistentWithArchetype(
  archetypeId: string,
  result: AggregateResult,
): { ok: boolean; reason?: string } {
  const guard = ARCHETYPE_RESULT_GUARDS[archetypeId]
  if (!guard) return { ok: true }

  const mfg = (result.best.manufacturer ?? '').toLowerCase()
  const desc = (result.best.description ?? '').toLowerCase()

  if (guard.bannedManufacturers && guard.bannedManufacturers.some(b => mfg.includes(b))) {
    return { ok: false, reason: `banned manufacturer "${result.best.manufacturer}" for ${archetypeId}` }
  }
  if (guard.allowedManufacturers && guard.allowedManufacturers.length > 0) {
    const okMfg = guard.allowedManufacturers.some(a => mfg.includes(a) || desc.includes(a))
    if (!okMfg) {
      return {
        ok: false,
        reason: `manufacturer "${result.best.manufacturer}" not on allowlist for ${archetypeId}`,
      }
    }
  }
  if (guard.requiredDescriptionKeywords && guard.requiredDescriptionKeywords.length > 0) {
    const okDesc = guard.requiredDescriptionKeywords.some(k => desc.includes(k))
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
    if (cls.includes(classKey) || cls.includes(classKey.replace('_', ''))) {
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
      verification_grade: estimatedUnitPriceGbp !== null ? 'estimated' : 'grade_d',
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
 */
function resolveStructuralFabricatedLeaf(
  archetypeId: string,
  qty: number,
  estimatedUnitPriceGbp: number | null,
): ResolvedLeafAnnotation {
  const gradeD = GRADE_D_BY_CHARACTER[archetypeId]
  if (gradeD) {
    return {
      archetype_id: archetypeId,
      part_class: 'structural_fabricated',
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
      notes: 'Structural fabrication: Nightshift corpus query not yet wired; Grade D fallback',
    }
  }

  return {
    archetype_id: archetypeId,
    part_class: 'structural_fabricated',
    qty,
    mpn: null,
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
      annotation = resolveStructuralFabricatedLeaf(archetypeId, qty, estimatedUnitPriceGbp)
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
