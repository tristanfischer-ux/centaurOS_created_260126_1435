/**
 * @file adapters/illustration.ts — per-stage adapter for the per-module
 * image generation stage.
 *
 * @description Tristan-flagged in Loop 7 critique: 12 of 24 module hero
 * images were missing across BESS / Hedgerow / VertFarm v7. The image
 * generation stage runs after Max's decomposition and produces one hero
 * image per module (imageUrl, imageStatus, imageModelUsed, plus the
 * moduleImagePrompt that drove the call). When this stage drops modules,
 * the report ships visually incomplete — half the modules render as
 * placeholder boxes in the PDF.
 *
 * The adapter scores HOW the image generation went per project across
 * five dimensions: coverage (% complete), prompt quality (specificity vs
 * generic), style consistency (single model vs mixed), URL liveness
 * (HEAD checks), and failure recovery (count of imageStatus="failed").
 * Four of the five dimensions are deterministic — only prompt_quality
 * needs an LLM judge.
 *
 * Reads `cad_lab_projects.modules` jsonb (same source as max-decompose).
 * Does NOT re-run image generation — image calls are expensive and the
 * iteration loop should be fast. Scores the existing per-module image
 * state. After a generation-prompt or model-routing change, the next
 * end-to-end regen will surface fresh module image data.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { callOpenRouter } from "@/lib/ai/openrouter"
import type {
    StageAdapter,
    StageGoldenInput,
    StageOutput,
    StageScore,
} from "../types"

const DEMO_PROJECT_IDS: ReadonlyArray<{ id: string; slug: string }> = [
    { id: "0ab0457a-ab32-4d2a-b1e3-32d8b877222c", slug: "bess" },
    { id: "3acf3007-b720-400b-8dc4-818394df102d", slug: "hedgerow" },
    { id: "517ae649-b3d3-42ad-94d7-99ac408e428b", slug: "vertfarm" },
    { id: "330e1bec-58f8-422c-b225-ea42b18580d1", slug: "desal" },
    { id: "3830be2c-84e8-4446-bb84-a06527a4dfe9", slug: "sentinel" },
] as const

interface ModuleImageSummary {
    id: string
    name: string
    imageUrl: string | null
    imageStatus: "pending" | "complete" | "failed" | null
    imageModelUsed: string | null
    moduleImagePrompt: string | null
}

const HEAD_CHECK_TIMEOUT_MS = 5_000
const MAX_HEAD_CHECKS = 5
const PROMPT_SAMPLE_COUNT = 3

export const illustrationAdapter: StageAdapter = {
    name: "illustration",

    async selfCheck() {
        const admin = createAdminClient()
        const { data: rows, error } = await admin
            .from("cad_lab_projects")
            .select("id, modules")
            .in(
                "id",
                DEMO_PROJECT_IDS.map((p) => p.id),
            )
        if (error) return { ok: false, error: error.message }
        if (!rows || rows.length < 3) {
            return {
                ok: false,
                error: `expected at least 3 demo projects, found ${rows?.length ?? 0}`,
            }
        }
        // At least 3 of 5 demos must have at least 1 module with a non-empty
        // imageUrl — otherwise there is nothing to score and the loop is a
        // no-op. Catches the regression where image generation is wedged
        // upstream and modules.imageUrl is null across the board.
        let demosWithAnyImage = 0
        for (const r of rows) {
            const modulesRaw = Array.isArray(r.modules)
                ? (r.modules as Array<Record<string, unknown>>)
                : []
            const hasAny = modulesRaw.some(
                (m) =>
                    typeof m.imageUrl === "string" &&
                    (m.imageUrl as string).length > 0,
            )
            if (hasAny) demosWithAnyImage += 1
        }
        if (demosWithAnyImage < 3) {
            return {
                ok: false,
                error: `expected ≥3 demos with at least one module imageUrl, found ${demosWithAnyImage}`,
            }
        }
        return { ok: true }
    },

    async loadGoldenInputs(): Promise<StageGoldenInput[]> {
        const admin = createAdminClient()
        const { data: rows } = await admin
            .from("cad_lab_projects")
            .select("id, name, subject, modules")
            .in(
                "id",
                DEMO_PROJECT_IDS.map((p) => p.id),
            )
        if (!rows) return []
        const inputs: StageGoldenInput[] = []
        for (const r of rows) {
            const subject = typeof r.subject === "string" ? r.subject : ""
            const slug =
                DEMO_PROJECT_IDS.find((p) => p.id === r.id)?.slug ?? "unknown"
            const modulesRaw = Array.isArray(r.modules)
                ? (r.modules as Array<Record<string, unknown>>)
                : []
            const moduleSummaries: ModuleImageSummary[] = modulesRaw.map(
                (m) => ({
                    id: typeof m.id === "string" ? m.id : "",
                    name: typeof m.name === "string" ? m.name : "",
                    imageUrl:
                        typeof m.imageUrl === "string" &&
                        (m.imageUrl as string).length > 0
                            ? (m.imageUrl as string)
                            : null,
                    imageStatus:
                        m.imageStatus === "pending" ||
                        m.imageStatus === "complete" ||
                        m.imageStatus === "failed"
                            ? (m.imageStatus as
                                  | "pending"
                                  | "complete"
                                  | "failed")
                            : null,
                    imageModelUsed:
                        typeof m.imageModelUsed === "string" &&
                        (m.imageModelUsed as string).length > 0
                            ? (m.imageModelUsed as string)
                            : null,
                    moduleImagePrompt:
                        typeof m.moduleImagePrompt === "string" &&
                        (m.moduleImagePrompt as string).length > 0
                            ? (m.moduleImagePrompt as string)
                            : null,
                }),
            )
            inputs.push({
                id: slug,
                label: typeof r.name === "string" ? r.name : slug,
                payload: {
                    subject: subject.slice(0, 1500),
                    modules: moduleSummaries,
                },
            })
        }
        return inputs
    },

    async runOne(input): Promise<StageOutput> {
        const modules =
            (input.payload.modules as ModuleImageSummary[] | undefined) ?? []
        const t0 = Date.now()
        const diagnostics: string[] = []

        const total = modules.length
        if (total === 0) {
            diagnostics.push("no modules in decomposition")
            return {
                inputId: input.id,
                loop: 0,
                engineCommit: "",
                elapsedMs: Date.now() - t0,
                costPence: 0,
                output: {
                    modules,
                    moduleCount: 0,
                    completeCount: 0,
                    failedCount: 0,
                    pendingCount: 0,
                    coveragePct: 0,
                    modelsUsed: [],
                    dominantModelShare: 0,
                    headChecks: [],
                    promptSamples: [],
                },
                diagnostics,
            }
        }

        const completeCount = modules.filter(
            (m) => m.imageStatus === "complete",
        ).length
        const failedCount = modules.filter(
            (m) => m.imageStatus === "failed",
        ).length
        const pendingCount = modules.filter(
            (m) => m.imageStatus === "pending" || m.imageStatus === null,
        ).length
        const coveragePct = total > 0 ? (completeCount / total) * 100 : 0

        // Style-consistency basis — collapse to a model→count map so the
        // dominant share is well-defined even when imageModelUsed is null
        // for some modules (those count as "unknown" and reduce share).
        const modelCounts: Record<string, number> = {}
        for (const m of modules) {
            const key = m.imageModelUsed ?? "(unknown)"
            modelCounts[key] = (modelCounts[key] ?? 0) + 1
        }
        const modelsUsed = Object.entries(modelCounts)
            .map(([model, count]) => ({ model, count }))
            .sort((a, b) => b.count - a.count)
        const dominantModelShare =
            modelsUsed.length > 0 ? modelsUsed[0].count / total : 0

        // HEAD-check up to 5 imageUrls. We pick the first 5 non-null URLs
        // in module order — sampling deterministically so re-runs are
        // comparable.
        const urlsToCheck = modules
            .map((m) => m.imageUrl)
            .filter((u): u is string => typeof u === "string" && u.length > 0)
            .slice(0, MAX_HEAD_CHECKS)
        const headChecks: Array<{
            url: string
            ok: boolean
            status: number | null
            error?: string
        }> = []
        for (const url of urlsToCheck) {
            try {
                const res = await fetch(url, {
                    method: "HEAD",
                    signal: AbortSignal.timeout(HEAD_CHECK_TIMEOUT_MS),
                })
                headChecks.push({
                    url,
                    ok: res.ok,
                    status: res.status,
                })
            } catch (err) {
                headChecks.push({
                    url,
                    ok: false,
                    status: null,
                    error: err instanceof Error ? err.message : String(err),
                })
            }
        }

        // Prompt sample for the LLM judge — first N modules with a
        // non-empty moduleImagePrompt, in module order. Deterministic so
        // the council scores the same prompts run-to-run unless the
        // upstream stage changes them.
        const promptSamples = modules
            .filter(
                (m) =>
                    typeof m.moduleImagePrompt === "string" &&
                    (m.moduleImagePrompt as string).length > 0,
            )
            .slice(0, PROMPT_SAMPLE_COUNT)
            .map((m) => ({
                moduleName: m.name,
                prompt: (m.moduleImagePrompt as string).slice(0, 1500),
            }))

        if (completeCount === 0) {
            diagnostics.push("zero modules with imageStatus=complete")
        }
        if (failedCount > 0) {
            diagnostics.push(`${failedCount} modules with imageStatus=failed`)
        }
        if (promptSamples.length === 0) {
            diagnostics.push("no moduleImagePrompt strings to sample")
        }
        const headFailures = headChecks.filter((h) => !h.ok).length
        if (headFailures > 0) {
            diagnostics.push(
                `${headFailures}/${headChecks.length} HEAD checks failed`,
            )
        }

        return {
            inputId: input.id,
            loop: 0,
            engineCommit: "",
            elapsedMs: Date.now() - t0,
            costPence: 0,
            output: {
                modules,
                moduleCount: total,
                completeCount,
                failedCount,
                pendingCount,
                coveragePct,
                modelsUsed,
                dominantModelShare,
                headChecks,
                promptSamples,
            },
            diagnostics,
        }
    },

    buildCouncilPrompt(input, output) {
        const subject =
            typeof input.payload.subject === "string"
                ? (input.payload.subject as string).slice(0, 800)
                : ""
        const promptSamples = (output.output.promptSamples as Array<{
            moduleName: string
            prompt: string
        }>) ?? []
        const sampleListing =
            promptSamples.length > 0
                ? promptSamples
                      .map(
                          (s, i) =>
                              `${i + 1}. module: ${s.moduleName}\n   prompt: ${s.prompt}`,
                      )
                      .join("\n\n")
                : "(no moduleImagePrompt strings available)"

        return `You are scoring per-module image-generation prompts produced by an upstream specialist for a UK hardware engineering project. The prompts drive a text-to-image model (e.g. flux-pro, gpt-image-2) to render a hero illustration of each module. Good prompts cite specific materials (e.g. "anodised aluminium chassis"), dimensions ("400 mm × 400 mm × 600 mm"), mounting / assembly context, and visual style. Bad prompts are generic ("a render of a battery", "an illustration of the device").

PROJECT SUBJECT (excerpt):
${subject}

SAMPLED MODULE IMAGE PROMPTS (${promptSamples.length} of project's modules):
${sampleListing}

Score 0-10 on the single dimension prompt_quality_specific:
- 10 = every sampled prompt cites concrete materials, dimensions, mounting / assembly context, AND visual style cues
- 7-8 = most prompts cite materials + at least one of dimensions / mounting / style
- 4-6 = prompts mention the module by name but stay generic ("a render of the battery system")
- 0-3 = prompts are boilerplate ("a render of a component"), or absent

Output JSON ONLY:
{
  "dimensions": {
    "prompt_quality_specific": <0-10>
  },
  "summary": "one-line aggregate observation",
  "next_fix": "the single highest-leverage prompt change to lift this score, or null if at 8+"
}`
    },

    async fireCouncil(input, output): Promise<StageScore> {
        const total = (output.output.moduleCount as number) ?? 0
        const completeCount = (output.output.completeCount as number) ?? 0
        const failedCount = (output.output.failedCount as number) ?? 0
        const dominantModelShare =
            (output.output.dominantModelShare as number) ?? 0
        const headChecks =
            (output.output.headChecks as Array<{
                ok: boolean
            }>) ?? []
        const promptSamples =
            (output.output.promptSamples as Array<unknown>) ?? []

        // Deterministic dimensions — computed without an LLM call.
        const imageCoverage =
            total > 0 ? Math.max(0, Math.min(10, (completeCount / total) * 10)) : 0
        const styleConsistency = total > 0 ? dominantModelShare * 10 : 0
        const imageUrlResolves =
            headChecks.length > 0
                ? headChecks.every((h) => h.ok)
                    ? 10
                    : Math.max(
                          0,
                          (headChecks.filter((h) => h.ok).length /
                              headChecks.length) *
                              10,
                      )
                : 0
        const failureRecovery = Math.max(0, 10 - failedCount * 2)

        const dimensions: Record<string, number> = {
            image_coverage: imageCoverage,
            style_consistency: styleConsistency,
            image_url_resolves: imageUrlResolves,
            failure_recovery: failureRecovery,
        }

        let summary = ""
        let nextFix: string | null = null
        let costPence = 0

        // Only fire the council when there are prompts to judge — otherwise
        // the prompt_quality_specific dimension would be 0 by default and
        // that's correctly reflected as "missing prompts" without spending
        // cents on a council call that has nothing to read.
        if (promptSamples.length > 0) {
            const prompt = illustrationAdapter.buildCouncilPrompt(input, output)
            const result = await callOpenRouter({
                model: "anthropic/claude-sonnet-4-6",
                system:
                    "You are a chartered UK engineer scoring AI-generated text-to-image prompts for hardware engineering modules. Output JSON only.",
                prompt,
                maxTokens: 1500,
                temperature: 0.1,
                timeoutMs: 90_000,
            })
            if (!result.ok) {
                dimensions.prompt_quality_specific = 0
                summary = `council call failed: ${result.error}`
            } else {
                let parsed: {
                    dimensions?: Record<string, number>
                    summary?: string
                    next_fix?: string | null
                }
                try {
                    const text = result.text.trim()
                    const jsonStart = text.indexOf("{")
                    const jsonEnd = text.lastIndexOf("}")
                    const slice = text.slice(jsonStart, jsonEnd + 1)
                    parsed = JSON.parse(slice)
                } catch (err) {
                    dimensions.prompt_quality_specific = 0
                    summary = `council JSON parse failed: ${err instanceof Error ? err.message : err}`
                    parsed = {}
                }
                const llmDim = parsed.dimensions?.prompt_quality_specific
                dimensions.prompt_quality_specific =
                    typeof llmDim === "number"
                        ? Math.max(0, Math.min(10, llmDim))
                        : 0
                if (typeof parsed.summary === "string") summary = parsed.summary
                if (typeof parsed.next_fix === "string") nextFix = parsed.next_fix
                costPence =
                    Math.ceil(
                        ((result.inputTokens / 1_000_000) * 3 +
                            (result.outputTokens / 1_000_000) * 15) *
                            80 *
                            100,
                    ) || 1
            }
        } else {
            dimensions.prompt_quality_specific = 0
            summary =
                "no moduleImagePrompt strings sampled; prompt_quality_specific defaulted to 0"
        }

        const dimEntries = Object.entries(dimensions)
        const score =
            dimEntries.length > 0
                ? dimEntries.reduce((a, [, v]) => a + v, 0) / dimEntries.length
                : 0

        if (!summary) {
            summary = `coverage ${completeCount}/${total} complete, ${failedCount} failed, dominant-model share ${(dominantModelShare * 100).toFixed(0)}%`
        }

        return {
            inputId: input.id,
            score,
            dimensions,
            summary,
            nextFix,
            costPence,
        }
    },
}
