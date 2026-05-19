/**
 * @file deployment-envelopes.ts — canonical physical-envelope registry for the
 * Stage 3 sizing solver and any downstream consumer that needs to anchor a
 * product's outer dimensions to a real shipping / racking / pallet / cabinet
 * standard.
 *
 * PURPOSE
 *  - Today the sizing stage derives an envelope ad-hoc per brief. Different
 *    runs of the same class can land on different containers (40-ft Standard
 *    vs 40-ft Hi-Cube vs 53-ft) purely because the LLM phrased itself
 *    differently. This file gives the solver a SINGLE canonical lookup keyed
 *    by class slug, plus best-fit helpers for payload-volume / payload-mass
 *    queries.
 *
 *  - Every entry cites the underlying ISO / EPAL / EIA / ETSI standard. No
 *    fabricated dimensions. Where the standard expresses an internal vs
 *    external envelope (e.g. ISO containers), both are recorded so the solver
 *    can choose the right one for the question being asked (payload packing
 *    uses internal; site / footprint / crane work uses external).
 *
 * NOT WIRED INTO THE SIZING STAGE YET.
 *  - This file ships data + helpers only. Wiring into
 *    `stages/3-size-layout.ts` is a separate dispatch — see "Recommended
 *    integration" notes in the dispatch report.
 *
 * SOURCES
 *  - ISO 668:2020 — Series 1 freight containers, classification, external
 *    dimensions and ratings (20-ft, 40-ft, 40-ft HC, 45-ft HC).
 *  - ISO 1496-1:2013 / 2023 — Specification for general-purpose freight
 *    containers (internal dimensions, payload).
 *  - ISO 1496-2 — Refrigerated container internal dimensions (40-ft reefer).
 *  - American Trucking Associations / U.S. DOT — 53-ft North America
 *    domestic dry-van dimensions (no ISO equivalent for domestic 53-ft).
 *  - EIA-310-E / IEC 60297-3-100 — 19" rack panel and U-pitch.
 *  - ETSI EN 300 119-1 / -3 — 600 mm-wide European telecoms rack.
 *  - EN 50022 / IEC 60715 — DIN rail TS35 (top-hat).
 *  - EPAL Specification 1 — Euro pallet (1200 × 800 × 144 mm).
 *  - GMA / ISO 6780 — 48"×40" North American pallet (1219 × 1016 × 144 mm).
 *  - AS 4068 / ISO 6780 — Australian standard pallet (1165 × 1165 mm).
 *  - IEC 61215 / Tier-1 manufacturer datasheets (Jinko Tiger Neo, LONGi
 *    Hi-MO, Trina Vertex, JA Solar DeepBlue) — residential and utility-scale
 *    PV module form factors.
 *  - Manufacturer datasheets — Alpitronic HYC150, ABB Terra 184, Tesla
 *    Megapack 2 XL, CATL EnerC, Sungrow PowerStack — for DC fast charger
 *    pedestals and IP-rated outdoor cabinets.
 */

export type DeploymentEnvelopeCategory =
  | 'shipping_container'
  | 'electrical_rack'
  | 'pallet'
  | 'pv_module_form_factor'
  | 'outdoor_cabinet'
  | 'din_rail'

export interface EnvelopeDimensionsMm {
  length: number
  width: number
  height: number
}

export interface DeploymentEnvelope {
  /** Stable slug — used as the key into DEPLOYMENT_ENVELOPES and as the
   *  identifier returned by helpers. kebab-case to match the rest of the
   *  pdf-engine-v2 slug convention. */
  id: string
  category: DeploymentEnvelopeCategory
  /** Human-readable standard name, e.g. "40-ft ISO Hi-Cube Container". */
  standard: string
  /** Internal usable envelope. For racks / cabinets / pallets this is the
   *  useful work-volume; for shipping containers it is the in-cargo space
   *  (smaller than external because of wall thickness, especially on
   *  reefers). */
  internal_dimensions_mm: EnvelopeDimensionsMm
  /** External envelope, where the standard meaningfully distinguishes it
   *  (shipping containers, outdoor cabinets). Omitted for pallets / DIN
   *  rails / PV modules where internal ≈ external. */
  external_dimensions_mm?: EnvelopeDimensionsMm
  /** Maximum net payload mass (kg). Containers: net of tare; pallets:
   *  static / dynamic load per EPAL spec. */
  max_payload_kg?: number
  /** Maximum gross weight (kg). Shipping containers only — equals
   *  max_payload_kg + tare. */
  max_gross_weight_kg?: number
  /** The underlying standard / specification document this entry derives
   *  from. Used for audit logging in the sizing stage. */
  reference_standard?: string
  notes?: string
}

// ============================================================================
// Registry
// ============================================================================

/**
 * NB: All dimensions in millimetres, all masses in kilograms. ISO container
 * dimensions are quoted in metres in the original standards (e.g. internal
 * length 12.032 m) and converted here to mm (12_032). The conversion is
 * exact — no rounding artefacts have been introduced.
 */
export const DEPLOYMENT_ENVELOPES: Record<string, DeploymentEnvelope> = {
  // ─────────────────────────────────────────────────────────────────────────
  // Shipping containers — ISO 668 / 1496 series
  // ─────────────────────────────────────────────────────────────────────────

  'container-20ft-iso': {
    id: 'container-20ft-iso',
    category: 'shipping_container',
    standard: '20-ft ISO Standard Container (1CC)',
    internal_dimensions_mm: { length: 5898, width: 2352, height: 2393 },
    external_dimensions_mm: { length: 6058, width: 2438, height: 2591 },
    max_payload_kg: 28_180,
    max_gross_weight_kg: 30_480,
    reference_standard: 'ISO 668:2020 / ISO 1496-1:2013',
    notes:
      'Series 1 freight container, designation 1CC. Tare ~2300 kg. Used as default ' +
      'envelope for small-MWh BESS, modular skid-mount systems, and sub-3.5 m wide ' +
      'oversized cargo on a standard chassis.',
  },

  'container-40ft-iso': {
    id: 'container-40ft-iso',
    category: 'shipping_container',
    standard: '40-ft ISO Standard Container (1AA)',
    internal_dimensions_mm: { length: 12_032, width: 2352, height: 2393 },
    external_dimensions_mm: { length: 12_192, width: 2438, height: 2591 },
    max_payload_kg: 26_650,
    max_gross_weight_kg: 30_480,
    reference_standard: 'ISO 668:2020 / ISO 1496-1:2013',
    notes:
      'Series 1 freight container, designation 1AA. Tare ~3830 kg. Largely ' +
      'superseded by 40-ft Hi-Cube for new BESS / data-centre / e-house ' +
      'deployments because the additional 305 mm of clear height accommodates ' +
      'standard 42U racks plus cable tray.',
  },

  'container-40ft-hicube': {
    id: 'container-40ft-hicube',
    category: 'shipping_container',
    standard: '40-ft ISO Hi-Cube Container (1AAA)',
    internal_dimensions_mm: { length: 12_032, width: 2352, height: 2698 },
    external_dimensions_mm: { length: 12_192, width: 2438, height: 2896 },
    max_payload_kg: 26_580,
    max_gross_weight_kg: 30_480,
    reference_standard: 'ISO 668:2020 / ISO 1496-1:2013',
    notes:
      'Series 1 freight container, designation 1AAA. Internal height 2.698 m ' +
      'allows standard 42U rack + overhead cable tray. CANONICAL ENVELOPE for ' +
      'utility-scale BESS (Tesla Megapack 2 XL, CATL EnerC, Sungrow PowerStack), ' +
      'containerised data halls and modular e-houses.',
  },

  'container-45ft-hicube': {
    id: 'container-45ft-hicube',
    category: 'shipping_container',
    standard: '45-ft ISO Hi-Cube Container (1EEE)',
    internal_dimensions_mm: { length: 13_556, width: 2352, height: 2698 },
    external_dimensions_mm: { length: 13_716, width: 2438, height: 2896 },
    max_payload_kg: 27_700,
    max_gross_weight_kg: 32_500,
    reference_standard: 'ISO 668:2020',
    notes:
      'Pallet-wide variants exist (internal width up to 2440 mm) but the ISO ' +
      'standard 45-ft HC retains the 2352 mm internal beam. Used for ' +
      'integrated BESS-plus-power-conversion skids that overflow 40-ft.',
  },

  'container-40ft-reefer': {
    id: 'container-40ft-reefer',
    category: 'shipping_container',
    standard: '40-ft ISO Refrigerated Container (Reefer)',
    internal_dimensions_mm: { length: 11_585, width: 2290, height: 2260 },
    external_dimensions_mm: { length: 12_192, width: 2438, height: 2591 },
    max_payload_kg: 27_700,
    max_gross_weight_kg: 30_480,
    reference_standard: 'ISO 1496-2',
    notes:
      'Internal envelope is materially smaller than the dry 40-ft because of ' +
      'the refrigeration unit (≈480 mm of length consumed at the front bulkhead) ' +
      'and the 60-80 mm of insulating foam in walls / floor / ceiling. Use for ' +
      'pharma cold-chain pilot plants, cryogenic equipment, climate-controlled ' +
      'data-hall test rigs.',
  },

  'container-53ft-domestic': {
    id: 'container-53ft-domestic',
    category: 'shipping_container',
    standard: '53-ft North America Domestic Container',
    internal_dimensions_mm: { length: 16_155, width: 2591, height: 2700 },
    external_dimensions_mm: { length: 16_154, width: 2600, height: 2896 },
    max_payload_kg: 20_400,
    max_gross_weight_kg: 32_660,
    reference_standard: 'ATA / U.S. DOT — no ISO equivalent (intra-North America only)',
    notes:
      'Intermodal but NOT ISO-compatible — width 2.59 m exceeds the ISO 2.438 m ' +
      'beam, so 53-ft units cannot be shipped on standard ocean trans-shipment. ' +
      'Wider beam suits North American utility-scale BESS deployments where the ' +
      'extra interior width allows two rows of racks plus a centre maintenance ' +
      'aisle.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Electrical / server racks — EIA-310 / ETSI / IEC
  // ─────────────────────────────────────────────────────────────────────────

  'rack-eia-19in': {
    id: 'rack-eia-19in',
    category: 'electrical_rack',
    standard: '19" EIA-310 Rack',
    // U-pitch is 44.45 mm. Internal usable height for a single U slot is
    // 44.45 mm; the registry records ONE U so the solver can multiply by U
    // count downstream. Internal width 450 mm (front-rail-to-front-rail
    // clearance) per IEC 60297-3-100.
    internal_dimensions_mm: { length: 450, width: 450, height: 44.45 },
    external_dimensions_mm: { length: 482.6, width: 482.6, height: 44.45 },
    reference_standard: 'EIA-310-E / IEC 60297-3-100',
    notes:
      'Canonical 19-inch rack panel. Width 482.6 mm at the mounting flange, ' +
      '450 mm clear between front rails. U-pitch 44.45 mm (1.75 in). Depth ' +
      'is NOT defined by EIA-310 — see rack-eia-19in-42u-600mm and ' +
      'rack-eia-19in-42u-800mm for the two common DC cabinet form factors.',
  },

  'rack-eia-19in-42u-600x600': {
    id: 'rack-eia-19in-42u-600x600',
    category: 'electrical_rack',
    standard: '19" 42U Cabinet — 600 × 600 mm footprint',
    internal_dimensions_mm: { length: 450, width: 450, height: 1867 }, // 42 × 44.45 mm
    external_dimensions_mm: { length: 600, width: 600, height: 2000 },
    max_payload_kg: 1000,
    reference_standard: 'EIA-310-E / IEC 60297-3-100',
    notes:
      'Standard edge / colocation cabinet. 600 × 600 mm footprint suits edge-AI, ' +
      'switchgear-light deployments and shallow telecoms gear. Insufficient depth ' +
      'for two-post hyperscale GPU servers (which need ≥1000 mm).',
  },

  'rack-eia-19in-42u-800x1000': {
    id: 'rack-eia-19in-42u-800x1000',
    category: 'electrical_rack',
    standard: '19" 42U Cabinet — 800 × 1000 mm footprint',
    internal_dimensions_mm: { length: 850, width: 700, height: 1867 },
    external_dimensions_mm: { length: 1000, width: 800, height: 2000 },
    max_payload_kg: 1500,
    reference_standard: 'EIA-310-E / IEC 60297-3-100',
    notes:
      'Deep cabinet for hyperscale / GPU servers, large PDUs, cable management. ' +
      'Canonical envelope for edge-AI inference appliances that need rear cable ' +
      'breakout space.',
  },

  'rack-etsi-23in': {
    id: 'rack-etsi-23in',
    category: 'electrical_rack',
    standard: '23" ETSI Telecoms Rack (600 mm wide)',
    // ETSI 600 mm wide; single U pitch 25 mm (NB: ETSI uses a 25 mm U,
    // distinct from EIA's 44.45 mm). Stored height is one U so the
    // sizing stage can scale by U-count.
    internal_dimensions_mm: { length: 530, width: 530, height: 25 },
    external_dimensions_mm: { length: 600, width: 600, height: 25 },
    reference_standard: 'ETSI EN 300 119-1 / EN 300 119-3',
    notes:
      'European telecoms / carrier-grade rack. 600 mm external width, 25 mm ' +
      'U-pitch (NOT 44.45 mm — ETSI U is finer than EIA U). Used for telco ' +
      'central-office gear, optical line terminals, microwave radios.',
  },

  'din-rail-ts35': {
    id: 'din-rail-ts35',
    category: 'din_rail',
    standard: 'DIN Rail TS35 (Top-Hat)',
    // A DIN rail is a length of extruded steel; the registry stores a
    // 1000 mm reference segment so the sizing stage can multiply by the
    // panel length needed. Cross-section 35 mm × 7.5 mm.
    internal_dimensions_mm: { length: 1000, width: 35, height: 7.5 },
    reference_standard: 'EN 50022 / IEC 60715',
    notes:
      'Top-hat 35 mm × 7.5 mm DIN rail. 1000 mm is the reference segment — ' +
      'multiply by required panel length. Used for control-cabinet mounting ' +
      'of contactors, terminal blocks, modular PLCs, miniature circuit breakers.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Pallets — EPAL / GMA / ISO 6780
  // ─────────────────────────────────────────────────────────────────────────

  'pallet-euro-epal': {
    id: 'pallet-euro-epal',
    category: 'pallet',
    standard: 'Euro Pallet (EPAL-1)',
    internal_dimensions_mm: { length: 1200, width: 800, height: 144 },
    max_payload_kg: 1500,
    reference_standard: 'EPAL Specification 1',
    notes:
      'EUR / EPAL-1 standard Euro pallet. Static load 4000 kg, dynamic load ' +
      '1500 kg, rolling load 1000 kg per EPAL spec. Canonical packaging unit ' +
      'for European residential heat pumps, white-goods-scale appliances, ' +
      'palletised solar modules.',
  },

  'pallet-us-standard': {
    id: 'pallet-us-standard',
    category: 'pallet',
    standard: 'GMA / 48"×40" North American Pallet',
    internal_dimensions_mm: { length: 1219, width: 1016, height: 144 },
    max_payload_kg: 1360,
    reference_standard: 'GMA / ISO 6780',
    notes:
      '48 in × 40 in × 5.67 in. Dominant North American pallet (~30 % of ' +
      'total US pallet usage). Static load ~2700 kg, dynamic ~1360 kg.',
  },

  'pallet-australian': {
    id: 'pallet-australian',
    category: 'pallet',
    standard: 'Australian Standard Pallet (1165 mm square)',
    internal_dimensions_mm: { length: 1165, width: 1165, height: 150 },
    max_payload_kg: 2000,
    reference_standard: 'AS 4068 / ISO 6780',
    notes:
      'Square 1165 mm × 1165 mm Australian standard pallet, sized to fit ' +
      'snugly two-abreast across the 2438 mm internal beam of an ISO container ' +
      'with minimal void.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PV module form factors — typical residential & utility-scale
  // ─────────────────────────────────────────────────────────────────────────

  'pv-module-residential': {
    id: 'pv-module-residential',
    category: 'pv_module_form_factor',
    standard: 'Residential PV Module (typical 60-cell / 120-half-cell)',
    internal_dimensions_mm: { length: 1700, width: 1000, height: 35 },
    max_payload_kg: 22,
    reference_standard:
      'IEC 61215 / IEC 61730 (test standards); typical of Jinko Tiger Neo 54C, ' +
      'LONGi Hi-MO 6 60C, JA Solar DeepBlue 3.0 residential.',
    notes:
      'Reference residential PV module: ~1.7 m × 1.0 m × 35 mm, ~20 kg. Used ' +
      'for residential roof-mount PV envelope, pitched-roof structural / ' +
      'rail-spacing calculations.',
  },

  'pv-module-utility': {
    id: 'pv-module-utility',
    category: 'pv_module_form_factor',
    standard: 'Utility-Scale PV Module (typical 72-cell / 144-half-cell)',
    internal_dimensions_mm: { length: 2400, width: 1200, height: 35 },
    max_payload_kg: 32,
    reference_standard:
      'IEC 61215 / IEC 61730 (test standards); typical of LONGi Hi-MO X6 Max ' +
      '72C, Trina Vertex N TSM-NEG21C.20, JinkoSolar Tiger Neo 78HL4.',
    notes:
      'Reference utility-scale PV module: ~2.4 m × 1.2 m × 35 mm, ~30 kg. ' +
      'Drives tracker pitch, row spacing, and shipping pallet stack-count for ' +
      'utility-scale PV plant design.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Outdoor / IP-rated cabinets
  // ─────────────────────────────────────────────────────────────────────────

  'cabinet-dcfc-pedestal': {
    id: 'cabinet-dcfc-pedestal',
    category: 'outdoor_cabinet',
    standard: 'DC Fast Charger Pedestal',
    internal_dimensions_mm: { length: 600, width: 600, height: 1700 },
    external_dimensions_mm: { length: 600, width: 600, height: 1700 },
    max_payload_kg: 400,
    reference_standard:
      'Manufacturer-typical (Alpitronic HYC150, ABB Terra 184, Tritium PKM150)',
    notes:
      'Canonical envelope for 50–180 kW DC fast charger pedestals. IP54 / IP55 ' +
      'rated outdoor enclosure with integrated HMI, payment terminal, two CCS2 ' +
      'cable hangers. Higher-power 350 kW+ chargers move to split power-cabinet + ' +
      'dispenser architectures and use the medium IP54 cabinet for the power unit.',
  },

  'cabinet-outdoor-ip54-small': {
    id: 'cabinet-outdoor-ip54-small',
    category: 'outdoor_cabinet',
    standard: 'Small Outdoor IP54 Cabinet',
    internal_dimensions_mm: { length: 800, width: 600, height: 300 },
    external_dimensions_mm: { length: 800, width: 600, height: 300 },
    max_payload_kg: 75,
    reference_standard: 'IEC 60529 (ingress protection) — manufacturer-typical form factor',
    notes:
      'Wall-mount or pole-mount outdoor IP54 cabinet. Used for small ESS gateway, ' +
      'PV combiner box, telecoms cabinet, EV-charger sub-distribution.',
  },

  'cabinet-outdoor-ip54-medium': {
    id: 'cabinet-outdoor-ip54-medium',
    category: 'outdoor_cabinet',
    standard: 'Medium Outdoor IP54 Cabinet',
    internal_dimensions_mm: { length: 1800, width: 1000, height: 500 },
    external_dimensions_mm: { length: 1800, width: 1000, height: 500 },
    max_payload_kg: 250,
    reference_standard: 'IEC 60529 (ingress protection) — manufacturer-typical form factor',
    notes:
      'Floor-standing outdoor IP54 cabinet. Used for residential / light-commercial ' +
      'BESS (5–30 kWh), 350 kW DCFC power-cabinet half, electrical distribution / ' +
      'feeder pillar deployments.',
  },
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Slug-normalisation table for class slugs that pdf-engine-v2 uses
 * inconsistently between modules. Maps every alias known to appear in the
 * codebase to a canonical envelope id.
 *
 * Stored here (not imported from class-module-priors / class-cost-structure)
 * because the envelope choice depends on the DEPLOYMENT pattern of the
 * product, not its cost structure or module set. A residential heat pump
 * ships on a Euro pallet; a utility-scale BESS ships in a 40-ft Hi-Cube;
 * a DC fast charger arrives on its own pedestal. The mapping is shallow but
 * explicit.
 *
 * Returns `null` for classes where no canonical envelope applies — AUV
 * (custom pressure hull), HAPS (bespoke airframe), small wearables (CGM /
 * fitness tracker — the envelope IS the device).
 */
const CLASS_SLUG_TO_ENVELOPE_ID: Record<string, string | null> = {
  // BESS — all utility-scale aliases route to 40-ft Hi-Cube (Tesla Megapack 2 / 2 XL,
  // Sungrow PowerStack, CATL EnerC, BYD MC Cube all use 40-ft HC as the deployment
  // envelope). Residential ESS is a separate slug below.
  'bess': 'container-40ft-hicube',
  'bess-utility-scale': 'container-40ft-hicube',
  'battery-energy-storage': 'container-40ft-hicube',
  'battery_energy_storage': 'container-40ft-hicube',
  'energy-storage': 'container-40ft-hicube',
  'energy_storage': 'container-40ft-hicube',

  // Residential ESS — small floor-standing IP-rated cabinet (Tesla Powerwall 3,
  // Enphase IQ Battery 5P, Sungrow SBR class). NOT a pallet — these are
  // wall- or floor-mounted installed units, not palletised crates.
  'residential-ess': 'cabinet-outdoor-ip54-medium',
  'residential_ess': 'cabinet-outdoor-ip54-medium',

  // Heat pumps — residential outdoor unit ships on a Euro pallet. Per Tristan's
  // dispatch brief: heat-pump-residential → pallet (Euro), no container.
  'heat-pump': 'pallet-euro-epal',
  'heat_pump': 'pallet-euro-epal',
  'heat-pump-residential': 'pallet-euro-epal',
  'heat_pump_residential': 'pallet-euro-epal',
  'heatpump': 'pallet-euro-epal',
  'mini-split-heatpump': 'pallet-euro-epal',
  'mini_split_heatpump': 'pallet-euro-epal',
  // `thermal_system` is the canonical slug emitted by the deterministic
  // classifier in `product-classifier.ts` (2026-05-19 council Option B fix).
  // The chain now overrides design.product_class to this value after R4.
  'thermal_system': 'pallet-euro-epal',
  'thermal-system': 'pallet-euro-epal',

  // EV charging — DC fast charger pedestal is its own envelope.
  'ev-charger': 'cabinet-dcfc-pedestal',
  'ev_charger': 'cabinet-dcfc-pedestal',
  'dc-fast-ev-charger': 'cabinet-dcfc-pedestal',
  'dc_fast_ev_charger': 'cabinet-dcfc-pedestal',

  // PV inverter — small string inverters ship on Euro pallets.
  'pv-string-inverter': 'pallet-euro-epal',
  'pv_string_inverter': 'pallet-euro-epal',

  // Edge-AI inference server — 1U / 2U rack-mount, deep cabinet.
  'edge-ai': 'rack-eia-19in-42u-800x1000',
  'edge_ai': 'rack-eia-19in-42u-800x1000',
  'edge-ai-inference-server': 'rack-eia-19in-42u-800x1000',
  'edge_ai_inference_server': 'rack-eia-19in-42u-800x1000',

  // Vertical farm — modular grow rooms are typically containerised, but
  // the canonical envelope is the bespoke grow-cell footprint (not an ISO
  // container). Return null so the sizing stage falls back to the existing
  // CEA grow-room defaults.
  'vfarm': null,
  'vertical-farm': null,
  'vertical_farm': null,

  // Bioreactor — pilot-scale skid is a free-standing pharma vessel, not a
  // shipping container. Return null; sizing stage retains existing defaults.
  'bioreactor': null,

  // Wearables — body-worn, the device IS the envelope. No deployment
  // envelope applies.
  'cgm': null,
  'wearable-medical-device': null,
  'wearable_medical_device': null,
  'wearable-fitness-tracker': null,
  'wearable_fitness_tracker': null,
  'insulin-pump': null,
  'insulin_pump': null,
  'consumer-smartphone': null,
  'consumer_smartphone': null,

  // Drones — custom airframe; ships on a foam-lined case, not a standard
  // envelope. Return null.
  'drone': null,
  'consumer-cinematography-drone': null,
  'consumer_cinematography_drone': null,
  'industrial-inspection-drone': null,
  'industrial_inspection_drone': null,

  // AUV — bespoke pressure hull; explicitly not applicable per the dispatch
  // brief.
  'auv': null,
  'autonomous-underwater-vehicle': null,
  'autonomous_underwater_vehicle': null,

  // HAPS — bespoke airframe; no deployment envelope.
  'haps': null,

  // Hydrogen / fuel cell — module-level products typically ship in 20-ft
  // standard containers (Nel Hydrogen, Plug Power EX-4250D, Cummins HyLYZER).
  'hydrogen-electrolyser': 'container-20ft-iso',
  'hydrogen_electrolyser': 'container-20ft-iso',
  'fuel-cell-power-module': 'container-20ft-iso',
  'fuel_cell_power_module': 'container-20ft-iso',
}

/**
 * Normalise a class slug to its registry key. Tolerant of both kebab- and
 * snake-case (pdf-engine-v2 uses both inconsistently — see class-cost-
 * structure.ts vs class-module-priors.ts vs stages/3-size-layout.ts).
 */
function normaliseClassSlug(slug: string): string {
  return slug.trim().toLowerCase()
}

/**
 * Return the canonical default deployment envelope for the given product
 * class slug. Returns `null` if the class has no canonical envelope —
 * e.g. AUV (custom hull), HAPS (bespoke airframe), wearables (device IS the
 * envelope), drones (custom airframe + transit case).
 *
 * The returned envelope is a stable reference — callers MUST NOT mutate it.
 * If you need to override a dimension for a specific brief, clone it first.
 */
export function defaultEnvelopeForClass(classSlug: string): DeploymentEnvelope | null {
  const normalised = normaliseClassSlug(classSlug)
  const envelopeId = CLASS_SLUG_TO_ENVELOPE_ID[normalised]
  if (envelopeId === undefined) return null // unknown class → no opinion
  if (envelopeId === null) return null      // known class but no canonical envelope
  const envelope = DEPLOYMENT_ENVELOPES[envelopeId]
  return envelope ?? null
}

/**
 * Compute the internal volume of an envelope in litres (= dm^3). Reads
 * `internal_dimensions_mm` and returns L × W × H / 1_000_000. The conversion
 * is exact for the values stored here (all integers); we coerce through
 * Number to avoid floating-point drift on display.
 */
function envelopeVolumeLiters(env: DeploymentEnvelope): number {
  const { length, width, height } = env.internal_dimensions_mm
  return Number(((length * width * height) / 1_000_000).toFixed(2))
}

/**
 * Suggest a ranked list of envelopes in `category` that can accommodate
 * the given payload volume (litres) and payload mass (kg). Returns the
 * candidates sorted by best fit (smallest envelope that contains the payload
 * first, then larger ones as escape valves).
 *
 * Envelopes without a `max_payload_kg` field (e.g. open racks, DIN rails)
 * are mass-permissive — the helper returns them whenever they meet the
 * volume constraint.
 *
 * If NO envelope in the category satisfies both constraints, returns an
 * empty array. The caller is responsible for either falling back to a
 * larger category or treating the brief as oversized.
 */
export function suggestEnvelope(
  payloadVolumeLiters: number,
  payloadMassKg: number,
  category: DeploymentEnvelopeCategory,
): DeploymentEnvelope[] {
  const candidates = Object.values(DEPLOYMENT_ENVELOPES).filter(env => env.category === category)
  const fits = candidates.filter(env => {
    const volumeOk = envelopeVolumeLiters(env) >= payloadVolumeLiters
    const massOk = env.max_payload_kg === undefined || env.max_payload_kg >= payloadMassKg
    return volumeOk && massOk
  })
  // Sort by ascending internal volume — smallest envelope that fits first.
  fits.sort((a, b) => envelopeVolumeLiters(a) - envelopeVolumeLiters(b))
  return fits
}

/**
 * Convenience accessor for ad-hoc lookups by id. Returns `null` if the id
 * is not in the registry rather than throwing — callers can decide whether
 * a miss is a soft fall-back or a hard error.
 */
export function getEnvelopeById(id: string): DeploymentEnvelope | null {
  return DEPLOYMENT_ENVELOPES[id] ?? null
}
