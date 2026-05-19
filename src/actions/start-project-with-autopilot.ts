"use server"

/**
 * @file start-project-with-autopilot.ts — "brief in, PDF out" — Chain engine path.
 *
 * @description Tristan unification directive (2026-05-19): ONE engine end-to-end.
 * The retired "autopilot specialists" path (forge-v2-autopilot.ts state machine
 * + 12 specialist server actions + export-project-pdf.tsx for final PDF) was
 * the second of FOUR parallel pipelines discovered in the audit
 * ([[forgeos_decisions_d43cbc3af134f902]]). It is now archived under
 * `_archive/` and no longer imported here. The canonical engine is the
 * pdf-engine-v2 chain (scripts/serial-design-chain-v2.tsx) executed by the
 * Mac Studio worker (scripts/pdf-engine-worker.mjs).
 *
 * Flow:
 *   1. createCadLabProject — creates the cad_lab_projects row (project page
 *      lands there).
 *   2. (Optional) persistWizardFields — keeps the structured-intake fields
 *      for the project page sidebar; not consumed by the chain engine.
 *   3. INSERT pdf_engine_runs (project_id, brief_text, status='pending') —
 *      the Mac Studio worker polls every 30s, claims it, spawns
 *      scripts/serial-design-chain-v2.tsx, and on completion uploads the PDF
 *      to Supabase Storage with status='ready'.
 *
 * Returns `{ projectId }` so the client redirects to the workspace; the page
 * polls pdf_engine_runs.status for that project_id.
 *
 * The "autopilot" name is retained for now because every UI link still calls
 * this action by that name; semantic rename is a follow-up.
 *
 * @related
 *   - src/actions/cad-lab-projects.ts → createCadLabProject (kept — still needed)
 *   - scripts/serial-design-chain-v2.tsx — the chain engine
 *   - scripts/pdf-engine-worker.mjs — the worker that polls + spawns the chain
 *   - _archive/2026-05-19-pre-chain-unification/forge-v2-autopilot.ts — retired
 */

import { createCadLabProject } from "@/actions/cad-lab-projects"
import { createAdminClient } from "@/lib/supabase/admin"

export type StartProjectWithAutopilotResult =
    | { ok: true; projectId: string }
    | { ok: false; error: string; errorCode?: string }

/** One row from the target scale / capacity structured form (wizard step 2). */
export interface TargetScaleEntry {
    value: number
    unit: string
    dimension:
        | "power"
        | "energy"
        | "area"
        | "throughput"
        | "volume"
        | "count"
        | "length"
        | "mass"
        | "time"
}

/** Optional structured fields from the intake wizard. All fields are optional
 *  so existing callers that only pass `subject` continue to work unchanged. */
export interface WizardIntakeFields {
    /** Step 2: structured numerics — [{value, unit, dimension}, …] */
    targetScale?: TargetScaleEntry[]
    /** Step 3: market segment free text */
    marketSegment?: string
    /** Step 3: geography multi-select */
    geography?: string[]
    /** Step 4: stage chip — idea | prototype | raising | scaling */
    startupStage?: "idea" | "prototype" | "raising" | "scaling"
    /** Step 5: additional context / constraints (max 1000 chars) */
    additionalContext?: string
}

/**
 * Create a project from a raw subject + immediately start autopilot.
 * Combines createCadLabProject (fires Chase) + startAutopilotForProject
 * (begins polling + walks the chain) so the founder sees exactly one click.
 *
 * @param subject      - The founder's brief (min 20 chars)
 * @param wizardFields - Optional structured intake fields from the guided wizard.
 *                       All are nullable — existing callers pass subject only.
 */
export async function startProjectWithAutopilot(
    subject: string,
    wizardFields?: WizardIntakeFields,
): Promise<StartProjectWithAutopilotResult> {
    // Step 1: create the project row. createCadLabProject is itself wrapped
    // in withAuth; it will return { error } on a failure shape, or
    // { projectId } on success.
    let projectId: string
    try {
        const result = await createCadLabProject(subject)
        if ("error" in result) {
            return { ok: false, error: result.error, errorCode: "CREATE_FAILED" }
        }
        projectId = result.projectId
    } catch (err) {
        const message =
            err instanceof Error && err.message
                ? err.message
                : "Something broke while creating the project."
        console.error("[start-project-with-autopilot] createCadLabProject threw:", err)
        return { ok: false, error: message, errorCode: "CREATE_THREW" }
    }

    // Step 1b: if the wizard provided structured fields, persist them now.
    // Uses admin client so this works in the same request without a fresh
    // auth round-trip.
    if (wizardFields && Object.keys(wizardFields).length > 0) {
        try {
            await persistWizardFields(projectId, wizardFields)
        } catch (err) {
            // Non-fatal — project + autopilot proceed. Log for diagnostics.
            console.warn(
                "[start-project-with-autopilot] persistWizardFields failed (non-fatal):",
                err instanceof Error ? err.message : err,
            )
        }
    }

    // Step 2: kick the CHAIN ENGINE off for this project. As of 2026-05-19
    // (Tristan unification directive) we run ONE engine end-to-end — the
    // serial-design-chain-v2 pipeline driven by the Mac Studio worker via
    // `pdf_engine_runs`. The legacy "autopilot specialists" path
    // (forge-v2-autopilot.ts state machine + 12 specialist actions +
    // export-project-pdf.tsx) has been retired and lives under `_archive/`
    // as reference only.
    //
    // Insert one pdf_engine_runs row pointing at this project; the worker
    // (scripts/pdf-engine-worker.mjs, polling every 30s) will claim it and
    // produce the PDF via scripts/serial-design-chain-v2.tsx →
    // scripts/render-minimal-pdf.tsx. The workspace page polls the chain
    // status to show progress + download.
    try {
        const admin = createAdminClient()
        const { error: jobErr } = await admin
            .from("pdf_engine_runs")
            .insert({
                project_id: projectId,
                brief_text: subject.trim(),
                status: "pending",
            })
        if (jobErr) {
            console.error(
                "[start-project-with-autopilot] pdf_engine_runs insert failed:",
                jobErr.message,
            )
            return { ok: true, projectId } // project exists; founder can retry
        }
    } catch (err) {
        console.error(
            "[start-project-with-autopilot] pdf_engine_runs insert threw:",
            err instanceof Error ? err.message : err,
        )
    }

    return { ok: true, projectId }
}

// ─── Private helpers ──────────────────────────────────────────────────────

/**
 * Persist structured intake wizard fields to an existing project row.
 * Uses the admin client so it runs without requiring a fresh auth round-trip.
 * Called immediately after createCadLabProject succeeds.
 *
 * SECURITY: projectId is validated upstream (UUID-shaped from createCadLabProject).
 * foundry_id isolation is enforced by RLS; we only update the row just created
 * by this session's createCadLabProject call.
 */
async function persistWizardFields(
    projectId: string,
    fields: WizardIntakeFields,
): Promise<void> {
    const admin = createAdminClient()

    // Build the update payload — only include fields that were provided.
    const update: Record<string, unknown> = {}

    if (fields.targetScale !== undefined) {
        update.target_scale = fields.targetScale
    }
    if (fields.marketSegment !== undefined) {
        update.market_segment = fields.marketSegment.trim() || null
    }
    if (fields.geography !== undefined) {
        update.geography = fields.geography.filter(Boolean)
    }
    if (fields.startupStage !== undefined) {
        update.startup_stage = fields.startupStage
    }
    if (fields.additionalContext !== undefined) {
        update.additional_context = fields.additionalContext.trim() || null
    }

    if (Object.keys(update).length === 0) return

    const { error } = await admin
        .from("cad_lab_projects")
        .update(update)
        .eq("id", projectId)

    if (error) {
        throw new Error(`[persistWizardFields] DB update failed: ${error.message}`)
    }

    console.info("[start-project-with-autopilot] wizard fields persisted", {
        projectId,
        fields: Object.keys(update),
    })
}
