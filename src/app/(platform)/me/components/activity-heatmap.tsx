/**
 * ActivityHeatmap — 12-week GitHub-style activity contribution grid.
 *
 * @description Renders a heatmap of daily activity over the last 12 weeks.
 * Each cell represents a day, colored by activity intensity. Displays
 * the current streak count alongside the grid.
 *
 * Activity data comes from task_history events (task actions the user took).
 *
 * @component
 */

'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Flame, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ActivityHeatmapProps {
  /** Activity counts by date (YYYY-MM-DD -> count) */
  heatmap: Array<{ date: string; count: number }>
  /** Current consecutive-day streak */
  streak: number
}

/** Number of weeks to display in the heatmap */
const WEEKS_TO_SHOW = 12

/** Day labels shown on the left axis */
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''] as const

/**
 * Returns a CSS class for the heatmap cell based on activity count.
 *
 * @param {number} count - Number of activities on this day
 * @returns {string} Tailwind background class
 */
function getCellColor(count: number): string {
  if (count === 0) return 'bg-muted'
  if (count <= 2) return 'bg-international-orange/20'
  if (count <= 4) return 'bg-international-orange/40'
  if (count <= 6) return 'bg-international-orange/70'
  return 'bg-international-orange'
}

/**
 * Generates the full grid of dates for the heatmap.
 * Starts from WEEKS_TO_SHOW weeks ago (aligned to Monday) through today.
 *
 * @param {Map<string, number>} activityMap - Date -> count map
 * @returns {{ weeks: Array<Array<{ date: string; count: number; isToday: boolean }>>; months: Array<{ label: string; colStart: number }> }}
 */
function generateGrid(activityMap: Map<string, number>): {
  weeks: Array<Array<{ date: string; count: number; isToday: boolean }>>
  months: Array<{ label: string; colStart: number }>
} {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]

  // Find the start: WEEKS_TO_SHOW weeks ago, aligned to Monday
  const start = new Date(now)
  start.setDate(start.getDate() - (WEEKS_TO_SHOW * 7))
  // Align to Monday
  const dayOfWeek = start.getDay()
  const mondayOffset = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek
  start.setDate(start.getDate() + mondayOffset)
  start.setHours(0, 0, 0, 0)

  const weeks: Array<Array<{ date: string; count: number; isToday: boolean }>> = []
  const months: Array<{ label: string; colStart: number }> = []
  let lastMonth = -1
  const current = new Date(start)

  while (current <= now) {
    const week: Array<{ date: string; count: number; isToday: boolean }> = []

    for (let d = 0; d < 7; d++) {
      const dateStr = current.toISOString().split('T')[0]
      const isFuture = current > now

      // Track month labels
      if (current.getMonth() !== lastMonth && !isFuture) {
        lastMonth = current.getMonth()
        months.push({
          label: current.toLocaleDateString('en-US', { month: 'short' }),
          colStart: weeks.length,
        })
      }

      week.push({
        date: dateStr,
        count: isFuture ? -1 : (activityMap.get(dateStr) ?? 0),
        isToday: dateStr === todayStr,
      })
      current.setDate(current.getDate() + 1)
    }

    weeks.push(week)
  }

  return { weeks, months }
}

export function ActivityHeatmap({ heatmap, streak }: ActivityHeatmapProps): React.ReactElement {
  // Build lookup map
  const activityMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const entry of heatmap) {
      map.set(entry.date, entry.count)
    }
    return map
  }, [heatmap])

  const { weeks, months } = useMemo(() => generateGrid(activityMap), [activityMap])

  // Total activity count
  const totalActivity = heatmap.reduce((sum, e) => sum + e.count, 0)

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 bg-international-orange rounded-full" />
            <CardTitle className="text-base">Activity</CardTitle>
          </div>
          {/* Streak badge */}
          {streak > 0 && (
            <div className="flex items-center gap-1.5 text-sm font-medium text-international-orange">
              <Flame className="h-4 w-4" />
              {streak} day streak
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {totalActivity > 0 ? (
          <div className="space-y-3">
            {/* Month labels */}
            <div className="flex items-end gap-0.5 pl-8">
              {months.map((m, i) => (
                <div
                  key={`${m.label}-${i}`}
                  className="text-[10px] text-muted-foreground"
                  style={{
                    position: 'relative',
                    left: `${m.colStart * 14}px`,
                  }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="flex gap-0.5">
              {/* Day labels (left axis) */}
              <div className="flex flex-col gap-0.5 pr-1">
                {DAY_LABELS.map((label, i) => (
                  <div
                    key={i}
                    className="h-3 w-6 flex items-center justify-end text-[10px] text-muted-foreground"
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Heatmap cells */}
              <div className="flex gap-0.5 overflow-hidden">
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-0.5">
                    {week.map((day, di) => (
                      <div
                        key={day.date}
                        className={cn(
                          'h-3 w-3 rounded-sm transition-colors',
                          day.count < 0
                            ? 'bg-transparent'
                            : getCellColor(day.count),
                          day.isToday && 'ring-1 ring-foreground/20',
                        )}
                        title={day.count >= 0
                          ? `${day.date}: ${day.count} action${day.count !== 1 ? 's' : ''}`
                          : ''
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                {totalActivity} actions in the last {WEEKS_TO_SHOW} weeks
              </p>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span>Less</span>
                <div className="h-3 w-3 rounded-sm bg-muted" />
                <div className="h-3 w-3 rounded-sm bg-international-orange/20" />
                <div className="h-3 w-3 rounded-sm bg-international-orange/40" />
                <div className="h-3 w-3 rounded-sm bg-international-orange/70" />
                <div className="h-3 w-3 rounded-sm bg-international-orange" />
                <span>More</span>
              </div>
            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-6">
            <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mb-3">
              <Activity className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
              No activity yet
            </p>
            <p className="text-xs text-muted-foreground text-center">
              Complete tasks and leave comments to build your streak
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
