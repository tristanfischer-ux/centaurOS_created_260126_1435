'use server'

/**
 * @file src/actions/plan/tasks.ts
 *
 * Plan-scoped task server actions (PLAN-SCHEMA §§4, 5, 13, 18).
 *
 * The existing `src/actions/tasks.ts` is owned by Objectives/Review and must
 * NOT be edited here. Plan writes through the same `tasks` table but adds
 * Plan-specific columns (strategic_goal_id, is_pinned, horizon, origin,
 * origin_ref, is_draft) per the additive migration.
 */

import { revalidatePath } from 'next/cache'

import { withAuth } from '@/lib/server-action-utils'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { logAudit } from '@/actions/audit'
import { emitPlanEvent, resolvePlanEvents } from '@/lib/plan/emit-event'

import {
  completeTaskInputSchema,
  createTaskInputSchema,
  delegateTaskInputSchema,
  type CompleteTaskInput,
  type CreateTaskInput,
  type DelegateTaskInput,
  type PlanActionResult,
  type SpecialistRecRow,
} from './types'

// ──────────────────────────────────────────────────────────────────────────
// Internal — plan_can RPC helper (duplicated from goals.ts to keep this
// file independent; kept tiny so no shared helper module is needed).
// ──────────────────────────────────────────────────────────────────────────

async function planCan(
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
    console.error('[plan/tasks] plan_can RPC failed:', {
      action,
      error: error.message,
    })
    return false
  }
  return data === true
}

// Minimal row-shape we return from createTask / completeTask so callers
// don't need to import the generated database types.
interface TaskRowShape {
  id: string
  foundry_id: string
  title: string
  status: string | null
  is_pinned: boolean | null
  horizon: string | null
  strategic_goal_id: string | null
  objective_id: string | null
}

// ──────────────────────────────────────────────────────────────────────────
// createTask
// ──────────────────────────────────────────────────────────────────────────

/**
 * Create a Plan-scoped task. Unlike the legacy `createTask` in
 * `src/actions/tasks.ts`, this one accepts a `strategicGoalId`, optional
 * horizon, and origin metadata — all on columns added by the Plan additive
 * migration (PLAN-SCHEMA §4).
 *
 * @permission create_task
 * @audit action='task.created' · metadata.{horizon, origin, is_draft}
 */
export async function createTask(
  input: CreateTaskInput,
): Promise<PlanActionResult<TaskRowShape>> {
  return withAuth<PlanActionResult<TaskRowShape>>(
    async ({ supabase, user, foundryId }) => {
      const parsed = createTaskInputSchema.safeParse(input)
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
      }
      const data = parsed.data

      const allowed = await planCan(
        supabase,
        user.id,
        foundryId,
        'create_task',
      )
      if (!allowed) return { error: 'Not permitted to create tasks' }

      const { data: task, error } = await supabase
        .from('tasks')
        .insert({
          foundry_id: foundryId,
          creator_id: user.id,
          title: data.title,
          description: data.description ?? null,
          objective_id: data.objectiveId ?? null,
          strategic_goal_id: data.strategicGoalId ?? null,
          horizon: data.horizon ?? null,
          origin: data.origin ?? null,
          origin_ref: data.originRef ?? null,
          is_draft: data.isDraft ?? false,
          is_pinned: false,
        })
        .select(
          'id, foundry_id, title, status, is_pinned, horizon, strategic_goal_id, objective_id',
        )
        .single()

      if (error || !task) {
        return { error: sanitizeErrorMessage(error ?? 'Create task failed') }
      }

      await logAudit({
        action: 'task.created' as never,
        entityType: 'task',
        entityId: task.id,
        userId: user.id,
        foundryId,
        metadata: {
          horizon: data.horizon ?? null,
          origin: data.origin ?? null,
          is_draft: data.isDraft ?? false,
          strategic_goal_id: data.strategicGoalId ?? null,
          objective_id: data.objectiveId ?? null,
        },
      })

      revalidatePath('/plan')
      if (data.strategicGoalId) {
        revalidatePath(`/plan/goal/${data.strategicGoalId}`)
      }

      // Chunk E cron: emit event_log §14.1 row 5 (task.due_date overdue > 3
      // days) and row 6 (pinned this-week not done on Friday) from the
      // nightly sweep — not feasible to detect inside a server action.

      return { success: true, data: task as TaskRowShape }
    },
  )
}

// ──────────────────────────────────────────────────────────────────────────
// pinTaskToWeek
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pin a task into the "this-week" horizon (PLAN-SCHEMA §4 — new is_pinned +
 * horizon columns). The Plan workspace lists pinned this-week tasks above
 * the objectives grid.
 *
 * @permission edit_objective (closest matching action in the matrix —
 *             pinning a task is an objective-level edit because horizon is
 *             a planning decision, not an assignment decision).
 * @audit action='task.pinned' · metadata.horizon='this_week'
 */
export async function pinTaskToWeek(
  taskId: string,
): Promise<PlanActionResult<TaskRowShape>> {
  return withAuth<PlanActionResult<TaskRowShape>>(
    async ({ supabase, user, foundryId }) => {
      if (!/^[0-9a-f-]{36}$/i.test(taskId)) {
        return { error: 'Invalid taskId' }
      }

      const allowed = await planCan(
        supabase,
        user.id,
        foundryId,
        'edit_objective',
      )
      if (!allowed) return { error: 'Not permitted to pin tasks' }

      const { data: task, error } = await supabase
        .from('tasks')
        .update({ is_pinned: true, horizon: 'this_week' })
        .eq('id', taskId)
        .eq('foundry_id', foundryId)
        .select(
          'id, foundry_id, title, status, is_pinned, horizon, strategic_goal_id, objective_id',
        )
        .single()

      if (error || !task) {
        return { error: sanitizeErrorMessage(error ?? 'Pin task failed') }
      }

      await logAudit({
        action: 'task.pinned' as never,
        entityType: 'task',
        entityId: taskId,
        userId: user.id,
        foundryId,
        metadata: { horizon: 'this_week' },
      })

      revalidatePath('/plan')
      revalidatePath(`/plan/task/${taskId}`)
      return { success: true, data: task as TaskRowShape }
    },
  )
}

// ──────────────────────────────────────────────────────────────────────────
// delegateTaskToSpecialist
// ──────────────────────────────────────────────────────────────────────────

/**
 * Delegate a task to one of the built-in specialist agents.
 *
 * NOTE on schema: `task_assignees` currently has a NOT-NULL `profile_id` and
 * does NOT carry a `specialist_slug` column (only `goal_team_assignments`
 * does). We therefore represent the specialist delegation as a
 * `specialist_recommendations` row with context_type='task' and the brief
 * captured in `body`. When the 9-role enum PR lands and `task_assignees`
 * gains `specialist_slug`, we can also write an assignees row — tracked
 * in PLAN-SCHEMA §5.
 *
 * @permission assign_task_others (delegating outside the founder's
 *             hands-on queue)
 * @audit action='task.assigned' · metadata.{specialist_slug, rec_id}
 */
export async function delegateTaskToSpecialist(
  taskId: string,
  specialistSlug: string,
  brief: string,
): Promise<PlanActionResult<SpecialistRecRow>> {
  return withAuth<PlanActionResult<SpecialistRecRow>>(
    async ({ supabase, user, foundryId }) => {
      const parsed = delegateTaskInputSchema.safeParse({
        taskId,
        specialistSlug,
        brief,
      })
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
      }

      const allowed = await planCan(
        supabase,
        user.id,
        foundryId,
        'assign_task_others',
      )
      if (!allowed) {
        return { error: 'Not permitted to delegate this task' }
      }

      // Verify task belongs to this foundry before stubbing a rec.
      const { data: task, error: readErr } = await supabase
        .from('tasks')
        .select('id, title, strategic_goal_id')
        .eq('id', taskId)
        .eq('foundry_id', foundryId)
        .maybeSingle()
      if (readErr || !task) return { error: 'Task not found' }

      // Stub a specialist_recommendations row — context = 'task'. Defaults
      // per §13: expires_at = now + 72h, durable=false, status=pending.
      const expires = new Date(
        Date.now() + 72 * 60 * 60 * 1000,
      ).toISOString()

      const { data: rec, error: recErr } = await supabase
        .from('specialist_recommendations')
        .insert({
          foundry_id: foundryId,
          specialist_slug: parsed.data.specialistSlug,
          context_type: 'task',
          context_ref: taskId,
          summary: `Delegated: ${task.title}`,
          body: parsed.data.brief,
          grounding_text: `Founder delegation · task ${taskId}`,
          confidence: 'high',
          status: 'pending',
          expires_at: expires,
          durable: false,
        })
        .select('*')
        .single()

      if (recErr || !rec) {
        return { error: sanitizeErrorMessage(recErr ?? 'Delegation failed') }
      }

      await logAudit({
        action: 'task.assigned' as never,
        entityType: 'task',
        entityId: taskId,
        userId: user.id,
        foundryId,
        metadata: {
          specialist_slug: parsed.data.specialistSlug,
          rec_id: rec.id,
          via: 'delegateTaskToSpecialist',
        },
      })

      // PLAN-SCHEMA §14.1 — specialist_recommendation with confidence in
      // ('high','very_high') is attention-worthy. We always create this rec
      // at confidence='high' (see insert above), so the trigger always fires.
      await emitPlanEvent({
        foundryId,
        sourceEntityType: 'specialist_recommendation',
        sourceEntityId: rec.id,
        urgency: 'medium',
        decayRate: '3d',
        title: `Specialist recommendation: ${task.title}`,
        body: parsed.data.brief.slice(0, 280),
        ctaLabel: 'See recommendation',
        ctaHref: `plan:rec:${rec.id}`,
        assignedTo: null, // recs fan out to whoever's viewing
      })

      revalidatePath('/plan')
      revalidatePath(`/plan/task/${taskId}`)
      if (task.strategic_goal_id) {
        revalidatePath(`/plan/goal/${task.strategic_goal_id}`)
      }
      return { success: true, data: rec as SpecialistRecRow }
    },
  )
}

// ──────────────────────────────────────────────────────────────────────────
// completeTask
// ──────────────────────────────────────────────────────────────────────────

/**
 * Mark a task complete. If the task is linked to an objective (the normal
 * case) we also write a `history_entries` row so the completion shows up in
 * the Plan History stream.
 *
 * @permission close_own_task
 * @audit action='task.completed' · metadata.{closingNote?}
 */
export async function completeTask(
  taskId: string,
  closingNote?: string | null,
): Promise<PlanActionResult<TaskRowShape>> {
  return withAuth<PlanActionResult<TaskRowShape>>(
    async ({ supabase, user, foundryId }) => {
      const parsed = completeTaskInputSchema.safeParse({
        taskId,
        closingNote,
      })
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
      }

      const allowed = await planCan(
        supabase,
        user.id,
        foundryId,
        'close_own_task',
      )
      if (!allowed) return { error: 'Not permitted to close this task' }

      const { data: task, error } = await supabase
        .from('tasks')
        .update({
          status: 'Completed',
          horizon: 'done',
          is_pinned: false,
        })
        .eq('id', taskId)
        .eq('foundry_id', foundryId)
        .select(
          'id, foundry_id, title, status, is_pinned, horizon, strategic_goal_id, objective_id',
        )
        .single()

      if (error || !task) {
        return { error: sanitizeErrorMessage(error ?? 'Complete task failed') }
      }

      // Write a history_entries row only if the task lives under an
      // objective (§9 / §14 — passive History is useful for closed work).
      if (task.objective_id) {
        await supabase.from('history_entries').insert({
          foundry_id: foundryId,
          entry_type: 'manual',
          title: `Task completed: ${task.title}`,
          body: parsed.data.closingNote ?? null,
          actor_type: 'founder',
          actor_id: user.id,
          goal_id: task.strategic_goal_id,
          related_ids_json: {
            task_ids: [task.id],
            objective_ids: [task.objective_id],
          },
          outcome: 'positive',
        })
      }

      await logAudit({
        action: 'task.completed' as never,
        entityType: 'task',
        entityId: taskId,
        userId: user.id,
        foundryId,
        metadata: {
          closing_note_present: !!parsed.data.closingNote,
          objective_id: task.objective_id ?? null,
          strategic_goal_id: task.strategic_goal_id ?? null,
        },
      })

      // PLAN-SCHEMA §14.4 — task → done resolves any prior overdue / pin
      // event_log rows for this task. (Emitting overdue itself is Chunk E's
      // nightly sweep — see §14.1 row 5/6.)
      await resolvePlanEvents({
        foundryId,
        sourceEntityType: 'task',
        sourceEntityId: taskId,
      })

      revalidatePath('/plan')
      revalidatePath(`/plan/task/${taskId}`)
      if (task.strategic_goal_id) {
        revalidatePath(`/plan/goal/${task.strategic_goal_id}`)
      }
      return { success: true, data: task as TaskRowShape }
    },
  )
}
