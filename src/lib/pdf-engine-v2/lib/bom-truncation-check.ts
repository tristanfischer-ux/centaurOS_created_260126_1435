// INTENT: Detect truncated BOM output by comparing part counts against
// known floors per product class.  When an LLM finishes mid-generation
// (token limit, network drop, etc.) the resulting BOM can be
// suspiciously short.  This module catches that deterministically so
// the pipeline can re-prompt rather than shipping a skeleton BOM.

const MIN_PARTS_BY_CLASS: Record<string, number> = {
  energy_storage: 15,
  thermal_system: 12,
  drone: 10,
  auv: 12,
  haps: 15,
  ev_charger: 10,
  bioreactor: 10,
  edge_ai_server: 8,
  wearable_medical: 8,
  pcb_assembly: 6,
  // Generic minimum for unknown classes
  unknown: 5,
}

interface TruncationResult {
  isTruncated: boolean
  expected: number
  actual: number
  message: string
}

/**
 * Check whether a BOM's part count falls below the known floor for its
 * product class.  A truncated BOM is one where `partCount` is strictly
 * less than the class minimum.
 *
 * If `productClass` is not in the map the "unknown" floor (5 parts) is used.
 */
export function checkBomTruncation(
  productClass: string,
  partCount: number,
): TruncationResult {
  const normalised = productClass.trim().toLowerCase().replace(/[\s-]+/g, '_')
  const expected = MIN_PARTS_BY_CLASS[normalised] ?? MIN_PARTS_BY_CLASS['unknown']
  const isTruncated = partCount < expected

  return {
    isTruncated,
    expected,
    actual: partCount,
    message: isTruncated
      ? `BOM has ${partCount} parts but ${expected} expected for ${normalised} — possible truncation during generation.`
      : `BOM has ${partCount} parts, meets minimum of ${expected} for ${normalised}.`,
  }
}
