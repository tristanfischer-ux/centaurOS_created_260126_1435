/**
 * @file adapters/finn-cost.ts — per-stage adapter for Finn (cost estimation).
 *
 * @description Scores the persisted `cad_lab_projects.ai_cost_estimates`
 * JSONB across the 5 demo projects without re-running Finn. Mirrors
 * bom-master.ts: deterministic field-coverage dimensions are computed
 * locally; LLM-judged dimensions (cost-justification specificity,
 * assumption transparency) are scored by a single Sonnet-via-OpenRouter
 * council call.
 *
 * Inputs read:
 *   - cad_lab_projects.ai_cost_estimates : Record<moduleId, AiCostEstimate>
 *     (per-module unit cost, confidence, assumptions, costJustification /
 *      reasoning, parts breakdown, etc. — see lib/cad-lab-types.ts)
 *   - cad_lab_projects.modules           : array of module definitions —
 *     used as the denominator for `coverage_per_module`.
 *   - cad_lab_projects.subject           : drives Oracle product-class
 *     detection.
 *   - cad_lab_projects.research.designBrief.constraints.unitCostCeilingGbp :
 *     brief target used to anchor `total_within_oracle_band`.
 *   - cad_lab_projects.target_unit_cost_gbp : project-level unit-cost
 *     target — when present, used as the "reported unit cost" for the
 *     `total_matches_unit_cost` consistency check.
 *
 * Dimensions (0-10 each, mean → aggregate score):
 *
 *  DETERMINISTIC:
 *  1. coverage_per_module       — % of modules that have a cost estimate.
 *  2. confidence_field_filled   — % of estimates with confidence in
 *                                  {low, medium, high}.
 *  3. total_within_oracle_band  — sum of per-module totals vs Oracle
 *                                  council-priors aggregate band.
 *                                  10 inside band, 5 within ±50%, 0 if 2x off.
 *  4. total_matches_unit_cost   — sum of per-module totals vs the
 *                                  project's reported unit cost target.
 *                                  Score by % divergence (0 if >5%).
 *
 *  LLM-JUDGED (single Sonnet council call):
 *  5. cost_justification_specificity — do costJustification / reasoning
 *                                       strings cite material price,
 *                                       labour, tooling amortisation, vs
 *                                       generic "estimate based on typical"?
 *  6. assumptions_explicit           — do estimates declare key assumptions
 *                                       (volume, lead time, BOM source) or
 *                                       are they black-box numbers?
 *
 * Self-check: at least 3 of 5 demo projects must have ai_cost_estimates
 * with at least 1 module costed.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { callOpenRouter } from "@/lib/ai/openrouter"
import {
    getOracleProjectBand,
    type OracleProjectBand,
} from "@/lib/cost/oracle-benchmarks"
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

/** Per-module estimate as it lives in the JSONB column. The runtime
 *  shape can drift loop-to-loop (totalGbp vs totalPerUnit, costJustification
 *  vs reasoning) — read both defensively. */
interface FinnEstimate {
    moduleId?: string
    /** V2 canonical field. */
    totalPerUnit?: number | null
    /** Some loops persist the same value as totalGbp. */
    totalGbp?: number | null
    confidence?: string | null
    assumptions?: unknown
    /** Loop-specific naming of the same thing. */
    costJustification?: string | null
    reasoning?: string | null
    labourReasoning?: string | null
}

interface ModuleLite {
    id?: string
    name?: string
}

export const finnCostAdapter: StageAdapter = {
    name: "finn-cost",

    async selfCheck() {
        const admin = createAdminClient()
        const { data: rows, error } = await admin
            .from("cad_lab_projects")
            .select("id, ai_cost_estimates")
            .in(
                "id",
                DEMO_PROJECT_IDS.map((p) => p.id),
            )
        if (error) return { ok: false, error: error.message }
        if (!rows)
            return { ok: false, error: "no rows returned for demo project IDs" }
        let costed = 0
        for (const r of rows) {
            const est = (r.ai_cost_estimates ?? null) as Record<
                string,
                unknown
            > | null
            if (est && Object.keys(est).length > 0) costed += 1
        }
        if (costed < 3)
            return {
                ok: false,
                error: `expected at least 3 demos with ai_cost_estimates, found ${costed}`,
            }
        return { ok: true }
    },

    async loadGoldenInputs(): Promise<StageGoldenInput[]> {
        const admin = createAdminClient()
        const { data: rows } = await admin
            .from("cad_lab_projects")
            .select(
                "id, name, subject, modules, ai_cost_estimates, target_unit_cost_gbp, research",
            )
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
            const modulesArr = Array.isArray(r.modules)
                ? (r.modules as unknown[]).map((m) => m as ModuleLite)
                : []
            const estimates = (r.ai_cost_estimates ?? null) as Record<
                string,
                FinnEstimate
            > | null
            const research = (r.research ?? null) as
                | Record<string, unknown>
                | null
            const designBrief = (research?.["designBrief"] ?? null) as
                | Record<string, unknown>
                | null
            const constraints = (designBrief?.["constraints"] ?? null) as
                | Record<string, unknown>
                | null
            const ceilingRaw = constraints?.["unitCostCeilingGbp"]
            const ceilingGbp =
                typeof ceilingRaw === "number" && Number.isFinite(ceilingRaw)
                    ? ceilingRaw
                    : null
            const targetUnitCostRaw = (
                r as Record<string, unknown>
            )["target_unit_cost_gbp"]
            const targetUnitCostGbp =
                typeof targetUnitCostRaw === "number" &&
                Number.isFinite(targetUnitCostRaw)
                    ? targetUnitCostRaw
                    : null
            const oracleBand = getOracleProjectBand(subject, ceilingGbp)
            inputs.push({
                id: slug,
                label: typeof r.name === "string" ? r.name : slug,
                payload: {
                    subject: subject.slice(0, 1500),
                    modules: modulesArr.map((m) => ({
                        id: typeof m?.id === "string" ? m.id : null,
                        name: typeof m?.name === "string" ? m.name : null,
                    })),
                    estimates: estimates ?? {},
                    ceilingGbp,
                    targetUnitCostGbp,
                    oracleBand,
                },
            })
        }
        return inputs
    },

    async runOne(input): Promise<StageOutput> {
        const t0 = Date.now()
        const modules = (input.payload.modules as Array<{
            id: string | null
            name: string | null
        }>) ?? []
        const estimates =
            (input.payload.estimates as Record<string, FinnEstimate>) ?? {}
        const estimateEntries = Object.entries(estimates)

        const moduleCount = modules.length
        const costedModuleCount = estimateEntries.length

        let confidenceFilled = 0
        let totalSum = 0
        let totalsCounted = 0
        for (const [, est] of estimateEntries) {
            const conf = (est?.confidence ?? "").toString().trim().toLowerCase()
            if (conf === "low" || conf === "medium" || conf === "high")
                confidenceFilled += 1
            const total =
                typeof est?.totalPerUnit === "number"
                    ? est.totalPerUnit
                    : typeof est?.totalGbp === "number"
                        ? est.totalGbp
                        : null
            if (total != null && Number.isFinite(total)) {
                totalSum += total
                totalsCounted += 1
            }
        }

        const diagnostics: string[] = []
        if (estimateEntries.length === 0)
            diagnostics.push("no ai_cost_estimates rows")
        if (moduleCount === 0) diagnostics.push("no modules on project")

        return {
            inputId: input.id,
            loop: 0,
            engineCommit: "",
            elapsedMs: Date.now() - t0,
            costPence: 0,
            output: {
                moduleCount,
                costedModuleCount,
                confidenceFilled,
                totalSum,
                totalsCounted,
                ceilingGbp: input.payload.ceilingGbp ?? null,
                targetUnitCostGbp: input.payload.targetUnitCostGbp ?? null,
                oracleBand: input.payload.oracleBand ?? null,
                sampleEstimates: estimateEntries.slice(0, 12).map(([mid, e]) => ({
                    moduleId: mid,
                    totalPerUnit:
                        typeof e?.totalPerUnit === "number"
                            ? e.totalPerUnit
                            : typeof e?.totalGbp === "number"
                                ? e.totalGbp
                                : null,
                    confidence: e?.confidence ?? null,
                    costJustification:
                        (typeof e?.costJustification === "string"
                            ? e.costJustification
                            : null) ??
                        (typeof e?.reasoning === "string" ? e.reasoning : null) ??
                        (typeof e?.labourReasoning === "string"
                            ? e.labourReasoning
                            : null),
                    assumptions: Array.isArray(e?.assumptions)
                        ? (e!.assumptions as unknown[]).slice(0, 5)
                        : [],
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
        const sample =
            (output.output.sampleEstimates as Array<Record<string, unknown>>) ??
            []
        const oracleBand =
            (output.output.oracleBand as OracleProjectBand | null) ?? null
        const oracleLine = oracleBand
            ? `Oracle council-priors band for product class ${oracleBand.productClass}: £${oracleBand.aggregateLowGbp.toLocaleString("en-GB")} low / £${oracleBand.aggregateMedianGbp.toLocaleString("en-GB")} median / £${oracleBand.aggregateHighGbp.toLocaleString("en-GB")} high.`
            : "No Oracle band matched for this project class."

        return `You are scoring a UK hardware engineering project's per-module cost-estimate output (Finn specialist). The bar is "what would an expert costing engineer produce" — not "did the model fill the field".

PROJECT SUBJECT (excerpt):
${subject}

${oracleLine}

PER-MODULE COST ESTIMATES (sample of ${sample.length}):
${JSON.stringify(sample, null, 2).slice(0, 6000)}

Score 0-10 on each LLM-judged dimension:

1. cost_justification_specificity — Are the costJustification / reasoning strings specific to THIS module (cite material price + labour rate + tooling amortisation + volume context), or are they generic boilerplate ("estimate based on typical industry pricing")? Penalise vagueness; reward concrete £/kg, £/hr, £/cavity numbers.
2. assumptions_explicit — Do the estimates declare the key assumptions a costing engineer would call out (annual volume, lead time, BOM source, supplier region, NRE amortisation horizon, tariffs)? Black-box numbers with no assumption block score low; numbered assumption lists with concrete values score high.

Output JSON ONLY:
{
  "dimensions": {
    "cost_justification_specificity": <0-10>,
    "assumptions_explicit": <0-10>
  },
  "summary": "one-line aggregate observation",
  "next_fix": "the single highest-leverage prompt change to lift this score, or null if at 8+"
}`
    },

    async fireCouncil(input, output): Promise<StageScore> {
        const out = output.output as unknown as {
            moduleCount: number
            costedModuleCount: number
            confidenceFilled: number
            totalSum: number
            totalsCounted: number
            ceilingGbp: number | null
            targetUnitCostGbp: number | null
            oracleBand: OracleProjectBand | null
        }

        // ── Deterministic dimensions ──────────────────────────────────────

        // 1. coverage_per_module — % of project modules that have a cost
        //    estimate. 10 = every module costed.
        const coveragePerModule =
            out.moduleCount > 0
                ? Math.min(10, (out.costedModuleCount / out.moduleCount) * 10)
                : 0

        // 2. confidence_field_filled — % of estimates with a real confidence.
        const confidenceFieldFilled =
            out.costedModuleCount > 0
                ? (out.confidenceFilled / out.costedModuleCount) * 10
                : 0

        // 3. total_within_oracle_band — sum of per-module totals vs Oracle
        //    aggregate band. 10 inside band, 5 within ±50%, 0 if >2x off.
        let totalWithinOracleBand = 0
        if (out.oracleBand && out.totalsCounted > 0) {
            const lo = out.oracleBand.aggregateLowGbp
            const hi = out.oracleBand.aggregateHighGbp
            const sum = out.totalSum
            if (sum >= lo && sum <= hi) {
                totalWithinOracleBand = 10
            } else {
                const refMid = (lo + hi) / 2
                const ratio = refMid > 0 ? sum / refMid : 0
                if (ratio === 0) {
                    totalWithinOracleBand = 0
                } else if (ratio > 2 || ratio < 0.5) {
                    totalWithinOracleBand = 0
                } else {
                    // Inside ±50% of midpoint but outside the explicit band → 5.
                    totalWithinOracleBand = 5
                }
            }
        } else {
            // No Oracle band match — neutral 5 so this dimension doesn't tank
            // projects that fall outside the curated product classes.
            totalWithinOracleBand = 5
        }

        // 4. total_matches_unit_cost — sum of per-module totals should
        //    equal the project's reported unit cost target. >5% divergence
        //    scores low.
        let totalMatchesUnitCost = 0
        if (out.targetUnitCostGbp != null && out.targetUnitCostGbp > 0) {
            const divergence =
                Math.abs(out.totalSum - out.targetUnitCostGbp) /
                out.targetUnitCostGbp
            if (divergence <= 0.05) totalMatchesUnitCost = 10
            else if (divergence <= 0.10) totalMatchesUnitCost = 7
            else if (divergence <= 0.25) totalMatchesUnitCost = 4
            else if (divergence <= 0.50) totalMatchesUnitCost = 2
            else totalMatchesUnitCost = 0
        } else {
            // No reported target — neutral 5 (can't grade the consistency).
            totalMatchesUnitCost = 5
        }

        // ── LLM-judged dimensions ────────────────────────────────────────
        const llmDims: Record<string, number> = {}
        let summary = ""
        let nextFix: string | null = null
        let costPence = 0
        try {
            const prompt = finnCostAdapter.buildCouncilPrompt(input, output)
            const result = await callOpenRouter({
                model: "anthropic/claude-sonnet-4-6",
                system:
                    "You are a chartered UK costing engineer scoring AI-generated per-module cost estimates. Output JSON only.",
                prompt,
                maxTokens: 2000,
                temperature: 0.1,
                timeoutMs: 90_000,
            })
            if (result.ok) {
                const text = result.text.trim()
                const j0 = text.indexOf("{")
                const j1 = text.lastIndexOf("}")
                if (j0 >= 0 && j1 > j0) {
                    const parsed = JSON.parse(text.slice(j0, j1 + 1)) as {
                        dimensions?: Record<string, number>
                        summary?: string
                        next_fix?: string | null
                    }
                    for (const [k, v] of Object.entries(
                        parsed.dimensions ?? {},
                    )) {
                        if (typeof v === "number") {
                            llmDims[k] = Math.max(0, Math.min(10, v))
                        }
                    }
                    if (typeof parsed.summary === "string")
                        summary = parsed.summary
                    if (typeof parsed.next_fix === "string")
                        nextFix = parsed.next_fix
                }
                // Sonnet via OpenRouter ≈ $3/M in, $15/M out → council <1p.
                costPence =
                    Math.ceil(
                        ((result.inputTokens / 1_000_000) * 3 +
                            (result.outputTokens / 1_000_000) * 15) *
                            80 *
                            100,
                    ) || 1
            } else {
                summary = `council call failed: ${result.error}`
            }
        } catch (err) {
            summary = `council failed: ${err instanceof Error ? err.message : err}`
        }

        const dimensions: Record<string, number> = {
            coverage_per_module: round1(coveragePerModule),
            confidence_field_filled: round1(confidenceFieldFilled),
            total_within_oracle_band: round1(totalWithinOracleBand),
            total_matches_unit_cost: round1(totalMatchesUnitCost),
            ...Object.fromEntries(
                Object.entries(llmDims).map(([k, v]) => [k, round1(v)]),
            ),
        }
        const dimVals = Object.values(dimensions)
        const score =
            dimVals.length > 0
                ? dimVals.reduce((a, b) => a + b, 0) / dimVals.length
                : 0

        return {
            inputId: input.id,
            score,
            dimensions,
            summary:
                summary ||
                `${out.costedModuleCount}/${out.moduleCount} modules costed; total £${out.totalSum.toLocaleString("en-GB")}; confidence on ${out.confidenceFilled}/${out.costedModuleCount}.`,
            nextFix,
            costPence,
        }
    },
}

function round1(n: number): number {
    return Math.round(n * 10) / 10
}
