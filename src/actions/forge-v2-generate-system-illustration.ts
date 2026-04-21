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
            .select("id, foundry_id, subject, modules")
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

        try {
            const res = await generateCadLabSystemIllustrationAction(
                projectId,
                subject,
                moduleNames,
                modulePurposes,
                // All remaining args (visualStyle, researchExcerpt, heroPrompt,
                // referenceImageUrls, illustrationStyle) are left as defaults
                // — the V2 surface doesn't expose them yet and the inner
                // action has sensible defaults for each.
                undefined,
                undefined,
                undefined,
                undefined,
            )
            if ("error" in res) {
                return {
                    ok: false,
                    error: res.error,
                    errorCode: "GENERATION_FAILED",
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
