"use server"

/**
 * @file start-project-with-autopilot.ts — one-shot "brief in, autopilot out".
 *
 * @description The simple happy path Tristan asked for: a founder types a
 * brief, clicks one button, and autopilot runs the whole pipeline through to
 * a finished PDF without further clicks. This action is the server-side
 * wrapper that:
 *
 *   1. Creates the cad_lab_projects row via the existing createCadLabProject
 *      action (which also auto-fires Chase research).
 *   2. Seeds cad_lab_projects.autopilot_state so the state machine can begin
 *      at `waiting_chase` — Chase was fired by createCadLabProject, autopilot
 *      just polls for its completion.
 *   3. Schedules the first autopilot stage (stepWaitForChase) via after().
 *   4. (Optional) Persists structured intake fields from the guided wizard:
 *      target_scale, market_segment, geography, startup_stage,
 *      additional_context. These enrich Gate 1's numeric verification.
 *
 * Returns `{ projectId }` so the client can redirect to the workspace where
 * the autopilot progress ticker + the stage chips take over.
 *
 * The 5-step wizard at /the-forge-v2/new is the "guided mode" for founders
 * who want to fill in structured fields before committing. This action handles
 * both the express (subject-only) and wizard (all fields) paths.
 *
 * @related
 *   - src/actions/cad-lab-projects.ts → createCadLabProject
 *   - src/actions/forge-v2-autopilot.ts → startAutopilotForProject, stepWaitForChase
 *   - src/app/(platform)/the-forge-v2/start/* (simple one-click UI)
 *   - src/app/(platform)/the-forge-v2/new/_components/intake-wizard.tsx (guided wizard)
 */

import { createCadLabProject } from "@/actions/cad-lab-projects"
import { startAutopilot } from "@/actions/forge-v2-autopilot"
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

    // Step 2: kick autopilot off for the new project. This itself wraps in
    // withAuth so it runs with the caller's cookies. The inner chain uses
    // after()-scheduled stage runners that each take admin-client responsibility
    // so post-response stages don't need cookies (fix #90).
    try {
        const autopilotResult = await startAutopilot(projectId)
        if (!autopilotResult.ok) {
            // Non-fatal — project exists. Caller can still land on workspace
            // and click "Run autopilot" manually. Surface a soft warning
            // rather than 500.
            console.warn(
                "[start-project-with-autopilot] startAutopilotForProject refused:",
                autopilotResult,
            )
            return { ok: true, projectId }
        }
    } catch (err) {
        // Same reasoning — project creation succeeded, autopilot kickoff is
        // a bonus. Return success + log so the founder still has the
        // workspace to land on.
        console.error(
            "[start-project-with-autopilot] startAutopilotForProject threw:",
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
