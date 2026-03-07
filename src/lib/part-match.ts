/**
 * @file part-match.ts — Fuzzy part name matching utilities.
 *
 * @description Normalizes part names for matching between AI-returned names
 * and original BOM names. Shared between server actions and client components.
 */

/**
 * Normalize a part name for fuzzy matching — replaces hyphens/underscores with
 * spaces, strips remaining non-alphanumeric chars, collapses whitespace.
 *
 * @example
 * normalizeForMatch("M5 Socket-Head Cap Screws") // "m5 socket head cap screws"
 * normalizeForMatch("M5 socket-head cap screws (×12, 304 SS)") // "m5 socket head cap screws"
 */
export function normalizeForMatch(name: string): string {
  return name
    .replace(/\s*\(.*?\)\s*/g, " ")   // strip parenthesized content first (qty, specs)
    .replace(/\s*[×x]\s*\d+/gi, "")   // strip quantity markers (×12, x4)
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}
