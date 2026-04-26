/**
 * @file adapters/sizing.ts — per-stage adapter for the sizing-optimisation stage.
 *
 * @description Mirrors `chase-regulatory.ts` in shape — measures how good
 * the sizing engine's `dimension_sheet` output is across the 5 demo
 * projects without re-running the full pipeline. Each demo project's
 * `cad_lab_projects.dimension_sheet` is one golden output already in
 * production. The adapter pulls it, fires a per-stage council to score
 * it 0-10 on dimensions that matter for sizing output (feasibility
 * resolution, target grounding, envelope correctness, recommendation
 * actionability, engineering-note specificity), and persists the score
 * for trend tracking.
 *
 * This adapter doesn't RE-RUN the sizing engine — it scores the existing
 * output. Once we have a baseline + a scoring rubric, the next loop
 * iteration will edit the sizing prompt / rule library, re-run on a
 * single demo project, and re-score. That's the per-stage feedback
 * cadence.
 *
 * StageName: `oracle` is borrowed for sizing (the type union doesn't
 * have a sizing entry; closest unclaimed slot). If a future Oracle
 * adapter wants the slot back, swap to `proofreader` here.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { callOpenRouter } from "@/lib/ai/openrouter"
import type {
    StageAdapter,
    StageGoldenInput,
    StageOutput,
    StageScore,
} from "../types"
import type { DimensionSheet } from "@/lib/sizing/types"

const HARNESS_OPENROUTER_MODEL =
    process.env.SIZING_HARNESS_OPENROUTER_MODEL ||
    "anthropic/claude-sonnet-4-6"

const DEMO_PROJECT_IDS: ReadonlyArray<{ id: string; slug: string }> = [
    { id: "0ab0457a-ab32-4d2a-b1e3-32d8b877222c", slug: "bess" },
    { id: "3acf3007-b720-400b-8dc4-818394df102d", slug: "hedgerow" },
    { id: "517ae649-b3d3-42ad-94d7-99ac408e428b", slug: "vertfarm" },
    { id: "330e1bec-58f8-422c-b225-ea42b18580d1", slug: "desal" },
    { id: "3830be2c-84e8-4446-bb84-a06527a4dfe9", slug: "sentinel" },
] as const

export const sizingAdapter: StageAdapter = {
    name: "oracle",

    async selfCheck() {
        const admin = createAdminClient()
        const { count, error } = await admin
            .from("cad_lab_projects")
            .select("id", { count: "exact", head: true })
            .in(
                "id",
                DEMO_PROJECT_IDS.map((p) => p.id),
            )
            .not("dimension_sheet", "is", null)
        if (error) return { ok: false, error: error.message }
        if (!count || count < 3)
            return {
                ok: false,
                error: `expected at least 3 demo projects with dimension_sheet, found ${count ?? 0}`,
            }
        return { ok: true }
    },

    async loadGoldenInputs(): Promise<StageGoldenInput[]> {
        const admin = createAdminClient()
        const { data: rows } = await admin
            .from("cad_lab_projects")
            .select("id, name, subject, dimension_sheet")
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
            const dimensionSheet = (r.dimension_sheet ?? null) as
                | DimensionSheet
                | null
            inputs.push({
                id: slug,
                label: typeof r.name === "string" ? r.name : slug,
                payload: {
                    subject: subject.slice(0, 1500),
                    dimensionSheet,
                },
            })
        }
        return inputs
    },

    async runOne(input): Promise<StageOutput> {
        // The sizing adapter scores the persisted dimension_sheet directly
        // — we don't re-run the engine here. Per-stage iteration will
        // happen by editing the rule libraries / prompt-adapter and
        // regenerating the affected demo project end-to-end, then re-scoring.
        const t0 = Date.now()
        const dimensionSheet = (input.payload.dimensionSheet ?? null) as
            | DimensionSheet
            | null
        const diagnostics: string[] = []

        if (!dimensionSheet) {
            diagnostics.push("dimension_sheet missing on project")
            return {
                inputId: input.id,
                loop: 0,
                engineCommit: "",
                elapsedMs: Date.now() - t0,
                costPence: 0,
                output: {
                    feasible: false,
                    target: {},
                    envelope: null,
                    floorBudgetM2: 0,
                    moduleDimensions: {},
                    conflicts: [],
                    recommendations: [],
                    notes: [],
                    closestFeasibleAlternate: null,
                    hasAlternate: false,
                },
                diagnostics,
            }
        }

        if (!dimensionSheet.feasible) {
            diagnostics.push(
                dimensionSheet.closest_feasible_alternate
                    ? "primary infeasible — alternate present"
                    : "primary infeasible — no alternate",
            )
        }
        if (
            !dimensionSheet.recommendations ||
            dimensionSheet.recommendations.length === 0
        ) {
            diagnostics.push("no recommendations recorded")
        }
        if (!dimensionSheet.notes || dimensionSheet.notes.length === 0) {
            diagnostics.push("no engineering notes recorded")
        }

        return {
            inputId: input.id,
            loop: 0,
            engineCommit: "",
            elapsedMs: Date.now() - t0,
            costPence: 0,
            output: {
                feasible: dimensionSheet.feasible,
                target: dimensionSheet.target ?? {},
                envelope: dimensionSheet.envelope ?? null,
                floorBudgetM2: dimensionSheet.floor_budget_m2 ?? 0,
                moduleDimensions: dimensionSheet.module_dimensions ?? {},
                conflicts: dimensionSheet.conflicts ?? [],
                recommendations: dimensionSheet.recommendations ?? [],
                notes: dimensionSheet.notes ?? [],
                closestFeasibleAlternate:
                    dimensionSheet.closest_feasible_alternate ?? null,
                hasAlternate: Boolean(
                    dimensionSheet.closest_feasible_alternate,
                ),
            },
            diagnostics,
        }
    },

    buildCouncilPrompt(input, output) {
        const subject =
            typeof input.payload.subject === "string"
                ? (input.payload.subject as string).slice(0, 1200)
                : ""
        const sheetSummary = JSON.stringify(
            {
                feasible: output.output.feasible,
                target: output.output.target,
                envelope: output.output.envelope,
                floor_budget_m2: output.output.floorBudgetM2,
                module_dimensions: output.output.moduleDimensions,
                conflicts: output.output.conflicts,
                recommendations: output.output.recommendations,
                notes: output.output.notes,
                closest_feasible_alternate: output.output.closestFeasibleAlternate,
            },
            null,
            2,
        ).slice(0, 8000)

        return `You are scoring a UK hardware engineering report's sizing-optimisation output. The founder is a UK first-time hardware founder. The bar is "what would an expert team produce".

PROJECT SUBJECT (excerpt — this is the brief the engine was supposed to size to):
${subject}

SIZING ENGINE OUTPUT (dimension_sheet):
${sheetSummary}

Score 0-10 on each dimension. Three dimensions are LLM-judged; the fourth ("feasibility_resolved") is also reported here for completeness — pick the score the rubric specifies based on the visible flags.

1. feasibility_resolved — DETERMINISTIC. Score 10 if feasible:true. Score 6 if feasible:false AND closest_feasible_alternate is non-null. Score 0 if feasible:false AND closest_feasible_alternate is null/missing.

2. target_grounded_in_brief — does the dimension_sheet's target match what the brief asked for? E.g. if the brief says "3500 kWh + 1500 kW" the target should be {kwh: 3500, kw: 1500}. If the engine quietly substituted smaller numbers (e.g. {kwh: 1000, kw: 500}) without an explicit infeasibility chain, score low. Penalise silent down-scaling. Reward exact target match. If the brief mentions a payload range, target should be at the upper end the brief asked for.

3. envelope_correct — does the envelope (kind + label) match what the brief asked for? E.g. if the brief says "40ft container", envelope.kind should be container_40ft_iso. Penalise heavily if VertFarm uses "warehouse_bay" when the brief said "40ft container", or if BESS uses "room" when the brief said container. If the brief is silent on envelope, reward a sensible domain default (BESS → 40ft, VF → 40ft, sentinel → chassis, etc.).

4. recommendations_actionable — are recommendations specific, numeric, and actionable (e.g. "Reduce target to 258 kWh at current 1500 kW power rating — fits 40ft with 0% margin", "Switch to 53ft HC envelope to keep 3500 kWh target")? Or are they generic ("consider scope cut", "review trade-offs")? Reward concrete numbers + specific levers; penalise vague advice.

5. engineering_notes_specificity — are engineering notes domain-specific and cite real coefficients (e.g. NMC pack density 180 Wh/L, NFPA 2001 agent quantity for FK-5-1-12, canopy density per tier, COP at design dT)? Or are they generic boilerplate ("consider thermal management", "design for serviceability")? Reward chemistry / density / standard citations; penalise hand-waving.

Output JSON ONLY:
{
  "dimensions": {
    "feasibility_resolved": <0-10>,
    "target_grounded_in_brief": <0-10>,
    "envelope_correct": <0-10>,
    "recommendations_actionable": <0-10>,
    "engineering_notes_specificity": <0-10>
  },
  "summary": "one-line aggregate observation",
  "next_fix": "the single highest-leverage prompt or rule-library change to lift this score, or null if at 8+"
}`
    },

    async fireCouncil(input, output): Promise<StageScore> {
        const prompt = sizingAdapter.buildCouncilPrompt(input, output)
        const result = await callOpenRouter({
            model: HARNESS_OPENROUTER_MODEL,
            system:
                "You are a chartered UK engineer scoring AI-generated sizing-optimisation outputs. Output JSON only.",
            prompt,
            maxTokens: 2000,
            temperature: 0.1,
            timeoutMs: 90_000,
        })
        if (!result.ok) {
            return {
                inputId: input.id,
                score: 0,
                dimensions: {},
                summary: `council call failed: ${result.error}`,
                nextFix: null,
                costPence: 0,
            }
        }
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
            return {
                inputId: input.id,
                score: 0,
                dimensions: {},
                summary: `council JSON parse failed: ${err instanceof Error ? err.message : err}`,
                nextFix: null,
                costPence: 0,
            }
        }

        // Override the deterministic dim from local truth so the LLM can't
        // drift on it. Same rubric as the prompt: 10 / 6 / 0.
        const llmDimensions: Record<string, number> = {}
        const dimEntries = Object.entries(parsed.dimensions ?? {})
        for (const [k, v] of dimEntries) {
            if (typeof v === "number")
                llmDimensions[k] = Math.max(0, Math.min(10, v))
        }
        const feasible = Boolean(output.output.feasible)
        const hasAlternate = Boolean(output.output.hasAlternate)
        llmDimensions.feasibility_resolved = feasible
            ? 10
            : hasAlternate
              ? 6
              : 0

        const dimValues = Object.values(llmDimensions)
        const score =
            dimValues.length > 0
                ? dimValues.reduce((a, b) => a + b, 0) / dimValues.length
                : 0
        // Sonnet via OpenRouter ≈ $3/M in, $15/M out → council costs <1p per call
        const costPence =
            Math.round(
                ((result.inputTokens / 1_000_000) * 3 +
                    (result.outputTokens / 1_000_000) * 15) *
                    80 *
                    100,
            ) || 1
        return {
            inputId: input.id,
            score,
            dimensions: llmDimensions,
            summary: typeof parsed.summary === "string" ? parsed.summary : "",
            nextFix: typeof parsed.next_fix === "string" ? parsed.next_fix : null,
            costPence,
        }
    },
}
