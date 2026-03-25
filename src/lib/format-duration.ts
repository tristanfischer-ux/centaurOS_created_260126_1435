/**
 * @file format-duration.ts — Pure utility for formatting minutes as "Xh Ym".
 *
 * @description Extracted from time-entry-card.tsx so non-React modules can
 * import it without pulling in the entire component tree.
 */

/** Format minutes as "Xh Ym". Returns "0h" for 0. */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0h'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
