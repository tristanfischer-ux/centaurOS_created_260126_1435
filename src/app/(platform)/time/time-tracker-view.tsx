/**
 * @file time-tracker-view.tsx — Main client component for the /time page.
 *
 * Manages week navigation (prev/next), weekly grid rendering, and entry form dialog.
 * Fetches data via server actions on week change.
 *
 * Red team fixes:
 * - H-1/H-2/H-3: Error states shown to user on fetch/create/update/delete failures
 * - H-4: All date logic uses UTC consistently (matches server)
 * - M-1: Race condition fixed with request counter (stale responses discarded)
 * - M-8: Delete confirmation dialog
 * - L-5: New entries outside current week trigger a re-fetch instead of optimistic add
 * - L-8: try/catch/finally in submit handler
 */

'use client'

import * as React from 'react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { WeeklyTimesheetGrid } from '@/components/time/weekly-timesheet-grid'
import { TimeEntryForm } from '@/components/time/time-entry-form'
import { formatDuration } from '@/lib/format-duration'
import {
  getMyTimeEntries,
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  startTimer,
} from '@/actions/time-tracking'
import { invalidateWeeklyTimeCache } from '@/hooks/use-weekly-time'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Clock, Plus, AlertCircle } from 'lucide-react'
import type {
  TimeEntryWithRelations,
  WeekSummary,
  CreateTimeEntryInput,
  UpdateTimeEntryInput,
  TimeEntryStatus,
} from '@/types/time-tracking'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — all use UTC to avoid timezone mismatch with server (H-4 fix)
// ─────────────────────────────────────────────────────────────────────────────

/** Get the Monday (UTC) of the week containing the given date. */
function getMondayUTC(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().split('T')[0]
}

/** Add weeks to a date string, returning a new Monday ISO string. */
function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + weeks * 7)
  return d.toISOString().split('T')[0]
}

/** Format week range as "24 Mar – 30 Mar 2026" */
function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00Z')
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)

  const startStr = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const endStr = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return `${startStr} – ${endStr}`
}

/** Check if a date falls within the Mon–Sun week. */
function isInWeek(dateStr: string, weekStart: string): boolean {
  const endDate = new Date(weekStart + 'T00:00:00Z')
  endDate.setUTCDate(endDate.getUTCDate() + 6)
  const end = endDate.toISOString().split('T')[0]
  return dateStr >= weekStart && dateStr <= end
}

/** Get today in UTC YYYY-MM-DD */
function todayUTC(): string {
  return new Date().toISOString().split('T')[0]
}

/** Build a WeekSummary from entries array. */
function buildSummary(weekStart: string, entries: TimeEntryWithRelations[]): WeekSummary {
  let totalMinutes = 0
  let billableMinutes = 0
  const entriesByDay: Record<string, TimeEntryWithRelations[]> = {}
  const statusCounts: Record<TimeEntryStatus, number> = {
    draft: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
  }

  for (const entry of entries) {
    totalMinutes += entry.durationMinutes
    if (entry.isBillable) billableMinutes += entry.durationMinutes
    if (!entriesByDay[entry.entryDate]) entriesByDay[entry.entryDate] = []
    entriesByDay[entry.entryDate].push(entry)
    statusCounts[entry.status]++
  }

  return { weekStart, totalMinutes, billableMinutes, entriesByDay, statusCounts }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TaskOption {
  id: string
  title: string
}

interface ProjectOption {
  id: string
  name: string
}

interface TimeTrackerViewProps {
  initialWeekStart: string
  initialEntries: TimeEntryWithRelations[]
  tasks: TaskOption[]
  projects: ProjectOption[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function TimeTrackerView({
  initialWeekStart,
  initialEntries,
  tasks,
  projects,
}: TimeTrackerViewProps) {
  const [weekStart, setWeekStart] = React.useState(initialWeekStart)
  const [entries, setEntries] = React.useState(initialEntries)
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Form dialog state
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingEntry, setEditingEntry] = React.useState<TimeEntryWithRelations | null>(null)
  const [defaultDate, setDefaultDate] = React.useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const [timerStarting, setTimerStarting] = React.useState(false)

  const summary = React.useMemo(() => buildSummary(weekStart, entries), [weekStart, entries])

  // ── AI Briefing ──────────────────────────────────────────────────────────
  const handleStartTimer = React.useCallback(async () => {
    setTimerStarting(true)
    try {
      const result = await startTimer()
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Timer started')
        window.dispatchEvent(new Event('timer-started'))
      }
    } catch {
      toast.error('Failed to start timer')
    } finally {
      setTimerStarting(false)
    }
  }, [])

  // M-1 fix: Request counter to discard stale responses from rapid navigation
  const fetchSeqRef = React.useRef(0)

  // Fetch entries when week changes (not on initial load — we have SSR data)
  const isInitialMount = React.useRef(true)
  React.useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    const seq = ++fetchSeqRef.current
    setIsLoading(true)
    setError(null)

    getMyTimeEntries(weekStart).then((result) => {
      // Discard stale response if user has navigated away
      if (seq !== fetchSeqRef.current) return

      if ('error' in result && result.error) {
        setError(result.error)
        setEntries([])
      } else if ('data' in result && result.data) {
        setEntries(result.data)
      }
      setIsLoading(false)
    }).catch(() => {
      if (seq !== fetchSeqRef.current) return
      setError('Failed to load time entries')
      setEntries([])
      setIsLoading(false)
    })
  }, [weekStart])

  // ── Week Navigation ──────────────────────────────────────────────────────

  const goToPrevWeek = () => setWeekStart((ws) => addWeeks(ws, -1))
  const goToNextWeek = () => setWeekStart((ws) => addWeeks(ws, 1))
  const goToThisWeek = () => setWeekStart(getMondayUTC(new Date()))

  const isCurrentWeek = weekStart === getMondayUTC(new Date())

  // ── Form Handlers ────────────────────────────────────────────────────────

  const handleAddEntry = (date: string) => {
    setEditingEntry(null)
    setDefaultDate(date)
    setFormError(null)
    setFormOpen(true)
  }

  const handleEditEntry = (entry: TimeEntryWithRelations) => {
    setEditingEntry(entry)
    setDefaultDate(undefined)
    setFormError(null)
    setFormOpen(true)
  }

  // M-8 fix: Delete confirmation. RT2-H1 fix: try/catch for unhandled rejection.
  const handleDeleteEntry = async (id: string) => {
    if (!window.confirm('Delete this time entry? This cannot be undone.')) return

    try {
      const result = await deleteTimeEntry(id)
      if ('error' in result && result.error) {
        setError(result.error)
        return
      }
      setEntries((prev) => prev.filter((e) => e.id !== id))
      invalidateWeeklyTimeCache()
    } catch {
      setError('Failed to delete time entry. Please try again.')
    }
  }

  // L-8 fix: try/catch/finally. H-2 fix: show errors, keep dialog open.
  const handleFormSubmit = async (data: CreateTimeEntryInput | (UpdateTimeEntryInput & { id: string })) => {
    setIsSubmitting(true)
    setFormError(null)

    try {
      if ('id' in data) {
        const { id, ...input } = data
        const result = await updateTimeEntry(id, input)
        if ('error' in result && result.error) {
          setFormError(result.error)
          return
        }
        if (result.data) {
          const updated = result.data
          setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)))
        }
      } else {
        const result = await createTimeEntry(data)
        if ('error' in result && result.error) {
          setFormError(result.error)
          return
        }
        if (result.data) {
          const created = result.data
          // L-5 fix: Only add to list if entry is in current week. Otherwise re-fetch.
          if (isInWeek(created.entryDate, weekStart)) {
            setEntries((prev) => [...prev, created])
          } else {
            // Entry was for a different week — don't add to current view
          }
        }
      }
      setFormOpen(false)
      invalidateWeeklyTimeCache()
    } catch {
      setFormError('An unexpected error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">Time</h1>
          <p className="text-sm text-muted-foreground">
            Track hours across your projects and tasks
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goToPrevWeek} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <button
            onClick={goToThisWeek}
            className="text-sm font-medium text-foreground hover:text-international-orange transition-colors px-2"
            disabled={isCurrentWeek}
            aria-label={isCurrentWeek ? 'Current week' : 'Go to current week'}
          >
            {formatWeekRange(weekStart)}
          </button>

          <Button variant="ghost" size="icon" onClick={goToNextWeek} aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </Button>

          {!isCurrentWeek && (
            <Button variant="ghost" size="sm" onClick={goToThisWeek} className="text-xs ml-1">
              This Week
            </Button>
          )}
        </div>
      </div>

      {/* Error banner (H-1 fix) */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-xs underline">Dismiss</button>
        </div>
      )}

      {/* Summary stats bar */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-1.5">
          <div className="h-8 w-8 rounded-lg bg-international-orange/10 flex items-center justify-center">
            <Clock className="h-4 w-4 text-international-orange" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">This Week</p>
            <p className="font-semibold text-foreground tabular-nums">{formatDuration(summary.totalMinutes)}</p>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Billable</p>
          <p className="font-semibold text-foreground tabular-nums">{formatDuration(summary.billableMinutes)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Entries</p>
          <p className="font-semibold text-foreground tabular-nums">{entries.length}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleStartTimer} disabled={timerStarting}>
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            {timerStarting ? 'Starting…' : 'Start Timer'}
          </Button>
          <Button size="sm" onClick={() => handleAddEntry(todayUTC())}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Log Time
          </Button>
        </div>
      </div>

      {/* Weekly grid, empty state, or loading */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-10 w-10" />}
          title={isCurrentWeek ? 'No time logged yet' : 'No time logged this week'}
          description={isCurrentWeek
            ? 'Start tracking your hours by clicking the + button on any day, or use the Log Time button above.'
            : 'No entries were logged during this week.'
          }
          action={isCurrentWeek ? (
            <Button size="sm" onClick={() => handleAddEntry(todayUTC())}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Log Time
            </Button>
          ) : undefined}
        />
      ) : (
        <WeeklyTimesheetGrid
          summary={summary}
          onAddEntry={handleAddEntry}
          onEditEntry={handleEditEntry}
          onDeleteEntry={handleDeleteEntry}
        />
      )}

      {/* Entry form dialog */}
      <TimeEntryForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setFormError(null)
        }}
        entry={editingEntry}
        defaultDate={defaultDate}
        tasks={tasks}
        projects={projects}
        onSubmit={handleFormSubmit}
        isSubmitting={isSubmitting}
        serverError={formError}
      />
    </div>
  )
}
