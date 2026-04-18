/**
 * @file frequency.ts — Pure date-math helpers for scheduled-report delivery.
 *
 * @description Extracted from src/actions/scheduled-reports.ts because a
 * "use server" file may only export async functions. The synchronous
 * computeNextRunAt broke the Vercel build (Turbopack: "Server Actions must
 * be async functions"). Keeping the date math here, importing it from both
 * the server action file and the cron route.
 */

// GOTCHA: scheduled_reports.frequency is a plain text column with a CHECK
// constraint, not a Postgres enum — so there's no Database['Enums']
// counterpart to lift. Hardcode the union to match the CHECK values from
// migration 20260418200000_scheduled_reports.sql.
export type ScheduledReportFrequency = 'weekly' | 'monthly'

// INTENT: Delivery anchored to 09:00 UTC — founder in London gets 9/10am depending
// on BST, founder in SF gets 1/2am. Configurable per-schedule delivery hour is a
// future upgrade (add a delivery_hour_utc column and thread it through).
export const DELIVERY_HOUR_UTC = 9

export function daysInMonth(year: number, monthZeroBased: number): number {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate()
}

/**
 * Given a delivery frequency + anchor day, compute the next UTC timestamp at
 * which the scheduled report should fire. Pure function, no side-effects.
 */
export function computeNextRunAt(
  frequency: ScheduledReportFrequency,
  dayOfWeek: number | undefined,
  dayOfMonth: number | undefined,
  from: Date = new Date(),
): Date {
  const nowUtc = new Date(Date.UTC(
    from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(),
    from.getUTCHours(), from.getUTCMinutes(),
  ))

  if (frequency === 'weekly') {
    const targetDow = dayOfWeek ?? 1
    const todayDow = nowUtc.getUTCDay()
    let daysAhead = (targetDow - todayDow + 7) % 7
    if (daysAhead === 0 && nowUtc.getUTCHours() >= DELIVERY_HOUR_UTC) daysAhead = 7
    return new Date(Date.UTC(
      nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate() + daysAhead,
      DELIVERY_HOUR_UTC, 0, 0, 0,
    ))
  }

  // monthly
  const targetDom = dayOfMonth ?? 1
  let year = nowUtc.getUTCFullYear()
  let month = nowUtc.getUTCMonth()
  const clamp = (y: number, m: number, d: number) => Math.min(d, daysInMonth(y, m))
  let day = clamp(year, month, targetDom)
  const thisMonthMs = Date.UTC(year, month, day, DELIVERY_HOUR_UTC, 0, 0, 0)
  if (thisMonthMs <= nowUtc.getTime()) {
    month += 1
    if (month > 11) { month = 0; year += 1 }
    day = clamp(year, month, targetDom)
  }
  return new Date(Date.UTC(year, month, day, DELIVERY_HOUR_UTC, 0, 0, 0))
}
