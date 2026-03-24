/**
 * @file time-tracking.ts — TypeScript types for the time tracking feature.
 *
 * DECISION: Separate from 'use server' file — Next.js 16 restriction means
 * server action files can ONLY export async functions. Exporting types from
 * a 'use server' file causes runtime error.
 *
 * @related
 * - src/actions/time-tracking.ts — Server actions (CRUD)
 * - supabase/migrations/20260324100000_time_tracking.sql — DB schema
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums / Literals
// ─────────────────────────────────────────────────────────────────────────────

export type TimeEntryStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

// ─────────────────────────────────────────────────────────────────────────────
// Core Entity
// ─────────────────────────────────────────────────────────────────────────────

/** Maps directly to the `time_entries` DB row (camelCase). */
export interface TimeEntry {
  id: string
  foundryId: string
  userId: string
  entryDate: string          // ISO date string (YYYY-MM-DD)
  durationMinutes: number    // 1–1440
  startedAt: string | null
  endedAt: string | null
  description: string
  taskId: string | null
  financeProjectId: string | null
  isBillable: boolean
  hourlyRatePence: number | null
  status: TimeEntryStatus
  submittedAt: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  rejectionReason: string | null
  createdAt: string
  updatedAt: string
}

/** Time entry joined with user, task, and project display names. */
export interface TimeEntryWithRelations extends TimeEntry {
  userName: string
  userAvatarUrl: string | null
  taskTitle: string | null
  projectName: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────────────────────────────────────

/** Input for creating a manual time entry. */
export interface CreateTimeEntryInput {
  entryDate: string           // YYYY-MM-DD
  durationMinutes: number     // 1–1440
  description: string
  taskId?: string | null
  financeProjectId?: string | null
  isBillable?: boolean
}

/** Input for updating an existing time entry (all fields optional). */
export interface UpdateTimeEntryInput {
  entryDate?: string
  durationMinutes?: number
  description?: string
  taskId?: string | null
  financeProjectId?: string | null
  isBillable?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregated Views
// ─────────────────────────────────────────────────────────────────────────────

/** Summary of a user's week for the weekly timesheet view. */
export interface WeekSummary {
  weekStart: string           // ISO date of Monday
  totalMinutes: number
  billableMinutes: number
  entriesByDay: Record<string, TimeEntryWithRelations[]>  // keyed by YYYY-MM-DD
  statusCounts: Record<TimeEntryStatus, number>
}
