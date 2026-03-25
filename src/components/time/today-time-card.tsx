'use client'

/**
 * @file today-time-card.tsx — Self-loading time card for the Today dashboard.
 *
 * @description Shows today's logged hours + weekly total. When nothing is logged
 * today, shows a gentle nudge with a "Log Time" CTA. Uses shared useWeeklyTime
 * hook for request deduplication with the sidebar bar.
 */

import { Clock, Plus } from 'lucide-react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useWeeklyTime } from '@/hooks/use-weekly-time'
import { formatDuration } from '@/lib/format-duration'

/**
 * TodayTimeCard — Self-loading card for the Today dashboard.
 *
 * Shows today's logged time + weekly total. Nudges if nothing logged today.
 */
export function TodayTimeCard() {
  const data = useWeeklyTime()

  // Skeleton placeholder to avoid layout shift
  if (!data) {
    return <div className="h-[76px] rounded-xl border border-border bg-card animate-pulse" />
  }

  const nothingToday = data.todayMinutes === 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
    >
      <Link
        href="/time"
        aria-label={nothingToday ? 'No time logged today — tap to log time' : `${formatDuration(data.todayMinutes)} logged today, ${formatDuration(data.totalMinutes)} this week`}
        className={`block rounded-xl border p-3 transition-all duration-200 hover:-translate-y-0.5 ${
          nothingToday
            ? 'border-warning/40 bg-warning/5'
            : 'border-border bg-card'
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Time today
          </span>
          {nothingToday && (
            <span className="text-[10px] font-medium text-warning flex items-center gap-0.5">
              <Plus className="h-2.5 w-2.5" />
              Log
            </span>
          )}
        </div>
        <p className={`text-lg font-bold tabular-nums ${nothingToday ? 'text-warning' : 'text-foreground'}`}>
          {nothingToday ? '—' : formatDuration(data.todayMinutes)}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {formatDuration(data.totalMinutes)} this week
          {data.billableMinutes > 0 && ` · ${formatDuration(data.billableMinutes)} billable`}
        </p>
      </Link>
    </motion.div>
  )
}
