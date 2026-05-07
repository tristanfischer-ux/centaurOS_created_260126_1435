/**
 * @file lib/regime-router.ts — Stage 5 regime router (H2).
 *
 * Takes a BOM line (with its regime from C5) and routes it to the correct
 * lookup path: distributor API for electronic parts, corpus for fabricated
 * / mechanical / named-manufacturer, registry for services.
 *
 * This is the glue between the C5 regime classifier and the H1d distributor
 * aggregator. Without it, Stage 5 does a single corpus lookup for every
 * part regardless of regime.
 */

import type { PartRegime } from './part-regime'
import { findSkuForPart } from './distributors/index'

export interface RegimeLookupResult {
  regime: PartRegime
  source: 'distributor' | 'corpus' | 'registry' | 'none'
  sku?: string
  priceGbp?: number
  supplier?: string
  datasheetUrl?: string
  stockQty?: number
  leadTimeWeeks?: number
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  notes: string
}

/**
 * Route a single BOM line to the correct lookup path based on its
 * procurement regime. Returns a normalised result that Stage 5 can
 * consume regardless of which upstream data source resolved it.
 */
export async function routePartLookup(
  part: { name: string; partNumber?: string; regime: PartRegime; sourceModuleId?: string },
): Promise<RegimeLookupResult> {
  switch (part.regime) {
    case 'buy_electronic':
      return routeElectronic(part)

    case 'buy_mechanical_industrial':
      return routeCorpus(part, 'LOW', 'Mechanical wholesaler scrapers (H7b) not built — corpus fallback')

    case 'named_manufacturer_reseller':
      return routeCorpus(part, 'MEDIUM', 'Manufacturer registry (H6) not built — corpus fallback')

    case 'make_custom_fab':
      return routeCorpus(part, 'HIGH', 'Corpus lookup via nightshift')

    case 'service_certification':
      return {
        regime: 'service_certification',
        source: 'registry',
        confidence: 'LOW',
        notes: 'Service provider registry not yet implemented — use manual lookup',
      }
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Attempt a live distributor lookup via H1d. If the aggregator finds a
 * SKU, return price + stock + datasheet. If it misses (or throws because
 * API keys are absent), fall back to corpus with LOW confidence.
 */
async function routeElectronic(
  part: { name: string; partNumber?: string; sourceModuleId?: string },
): Promise<RegimeLookupResult> {
  const mpn = part.partNumber || part.name
  try {
    const result = await findSkuForPart(mpn)
    if (result) {
      const best = result.best
      return {
        regime: 'buy_electronic',
        source: 'distributor',
        sku: best.mpn,
        priceGbp: result.qty1GBP ?? undefined,
        supplier: best.source,
        datasheetUrl: best.datasheetUrl ?? undefined,
        stockQty: best.stockUK ?? undefined,
        confidence: 'HIGH',
        notes: `Found via ${best.source} (${result.alternates.length} alternates)`,
      }
    }
  } catch {
    // Distributor API failed (missing key, network error, rate limit).
    // Fall through to corpus fallback.
  }

  // No distributor match — fall back to corpus
  return {
    regime: 'buy_electronic',
    source: 'corpus',
    confidence: 'LOW',
    notes: 'Distributor lookup returned no match — falling back to corpus',
  }
}

/**
 * Corpus lookup placeholder. The actual corpus integration already exists
 * in Stage 5; this function only makes the routing decision. When the
 * relevant scrapers (H6, H7b) are built, they will replace the corpus
 * path for their respective regimes.
 */
function routeCorpus(
  part: { name: string; partNumber?: string; regime: PartRegime; sourceModuleId?: string },
  confidence: 'HIGH' | 'MEDIUM' | 'LOW',
  notes: string,
): RegimeLookupResult {
  // Placeholder — the real corpus query happens in Stage 5's existing
  // lookup pipeline. This return value signals which regime produced it
  // and the confidence level so the renderer can annotate accordingly.
  return {
    regime: part.regime,
    source: 'corpus',
    confidence,
    notes,
  }
}
