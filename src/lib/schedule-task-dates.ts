/**
 * @file schedule-task-dates.ts
 *
 * @description Utilities for scheduling task start/end dates with working-day logic,
 * staggering, and dependency support. Used when auto-creating objectives and tasks
 * so timelines show sensible sequencing instead of everything on one date.
 */

const DEFAULT_TASK_DAYS = 5
const WAVE_CONCURRENCY = 3

/**
 * Ensures a date is not in the past. If it is, returns today at midnight (local date).
 *
 * @param date - The date to check
 * @returns The same date if today or future, otherwise today
 */
export function ensureNotInPast(date: Date): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d < today ? today : new Date(date)
}

/**
 * Moves the date forward to the next working day if it falls on a weekend.
 * Also clamps to today if in the past.
 *
 * @param date - The date to adjust
 * @returns A date that is a weekday and not in the past
 */
export function clampToWorkday(date: Date): Date {
  const d = ensureNotInPast(new Date(date))
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1)
  }
  return d
}

/**
 * Adds N working days to a date (skips weekends).
 *
 * @param date - Starting date
 * @param workingDays - Number of working days to add
 * @returns New date after adding working days
 */
export function addWorkingDays(date: Date, workingDays: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < workingDays) {
    result.setDate(result.getDate() + 1)
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      added++
    }
  }
  return result
}

export interface TaskScheduleInput {
  title: string
  estimatedDays?: number
  dependsOn?: number[]
}

/**
 * Computes start_date and end_date for each task, with start always >= today,
 * weekends skipped, and either dependency-based or wave-based staggering.
 *
 * @param tasks - Array of tasks with optional estimatedDays and dependsOn (task indices)
 * @param startFrom - Optional start date; defaults to today and is clamped to >= today
 * @returns Array of { start_date, end_date } in ISO format, one per task
 */
export function scheduleTaskDates(
  tasks: TaskScheduleInput[],
  startFrom?: Date
): Array<{ start_date: string; end_date: string }> {
  if (tasks.length === 0) return []

  const base = startFrom ? ensureNotInPast(startFrom) : new Date()
  const start = clampToWorkday(base)

  const hasDeps = tasks.some((t) => t.dependsOn && t.dependsOn.length > 0)

  if (hasDeps) {
    return scheduleWithDependencies(tasks, start)
  }

  return scheduleWithWaves(tasks, start)
}

function scheduleWithDependencies(
  tasks: TaskScheduleInput[],
  objectiveStart: Date
): Array<{ start_date: string; end_date: string }> {
  const results: Array<{ start_date: string; end_date: string }> = []

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    let startDate = new Date(objectiveStart)

    if (task.dependsOn && task.dependsOn.length > 0) {
      for (const depIndex of task.dependsOn) {
        if (depIndex >= 0 && depIndex < results.length) {
          const depEnd = new Date(results[depIndex].end_date)
          const dayAfter = new Date(depEnd)
          dayAfter.setDate(dayAfter.getDate() + 1)
          if (dayAfter > startDate) {
            startDate = dayAfter
          }
        }
      }
    }

    startDate = clampToWorkday(startDate)
    const duration = task.estimatedDays ?? DEFAULT_TASK_DAYS
    const endDate = addWorkingDays(startDate, duration - 1)

    results.push({
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    })
  }

  return results
}

function scheduleWithWaves(
  tasks: TaskScheduleInput[],
  start: Date
): Array<{ start_date: string; end_date: string }> {
  const results: Array<{ start_date: string; end_date: string }> = []
  let waveStart = new Date(start)

  for (let i = 0; i < tasks.length; i++) {
    const waveIndex = i % WAVE_CONCURRENCY
    if (waveIndex === 0 && i > 0) {
      const prevWaveEnd = results
        .slice(i - WAVE_CONCURRENCY, i)
        .reduce((latest, r) => {
          const end = new Date(r.end_date)
          return end > latest ? end : latest
        }, new Date(0))
      const dayAfter = new Date(prevWaveEnd)
      dayAfter.setDate(dayAfter.getDate() + 1)
      waveStart = clampToWorkday(dayAfter)
    }

    // DECISION: Stagger tasks within a wave by 1 working day each so they
    // fan out visually on the timeline instead of all stacking on the same date.
    const taskStart = waveIndex === 0
      ? new Date(waveStart)
      : addWorkingDays(new Date(waveStart), waveIndex)
    const duration = tasks[i].estimatedDays ?? DEFAULT_TASK_DAYS
    const taskEnd = addWorkingDays(taskStart, duration - 1)

    results.push({
      start_date: taskStart.toISOString(),
      end_date: taskEnd.toISOString(),
    })
  }

  return results
}
