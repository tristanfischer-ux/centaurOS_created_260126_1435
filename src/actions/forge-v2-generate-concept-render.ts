"use server"

/**
 * @file forge-v2-generate-concept-render.ts — V2 orchestrator for the
 * project-level PHOTOREAL concept render.
 *
 * @description The project workspace UI shows two hero panels:
 *   LEFT  — "Nano Banana render" → `concept_render_url`   (this file)
 *   RIGHT — "System blueprint · plan view" → `system_illustration_url`
 *            (forge-v2-generate-system-illustration.ts)
 *
 * The two are deliberately different renders serving different readers:
 *   - Concept render: photoreal product shot. What the thing LOOKS like.
 *     Useful for investor decks, marketing, founder social posts.
 *   - System illustration: technical isometric blueprint with palette
 *     lock + grid. What the thing IS. Used as the multimodal reference
 *     anchor for every per-module blueprint (Layer C of the image
 *     coherence plan).
 *
 * They are NOT meant to match each other stylistically — they're meant
 * to match their *intended audience*. The concept render uses the
 * `photoreal` IllustrationStyle; the system illustration uses whatever
 * the project's `illustration_style` column says (usually blueprint).
 *
 * Tristan 2026-04-21: concept_render_url had been a legacy V1 slot the
 * UI read but nothing wrote. This wrapper exists so the slot is no
 * longer an empty placeholder — it fires alongside the system
 * illustration in autopilot and produces a genuinely different view.
 *
 * @related
 *   - Sibling: src/actions/forge-v2-generate-system-illustration.ts
 *   - Inner action: src/actions/cad-lab-images.ts (generateCadLabSystemIllustrationAction)
 *   - Autopilot wiring: src/actions/forge-v2-autopilot.ts (generating_illustration stage)
 *   - UI consumers: the project workspace hero panel
 *   - Table column: cad_lab_projects.concept_render_url
 */

import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import { generateCadLabSystemIllustrationAction } from "@/actions/cad-lab-images"
import type { CadLabModule } from "@/lib/cad-lab-types"

// Concept renders are deliberately photoreal — locked at the action
// boundary rather than read from project.illustration_style so the
// concept slot always produces a product-marketing shot even if the
// project's default style is blueprint.
const CONCEPT_STYLE = "photoreal" as const

export type GenerateConceptRenderResult =
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

/**
 * Generates the photoreal concept render for a V2 project and persists
 * the URL to `cad_lab_projects.concept_render_url`. Safe to call
 * repeatedly — overwrites the stored URL with the latest render.
 *
 * Typical call sites:
 *   - Autopilot's generating_illustration stage fires this alongside
 *     generateSystemIllustrationForProject.
 *   - The concept-render panel on the workspace has its own retry
 *     button wired to this action.
 */
export async function generateConceptRenderForProject(
    projectId: string,
): Promise<GenerateConceptRenderResult> {
    return withAuth<GenerateConceptRenderResult>(async ({ foundryId }) => {
        const admin = createAdminClient()
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, subject, modules")
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr) {
            return { ok: false, error: "Couldn't load project", errorCode: "INTERNAL" }
        }
        if (!project) {
            return {
                ok: false,
                error: "Project not found",
                errorCode: "PROJECT_NOT_FOUND",
            }
        }
        if (project.foundry_id !== foundryId) {
            // SECURITY: don't leak other-foundry projects
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

        try {
            const res = await generateCadLabSystemIllustrationAction(
                projectId,
                subject,
                moduleNames,
                modulePurposes,
                // visualStyle / researchExcerpt / heroPrompt / refs:
                // undefined — inner action has sensible defaults. The
                // single parameter we care about here is the style,
                // pinned to `photoreal` so the concept render is a
                // deliberate product shot, not another blueprint.
                undefined,
                undefined,
                undefined,
                undefined,
                CONCEPT_STYLE,
            )
            if ("error" in res) {
                return {
                    ok: false,
                    error: res.error,
                    errorCode: "GENERATION_FAILED",
                }
            }

            const { error: persistErr } = await admin
                .from("cad_lab_projects")
                .update({ concept_render_url: res.url })
                .eq("id", projectId)

            if (persistErr) {
                console.error(
                    `[forge-v2-generate-concept-render] persist failed for ${projectId}:`,
                    persistErr.message ?? persistErr,
                )
                return {
                    ok: false,
                    error: "Generated but couldn't persist the concept render URL.",
                    errorCode: "INTERNAL",
                }
            }

            return { ok: true, url: res.url }
        } catch (err) {
            console.error(
                `[forge-v2-generate-concept-render] inner action threw for project ${projectId}:`,
                err instanceof Error ? err.message : err,
            )
            return {
                ok: false,
                error: "Concept render threw — retry in a moment.",
                errorCode: "GENERATION_FAILED",
            }
        }
    })
}
