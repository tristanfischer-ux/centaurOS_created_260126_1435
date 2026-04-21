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
import {
    generateCadLabSingleImageAction,
    flipCadLabImageForMirrorAction,
    type MirrorAxis,
} from "@/actions/cad-lab-images"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { ImageGenModuleInput } from "@/lib/cad-lab/module-to-module-spec-adapter"
import { DEFAULT_ILLUSTRATION_STYLE, isIllustrationStyle } from "@/lib/cad-lab/illustration-styles"

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
        // system_illustration_url is included so every per-module render
        // can be anchored to the already-rendered cover — Gemini 3.1
        // Flash Image copies palette, line weight, and composition from
        // the reference, which is the biggest single lever for the
        // "every image looks different" problem.
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select(
                "id, foundry_id, modules, visual_style, illustration_style, system_illustration_url",
            )
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

        // 1b. Mirror-pair short-circuit. If this module is marked as the
        //     mirror of another (via CadLabModule.mirrorOf, populated by
        //     Max's decomposition on pairs like Port/Starboard Solar Wing)
        //     AND the primary already has a rendered image, produce this
        //     module's asset by flipping the primary with sharp — much
        //     faster than regenerating AND the two cards end up pixel-for-
        //     pixel mirror copies instead of two independent renders that
        //     Gemini can't keep identical.
        //
        //     V1 context had this logic; V2 previously did not — every
        //     NetHawk-12 solar wing rendered separately and the two
        //     diverged visibly in the PDF.
        //
        //     Fallback path: if the primary hasn't been rendered yet,
        //     or if the flip action fails, fall through to normal
        //     regeneration so we never ship worse than before. The
        //     per-module-images button reorders primaries first so the
        //     common case hits the flip happy path.
        const mirrorOfId =
            typeof target.mirrorOf === "string" && target.mirrorOf.trim()
                ? target.mirrorOf.trim()
                : undefined
        if (mirrorOfId) {
            const primary = modules.find((m) => m.id === mirrorOfId)
            const primaryImageUrl =
                typeof primary?.imageUrl === "string" ? primary.imageUrl : undefined
            if (
                primary &&
                primaryImageUrl &&
                primary.imageStatus === "complete"
            ) {
                // Axis: vertical for Upper/Lower/Top/Bottom pairs, horizontal
                // otherwise. Same dead-simple detection V1 uses — no regex
                // gymnastics, the flip server action also re-checks via the
                // name prefix as defence-in-depth.
                const nameLc = target.name.trim().toLowerCase()
                const axis: MirrorAxis = /^(lower|bottom|upper|top)\s/.test(nameLc)
                    ? "vertical"
                    : "horizontal"
                const flipRes = await flipCadLabImageForMirrorAction(
                    projectId,
                    target.id,
                    primaryImageUrl,
                    axis,
                    target.name,
                )
                if ("imageUrl" in flipRes) {
                    // Persist the flipped URL to just this module's slot,
                    // same re-read + splice pattern as the main path below
                    // so concurrent loops can't clobber each other.
                    const { data: fresh, error: reloadErr } = await admin
                        .from("cad_lab_projects")
                        .select("modules")
                        .eq("id", projectId)
                        .maybeSingle()
                    if (!reloadErr && fresh) {
                        const freshModules =
                            (fresh.modules as unknown as CadLabModule[]) ?? []
                        const freshIdx = freshModules.findIndex(
                            (m) => m.id === moduleId,
                        )
                        if (freshIdx !== -1) {
                            const updatedModules: CadLabModule[] = [...freshModules]
                            updatedModules[freshIdx] = {
                                ...freshModules[freshIdx],
                                imageUrl: flipRes.imageUrl,
                                imageStatus: "complete",
                                // Re-use the primary's model label so the UI
                                // can tell they came from the same pipeline.
                                imageModelUsed: primary.imageModelUsed,
                            }
                            const { error: updateErr } = await admin
                                .from("cad_lab_projects")
                                .update({ modules: updatedModules })
                                .eq("id", projectId)
                            if (!updateErr) {
                                console.log(
                                    `[forge-v2-generate-one-module-image] flipped primary ${mirrorOfId} → mirror ${target.id} (${axis})`,
                                )
                                return { ok: true, imageUrl: flipRes.imageUrl }
                            }
                            console.warn(
                                `[forge-v2-generate-one-module-image] flip succeeded but persist failed for ${target.id}:`,
                                updateErr.message ?? updateErr,
                            )
                        }
                    }
                } else {
                    console.warn(
                        `[forge-v2-generate-one-module-image] flip failed for ${target.id}, falling back to regen: ${flipRes.error}`,
                    )
                }
            }
            // If we reach here, the fallback path (full regeneration below)
            // kicks in — either the primary wasn't ready yet, the flip
            // action failed, or the persist failed. Better to regen than
            // to surface an error for a recoverable case.
        }

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

        // Honour the project's illustration_style so every module renders
        // in the same visual language as the hero (the hero orchestrator
        // in forge-v2-generate-system-illustration.ts reads the same
        // column). Without this, hero and modules defaulted to different
        // programmatic prompts and the two diverged visibly in the PDF.
        const illustrationStyle = isIllustrationStyle(project.illustration_style)
            ? project.illustration_style
            : DEFAULT_ILLUSTRATION_STYLE

        // 2b. Fetch the system illustration (cover) as bytes so we can
        //     pass it to Gemini as a multimodal reference — the single
        //     biggest lever for visual coherence between cover and per-
        //     module renders. The previous comment about
        //     "~800KB through React Flight blows the limit" applied
        //     when the client passed base64 to a server action; here we
        //     fetch server-side so that limit doesn't apply.
        //
        //     Non-critical: if the fetch fails (cover not yet rendered,
        //     CDN hiccup, large file), fall through to a text-only
        //     render. A module without a reference is still valid — we
        //     just lose the palette-anchor benefit.
        let systemIllustrationRefBase64: string | undefined
        const sysUrl = project.system_illustration_url
        if (typeof sysUrl === "string" && sysUrl.length > 0) {
            try {
                const res = await fetch(sysUrl)
                if (res.ok) {
                    const buf = Buffer.from(await res.arrayBuffer())
                    // Cap at ~1.5MB after base64 expansion — larger than
                    // that and we risk blowing the provider's upload limit.
                    // Gemini accepts multi-MB; OpenAI fallback is tighter.
                    if (buf.length < 1_200_000) {
                        systemIllustrationRefBase64 = buf.toString("base64")
                    } else {
                        console.warn(
                            `[forge-v2-generate-one-module-image] system illustration too large ` +
                                `(${buf.length} bytes) to use as reference for ${moduleId}; text-only fallback.`,
                        )
                    }
                }
            } catch (err) {
                console.warn(
                    `[forge-v2-generate-one-module-image] failed to fetch system illustration ` +
                        `as reference for ${moduleId}:`,
                    err instanceof Error ? err.message : err,
                )
            }
        }

        // 3. Run ONE image-gen call — typically 20–60s wall-clock.
        let result: Awaited<ReturnType<typeof generateCadLabSingleImageAction>>
        try {
            result = await generateCadLabSingleImageAction(
                projectId,
                input,
                visualStyle,
                systemIllustrationRefBase64, // reference: cover sets the style
                undefined, // moduleCropBase64
                illustrationStyle,
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
