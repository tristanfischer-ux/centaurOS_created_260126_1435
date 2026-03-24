/**
 * @file weekly-timesheet-grid.tsx — 7-column Mon–Sun grid for the weekly timesheet.
 *
 * Day headers show date + total hours. Entry cards per day. "+" button per day to add.
 * Weekly total in the header. Warning color for days > 8h.
 *
 * Red team fixes:
 * - M-9: Responsive layout — stacked on mobile, 7-col on desktop
 * - H-5: All date comparisons use UTC
 */

'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TimeEntryCard, formatDuration } from '@/components/time/time-entry-card'
import type { TimeEntryWithRelations, WeekSummary } from '@/types/time-tracking'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — all UTC to match server
// ─────────────────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Get array of ISO date strings for Mon–Sun of a given week start. */
function getWeekDates(weekStart: string): string[] {
  const dates: string[] = []
  const d = new Date(weekStart + 'T00:00:00Z')
  for (let i = 0; i < 7; i++) {
    const date = new Date(d)
    date.setUTCDate(d.getUTCDate() + i)
    dates.push(date.toISOString().split('T')[0])
  }
  return dates
}

/** Format date as "24 Mar" */
function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Check if a date is today (UTC) */
function isTodayUTC(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split('T')[0]
}

/** Sum minutes for a list of entries */
function sumMinutes(entries: TimeEntryWithRelations[]): number {
  return entries.reduce((sum, e) => sum + e.durationMinutes, 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface WeeklyTimesheetGridProps {
  summary: WeekSummary
  onAddEntry: (date: string) => void
  onEditEntry: (entry: TimeEntryWithRelations) => void
  onDeleteEntry: (id: string) => void
}

export function WeeklyTimesheetGrid({
  summary,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
}: WeeklyTimesheetGridProps) {
  const weekDates = getWeekDates(summary.weekStart)
  const today = new Date().toISOString().split('T')[0]

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-international-orange" />
            <h3 className="text-sm font-semibold text-foreground">Weekly Timesheet</h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Total: <strong className="text-foreground">{formatDuration(summary.totalMinutes)}</strong></span>
            <span className="text-muted-foreground/40">|</span>
            <span>Billable: <strong className="text-foreground">{formatDuration(summary.billableMinutes)}</strong></span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* M-9 fix: Responsive — stacked on mobile, 2-col tablet, 7-col desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {weekDates.map((dateStr, i) => {
            const dayEntries = summary.entriesByDay[dateStr] ?? []
            const dayMinutes = sumMinutes(dayEntries)
            const isFuture = dateStr > today
            const isOverEight = dayMinutes > 480

            return (
              <div
                key={dateStr}
                className={cn(
                  'rounded-lg border p-2 min-h-[120px] lg:min-h-[140px] flex flex-col',
                  isTodayUTC(dateStr) && 'border-international-orange/40 bg-international-orange/5',
                  isFuture && 'opacity-50',
                )}
              >
                {/* Day header */}
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className={cn(
                      'text-xs font-medium',
                      isTodayUTC(dateStr) ? 'text-international-orange' : 'text-muted-foreground',
                    )}>
                      {DAY_NAMES[i]}
                    </span>
                    <span className={cn(
                      'ml-1 text-xs',
                      isTodayUTC(dateStr) ? 'text-international-orange font-semibold' : 'text-muted-foreground',
                    )}>
                      {formatShortDate(dateStr)}
                    </span>
                  </div>
                  {dayMinutes > 0 && (
                    <span className={cn(
                      'text-[10px] font-semibold tabular-nums',
                      isOverEight ? 'text-warning' : 'text-foreground',
                    )}>
                      {formatDuration(dayMinutes)}
                    </span>
                  )}
                </div>

                {/* Entry cards */}
                <div className="flex-1 space-y-1.5">
                  {dayEntries.map((entry) => (
                    <TimeEntryCard
                      key={entry.id}
                      entry={entry}
                      onEdit={onEditEntry}
                      onDelete={onDeleteEntry}
                    />
                  ))}
                </div>

                {/* Add button */}
                {!isFuture && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1.5 w-full h-7 text-xs text-muted-foreground hover:text-international-orange hover:bg-international-orange/5"
                    onClick={() => onAddEntry(dateStr)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        {/* Status legend */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/30" /> Draft
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-status-info-dark" /> Submitted
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-status-success-dark" /> Approved
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-status-error-dark" /> Rejected
          </span>
          <span className="sm:ml-auto flex items-center gap-1">
            <span className="h-2.5 w-0.5 rounded-full bg-international-orange" /> Billable
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
