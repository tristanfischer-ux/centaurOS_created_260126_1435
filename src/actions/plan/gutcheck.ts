'use server'

/**
 * @file src/actions/plan/gutcheck.ts
 *
 * Mid-quarter Gutcheck server actions (PLAN-SCHEMA §11, §18).
 *
 * - fireGutcheckIfDue: idempotent — only inserts a new session if no
 *   pending (decision IS NULL) session exists for the goal.
 * - decideGutcheck: records founder decision, writes history, and when
 *   decision='kill' cascades into `killGoal` to flip goal.state='killed'
 *   (and write the kill-history entry).
 */

import { revalidatePath } from 'next/cache'

import { withAuth } from '@/lib/server-action-utils'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { logAudit } from '@/actions/audit'

import { killGoal } from './goals'
import {
  decideGutcheckInputSchema,
  type DecideGutcheckInput,
  type GutcheckRow,
  type HistoryRow,
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
    console.error('[plan/gutcheck] plan_can RPC failed:', {
      action,
      error: error.message,
    })
    return false
  }
  return data === true
}

// ──────────────────────────────────────────────────────────────────────────
// fireGutcheckIfDue
// ──────────────────────────────────────────────────────────────────────────

/**
 * Idempotent session fire. Returns:
 * - `{ success: true, data: session }` if a new row was inserted
 * - `{ success: true, data: null }`    if a pending session already exists
 *   or the goal has no assumptions to snapshot
 *
 * Not gated by plan_can — this is fired by cron (week 6) or by the founder
 * via a manual trigger surface; both are "permitted" in the matrix §16 for
 * founder/co-founder/executive. The real decision gate is on
 * `decideGutcheck`.
 *
 * @audit action='gutcheck.fired' when a row is inserted · metadata.goal_id
 */
export async function fireGutcheckIfDue(
  goalId: string,
): Promise<PlanActionResult<GutcheckRow | null>> {
  return withAuth<PlanActionResult<GutcheckRow | null>>(
    async ({ supabase, user, foundryId }) => {
      if (!/^[0-9a-f-]{36}$/i.test(goalId)) {
        return { error: 'Invalid goalId' }
      }

      // Verify goal exists in this foundry.
      const { data: goal, error: goalErr } = await supabase
        .from('strategic_goals')
        .select('id')
        .eq('id', goalId)
        .eq('foundry_id', foundryId)
        .maybeSingle()
      if (goalErr || !goal) return { error: 'Goal not found' }

      // Idempotency — if a pending session exists, return it without
      // re-firing.
      const { data: pending } = await supabase
        .from('gutcheck_sessions')
        .select('*')
        .eq('foundry_id', foundryId)
        .eq('goal_id', goalId)
        .is('decision', null)
        .order('fired_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (pending) {
        return { success: true, data: pending as GutcheckRow }
      }

      // Snapshot current disprove assumptions into
      // gutcheck_sessions.assumption_states_json.
      const { data: assumptions, error: aErr } = await supabase
        .from('disprove_assumptions')
        .select('id, assumption, current_state, order_index')
        .eq('foundry_id', foundryId)
        .eq('goal_id', goalId)
        .order('order_index', { ascending: true })
      if (aErr) return { error: sanitizeErrorMessage(aErr) }

      const snapshot = (assumptions ?? []).map((a: {
        id: string
        assumption: string
        current_state: string
      }) => ({
        assumption_id: a.id,
        assumption: a.assumption,
        state_at_fire: a.current_state,
      }))

      const { data: session, error: sErr } = await supabase
        .from('gutcheck_sessions')
        .insert({
          foundry_id: foundryId,
          goal_id: goalId,
          fired_at: new Date().toISOString(),
          triggered_by: 'manual',
          assumption_states_json: snapshot,
          cal_narrative: null,
          human_narrative: null,
          decision: null,
          decision_note: null,
          decided_at: null,
        })
        .select('*')
        .single()

      if (sErr || !session) {
        return { error: sanitizeErrorMessage(sErr ?? 'Gutcheck fire failed') }
      }

      await logAudit({
        action: 'gutcheck.fired' as never,
        entityType: 'gutcheck_session',
        entityId: session.id,
        userId: user.id,
        foundryId,
        metadata: { goal_id: goalId, assumption_count: snapshot.length },
      })

      // TODO(Chunk D): emit event_log row per §14.1 — gutcheck fired →
      // high urgency, 1d decay, cta "Make the call".

      revalidatePath(`/plan/goal/${goalId}`)
      return { success: true, data: session as GutcheckRow }
    },
  )
}

// ──────────────────────────────────────────────────────────────────────────
// decideGutcheck
// ──────────────────────────────────────────────────────────────────────────

/**
 * Record the founder decision on a gutcheck session. If decision='kill',
 * also cascades into killGoal() to flip the underlying strategic_goal to
 * state='killed'.
 *
 * @permission decide_gutcheck
 * @audit action='gutcheck.decided' · metadata.decision
 * @history entry_type='gutcheck_outcome'
 */
export async function decideGutcheck(
  sessionId: string,
  decision: DecideGutcheckInput['decision'],
  note: string,
): Promise<PlanActionResult<HistoryRow>> {
  return withAuth<PlanActionResult<HistoryRow>>(
    async ({ supabase, user, foundryId }) => {
      const parsed = decideGutcheckInputSchema.safeParse({
        sessionId,
        decision,
        note,
      })
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
      }

      const allowed = await planCan(
        supabase,
        user.id,
        foundryId,
        'decide_gutcheck',
      )
      if (!allowed) return { error: 'Not permitted to decide this gutcheck' }

      const { data: session, error: readErr } = await supabase
        .from('gutcheck_sessions')
        .select('id, goal_id, decision')
        .eq('id', sessionId)
        .eq('foundry_id', foundryId)
        .maybeSingle()
      if (readErr || !session) return { error: 'Gutcheck session not found' }
      if (session.decision) {
        return { error: 'This gutcheck has already been decided' }
      }

      const decidedAt = new Date().toISOString()
      const { error: updErr } = await supabase
        .from('gutcheck_sessions')
        .update({
          decision: parsed.data.decision,
          decision_note: parsed.data.note,
          decided_at: decidedAt,
        })
        .eq('id', sessionId)
        .eq('foundry_id', foundryId)
      if (updErr) return { error: sanitizeErrorMessage(updErr) }

      // If the decision is to kill, cascade into killGoal. This both flips
      // the goal state and writes its own decision history entry.
      if (parsed.data.decision === 'kill') {
        const killRes = await killGoal(
          session.goal_id,
          `Gutcheck decision: ${parsed.data.note}`,
        )
        if ('error' in killRes && killRes.error) {
          console.error('[plan/gutcheck] kill cascade failed:', killRes.error)
          // Do not abort — the gutcheck decision is already recorded.
        }
      }

      const { data: history, error: hErr } = await supabase
        .from('history_entries')
        .insert({
          foundry_id: foundryId,
          entry_type: 'gutcheck_outcome',
          title: `Gutcheck: ${parsed.data.decision}`,
          body: parsed.data.note,
          actor_type: 'founder',
          actor_id: user.id,
          goal_id: session.goal_id,
          related_ids_json: { gutcheck_id: sessionId },
          outcome:
            parsed.data.decision === 'double_down'
              ? 'positive'
              : parsed.data.decision === 'kill'
                ? 'negative'
                : 'neutral',
        })
        .select('*')
        .single()
      if (hErr || !history) {
        return { error: sanitizeErrorMessage(hErr ?? 'History write failed') }
      }

      await logAudit({
        action: 'gutcheck.decided' as never,
        entityType: 'gutcheck_session',
        entityId: sessionId,
        userId: user.id,
        foundryId,
        metadata: {
          decision: parsed.data.decision,
          goal_id: session.goal_id,
        },
      })

      // TODO(Chunk D): §14.4 — decision NOT NULL resolves the original
      // gutcheck event_log row.

      revalidatePath(`/plan/goal/${session.goal_id}`)
      revalidatePath('/plan')
      return { success: true, data: history as HistoryRow }
    },
  )
}
