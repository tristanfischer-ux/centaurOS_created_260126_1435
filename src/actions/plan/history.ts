'use server'

/**
 * @file src/actions/plan/history.ts
 *
 * History entries — the passive decision/event log (PLAN-SCHEMA §9, §17.5,
 * §18).
 *
 * Key behaviour:
 * - `editHistoryEntryBody` enforces the 5-minute edit-lock server-side
 *   (PLAN-SCHEMA §17.5). Within 5 min of created_at the body is updated in
 *   place. After 5 min the original body is captured into edit_log_json as
 *   a `{at, prev_body, user_id, field: 'body'}` entry and the new body is
 *   applied — append-only, never destructive.
 * - Hard delete is blocked by the RLS DELETE policy (WITH CHECK (false)),
 *   so we never expose a `deleteHistoryEntry` here.
 */

import { revalidatePath } from 'next/cache'

import { withAuth } from '@/lib/server-action-utils'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { logAudit } from '@/actions/audit'

import {
  editHistoryBodyInputSchema,
  HISTORY_EDIT_LOCK_MS,
  manualHistoryEntryInputSchema,
  markHistoryOutcomeInputSchema,
  type EditHistoryBodyInput,
  type HistoryRow,
  type ManualHistoryEntryInput,
  type MarkHistoryOutcomeInput,
  type PlanActionResult,
} from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

async function planCan(
  supabase: SupabaseLike,
  userId: string,
  foundryId: string,
  action: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('plan_can', {
    p_user_id: userId,
    p_foundry_id: foundryId,
    p_action: action,
  })
  if (error) {
    console.error('[plan/history] plan_can RPC failed:', {
      action,
      error: error.message,
    })
    return false
  }
  return data === true
}

// ──────────────────────────────────────────────────────────────────────────
// addManualHistoryEntry
// ──────────────────────────────────────────────────────────────────────────

/**
 * Founder-authored manual history entry — captures rationale that isn't
 * already implied by a system action.
 *
 * @permission add_manual_history
 * @audit action='history_entry.created' · metadata.entry_type='manual'
 */
export async function addManualHistoryEntry(
  input: ManualHistoryEntryInput,
): Promise<PlanActionResult<HistoryRow>> {
  return withAuth<PlanActionResult<HistoryRow>>(
    async ({ supabase, user, foundryId }) => {
      const parsed = manualHistoryEntryInputSchema.safeParse(input)
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
      }
      const data = parsed.data

      const allowed = await planCan(
        supabase,
        user.id,
        foundryId,
        'add_manual_history',
      )
      if (!allowed) {
        return { error: 'Not permitted to add history entries' }
      }

      const { data: row, error } = await supabase
        .from('history_entries')
        .insert({
          foundry_id: foundryId,
          entry_type: 'manual',
          title: data.title,
          body: data.body ?? null,
          actor_type: 'founder',
          actor_id: user.id,
          goal_id: data.goalId ?? null,
          related_ids_json: data.relatedIds ?? null,
          outcome: data.outcome ?? null,
          outcome_note: data.outcomeNote ?? null,
          grounding_text: data.groundingText ?? null,
          alternatives_json: data.alternatives ?? null,
          edit_log_json: [],
        })
        .select('*')
        .single()

      if (error || !row) {
        return { error: sanitizeErrorMessage(error ?? 'Create failed') }
      }

      await logAudit({
        action: 'history_entry.created' as never,
        entityType: 'history_entry',
        entityId: row.id,
        userId: user.id,
        foundryId,
        metadata: { entry_type: 'manual', goal_id: data.goalId ?? null },
      })

      revalidatePath('/plan/history')
      if (data.goalId) revalidatePath(`/plan/goal/${data.goalId}`)
      return { success: true, data: row as HistoryRow }
    },
  )
}

// ──────────────────────────────────────────────────────────────────────────
// markHistoryOutcome
// ──────────────────────────────────────────────────────────────────────────

/**
 * Set outcome / outcome_note on an existing entry. Past the 5-min edit
 * lock the outcome change is still recorded in edit_log_json as a
 * structured item; within the window it's a plain update.
 *
 * @permission mark_history_outcome
 * @audit action='history_entry.outcome_marked' · metadata.{from, to}
 */
export async function markHistoryOutcome(
  id: string,
  outcome: MarkHistoryOutcomeInput['outcome'],
  note?: string | null,
): Promise<PlanActionResult<HistoryRow>> {
  return withAuth<PlanActionResult<HistoryRow>>(
    async ({ supabase, user, foundryId }) => {
      const parsed = markHistoryOutcomeInputSchema.safeParse({
        id,
        outcome,
        note,
      })
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
      }

      const allowed = await planCan(
        supabase,
        user.id,
        foundryId,
        'mark_history_outcome',
      )
      if (!allowed) {
        return { error: 'Not permitted to mark outcome' }
      }

      const { data: existing, error: readErr } = await supabase
        .from('history_entries')
        .select('id, created_at, outcome, outcome_note, edit_log_json')
        .eq('id', parsed.data.id)
        .eq('foundry_id', foundryId)
        .maybeSingle()
      if (readErr || !existing) return { error: 'Entry not found' }

      const now = Date.now()
      const createdMs = new Date(existing.created_at).getTime()
      const withinLock = now - createdMs < HISTORY_EDIT_LOCK_MS

      const updatePayload: Record<string, unknown> = {
        outcome: parsed.data.outcome,
        outcome_note: parsed.data.note ?? null,
      }

      // After the lock, capture prior outcome into edit_log_json.
      if (!withinLock) {
        const appended = [
          ...(existing.edit_log_json ?? []),
          {
            at: new Date(now).toISOString(),
            by: user.id,
            from: existing.outcome ?? null,
            to: parsed.data.outcome,
            field: 'outcome',
          },
        ]
        updatePayload.edit_log_json = appended
      }

      const { data: updated, error } = await supabase
        .from('history_entries')
        .update(updatePayload)
        .eq('id', parsed.data.id)
        .eq('foundry_id', foundryId)
        .select('*')
        .single()

      if (error || !updated) {
        return { error: sanitizeErrorMessage(error ?? 'Update failed') }
      }

      await logAudit({
        action: 'history_entry.outcome_marked' as never,
        entityType: 'history_entry',
        entityId: parsed.data.id,
        userId: user.id,
        foundryId,
        metadata: {
          from: existing.outcome ?? null,
          to: parsed.data.outcome,
          within_edit_lock: withinLock,
        },
      })

      revalidatePath('/plan/history')
      return { success: true, data: updated as HistoryRow }
    },
  )
}

// ──────────────────────────────────────────────────────────────────────────
// editHistoryEntryBody — 5-minute edit-lock
// ──────────────────────────────────────────────────────────────────────────

/**
 * Edit the `body` of a history entry.
 *
 * Edit-lock rule (PLAN-SCHEMA §17.5):
 *   - Within 5 min of `created_at`: UPDATE body in place. No edit_log row.
 *   - After 5 min: append `{at, prev_body, user_id, field:'body'}` to
 *     `edit_log_json` AND update body. Never destructive — the prior body
 *     is always recoverable from the append log.
 *
 * @permission add_manual_history (same role set that can author entries)
 * @audit action='history_entry.body_edited' · metadata.within_edit_lock
 */
export async function editHistoryEntryBody(
  id: string,
  newBody: string,
): Promise<PlanActionResult<HistoryRow>> {
  return withAuth<PlanActionResult<HistoryRow>>(
    async ({ supabase, user, foundryId }) => {
      const parsed = editHistoryBodyInputSchema.safeParse({ id, newBody })
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
      }

      const allowed = await planCan(
        supabase,
        user.id,
        foundryId,
        'add_manual_history',
      )
      if (!allowed) {
        return { error: 'Not permitted to edit history entries' }
      }

      // 1. Read current row to capture created_at + body + edit_log_json.
      const { data: existing, error: readErr } = await supabase
        .from('history_entries')
        .select('id, created_at, body, edit_log_json')
        .eq('id', parsed.data.id)
        .eq('foundry_id', foundryId)
        .maybeSingle()
      if (readErr || !existing) return { error: 'Entry not found' }

      const now = Date.now()
      const createdMs = new Date(existing.created_at).getTime()
      const withinLock = now - createdMs < HISTORY_EDIT_LOCK_MS

      let updatePayload: Record<string, unknown>
      if (withinLock) {
        // Plain in-place body update, no edit-log append.
        updatePayload = { body: parsed.data.newBody }
      } else {
        // Append-only: capture the prior body into edit_log_json and set
        // the new body.
        const appended = [
          ...(existing.edit_log_json ?? []),
          {
            at: new Date(now).toISOString(),
            by: user.id,
            from: existing.body ?? null,
            to: parsed.data.newBody,
            field: 'body',
            // Capture prev_body explicitly for the §17.5 recovery query
            // even though `from` duplicates it — the schema comment calls
            // out prev_body by name.
            prev_body: existing.body ?? null,
            user_id: user.id,
          },
        ]
        updatePayload = {
          body: parsed.data.newBody,
          edit_log_json: appended,
        }
      }

      const { data: updated, error } = await supabase
        .from('history_entries')
        .update(updatePayload)
        .eq('id', parsed.data.id)
        .eq('foundry_id', foundryId)
        .select('*')
        .single()

      if (error || !updated) {
        return { error: sanitizeErrorMessage(error ?? 'Edit failed') }
      }

      await logAudit({
        action: 'history_entry.body_edited' as never,
        entityType: 'history_entry',
        entityId: parsed.data.id,
        userId: user.id,
        foundryId,
        metadata: {
          within_edit_lock: withinLock,
          // Capture the age of the entry in seconds for forensics.
          entry_age_seconds: Math.floor((now - createdMs) / 1000),
        },
      })

      revalidatePath('/plan/history')
      return { success: true, data: updated as HistoryRow }
    },
  )
}

// ──────────────────────────────────────────────────────────────────────────
// getHistoryEntry
// ──────────────────────────────────────────────────────────────────────────

/**
 * Read a single history entry in the caller's foundry. `related_ids_json`
 * is returned as-stored — caller-side code dereferences ids.
 *
 * @permission view_history
 */
export async function getHistoryEntry(
  id: string,
): Promise<PlanActionResult<HistoryRow>> {
  return withAuth<PlanActionResult<HistoryRow>>(
    async ({ supabase, user, foundryId }) => {
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return { error: 'Invalid id' }
      }

      const allowed = await planCan(supabase, user.id, foundryId, 'view_history')
      if (!allowed) return { error: 'Not permitted to view history' }

      const { data, error } = await supabase
        .from('history_entries')
        .select('*')
        .eq('id', id)
        .eq('foundry_id', foundryId)
        .maybeSingle()

      if (error) return { error: sanitizeErrorMessage(error) }
      if (!data) return { error: 'Entry not found' }

      return { success: true, data: data as HistoryRow }
    },
  )
}

// NOTE: per "use server" rule, only async functions may be exported here.
// Input types (ManualHistoryEntryInput / MarkHistoryOutcomeInput /
// EditHistoryBodyInput) live in ./types.ts and are imported by callers
// directly from that module, not re-exported from here.
