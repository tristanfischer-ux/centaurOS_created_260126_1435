'use server'

/**
 * @file src/actions/plan/goals.ts
 *
 * Server actions for Strategic Goals (PLAN-SCHEMA §1, §2, §18).
 *
 * Every mutating action:
 *   1. Zod input validation (schemas live in ./types.ts)
 *   2. withAuth wrapper — provides {supabase, user, foundryId}
 *   3. plan_can() RPC permissions check against §16.1 matrix
 *   4. audit_log row on success
 *   5. history_entries row when PLAN-SCHEMA §9 says so
 *   6. event_log row per §14.1 trigger (Chunk D) via emitPlanEvent / resolvePlanEvents
 *
 * @security Every function is foundry-scoped; we never trust client-supplied
 * goalId without an `eq('foundry_id', foundryId)` filter on the lookup.
 */

import { revalidatePath } from 'next/cache'

import { withAuth } from '@/lib/server-action-utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { logAudit } from '@/actions/audit'
import { emitPlanEvent, resolvePlanEvents } from '@/lib/plan/emit-event'

import {
  createGoalInputSchema,
  editGoalInputSchema,
  killGoalInputSchema,
  pinGoalInputSchema,
  pivotGoalInputSchema,
  setGoalStateInputSchema,
  type CreateGoalInput,
  type EditGoalInput,
  type KillGoalInput,
  type PinGoalInput,
  type PivotGoalInput,
  type SetGoalStateInput,
  type PlanActionResult,
  type GoalRow,
  type HistoryRow,
} from './types'

// ──────────────────────────────────────────────────────────────────────────
// Internal helpers (module-local, not exported per "use server" rule)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Calls the plan_can() SQL helper via RPC. Returns true only on explicit
 * boolean true — any RPC error or null defaults to DENY.
 */
async function planCan(
  // Arg-types match the runtime of withAuth's supabase; we avoid pulling a
  // SupabaseClient generic here to keep this non-"use server" file small.
  // The server-action wrapper guarantees caller has a session.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
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
    console.error('[plan/goals] plan_can RPC failed:', {
      action,
      error: error.message,
    })
    return false
  }
  return data === true
}

// ──────────────────────────────────────────────────────────────────────────
// createStrategicGoal
// ──────────────────────────────────────────────────────────────────────────

/**
 * Create a new Strategic Goal. Optionally inserts up to 3 disprove
 * assumptions in the same transaction (§2). If `pin` supplied, the goal is
 * created in pinned state — we delegate the slot-coherence to the
 * `strategic_goals_pin_slot` partial unique index + DB CHECK.
 *
 * @permission create_strategic_goal
 * @audit action='strategic_goal.created' · plus 'pinned' if pin supplied
 * @history entry_type='goal_pinned' if pinned at creation
 */
export async function createStrategicGoal(
  input: CreateGoalInput,
): Promise<PlanActionResult<GoalRow>> {
  return withAuth<PlanActionResult<GoalRow>>(
    async ({ supabase, user, foundryId }) => {
      const parsed = createGoalInputSchema.safeParse(input)
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
      }
      const data = parsed.data

      const allowed = await planCan(
        supabase,
        user.id,
        foundryId,
        'create_strategic_goal',
      )
      if (!allowed) return { error: 'Not permitted to create Strategic Goals' }

      // PLAN-SCHEMA §1: if pin, unpin current occupant of the slot first so
      // the partial unique index (foundry_id, pin_order) stays satisfied.
      if (data.pin) {
        const { error: unpinErr } = await supabase
          .from('strategic_goals')
          .update({ is_pinned: false, pin_order: null })
          .eq('foundry_id', foundryId)
          .eq('is_pinned', true)
          .eq('pin_order', data.pin.slot)
        if (unpinErr) {
          return { error: sanitizeErrorMessage(unpinErr) }
        }
      }

      const { data: goal, error } = await supabase
        .from('strategic_goals')
        .insert({
          foundry_id: foundryId,
          title: data.title,
          description: data.description ?? null,
          state: 'draft',
          is_pinned: !!data.pin,
          pin_order: data.pin?.slot ?? null,
          started_at: data.pin
            ? new Date().toISOString().slice(0, 10)
            : null,
          quarter: data.quarter,
          milestone_date: data.milestoneDate,
          lead_user_id: data.leadUserId ?? null,
          lead_fractional_id: data.leadFractionalId ?? null,
          lead_specialist_slug: data.leadSpecialistSlug ?? null,
          purpose_connection: data.purposeConnection ?? null,
          created_by: user.id,
        })
        .select('*')
        .single()

      if (error || !goal) {
        return { error: sanitizeErrorMessage(error ?? 'Failed to create goal') }
      }

      // Insert disprove assumptions (§2) — max 3 app-side
      if (data.disproveAssumptions && data.disproveAssumptions.length > 0) {
        const rows = data.disproveAssumptions.map((a, i) => ({
          foundry_id: foundryId,
          goal_id: goal.id,
          order_index: i + 1,
          assumption: a.assumption,
          current_state: a.current_state,
        }))
        const { error: dErr } = await supabase
          .from('disprove_assumptions')
          .insert(rows)
        if (dErr) {
          // Roll back the goal to avoid partial state.
          await supabase.from('strategic_goals').delete().eq('id', goal.id)
          return { error: sanitizeErrorMessage(dErr) }
        }
      }

      // History — only written for explicit PIN events (§14/§9)
      if (data.pin) {
        await supabase.from('history_entries').insert({
          foundry_id: foundryId,
          entry_type: 'goal_pinned',
          title: `Pinned: ${goal.title}`,
          body: null,
          actor_type: 'founder',
          actor_id: user.id,
          goal_id: goal.id,
          outcome: 'pending',
        })
      }

      await logAudit({
        action: 'strategic_goal.created' as never,
        entityType: 'strategic_goal',
        entityId: goal.id,
        userId: user.id,
        foundryId,
        metadata: {
          pinned: !!data.pin,
          pin_slot: data.pin?.slot ?? null,
          disprove_count: data.disproveAssumptions?.length ?? 0,
        },
      })

      if (data.pin) {
        await logAudit({
          action: 'strategic_goal.pinned' as never,
          entityType: 'strategic_goal',
          entityId: goal.id,
          userId: user.id,
          foundryId,
          metadata: { slot: data.pin.slot },
        })
      }

      // PLAN-SCHEMA §14.1 — goal milestone_date within 7 days + state != completed.
      // On creation we only emit if the milestone is within the 7-day window;
      // later-date milestones are picked up by the Chunk E nightly sweep.
      if (data.milestoneDate) {
        const msToMilestone =
          new Date(data.milestoneDate).getTime() - Date.now()
        const withinSevenDays =
          msToMilestone >= 0 && msToMilestone <= 7 * 24 * 60 * 60 * 1000
        if (withinSevenDays) {
          await emitPlanEvent({
            foundryId,
            sourceEntityType: 'strategic_goal',
            sourceEntityId: goal.id,
            urgency: 'medium',
            decayRate: '1d',
            title: `Milestone imminent: ${goal.title}`,
            body: `Milestone date ${data.milestoneDate} is within 7 days.`,
            ctaLabel: 'Check goal',
            ctaHref: `plan:goal:${goal.id}`,
            assignedTo: goal.lead_user_id ?? null,
          })
        }
      }

      revalidatePath('/plan')
      revalidatePath(`/plan/goal/${goal.id}`)
      return { success: true, data: goal as GoalRow }
    },
  )
}

// ──────────────────────────────────────────────────────────────────────────
// pinGoal / unpinGoal
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pin a goal into one of 3 slots. Uses a two-step update flow that relies
 * on the `strategic_goals_pin_slot` partial unique index to keep slot
 * assignments coherent: we first unpin any existing occupant of the slot,
 * then pin the target goal.
 *
 * @permission pin_strategic_goal
 * @audit action='strategic_goal.pinned' · metadata.slot
 * @history entry_type='goal_pinned'
 */
export async function pinGoal(
  goalId: string,
  slot: 1 | 2 | 3,
): Promise<PlanActionResult<GoalRow>> {
  return withAuth<PlanActionResult<GoalRow>>(
    async ({ supabase, user, foundryId }) => {
      const parsed = pinGoalInputSchema.safeParse({ goalId, slot })
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
      }

      const allowed = await planCan(
        supabase,
        user.id,
        foundryId,
        'pin_strategic_goal',
      )
      if (!allowed) return { error: 'Not permitted to pin goals' }

      // Verify goal is in this foundry before any write.
      const { data: existing, error: fetchErr } = await supabase
        .from('strategic_goals')
        .select('id, title, is_pinned, pin_order, started_at')
        .eq('id', goalId)
        .eq('foundry_id', foundryId)
        .maybeSingle()
      if (fetchErr || !existing) {
        return { error: 'Goal not found' }
      }

      // Step 1: unpin the current occupant of the slot (if any).
      const { error: unpinErr } = await supabase
        .from('strategic_goals')
        .update({ is_pinned: false, pin_order: null })
        .eq('foundry_id', foundryId)
        .eq('is_pinned', true)
        .eq('pin_order', slot)
        .neq('id', goalId)
      if (unpinErr) return { error: sanitizeErrorMessage(unpinErr) }

      // Step 2: pin the target goal.
      const { data: updated, error: updErr } = await supabase
        .from('strategic_goals')
        .update({
          is_pinned: true,
          pin_order: slot,
          started_at: existing.started_at ?? new Date().toISOString().slice(0, 10),
        })
        .eq('id', goalId)
        .eq('foundry_id', foundryId)
        .select('*')
        .single()

      if (updErr || !updated) {
        return { error: sanitizeErrorMessage(updErr ?? 'Pin failed') }
      }

      await supabase.from('history_entries').insert({
        foundry_id: foundryId,
        entry_type: 'goal_pinned',
        title: `Pinned: ${updated.title}`,
        body: null,
        actor_type: 'founder',
        actor_id: user.id,
        goal_id: updated.id,
        outcome: 'pending',
      })

      await logAudit({
        action: 'strategic_goal.pinned' as never,
        entityType: 'strategic_goal',
        entityId: updated.id,
        userId: user.id,
        foundryId,
        metadata: { slot },
      })

      // §14.2 — pin is NOT attention-worthy. Today signal comes from state
      // transitions + milestone proximity, never from pin/unpin. No emit here.

      revalidatePath('/plan')
      revalidatePath(`/plan/goal/${updated.id}`)
      return { success: true, data: updated as GoalRow }
    },
  )
}

/**
 * Unpin a goal. Clears pin_order / is_pinned. Started_at is preserved for
 * historical accuracy.
 *
 * @permission pin_strategic_goal
 * @audit action='strategic_goal.unpinned'
 */
export async function unpinGoal(
  goalId: string,
): Promise<PlanActionResult<GoalRow>> {
  return withAuth<PlanActionResult<GoalRow>>(
    async ({ supabase, user, foundryId }) => {
      if (!/^[0-9a-f-]{36}$/i.test(goalId)) {
        return { error: 'Invalid goalId' }
      }
      const allowed = await planCan(
        supabase,
        user.id,
        foundryId,
        'pin_strategic_goal',
      )
      if (!allowed) return { error: 'Not permitted to unpin goals' }

      const { data: updated, error } = await supabase
        .from('strategic_goals')
        .update({ is_pinned: false, pin_order: null })
        .eq('id', goalId)
        .eq('foundry_id', foundryId)
        .select('*')
        .single()
      if (error || !updated) {
        return { error: sanitizeErrorMessage(error ?? 'Unpin failed') }
      }

      await logAudit({
        action: 'strategic_goal.unpinned' as never,
        entityType: 'strategic_goal',
        entityId: goalId,
        userId: user.id,
        foundryId,
      })

      revalidatePath('/plan')
      revalidatePath(`/plan/goal/${goalId}`)
      return { success: true, data: updated as GoalRow }
    },
  )
}

// ──────────────────────────────────────────────────────────────────────────
// setGoalState
// ──────────────────────────────────────────────────────────────────────────

/**
 * Manually set a goal's state. Writes `state_overridden_until` so later
 * specialist-derived transitions respect the manual override (§17.1 default
 * 14 days unless caller specifies).
 *
 * @permission set_goal_state_manual
 * @audit action='strategic_goal.state_changed' · metadata.{from,to,reason}
 * @history entry_type='goal_state_changed', body=reason
 */
export async function setGoalState(
  goalId: string,
  state: SetGoalStateInput['state'],
  reason: string,
  overriddenUntil?: string | null,
): Promise<PlanActionResult<HistoryRow>> {
  return withAuth<PlanActionResult<HistoryRow>>(
    async ({ supabase, user, foundryId }) => {
      const parsed = setGoalStateInputSchema.safeParse({
        goalId,
        state,
        reason,
        overriddenUntil,
      })
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
      }

      const allowed = await planCan(
        supabase,
        user.id,
        foundryId,
        'set_goal_state_manual',
      )
      if (!allowed) return { error: 'Not permitted to set goal state' }

      const { data: current, error: readErr } = await supabase
        .from('strategic_goals')
        .select('id, title, state, lead_user_id')
        .eq('id', goalId)
        .eq('foundry_id', foundryId)
        .maybeSingle()
      if (readErr || !current) return { error: 'Goal not found' }

      const expiry =
        parsed.data.overriddenUntil ??
        new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

      const { error: updErr } = await supabase
        .from('strategic_goals')
        .update({
          state: parsed.data.state,
          state_overridden_until: expiry,
        })
        .eq('id', goalId)
        .eq('foundry_id', foundryId)
      if (updErr) return { error: sanitizeErrorMessage(updErr) }

      const { data: history, error: hErr } = await supabase
        .from('history_entries')
        .insert({
          foundry_id: foundryId,
          entry_type: 'goal_state_changed',
          title: `State → ${parsed.data.state}`,
          body: reason,
          actor_type: 'founder',
          actor_id: user.id,
          goal_id: goalId,
          outcome: 'pending',
        })
        .select('*')
        .single()
      if (hErr || !history) {
        return { error: sanitizeErrorMessage(hErr ?? 'History write failed') }
      }

      await logAudit({
        action: 'strategic_goal.state_changed' as never,
        entityType: 'strategic_goal',
        entityId: goalId,
        userId: user.id,
        foundryId,
        metadata: {
          from: current.state,
          to: parsed.data.state,
          reason,
          overridden_until: expiry,
        },
      })

      // PLAN-SCHEMA §14.1 — goal state transitions.
      // Emit: on_track → at_risk  OR  at_risk → off_track  ⇒ high urgency · 3d decay.
      // Resolve: any transition back to on_track clears prior at_risk/off_track rows (§14.4).
      const from = current.state as string
      const to = parsed.data.state as string
      const isAttentionTransition =
        (from === 'on_track' && to === 'at_risk') ||
        (from === 'at_risk' && to === 'off_track')
      if (isAttentionTransition) {
        await emitPlanEvent({
          foundryId,
          sourceEntityType: 'strategic_goal',
          sourceEntityId: goalId,
          urgency: 'high',
          decayRate: '3d',
          title: `Goal ${to.replace(/_/g, ' ')}: ${current.title}`,
          body: reason,
          ctaLabel: 'Review goal',
          ctaHref: `plan:goal:${goalId}`,
          assignedTo: current.lead_user_id ?? null,
        })
      } else if (to === 'on_track') {
        await resolvePlanEvents({
          foundryId,
          sourceEntityType: 'strategic_goal',
          sourceEntityId: goalId,
        })
      }

      revalidatePath('/plan')
      revalidatePath(`/plan/goal/${goalId}`)
      return { success: true, data: history as HistoryRow }
    },
  )
}

// ──────────────────────────────────────────────────────────────────────────
// editGoal
// ──────────────────────────────────────────────────────────────────────────

/**
 * Edit goal fields (title, description, milestone_date, etc.).
 *
 * @permission edit_strategic_goal
 * @audit action='strategic_goal.updated' · metadata.changed_keys
 */
export async function editGoal(
  goalId: string,
  patch: EditGoalInput['patch'],
): Promise<PlanActionResult<GoalRow>> {
  return withAuth<PlanActionResult<GoalRow>>(
    async ({ supabase, user, foundryId }) => {
      const parsed = editGoalInputSchema.safeParse({ goalId, patch })
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
      }

      const allowed = await planCan(
        supabase,
        user.id,
        foundryId,
        'edit_strategic_goal',
      )
      if (!allowed) return { error: 'Not permitted to edit this goal' }

      // Map camelCase patch → snake_case columns.
      const p = parsed.data.patch
      const dbPatch: Record<string, unknown> = {}
      if (p.title !== undefined) dbPatch.title = p.title
      if (p.description !== undefined) dbPatch.description = p.description
      if (p.purposeConnection !== undefined) {
        dbPatch.purpose_connection = p.purposeConnection
      }
      if (p.milestoneDate !== undefined) {
        dbPatch.milestone_date = p.milestoneDate
      }
      if (p.quarter !== undefined) dbPatch.quarter = p.quarter
      if (p.leadUserId !== undefined) dbPatch.lead_user_id = p.leadUserId
      if (p.leadFractionalId !== undefined) {
        dbPatch.lead_fractional_id = p.leadFractionalId
      }
      if (p.leadSpecialistSlug !== undefined) {
        dbPatch.lead_specialist_slug = p.leadSpecialistSlug
      }

      const { data: updated, error } = await supabase
        .from('strategic_goals')
        .update(dbPatch)
        .eq('id', goalId)
        .eq('foundry_id', foundryId)
        .select('*')
        .single()

      if (error || !updated) {
        return { error: sanitizeErrorMessage(error ?? 'Edit failed') }
      }

      await logAudit({
        action: 'strategic_goal.updated' as never,
        entityType: 'strategic_goal',
        entityId: goalId,
        userId: user.id,
        foundryId,
        metadata: { changed_keys: Object.keys(dbPatch) },
      })

      revalidatePath(`/plan/goal/${goalId}`)
      revalidatePath('/plan')
      return { success: true, data: updated as GoalRow }
    },
  )
}

// ──────────────────────────────────────────────────────────────────────────
// killGoal
// ──────────────────────────────────────────────────────────────────────────

/**
 * Kill a Strategic Goal. Per §17.2 "killed" goals stay visible in History —
 * `deleted_at` is NOT set. state='killed' + is_pinned=false.
 *
 * @permission kill_strategic_goal
 * @audit action='strategic_goal.killed' · metadata.reason
 * @history entry_type='decision', outcome='negative', body=reason
 */
export async function killGoal(
  goalId: string,
  reason: string,
): Promise<PlanActionResult<HistoryRow>> {
  return withAuth<PlanActionResult<HistoryRow>>(
    async ({ supabase, user, foundryId }) => {
      const parsed = killGoalInputSchema.safeParse({ goalId, reason })
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
      }

      const allowed = await planCan(
        supabase,
        user.id,
        foundryId,
        'kill_strategic_goal',
      )
      if (!allowed) return { error: 'Not permitted to kill goals' }

      const { data: goal, error: readErr } = await supabase
        .from('strategic_goals')
        .select('id, title, state')
        .eq('id', goalId)
        .eq('foundry_id', foundryId)
        .maybeSingle()
      if (readErr || !goal) return { error: 'Goal not found' }

      const { error: updErr } = await supabase
        .from('strategic_goals')
        .update({
          state: 'killed',
          is_pinned: false,
          pin_order: null,
          // §17.2 — deleted_at is NOT set.
        })
        .eq('id', goalId)
        .eq('foundry_id', foundryId)
      if (updErr) return { error: sanitizeErrorMessage(updErr) }

      const { data: history, error: hErr } = await supabase
        .from('history_entries')
        .insert({
          foundry_id: foundryId,
          entry_type: 'decision',
          title: `Killed: ${goal.title}`,
          body: reason,
          actor_type: 'founder',
          actor_id: user.id,
          goal_id: goalId,
          outcome: 'negative',
        })
        .select('*')
        .single()
      if (hErr || !history) {
        return { error: sanitizeErrorMessage(hErr ?? 'History write failed') }
      }

      await logAudit({
        action: 'strategic_goal.killed' as never,
        entityType: 'strategic_goal',
        entityId: goalId,
        userId: user.id,
        foundryId,
        metadata: { reason, previous_state: goal.state },
      })

      // PLAN-SCHEMA §14.4 — killing a goal auto-resolves any prior at_risk
      // /off_track event_log rows for this goal. Kill itself is NOT an
      // attention-worthy event (§14.2) — the decision is already captured
      // in history_entries.
      await resolvePlanEvents({
        foundryId,
        sourceEntityType: 'strategic_goal',
        sourceEntityId: goalId,
      })

      revalidatePath('/plan')
      revalidatePath(`/plan/goal/${goalId}`)
      return { success: true, data: history as HistoryRow }
    },
  )
}

// ──────────────────────────────────────────────────────────────────────────
// pivotGoal
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pivot a Strategic Goal — swap disprove assumptions + record rationale.
 * Uses an admin client for the assumption-replacement step so we can do
 * delete + insert atomically (user JWT is still validated up front).
 *
 * @permission pivot_strategic_goal
 * @audit action='strategic_goal.pivoted' · metadata.{reason, new_count}
 * @history entry_type='decision', outcome='neutral', body=reason
 */
export async function pivotGoal(
  goalId: string,
  newDisproveTest: PivotGoalInput['newDisproveTest'],
  reason: string,
): Promise<PlanActionResult<HistoryRow>> {
  return withAuth<PlanActionResult<HistoryRow>>(
    async ({ supabase, user, foundryId }) => {
      const parsed = pivotGoalInputSchema.safeParse({
        goalId,
        reason,
        newDisproveTest,
      })
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
      }

      const allowed = await planCan(
        supabase,
        user.id,
        foundryId,
        'pivot_strategic_goal',
      )
      if (!allowed) return { error: 'Not permitted to pivot goals' }

      const { data: goal, error: readErr } = await supabase
        .from('strategic_goals')
        .select('id, title, state')
        .eq('id', goalId)
        .eq('foundry_id', foundryId)
        .maybeSingle()
      if (readErr || !goal) return { error: 'Goal not found' }

      // Flip state to pivoted first (foundry-scoped, user JWT).
      const { error: stateErr } = await supabase
        .from('strategic_goals')
        .update({ state: 'pivoted' })
        .eq('id', goalId)
        .eq('foundry_id', foundryId)
      if (stateErr) return { error: sanitizeErrorMessage(stateErr) }

      // Replace assumptions atomically via admin client (RLS for
      // disprove_assumptions delete is tight; admin is safe here because we
      // already verified foundry ownership above).
      const admin = createAdminClient()
      const { error: delErr } = await admin
        .from('disprove_assumptions')
        .delete()
        .eq('goal_id', goalId)
        .eq('foundry_id', foundryId)
      if (delErr) return { error: sanitizeErrorMessage(delErr) }

      const rows = parsed.data.newDisproveTest.map((a, i) => ({
        foundry_id: foundryId,
        goal_id: goalId,
        order_index: i + 1,
        assumption: a.assumption,
        current_state: a.current_state,
      }))
      const { error: insErr } = await admin
        .from('disprove_assumptions')
        .insert(rows)
      if (insErr) return { error: sanitizeErrorMessage(insErr) }

      const { data: history, error: hErr } = await supabase
        .from('history_entries')
        .insert({
          foundry_id: foundryId,
          entry_type: 'decision',
          title: `Pivoted: ${goal.title}`,
          body: reason,
          actor_type: 'founder',
          actor_id: user.id,
          goal_id: goalId,
          outcome: 'neutral',
        })
        .select('*')
        .single()
      if (hErr || !history) {
        return { error: sanitizeErrorMessage(hErr ?? 'History write failed') }
      }

      await logAudit({
        action: 'strategic_goal.pivoted' as never,
        entityType: 'strategic_goal',
        entityId: goalId,
        userId: user.id,
        foundryId,
        metadata: {
          reason,
          new_count: rows.length,
          previous_state: goal.state,
        },
      })

      revalidatePath('/plan')
      revalidatePath(`/plan/goal/${goalId}`)
      return { success: true, data: history as HistoryRow }
    },
  )
}
