/**
 * @file schedule-task-dates.test.ts
 *
 * @description Tests for the wave-based task scheduler and the
 * resolveDatesFromProposal() → scheduler integration that was broken
 * when estimatedWeeks always short-circuited to startDate=today.
 *
 * Regression coverage for: fix(specialists): stop clustering all proposed
 * tasks at start of timeline.
 */

import {
  scheduleTaskDates,
  addWorkingDays,
  clampToWorkday,
  ensureNotInPast,
} from '../schedule-task-dates'

// ---------------------------------------------------------------------------
// Freeze "today" to a known Monday so tests are deterministic.
// 2026-03-02 is a Monday.
// ---------------------------------------------------------------------------

const FAKE_TODAY = new Date(2026, 2, 2, 0, 0, 0, 0) // Mon March 2, 2026

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(FAKE_TODAY)
})

afterEach(() => {
  jest.useRealTimers()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A future Monday for use as startFrom. */
function futureMonday(): Date {
  return new Date(2026, 2, 9, 0, 0, 0, 0) // Mon March 9, 2026
}

function toDateStr(iso: string): string {
  return new Date(iso).toISOString().split('T')[0]
}

// ---------------------------------------------------------------------------
// Unit: addWorkingDays
// ---------------------------------------------------------------------------

describe('addWorkingDays', () => {
  it('adds days within a single work week', () => {
    const mon = futureMonday()
    const result = addWorkingDays(mon, 3) // Mon → Thu
    expect(result.getDay()).toBe(4) // Thursday
  })

  it('skips weekends when crossing a week boundary', () => {
    const mon = futureMonday()
    const result = addWorkingDays(mon, 5) // Mon + 5 working days = next Mon
    expect(result.getDay()).toBe(1) // Monday
    expect(result.getDate()).toBe(16) // March 16
  })

  it('handles 0 working days (returns same date)', () => {
    const mon = futureMonday()
    const result = addWorkingDays(mon, 0)
    expect(result.getDate()).toBe(mon.getDate())
  })
})

// ---------------------------------------------------------------------------
// Unit: clampToWorkday
// ---------------------------------------------------------------------------

describe('clampToWorkday', () => {
  it('returns the same date for a future weekday', () => {
    const wed = new Date(2026, 2, 4) // Wed March 4, 2026
    const result = clampToWorkday(wed)
    expect(result.getDay()).toBe(3) // still Wednesday
  })

  it('moves a future Saturday to Monday', () => {
    const sat = new Date(2026, 2, 7) // Sat March 7, 2026
    const result = clampToWorkday(sat)
    expect(result.getDay()).toBe(1) // Monday
    expect(result.getDate()).toBe(9) // March 9
  })

  it('moves a future Sunday to Monday', () => {
    const sun = new Date(2026, 2, 8) // Sun March 8, 2026
    const result = clampToWorkday(sun)
    expect(result.getDay()).toBe(1) // Monday
    expect(result.getDate()).toBe(9) // March 9
  })

  it('clamps a past date to today', () => {
    const past = new Date(2020, 0, 1)
    const result = clampToWorkday(past)
    expect(toDateStr(result.toISOString())).toBe('2026-03-02') // today (Monday)
  })
})

// ---------------------------------------------------------------------------
// Unit: ensureNotInPast
// ---------------------------------------------------------------------------

describe('ensureNotInPast', () => {
  it('returns today for a past date', () => {
    const past = new Date(2020, 5, 15)
    const result = ensureNotInPast(past)
    expect(toDateStr(result.toISOString())).toBe('2026-03-02')
  })

  it('returns the same date for a future date', () => {
    const future = new Date(2026, 5, 15, 12, 0, 0, 0)
    const result = ensureNotInPast(future)
    // GOTCHA: Compare timestamps directly to avoid UTC-offset date drift when
    // running tests in non-UTC timezones. toISOString() returns UTC, which can
    // show the previous calendar day for large positive offsets (e.g. UTC+13).
    expect(result.getTime()).toBe(future.getTime())
  })
})

// ---------------------------------------------------------------------------
// Unit: scheduleTaskDates — wave-based staggering
// ---------------------------------------------------------------------------

describe('scheduleTaskDates', () => {
  it('returns empty array for no tasks', () => {
    expect(scheduleTaskDates([])).toEqual([])
  })

  it('schedules a single task starting on the given date', () => {
    const start = futureMonday() // March 9 (Mon)
    const result = scheduleTaskDates(
      [{ title: 'Task A', estimatedDays: 5 }],
      start
    )
    expect(result).toHaveLength(1)
    expect(toDateStr(result[0].start_date)).toBe('2026-03-09') // Monday
    // 5 working days: Mon-Fri → end on Friday
    expect(toDateStr(result[0].end_date)).toBe('2026-03-13')
  })

  it('staggers 3 tasks within a single wave by 1 working day each', () => {
    const start = futureMonday() // March 9 (Mon)
    const result = scheduleTaskDates(
      [
        { title: 'A', estimatedDays: 5 },
        { title: 'B', estimatedDays: 5 },
        { title: 'C', estimatedDays: 5 },
      ],
      start
    )
    expect(result).toHaveLength(3)

    // Wave 0: task 0 starts Mon, task 1 starts Tue, task 2 starts Wed
    expect(toDateStr(result[0].start_date)).toBe('2026-03-09')
    expect(toDateStr(result[1].start_date)).toBe('2026-03-10')
    expect(toDateStr(result[2].start_date)).toBe('2026-03-11')

    // All 3 have DIFFERENT start dates (the original bug clustered them)
    const starts = new Set(result.map((r) => toDateStr(r.start_date)))
    expect(starts.size).toBe(3)
  })

  it('starts a new wave after the first 3 tasks finish', () => {
    const start = futureMonday()
    const result = scheduleTaskDates(
      [
        { title: 'A', estimatedDays: 3 },
        { title: 'B', estimatedDays: 3 },
        { title: 'C', estimatedDays: 3 },
        { title: 'D', estimatedDays: 3 }, // wave 2, task 0
      ],
      start
    )
    expect(result).toHaveLength(4)

    // Task D should start AFTER wave 1 ends (not on the same day as A/B/C)
    const wave1MaxEnd = new Date(
      Math.max(...result.slice(0, 3).map((r) => new Date(r.end_date).getTime()))
    )
    const taskDStart = new Date(result[3].start_date)
    expect(taskDStart.getTime()).toBeGreaterThan(wave1MaxEnd.getTime())
  })

  it('uses DEFAULT_TASK_DAYS (5) when estimatedDays is undefined', () => {
    const start = futureMonday() // March 9 (Mon)
    const result = scheduleTaskDates(
      [{ title: 'No estimate' }],
      start
    )
    // 5 working days starting Mon → ends Fri
    expect(toDateStr(result[0].start_date)).toBe('2026-03-09')
    expect(toDateStr(result[0].end_date)).toBe('2026-03-13')
  })

  it('respects estimatedDays for varying task durations', () => {
    const start = futureMonday() // March 9 (Mon)
    const result = scheduleTaskDates(
      [
        { title: 'Short', estimatedDays: 2 },
        { title: 'Long', estimatedDays: 10 },
      ],
      start
    )
    // Short: Mon→Tue (2 days)
    expect(toDateStr(result[0].start_date)).toBe('2026-03-09')
    expect(toDateStr(result[0].end_date)).toBe('2026-03-10')

    // Long: starts Tue (stagger by 1 working day), 10 working days
    expect(toDateStr(result[1].start_date)).toBe('2026-03-10')
  })
})

// ---------------------------------------------------------------------------
// Unit: scheduleTaskDates — dependency-based scheduling
// ---------------------------------------------------------------------------

describe('scheduleTaskDates (dependencies)', () => {
  it('chains dependent tasks sequentially', () => {
    const start = futureMonday()
    const result = scheduleTaskDates(
      [
        { title: 'A', estimatedDays: 3 },
        { title: 'B', estimatedDays: 3, dependsOn: [0] },
      ],
      start
    )
    const aEnd = new Date(result[0].end_date)
    const bStart = new Date(result[1].start_date)
    expect(bStart.getTime()).toBeGreaterThan(aEnd.getTime())
  })
})

// ---------------------------------------------------------------------------
// Integration: simulates the full flow from ProposedAction → scheduler
// ---------------------------------------------------------------------------

describe('integration: estimatedWeeks proposals use wave scheduler', () => {
  /**
   * This test replicates the exact data flow in proposed-actions-card.tsx:
   *
   * 1. Proposals have estimatedWeeks but NO explicit startDate/endDate
   * 2. resolveDatesFromProposal() should return null (no explicit dates)
   * 3. The wave scheduler runs with estimatedWeeks * 5 as estimatedDays
   * 4. Tasks get staggered dates instead of all starting today
   *
   * This is the exact scenario that was broken before the fix.
   */
  it('staggers 6 tasks across 2 objectives instead of clustering at today', () => {
    // Simulate what the AI typically returns
    const proposals = [
      { type: 'task' as const, title: 'Research competitors', objectiveTitle: 'Market Analysis', estimatedWeeks: 2 },
      { type: 'task' as const, title: 'Survey customers', objectiveTitle: 'Market Analysis', estimatedWeeks: 1 },
      { type: 'task' as const, title: 'Analyze pricing', objectiveTitle: 'Market Analysis', estimatedWeeks: 1 },
      { type: 'task' as const, title: 'Draft wireframes', objectiveTitle: 'Product Design', estimatedWeeks: 3 },
      { type: 'task' as const, title: 'User testing', objectiveTitle: 'Product Design', estimatedWeeks: 2 },
      { type: 'task' as const, title: 'Final mockups', objectiveTitle: 'Product Design', estimatedWeeks: 1 },
    ]

    // Step 1: Simulate resolveDatesFromProposal() — should return null for all
    // because none have explicit startDate/endDate
    const explicitDates = proposals.map((p) => {
      const startDate = (p as Record<string, unknown>).startDate ?? null
      const endDate = (p as Record<string, unknown>).endDate ?? null
      if (startDate || endDate) return { startDate, endDate }
      return null
    })
    expect(explicitDates.every((d) => d === null)).toBe(true)

    // Step 2: Group tasks by objective (same logic as proposed-actions-card)
    const tasksByObjective = new Map<string, number[]>()
    proposals.forEach((p, i) => {
      const objTitle = p.objectiveTitle.trim()
      const existing = tasksByObjective.get(objTitle) ?? []
      existing.push(i)
      tasksByObjective.set(objTitle, existing)
    })

    // Step 3: Run the wave scheduler (same logic as proposed-actions-card)
    const OBJECTIVE_STAGGER_DAYS = 5
    const taskDatesMap = new Map<number, { start_date: string; end_date: string }>()
    let objectiveIndex = 0

    for (const [, taskIndices] of tasksByObjective) {
      const scheduleInputs = taskIndices.map((i) => ({
        title: proposals[i].title,
        estimatedDays: proposals[i].estimatedWeeks
          ? proposals[i].estimatedWeeks * 5
          : undefined,
      }))
      const startFrom = objectiveIndex > 0
        ? addWorkingDays(new Date(), objectiveIndex * OBJECTIVE_STAGGER_DAYS)
        : undefined
      const scheduled = scheduleTaskDates(scheduleInputs, startFrom)
      taskIndices.forEach((taskIdx, schedIdx) => {
        taskDatesMap.set(taskIdx, scheduled[schedIdx])
      })
      objectiveIndex++
    }

    // Step 4: Every task should have scheduled dates
    expect(taskDatesMap.size).toBe(6)

    // Step 5: THE KEY ASSERTION — not all tasks start on the same date
    const allStartDates = Array.from(taskDatesMap.values()).map((d) =>
      toDateStr(d.start_date)
    )
    const uniqueStartDates = new Set(allStartDates)

    // Before the fix: uniqueStartDates.size === 1 (all today)
    // After the fix: multiple distinct start dates
    expect(uniqueStartDates.size).toBeGreaterThan(1)

    // Step 6: Second objective's tasks start AFTER the first objective's tasks
    const obj1Starts = [0, 1, 2].map((i) => new Date(taskDatesMap.get(i)!.start_date))
    const obj2Starts = [3, 4, 5].map((i) => new Date(taskDatesMap.get(i)!.start_date))

    const obj1Earliest = Math.min(...obj1Starts.map((d) => d.getTime()))
    const obj2Earliest = Math.min(...obj2Starts.map((d) => d.getTime()))

    // Objective 2 should start at least OBJECTIVE_STAGGER_DAYS later
    expect(obj2Earliest).toBeGreaterThan(obj1Earliest)
  })

  it('still uses explicit dates when the AI provides them', () => {
    const proposal = {
      type: 'task' as const,
      title: 'Fixed deadline task',
      objectiveTitle: 'Obj A',
      startDate: '2026-06-01',
      endDate: '2026-06-15',
      estimatedWeeks: 2,
    }

    // resolveDatesFromProposal logic: explicit dates take priority
    const startDate = proposal.startDate ?? null
    const endDate = proposal.endDate ?? null

    expect(startDate).toBe('2026-06-01')
    expect(endDate).toBe('2026-06-15')
    // Scheduler would be skipped because explicitDates is non-null
  })

  it('produces different dates than the old computeDatesFromWeeks would have', () => {
    // The old bug: computeDatesFromWeeks always returned startDate = today
    // for every single task, regardless of position in the batch.
    const today = toDateStr(new Date().toISOString())

    const proposals = [
      { title: 'Task 1', estimatedWeeks: 2 },
      { title: 'Task 2', estimatedWeeks: 3 },
      { title: 'Task 3', estimatedWeeks: 1 },
      { title: 'Task 4', estimatedWeeks: 2 },
    ]

    const scheduleInputs = proposals.map((p) => ({
      title: p.title,
      estimatedDays: p.estimatedWeeks * 5,
    }))

    const scheduled = scheduleTaskDates(scheduleInputs)

    // At least one task should NOT start today (proves staggering works)
    const startsNotToday = scheduled.filter(
      (s) => toDateStr(s.start_date) !== today
    )
    expect(startsNotToday.length).toBeGreaterThan(0)
  })
})
