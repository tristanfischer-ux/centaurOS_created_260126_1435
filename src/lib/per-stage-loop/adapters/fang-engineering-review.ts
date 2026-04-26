/**
 * @file adapters/fang-engineering-review.ts — per-stage adapter for Fang's
 * per-module engineering review (manufacturing-DFM review output).
 *
 * @description Reads `cad_lab_projects.reviews` (jsonb keyed by module_id;
 * values are SpecialistReview objects, sometimes wrapped in arrays — we
 * flatten defensively) for each demo project and scores the engineering
 * review across six dimensions:
 *
 *   1. coverage_per_module                 (DETERMINISTIC) — % modules reviewed
 *   2. severity_distribution_realism       (DETERMINISTIC) — penalises mono-severity
 *   3. recommendations_actionable          (LLM-judged)
 *   4. calculations_grounded               (LLM-judged)
 *   5. boilerplate_repetition              (DETERMINISTIC) — penalises Fang catchphrase reuse
 *   6. unique_engineering_value            (LLM-judged)
 *
 * The deterministic dimensions are computed in runOne() and threaded into
 * the council prompt as pre-computed signals; the council scores only the
 * three LLM-judged dimensions and the adapter merges the two halves into
 * the final StageScore.
 *
 * Uses StageName "proofreader" (already in the union, unused so far) so we
 * don't collide with risks-register.ts which holds "fang-review".
 *
 * Council model: qwen/qwen3-235b-a22b — best Fang ever measured (memory
 * forgeos_specialist_model_swap_findings_20260425).
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

/** Known Fang catchphrases — every extra repetition drops boilerplate score. */
const FANG_CATCHPHRASES: ReadonlyArray<string> = [
    "Run The Algorithm",
    "First article in 72 hours",
    "Don't buy the machine shop",
] as const

interface ReviewIssue {
    severity?: "critical" | "warning" | "info" | string
    category?: string
    message?: string
    suggestion?: string
}

interface ReviewCalculation {
    tool?: string
    description?: string
    result?: string
}

interface SpecialistReviewLite {
    specialistId?: string
    specialistName?: string
    verdict?: "pass" | "warn" | "fail" | string
    summary?: string
    issues?: ReviewIssue[]
    recommendations?: string[]
    calculations?: ReviewCalculation[]
    reviewedAt?: string
    reviewedAtIso?: string
}

/**
 * The reviews jsonb is documented as `Record<moduleId, SpecialistReview[]>`
 * but the user's spec says values can be SpecialistReview objects. Accept
 * both shapes and flatten to a flat list of (moduleId, review) pairs.
 */
function flattenReviews(
    reviewsJsonb: unknown,
): Array<{ moduleId: string; review: SpecialistReviewLite }> {
    if (!reviewsJsonb || typeof reviewsJsonb !== "object") return []
    const out: Array<{ moduleId: string; review: SpecialistReviewLite }> = []
    for (const [moduleId, value] of Object.entries(
        reviewsJsonb as Record<string, unknown>,
    )) {
        if (Array.isArray(value)) {
            for (const r of value) {
                if (r && typeof r === "object")
                    out.push({ moduleId, review: r as SpecialistReviewLite })
            }
        } else if (value && typeof value === "object") {
            out.push({ moduleId, review: value as SpecialistReviewLite })
        }
    }
    return out
}

/**
 * Score severity-distribution realism 0-10.
 *
 *   - 0 if 90%+ of issues share a single severity (the "all warn" pattern
 *     Loop 7 critique flagged on Fang's review output)
 *   - 10 if all three severities (critical / warning / info) are present in
 *     roughly a 20-50-30 ratio (each within ±10 percentage points of target)
 *   - linear-ish interpolation in between
 */
function scoreSeverityDistribution(
    issues: ReviewIssue[],
): { score: number; counts: Record<string, number>; total: number } {
    const counts: Record<string, number> = { critical: 0, warning: 0, info: 0 }
    for (const i of issues) {
        const sev = (i.severity ?? "").toLowerCase()
        if (sev === "critical" || sev === "warning" || sev === "info")
            counts[sev] = (counts[sev] ?? 0) + 1
    }
    const total = counts.critical + counts.warning + counts.info
    if (total === 0) return { score: 0, counts, total }
    const max = Math.max(counts.critical, counts.warning, counts.info)
    const monoShare = max / total
    if (monoShare >= 0.9) return { score: 0, counts, total }
    // Target ratio 20 / 50 / 30 (critical / warning / info).
    const cShare = counts.critical / total
    const wShare = counts.warning / total
    const iShare = counts.info / total
    const targetC = 0.2
    const targetW = 0.5
    const targetI = 0.3
    const dev =
        Math.abs(cShare - targetC) +
        Math.abs(wShare - targetW) +
        Math.abs(iShare - targetI)
    // Max deviation when one bucket is 100%: 1.6 (e.g. 0.8 + 0.5 + 0.3).
    // Map dev=0 → 10, dev=1.6 → 0. All three severities must be present
    // for a "10"; if any is zero, cap at 7.
    const allPresent =
        counts.critical > 0 && counts.warning > 0 && counts.info > 0
    let s = Math.max(0, 10 - (dev / 1.6) * 10)
    if (!allPresent) s = Math.min(s, 7)
    return { score: s, counts, total }
}

/**
 * Score boilerplate repetition 0-10. Counts catchphrase occurrences across
 * ALL reviews on the project. 10 if each catchphrase appears at most once;
 * subtract 1 per extra repetition (down to 0).
 */
function scoreBoilerplateRepetition(
    reviews: SpecialistReviewLite[],
): { score: number; phraseCounts: Record<string, number> } {
    const phraseCounts: Record<string, number> = {}
    const haystack = reviews
        .map((r) =>
            [
                r.summary ?? "",
                ...(r.recommendations ?? []),
                ...(r.issues ?? []).flatMap((i) => [
                    i.message ?? "",
                    i.suggestion ?? "",
                ]),
            ].join("\n"),
        )
        .join("\n")
        .toLowerCase()
    let extras = 0
    for (const phrase of FANG_CATCHPHRASES) {
        const needle = phrase.toLowerCase()
        let count = 0
        let idx = 0
        while ((idx = haystack.indexOf(needle, idx)) !== -1) {
            count += 1
            idx += needle.length
        }
        phraseCounts[phrase] = count
        if (count > 1) extras += count - 1
    }
    const score = Math.max(0, 10 - extras)
    return { score, phraseCounts }
}

export const fangEngineeringReviewAdapter: StageAdapter = {
    name: "proofreader",
    // Note: re-using the StageName "proofreader" because risks-register.ts
    // already holds "fang-review". The slot is unused and Fang's
    // engineering-review output is the closest semantic fit available.

    async selfCheck() {
        const admin = createAdminClient()
        const { data: rows, error } = await admin
            .from("cad_lab_projects")
            .select("id, reviews")
            .in(
                "id",
                DEMO_PROJECT_IDS.map((p) => p.id),
            )
        if (error) return { ok: false, error: error.message }
        if (!rows || rows.length === 0)
            return { ok: false, error: "no demo projects found" }
        let projectsWithEnoughReviews = 0
        for (const r of rows) {
            const flat = flattenReviews(r.reviews)
            if (flat.length >= 3) projectsWithEnoughReviews += 1
        }
        if (projectsWithEnoughReviews < 2)
            return {
                ok: false,
                error: `expected at least 2 demo projects with ≥3 reviews each, found ${projectsWithEnoughReviews}`,
            }
        return { ok: true }
    },

    async loadGoldenInputs(): Promise<StageGoldenInput[]> {
        const admin = createAdminClient()
        const { data: rows } = await admin
            .from("cad_lab_projects")
            .select("id, name, subject, modules, reviews")
            .in(
                "id",
                DEMO_PROJECT_IDS.map((p) => p.id),
            )
        if (!rows) return []
        const inputs: StageGoldenInput[] = []
        for (const r of rows) {
            const slug =
                DEMO_PROJECT_IDS.find((p) => p.id === r.id)?.slug ?? "unknown"
            const subject = typeof r.subject === "string" ? r.subject : ""
            const modules = Array.isArray(r.modules)
                ? (r.modules as Array<Record<string, unknown>>)
                : []
            const moduleIds = modules
                .map((m) => (typeof m.id === "string" ? (m.id as string) : null))
                .filter((x): x is string => x !== null)
            const flat = flattenReviews(r.reviews)
            inputs.push({
                id: slug,
                label: typeof r.name === "string" ? r.name : slug,
                payload: {
                    subject: subject.slice(0, 1500),
                    moduleIds,
                    moduleCount: modules.length,
                    reviews: flat,
                },
            })
        }
        return inputs
    },

    async runOne(input): Promise<StageOutput> {
        const t0 = Date.now()
        const moduleIds = (input.payload.moduleIds as string[]) ?? []
        const moduleCount =
            (input.payload.moduleCount as number) ?? moduleIds.length
        const flat =
            (input.payload.reviews as Array<{
                moduleId: string
                review: SpecialistReviewLite
            }>) ?? []
        const reviews = flat.map((f) => f.review)

        // 1. coverage_per_module — fraction of modules that have at least one
        //    review. Score 0-10 = ratio × 10.
        const reviewedModuleIds = new Set(flat.map((f) => f.moduleId))
        const reviewedCount = moduleCount
            ? // Only count reviewed module IDs that match a known module
              [...reviewedModuleIds].filter(
                  (id) => moduleIds.length === 0 || moduleIds.includes(id),
              ).length
            : reviewedModuleIds.size
        const coverageRatio =
            moduleCount > 0
                ? Math.min(1, reviewedCount / moduleCount)
                : reviewedModuleIds.size > 0
                  ? 1
                  : 0
        const coverageScore = coverageRatio * 10

        // 2. severity_distribution_realism — across all issues on the project.
        const allIssues: ReviewIssue[] = []
        for (const r of reviews) {
            if (Array.isArray(r.issues)) allIssues.push(...r.issues)
        }
        const sev = scoreSeverityDistribution(allIssues)

        // 5. boilerplate_repetition — catchphrase repetition across reviews.
        const boilerplate = scoreBoilerplateRepetition(reviews)

        const diagnostics: string[] = []
        if (reviews.length === 0) diagnostics.push("no reviews populated")
        if (moduleCount === 0) diagnostics.push("no modules on project")
        if (sev.total === 0) diagnostics.push("no issues across reviews")

        return {
            inputId: input.id,
            loop: 0,
            engineCommit: "",
            elapsedMs: Date.now() - t0,
            costPence: 0,
            output: {
                reviewCount: reviews.length,
                moduleCount,
                reviewedCount,
                coverageRatio,
                deterministic: {
                    coverage_per_module: coverageScore,
                    severity_distribution_realism: sev.score,
                    boilerplate_repetition: boilerplate.score,
                },
                severityCounts: sev.counts,
                catchphraseCounts: boilerplate.phraseCounts,
                // Sample for the council prompt — keep small enough to fit.
                sample: reviews.slice(0, 6).map((r) => ({
                    specialistName: r.specialistName ?? r.specialistId ?? "",
                    verdict: r.verdict ?? "",
                    summary: (r.summary ?? "").slice(0, 400),
                    issues: (r.issues ?? []).slice(0, 6).map((i) => ({
                        severity: i.severity,
                        category: i.category,
                        message: (i.message ?? "").slice(0, 300),
                        suggestion: (i.suggestion ?? "").slice(0, 300),
                    })),
                    recommendations: (r.recommendations ?? [])
                        .slice(0, 6)
                        .map((s) => s.slice(0, 300)),
                    calculations: (r.calculations ?? []).slice(0, 6).map((c) => ({
                        tool: c.tool,
                        description: (c.description ?? "").slice(0, 200),
                        result: (c.result ?? "").slice(0, 200),
                    })),
                })),
            },
            diagnostics,
        }
    },

    buildCouncilPrompt(input, output) {
        const subject =
            typeof input.payload.subject === "string"
                ? (input.payload.subject as string).slice(0, 800)
                : ""
        const out = output.output as Record<string, unknown>
        const sample = out.sample as unknown[]
        const det = out.deterministic as Record<string, number>
        const sevCounts = out.severityCounts as Record<string, number>
        const phrCounts = out.catchphraseCounts as Record<string, number>

        return `You are scoring a UK hardware engineering project's per-module engineering reviews (manufacturing-DFM output by "Fang", a manufacturing specialist). Each review covers one module of the design and produces issues, recommendations, calculations, and a verdict.

PROJECT SUBJECT (excerpt):
${subject}

DETERMINISTIC SIGNALS (already computed; use as context, do NOT re-score):
- coverage_per_module: ${det.coverage_per_module.toFixed(1)}/10  (${out.reviewedCount}/${out.moduleCount} modules reviewed)
- severity_distribution_realism: ${det.severity_distribution_realism.toFixed(1)}/10  (counts: ${JSON.stringify(sevCounts)})
- boilerplate_repetition: ${det.boilerplate_repetition.toFixed(1)}/10  (catchphrase counts: ${JSON.stringify(phrCounts)})

REVIEW SAMPLE (first ${sample.length} of ${out.reviewCount} reviews):
${JSON.stringify(sample, null, 2).slice(0, 6500)}

You are scoring ONLY the three LLM-judged dimensions below. Score each 0-10:

3. recommendations_actionable — are recommendations specific (cite standards, dimensions, tolerances, methods, named processes) vs generic ("improve quality control", "tighten tolerances")? Score 10 if a manufacturing engineer could action them without follow-up questions; score 0 if they read like ChatGPT boilerplate.

4. calculations_grounded — do calculations cite real values with units (kg, mm, °C, MPa, A, V) and physically plausible methods (named formulas, standards, lookup tables)? Score 10 if a chartered engineer would accept the calc as auditable; score 0 if values are unitless / fabricated / impossible.

5. unique_engineering_value — reading the reviews, do they identify project-specific engineering concerns (e.g. "corten + paint conflict on the canopy", "NFPA 855 spacing mismatch with the proposed BESS layout", "8 dBi flexible PCB antenna implausibility for the form factor") or are they generic DFM platitudes that could be pasted onto any project? Score 10 if 3+ project-specific insights; score 0 if zero.

Output JSON ONLY:
{
  "dimensions": {
    "recommendations_actionable": <0-10>,
    "calculations_grounded": <0-10>,
    "unique_engineering_value": <0-10>
  },
  "summary": "one-line aggregate observation across reviews",
  "next_fix": "the single highest-leverage prompt change to lift these scores, or null if all three at 8+",
  "project_specific_insights": ["..."]
}`
    },

    async fireCouncil(input, output): Promise<StageScore> {
        const prompt = fangEngineeringReviewAdapter.buildCouncilPrompt(
            input,
            output,
        )
        const det =
            (output.output as Record<string, unknown>).deterministic as Record<
                string,
                number
            >
        try {
            const result = await callOpenRouter({
                // Qwen 3 235B A22B = best Fang ever measured. Memory:
                // forgeos_specialist_model_swap_findings_20260425.
                model: "qwen/qwen3-235b-a22b",
                system:
                    "You are a chartered UK manufacturing engineer scoring AI-generated per-module DFM reviews. Output JSON only.",
                prompt,
                maxTokens: 2500,
                temperature: 0.1,
                timeoutMs: 120_000,
            })
            if (!result.ok) {
                return {
                    inputId: input.id,
                    score: 0,
                    dimensions: {},
                    summary: `council failed: ${result.error}`,
                    nextFix: null,
                    costPence: 0,
                }
            }
            const text = result.text.trim()
            const j0 = text.indexOf("{")
            const j1 = text.lastIndexOf("}")
            const parsed = JSON.parse(text.slice(j0, j1 + 1)) as {
                dimensions?: Record<string, number>
                summary?: string
                next_fix?: string | null
            }
            const llmDims: Record<string, number> = {}
            for (const [k, v] of Object.entries(parsed.dimensions ?? {})) {
                if (typeof v === "number")
                    llmDims[k] = Math.max(0, Math.min(10, v))
            }
            // Merge deterministic + LLM-judged dimensions into the final
            // 6-dimension breakdown. The aggregate score is the mean of all
            // six, equally weighted.
            const dimensions: Record<string, number> = {
                coverage_per_module: det.coverage_per_module,
                severity_distribution_realism: det.severity_distribution_realism,
                boilerplate_repetition: det.boilerplate_repetition,
                ...llmDims,
            }
            const score =
                Object.values(dimensions).reduce((a, b) => a + b, 0) /
                Math.max(1, Object.keys(dimensions).length)
            // Qwen 3 235B A22B via OpenRouter ≈ $0.20/M in, $0.60/M out
            // (Tier A cheap rates per model-routing.md).
            const costPence =
                Math.ceil(
                    ((result.inputTokens / 1_000_000) * 0.2 +
                        (result.outputTokens / 1_000_000) * 0.6) *
                        80 *
                        100,
                ) || 1
            return {
                inputId: input.id,
                score,
                dimensions,
                summary: parsed.summary ?? "",
                nextFix: parsed.next_fix ?? null,
                costPence,
            }
        } catch (err) {
            return {
                inputId: input.id,
                score: 0,
                dimensions: {
                    coverage_per_module: det.coverage_per_module,
                    severity_distribution_realism:
                        det.severity_distribution_realism,
                    boilerplate_repetition: det.boilerplate_repetition,
                },
                summary: `council threw: ${err instanceof Error ? err.message : err}`,
                nextFix: null,
                costPence: 0,
            }
        }
    },
}
