/**
 * @file sector-boost.ts — score-blend helper for investor + supplier semantic search
 *
 * @description Tristan 2026-04-27 red-team round 2: medical-CGM founders were
 * getting aerospace flight computers as top supplier matches because the
 * pgvector embedding under-weights sector context relative to noun phrases
 * like "sensor". Investor results for the same persona returned an
 * e-commerce / luxury-beauty accelerator at #1 for similar reasons.
 *
 * This module supplies a small post-RPC re-rank: when the foundry has a
 * sector set, listings whose own sector tags contain any matching keyword
 * receive a fixed similarity boost. The boost is intentionally small (0.10
 * cosine) so that a strong cross-sector semantic match (e.g. 0.65 same
 * description but adjacent sector) still beats a weak same-sector hit
 * (e.g. 0.42 with the boost = 0.52). Out-of-sector matches still surface;
 * they just sit below same-sector matches at parity.
 *
 * Allowed `foundries.sector` enum values (from the DB CHECK constraint):
 *   aerospace | agriculture | automotive | construction |
 *   consumer_electronics | defence | energy | food_processing |
 *   logistics | manufacturing | marine | medical | mining |
 *   robotics | other.
 *
 * Listing tag arrays use free text (e.g. attributes.industries on
 * marketplace_listings, attributes.sectors on Finance listings). The
 * keyword map below covers the common variants; case-insensitive
 * substring match handles minor spellings ("MedTech" hits "medical",
 * "Med Tech" also hits, "BioTech" hits).
 */

const BOOST_AMOUNT = 0.10

/** Map foundry sector enum → list of keywords (lowercase) that should
 *  count as a sector match if found in any listing tag/sector string. */
const SECTOR_KEYWORDS: Record<string, ReadonlyArray<string>> = {
  aerospace:            ["aerospace", "aviation", "drone", "uav", "satellite", "space"],
  agriculture:          ["agriculture", "agritech", "agtech", "farming", "horticulture", "crop", "agri"],
  automotive:           ["automotive", "mobility", "vehicle", "transport", "ev"],
  construction:         ["construction", "building", "infrastructure"],
  consumer_electronics: ["consumer electronics", "consumer hardware", "electronics", "wearable", "iot"],
  defence:              ["defence", "defense", "military", "security"],
  energy:               ["energy", "climate", "clean tech", "cleantech", "battery", "solar", "wind", "renewable", "power", "grid"],
  food_processing:      ["food", "beverage", "food processing", "agri-food"],
  logistics:            ["logistics", "supply chain", "shipping", "freight", "warehouse"],
  manufacturing:        ["manufacturing", "engineering", "industrial", "factory", "fabrication", "machining"],
  marine:               ["marine", "maritime", "ocean", "shipbuilding"],
  medical:              ["medical", "medtech", "med-tech", "med tech", "healthcare", "biotech", "biotechnology", "life science", "pharmaceutical", "pharma", "diagnostic", "therapeutic", "device"],
  mining:               ["mining", "extraction", "minerals", "natural resources"],
  robotics:             ["robotics", "automation"],
  other:                [],
}

/**
 * Returns true when any of the foundry sector's keywords appears
 * (case-insensitive substring) in any of the listing's tag strings.
 *
 * @param foundrySector — value from foundries.sector (one of the
 *   enum values; null/undefined disables the boost)
 * @param listingTags  — array of free-text sector / industry tags
 *   from the listing (e.g. attributes.industries for suppliers,
 *   attributes.sectors for investors). Falsy entries are skipped.
 */
export function listingMatchesSector(
  foundrySector: string | null | undefined,
  listingTags: ReadonlyArray<string | null | undefined> | null | undefined,
): boolean {
  if (!foundrySector || !listingTags) return false
  const keywords = SECTOR_KEYWORDS[foundrySector] ?? []
  if (keywords.length === 0) return false
  for (const tag of listingTags) {
    if (!tag) continue
    const lower = tag.toLowerCase()
    for (const kw of keywords) {
      if (lower.includes(kw)) return true
    }
  }
  return false
}

/**
 * Apply the sector boost to a single similarity score.
 * @returns boosted similarity (capped at 1.0).
 */
export function applySectorBoost(
  similarity: number,
  foundrySector: string | null | undefined,
  listingTags: ReadonlyArray<string | null | undefined> | null | undefined,
): number {
  if (!listingMatchesSector(foundrySector, listingTags)) return similarity
  return Math.min(1.0, similarity + BOOST_AMOUNT)
}

export const SECTOR_BOOST_AMOUNT = BOOST_AMOUNT
