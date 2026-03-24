/**
 * @file time-tracking-utils.ts — Shared utilities for time tracking.
 *
 * DECISION: Extracted from 'use server' file because Next.js 16 restricts
 * server action files to only export async functions. Exporting a non-async
 * mapper function from a 'use server' file causes runtime errors.
 *
 * @related
 * - src/actions/time-tracking.ts — Server actions (uses these utils)
 * - src/app/(platform)/time/page.tsx — Server component (uses these utils)
 * - src/types/time-tracking.ts — Type definitions
 */

import type { TimeEntryWithRelations, TimeEntryStatus } from '@/types/time-tracking'

// ─────────────────────────────────────────────────────────────────────────────
// Select string
// ─────────────────────────────────────────────────────────────────────────────

/** Shared PostgREST select string for time_entries with joined relations. */
export const TIME_ENTRY_SELECT = `
  *,
  user:profiles!user_id(full_name, avatar_url),
  task:tasks!task_id(title),
  project:finance_projects!finance_project_id(name)
`

// ─────────────────────────────────────────────────────────────────────────────
// Row mapper
// ─────────────────────────────────────────────────────────────────────────────

/** Convert a Supabase row (snake_case) to TimeEntryWithRelations (camelCase). */
export function toTimeEntryWithRelations(row: Record<string, unknown>): TimeEntryWithRelations {
  const user = row.user as Record<string, unknown> | null
  const task = row.task as Record<string, unknown> | null
  const project = row.project as Record<string, unknown> | null

  return {
    id: row.id as string,
    foundryId: row.foundry_id as string,
    userId: row.user_id as string,
    entryDate: row.entry_date as string,
    durationMinutes: row.duration_minutes as number,
    startedAt: row.started_at as string | null,
    endedAt: row.ended_at as string | null,
    description: row.description as string,
    taskId: row.task_id as string | null,
    financeProjectId: row.finance_project_id as string | null,
    isBillable: row.is_billable as boolean,
    hourlyRatePence: row.hourly_rate_pence as number | null,
    status: row.status as TimeEntryStatus,
    submittedAt: row.submitted_at as string | null,
    reviewedBy: row.reviewed_by as string | null,
    reviewedAt: row.reviewed_at as string | null,
    rejectionReason: row.rejection_reason as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    userName: (user?.full_name as string) ?? 'Unknown',
    userAvatarUrl: (user?.avatar_url as string) ?? null,
    taskTitle: (task?.title as string) ?? null,
    projectName: (project?.name as string) ?? null,
  }
}
