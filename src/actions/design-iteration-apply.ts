/**
 * @file design-iteration-apply.ts — Atomic apply of a picked design iteration.
 *
 * @description Phase V of the design-iteration system. When a founder picks an
 * alternative in the DesignIterationDialog, this action:
 *   1. Writes the alternative's `changes` onto the project (research fields +
 *      accepted_risks touch-ups if applicable).
 *   2. Bumps cad_lab_projects.design_revision so illustrations become stale.
 *   3. Leaves compliance attestations + ratings untouched — those are tenant
 *      data that survives a design change unless directly affected.
 *   4. Marks the iteration row's applied_at timestamp (also set by
 *      commitIterationDecision, but this is the authoritative write when the
 *      changes actually land).
 *
 * The auto-rerun-specialist-checkpoint step (Open Q4: once per iteration, not
 * per apply) happens in the UI layer after this resolves, not inside this
 * action, so the action stays atomic and doesn't double-bill on LLM quota if
 * the founder re-clicks.
 *
 * @related
 * - Phase I: src/actions/design-iterations.ts
 * - Phase III: src/components/cad/design-iteration-dialog.tsx
 * - Plan: tasks/DESIGN-ITERATION-PHASE-PLAN.md (Phase V)
 */

"use server"

import { withAuth } from "@/lib/server-action-utils"
import { isValidUUID } from "@/lib/validations"
import type { Json } from "@/types/database.types"

export interface ApplyIterationInput {
  iterationId: string
  projectId: string
  chosenOptionIndex: number
}

export interface ApplyIterationResult {
  /** New design_revision number after bump */
  newRevision?: number
  /** Fields that were actually written onto the project (audit) */
  appliedFields?: string[]
  /** Modules that should have FAI entries marked stale (affected_module_ids) */
  staleModuleIds?: string[]
  error?: string
}

export async function applyDesignIteration(input: ApplyIterationInput): Promise<ApplyIterationResult> {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!isValidUUID(input.iterationId)) return { error: "Invalid iteration ID" }
    if (!isValidUUID(input.projectId)) return { error: "Invalid project ID" }
    if (input.chosenOptionIndex < 0 || input.chosenOptionIndex > 2) {
      return { error: "Only picked alternatives (0..2) can be applied" }
    }

    // AUTH: fetch iteration + project together, both must belong to caller's foundry
    const { data: iterRow } = await supabase
      .from("design_iterations")
      .select("id, alternatives_presented, triggered_by, project_id, foundry_id")
      .eq("id", input.iterationId)
      .eq("foundry_id", foundryId)
      .eq("project_id", input.projectId)
      .maybeSingle()
    if (!iterRow) return { error: "Iteration not found" }

    const alternatives = Array.isArray(iterRow.alternatives_presented)
      ? (iterRow.alternatives_presented as Array<Record<string, unknown>>)
      : []
    const picked = alternatives[input.chosenOptionIndex] as { changes?: Record<string, unknown> } | undefined
    if (!picked) return { error: "Alternative at the given index not found" }

    const changes = picked.changes ?? {}
    const { data: project } = await supabase
      .from("cad_lab_projects")
      .select("id, research, design_revision")
      .eq("id", input.projectId)
      .eq("foundry_id", foundryId)
      .maybeSingle()
    if (!project) return { error: "Project not found" }

    const projectUpdate: Record<string, unknown> = {}
    const appliedFields: string[] = []

    // ── Apply top-level research field changes ──
    // INTENT: research is stored as JSONB (often an object with dimensions like
    // wingspan_mm, mass_budget_kg, etc.). We update it by shallow-merging any
    // top-level keys from changes that aren't reserved meta keys.
    const RESERVED_META_KEYS = new Set([
      "affected_module_ids", "unit_cost_delta_gbp", "tooling_nre_delta_gbp",
      "moq_at_new_path", "break_even_units", "path_type", "details",
    ])
    const researchPatch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(changes)) {
      if (RESERVED_META_KEYS.has(k)) continue
      researchPatch[k] = v
    }
    if (Object.keys(researchPatch).length > 0) {
      const currentResearch = (project.research && typeof project.research === "object" && !Array.isArray(project.research))
        ? project.research as Record<string, unknown>
        : {}
      projectUpdate.research = { ...currentResearch, ...researchPatch } as Json
      appliedFields.push(...Object.keys(researchPatch).map((k) => `research.${k}`))
    }

    // ── Bump design_revision so illustrations become stale ──
    // images_generated_at_revision NOT touched — that marks which revision the
    // existing illustrations were generated at. The delta makes imagesStale=true
    // in the UI (page.tsx imagesStale derivation), triggering regeneration.
    const newRevision = (project.design_revision ?? 1) + 1
    projectUpdate.design_revision = newRevision
    appliedFields.push("design_revision")

    // ── Write to project ──
    const { error: updErr } = await supabase
      .from("cad_lab_projects")
      .update(projectUpdate)
      .eq("id", input.projectId)
      .eq("foundry_id", foundryId)
    if (updErr) {
      console.error("[design-iteration-apply] Project update failed:", updErr.message)
      return { error: "Could not apply alternative to project" }
    }

    // ── Mark iteration applied_at ──
    const { error: iterErr } = await supabase
      .from("design_iterations")
      .update({
        chosen_option_index: input.chosenOptionIndex,
        applied_at: new Date().toISOString(),
      })
      .eq("id", input.iterationId)
      .eq("foundry_id", foundryId)
    if (iterErr) {
      console.error("[design-iteration-apply] Iteration update failed:", iterErr.message)
      // Don't fail the whole operation — project has already changed. Log + continue.
    }

    // ── Extract stale module IDs for the UI to invalidate FAI entries ──
    const staleModuleIdsRaw = changes.affected_module_ids
    const staleModuleIds = Array.isArray(staleModuleIdsRaw)
      ? staleModuleIdsRaw.filter((v): v is string => typeof v === "string")
      : []

    return {
      newRevision,
      appliedFields,
      staleModuleIds,
    }
  })
}

// ─── In-flight iteration detection (Phase VI row-lock) ──────────────────

export interface InFlightIterationInfo {
  iterationId: string
  initiatedBy: string | null
  createdAt: string
  triggeredBy: string
  concernText: string
}

/**
 * Returns any design iteration on the project that was created within the last
 * 15 minutes and hasn't resolved (chosen_option_index IS NULL).
 *
 * Used before generating new alternatives to prevent two founders iterating
 * the same project concurrently. Caller can show "Another team member is
 * iterating — pause or take over".
 *
 * NOTE: This is advisory — no actual DB lock. If two clients both hit the
 * alternative generator simultaneously they'll both create rows. Phase VI
 * ship aim: ship advisory now, promote to proper lock with SELECT FOR UPDATE
 * if we see real collisions in prod telemetry.
 */
export async function getInFlightIterations(projectId: string): Promise<{ inFlight: InFlightIterationInfo[] } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!isValidUUID(projectId)) return { error: "Invalid project ID" }
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from("design_iterations")
      .select("id, initiated_by, created_at, triggered_by, concern_text")
      .eq("project_id", projectId)
      .eq("foundry_id", foundryId)
      .is("chosen_option_index", null)
      .gt("created_at", fifteenMinAgo)
      .order("created_at", { ascending: false })
      .limit(5)
    if (error) return { error: "Could not read in-flight iterations" }
    return {
      inFlight: (data ?? []).map((r) => ({
        iterationId: r.id,
        initiatedBy: r.initiated_by,
        createdAt: r.created_at,
        triggeredBy: r.triggered_by,
        concernText: r.concern_text,
      })),
    }
  })
}
