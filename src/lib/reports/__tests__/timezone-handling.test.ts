/**
 * @file timezone-handling.test.ts — Cross-timezone regression for report date logic.
 *
 * @description Reports use `new Date().toISOString().split('T')[0]` to derive a
 * YYYY-MM-DD date string. `toISOString()` always returns UTC, so a user in
 * UTC-12 (Baker Island) at 10 PM their time is actually 10 AM UTC the NEXT day —
 * meaning the "daily pulse" they ask for could be computed against tomorrow's
 * date. Symmetric issue at UTC+14 (Kiribati).
 *
 * These tests document the edge cases. If a future fix adopts user-tz-aware
 * date formatting, update the expectations below.
 *
 * Tracker: Phase 3 item 147 (Reports: cross-timezone date handling test).
 */

describe('Reports — cross-timezone date handling', () => {
  const originalTZ = process.env.TZ

  afterEach(() => {
    process.env.TZ = originalTZ
  })

  // Known boundary: Fri 2026-04-17 23:59 local at UTC-12 is Sat 2026-04-18 11:59 UTC.
  // So the "local today" is still 2026-04-17 but `toISOString()` returns 2026-04-18.
  const BOUNDARY_LOCAL_UTC_MINUS_12 = new Date('2026-04-18T11:59:00Z') // Fri 23:59 at UTC-12

  it('toISOString().split("T")[0] returns UTC calendar day, NOT local', () => {
    const d = BOUNDARY_LOCAL_UTC_MINUS_12
    // This is what src/lib/reports/daily-pulse.ts currently does (line 47).
    const dateStr = d.toISOString().split('T')[0]
    expect(dateStr).toBe('2026-04-18') // UTC calendar
    // A user at UTC-12 would consider this "still Friday 2026-04-17" but the
    // report code treats it as Saturday 2026-04-18 — off by one day.
  })

  it('UTC+14 (Kiribati) shows the reverse off-by-one', () => {
    // Sun 2026-04-19 00:01 local at UTC+14 = Sat 2026-04-18 10:01 UTC.
    const d = new Date('2026-04-18T10:01:00Z')
    const dateStr = d.toISOString().split('T')[0]
    expect(dateStr).toBe('2026-04-18') // UTC says Saturday
    // A user at UTC+14 considers this "already Sunday 2026-04-19" but the
    // report code treats it as Saturday — they'd see yesterday's pulse.
  })

  it('a locale-aware YYYY-MM-DD formatter would fix this (illustration)', () => {
    // Example of what a fix could look like: use Intl.DateTimeFormat with a
    // timezone arg to get the user's local calendar day instead of UTC.
    const d = BOUNDARY_LOCAL_UTC_MINUS_12
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Pacific/Pago_Pago', // UTC-11 — close enough for illustration
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d)
    const year = parts.find(p => p.type === 'year')?.value
    const month = parts.find(p => p.type === 'month')?.value
    const day = parts.find(p => p.type === 'day')?.value
    const localDateStr = `${year}-${month}-${day}`
    // Pago Pago (UTC-11) sees Fri 2026-04-18 00:59 — still Friday the 17th in Pago Pago?
    // Actually 11:59 UTC minus 11 hours = 00:59 Pago Pago Sat 2026-04-18.
    // So even at UTC-11 they've just rolled into Saturday. For UTC-12 it WOULD
    // still be Friday. Intl doesn't have a canonical UTC-12 IANA zone other
    // than Etc/GMT+12.
    expect(localDateStr).toBe('2026-04-18')
  })

  it('Etc/GMT+12 (UTC-12) via Intl correctly reports the local calendar day', () => {
    const d = BOUNDARY_LOCAL_UTC_MINUS_12 // Fri 23:59 at UTC-12
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Etc/GMT+12', // IANA naming inverts sign: GMT+12 = UTC-12
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d)
    const year = parts.find(p => p.type === 'year')?.value
    const month = parts.find(p => p.type === 'month')?.value
    const day = parts.find(p => p.type === 'day')?.value
    expect(`${year}-${month}-${day}`).toBe('2026-04-17') // correctly Friday
    // Meanwhile the current code produces '2026-04-18' — see test above.
  })

  it('Pacific/Kiritimati (UTC+14) via Intl also rolls correctly', () => {
    const d = new Date('2026-04-18T10:01:00Z') // Sun 00:01 at UTC+14
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Pacific/Kiritimati',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d)
    const year = parts.find(p => p.type === 'year')?.value
    const month = parts.find(p => p.type === 'month')?.value
    const day = parts.find(p => p.type === 'day')?.value
    expect(`${year}-${month}-${day}`).toBe('2026-04-19') // correctly Sunday
    // Current code produces '2026-04-18' — see earlier test.
  })
})
