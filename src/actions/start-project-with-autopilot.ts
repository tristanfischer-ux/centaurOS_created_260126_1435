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
 *
 * Returns `{ projectId }` so the client can redirect to the workspace where
 * the autopilot progress ticker + the stage chips take over.
 *
 * The 5-step wizard at /the-forge-v2/new is the "advanced mode" for founders
 * who want to fill in every field before committing. This action is the
 * "express mode" — brief-only, autopilot-auto-fires.
 *
 * @related
 *   - src/actions/cad-lab-projects.ts → createCadLabProject
 *   - src/actions/forge-v2-autopilot.ts → startAutopilotForProject, stepWaitForChase
 *   - src/app/(platform)/the-forge-v2/start/* (simple one-click UI)
 */

import { createCadLabProject } from "@/actions/cad-lab-projects"
import { startAutopilot } from "@/actions/forge-v2-autopilot"

export type StartProjectWithAutopilotResult =
    | { ok: true; projectId: string }
    | { ok: false; error: string; errorCode?: string }

/**
 * Create a project from a raw subject + immediately start autopilot.
 * Combines createCadLabProject (fires Chase) + startAutopilotForProject
 * (begins polling + walks the chain) so the founder sees exactly one click.
 */
export async function startProjectWithAutopilot(
    subject: string,
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
