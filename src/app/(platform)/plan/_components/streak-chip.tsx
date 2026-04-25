/**
 * @file streak-chip.tsx
 *
 * @description Small chip displayed in the /plan page header showing the
 * founder's current weekly activity streak. Computed server-side from
 * plan_history and cached in profiles.plan_streak_weeks.
 *
 * Lever #2 of /plan stickiness: gives founders a reason to return each week.
 *
 * @related
 *   - src/actions/plan/fetch-plan-streak.ts — reads profiles.plan_streak_weeks
 *   - supabase/migrations/20260425090000_profiles_plan_streak.sql
 */

"use client"

import * as React from "react"

interface StreakChipProps {
  weeks: number
}

export function StreakChip({ weeks }: StreakChipProps): React.ReactElement {
  if (weeks === 0) {
    return (
      <div
        className="streak-chip streak-chip--empty"
        title="Log a decision or close a task to start your streak"
        aria-label="No streak yet"
      >
        <span className="streak-chip__icon" aria-hidden="true">◇</span>
        <span className="streak-chip__text">
          No streak yet — log a decision or close a task to start one
        </span>
      </div>
    )
  }

  return (
    <div
      className="streak-chip streak-chip--active"
      title={`${weeks} consecutive ${weeks === 1 ? "week" : "weeks"} of plan activity`}
      aria-label={`${weeks}-week streak`}
    >
      <span className="streak-chip__icon" aria-hidden="true">◆</span>
      <span className="streak-chip__text">
        Week {weeks} streak — keep going
      </span>
    </div>
  )
}
