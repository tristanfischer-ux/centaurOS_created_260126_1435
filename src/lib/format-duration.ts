/**
 * @file format-duration.ts — Pure utility for formatting minutes as "Xh Ym".
 *
 * @description Extracted from time-entry-card.tsx so non-React modules can
 * import it without pulling in the entire component tree.
 */

/** Format minutes as "Xh Ym". Returns "0h" for 0, NaN, Infinity. */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0h'
  const rounded = Math.floor(minutes) // guard fractional inputs
  const h = Math.floor(rounded / 60)
  const m = rounded % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
