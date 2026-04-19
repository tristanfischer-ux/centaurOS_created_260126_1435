/**
 * @file src/actions/plan/types.ts
 *
 * Non-"use-server" module: Zod input schemas + shared return types for Plan
 * server actions. Plain TS module so it can export non-async values (schemas,
 * types) without tripping Next.js's "use server" lint — per PLAN-SCHEMA §18 +
 * HANDOVER B.4.
 *
 * Reference:
 * - PLAN-SCHEMA §§1–13 (row shapes)
 * - PLAN-SCHEMA §14.6 (canonical CTA tokens)
 * - PLAN-SCHEMA §16.1 (PlanAction union)
 * - PLAN-SCHEMA §17 (locked decisions — edit-lock 5 min, killed goals stay
 *   visible, rec expiry 72h, etc.)
 * - PLAN-SCHEMA §18 (action signatures)
 */

import { z } from 'zod'

import type {
  AssumptionState,
  DisproveAssumptionRow,
  GoalState,
  GutcheckSessionRow,
  HistoryEntryRow,
  OutcomeState,
  SpecialistRecommendationRow,
  StrategicGoalRow,
  TaskHorizon,
} from '@/types/plan'

// ──────────────────────────────────────────────────────────────────────────
// 1 · Shared result shape
// ──────────────────────────────────────────────────────────────────────────

/**
 * Standard action return shape. `withAuth` in server-action-utils already
 * narrows unauthorised calls to `{ error: string }`; Plan actions layer
 * `{ success: true, data }` on the happy path.
 */
export type PlanActionResult<TData> =
  | { success: true; data: TData }
  | { success?: false; error: string }

// ──────────────────────────────────────────────────────────────────────────
// 2 · Enum schemas (mirror DB enum types from 20260422000000_plan_enums)
// ──────────────────────────────────────────────────────────────────────────

export const goalStateSchema = z.enum([
  'draft',
  'active',
  'at_risk',
  'off_track',
  'on_track',
  'killed',
  'pivoted',
  'completed',
]) satisfies z.ZodType<GoalState>

export const assumptionStateSchema = z.enum([
  'holding',
  'slipping',
  'broken',
  'unknown',
]) satisfies z.ZodType<AssumptionState>

export const assumptionSourceSchema = z.enum([
  'founder',
  'auto_specialist',
  'gutcheck',
])

export const gutcheckDecisionSchema = z.enum([
  'kill',
  'pivot',
  'double_down',
  'dismissed',
])

export const outcomeStateSchema = z.enum([
  'positive',
  'negative',
  'pending',
  'neutral',
]) satisfies z.ZodType<OutcomeState>

export const taskHorizonSchema = z.enum([
  'this_week',
  'this_month',
  'later',
  'done',
]) satisfies z.ZodType<TaskHorizon>

export const historyEntryTypeSchema = z.enum([
  'decision',
  'pressure_test',
  'update_sent',
  'goal_pinned',
  'goal_state_changed',
  'specialist_rec_accepted',
  'specialist_rec_rejected',
  'gutcheck_outcome',
  'manual',
])

// ──────────────────────────────────────────────────────────────────────────
// 3 · Goals — input schemas
// ──────────────────────────────────────────────────────────────────────────

/**
 * A single disprove-test assumption captured at goal-creation / pivot time.
 * Per PLAN-SCHEMA §2 the app caps at 3 per goal (DB CHECK allows ≤ 5).
 */
export const disproveAssumptionInputSchema = z.object({
  assumption: z
    .string()
    .min(1, 'Assumption text is required')
    .max(500, 'Assumption must be 500 characters or less'),
  current_state: assumptionStateSchema.default('unknown'),
})

export type DisproveAssumptionInput = z.infer<
  typeof disproveAssumptionInputSchema
>

export const createGoalInputSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or less'),
  description: z
    .string()
    .max(10_000, 'Description must be 10,000 characters or less')
    .optional()
    .nullable(),
  quarter: z
    .string()
    .regex(/^Q[1-4] \d{4}$/, 'Quarter must be in the format "Q2 2026"'),
  milestoneDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Milestone date must be YYYY-MM-DD'),
  purposeConnection: z.string().max(2_000).optional().nullable(),
  leadUserId: z.string().uuid().optional().nullable(),
  leadFractionalId: z.string().uuid().optional().nullable(),
  leadSpecialistSlug: z.string().min(1).max(64).optional().nullable(),
  pin: z
    .object({
      slot: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    })
    .optional(),
  disproveAssumptions: z
    .array(disproveAssumptionInputSchema)
    .max(3, 'A Strategic Goal can have at most 3 disprove assumptions')
    .optional()
    .default([]),
}).refine(
  (input) => {
    // PLAN-SCHEMA §1 · exactly one of lead_user_id / lead_fractional_id /
    // lead_specialist_slug is non-null.
    const leads = [
      input.leadUserId,
      input.leadFractionalId,
      input.leadSpecialistSlug,
    ].filter((v): v is string => !!v)
    return leads.length === 1
  },
  {
    message:
      'Exactly one of leadUserId / leadFractionalId / leadSpecialistSlug must be set',
    path: ['leadUserId'],
  },
)

export type CreateGoalInput = z.infer<typeof createGoalInputSchema>

export const editGoalInputSchema = z.object({
  goalId: z.string().uuid('Invalid goalId'),
  patch: z
    .object({
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(10_000).optional().nullable(),
      purposeConnection: z.string().max(2_000).optional().nullable(),
      milestoneDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      quarter: z
        .string()
        .regex(/^Q[1-4] \d{4}$/)
        .optional(),
      leadUserId: z.string().uuid().nullable().optional(),
      leadFractionalId: z.string().uuid().nullable().optional(),
      leadSpecialistSlug: z.string().min(1).max(64).nullable().optional(),
    })
    .refine(
      (patch) => Object.values(patch).some((v) => v !== undefined),
      { message: 'Patch must contain at least one field to update' },
    ),
})

export type EditGoalInput = z.infer<typeof editGoalInputSchema>

export const pinGoalInputSchema = z.object({
  goalId: z.string().uuid('Invalid goalId'),
  slot: z.union([z.literal(1), z.literal(2), z.literal(3)]),
})

export type PinGoalInput = z.infer<typeof pinGoalInputSchema>

export const setGoalStateInputSchema = z.object({
  goalId: z.string().uuid(),
  state: goalStateSchema,
  reason: z
    .string()
    .min(1, 'Reason is required when changing state')
    .max(5_000),
  /** ISO timestamptz — defaults to now + 14 days per PLAN-SCHEMA §17.1 */
  overriddenUntil: z
    .string()
    .datetime({ offset: true })
    .optional()
    .nullable(),
})

export type SetGoalStateInput = z.infer<typeof setGoalStateInputSchema>

export const killGoalInputSchema = z.object({
  goalId: z.string().uuid(),
  reason: z.string().min(1, 'Reason is required').max(5_000),
})

export type KillGoalInput = z.infer<typeof killGoalInputSchema>

export const pivotGoalInputSchema = z.object({
  goalId: z.string().uuid(),
  reason: z.string().min(1, 'Reason is required').max(5_000),
  newDisproveTest: z
    .array(disproveAssumptionInputSchema)
    .min(1, 'Pivot must supply at least one new disprove assumption')
    .max(3),
})

export type PivotGoalInput = z.infer<typeof pivotGoalInputSchema>

// ──────────────────────────────────────────────────────────────────────────
// 4 · Tasks — input schemas
// ──────────────────────────────────────────────────────────────────────────

export const createTaskInputSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10_000).optional().nullable(),
  objectiveId: z.string().uuid().optional().nullable(),
  strategicGoalId: z.string().uuid().optional().nullable(),
  horizon: taskHorizonSchema.optional().nullable(),
  origin: z.string().max(64).optional().nullable(),
  originRef: z.string().max(128).optional().nullable(),
  isDraft: z.boolean().optional().default(false),
})

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>

export const delegateTaskInputSchema = z.object({
  taskId: z.string().uuid(),
  specialistSlug: z.string().min(1).max(64),
  brief: z.string().min(1).max(5_000),
})

export type DelegateTaskInput = z.infer<typeof delegateTaskInputSchema>

export const completeTaskInputSchema = z.object({
  taskId: z.string().uuid(),
  closingNote: z.string().max(5_000).optional().nullable(),
})

export type CompleteTaskInput = z.infer<typeof completeTaskInputSchema>

// ──────────────────────────────────────────────────────────────────────────
// 5 · Disprove assumptions — input schemas
// ──────────────────────────────────────────────────────────────────────────

export const setAssumptionStateInputSchema = z.object({
  assumptionId: z.string().uuid(),
  state: assumptionStateSchema,
  source: assumptionSourceSchema,
  freshDataJson: z.unknown().optional().nullable(),
})

export type SetAssumptionStateInput = z.infer<
  typeof setAssumptionStateInputSchema
>

// ──────────────────────────────────────────────────────────────────────────
// 6 · Gutcheck — input schemas
// ──────────────────────────────────────────────────────────────────────────

export const decideGutcheckInputSchema = z.object({
  sessionId: z.string().uuid(),
  decision: gutcheckDecisionSchema,
  note: z.string().min(1, 'A decision note is required').max(5_000),
})

export type DecideGutcheckInput = z.infer<typeof decideGutcheckInputSchema>

// ──────────────────────────────────────────────────────────────────────────
// 7 · History — input schemas
// ──────────────────────────────────────────────────────────────────────────

export const manualHistoryEntryInputSchema = z.object({
  title: z.string().min(1).max(500),
  body: z.string().max(50_000).optional().nullable(),
  goalId: z.string().uuid().optional().nullable(),
  relatedIds: z
    .object({
      objective_ids: z.array(z.string().uuid()).optional(),
      task_ids: z.array(z.string().uuid()).optional(),
      pressure_test_id: z.string().uuid().optional(),
      rec_id: z.string().uuid().optional(),
      gutcheck_id: z.string().uuid().optional(),
    })
    .optional()
    .nullable(),
  outcome: outcomeStateSchema.optional().nullable(),
  outcomeNote: z.string().max(5_000).optional().nullable(),
  groundingText: z.string().max(5_000).optional().nullable(),
  alternatives: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        why_rejected: z.string().min(1).max(2_000),
      }),
    )
    .optional()
    .nullable(),
})

export type ManualHistoryEntryInput = z.infer<
  typeof manualHistoryEntryInputSchema
>

export const markHistoryOutcomeInputSchema = z.object({
  id: z.string().uuid(),
  outcome: outcomeStateSchema,
  note: z.string().max(5_000).optional().nullable(),
})

export type MarkHistoryOutcomeInput = z.infer<
  typeof markHistoryOutcomeInputSchema
>

export const editHistoryBodyInputSchema = z.object({
  id: z.string().uuid(),
  newBody: z.string().max(50_000),
})

export type EditHistoryBodyInput = z.infer<typeof editHistoryBodyInputSchema>

// ──────────────────────────────────────────────────────────────────────────
// 8 · Return-type aliases (mirror rows from src/types/plan.ts)
// ──────────────────────────────────────────────────────────────────────────

export type GoalRow = StrategicGoalRow
export type DisproveRow = DisproveAssumptionRow
export type HistoryRow = HistoryEntryRow
export type GutcheckRow = GutcheckSessionRow
export type SpecialistRecRow = SpecialistRecommendationRow

/** Edit-lock window for history_entries.body (PLAN-SCHEMA §17.5) */
export const HISTORY_EDIT_LOCK_MS = 5 * 60 * 1000

// ──────────────────────────────────────────────────────────────────────────
// 9 · Fractional engagement inputs (PLAN-SCHEMA §6-7)
// ──────────────────────────────────────────────────────────────────────────

const fractionalSpecialisationSchema = z.enum([
  "fundraising","legal","cto","people","cfo","marketing",
  "product","sales","operations","advisory","other",
])

/**
 * V1 minimal-invite shape per PLAN-SCHEMA §17 Open-Question 7 LOCKED:
 *   email + role + goals only. Retainer / capacity / working-style default
 *   in at the Settings surface post-accept.
 */
export const inviteFractionalInputSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(120).optional(),
  role: z.string().min(1).max(120),
  specialisation: fractionalSpecialisationSchema.optional(),
  hoursPerWeek: z.number().int().min(1).max(40).optional(),
  retainerMonthly: z.number().int().min(0).optional(),
  attachToGoalIds: z.array(z.string().uuid()).optional(),
})

export type InviteFractionalInput = z.infer<typeof inviteFractionalInputSchema>
