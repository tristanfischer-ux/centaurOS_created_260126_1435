"use server"

/**
 * @file forge-v2-generate-system-illustration.ts — orchestrator for the
 * "Generate system illustration" button on the V2 Modules surface.
 *
 * @description Reusable server action the V2 Modules page calls from the
 * hero-illustration button. Reads the project's subject + decomposed
 * modules, then delegates to the existing
 * `generateCadLabSystemIllustrationAction()` which handles image generation,
 * vision scoring, and persisting the resulting URL back to
 * `cad_lab_projects.system_illustration_url`.
 *
 * We pass only the mandatory inputs (`projectId`, `subject`, `moduleNames`,
 * `modulePurposes`). Every other arg on the inner action is optional — we
 * let it use its own defaults (illustration style, rubric, reference images)
 * rather than surfacing knobs the V2 button doesn't need yet.
 *
 * @security `withAuth` wraps the outer action and rejects any call from a
 *   different foundry than the project's owner (defence-in-depth on top of
 *   `ensureCadLabProjectOwnership` which the inner action also enforces).
 *
 * @related
 * - Inner action: src/actions/cad-lab-images.ts (generateCadLabSystemIllustrationAction)
 * - UI:           src/app/(platform)/the-forge-v2/projects/[id]/_components/generate-system-illustration-button.tsx
 * - Surface:      src/app/(platform)/the-forge-v2/projects/[id]/modules/modules-view.tsx
 * - Table:        cad_lab_projects.system_illustration_url
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { withAuth } from "@/lib/server-action-utils"
import { generateCadLabSystemIllustrationAction } from "@/actions/cad-lab-images"
import type { CadLabModule } from "@/lib/cad-lab-types"
import { DEFAULT_ILLUSTRATION_STYLE, isIllustrationStyle } from "@/lib/cad-lab/illustration-styles"

// ─── Types ────────────────────────────────────────────────────────────

export type GenerateSystemIllustrationResult =
    | { ok: true; url: string }
    | {
          ok: false
          error: string
          errorCode:
              | "PROJECT_NOT_FOUND"
              | "PROJECT_FORBIDDEN"
              | "NO_MODULES"
              | "GENERATION_FAILED"
              | "INTERNAL"
      }

// ─── Orchestrator ─────────────────────────────────────────────────────

/**
 * Generates (or regenerates) the 16:9 system illustration for a V2 project
 * and persists the resulting URL to `cad_lab_projects.system_illustration_url`
 * (the write happens inside the inner action, not here).
 *
 * Idempotent — re-running overwrites the stored URL with the latest render.
 */
export async function generateSystemIllustrationForProject(
    projectId: string,
): Promise<GenerateSystemIllustrationResult> {
    return withAuth<GenerateSystemIllustrationResult>(async ({ foundryId }) => {
        const admin = createAdminClient()
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, subject, modules, illustration_style, visual_style, dimension_sheet, spatial_plan")
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr) {
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
            // SECURITY: don't leak the existence of other-foundry projects
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

        const subject = typeof project.subject === "string" ? project.subject : ""
        const moduleNames = modules.map((m) => m.name ?? "")
        const modulePurposes = modules.map((m) => m.purpose ?? "")

        // Honour the project's illustration_style so the hero renders in the
        // same visual language as the per-module blueprints (the per-module
        // path in forge-v2-generate-one-module-image.ts reads this same
        // column). Without this, the hero defaulted to iso-illustrative
        // while modules defaulted to thin-line blueprint and the two
        // looked like two different projects in the PDF.
        const illustrationStyle = isIllustrationStyle(project.illustration_style)
            ? project.illustration_style
            : DEFAULT_ILLUSTRATION_STYLE

        // INTENT: Inject the sizing engine's DimensionSheet into the hero
        // prompt path so the interior-exploded render honours real W×D×H
        // + mount + neighbour relationships. The enrichment uses the
        // existing VisualStyleSpec.{overallDimensionsMm,moduleDimensionNotes}
        // channel — image-generator already consumes both — so no image-gen
        // prompt-builder change is needed here.
        const { enrichVisualStyleWithDimensions, formatHeroDimensionTable } =
            await import("@/lib/sizing/prompt-adapter")
        const sheet =
            (project.dimension_sheet as import("@/lib/sizing/types").DimensionSheet | null) ?? null
        const baseVisualStyle =
            project.visual_style && typeof project.visual_style === "object"
                ? (project.visual_style as Parameters<typeof generateCadLabSystemIllustrationAction>[4])
                : undefined
        const dimensionEnrichedStyle = enrichVisualStyleWithDimensions(
            baseVisualStyle,
            sheet,
            modules,
        )

        // INTENT: Layer the spatial plan on top of the sizing enrichment so
        // each module's note carries BOTH its W×D×H and its placement. The
        // adapter concatenates rather than overwrites, so every channel the
        // sizing path already populates stays populated.
        const { enrichVisualStyleWithSpatialPlan, formatHeroLayoutBriefing } =
            await import("@/lib/layout/prompt-adapter")
        const spatialPlan =
            (project.spatial_plan as import("@/lib/layout/types").SpatialPlan | null) ?? null
        const enrichedStyle = enrichVisualStyleWithSpatialPlan(
            dimensionEnrichedStyle,
            spatialPlan,
            modules,
        )

        // Hero gets the FULL dimension table as a research-excerpt-equivalent
        // string so the prompt builder renders a to-scale spatial layout.
        // When a spatial plan exists we append the layout briefing so the
        // hero sees per-module positions + non-module envelope features
        // (aisles, doors, vents).
        const heroDimensionTable = formatHeroDimensionTable(sheet, modules)
        const heroLayoutBriefing = formatHeroLayoutBriefing(spatialPlan, modules)
        const heroBriefing = [heroDimensionTable, heroLayoutBriefing]
            .filter((s) => s && s.length > 0)
            .join("\n\n")
        const researchExcerptWithDimensions = heroBriefing.length > 0 ? heroBriefing : undefined

        try {
            const res = await generateCadLabSystemIllustrationAction(
                projectId,
                subject,
                moduleNames,
                modulePurposes,
                enrichedStyle,
                researchExcerptWithDimensions,
                undefined,
                undefined,
                illustrationStyle,
            )
            if ("error" in res) {
                return {
                    ok: false,
                    error: res.error,
                    errorCode: "GENERATION_FAILED",
                }
            }

            // The inner action does NOT write to cad_lab_projects — it only
            // uploads the PNG to xray-images/<projectId>/ and returns the URL.
            // Persisting to system_illustration_url is the caller's job (V1
            // had its own writer; V2 did not have one, so this wrapper owns
            // the write).
            const { error: persistErr } = await admin
                .from("cad_lab_projects")
                .update({ system_illustration_url: res.url })
                .eq("id", projectId)
            if (persistErr) {
                console.error(
                    `[forge-v2-generate-system-illustration] persist failed for ${projectId}:`,
                    persistErr.message ?? persistErr,
                )
                return {
                    ok: false,
                    error: "Generated but couldn't persist the illustration URL.",
                    errorCode: "INTERNAL",
                }
            }

            return { ok: true, url: res.url }
        } catch (err) {
            console.error(
                `[forge-v2-generate-system-illustration] inner action threw for project ${projectId}:`,
                err instanceof Error ? err.message : err,
            )
            return {
                ok: false,
                error: "System illustration failed to generate.",
                errorCode: "INTERNAL",
            }
        }
    })
}
