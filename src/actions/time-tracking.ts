/**
 * @file time-tracking.ts — Server actions for time entry CRUD (Phase 1).
 *
 * @description Handles manual time logging: create, read, update, delete entries
 * and weekly summary aggregation. All actions use withAuth() for multi-tenant isolation.
 *
 * Phase 2 will add: startTimer, stopTimer, submitForApproval, approveEntry, rejectEntry.
 * Phase 3 will add: getTeamTimeReport, getBillableHoursSummary.
 *
 * @security All queries filter by foundry_id. RLS enforces row-level access.
 * Input validation: date format, integer duration, description length, weekStart Monday check.
 *
 * @related
 * - src/types/time-tracking.ts — Type definitions
 * - src/app/(platform)/time/page.tsx — UI
 * - supabase/migrations/20260324100000_time_tracking.sql — Schema
 * - supabase/migrations/20260324200000_time_tracking_hardening.sql — RLS hardening
 */

'use server'

import { withAuth } from '@/lib/server-action-utils'
import type {
  TimeEntryWithRelations,
  CreateTimeEntryInput,
  UpdateTimeEntryInput,
  WeekSummary,
  TimeEntryStatus,
} from '@/types/time-tracking'
import { toTimeEntryWithRelations, TIME_ENTRY_SELECT } from '@/lib/time-tracking-utils'

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Validate a YYYY-MM-DD string is a real date. */
function isValidDate(dateStr: string): boolean {
  if (!DATE_RE.test(dateStr)) return false
  const d = new Date(dateStr + 'T00:00:00Z')
  return !isNaN(d.getTime()) && d.toISOString().startsWith(dateStr)
}

/** Validate weekStart is a valid Monday. */
function isValidMonday(dateStr: string): boolean {
  if (!isValidDate(dateStr)) return false
  const d = new Date(dateStr + 'T00:00:00Z')
  return d.getUTCDay() === 1 // Monday
}

/** Get today's date in YYYY-MM-DD (UTC). */
function todayUTC(): string {
  return new Date().toISOString().split('T')[0]
}

const MAX_DESCRIPTION_LENGTH = 5000

// INTENT: toTimeEntryWithRelations and TIME_ENTRY_SELECT live in
// @/lib/time-tracking-utils (extracted from 'use server' file because
// Next.js 16 only allows async function exports from server action files).

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the current user's time entries for a given week.
 *
 * @param weekStart - ISO date string for Monday of the target week (YYYY-MM-DD)
 * @returns Array of time entries with relations, or error
 */
export async function getMyTimeEntries(weekStart: string) {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // VALIDATION: weekStart must be a valid Monday
    if (!isValidMonday(weekStart)) {
      return { error: 'Invalid week start date — must be a Monday in YYYY-MM-DD format' }
    }

    const weekEnd = addDays(weekStart, 6)

    const { data, error } = await supabase
      .from('time_entries')
      .select(TIME_ENTRY_SELECT)
      .eq('foundry_id', foundryId)
      .eq('user_id', user.id)
      .gte('entry_date', weekStart)
      .lte('entry_date', weekEnd)
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) return { error: error.message }

    const entries = (data ?? []).map(toTimeEntryWithRelations)
    return { success: true as const, data: entries }
  })
}

/**
 * Create a manual time entry.
 *
 * @param input - Entry data (date, duration, description, optional task/project)
 * @returns The created entry, or error
 */
export async function createTimeEntry(input: CreateTimeEntryInput) {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // VALIDATION: Date format
    if (!isValidDate(input.entryDate)) {
      return { error: 'Invalid date format — use YYYY-MM-DD' }
    }

    // VALIDATION: Duration must be a whole number 1–1440
    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 1440) {
      return { error: 'Duration must be a whole number between 1 and 1440 minutes' }
    }

    // VALIDATION: Date cannot be in the future
    if (input.entryDate > todayUTC()) {
      return { error: 'Cannot log time for future dates' }
    }

    // VALIDATION: Description length
    if (input.description.length > MAX_DESCRIPTION_LENGTH) {
      return { error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer` }
    }

    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        foundry_id: foundryId,
        user_id: user.id,
        entry_date: input.entryDate,
        duration_minutes: input.durationMinutes,
        description: input.description,
        task_id: input.taskId ?? null,
        finance_project_id: input.financeProjectId ?? null,
        is_billable: input.isBillable ?? true,
      })
      .select(TIME_ENTRY_SELECT)
      .single()

    if (error) return { error: error.message }

    return { success: true as const, data: toTimeEntryWithRelations(data) }
  })
}

/**
 * Update an existing time entry. Only own draft/rejected entries can be updated.
 *
 * @param id - Time entry ID
 * @param input - Fields to update
 * @returns The updated entry, or error
 */
export async function updateTimeEntry(id: string, input: UpdateTimeEntryInput) {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // VALIDATION: Duration bounds + integer
    if (input.durationMinutes != null) {
      if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 1440) {
        return { error: 'Duration must be a whole number between 1 and 1440 minutes' }
      }
    }

    // VALIDATION: Date format + no future dates
    if (input.entryDate !== undefined) {
      if (!isValidDate(input.entryDate)) {
        return { error: 'Invalid date format — use YYYY-MM-DD' }
      }
      if (input.entryDate > todayUTC()) {
        return { error: 'Cannot log time for future dates' }
      }
    }

    // VALIDATION: Description length
    if (input.description !== undefined && input.description.length > MAX_DESCRIPTION_LENGTH) {
      return { error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer` }
    }

    // SECURITY: Build update payload — only include provided fields (allowlist)
    const updates: Record<string, unknown> = {}
    if (input.entryDate !== undefined) updates.entry_date = input.entryDate
    if (input.durationMinutes !== undefined) updates.duration_minutes = input.durationMinutes
    if (input.description !== undefined) updates.description = input.description
    if (input.taskId !== undefined) updates.task_id = input.taskId
    if (input.financeProjectId !== undefined) updates.finance_project_id = input.financeProjectId
    if (input.isBillable !== undefined) updates.is_billable = input.isBillable

    const { data, error } = await supabase
      .from('time_entries')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('foundry_id', foundryId)
      .in('status', ['draft', 'rejected'])
      .select(TIME_ENTRY_SELECT)
      .single()

    if (error) return { error: error.message }

    return { success: true as const, data: toTimeEntryWithRelations(data) }
  })
}

/**
 * Delete a time entry. Only own draft entries can be deleted.
 *
 * @param id - Time entry ID
 * @returns Success or error
 */
export async function deleteTimeEntry(id: string) {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // SECURITY: select() to verify a row was actually deleted (C-4 fix)
    const { data, error } = await supabase
      .from('time_entries')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('foundry_id', foundryId)
      .eq('status', 'draft')
      .select('id')

    if (error) return { error: error.message }

    if (!data || data.length === 0) {
      return { error: 'Entry not found or cannot be deleted (only draft entries can be deleted)' }
    }

    return { success: true as const }
  })
}

/**
 * Get an aggregated weekly summary for the current user.
 *
 * @param weekStart - ISO date string for Monday of the target week (YYYY-MM-DD)
 * @returns WeekSummary with totals, by-day breakdown, and status counts
 */
export async function getWeekSummary(weekStart: string) {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // VALIDATION: weekStart must be a valid Monday
    if (!isValidMonday(weekStart)) {
      return { error: 'Invalid week start date — must be a Monday in YYYY-MM-DD format' }
    }

    const weekEnd = addDays(weekStart, 6)

    const { data, error } = await supabase
      .from('time_entries')
      .select(TIME_ENTRY_SELECT)
      .eq('foundry_id', foundryId)
      .eq('user_id', user.id)
      .gte('entry_date', weekStart)
      .lte('entry_date', weekEnd)
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) return { error: error.message }

    const entries = (data ?? []).map(toTimeEntryWithRelations)

    // Aggregate
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

    const summary: WeekSummary = {
      weekStart,
      totalMinutes,
      billableMinutes,
      entriesByDay,
      statusCounts,
    }

    return { success: true as const, data: summary }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight aggregation actions (sidebar, dashboard, task detail)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get weekly time progress for the sidebar bar. Lightweight — SUM only.
 *
 * @returns totalMinutes, billableMinutes, todayMinutes for current week
 */
export async function getWeeklyTimeProgress() {
  return withAuth(async ({ supabase, user, foundryId }) => {
    const today = todayUTC()
    const weekStart = getCurrentMondayUTC()
    const weekEnd = addDays(weekStart, 6)

    const { data, error } = await supabase
      .from('time_entries')
      .select('duration_minutes, is_billable, entry_date')
      .eq('foundry_id', foundryId)
      .eq('user_id', user.id)
      .gte('entry_date', weekStart)
      .lte('entry_date', weekEnd)

    if (error) return { error: error.message }

    let totalMinutes = 0
    let billableMinutes = 0
    let todayMinutes = 0
    for (const row of data ?? []) {
      const mins = row.duration_minutes ?? 0
      totalMinutes += mins
      if (row.is_billable) billableMinutes += mins
      if (row.entry_date === today) todayMinutes += mins
    }

    // Fetch user's weekly target (fallback to 40h if column doesn't exist yet)
    const { data: profile } = await supabase
      .from('profiles')
      .select('weekly_target_minutes')
      .eq('id', user.id)
      .single()

    const targetMinutes = (profile as { weekly_target_minutes?: number | null } | null)?.weekly_target_minutes ?? 2400

    return { totalMinutes, billableMinutes, todayMinutes, targetMinutes }
  })
}

/** Get the Monday (UTC) of the current week. */
function getCurrentMondayUTC(): string {
  const d = new Date()
  const utcDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = utcDate.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  utcDate.setUTCDate(utcDate.getUTCDate() + diff)
  return utcDate.toISOString().split('T')[0]
}

/**
 * Get total time logged against a specific task.
 *
 * @param taskId - The task to query
 * @returns totalMinutes and entryCount, or error
 */
export async function getTimeForTask(taskId: string) {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!taskId) return { error: 'taskId required' }

    const { data, error } = await supabase
      .from('time_entries')
      .select('duration_minutes')
      .eq('foundry_id', foundryId)
      .eq('task_id', taskId)

    if (error) return { error: error.message }

    // INTENT: Shows all team members' time on this task, not just the caller.
    // This is intentional — tasks are collaborative, time visibility aids estimation.
    const totalMinutes = (data ?? []).reduce((sum, row) => sum + (row.duration_minutes ?? 0), 0)
    return { totalMinutes, entryCount: data?.length ?? 0 }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Timer actions (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start a timer. Creates a time_entry with started_at = now, ended_at = null.
 * The unique constraint prevents multiple active timers per user/foundry.
 */
export async function startTimer(taskId?: string | null, description?: string) {
  return withAuth(async ({ supabase, user, foundryId }) => {
    const today = todayUTC()

    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        foundry_id: foundryId,
        user_id: user.id,
        entry_date: today,
        duration_minutes: 1, // placeholder — computed on stop
        started_at: new Date().toISOString(),
        description: description?.slice(0, 5000) ?? '',
        task_id: taskId || null,
        is_billable: true,
        status: 'draft',
      })
      .select('id, started_at, description, task_id')
      .single()

    if (error) {
      // Unique constraint violation = already have an active timer
      if (error.code === '23505') return { error: 'A timer is already running. Stop it before starting a new one.' }
      return { error: error.message }
    }

    return data
  })
}

/**
 * Stop the active timer. Computes duration from started_at → now.
 */
export async function stopTimer() {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // Find the active timer
    const { data: active, error: findErr } = await supabase
      .from('time_entries')
      .select('id, started_at')
      .eq('foundry_id', foundryId)
      .eq('user_id', user.id)
      .is('ended_at', null)
      .not('started_at', 'is', null)
      .single()

    if (findErr || !active) return { error: 'No active timer found' }

    const startedAt = new Date(active.started_at!)
    const now = new Date()
    const durationMinutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60000))

    // Use the start date for entry_date (handles midnight crossing)
    const entryDate = startedAt.toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('time_entries')
      .update({
        ended_at: now.toISOString(),
        duration_minutes: Math.min(durationMinutes, 1440),
        entry_date: entryDate,
      })
      .eq('id', active.id)
      .select('id, duration_minutes, entry_date, description, task_id')
      .single()

    if (error) return { error: error.message }

    return data
  })
}

/**
 * Get the currently active timer (if any). Lightweight — called on layout mount.
 */
export async function getActiveTimer() {
  return withAuth(async ({ supabase, user, foundryId }) => {
    const { data, error } = await supabase
      .from('time_entries')
      .select('id, started_at, description, task_id, tasks(title)')
      .eq('foundry_id', foundryId)
      .eq('user_id', user.id)
      .is('ended_at', null)
      .not('started_at', 'is', null)
      .maybeSingle()

    if (error) return { error: error.message }
    if (!data) return { active: false as const }

    return {
      active: true as const,
      id: data.id,
      startedAt: data.started_at!,
      description: data.description,
      taskTitle: (data.tasks as { title: string } | null)?.title ?? null,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly target
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update the user's weekly time target (in minutes).
 */
export async function updateWeeklyTarget(targetMinutes: number) {
  return withAuth(async ({ supabase, user }) => {
    if (!Number.isInteger(targetMinutes) || targetMinutes < 60 || targetMinutes > 10080) {
      return { error: 'Target must be between 1h and 168h per week' }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ weekly_target_minutes: targetMinutes })
      .eq('id', user.id)

    if (error) return { error: error.message }
    return { success: true }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Date utility (avoids importing date-fns in server action)
// ─────────────────────────────────────────────────────────────────────────────

/** Add days to an ISO date string, returning a new ISO date string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}
