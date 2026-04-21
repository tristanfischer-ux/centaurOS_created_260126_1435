"use server"

/**
 * @file forge-v2-generate-one-module-image.ts — per-module blueprint render.
 *
 * @description The batch action `generateCadLabModuleImagesAction` renders
 * all modules in one server call. For a 10-module cubesat, 10 × ~30–60s per
 * image pushes the wall-clock past Vercel's 300s `maxDuration` and the
 * function is killed before the persist step — founders saw "Generating 10
 * module renders…" for five minutes then the button silently reset to idle
 * with nothing written to the DB.
 *
 * Pragmatic fix: one server action per module. Each call wraps ONE
 * `generateCadLabSingleImageAction` invocation (typically 20–60s) plus a
 * read-splice-write on `cad_lab_projects.modules` to persist just that
 * module's `imageUrl` / `imageStatus`. The client loops through every
 * module sequentially, giving the founder live progress and a page that
 * survives tab-close — resuming simply re-picks up from the first module
 * still missing an imageUrl.
 *
 * @related
 * - Inner action: src/actions/cad-lab-images.ts (generateCadLabSingleImageAction)
 * - Client loop:  src/app/(platform)/the-forge-v2/projects/[id]/modules/
 *                 generate-module-images-button.tsx (updated to call this)
 * - Sibling:      src/actions/forge-v2-generate-module-images.ts (batch wrapper,
 *                 retained for back-compat but no longer used by the button)
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { withAuth } from "@/lib/server-action-utils"
import { generateCadLabSingleImageAction } from "@/actions/cad-lab-images"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { ImageGenModuleInput } from "@/lib/cad-lab/module-to-module-spec-adapter"

// ─── Types ─────────────────────────────────────────────────────────────

export type GenerateOneModuleImageErrorCode =
    | "PROJECT_NOT_FOUND"
    | "PROJECT_FORBIDDEN"
    | "MODULE_NOT_FOUND"
    | "GENERATION_FAILED"
    | "INTERNAL"

export type GenerateOneModuleImageResult =
    | { ok: true; imageUrl: string }
    | {
          ok: false
          error: string
          errorCode: GenerateOneModuleImageErrorCode
      }

// ─── Action ────────────────────────────────────────────────────────────

/**
 * Generates the blueprint render for ONE module and persists its imageUrl
 * back onto the project's `modules` jsonb. Safe to call many times in a
 * sequential loop from the client — each call has its own <300s budget.
 *
 * Idempotent: re-running on a module that already has an imageUrl overwrites
 * it with a fresh render.
 */
export async function generateOneModuleImage(
    projectId: string,
    moduleId: string,
): Promise<GenerateOneModuleImageResult> {
    return withAuth<GenerateOneModuleImageResult>(async ({ foundryId }) => {
        const admin = createAdminClient()

        // 1. Load project (auth + foundry check) and its current modules.
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, modules, visual_style")
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr) {
            return {
                ok: false,
                error: "Couldn't load project.",
                errorCode: "INTERNAL",
            }
        }
        if (!project) {
            return {
                ok: false,
                error: "Project not found.",
                errorCode: "PROJECT_NOT_FOUND",
            }
        }
        if (project.foundry_id !== foundryId) {
            // SECURITY: don't leak the existence of other-foundry projects.
            return {
                ok: false,
                error: "Project not found.",
                errorCode: "PROJECT_FORBIDDEN",
            }
        }

        const rawModules = project.modules as unknown
        const modules = (Array.isArray(rawModules) ? rawModules : []) as CadLabModule[]
        const idx = modules.findIndex((m) => m.id === moduleId)
        if (idx === -1) {
            return {
                ok: false,
                error: "Module not found on this project.",
                errorCode: "MODULE_NOT_FOUND",
            }
        }

        const target = modules[idx]

        // 2. Build the subset input shape the inner action needs. Safe
        //    defaults for missing CadLabModule fields match what the
        //    adapter would produce anyway.
        const input: ImageGenModuleInput = {
            id: target.id,
            name: target.name,
            purpose: typeof target.purpose === "string" ? target.purpose : "",
            inputs: Array.isArray(target.inputs) ? target.inputs : [],
            outputs: Array.isArray(target.outputs) ? target.outputs : [],
            keyParts: Array.isArray(target.keyParts) ? target.keyParts : [],
            leadWeeks: typeof target.leadWeeks === "number" ? target.leadWeeks : 0,
            description:
                typeof target.description === "string" ? target.description : "",
            whyItMatters:
                typeof target.whyItMatters === "string" ? target.whyItMatters : "",
            failureModes: Array.isArray(target.failureModes)
                ? target.failureModes
                : [],
            unknowns: Array.isArray(target.unknowns) ? target.unknowns : [],
            moduleImagePrompt:
                typeof target.moduleImagePrompt === "string"
                    ? target.moduleImagePrompt
                    : undefined,
        }

        // Visual style is optional — if the project has one saved we pass
        // it through for cross-module cohesion, otherwise the inner action
        // falls back to its own default.
        const rawStyle = project.visual_style as unknown
        const visualStyle =
            rawStyle && typeof rawStyle === "object"
                ? (rawStyle as Parameters<typeof generateCadLabSingleImageAction>[2])
                : undefined

        // 3. Run ONE image-gen call — typically 20–60s wall-clock.
        let result: Awaited<ReturnType<typeof generateCadLabSingleImageAction>>
        try {
            result = await generateCadLabSingleImageAction(
                projectId,
                input,
                visualStyle,
                undefined, // referenceBase64 — intentionally absent. ~800KB
                //               through React Flight would blow the limit;
                //               per-module renders ship without a hero-crop
                //               reference (same pattern as V1 when no hero
                //               has been generated yet).
                undefined, // moduleCropBase64
            )
        } catch (err) {
            console.error(
                `[forge-v2-generate-one-module-image] inner threw for ${moduleId}:`,
                err instanceof Error ? err.message : err,
            )
            return {
                ok: false,
                error: "Image generation threw — retry in a moment.",
                errorCode: "GENERATION_FAILED",
            }
        }

        if ("error" in result) {
            return {
                ok: false,
                error: result.error,
                errorCode: "GENERATION_FAILED",
            }
        }
        if (result.imageStatus === "failed") {
            return {
                ok: false,
                error: result.imageError ?? "Image generation failed.",
                errorCode: "GENERATION_FAILED",
            }
        }
        if (!result.imageUrl) {
            return {
                ok: false,
                error: "Image generator returned no URL.",
                errorCode: "GENERATION_FAILED",
            }
        }

        // 4. Splice the imageUrl into just this module's row, re-read the
        //    modules array to minimise the last-writer-wins window (other
        //    parallel per-module loops on the client would otherwise
        //    overwrite each other's slots).
        const { data: fresh, error: reloadErr } = await admin
            .from("cad_lab_projects")
            .select("modules")
            .eq("id", projectId)
            .maybeSingle()

        if (reloadErr || !fresh) {
            return {
                ok: false,
                error: "Generated OK but couldn't persist — reload failed.",
                errorCode: "INTERNAL",
            }
        }

        const freshModules =
            (fresh.modules as unknown as CadLabModule[]) ?? []
        const freshIdx = freshModules.findIndex((m) => m.id === moduleId)
        if (freshIdx === -1) {
            // Module disappeared between our initial read and now (unlikely
            // unless Max re-ran and wiped the id). Fail cleanly.
            return {
                ok: false,
                error: "Module was removed from the project during generation.",
                errorCode: "MODULE_NOT_FOUND",
            }
        }

        const updatedModules: CadLabModule[] = [...freshModules]
        updatedModules[freshIdx] = {
            ...freshModules[freshIdx],
            imageUrl: result.imageUrl,
            imageStatus: "complete",
            imageModelUsed: result.imageModelUsed ?? undefined,
        }

        const { error: updateErr } = await admin
            .from("cad_lab_projects")
            .update({ modules: updatedModules })
            .eq("id", projectId)

        if (updateErr) {
            console.error(
                `[forge-v2-generate-one-module-image] persist failed for ${moduleId}:`,
                updateErr.message ?? updateErr,
            )
            return {
                ok: false,
                error: "Generated but couldn't save — please retry this module.",
                errorCode: "INTERNAL",
            }
        }

        return { ok: true, imageUrl: result.imageUrl }
    })
}
