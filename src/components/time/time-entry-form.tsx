/**
 * @file time-entry-form.tsx — Dialog form for creating/editing a time entry.
 *
 * Opens from the grid "+" button or from clicking an editable entry card.
 * Fields: date, duration (h:mm), description, task search, project search, billable toggle.
 *
 * Red team fixes:
 * - H-6: Decimal input (e.g. "1.5") now correctly converts to 90 minutes
 * - H-2: serverError prop displays server-side errors without closing dialog
 */

'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Clock, CheckSquare, FolderKanban } from 'lucide-react'
import type { TimeEntryWithRelations, CreateTimeEntryInput, UpdateTimeEntryInput } from '@/types/time-tracking'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse duration string into total minutes. Supports:
 * - "H:MM" (e.g. "1:30" → 90)
 * - Decimal hours (e.g. "1.5" → 90)
 * - Plain minutes (e.g. "90" → 90)
 */
function parseDuration(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  // H:MM format
  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10)
    const m = parseInt(colonMatch[2], 10)
    if (m > 59) return null
    const total = h * 60 + m
    return total > 0 ? total : null
  }

  // Decimal hours (e.g. "1.5" → 90 minutes)
  if (trimmed.includes('.')) {
    const decimal = parseFloat(trimmed)
    if (isNaN(decimal) || decimal <= 0) return null
    return Math.round(decimal * 60)
  }

  // Plain integer (minutes)
  const num = parseInt(trimmed, 10)
  if (isNaN(num) || num <= 0 || trimmed !== String(num)) return null
  return num
}

/** Format minutes as "H:MM" for the input field */
function formatDurationInput(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${m.toString().padStart(2, '0')}`
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

interface TimeEntryFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** If editing, the existing entry. If null, creating new. */
  entry: TimeEntryWithRelations | null
  /** Pre-selected date when creating from a specific day column */
  defaultDate?: string
  /** Available tasks for the combobox */
  tasks: TaskOption[]
  /** Available finance projects for the combobox */
  projects: ProjectOption[]
  onSubmit: (data: CreateTimeEntryInput | (UpdateTimeEntryInput & { id: string })) => Promise<void>
  isSubmitting: boolean
  /** Server-side error to display (H-2 fix) */
  serverError: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function TimeEntryForm({
  open,
  onOpenChange,
  entry,
  defaultDate,
  tasks,
  projects,
  onSubmit,
  isSubmitting,
  serverError,
}: TimeEntryFormProps) {
  const isEdit = entry != null
  const today = new Date().toISOString().split('T')[0]

  // Form state
  const [date, setDate] = React.useState(entry?.entryDate ?? defaultDate ?? today)
  const [durationStr, setDurationStr] = React.useState(entry ? formatDurationInput(entry.durationMinutes) : '1:00')
  const [description, setDescription] = React.useState(entry?.description ?? '')
  const [taskId, setTaskId] = React.useState<string>(entry?.taskId ?? '')
  const [projectId, setProjectId] = React.useState<string>(entry?.financeProjectId ?? '')
  const [isBillable, setIsBillable] = React.useState(entry?.isBillable ?? true)
  const [clientError, setClientError] = React.useState('')

  // Reset form when entry or defaultDate changes
  React.useEffect(() => {
    if (open) {
      setDate(entry?.entryDate ?? defaultDate ?? today)
      setDurationStr(entry ? formatDurationInput(entry.durationMinutes) : '1:00')
      setDescription(entry?.description ?? '')
      setTaskId(entry?.taskId ?? '')
      setProjectId(entry?.financeProjectId ?? '')
      setIsBillable(entry?.isBillable ?? true)
      setClientError('')
    }
  }, [open, entry, defaultDate, today])

  const displayError = clientError || serverError

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setClientError('')

    const minutes = parseDuration(durationStr)
    if (!minutes || minutes < 1 || minutes > 1440) {
      setClientError('Enter a valid duration (e.g. 1:30 for 1h 30m, 1.5 for 1.5 hours, or 90 for 90 minutes)')
      return
    }

    if (!date) {
      setClientError('Date is required')
      return
    }

    if (date > today) {
      setClientError('Cannot log time for future dates')
      return
    }

    if (description.length > 5000) {
      setClientError('Description must be 5000 characters or fewer')
      return
    }

    if (isEdit && entry) {
      await onSubmit({
        id: entry.id,
        entryDate: date,
        durationMinutes: minutes,
        description,
        taskId: taskId || null,
        financeProjectId: projectId || null,
        isBillable,
      })
    } else {
      await onSubmit({
        entryDate: date,
        durationMinutes: minutes,
        description,
        taskId: taskId || null,
        financeProjectId: projectId || null,
        isBillable,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-international-orange" />
            {isEdit ? 'Edit Time Entry' : 'Log Time'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="te-date">Date</Label>
            <Input
              id="te-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label htmlFor="te-duration">Duration</Label>
            <Input
              id="te-duration"
              type="text"
              value={durationStr}
              onChange={(e) => setDurationStr(e.target.value)}
              placeholder="1:30 or 1.5 or 90"
              required
            />
            <p className="text-xs text-muted-foreground">
              H:MM (e.g. 2:30), decimal hours (e.g. 1.5), or minutes (e.g. 90)
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="te-desc">Description</Label>
            <textarea
              id="te-desc"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on?"
              maxLength={5000}
              rows={3}
            />
          </div>

          {/* Task (select) */}
          {tasks.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="te-task" className="flex items-center gap-1.5">
                <CheckSquare className="h-3 w-3 text-muted-foreground" />
                Task
              </Label>
              <select
                id="te-task"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
              >
                <option value="">No task</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* Finance Project (select) */}
          {projects.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="te-project" className="flex items-center gap-1.5">
                <FolderKanban className="h-3 w-3 text-muted-foreground" />
                Project
              </Label>
              <select
                id="te-project"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Billable toggle */}
          <div className="flex items-center gap-2">
            <input
              id="te-billable"
              type="checkbox"
              checked={isBillable}
              onChange={(e) => setIsBillable(e.target.checked)}
              className="h-4 w-4 rounded border-input text-international-orange focus:ring-international-orange"
            />
            <Label htmlFor="te-billable" className="text-sm font-normal cursor-pointer">
              Billable time
            </Label>
          </div>

          {/* Error (client-side or server-side) */}
          {displayError && (
            <p className="text-sm text-destructive" role="alert">{displayError}</p>
          )}

          {/* Actions */}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (isEdit ? 'Saving...' : 'Logging...') : (isEdit ? 'Save Changes' : 'Log Time')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
