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

import sharp from "sharp"

import { createAdminClient } from "@/lib/supabase/admin"
import { withAuth } from "@/lib/server-action-utils"
import {
    generateCadLabSingleImageAction,
    flipCadLabImageForMirrorAction,
    type MirrorAxis,
} from "@/actions/cad-lab-images"
import type { CadLabModule, VisualStyleSpec } from "@/lib/cad-lab-types"
import type { ImageGenModuleInput } from "@/lib/cad-lab/module-to-module-spec-adapter"
import { DEFAULT_ILLUSTRATION_STYLE, isIllustrationStyle } from "@/lib/cad-lab/illustration-styles"
import {
    analyseHeroBoundingBoxes,
    cropModuleRegion,
    generateModuleImageFromCrop,
} from "@/app/(platform)/the-forge/services/image-generator"
import type { ModuleBoundingBox } from "@/app/(platform)/the-forge/services/image-generator"
import type { Json } from "@/types/database.types"

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
                "id, foundry_id, modules, visual_style, illustration_style, system_illustration_url, interior_overview_url, hero_bounding_boxes, subject",
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

        // 1c. Ghosted-context crop short-circuit.
        //
        //     When `interior_overview_url` is set, we render modules
        //     DETERMINISTICALLY by cropping regions of that interior hero
        //     with Sharp rather than regenerating each tile with gpt-image-2.
        //     Geometric consistency is 100% because the output pixels are
        //     literally copies of the hero with the peripheral area
        //     desaturated — so the "container in a container" drift that
        //     motivated this pipeline can't recur.
        //
        //     Cache policy: the bounding-box map is computed once per project
        //     (Claude Vision, ~5s) and persisted to
        //     `cad_lab_projects.hero_bounding_boxes`. Subsequent per-module
        //     calls reuse the map and pay only the Sharp pipeline (~200ms).
        //
        //     Fallback: any failure (hero fetch, vision miss, sharp error)
        //     falls through to the existing gpt-image-2 path below so we
        //     never ship worse than before.
        const interiorUrl = project.interior_overview_url
        if (typeof interiorUrl === "string" && interiorUrl.length > 0) {
            try {
                const heroRes = await fetch(interiorUrl)
                if (!heroRes.ok) {
                    console.error(
                        "[forge-v2-generate-one-module-image] interior hero fetch non-ok; falling through to gpt-image-2",
                        {
                            projectId,
                            moduleId,
                            status: heroRes.status,
                            gate: "interior-fetch-non-ok",
                        },
                    )
                } else {
                    const heroBuf = Buffer.from(await heroRes.arrayBuffer())
                    // flatten alpha to white so any PNG transparency in the
                    // hero doesn't surface as black in the ghosted output.
                    const flat = await sharp(heroBuf)
                        .flatten({ background: { r: 255, g: 255, b: 255 } })
                        .png()
                        .toBuffer()
                    const interiorBase64 = flat.toString("base64")

                    // Reuse cached bbox map when available, otherwise compute
                    // once via Claude Vision and persist.
                    let bboxMap: Record<string, ModuleBoundingBox> = {}
                    const cached = project.hero_bounding_boxes as unknown
                    if (cached && typeof cached === "object") {
                        bboxMap = cached as Record<string, ModuleBoundingBox>
                    } else {
                        const moduleNames = modules.map((m) => m.name)
                        bboxMap = await analyseHeroBoundingBoxes(
                            interiorBase64,
                            moduleNames,
                            "image/png",
                        )
                        if (Object.keys(bboxMap).length > 0) {
                            const { error: saveErr } = await admin
                                .from("cad_lab_projects")
                                .update({
                                    hero_bounding_boxes: bboxMap as unknown as Json,
                                })
                                .eq("id", projectId)
                            if (saveErr) {
                                console.warn(
                                    "[forge-v2-generate-one-module-image] failed to persist hero_bounding_boxes:",
                                    saveErr.message ?? String(saveErr),
                                )
                            }
                        }
                    }

                    // Case-insensitive lookup — Claude Vision sometimes
                    // title-cases supplied names.
                    const bbox =
                        bboxMap[target.name] ??
                        Object.entries(bboxMap).find(
                            ([k]) =>
                                k.trim().toLowerCase() ===
                                target.name.trim().toLowerCase(),
                        )?.[1]

                    if (!bbox) {
                        console.error(
                            "[forge-v2-generate-one-module-image] no bbox for module in interior hero; falling through to gpt-image-2",
                            {
                                projectId,
                                moduleId,
                                moduleName: target.name,
                                availableBoxes: Object.keys(bboxMap),
                                gate: "interior-bbox-miss",
                            },
                        )
                    } else {
                        const cropResult = await generateModuleImageFromCrop(
                            projectId,
                            { id: target.id, name: target.name },
                            interiorBase64,
                            bbox,
                        )

                        // Persist: re-read + splice pattern, same as the
                        // mirror / gpt-image-2 paths below, so parallel
                        // per-module loops can't clobber each other.
                        const { data: fresh, error: reloadErr } = await admin
                            .from("cad_lab_projects")
                            .select("modules")
                            .eq("id", projectId)
                            .maybeSingle()
                        if (reloadErr || !fresh) {
                            console.error(
                                "[forge-v2-generate-one-module-image] ghosted-crop succeeded but persist reload failed",
                                {
                                    projectId,
                                    moduleId,
                                    error:
                                        reloadErr?.message ??
                                        "missing row",
                                },
                            )
                            return {
                                ok: false,
                                error:
                                    "Generated the tile but couldn't persist — reload failed.",
                                errorCode: "INTERNAL",
                            }
                        }
                        const freshModules =
                            (fresh.modules as unknown as CadLabModule[]) ?? []
                        const freshIdx = freshModules.findIndex(
                            (m) => m.id === moduleId,
                        )
                        if (freshIdx === -1) {
                            return {
                                ok: false,
                                error:
                                    "Module was removed from the project during generation.",
                                errorCode: "MODULE_NOT_FOUND",
                            }
                        }
                        const updatedModules: CadLabModule[] = [...freshModules]
                        updatedModules[freshIdx] = {
                            ...freshModules[freshIdx],
                            imageUrl: `${cropResult.url}?v=${Date.now()}`,
                            imageStatus: "complete",
                            imageModelUsed: cropResult.modelUsed,
                        }
                        const { error: updateErr } = await admin
                            .from("cad_lab_projects")
                            .update({ modules: updatedModules })
                            .eq("id", projectId)
                        if (updateErr) {
                            console.error(
                                "[forge-v2-generate-one-module-image] ghosted-crop persist failed",
                                {
                                    projectId,
                                    moduleId,
                                    error:
                                        updateErr.message ?? String(updateErr),
                                },
                            )
                            return {
                                ok: false,
                                error:
                                    "Generated the tile but couldn't save — please retry this module.",
                                errorCode: "INTERNAL",
                            }
                        }

                        console.log(
                            "[forge-v2-generate-one-module-image] ghosted-crop render complete",
                            {
                                projectId,
                                moduleId,
                                moduleName: target.name,
                                bbox,
                            },
                        )
                        return {
                            ok: true,
                            imageUrl: updatedModules[freshIdx].imageUrl ?? cropResult.url,
                        }
                    }
                }
            } catch (err) {
                // Any failure in the ghosted-crop path falls through to the
                // existing gpt-image-2 flow — never ship worse than before.
                console.error(
                    "[forge-v2-generate-one-module-image] ghosted-crop threw; falling through to gpt-image-2",
                    {
                        projectId,
                        moduleId,
                        gate: "interior-crop-throw",
                        error: err instanceof Error ? err.message : String(err),
                    },
                )
            }
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
        // it through for cross-module cohesion, otherwise we synthesise a
        // minimum-viable VisualStyleSpec from project subject + modules so
        // gpt-image-2 at least has a dimensional anchor (e.g. "40ft ISO
        // container") instead of rendering modules with no context. The
        // absence of visualStyle was one of four documented root causes for
        // drift in the BESS 931e0220 forensic diagnosis — every module
        // rendered as an untethered "LFP Battery Rack" with no enclosure.
        let rawStyle = project.visual_style as unknown
        if (!rawStyle || typeof rawStyle !== "object") {
            const subject =
                typeof project.subject === "string" ? project.subject : ""
            const synthesized = buildMinimalVisualStyleFromProject(
                subject,
                modules,
            )
            if (synthesized) {
                console.log(
                    "[forge-v2-generate-one-module-image] visual_style was null; synthesised minimum spec from project subject.",
                    { projectId, moduleId, subjectHead: subject.slice(0, 120) },
                )
                // Persist so sibling module renders (and subsequent full-chain
                // runs) reuse the same anchor. Non-fatal on write failure —
                // we still pass the in-memory spec to the current render.
                const { error: styleSaveErr } = await admin
                    .from("cad_lab_projects")
                    .update({
                        visual_style: synthesized as unknown as Json,
                    })
                    .eq("id", projectId)
                if (styleSaveErr) {
                    console.error(
                        "[forge-v2-generate-one-module-image] failed to persist synthesised visual_style:",
                        {
                            projectId,
                            moduleId,
                            error:
                                styleSaveErr.message ?? String(styleSaveErr),
                        },
                    )
                }
                rawStyle = synthesized
            }
        }
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
        //     Fix 1 (2026-04-22): Always re-encode the PNG hero to JPEG-85.
        //     The BESS 931e0220 forensic diagnosis traced image-drift to a
        //     2.52 MB PNG hero hitting the old 1.2 MB cap → base64
        //     undefined → every downstream coherence mechanism skipped
        //     (edit-mode, Gemini multimodal, consistency-score retry,
        //     bbox crop). sharp.jpeg({ quality: 85 }) gives 3-5x compression
        //     so a fresh hero now lands well under every provider's limit.
        //
        //     Fix 4 (2026-04-22): warn → error with structured context so
        //     silent drift never ships again — Vercel log search on "gate"
        //     surfaces it immediately.
        let systemIllustrationRefBase64: string | undefined
        let systemIllustrationRefMimeType: string | undefined
        const sysUrl = project.system_illustration_url
        if (typeof sysUrl === "string" && sysUrl.length > 0) {
            try {
                const res = await fetch(sysUrl)
                if (res.ok) {
                    const pngBuf = Buffer.from(await res.arrayBuffer())
                    // flatten({background:'#fff'}) composites alpha onto white
                    // so the JPEG doesn't pick up the alpha channel as black,
                    // matching the white background the prompt already asks for.
                    const jpegBuf = await sharp(pngBuf)
                        .flatten({ background: { r: 255, g: 255, b: 255 } })
                        .jpeg({ quality: 85 })
                        .toBuffer()
                    // gpt-image-2 accepts up to 25 MB; OpenAI edit is tighter
                    // at ~20 MB. A JPEG over 20 MB is pathological — bail to
                    // text-only rather than throwing.
                    if (jpegBuf.length >= 20_000_000) {
                        console.error(
                            "[forge-v2-generate-one-module-image] hero too large even after jpeg re-encode — text-only fallback",
                            {
                                projectId,
                                moduleId,
                                heroBytesPng: pngBuf.length,
                                heroBytesJpeg: jpegBuf.length,
                                gate: "hero-size-post-encode",
                            },
                        )
                    } else {
                        systemIllustrationRefBase64 =
                            jpegBuf.toString("base64")
                        systemIllustrationRefMimeType = "image/jpeg"
                        console.log(
                            "[forge-v2-generate-one-module-image] hero re-encoded PNG→JPEG for reference",
                            {
                                projectId,
                                moduleId,
                                heroBytesPng: pngBuf.length,
                                heroBytesJpeg: jpegBuf.length,
                                compressionRatio: Number(
                                    (pngBuf.length / jpegBuf.length).toFixed(2),
                                ),
                            },
                        )
                    }
                } else {
                    console.error(
                        "[forge-v2-generate-one-module-image] hero fetch returned non-ok",
                        {
                            projectId,
                            moduleId,
                            status: res.status,
                            gate: "hero-fetch-non-ok",
                        },
                    )
                }
            } catch (err) {
                console.error(
                    "[forge-v2-generate-one-module-image] hero fetch/encode threw",
                    {
                        projectId,
                        moduleId,
                        gate: "hero-fetch-throw",
                        error: err instanceof Error ? err.message : String(err),
                    },
                )
            }
        }

        // Fix 2 (2026-04-22): bounding-box crop.
        // When 2+ modules are being rendered and a hero is present, use
        // Claude Vision to locate each module's region in the hero, then
        // crop + upscale that region to 1024×1024 as IMAGE 2 for the
        // multimodal render. This unlocks the `hasModuleCrop=true` branch
        // in buildReferenceAwareModulePrompt() which tells the image model
        // to "reproduce IMAGE 2's geometry exactly" — the tightest
        // instruction the prompt chain supports.
        //
        // Cost: ~5s per module (bbox call) + ~1s (sharp crop). Accepted.
        // On any failure (vision timeout, bbox missing, sharp error) we
        // fall through to hero-only reference, which is still better than
        // text-only.
        let moduleCropBase64: string | undefined
        if (
            systemIllustrationRefBase64 &&
            systemIllustrationRefMimeType &&
            modules.length >= 2 &&
            process.env.ANTHROPIC_API_KEY?.trim()
        ) {
            try {
                const moduleNames = modules.map((m) => m.name)
                const boxes = await analyseHeroBoundingBoxes(
                    systemIllustrationRefBase64,
                    moduleNames,
                    systemIllustrationRefMimeType,
                )
                const box =
                    boxes[target.name] ??
                    // case-insensitive fallback — Claude sometimes returns
                    // a title-cased variant of the supplied name.
                    Object.entries(boxes).find(
                        ([k]) =>
                            k.trim().toLowerCase() ===
                            target.name.trim().toLowerCase(),
                    )?.[1]
                if (box) {
                    moduleCropBase64 = await cropModuleRegion(
                        systemIllustrationRefBase64,
                        box,
                    )
                    console.log(
                        "[forge-v2-generate-one-module-image] module crop generated",
                        {
                            projectId,
                            moduleId,
                            moduleName: target.name,
                            box,
                        },
                    )
                } else {
                    console.error(
                        "[forge-v2-generate-one-module-image] no bbox found for module; hero-only reference",
                        {
                            projectId,
                            moduleId,
                            moduleName: target.name,
                            availableBoxes: Object.keys(boxes),
                            gate: "bbox-miss",
                        },
                    )
                }
            } catch (err) {
                console.error(
                    "[forge-v2-generate-one-module-image] bbox analysis / crop threw; hero-only reference",
                    {
                        projectId,
                        moduleId,
                        gate: "bbox-throw",
                        error: err instanceof Error ? err.message : String(err),
                    },
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
                moduleCropBase64,
                illustrationStyle,
                systemIllustrationRefMimeType,
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

// ─── Minimum-viable VisualStyleSpec synthesis ─────────────────────────
//
// Fix 3 (2026-04-22): when cad_lab_projects.visual_style IS NULL the prompt
// chain loses its dimensional anchor (productFormDescription), unifying
// context, palette, and per-module geometry notes. The BESS 931e0220
// diagnosis found gpt-image-2 rendering a bare "LFP Battery Rack" with no
// container enclosure because the prompt had no hint the product is a
// 40ft ISO container.
//
// The proper fix is Max's decomposition calling generateVisualStyleAction
// (Claude Sonnet, ~1-2s) once the modules land. Until that wiring exists
// OR when a legacy project is rendered without it, synthesise a minimum
// spec deterministically from the subject + module names so renders have
// SOMETHING to anchor on. Cheap (no API call), fires server-side once per
// render chain (then persisted), and costs ~5 lines of extra prompt.
function buildMinimalVisualStyleFromProject(
    subject: string,
    modules: CadLabModule[],
): VisualStyleSpec | null {
    const trimmedSubject = subject.trim()
    if (!trimmedSubject) return null

    // The first sentence of the project subject usually describes the overall
    // product form — for BESS this is "40ft ISO container pre-fitted with LFP
    // battery racks…". Using it verbatim gives the image model a dimensional
    // anchor without us having to parse "shipping container" out of arbitrary
    // free text.
    const firstSentence =
        trimmedSubject.split(/(?<=[.!?])\s+/)[0]?.slice(0, 400).trim() ||
        trimmedSubject.slice(0, 400)

    // Per-module geometry notes: one line per module describing it in the
    // context of the overall product. Cheap but materially better than the
    // default "draw a generic X" that happens without the map.
    const moduleGeometryMap: Record<string, string> = {}
    for (const m of modules) {
        const purpose =
            typeof m.purpose === "string" && m.purpose.trim().length > 0
                ? ` — ${m.purpose.trim()}`
                : ""
        moduleGeometryMap[m.name] =
            `${m.name}${purpose}. Render this sub-assembly in its correct position and proportion within the overall product form.`
    }

    return {
        colorPalette:
            "industrial steel blue, warm cool gray, brushed-aluminium silver, subtle copper/orange accent for active surfaces",
        materialRendering:
            "clean industrial engineering blueprint: thin uniform line weights, semi-realistic metal surfaces, soft specular highlights, matte composite / painted steel panels where appropriate",
        unifyingContext: trimmedSubject.slice(0, 400),
        productFormDescription: firstSentence,
        moduleGeometryMap,
    }
}
