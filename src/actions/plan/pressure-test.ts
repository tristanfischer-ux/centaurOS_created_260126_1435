"use server"

/**
 * @file src/actions/plan/pressure-test.ts
 *
 * @description Server actions for the inline pressure-test modal launched
 * from `/plan/goal/[id]`. Persists debate transcripts into the new
 * `pressure_test_sessions` table (PLAN-SCHEMA §10) and writes a
 * `history_entries` row (entry_type='pressure_test') on close.
 *
 * The SSE stream itself lives at `/api/red-team/generate` (reused as-is —
 * see PLAN-SCHEMA §10 "SSE source route"). These actions bookend the stream:
 *   startPressureTest()  → creates a draft session row (verdict NULL)
 *                          before the client opens the SSE.
 *   closePressureTest()  → persists the final transcript, verdict body,
 *                          writes a history entry, and audit_log row.
 *
 * @security All actions run inside withAuth (foundry-scoped). RLS on
 *           pressure_test_sessions enforces plan_can('start_pressure_test')
 *           and plan_can('close_pressure_test') — see 20260422000300.
 *
 * Reference: PLAN-SCHEMA §10 (table), §15.2 (audit events), §18 (signatures).
 */

import { z } from "zod"
import { withAuth } from "@/lib/server-action-utils"
import { logAudit } from "@/actions/audit"
import { emitPlanEvent } from "@/lib/plan/emit-event"
import type {
  PressureSubjectType,
  PressureVerdict,
  PressureTranscriptMessage,
  PressureTestSessionRow,
  HistoryEntryRow,
} from "@/types/plan"

// ──────────────────────────────────────────────────────────────────────────
// 1 · Input schemas
// ──────────────────────────────────────────────────────────────────────────

const subjectTypeSchema = z.enum([
  "goal",
  "objective",
  "report_draft",
  "custom",
])

const pressureSubjectSchema = z.object({
  type: subjectTypeSchema,
  ref: z.string().uuid().optional(),
  snapshot: z.record(z.string(), z.unknown()),
})

export type PressureTestSubject = z.infer<typeof pressureSubjectSchema>

const verdictSchema = z.enum([
  "proceed",
  "proceed_with_mitigations",
  "pivot",
  "kill",
  "inconclusive",
])

const transcriptMessageSchema = z.object({
  persona: z.string().min(1),
  round: z.number().int().nonnegative(),
  content: z.string(),
  at: z.string(),
})

// ──────────────────────────────────────────────────────────────────────────
// 2 · Result shape (mirrors src/actions/plan/types.ts → PlanActionResult)
// ──────────────────────────────────────────────────────────────────────────

type ActionResult<T> =
  | { success: true; data: T }
  | { success?: false; error: string }

// ──────────────────────────────────────────────────────────────────────────
// 3 · Personas used (stress-test roles — NOT "AI personas", per CLAUDE.md)
// ──────────────────────────────────────────────────────────────────────────

const DEFAULT_PERSONAS_USED: string[] = [
  "bull",
  "bear",
  "realist",
  "disruptor",
  "wildcard",
]

// ──────────────────────────────────────────────────────────────────────────
// 4 · startPressureTest
// ──────────────────────────────────────────────────────────────────────────

/**
 * Create a draft pressure_test_sessions row before the client opens the SSE
 * stream. The row is updated with transcript + verdict via closePressureTest.
 *
 * @param subject - The thing being pressure-tested (goal / objective / etc.)
 * @param rounds  - Target round count (default 3 — matches /api/red-team/generate)
 * @returns sessionId on success, error string otherwise
 */
export async function startPressureTest(
  subject: PressureTestSubject,
  rounds: number = 3,
): Promise<ActionResult<{ sessionId: string }>> {
  const parsed = pressureSubjectSchema.safeParse(subject)
  if (!parsed.success) {
    return { error: "Invalid pressure-test subject" }
  }
  const roundsSafe = Math.min(Math.max(Math.trunc(rounds), 1), 6)

  return withAuth(async ({ supabase, user, foundryId }) => {
    const goalId =
      parsed.data.type === "goal" && parsed.data.ref ? parsed.data.ref : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("pressure_test_sessions")
      .insert({
        foundry_id: foundryId,
        goal_id: goalId,
        subject_type: parsed.data.type satisfies PressureSubjectType,
        subject_ref: parsed.data.ref ?? null,
        subject_snapshot: parsed.data.snapshot,
        personas_used: DEFAULT_PERSONAS_USED,
        rounds: roundsSafe,
        transcript_json: [],
        verdict: null,
      })
      .select("id")
      .single()

    if (error || !data) {
      return { error: error?.message ?? "Could not create pressure-test session" }
    }

    await logAudit({
      // NOTE: `action` is typed narrowly in audit.ts but the DB column is
      // free-text. Cast to match the extended vocabulary in PLAN-SCHEMA §15.2.
      action: "pressure_test_started" as never,
      entityType: "pressure_test_session",
      entityId: data.id,
      metadata: {
        subject_type: parsed.data.type,
        subject_ref: parsed.data.ref,
        rounds: roundsSafe,
      },
      userId: user.id,
      foundryId,
    })

    return { success: true, data: { sessionId: data.id as string } }
  })
}

// ──────────────────────────────────────────────────────────────────────────
// 5 · closePressureTest
// ──────────────────────────────────────────────────────────────────────────

/**
 * Persist the final transcript, verdict, and verdict body onto an existing
 * pressure_test_sessions row, then write a `history_entries` row so the
 * debate shows up on the goal timeline.
 */
export async function closePressureTest(
  sessionId: string,
  acceptMitigations: boolean,
  transcriptJson: PressureTranscriptMessage[],
  verdict: PressureVerdict,
  verdictBody: string,
): Promise<ActionResult<{ historyEntryId: string | null }>> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    return { error: "Invalid session id" }
  }
  const verdictParsed = verdictSchema.safeParse(verdict)
  if (!verdictParsed.success) return { error: "Invalid verdict" }
  const transcriptParsed = z.array(transcriptMessageSchema).safeParse(transcriptJson)
  if (!transcriptParsed.success) return { error: "Invalid transcript" }

  return withAuth(async ({ supabase, user, foundryId }) => {
    // 1 · Update the session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: session, error: updateErr } = await (supabase as any)
      .from("pressure_test_sessions")
      .update({
        transcript_json: transcriptParsed.data,
        verdict: verdictParsed.data,
        verdict_body: verdictBody,
      })
      .eq("id", sessionId)
      .eq("foundry_id", foundryId)
      .select("id, goal_id, subject_type, subject_ref")
      .single()

    if (updateErr || !session) {
      return {
        error: updateErr?.message ?? "Could not close pressure-test session",
      }
    }

    const typedSession = session as Pick<
      PressureTestSessionRow,
      "id" | "goal_id" | "subject_type" | "subject_ref"
    >

    // 2 · Write a history entry so the verdict shows on the goal timeline
    const verdictLabel = labelForVerdict(verdictParsed.data)
    const titleSuffix = acceptMitigations && verdictParsed.data === "proceed_with_mitigations"
      ? " · mitigations accepted"
      : ""

    let historyEntryId: string | null = null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: entry, error: historyErr } = await (supabase as any)
      .from("history_entries")
      .insert({
        foundry_id: foundryId,
        entry_type: "pressure_test",
        title: `Pressure-test: ${verdictLabel}${titleSuffix}`,
        body: verdictBody,
        actor_type: "founder",
        actor_id: user.id,
        goal_id: typedSession.goal_id,
        related_ids_json: {
          pressure_test_id: typedSession.id,
        },
        outcome: null,
        outcome_note: null,
      })
      .select("id")
      .single()

    if (!historyErr && entry) {
      historyEntryId = (entry as Pick<HistoryEntryRow, "id">).id
    } else if (historyErr) {
      // Non-fatal — the session itself was saved. Surface to logs.
      console.warn(
        "[pressure-test] history_entries insert failed:",
        historyErr.message,
      )
    }

    // 3 · Audit log (verdict reached)
    await logAudit({
      action: "pressure_test_verdict" as never,
      entityType: "pressure_test_session",
      entityId: typedSession.id,
      metadata: {
        verdict: verdictParsed.data,
        accept_mitigations: acceptMitigations,
        history_entry_id: historyEntryId,
      },
      userId: user.id,
      foundryId,
    })

    // 4 · PLAN-SCHEMA §14.1 — verdict reached + unacknowledged ⇒ medium
    // urgency, 7d decay. CTA points at the history entry so the founder
    // can read the full verdict. Resolution flips on view (Chunk E read-
    // receipt) — for now the 30-day cron sweeps stale rows.
    if (historyEntryId) {
      await emitPlanEvent({
        foundryId,
        sourceEntityType: "pressure_test_session",
        sourceEntityId: typedSession.id,
        urgency: "medium",
        decayRate: "7d",
        title: `Pressure-test verdict: ${labelForVerdict(verdictParsed.data)}`,
        body: verdictBody.slice(0, 280),
        ctaLabel: "Read verdict",
        ctaHref: `plan:history:${historyEntryId}`,
        assignedTo: null,
      })
    }

    return { success: true, data: { historyEntryId } }
  })
}

// ──────────────────────────────────────────────────────────────────────────
// 6 · Helpers
// ──────────────────────────────────────────────────────────────────────────

function labelForVerdict(v: PressureVerdict): string {
  switch (v) {
    case "proceed":
      return "Proceed"
    case "proceed_with_mitigations":
      return "Proceed with mitigations"
    case "pivot":
      return "Pivot"
    case "kill":
      return "Kill"
    case "inconclusive":
      return "Inconclusive"
  }
}
