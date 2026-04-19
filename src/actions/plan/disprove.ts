'use server'

/**
 * @file src/actions/plan/disprove.ts
 *
 * Disprove-assumption state mutations (PLAN-SCHEMA §2, §18).
 *
 * Callers:
 * - Founder from the goal drill-in pressure-test panel (source='founder')
 * - Specialist cron that refreshes evidence (source='auto_specialist')
 * - Gutcheck firing cron when a state flips at snapshot time
 *   (source='gutcheck')
 */

import { revalidatePath } from 'next/cache'

import { withAuth } from '@/lib/server-action-utils'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { logAudit } from '@/actions/audit'
import { emitPlanEvent } from '@/lib/plan/emit-event'

import {
  setAssumptionStateInputSchema,
  type DisproveRow,
  type PlanActionResult,
  type SetAssumptionStateInput,
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
    console.error('[plan/disprove] plan_can RPC failed:', {
      action,
      error: error.message,
    })
    return false
  }
  return data === true
}

// ──────────────────────────────────────────────────────────────────────────
// setAssumptionState
// ──────────────────────────────────────────────────────────────────────────

/**
 * Update `disprove_assumptions.current_state` + metadata.
 *
 * @permission edit_disprove_assumption (founder/executive only — fractional
 *             /cto/etc. land here only via specialist cron which runs as
 *             service_role and bypasses plan_can).
 * @audit action='disprove_assumption.updated' · metadata.{state, source}
 */
export async function setAssumptionState(
  input: SetAssumptionStateInput,
): Promise<PlanActionResult<DisproveRow>> {
  return withAuth<PlanActionResult<DisproveRow>>(
    async ({ supabase, user, foundryId }) => {
      const parsed = setAssumptionStateInputSchema.safeParse(input)
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
      }
      const data = parsed.data

      const allowed = await planCan(
        supabase,
        user.id,
        foundryId,
        'edit_disprove_assumption',
      )
      if (!allowed) {
        return { error: 'Not permitted to update disprove assumptions' }
      }

      // Verify the assumption lives in this foundry.
      const { data: existing, error: readErr } = await supabase
        .from('disprove_assumptions')
        .select('id, goal_id, current_state')
        .eq('id', data.assumptionId)
        .eq('foundry_id', foundryId)
        .maybeSingle()
      if (readErr || !existing) {
        return { error: 'Assumption not found' }
      }

      const { data: updated, error } = await supabase
        .from('disprove_assumptions')
        .update({
          current_state: data.state,
          last_refreshed_at: new Date().toISOString(),
          refreshed_by: data.source,
          fresh_data_json: data.freshDataJson ?? null,
        })
        .eq('id', data.assumptionId)
        .eq('foundry_id', foundryId)
        .select('*')
        .single()

      if (error || !updated) {
        return { error: sanitizeErrorMessage(error ?? 'Update failed') }
      }

      await logAudit({
        action: 'disprove_assumption.updated' as never,
        entityType: 'disprove_assumption',
        entityId: data.assumptionId,
        userId: user.id,
        foundryId,
        metadata: {
          from: existing.current_state,
          to: data.state,
          source: data.source,
          goal_id: existing.goal_id,
        },
      })

      // PLAN-SCHEMA §14.1 — assumption.current_state transitioning to
      // 'broken' is attention-worthy. CTA opens the pressure-test modal on
      // the goal page. Only emit on the transition INTO broken (not repeat
      // writes while already broken).
      if (data.state === 'broken' && existing.current_state !== 'broken') {
        await emitPlanEvent({
          foundryId,
          sourceEntityType: 'disprove_assumption',
          sourceEntityId: data.assumptionId,
          urgency: 'high',
          decayRate: '3d',
          title: 'Disprove assumption broken',
          body: 'An assumption on this goal has been disproved — pressure-test recommended.',
          ctaLabel: 'Pressure-test goal',
          ctaHref: `plan:goal:${existing.goal_id}?modal=pressure-test`,
          assignedTo: null,
        })
      }

      revalidatePath(`/plan/goal/${existing.goal_id}`)
      return { success: true, data: updated as DisproveRow }
    },
  )
}
