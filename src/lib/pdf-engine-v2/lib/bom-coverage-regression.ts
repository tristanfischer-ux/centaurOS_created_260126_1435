/**
 * @file lib/bom-coverage-regression.ts — H5 synthetic-BOM coverage regression harness.
 *
 * After any H-phase change (distributor APIs, corpus expansion), verify that
 * BOM parts still get classified and matched correctly. Each product class
 * has a canonical list of representative parts; this harness classifies every
 * one via C5 and checks whether the downstream data sources (distributor
 * aggregator, nightshift corpus) would resolve them.
 *
 * The harness is designed for offline / test use — it uses static mock data
 * for distributor and corpus matching rather than hitting live APIs.
 */

import { classifyRegime } from './part-regime'
import type { PartRegime, RegimeClassification } from './part-regime'

// ─── Canonical BOMs ──────────────────────────────────────────────────────────

/**
 * Representative part names per product class. These are the parts that the
 * pipeline MUST classify and match — if coverage drops after an H-phase
 * change, one of these parts regressed.
 */
export const CANONICAL_BOMS: Record<string, string[]> = {
  energy_storage: [
    'LFP prismatic cell 280Ah', 'Battery Management System', 'DC busbar',
    'Fire suppression system', 'Liquid cooling pump', 'Power conversion system',
    'Container enclosure', 'HVAC unit', 'Cable gland', 'Fuse 250A',
  ],
  thermal_system: [
    'Scroll compressor', 'Plate heat exchanger', 'Expansion vessel',
    'Electronic expansion valve', 'Refrigerant R290', 'Fan coil unit',
    'Copper pipe fittings', 'Vibration isolator',
  ],
  drone: [
    'Brushless outrunner motor', 'ESC 30A', 'Carbon fibre frame',
    'LiPo battery 4S', 'Flight controller', 'GPS module',
    'Propeller 10 inch', 'Camera gimbal',
  ],
  ev_charger: [
    'DC power module 25kW', 'CCS2 connector', 'HMI touchscreen',
    'G99 protection relay', 'Contactor 400A', 'Power distribution board',
    'Liquid cooled cable', '4G modem module',
  ],
}

// ─── Mock match tables ───────────────────────────────────────────────────────

/**
 * Parts that the H1d distributor aggregator (Farnell + Mouser + DigiKey)
 * would resolve. In production this comes from live API calls; here it is
 * a static set keyed by lowercased part name substring for deterministic
 * regression testing.
 */
const MOCK_DISTRIBUTOR_MATCHES = new Set([
  'fuse', 'contactor', 'relay', 'esc', 'gps module',
  'modem', 'hmi', 'thermistor', 'bms',
])

/**
 * Parts that the nightshift corpus would match for custom fabrication.
 */
const MOCK_CORPUS_MATCHES = new Set([
  'frame', 'enclosure', 'cable gland', 'pipe fittings',
  'vibration isolator', 'propeller', 'gimbal', 'busbar',
])

/**
 * Parts that the service / certification registry would match.
 */
const MOCK_SERVICE_MATCHES = new Set([
  'g99', 'certification', 'compliance', 'test service',
])

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CoverageResult {
  productClass: string
  totalParts: number
  distributorMatches: number
  fabricatorMatches: number
  serviceMatches: number
  unmatched: number
  coveragePercent: number
  details: Array<{
    partName: string
    regime: PartRegime
    matched: boolean
    source: string
  }>
}

export interface CoverageReport {
  timestamp: string
  results: CoverageResult[]
  overallCoveragePercent: number
}

// ─── Mock match checkers ─────────────────────────────────────────────────────

function mockDistributorWouldMatch(partName: string): boolean {
  const lower = partName.toLowerCase()
  for (const keyword of MOCK_DISTRIBUTOR_MATCHES) {
    if (lower.includes(keyword)) return true
  }
  return false
}

function mockCorpusWouldMatch(partName: string): boolean {
  const lower = partName.toLowerCase()
  for (const keyword of MOCK_CORPUS_MATCHES) {
    if (lower.includes(keyword)) return true
  }
  return false
}

function mockServiceWouldMatch(partName: string): boolean {
  const lower = partName.toLowerCase()
  for (const keyword of MOCK_SERVICE_MATCHES) {
    if (lower.includes(keyword)) return true
  }
  return false
}

// ─── Core function ───────────────────────────────────────────────────────────

/**
 * Run a coverage regression across all canonical product classes.
 *
 * For each part:
 *  1. Classify via C5 (`classifyRegime`)
 *  2. Check whether the appropriate downstream source would match it
 *     (distributor for buy_electronic, corpus for make_custom_fab, etc.)
 *
 * Returns a CoverageReport with per-class and overall percentages.
 */
export function runCoverageRegression(
  matchCheckers?: {
    distributor?: (name: string) => boolean
    corpus?: (name: string) => boolean
    service?: (name: string) => boolean
  },
): CoverageReport {
  const distributorCheck = matchCheckers?.distributor ?? mockDistributorWouldMatch
  const corpusCheck = matchCheckers?.corpus ?? mockCorpusWouldMatch
  const serviceCheck = matchCheckers?.service ?? mockServiceWouldMatch

  const results: CoverageResult[] = []

  for (const [productClass, partNames] of Object.entries(CANONICAL_BOMS)) {
    let distributorMatches = 0
    let fabricatorMatches = 0
    let serviceMatches = 0
    let unmatched = 0

    const details: CoverageResult['details'] = []

    for (const partName of partNames) {
      // Build a minimal Part for C5 classification
      const part = { partNumber: '', name: partName, isPurchased: true, process: '', material: '', sourceModuleId: '' }
      const classification: RegimeClassification = classifyRegime(part)

      let matched = false
      let source = 'none'

      switch (classification.regime) {
        case 'buy_electronic':
        case 'buy_mechanical_industrial':
        case 'named_manufacturer_reseller':
          if (distributorCheck(partName)) {
            matched = true
            source = 'distributor'
            distributorMatches++
          }
          break
        case 'make_custom_fab':
          if (corpusCheck(partName)) {
            matched = true
            source = 'corpus'
            fabricatorMatches++
          }
          break
        case 'service_certification':
          if (serviceCheck(partName)) {
            matched = true
            source = 'registry'
            serviceMatches++
          }
          break
      }

      if (!matched) {
        unmatched++
      }

      details.push({
        partName,
        regime: classification.regime,
        matched,
        source,
      })
    }

    const totalParts = partNames.length
    const matchedTotal = distributorMatches + fabricatorMatches + serviceMatches
    const coveragePercent = totalParts > 0
      ? Math.round((matchedTotal / totalParts) * 100)
      : 0

    results.push({
      productClass,
      totalParts,
      distributorMatches,
      fabricatorMatches,
      serviceMatches,
      unmatched,
      coveragePercent,
      details,
    })
  }

  const totalPartsAll = results.reduce((sum, r) => sum + r.totalParts, 0)
  const matchedAll = results.reduce(
    (sum, r) => sum + r.distributorMatches + r.fabricatorMatches + r.serviceMatches,
    0,
  )
  const overallCoveragePercent = totalPartsAll > 0
    ? Math.round((matchedAll / totalPartsAll) * 100)
    : 0

  return {
    timestamp: new Date().toISOString(),
    results,
    overallCoveragePercent,
  }
}
