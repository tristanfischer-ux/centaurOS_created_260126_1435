/**
 * @file supplier-lead-time.ts — Pure lead-time buffer computation.
 *
 * @description Shared between the server action file (for server-side use)
 * and client components (shortlist-view). No server-only imports.
 *
 * Exported separately so client components can import without pulling in
 * the "use server" file boundary.
 */

export interface LeadTimeBuffer {
  /** Whole weeks from today to the launch date. */
  weeksUntilLaunch: number
  /** Supplier's lead time expressed in whole weeks (ceiling). */
  leadTimeWeeks: number
  /** weeksUntilLaunch minus leadTimeWeeks. Can be negative. */
  bufferWeeks: number
  /**
   * ok       >= 4 buffer weeks
   * warning  >= 2 and < 4 buffer weeks
   * critical < 2 buffer weeks (including negative)
   */
  riskLevel: "ok" | "warning" | "critical"
}

/**
 * Compute lead-time buffer for a supplier on a project.
 *
 * Returns null when:
 *   - targetLaunchDate is null/undefined (not set on the project)
 *   - leadTimeDays is null/undefined (no quotes logged for this supplier)
 */
export function computeLeadTimeBuffer(input: {
  targetLaunchDate: string | null | undefined
  leadTimeDays: number | null | undefined
}): LeadTimeBuffer | null {
  if (!input.targetLaunchDate || input.leadTimeDays == null) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const launch = new Date(input.targetLaunchDate)
  launch.setHours(0, 0, 0, 0)

  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const weeksUntilLaunch = Math.floor(
    (launch.getTime() - today.getTime()) / msPerWeek
  )
  const leadTimeWeeks = Math.ceil(input.leadTimeDays / 7)
  const bufferWeeks = weeksUntilLaunch - leadTimeWeeks

  const riskLevel: "ok" | "warning" | "critical" =
    bufferWeeks >= 4 ? "ok" : bufferWeeks >= 2 ? "warning" : "critical"

  return { weeksUntilLaunch, leadTimeWeeks, bufferWeeks, riskLevel }
}
