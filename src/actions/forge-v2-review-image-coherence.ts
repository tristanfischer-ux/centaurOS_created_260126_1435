"use server"

/**
 * @file forge-v2-review-image-coherence.ts — Layer D of the image
 * coherence plan (IMAGE-COHERENCE-PLAN.md).
 *
 * @description After Layer A (tight preamble) + Layer B (unified
 * scaffold) + Layer C (cover as reference), some module images can
 * still drift out of family with the cover — Gemini's sampling is
 * stochastic, and a ~20% of module prompts still emerge visually
 * distinct enough to read as "from a different project".
 *
 * This action sends all generated images (cover + per-module) to Claude
 * Opus vision with a single prompt: "which of these look visibly
 * different in style from the group?". Flagged outliers are then
 * regenerated via the existing generateOneModuleImage path — which
 * now uses the cover-as-reference wiring from Layer C so the
 * regeneration has the best possible chance of matching the group.
 *
 * Vercel-budget: Opus vision call with 9 images (~15–30s) + up to 3
 * regenerations (~30–60s each) = under 300s typical. If more than 3
 * outliers are flagged, we regenerate the top 3 by severity and leave
 * the rest — next click picks up where we stopped.
 *
 * @related
 *   - Plan: IMAGE-COHERENCE-PLAN.md (Layer D)
 *   - Layer A+B+C commit: daf46bc1
 *   - Regen engine: src/actions/forge-v2-generate-one-module-image.ts
 */

import Anthropic from "@anthropic-ai/sdk"
import { createAdminClient } from "@/lib/supabase/admin"
import { withAuth } from "@/lib/server-action-utils"
import { getAnthropicKey } from "@/lib/ai/api-keys"
import { generateOneModuleImage } from "@/actions/forge-v2-generate-one-module-image"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Types ─────────────────────────────────────────────────────────────

export type ReviewCoherenceErrorCode =
    | "PROJECT_NOT_FOUND"
    | "PROJECT_FORBIDDEN"
    | "NO_COVER"
    | "NO_MODULES"
    | "NO_API_KEY"
    | "VISION_FAILED"
    | "INTERNAL"

export interface CoherenceOutlier {
    moduleId: string
    severity: "minor" | "moderate" | "major"
    reason: string
    regenerated: boolean
    regenError: string | null
}

export type ReviewCoherenceResult =
    | {
          ok: true
          /** All modules Opus flagged as visibly out-of-family with the
           *  group (ordered by severity desc). Up to 3 per invocation get
           *  an automatic regen attempt; the rest are returned with
           *  regenerated: false so the caller can surface them. */
          outliers: CoherenceOutlier[]
          /** Total images submitted to the vision call (cover + modules
           *  that had imageUrl set). Useful for the UI to show "reviewed
           *  9 images, found 2 outliers, regenerated 2". */
          reviewedCount: number
          /** Model used for the vision review — for the audit. */
          modelUsed: string
      }
    | {
          ok: false
          error: string
          errorCode: ReviewCoherenceErrorCode
      }

// ─── Internal helpers ──────────────────────────────────────────────────

async function fetchImageAsBase64(
    url: string,
): Promise<{ base64: string; mediaType: string } | null> {
    try {
        const res = await fetch(url)
        if (!res.ok) return null
        const buf = Buffer.from(await res.arrayBuffer())
        // Anthropic vision accepts up to ~5 MB per image. We cap at 1.5 MB
        // per image to stay well under the multi-image submission limit
        // (9 × 1.5 MB = 13.5 MB, fits comfortably in a single request).
        if (buf.length > 1_500_000) return null
        const mediaType = res.headers.get("content-type") ?? "image/png"
        // Anthropic's vision API only accepts a specific whitelist.
        const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"]
        const safeMedia = allowed.includes(mediaType) ? mediaType : "image/png"
        return { base64: buf.toString("base64"), mediaType: safeMedia }
    } catch {
        return null
    }
}

// ─── Action ────────────────────────────────────────────────────────────

const MODEL = "claude-opus-4-20250514"
const MAX_REGENS_PER_INVOCATION = 3

export async function reviewImageCoherence(
    projectId: string,
): Promise<ReviewCoherenceResult> {
    return withAuth<ReviewCoherenceResult>(async ({ foundryId }) => {
        const admin = createAdminClient()

        // 1. Load project — auth + foundry check + image URLs.
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, modules, system_illustration_url")
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr || !project) {
            return {
                ok: false,
                error: "Project not found.",
                errorCode: "PROJECT_NOT_FOUND",
            }
        }
        if (project.foundry_id !== foundryId) {
            return {
                ok: false,
                error: "Project not found.",
                errorCode: "PROJECT_FORBIDDEN",
            }
        }

        const coverUrl =
            typeof project.system_illustration_url === "string"
                ? project.system_illustration_url
                : null
        if (!coverUrl) {
            return {
                ok: false,
                error: "No cover illustration to compare against. Generate the system illustration first.",
                errorCode: "NO_COVER",
            }
        }

        const rawModules = project.modules as unknown
        const modules = (Array.isArray(rawModules) ? rawModules : []) as CadLabModule[]
        const modulesWithImages = modules.filter(
            (m) => typeof m.imageUrl === "string" && m.imageUrl.length > 0,
        )
        if (modulesWithImages.length === 0) {
            return {
                ok: false,
                error: "No rendered modules to review. Generate module images first.",
                errorCode: "NO_MODULES",
            }
        }

        const apiKey = getAnthropicKey()
        if (!apiKey) {
            return {
                ok: false,
                error: "ANTHROPIC_API_KEY not configured.",
                errorCode: "NO_API_KEY",
            }
        }

        // 2. Fetch all images in parallel. Cover comes first so it
        //    anchors the group "style" in the prompt.
        const cover = await fetchImageAsBase64(coverUrl)
        if (!cover) {
            return {
                ok: false,
                error: "Couldn't fetch cover illustration for review.",
                errorCode: "VISION_FAILED",
            }
        }

        const moduleFetches = await Promise.all(
            modulesWithImages.map(async (m) => ({
                moduleId: m.id,
                name: m.name,
                image: await fetchImageAsBase64(m.imageUrl as string),
            })),
        )
        const modulesReady = moduleFetches.filter(
            (m): m is { moduleId: string; name: string; image: { base64: string; mediaType: string } } =>
                m.image !== null,
        )
        if (modulesReady.length === 0) {
            return {
                ok: false,
                error: "Couldn't fetch any module images for review.",
                errorCode: "VISION_FAILED",
            }
        }

        // 3. Build the Opus vision call. Image 1 = cover (the reference
        //    for "what the group should look like"), images 2..N =
        //    modules. Ask Opus for a structured JSON response so we can
        //    parse + drive the regen loop.
        const client = new Anthropic({ apiKey })

        const moduleIndex: string[] = []
        const imageBlocks: Anthropic.ContentBlockParam[] = []
        imageBlocks.push({
            type: "image",
            source: {
                type: "base64",
                media_type: cover.mediaType as "image/png",
                data: cover.base64,
            },
        })
        imageBlocks.push({
            type: "text",
            text: "Image 1 above is the COVER illustration — this defines the visual language (palette, line weight, composition, background) that every other image in this project should match.",
        })
        let imgIdx = 2
        for (const m of modulesReady) {
            moduleIndex.push(m.moduleId)
            imageBlocks.push({
                type: "image",
                source: {
                    type: "base64",
                    media_type: m.image.mediaType as "image/png",
                    data: m.image.base64,
                },
            })
            imageBlocks.push({
                type: "text",
                text: `Image ${imgIdx} above is the MODULE render for module index ${imgIdx - 1} (module id: "${m.moduleId}", name: "${m.name}").`,
            })
            imgIdx += 1
        }

        imageBlocks.push({
            type: "text",
            text: `You are a design reviewer. Compare images 2 through ${imgIdx - 1} against image 1 (the cover).

Flag any module image whose visual style is clearly out of family with the cover. Look for:
- Palette mismatch (different hex families, extra colours, muted vs vivid)
- Line weight mismatch (thick vs thin, hand-drawn vs precise)
- Background / grid mismatch
- Composition mismatch (3D perspective vs isometric, cutaway vs assembled, exploded vs not)
- Rendering approach mismatch (photorealistic vs flat, architectural vs technical)

For each outlier return:
  - moduleId (from the image labels above — use the exact "module id" string)
  - severity: "minor" | "moderate" | "major"
  - reason: one concise sentence (<= 25 words) stating what drifts

Respond with ONLY valid JSON matching this shape, no prose, no markdown fences:
{ "outliers": [ { "moduleId": "...", "severity": "minor|moderate|major", "reason": "..." } ] }

If every image is in family, return { "outliers": [] }.

Rank outliers by severity desc (major first). Be conservative — only flag images that would clearly jar a reader flipping through a PDF; minor prompt-sampling variance is acceptable.`,
        })

        let rawJson: string
        try {
            const response = await client.messages.create({
                model: MODEL,
                max_tokens: 2048,
                messages: [{ role: "user", content: imageBlocks }],
            })
            const firstBlock = response.content.find((c) => c.type === "text")
            if (!firstBlock || firstBlock.type !== "text") {
                return {
                    ok: false,
                    error: "Vision call returned no text block.",
                    errorCode: "VISION_FAILED",
                }
            }
            rawJson = firstBlock.text.trim()
        } catch (err) {
            console.error(
                "[review-image-coherence] Opus vision call threw:",
                err instanceof Error ? err.message : err,
            )
            return {
                ok: false,
                error: "Image coherence review threw — try again in a moment.",
                errorCode: "VISION_FAILED",
            }
        }

        // Strip markdown fences if the model added them despite the
        // "no markdown fences" instruction — models sometimes slip.
        const cleaned = rawJson
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```\s*$/i, "")
            .trim()

        let parsed: { outliers?: Array<{ moduleId?: unknown; severity?: unknown; reason?: unknown }> }
        try {
            parsed = JSON.parse(cleaned)
        } catch {
            console.error(
                "[review-image-coherence] failed to parse Opus JSON. First 500:",
                cleaned.slice(0, 500),
            )
            return {
                ok: false,
                error: "Couldn't parse the coherence review response.",
                errorCode: "VISION_FAILED",
            }
        }

        const rawOutliers = Array.isArray(parsed.outliers) ? parsed.outliers : []
        const validModuleIds = new Set(moduleIndex)
        const severityRank: Record<string, number> = {
            major: 3,
            moderate: 2,
            minor: 1,
        }
        const outliers: CoherenceOutlier[] = rawOutliers
            .map((o) => {
                const mid = typeof o.moduleId === "string" ? o.moduleId : ""
                const sev =
                    o.severity === "major" || o.severity === "moderate" || o.severity === "minor"
                        ? o.severity
                        : "minor"
                const reason = typeof o.reason === "string" ? o.reason : ""
                if (!validModuleIds.has(mid)) return null
                return {
                    moduleId: mid,
                    severity: sev,
                    reason,
                    regenerated: false,
                    regenError: null,
                } as CoherenceOutlier
            })
            .filter((o): o is CoherenceOutlier => o !== null)
            .sort((a, b) => severityRank[b.severity] - severityRank[a.severity])

        // 4. Regenerate up to MAX_REGENS_PER_INVOCATION in severity
        //    order. Each call uses the existing generateOneModuleImage
        //    which now includes the cover-as-reference wiring (Layer C)
        //    — so the regen has the best possible chance of matching.
        const toRegen = outliers.slice(0, MAX_REGENS_PER_INVOCATION)
        for (const o of toRegen) {
            try {
                const res = await generateOneModuleImage(projectId, o.moduleId)
                if (res.ok) {
                    o.regenerated = true
                } else {
                    o.regenError = res.error
                }
            } catch (err) {
                o.regenError = err instanceof Error ? err.message : "regen threw"
            }
        }

        return {
            ok: true,
            outliers,
            reviewedCount: modulesReady.length + 1,
            modelUsed: MODEL,
        }
    })
}
