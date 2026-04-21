"use server"

/**
 * @file forge-v2-generate-module-images.ts — orchestrator for V2 Modules page.
 *
 * @description Thin wrapper around `generateCadLabModuleImagesAction()` that
 * the V2 Modules page calls from its "Generate module renders" button. The
 * inner action generates per-module Nano Banana blueprint images in batches
 * of 3 and returns the updated modules array — but it does NOT persist the
 * new imageUrl / imageStatus back onto `cad_lab_projects.modules`. That's
 * this wrapper's job.
 *
 * Without persistence the button would appear to "work" (each module would
 * briefly have an imageUrl in memory), then the next server-component render
 * would reload stale modules from the DB and every render slot would flip
 * back to "Concept render not yet generated." That's the exact partial-
 * failure-looks-like-success trap the task spec warns against.
 *
 * @security withAuth + foundry check on the loaded project row. The inner
 *   action also runs under `withAIGate` + its own ownership check, so this
 *   wrapper is defence-in-depth and deliberately redundant.
 *
 * @related
 * - Inner action: src/actions/cad-lab-images.ts (generateCadLabModuleImagesAction)
 * - UI button:    src/app/(platform)/the-forge-v2/projects/[id]/modules/
 *                 generate-module-images-button.tsx
 * - Sibling orchestrator (same pattern):
 *                 src/actions/forge-v2-supplier-match.ts
 * - Table:        cad_lab_projects (jsonb modules column)
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { withAuth } from "@/lib/server-action-utils"
import { generateCadLabModuleImagesAction } from "@/actions/cad-lab-images"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Types ────────────────────────────────────────────────────────────

export type GenerateModuleImagesErrorCode =
    | "PROJECT_NOT_FOUND"
    | "PROJECT_FORBIDDEN"
    | "NO_MODULES"
    | "INTERNAL"

export type GenerateModuleImagesResult =
    | {
          ok: true
          /** Count of modules with a new imageUrl after generation. */
          successCount: number
          /** Count of modules whose generation call threw. */
          failedCount: number
      }
    | {
          ok: false
          error: string
          errorCode: GenerateModuleImagesErrorCode
      }

// ─── Orchestrator ─────────────────────────────────────────────────────

/**
 * Generates per-module blueprint renders for every module on the project and
 * persists the updated modules array back to `cad_lab_projects.modules`.
 *
 * Business rule: refuses with `NO_MODULES` if the project has zero modules —
 * the button on the Modules page is disabled in that state, but defence in
 * depth.
 */
export async function generateModuleImagesForProject(
    projectId: string,
): Promise<GenerateModuleImagesResult> {
    return withAuth<GenerateModuleImagesResult>(async ({ foundryId }) => {
        const admin = createAdminClient()
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, modules, visual_style")
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr) {
            console.error(
                "[forge-v2-generate-module-images] project load failed:",
                projectErr.message,
            )
            return {
                ok: false,
                error: "Couldn't load project",
                errorCode: "INTERNAL",
            }
        }
        if (!project) {
            return {
                ok: false,
                error: "Project not found",
                errorCode: "PROJECT_NOT_FOUND",
            }
        }
        if (project.foundry_id !== foundryId) {
            // SECURITY: don't leak the existence of other-foundry projects.
            return {
                ok: false,
                error: "Project not found",
                errorCode: "PROJECT_FORBIDDEN",
            }
        }

        const rawModules = project.modules as unknown
        const modules = (Array.isArray(rawModules) ? rawModules : []) as CadLabModule[]
        if (modules.length === 0) {
            return {
                ok: false,
                error:
                    "This project hasn't been decomposed yet — run Max's module decomposition first.",
                errorCode: "NO_MODULES",
            }
        }

        // Pull the project's saved visual style so every module render shares
        // the same palette / line weight. The inner action treats
        // `visualStyle` as optional, so a null row just means "no shared style
        // locked in yet" — each image still generates on its own.
        const rawVisualStyle = project.visual_style as unknown
        const visualStyle =
            rawVisualStyle && typeof rawVisualStyle === "object"
                ? (rawVisualStyle as Parameters<typeof generateCadLabModuleImagesAction>[2])
                : undefined

        // INTENT: Reference image would let the blueprint match the hero's
        // palette/geometry, but it's ~800KB of base64 and blows React Flight
        // limits when passed from the client (see CLAUDE.md §CAD Lab). We
        // skip it here — each module render lands without a reference, which
        // is the same path the legacy /cad-lab button takes when no hero
        // exists yet.
        const result = await generateCadLabModuleImagesAction(
            projectId,
            modules,
            visualStyle,
        )

        if ("error" in result) {
            return {
                ok: false,
                error: result.error,
                errorCode: "INTERNAL",
            }
        }

        // Persist the returned modules array — the inner action only mutates
        // the in-memory copy it returns, so without this write the new
        // imageUrl values would vanish on the next server-component render.
        const { error: updateErr } = await admin
            .from("cad_lab_projects")
            .update({ modules: result.modules })
            .eq("id", projectId)

        if (updateErr) {
            // GOTCHA: Returning ok:false here means the UI chip renders as a
            // failure even though some images may have generated (and been
            // uploaded to storage). Honest: the founder reloads the page and
            // sees "Concept render not yet generated" because the persist
            // step didn't land. Flagging INTERNAL rather than silently
            // succeeding avoids the partial-failure-looks-like-success trap.
            console.error(
                "[forge-v2-generate-module-images] modules persist failed:",
                updateErr.message,
            )
            return {
                ok: false,
                error: "Generated renders but couldn't save them — please retry.",
                errorCode: "INTERNAL",
            }
        }

        return {
            ok: true,
            successCount: result.successCount,
            failedCount: result.failedCount,
        }
    })
}
