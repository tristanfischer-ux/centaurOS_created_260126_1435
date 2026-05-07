/**
 * @file domain-tags.ts — 20-tag product-domain taxonomy for supplier filtering.
 *
 * Purpose (D3): the nightshift corpus has ~27k UK/EU suppliers. Only a
 * small subset is genuinely relevant to any given product domain (a BESS
 * brief doesn't care about sheet-metal-for-architectural-panels suppliers;
 * a heat-pump brief doesn't care about horticulture LED shops).
 *
 * Tagging each supplier + each product class with the same controlled
 * vocabulary lets Stage 5 filter / boost semantic hits by intersection.
 *
 * Scope: MVP — runs on the supplier's existing `description` field
 * (already ~200 chars per company, in-memory). A later D3-full pass
 * could tag over `deep_website_text` (20× more content) for richer
 * coverage. That's deferred pending measured need.
 *
 * No mutation of nightshift.db. No new SQLite file. Pure in-memory
 * classification at query time (~0.1 ms per supplier on an M1).
 */

export type DomainTag =
  | 'battery_energy_storage'
  | 'power_electronics'
  | 'thermal_management'
  | 'heat_pump_hvac'
  | 'vertical_farm_horticulture'
  | 'fluid_handling'
  | 'cnc_machining'
  | 'sheet_metal'
  | 'additive_manufacturing'
  | 'injection_moulding'
  | 'electronics_pcb'
  | 'wire_harness_cable'
  | 'fasteners_hardware'
  | 'enclosures_chassis'
  | 'sensors_instrumentation'
  | 'automation_plc'
  | 'aerospace'
  | 'medical_device'
  | 'automotive'
  | 'general_engineering'

export const ALL_DOMAIN_TAGS: DomainTag[] = [
  'battery_energy_storage',
  'power_electronics',
  'thermal_management',
  'heat_pump_hvac',
  'vertical_farm_horticulture',
  'fluid_handling',
  'cnc_machining',
  'sheet_metal',
  'additive_manufacturing',
  'injection_moulding',
  'electronics_pcb',
  'wire_harness_cable',
  'fasteners_hardware',
  'enclosures_chassis',
  'sensors_instrumentation',
  'automation_plc',
  'aerospace',
  'medical_device',
  'automotive',
  'general_engineering',
]

/**
 * Each tag's keyword vocabulary. Lowercase, whole-phrase or word-fragment
 * matching. A supplier is tagged if ≥2 distinct vocabulary terms hit
 * (single-term match is too noisy — a random page mentioning "battery"
 * shouldn't tag an aerospace CNC shop as BESS-relevant).
 */
const TAG_VOCABULARY: Record<DomainTag, string[]> = {
  battery_energy_storage: [
    'battery', 'lfp', 'lithium', 'lithium-ion', 'li-ion', 'prismatic', 'catl',
    'bess', 'energy storage', 'grid scale', 'battery pack', 'cell', 'battery module',
    'mwh', 'kwh', 'bms',
  ],
  power_electronics: [
    'inverter', 'pcs', 'power conversion', 'converter', 'rectifier',
    'igbt', 'power module', 'dc-dc', 'mppt', 'grid-tie', 'three-phase',
    'transformer', 'switchgear', 'variable-frequency drive', 'vfd',
  ],
  thermal_management: [
    'heat exchanger', 'cold plate', 'liquid cooling', 'cdu',
    'chiller', 'radiator', 'cooling tower', 'thermal pad', 'thermal paste',
    'heatsink', 'heat sink', 'bphe', 'brazed-plate',
  ],
  heat_pump_hvac: [
    'heat pump', 'r290', 'propane refrigerant', 'scroll compressor',
    'monobloc', 'hvac', 'refrigeration', 'air-to-water', 'air-to-air',
    'evaporator', 'condenser', 'eev', 'expansion valve', 'refrigerant',
  ],
  vertical_farm_horticulture: [
    'horticultural', 'hydroponic', 'aeroponic', 'fertigation', 'nutrient film',
    'growing tray', 'leafy greens', 'led grow', 'grow light', 'vertical farm',
    'indoor farm', 'indoor grow', 'par sensor', 'ec sensor', 'ph sensor',
  ],
  fluid_handling: [
    'pump', 'valve', 'manifold', 'piping', 'hose', 'fitting',
    'flow meter', 'pressure sensor', 'filtration', 'reservoir', 'tank',
    'circulation', 'centrifugal pump', 'peristaltic',
  ],
  cnc_machining: [
    'cnc', 'turning', 'milling', 'lathe', '5-axis', 'precision machining',
    'swiss turning', 'mill-turn', 'as9100', 'machined', 'prototype machining',
    '6061', '7075', 'stainless steel', 'turnparts',
  ],
  sheet_metal: [
    'sheet metal', 'laser cutting', 'press brake', 'stamping', 'punching',
    'folding', 'forming', 'waterjet', 'plasma cut', 'bending',
    'enclosure fabrication',
  ],
  additive_manufacturing: [
    'additive manufacturing', 'sls', 'sla', 'dmls', 'fdm', 'fff',
    '3d print', '3-d printing', 'metal am', 'plastic am', 'polymer am',
    'binder jet', 'mjf', 'nylon pa12', 'peek',
  ],
  injection_moulding: [
    'injection moulding', 'injection molding', 'tool maker', 'tooling',
    'mould', 'mold', 'plastic moulding', 'abs', 'polycarbonate', 'polypropylene',
    'over-mould', 'insert moulding',
  ],
  electronics_pcb: [
    'pcb', 'pcba', 'printed circuit', 'smt', 'surface-mount', 'assembly',
    'electronics manufacturing', 'em services', 'ipc-a-610',
    'microcontroller', 'firmware', 'embedded', 'board house',
  ],
  wire_harness_cable: [
    'wire harness', 'cable assembly', 'wiring loom', 'harness',
    'overmoulded cable', 'cable gland', 'backshell', 'multi-conductor',
    'ribbon cable', 'rf cable', 'power cable',
  ],
  fasteners_hardware: [
    'fastener', 'bolt', 'nut', 'screw', 'washer', 'rivet', 'insert',
    'helicoil', 'clip', 'clamp', 'bracket', 'mount', 'anchor',
  ],
  enclosures_chassis: [
    'enclosure', 'chassis', 'cabinet', 'housing', 'rack',
    '19-inch rack', 'nema', 'ip65', 'ip66', 'ip67',
    'sheet-steel cabinet', 'outdoor enclosure',
  ],
  sensors_instrumentation: [
    'sensor', 'transducer', 'transmitter', 'thermocouple', 'rtd',
    'pressure transducer', 'flow sensor', 'level sensor', 'proximity',
    'load cell', 'encoder', 'accelerometer',
  ],
  automation_plc: [
    'plc', 'programmable logic controller', 'industrial control',
    'scada', 'hmi', 'industrial pc', 'beckhoff', 'siemens s7',
    'allen-bradley', 'mitsubishi plc', 'control panel', 'machine control',
  ],
  aerospace: [
    'aerospace', 'aviation', 'as9100', 'nadcap', 'aircraft', 'space',
    'satellite', 'avionics', 'rotorcraft', 'uav', 'cas 9100',
  ],
  medical_device: [
    'medical device', 'iso 13485', 'mdr', 'mhra', 'cleanroom',
    'sterile packaging', 'implant', 'bioabsorbable', 'biocompatible',
    'fda 510(k)',
  ],
  automotive: [
    'automotive', 'iatf 16949', 'tier 1', 'oem',
    'ev', 'electric vehicle', 'powertrain', 'vehicle cable',
    'automotive connector', 'ppap',
  ],
  general_engineering: [
    'engineering services', 'contract manufacturer', 'contract manufacturing',
    'design engineering', 'product development', 'mechanical engineering',
    'fabrication', 'precision engineering',
  ],
}

// Precompile to lowercase arrays once at module load.
const VOCABULARY_LOWERCASE: Array<[DomainTag, string[]]> = ALL_DOMAIN_TAGS.map(
  tag => [tag, TAG_VOCABULARY[tag].map(v => v.toLowerCase())],
)

/**
 * Classify a text blob into domain tags. A tag fires when at least
 * `minHits` distinct vocabulary terms appear in the text.
 *
 * Default `minHits = 2` — a single-term match is noise. A supplier page
 * that happens to mention "battery" once isn't a battery-pack specialist.
 *
 * Returns tags sorted by hit count descending.
 */
export function classifyDomain(text: string | null | undefined, minHits: number = 2): DomainTag[] {
  if (!text) return []
  const lower = text.toLowerCase()
  const hits: Array<{ tag: DomainTag; count: number }> = []
  for (const [tag, vocab] of VOCABULARY_LOWERCASE) {
    const seen = new Set<string>()
    for (const term of vocab) {
      if (lower.includes(term)) seen.add(term)
    }
    if (seen.size >= minHits) hits.push({ tag, count: seen.size })
  }
  hits.sort((a, b) => b.count - a.count)
  return hits.map(h => h.tag)
}

/**
 * Map a product classifier output (from product-classifier.ts) into the
 * required domain tags the supplier must have.
 *
 * Keeps this function tolerant of the classifier's string shapes
 * (battery_energy_storage, energy_storage, vertical_farm, thermal_system).
 */
export function productClassToDomainTags(productClass: string | null | undefined): DomainTag[] {
  if (!productClass) return []
  const pc = productClass.toLowerCase()
  const out: DomainTag[] = []

  if (pc.includes('battery') || pc.includes('energy_storage')) {
    out.push('battery_energy_storage', 'power_electronics', 'thermal_management')
  }
  if (pc.includes('heat_pump') || pc.includes('thermal') || pc.includes('hvac')) {
    out.push('heat_pump_hvac', 'thermal_management', 'fluid_handling')
  }
  if (pc.includes('farm') || pc.includes('vertical') || pc.includes('horticult')) {
    out.push('vertical_farm_horticulture', 'fluid_handling', 'sensors_instrumentation')
  }
  if (pc.includes('aerospace')) out.push('aerospace')
  if (pc.includes('vehicle') || pc.includes('automotive')) out.push('automotive')
  if (pc.includes('medical')) out.push('medical_device')

  // Always acceptable generalists for any product class
  out.push('general_engineering', 'cnc_machining', 'sheet_metal', 'electronics_pcb')

  // De-duplicate while preserving order
  return Array.from(new Set(out))
}

/**
 * Score a supplier's tags against a product's required tags. Returns a
 * boost multiplier: 1.0 for no intersection, up to 1.3 for strong
 * intersection. Used to re-rank semantic-search hits in Stage 5.
 *
 * The multiplier is deliberately small — semantic similarity remains the
 * primary signal. Tag intersection breaks ties and demotes clearly-wrong
 * matches (e.g. cleanroom medical shop showing up on a BESS fastener query).
 */
export function tagIntersectionBoost(
  supplierTags: DomainTag[],
  requiredTags: DomainTag[],
): number {
  if (supplierTags.length === 0 || requiredTags.length === 0) return 1.0
  const set = new Set(supplierTags)
  let overlap = 0
  for (const t of requiredTags) {
    if (set.has(t)) overlap++
  }
  if (overlap === 0) return 0.85 // gentle demotion for no-match
  // Up to 3 overlapping tags → max 1.30× boost.
  return 1.0 + Math.min(overlap, 3) * 0.10
}
