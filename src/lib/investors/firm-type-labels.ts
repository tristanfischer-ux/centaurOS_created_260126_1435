/**
 * @file firm-type-labels.ts
 *
 * @description Canonical mapping from raw `marketplace_listings.attributes.firm_type`
 * slugs to fully spelled-out human display labels.
 *
 * INTENT: raw `firm_type` values have drifted across imports — uppercase slugs
 * (`GOVT_GRANT`), legacy abbreviations (`CVC`, `VC`, `PE`), and mixed-case
 * human-readable strings co-exist for the same concept. This module is the
 * single source of truth for converting any of those to the user-facing
 * label, so we do not leak `GOVT_GRANT` into the type breakdown chart, do
 * not double-count `Government Grant` + `GOVT_GRANT`, and do not break the
 * "no acronyms in user-facing copy" rule.
 *
 * @related src/actions/investors.ts — the server-side aggregation also reads
 *          this map via a private copy of the table; keep them in sync.
 */

const FIRM_TYPE_DISPLAY_MAP: Readonly<Record<string, string>> = {
  GOVT_GRANT: 'Government Grant',
  'Govt Grant': 'Government Grant',
  CVC: 'Corporate Venture Capital',
  'Corporate VC': 'Corporate Venture Capital',
  VC: 'Venture Capital',
  'VC/PE': 'Venture Capital and Private Equity',
  PE: 'Private Equity',
  EIS: 'Enterprise Investment Scheme Fund',
  'EIS Fund': 'Enterprise Investment Scheme Fund',
  SEIS: 'Seed Enterprise Investment Scheme Fund',
  'SEIS Fund': 'Seed Enterprise Investment Scheme Fund',
}

/**
 * Normalise a raw firm_type string to its canonical display label. Falls
 * through to the input untouched if no override is registered.
 */
export function normaliseFirmTypeLabel(raw: string | null | undefined): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  return FIRM_TYPE_DISPLAY_MAP[trimmed] ?? trimmed
}
