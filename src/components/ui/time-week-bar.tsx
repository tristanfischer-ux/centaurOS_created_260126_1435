'use client'

/**
 * @file time-week-bar.tsx — Compact weekly time progress bar for the sidebar.
 *
 * @description Self-loading widget that shows "This Week: Xh Ym / 40h" with a
 * progress bar. Mirrors the AICreditsBarLoader pattern. Click navigates to /time.
 */

import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import Link from 'next/link'
import { getWeeklyTimeProgress } from '@/actions/time-tracking'

const TARGET_MINUTES = 40 * 60 // 40h standard week

/** Format minutes as "Xh Ym" */
function fmt(minutes: number): string {
  if (minutes === 0) return '0h'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/**
 * TimeWeekBarLoader — Self-loading wrapper that fetches weekly time data.
 */
export function TimeWeekBarLoader() {
  const [data, setData] = useState<{ totalMinutes: number; billableMinutes: number; todayMinutes: number } | null>(null)

  useEffect(() => {
    getWeeklyTimeProgress().then((result) => {
      if (!('error' in result)) setData(result)
    }).catch((err) => console.warn('[TIME] Sidebar fetch failed:', err))
  }, [])

  if (!data) return null

  return <TimeWeekBar {...data} />
}

interface TimeWeekBarProps {
  totalMinutes: number
  billableMinutes: number
  todayMinutes: number
}

function TimeWeekBar({ totalMinutes, billableMinutes, todayMinutes }: TimeWeekBarProps) {
  const percent = Math.min((totalMinutes / TARGET_MINUTES) * 100, 100)
  const barColor = percent >= 80
    ? 'bg-success'
    : percent >= 40
      ? 'bg-warning'
      : 'bg-muted-foreground/30'

  return (
    <Link
      href="/time"
      className="block w-full text-left px-2 py-2 min-h-[44px] sm:min-h-0 rounded-md hover:bg-muted/50 transition-colors"
      aria-label={`Time this week: ${fmt(totalMinutes)} of 40h`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Clock className="h-2.5 w-2.5" />
          This Week
        </span>
        <span className="text-[10px] font-semibold text-foreground">
          {fmt(totalMinutes)} / 40h
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
      {todayMinutes > 0 && (
        <p className="text-[9px] text-muted-foreground mt-1">
          {fmt(todayMinutes)} today
          {billableMinutes > 0 && ` · ${fmt(billableMinutes)} billable`}
        </p>
      )}
      {todayMinutes === 0 && totalMinutes > 0 && billableMinutes > 0 && (
        <p className="text-[9px] text-muted-foreground mt-1">
          {fmt(billableMinutes)} billable
        </p>
      )}
    </Link>
  )
}
