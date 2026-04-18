/**
 * @file design-iterations.ts — Server actions for the design-iteration phase.
 *
 * @description Phase I of the design-iteration system. Records triggered
 * iterations, reads iteration history, enforces hard caps (5/project,
 * 3/concern) with override-by-reason.
 *
 * Phase II (alternative generators), III (UI), IV-VI (wire + apply + guards)
 * live in separate modules. See tasks/DESIGN-ITERATION-PHASE-PLAN.md.
 *
 * @related
 * - Migration: supabase/migrations/20260418060000_design_iterations_foundation.sql
 *   (applied via Supabase MCP — no file in supabase/migrations/)
 * - Plan: tasks/DESIGN-ITERATION-PHASE-PLAN.md
 */

"use server"

// GOTCHA: This file has the 'use server' directive, which means ONLY async
// function exports are allowed. Types + constants live in
// @/lib/cad-lab/design-iteration-types so both the server action layer and
// the client UI can reference the shared shape. Re-exporting types here
// would fail the Turbopack build ("Server Actions must be async functions").

import { createHash } from "node:crypto"
import { withAuth } from "@/lib/server-action-utils"
import { isValidUUID } from "@/lib/validations"
import type { Json } from "@/types/database.types"
import type {
  IterationTrigger, DesignAlternative, IterationHistoryEntry,
} from "@/lib/cad-lab/design-iteration-types"
import {
  MAX_ITERATIONS_PER_PROJECT, MAX_ITERATIONS_PER_CONCERN,
} from "@/lib/cad-lab/design-iteration-types"

// ─── Local action-input types (not re-exported to avoid 'use server' errors) ──

interface RecordIterationInput {
  projectId: string
  triggeredBy: IterationTrigger
  concernText: string
  triggerContext?: Record<string, unknown>
  alternativesPresented: DesignAlternative[]
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Stable hash of the concern content so same-concern iterations can be counted
 * for the 3-per-concern cap. Whitespace and case normalised so small rewordings
 * from the LLM don't mask a repeat.
 */
export async function hashConcern(concernText: string): Promise<string> {
  const normalised = concernText.toLowerCase().replace(/\s+/g, " ").trim()
  return createHash("sha1").update(normalised).digest("hex").slice(0, 16)
}

/**
 * Emit a design-iteration telemetry event into activity_events. Fire-and-forget:
 * telemetry failures are logged but never propagated to the caller. Mirrors the
 * Cad Lab telemetry pattern (event_type='feature_use' with `event_data.feature`
 * carrying the specific action).
 */
async function emitIterationEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: {
    userId: string
    foundryId: string
    feature:
      | "design_iteration_proposed"
      | "design_iteration_decision"
      | "design_iteration_risk_accepted"
      | "design_iteration_cap_blocked"
    payload: Record<string, unknown>
  },
): Promise<void> {
  try {
    const { error } = await supabase.from("activity_events").insert({
      user_id: args.userId,
      foundry_id: args.foundryId,
      event_type: "feature_use",
      event_data: { feature: args.feature, ...args.payload },
    })
    if (error) console.warn("[design-iterations] telemetry insert failed:", error.message)
  } catch (err) {
    console.warn("[design-iterations] telemetry threw:", err instanceof Error ? err.message : err)
  }
}

// ─── Record a new iteration ───────────────────────────────────────

/**
 * Writes an iteration row with alternatives presented. chosen_option_index
 * stays NULL until the founder picks (applyDesignIteration — Phase V).
 *
 * Hard caps checked here so callers get a definitive yes/no before they
 * invoke the LLM alternative generator (which costs credits).
 */
export async function recordDesignIteration(input: RecordIterationInput) {
  return withAuth(async ({ supabase, user, foundryId }) => {
    if (!isValidUUID(input.projectId)) return { error: "Invalid project ID" }
    if (!input.concernText?.trim()) return { error: "Concern text is required" }
    if (!Array.isArray(input.alternativesPresented) || input.alternativesPresented.length === 0) {
      return { error: "At least one alternative required" }
    }
    if (input.alternativesPresented.length > 3) return { error: "Maximum 3 alternatives per iteration" }

    // AUTH: project must belong to caller's foundry
    const { data: project } = await supabase
      .from("cad_lab_projects")
      .select("id, foundry_id")
      .eq("id", input.projectId)
      .eq("foundry_id", foundryId)
      .maybeSingle()
    if (!project) return { error: "Project not found" }

    const concernHash = await hashConcern(input.concernText)

    // Hard cap checks
    const capCheck = await checkIterationCaps(input.projectId, concernHash, supabase)
    if (capCheck.blocked) {
      await emitIterationEvent(supabase, {
        userId: user.id,
        foundryId,
        feature: "design_iteration_cap_blocked",
        payload: {
          projectId: input.projectId,
          trigger: input.triggeredBy,
          concernHash,
          scope: capCheck.overrideAllowed ? "project_cap" : "concern_cap",
        },
      })
      return {
        error: capCheck.reason,
        capBlocked: true,
        overrideAllowed: capCheck.overrideAllowed,
      }
    }

    const { data, error } = await supabase
      .from("design_iterations")
      .insert({
        project_id: input.projectId,
        foundry_id: foundryId,
        triggered_by: input.triggeredBy,
        concern_hash: concernHash,
        concern_text: input.concernText,
        trigger_context: (input.triggerContext ?? {}) as Json,
        alternatives_presented: input.alternativesPresented as unknown as Json,
        initiated_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("[design-iterations] Record failed:", error.message)
      return { error: "Could not record iteration" }
    }

    await emitIterationEvent(supabase, {
      userId: user.id,
      foundryId,
      feature: "design_iteration_proposed",
      payload: {
        projectId: input.projectId,
        iterationId: data.id,
        trigger: input.triggeredBy,
        concernHash,
        alternativesCount: input.alternativesPresented.length,
        hasRecommended: input.alternativesPresented.some((a) => a.recommended),
        severityFlags: {
          exportControls: input.alternativesPresented.some((a) => a.severity?.exportControls),
          featureDescope: input.alternativesPresented.some((a) => a.severity?.featureDescope),
          supplyCommitmentBreak: input.alternativesPresented.some((a) => a.severity?.supplyCommitmentBreak),
        },
      },
    })

    return { iteration: data }
  })
}

// ─── Iteration caps check ─────────────────────────────────────────

async function checkIterationCaps(
  projectId: string,
  concernHash: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<{ blocked: boolean; reason?: string; overrideAllowed?: boolean }> {
  // Count decided iterations (chosen_option_index IS NOT NULL) to avoid
  // counting in-flight records that haven't resolved yet.
  const { count: projectCount } = await supabase
    .from("design_iterations")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .not("chosen_option_index", "is", null)

  if ((projectCount ?? 0) >= MAX_ITERATIONS_PER_PROJECT) {
    return {
      blocked: true,
      reason: `You've used ${MAX_ITERATIONS_PER_PROJECT} iterations on this project. Continuing requires an override with a written reason.`,
      overrideAllowed: true,
    }
  }

  const { count: concernCount } = await supabase
    .from("design_iterations")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("concern_hash", concernHash)
    .not("chosen_option_index", "is", null)

  if ((concernCount ?? 0) >= MAX_ITERATIONS_PER_CONCERN) {
    return {
      blocked: true,
      reason: `This concern has already been iterated ${MAX_ITERATIONS_PER_CONCERN} times without a fix sticking. Commit to one option or add it to the accepted-risk register.`,
      overrideAllowed: false,
    }
  }

  return { blocked: false }
}

// ─── History + stats ──────────────────────────────────────────────

export async function getDesignIterationHistory(projectId: string) {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!isValidUUID(projectId)) return { error: "Invalid project ID" }

    const { data, error } = await supabase
      .from("design_iterations")
      .select("id, triggered_by, concern_hash, concern_text, trigger_context, alternatives_presented, chosen_option_index, founder_notes, override_reason, applied_at, created_at")
      .eq("project_id", projectId)
      .eq("foundry_id", foundryId)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("[design-iterations] History failed:", error.message)
      return { error: "Could not load history" }
    }

    const entries: IterationHistoryEntry[] = (data ?? []).map((row) => ({
      id: row.id,
      triggeredBy: row.triggered_by as IterationTrigger,
      concernHash: row.concern_hash,
      concernText: row.concern_text,
      triggerContext: (row.trigger_context as Record<string, unknown>) ?? {},
      alternativesPresented: (row.alternatives_presented as unknown as DesignAlternative[]) ?? [],
      chosenOptionIndex: row.chosen_option_index,
      founderNotes: row.founder_notes,
      overrideReason: row.override_reason,
      appliedAt: row.applied_at,
      createdAt: row.created_at,
    }))

    return { entries }
  })
}

export async function getIterationStatsForProject(projectId: string) {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!isValidUUID(projectId)) return { error: "Invalid project ID" }

    const { data, error } = await supabase
      .from("design_iterations")
      .select("concern_hash, chosen_option_index")
      .eq("project_id", projectId)
      .eq("foundry_id", foundryId)

    if (error) return { error: "Could not read stats" }
    const rows = data ?? []

    const decided = rows.filter((r) => r.chosen_option_index !== null)
    const perConcern = new Map<string, number>()
    for (const r of decided) {
      perConcern.set(r.concern_hash, (perConcern.get(r.concern_hash) ?? 0) + 1)
    }

    return {
      totalDecided: decided.length,
      perConcernCounts: Object.fromEntries(perConcern),
      atProjectCap: decided.length >= MAX_ITERATIONS_PER_PROJECT,
      maxPerProject: MAX_ITERATIONS_PER_PROJECT,
      maxPerConcern: MAX_ITERATIONS_PER_CONCERN,
    }
  })
}

// ─── Commit founder decision (rejected / picked / abandoned) ─────

interface CommitIterationDecisionInput {
  iterationId: string
  chosenOptionIndex: number /* 0..2 pick | -1 rejected (keep as-is) | -2 abandoned */
  founderNotes?: string
  overrideReason?: string
}

export async function commitIterationDecision(input: CommitIterationDecisionInput) {
  return withAuth(async ({ supabase, user, foundryId }) => {
    if (!isValidUUID(input.iterationId)) return { error: "Invalid iteration ID" }
    if (![0, 1, 2, -1, -2].includes(input.chosenOptionIndex)) {
      return { error: "chosenOptionIndex must be 0-2 (pick), -1 (reject), or -2 (abandon)" }
    }

    const { data, error } = await supabase
      .from("design_iterations")
      .update({
        chosen_option_index: input.chosenOptionIndex,
        founder_notes: input.founderNotes?.trim() || null,
        override_reason: input.overrideReason?.trim() || null,
        applied_at: input.chosenOptionIndex >= 0 ? new Date().toISOString() : null,
      })
      .eq("id", input.iterationId)
      .eq("foundry_id", foundryId)
      .select()
      .single()

    if (error) {
      console.error("[design-iterations] Commit failed:", error.message)
      return { error: "Could not commit decision" }
    }

    const outcome: "picked" | "rejected" | "abandoned" =
      input.chosenOptionIndex >= 0 ? "picked" : input.chosenOptionIndex === -1 ? "rejected" : "abandoned"
    await emitIterationEvent(supabase, {
      userId: user.id,
      foundryId,
      feature: "design_iteration_decision",
      payload: {
        iterationId: input.iterationId,
        projectId: data.project_id,
        trigger: data.triggered_by,
        concernHash: data.concern_hash,
        chosenOptionIndex: input.chosenOptionIndex,
        outcome,
        hasOverrideReason: Boolean(input.overrideReason?.trim()),
        hasFounderNotes: Boolean(input.founderNotes?.trim()),
      },
    })

    return { iteration: data }
  })
}

// ─── Add a concern to the accepted-risk register (abandon path) ─

interface AcceptRiskInput {
  projectId: string
  concernHash: string
  concernText: string
  reason: string
}

/**
 * Read + write founder's per-unit cost target — required before the
 * cost-reduction iteration path can run (per Open Q1 answer).
 */
export async function getProjectTargetUnitCost(projectId: string) {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!isValidUUID(projectId)) return { error: "Invalid project ID" }
    const { data, error } = await supabase
      .from("cad_lab_projects")
      .select("target_unit_cost_gbp")
      .eq("id", projectId)
      .eq("foundry_id", foundryId)
      .maybeSingle()
    if (error || !data) return { error: "Project not found" }
    return { targetUnitCostGbp: data.target_unit_cost_gbp as number | null }
  })
}

export async function setProjectTargetUnitCost(input: { projectId: string; targetUnitCostGbp: number | null }) {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!isValidUUID(input.projectId)) return { error: "Invalid project ID" }
    if (input.targetUnitCostGbp !== null && !(input.targetUnitCostGbp > 0)) {
      return { error: "Target must be > 0" }
    }
    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ target_unit_cost_gbp: input.targetUnitCostGbp })
      .eq("id", input.projectId)
      .eq("foundry_id", foundryId)
    if (error) {
      console.error("[design-iterations] setTarget failed:", error.message)
      return { error: "Could not save target" }
    }
    return { targetUnitCostGbp: input.targetUnitCostGbp }
  })
}

/**
 * Read the accepted-risk register for a project. Used by the Launch Readiness
 * Gauge to surface "here are the concerns the founder chose to accept rather
 * than iterate".
 */
export async function getProjectAcceptedRisks(projectId: string) {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!isValidUUID(projectId)) return { error: "Invalid project ID" }
    const { data, error } = await supabase
      .from("cad_lab_projects")
      .select("accepted_risks")
      .eq("id", projectId)
      .eq("foundry_id", foundryId)
      .maybeSingle()
    if (error || !data) return { error: "Project not found" }
    const arr = Array.isArray(data.accepted_risks) ? data.accepted_risks : []
    return { acceptedRisks: arr as unknown as Array<{
      concern_hash: string
      concern_text: string
      accepted_by?: string | null
      accepted_at: string
      reason: string
    }> }
  })
}

export async function acceptDesignRisk(input: AcceptRiskInput) {
  return withAuth(async ({ supabase, user, foundryId }) => {
    if (!isValidUUID(input.projectId)) return { error: "Invalid project ID" }
    if (!input.reason?.trim()) return { error: "A written reason is required to accept a design risk" }

    const { data: project } = await supabase
      .from("cad_lab_projects")
      .select("accepted_risks")
      .eq("id", input.projectId)
      .eq("foundry_id", foundryId)
      .maybeSingle()
    if (!project) return { error: "Project not found" }

    const existing = Array.isArray(project.accepted_risks) ? project.accepted_risks : []
    const updated = [
      ...existing,
      {
        concern_hash: input.concernHash,
        concern_text: input.concernText,
        accepted_by: user.id,
        accepted_at: new Date().toISOString(),
        reason: input.reason.trim(),
      },
    ]

    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ accepted_risks: updated as unknown as Json })
      .eq("id", input.projectId)
      .eq("foundry_id", foundryId)

    if (error) {
      console.error("[design-iterations] Accept risk failed:", error.message)
      return { error: "Could not accept risk" }
    }

    await emitIterationEvent(supabase, {
      userId: user.id,
      foundryId,
      feature: "design_iteration_risk_accepted",
      payload: {
        projectId: input.projectId,
        concernHash: input.concernHash,
        reasonLength: input.reason.trim().length,
      },
    })

    return { acceptedRisks: updated }
  })
}
