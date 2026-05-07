/**
 * @file lib/part-regime.ts — Part-regime classifier (C5).
 *
 * For each BOM line, decide its procurement route. Each regime routes to
 * a different corpus / API so we look up the right data source:
 *
 *   buy_electronic            → Farnell (H1c) + Mouser (H1a) + DigiKey (H1b)
 *   buy_mechanical_industrial → H7b mechanical wholesaler scrapers
 *   named_manufacturer_reseller → manufacturer site + UK authorised resellers (H6)
 *   make_custom_fab           → nightshift corpus (existing C1/C2)
 *   service_certification     → H8 curated UK test-house registry
 *
 * Rules-first with LLM fallback for ambiguous rows. Runs synchronously in
 * Stage 4 after the BOM is generated but before cost + supplier stages.
 * No LLM calls in the default path — just keyword patterns and regime
 * indicators from existing part fields.
 */

import type { Part } from '../types'

export type PartRegime =
  | 'buy_electronic'
  | 'buy_mechanical_industrial'
  | 'named_manufacturer_reseller'
  | 'make_custom_fab'
  | 'service_certification'

export interface RegimeClassification {
  regime: PartRegime
  confidence: 'high' | 'medium' | 'low'
  matchedRule: string
  reasoning: string
}

/**
 * Named manufacturers for which we know direct-reseller lookup is a
 * better path than generic distributor search. When a part name starts
 * with or strongly matches one of these, regime = named_manufacturer_reseller.
 */
const NAMED_MANUFACTURERS = [
  // BESS / battery
  { pattern: /\bcatl\b/i,           name: 'CATL' },
  { pattern: /\beve[\s-]?energy\b|\beve ?p\d/i, name: 'EVE Energy' },
  { pattern: /\bbyd\b/i,            name: 'BYD' },
  { pattern: /\bsamsung\s+sdi\b/i,  name: 'Samsung SDI' },
  { pattern: /\blg\s+(chem|energy)\b/i, name: 'LG Energy Solution' },
  // PCS / power electronics
  { pattern: /\bsungrow\b/i,        name: 'Sungrow' },
  { pattern: /\bhuawei\b/i,         name: 'Huawei' },
  { pattern: /\bpower\s*electronics\s+fs\b/i, name: 'Power Electronics' },
  { pattern: /\babb\s+(pcs|terra|react)/i, name: 'ABB' },
  { pattern: /\bschneider\s+(electric|conext)/i, name: 'Schneider Electric' },
  // Heat pump compressors / HVAC
  { pattern: /\bcopeland\b/i,       name: 'Copeland' },
  { pattern: /\bdanfoss\b/i,        name: 'Danfoss' },
  { pattern: /\bbitzer\b/i,         name: 'Bitzer' },
  { pattern: /\bfrascold\b/i,       name: 'Frascold' },
  // Fire suppression
  { pattern: /\bnovec\s*1230\b/i,   name: '3M Novec 1230' },
  { pattern: /\bfike\b/i,           name: 'Fike' },
  // Semi / MCU family makers (strong prefix match only — STM32, ESP32, nRF etc.)
  { pattern: /\bstm32\w*/i,         name: 'STMicroelectronics' },
  { pattern: /\besp32\w*/i,         name: 'Espressif' },
  { pattern: /\bnrf5[123]\w*/i,     name: 'Nordic Semiconductor' },
  { pattern: /\bnxp\s+mcx\b|\blpc\d{3,4}\w*/i, name: 'NXP' },
  { pattern: /\b(kintex|zynq|versal)\w*/i, name: 'AMD Xilinx' },
  // Automation
  { pattern: /\bbeckhoff\b/i,       name: 'Beckhoff' },
  { pattern: /\bsiemens\s+s7|\bsimatic/i, name: 'Siemens' },
  { pattern: /\ballen[\s-]?bradley|\brockwell\b/i, name: 'Allen-Bradley' },
  { pattern: /\bmitsubishi\s+plc\b/i, name: 'Mitsubishi Electric' },
]

/**
 * Electronic part keywords — these trip buy_electronic regime when the
 * part is COTS-ish. Names that match here route to distributor APIs
 * (Farnell, Mouser, DigiKey) for SKU + UK price lookup.
 */
const ELECTRONIC_KEYWORDS = [
  'mcu', 'microcontroller', 'fpga', 'cpld', 'asic', 'ic ',
  'transistor', 'mosfet', 'bjt', 'thyristor', 'triac',
  'igbt', 'diode', 'schottky', 'zener', 'tvs',
  'resistor', 'capacitor', 'inductor', 'ferrite bead', 'transformer',
  'opamp', 'op-amp', 'op amp', 'comparator', 'voltage regulator', 'ldo',
  'adc', 'dac', 'multiplexer', 'mux ', 'demux',
  'led ', 'led,', 'photodiode', 'phototransistor', 'optocoupler', 'isolator',
  'thermistor', 'thermocouple', 'rtd ',
  'connector', 'header', 'receptacle', 'ribbon cable', 'pcb header',
  'crystal', 'oscillator', 'clock', 'buzzer',
  'relay', 'contactor', 'solid-state relay', 'ssr ',
  'fuse', 'circuit breaker', 'mcb ', 'rcd ', 'rcbo',
  'sensor ic', 'accelerometer', 'gyroscope', 'imu ',
  'pressure sensor', 'humidity sensor', 'gas sensor',
  'memory', 'eeprom', 'flash', 'sram', 'dram',
  'ethernet phy', 'wifi module', 'bluetooth module', 'lora module',
  'gps module', 'gnss',
  'power module', 'dc-dc converter', 'pmic', 'mppt',
  'battery charger ic', 'bms chip', 'afe ',
]

/**
 * Mechanical / industrial part keywords — route to mechanical wholesalers
 * (Eriks, Zoro, Applied Industrial) rather than electronic distributors.
 */
const MECHANICAL_KEYWORDS = [
  'bolt', 'screw', 'nut ', 'washer', 'rivet', 'fastener', 'helicoil', 'threaded insert',
  'bearing', 'bushing', 'bush ',
  'gasket', 'o-ring', 'oring', 'seal ',
  'gear', 'pulley', 'sprocket', 'chain ',
  'spring', 'damper', 'shock absorber',
  'valve ', 'ball valve', 'gate valve', 'check valve', 'solenoid valve', 'relief valve',
  'pump ', 'centrifugal pump', 'gear pump', 'peristaltic pump',
  'fitting', 'adapter', 'coupling', 'union ', 'elbow',
  'hose ', 'tubing', 'pipe ', 'manifold',
  'pneumatic', 'hydraulic',
  'linear guide', 'ball screw', 'leadscrew',
  'filter ', 'hepa filter', 'coalescing filter',
  'chassis component', 'enclosure component', 'din rail',
]

/**
 * Service / certification keywords — route to H8 curated registry, not to
 * any distributor or corpus.
 */
const SERVICE_KEYWORDS = [
  'test service', 'testing service', 'certification', 'compliance test',
  'ul 9540a', 'ul 1973', 'en 50604',
  'emc precompliance', 'emc test', 'emi test',
  'g99 witnessing', 'g99 test',
  'mdr clinical evaluation', 'mdr audit',
  'iec 62133', 'iec 62619',
  'cleanroom qualification', 'cleanroom validation',
  'pressure vessel test', 'ped conformity',
  'ce marking file', 'ukca file',
  'iso 13485 audit',
  'fat ', 'factory acceptance test',
  'sat ', 'site acceptance test',
]

function matchAny(haystack: string, needles: string[]): string | null {
  const lower = haystack.toLowerCase()
  for (const n of needles) {
    if (lower.includes(n)) return n
  }
  return null
}

/**
 * Classify a single part into one of the 5 regimes. Rules apply in
 * priority order: named manufacturer first (strongest signal), then
 * service, then fabricated (isPurchased=false), then mechanical, then
 * electronic. Falls back to buy_electronic with low confidence for
 * ambiguous COTS rows.
 */
export function classifyRegime(part: Part): RegimeClassification {
  const name = part.name || ''
  const process = (part.process || '').toLowerCase()
  const isPurchased = part.isPurchased !== false

  // 1. Named manufacturer match (highest priority — overrides generic
  // electronic keyword match)
  for (const mfr of NAMED_MANUFACTURERS) {
    if (mfr.pattern.test(name)) {
      return {
        regime: 'named_manufacturer_reseller',
        confidence: 'high',
        matchedRule: 'named_manufacturer',
        reasoning: `Part name matches named manufacturer '${mfr.name}'. Route to direct reseller lookup.`,
      }
    }
  }

  // 2. Service / certification line
  const serviceHit = matchAny(name, SERVICE_KEYWORDS)
  if (serviceHit || process === 'service' || process === 'certification' || process === 'test') {
    return {
      regime: 'service_certification',
      confidence: 'high',
      matchedRule: 'service_keyword',
      reasoning: `Matches service keyword '${serviceHit || process}'. Route to H8 UK service-provider registry.`,
    }
  }

  // 3. Fabricated part (isPurchased=false signals CNC / sheet / weld /
  // mould / harness assembly to spec). Highest-confidence Make signal.
  if (!isPurchased) {
    return {
      regime: 'make_custom_fab',
      confidence: 'high',
      matchedRule: 'fabricated_part',
      reasoning: `Part is marked isPurchased=false (fabricated to spec). Route to nightshift supplier corpus.`,
    }
  }

  // 4. Mechanical / industrial keywords
  const mechHit = matchAny(name, MECHANICAL_KEYWORDS)
  if (mechHit) {
    return {
      regime: 'buy_mechanical_industrial',
      confidence: 'high',
      matchedRule: 'mechanical_keyword',
      reasoning: `Part matches mechanical keyword '${mechHit.trim()}'. Route to mechanical wholesalers (Eriks/Zoro/AI).`,
    }
  }

  // 5. Electronic keywords
  const elecHit = matchAny(name, ELECTRONIC_KEYWORDS)
  if (elecHit) {
    return {
      regime: 'buy_electronic',
      confidence: 'high',
      matchedRule: 'electronic_keyword',
      reasoning: `Part matches electronic keyword '${elecHit.trim()}'. Route to electronic distributors (Farnell/Mouser/DigiKey).`,
    }
  }

  // 6. Fallback — ambiguous COTS. Default to buy_electronic at low
  // confidence; the aggregator will miss gracefully if no distributor
  // stocks it.
  return {
    regime: 'buy_electronic',
    confidence: 'low',
    matchedRule: 'default_cots',
    reasoning: `No rule matched; defaulting to buy_electronic with low confidence. Consider LLM fallback for ambiguous items.`,
  }
}

export interface RegimeBatchResult {
  counts: Record<PartRegime, number>
  byPartId: Map<string, RegimeClassification>
}

/**
 * Classify every part in a BOM. Returns per-part classifications + a
 * count-by-regime summary for the corpus-coverage diagnostic (H3).
 */
export function classifyAllRegimes(parts: Part[]): RegimeBatchResult {
  const counts: Record<PartRegime, number> = {
    buy_electronic: 0,
    buy_mechanical_industrial: 0,
    named_manufacturer_reseller: 0,
    make_custom_fab: 0,
    service_certification: 0,
  }
  const byPartId = new Map<string, RegimeClassification>()
  for (const p of parts) {
    const key = p.partNumber || p.id || ''
    if (!key) continue
    const c = classifyRegime(p)
    byPartId.set(key, c)
    counts[c.regime]++
  }
  return { counts, byPartId }
}
