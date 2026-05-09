/**
 * prompts-vendor-injection.ts — Pattern C, Phase 3a
 *
 * Provides `getVendorContext(productClass)` which returns a formatted text block
 * for injection into the BOM_GENERATION_SYSTEM prompt in 4-bom-cost-suppliers.ts.
 *
 * ─── WHY A SEPARATE FILE (not editing prompts.ts directly) ──────────────────
 * The Phase 3a parallel sonnet agent is editing prompts.ts for Patterns A, B, D, E.
 * To avoid a git merge conflict, this file is standalone. After Phase 3a completes,
 * integrate into 4-bom-cost-suppliers.ts as a one-line import + concatenation.
 *
 * ─── HOW TO WIRE IN (Phase 3 cleanup or Phase 4) ────────────────────────────
 * In src/lib/pdf-engine-v2/stages/4-bom-cost-suppliers.ts:
 *
 *   import { getVendorContext } from '../lib/prompts-vendor-injection'
 *
 *   // Inside the BOM generation call, append to the system prompt:
 *   const systemWithVendors = BOM_GENERATION_SYSTEM + '\n\n' + getVendorContext(productClass)
 *
 * The productClass string must match the keys from product-classifier.ts
 * (e.g. 'energy_storage', 'drone', 'wearable_medical', 'thermal_system',
 *  'ev_charger', 'bioreactor', 'vertical_farm', 'auv', 'edge_ai_server', 'haps').
 */

import {
  VENDOR_CATALOG,
  getVendorEntriesForClass,
  type VendorCatalogEntry,
} from './vendor-catalog'

/**
 * Format a single catalog entry as a compact prompt-friendly string.
 * Intentionally terse — LLM prompt tokens are expensive.
 */
function formatEntry(entry: VendorCatalogEntry): string {
  const lines: string[] = []
  lines.push(`  Part: ${entry.partLabel} [${entry.partType}]`)
  for (const v of entry.vendors) {
    const lead = `${v.typicalLeadWeeks}wk lead`
    const moq = `MOQ ${v.typicalMoqUnits}`
    const notes = v.notes ? ` — ${v.notes}` : ''
    lines.push(`    • ${v.name} (${v.region}) — ${lead}, ${moq}${notes}`)
  }
  if (entry.gapNote) {
    lines.push(`    ⚠ GAP: ${entry.gapNote}`)
  }
  return lines.join('\n')
}

/**
 * Returns a formatted vendor catalog context string for injection into the
 * BOM_GENERATION_SYSTEM prompt. Returns an empty string for unknown product classes
 * (so the prompt is unchanged — no risk of regression for unsupported classes).
 *
 * @param productClass - product class key from product-classifier.ts
 */
export function getVendorContext(productClass: string): string {
  const entries = getVendorEntriesForClass(productClass)

  if (entries.length === 0) {
    // Unsupported product class — return empty string so downstream prompt is unchanged
    return ''
  }

  const body = entries.map(formatEntry).join('\n\n')

  return `
VENDOR CATALOG for product class: ${productClass}
These are verified vendors with typical lead times and minimum order quantities.
For every named-manufacturer-reseller or buy_mechanical_industrial BOM part:
  1. Select the best-matching vendor from the list below, or name an equivalent real vendor.
  2. Always populate regimeRouterResult.supplier with a real company name (never null or "TBC").
  3. Always populate regimeRouterResult.leadTimeWeeks (integer weeks, from catalog or your knowledge).
  4. Always populate regimeRouterResult.moqUnits (integer units, from catalog or your knowledge).
  5. If no catalog match exists, use a real distributor as fallback:
     RS Components, Farnell (Avnet), Digi-Key, Mouser, or Distrelec.
  6. Where a GAP note is shown, explicitly note it in the BOM row notes field.

${body}

END VENDOR CATALOG — use real vendor names only, never invent company names.
`.trim()
}

/**
 * Returns a compact summary of available classes for debugging / prompt auditing.
 * Not used in production flow — useful in tests and CLI diagnostics.
 */
export function listSupportedClasses(): string[] {
  const classes = new Set<string>()
  for (const entry of VENDOR_CATALOG) {
    for (const cls of entry.productClass) {
      classes.add(cls)
    }
  }
  return [...classes].sort()
}
