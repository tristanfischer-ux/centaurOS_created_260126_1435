'use client'

/**
 * @file time-week-bar.tsx — Compact weekly time progress bar for the sidebar.
 *
 * @description Self-loading widget that shows "This Week: Xh Ym / target" with a
 * progress bar. Uses the shared useWeeklyTime hook for request deduplication.
 * Target is configurable per-user (defaults to 40h). Click navigates to /time.
 */

import { Clock } from 'lucide-react'
import Link from 'next/link'
import { useWeeklyTime } from '@/hooks/use-weekly-time'
import { formatDuration } from '@/lib/format-duration'

/**
 * TimeWeekBarLoader — Self-loading wrapper using shared weekly time data.
 */
export function TimeWeekBarLoader() {
  const data = useWeeklyTime()
  if (!data) return null
  return <TimeWeekBar {...data} />
}

interface TimeWeekBarProps {
  totalMinutes: number
  billableMinutes: number
  todayMinutes: number
  targetMinutes: number
}

function TimeWeekBar({ totalMinutes, billableMinutes, todayMinutes, targetMinutes }: TimeWeekBarProps) {
  const safeTarget = targetMinutes || 2400 // guard against 0/NaN
  const percent = Math.min((totalMinutes / safeTarget) * 100, 100)
  const barColor = percent >= 80
    ? 'bg-success'
    : percent >= 40
      ? 'bg-warning'
      : 'bg-muted-foreground/30'
  const targetLabel = formatDuration(targetMinutes)

  return (
    <Link
      href="/time"
      className="block w-full text-left px-2 py-2 min-h-[44px] sm:min-h-0 rounded-md hover:bg-muted/50 transition-colors"
      aria-label={`Time this week: ${formatDuration(totalMinutes)} of ${targetLabel}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Clock className="h-2.5 w-2.5" />
          This Week
        </span>
        <span className="text-[10px] font-semibold text-foreground">
          {formatDuration(totalMinutes)} / {targetLabel}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          role="progressbar"
          aria-valuenow={totalMinutes}
          aria-valuemin={0}
          aria-valuemax={safeTarget}
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
      {todayMinutes > 0 && (
        <p className="text-[9px] text-muted-foreground mt-1">
          {formatDuration(todayMinutes)} today
          {billableMinutes > 0 && ` · ${formatDuration(billableMinutes)} billable`}
        </p>
      )}
      {todayMinutes === 0 && totalMinutes > 0 && billableMinutes > 0 && (
        <p className="text-[9px] text-muted-foreground mt-1">
          {formatDuration(billableMinutes)} billable
        </p>
      )}
    </Link>
  )
}
