/**
 * @file adapters/brief-quality.ts — per-stage adapter for the strategic
 * design brief output of Chase.
 *
 * @description Reads `cad_lab_projects.research.designBrief` for each demo
 * project and scores the BRIEF body (mission / targetCustomers / whyNow /
 * useCase / constraints) on whether it's the kind of crisp, grounded
 * strategic brief an expert team would hand Max for decomposition. This
 * is distinct from chase-regulatory.ts (which scores the matrix). The
 * brief is what feeds Max's downstream module decomposition — if the brief
 * is generic, every downstream stage inherits the generality.
 *
 * The adapter does NOT re-run Chase. It scores the persisted designBrief
 * already in production. Loop iteration: edit Chase's brief-extraction
 * prompt, regen one demo end-to-end, re-score.
 *
 * StageName = "max-expand" — there's no brief-specific entry in the
 * StageName union and "max-expand" is otherwise unused. The brief feeds
 * Max's decomposition, so the conceptual fit is reasonable.
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

interface DesignBriefConstraints {
    unitCostCeilingGbp?: number | null
    firstShipDate?: string | null
    maxMassKg?: number | null
    batchSize?: number | null
    markets?: string[] | null
    productionRegion?: string | null
}

interface DesignBrief {
    mission?: string | null
    targetCustomers?: string | null
    whyNow?: string | null
    useCase?: string | null
    constraints?: DesignBriefConstraints | null
}

const CONSTRAINT_FIELDS: Array<keyof DesignBriefConstraints> = [
    "unitCostCeilingGbp",
    "firstShipDate",
    "maxMassKg",
    "batchSize",
    "markets",
    "productionRegion",
]

function isFilled(value: unknown): boolean {
    if (value === null || value === undefined) return false
    if (typeof value === "string") return value.trim().length > 0
    if (typeof value === "number") return Number.isFinite(value)
    if (Array.isArray(value)) return value.length > 0
    return true
}

export const briefQualityAdapter: StageAdapter = {
    name: "max-expand",

    async selfCheck() {
        const admin = createAdminClient()
        const { data: rows, error } = await admin
            .from("cad_lab_projects")
            .select("id, research")
            .in(
                "id",
                DEMO_PROJECT_IDS.map((p) => p.id),
            )
        if (error) return { ok: false, error: error.message }
        if (!rows)
            return { ok: false, error: "no rows returned for demo projects" }
        let withMission = 0
        for (const r of rows) {
            const research = (r.research ?? null) as
                | Record<string, unknown>
                | null
            const brief = (research?.["designBrief"] ?? null) as
                | DesignBrief
                | null
            if (
                brief &&
                typeof brief.mission === "string" &&
                brief.mission.trim().length > 0
            ) {
                withMission += 1
            }
        }
        if (withMission < 3) {
            return {
                ok: false,
                error: `expected at least 3 demo projects with research.designBrief.mission, found ${withMission}`,
            }
        }
        return { ok: true }
    },

    async loadGoldenInputs(): Promise<StageGoldenInput[]> {
        const admin = createAdminClient()
        const { data: rows } = await admin
            .from("cad_lab_projects")
            .select("id, name, subject, research")
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
            const research = (r.research ?? null) as
                | Record<string, unknown>
                | null
            const brief = (research?.["designBrief"] ?? null) as
                | DesignBrief
                | null
            inputs.push({
                id: slug,
                label: typeof r.name === "string" ? r.name : slug,
                payload: {
                    subject: subject.slice(0, 1500),
                    brief: brief ?? {},
                },
            })
        }
        return inputs
    },

    async runOne(input): Promise<StageOutput> {
        const t0 = Date.now()
        const subject =
            typeof input.payload.subject === "string"
                ? (input.payload.subject as string)
                : ""
        const brief = (input.payload.brief as DesignBrief | undefined) ?? {}
        const constraints = (brief.constraints ?? {}) as DesignBriefConstraints

        const diagnostics: string[] = []
        if (!isFilled(brief.mission)) diagnostics.push("mission missing or empty")
        if (!isFilled(brief.targetCustomers))
            diagnostics.push("targetCustomers missing or empty")
        if (!isFilled(brief.whyNow)) diagnostics.push("whyNow missing or empty")
        if (!isFilled(brief.useCase)) diagnostics.push("useCase missing or empty")

        // Deterministic constraint-grounding metric: % of constraints fields
        // that are non-null. Computed here so the council prompt sees both
        // the raw brief AND the prefilled grounding ratio.
        const filledConstraints = CONSTRAINT_FIELDS.filter((k) =>
            isFilled(constraints[k]),
        )
        const constraintsGroundingRatio =
            filledConstraints.length / CONSTRAINT_FIELDS.length

        return {
            inputId: input.id,
            loop: 0,
            engineCommit: "",
            elapsedMs: Date.now() - t0,
            costPence: 0,
            output: {
                subject: subject.slice(0, 800),
                brief,
                constraintsGroundingRatio,
                filledConstraintFields: filledConstraints,
                missingConstraintFields: CONSTRAINT_FIELDS.filter(
                    (k) => !isFilled(constraints[k]),
                ),
            },
            diagnostics,
        }
    },

    buildCouncilPrompt(input, output) {
        const out = output.output as Record<string, unknown>
        const subject = typeof out.subject === "string" ? (out.subject as string) : ""
        const brief = (out.brief ?? {}) as DesignBrief
        const ratio =
            typeof out.constraintsGroundingRatio === "number"
                ? (out.constraintsGroundingRatio as number)
                : 0
        const missing = (out.missingConstraintFields ?? []) as string[]

        return `You are scoring a UK hardware engineering project's strategic DESIGN BRIEF. The brief is what feeds the decomposition specialist (Max) to produce module-level work — if the brief is generic, every downstream stage inherits that generality. The bar is "what an expert product strategist + engineering lead would hand to a build team".

PROJECT SUBJECT (excerpt):
${subject}

DESIGN BRIEF FROM ENGINE:
${JSON.stringify(brief, null, 2).slice(0, 6000)}

DETERMINISTIC GROUNDING SIGNAL (already computed, do NOT recompute):
- constraints fields filled: ${(ratio * 100).toFixed(0)}% (${Math.round(ratio * 6)} of 6)
- missing constraint fields: ${missing.length > 0 ? missing.join(", ") : "(none)"}

Score 0-10 on each dimension:

1. mission_present_and_specific — is mission a 1-2 sentence product mission statement, grounded in this project's subject? Penalise empty / generic / multi-paragraph essays. A good mission names WHAT the product is and WHO it serves in one breath.
2. target_customers_named_segments — is targetCustomers expressed as named segments (e.g. "UK commercial and industrial site operators", "NHS hospital estates teams") rather than personas ("Sarah, the green-conscious facility manager")? Brief format wants segments, not characters.
3. why_now_substantive — does whyNow cite a specific market / regulatory / technology moment (a regulation date, a cost curve crossover, a supply-chain shift) rather than generic "the market is growing" or "demand is rising"?
4. use_case_concrete — is useCase a specific use-case sentence anchored in a real deployment context (e.g. "Behind-the-meter peak shaving for a 5 MW industrial site on UK half-hourly tariffs") rather than abstract ("provides energy storage solutions")?
5. constraints_grounded_in_report — score this from the deterministic ratio above. 6/6 = 10. 5/6 = 8. 4/6 = 6. 3/6 = 5. 2/6 = 3. 1/6 = 2. 0/6 = 0. Do not look at the raw constraints object; trust the ratio.
6. unit_cost_ceiling_realistic — given the product class implied by the subject (BESS / IoT sensor / mobility-aid / desalination unit / etc.), is the brief's unitCostCeilingGbp inside a defensible range? Penalise wildly under-target (e.g. £100 ceiling on a 1.5 MWh battery) AND wildly over-target (e.g. £500k ceiling on a £50 sensor). If unitCostCeilingGbp is null/missing, score 0 here.

Output JSON ONLY:
{
  "dimensions": {
    "mission_present_and_specific": <0-10>,
    "target_customers_named_segments": <0-10>,
    "why_now_substantive": <0-10>,
    "use_case_concrete": <0-10>,
    "constraints_grounded_in_report": <0-10>,
    "unit_cost_ceiling_realistic": <0-10>
  },
  "summary": "one-line aggregate observation",
  "next_fix": "the single highest-leverage prompt change to lift this score, or null if at 8+"
}`
    },

    async fireCouncil(input, output): Promise<StageScore> {
        const prompt = briefQualityAdapter.buildCouncilPrompt(input, output)
        try {
            // Lineage-mix: chase-regulatory uses GPT-5.5, risks-register uses
            // Sonnet — pick Gemini 3.1 Pro here so the council rotation across
            // adapters covers three different lineages. Gemini is strong on
            // research-y judgement calls (whyNow specificity, segment vs
            // persona, cost-ceiling realism), which is exactly what this
            // brief-scoring rubric leans on.
            const result = await callOpenRouter({
                model: "google/gemini-3.1-pro-preview",
                system:
                    "You are a UK product strategist + chartered engineer scoring AI-generated strategic design briefs. Output JSON only.",
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
            const dimensions: Record<string, number> = {}
            for (const [k, v] of Object.entries(parsed.dimensions ?? {})) {
                if (typeof v === "number")
                    dimensions[k] = Math.max(0, Math.min(10, v))
            }
            const score =
                Object.values(dimensions).reduce((a, b) => a + b, 0) /
                Math.max(1, Object.keys(dimensions).length)
            // Gemini 3.1 Pro pricing on OpenRouter ≈ $1.25/M in, $5/M out.
            // Council costs <1p per call.
            const costPence =
                Math.ceil(
                    ((result.inputTokens / 1_000_000) * 1.25 +
                        (result.outputTokens / 1_000_000) * 5) *
                        80 *
                        100,
                ) || 1
            return {
                inputId: input.id,
                score,
                dimensions,
                summary: typeof parsed.summary === "string" ? parsed.summary : "",
                nextFix:
                    typeof parsed.next_fix === "string" ? parsed.next_fix : null,
                costPence,
            }
        } catch (err) {
            return {
                inputId: input.id,
                score: 0,
                dimensions: {},
                summary: `council threw: ${err instanceof Error ? err.message : err}`,
                nextFix: null,
                costPence: 0,
            }
        }
    },
}
