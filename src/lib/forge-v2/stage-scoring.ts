/**
 * @file stage-scoring.ts — LLM-scored quality rubric for autopilot stages
 *
 * @description Implements the non-negotiable stage-by-stage quality gate:
 *   1. Run all projects through a stage
 *   2. Score each project on the stage's rubric via gpt-4.1-mini
 *   3. If ANY project < 8/10 → hold ALL projects at this stage
 *   4. Only advance ALL together when ALL score ≥ 8/10
 *
 * Scores are stored in autopilot_state.stage_scores JSONB.
 *
 * Tristan corrected this 3 times on 2026-04-30. This file is the coded
 * enforcement — no more ad-hoc winging it.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { callOpenAI } from "@/lib/cad-lab/api-helpers"
import type { AutopilotStage } from "@/actions/forge-v2-autopilot"

// ── Rubric types ──────────────────────────────────────────────────────────

export interface ScoringDimension {
    name: string
    description: string
    weight: number
}

export interface StageRubric {
    stage: AutopilotStage
    dimensions: ScoringDimension[]
    dataQuery: string
}

export interface DimensionScore {
    dimension: string
    score: number
    reasoning: string
}

export interface StageScoreResult {
    stage: AutopilotStage
    scores: DimensionScore[]
    composite: number
    passed: boolean
    reasoning: string
    scored_at: string
}

// ── Per-stage rubric definitions ──────────────────────────────────────────

const RUBRICS: Partial<Record<AutopilotStage, StageRubric>> = {
    waiting_chase: {
        stage: "waiting_chase",
        dimensions: [
            { name: "research_depth", description: "Does the research cover the market, competitors, technology landscape, and regulatory environment with substantive detail (not just headlines)?", weight: 1 },
            { name: "source_diversity", description: "Are sources varied (academic, industry, government, news) rather than all from one type?", weight: 1 },
            { name: "regulatory_coverage", description: "Are relevant standards, certifications, and regulatory requirements identified with specifics (not just names)?", weight: 1 },
            { name: "market_sizing", description: "Is the market sizing grounded in real data with cited numbers, not vague 'growing market' claims?", weight: 1 },
            { name: "competitor_analysis", description: "Are real competitors named with specific differentiators, not generic 'various competitors exist'?", weight: 1 },
        ],
        dataQuery: "research",
    },
    waiting_max: {
        stage: "waiting_max",
        dimensions: [
            { name: "decomposition_completeness", description: "Does the module breakdown cover all major subsystems needed for the product? No obvious gaps?", weight: 1 },
            { name: "module_independence", description: "Are modules logically independent with clear boundaries? No circular dependencies?", weight: 1 },
            { name: "interface_clarity", description: "Are module interfaces (inputs, outputs, connections) explicitly defined?", weight: 1 },
            { name: "feasibility", description: "Is each module technically feasible with current technology? No physics violations?", weight: 1 },
            { name: "key_parts_coverage", description: "Does each module have specific key parts identified (not just category names)?", weight: 1 },
        ],
        dataQuery: "modules",
    },
    waiting_sizing: {
        stage: "waiting_sizing",
        dimensions: [
            { name: "parameter_realism", description: "Are sizing parameters (dimensions, weights, capacities) realistic for the application?", weight: 1 },
            { name: "constraint_satisfaction", description: "Does the sizing satisfy all stated constraints (space, weight, power, cost)?", weight: 1 },
            { name: "solver_convergence", description: "Did the sizing solver converge to a feasible solution (not INFEASIBLE)?", weight: 1.5 },
            { name: "unit_consistency", description: "Are all units consistent and correctly converted throughout?", weight: 1 },
        ],
        dataQuery: "dimension_sheet",
    },
    waiting_layout: {
        stage: "waiting_layout",
        dimensions: [
            { name: "spatial_efficiency", description: "Is the layout space-efficient without wasted areas?", weight: 1 },
            { name: "flow_logic", description: "Do material/process flows make logical sense without unnecessary crossings?", weight: 1 },
            { name: "safety_compliance", description: "Are safety zones, access paths, and emergency routes considered?", weight: 1 },
            { name: "scalability", description: "Can the layout accommodate reasonable growth or modification?", weight: 1 },
        ],
        dataQuery: "layout",
    },
    waiting_bom: {
        stage: "waiting_bom",
        dimensions: [
            { name: "part_completeness", description: "Does every module have a bill of materials with specific parts (not just categories)?", weight: 1 },
            { name: "specification_accuracy", description: "Are part specifications (material, grade, dimensions) precise enough to source?", weight: 1 },
            { name: "cost_realism", description: "Are estimated costs within reasonable industry ranges for the specified parts?", weight: 1 },
            { name: "sourcing_feasibility", description: "Are parts commercially available from multiple suppliers?", weight: 1 },
        ],
        dataQuery: "parts",
    },
    waiting_finn: {
        stage: "waiting_finn",
        dimensions: [
            { name: "cost_model_accuracy", description: "Is the cost model built bottom-up from bill of materials data, not top-down estimates?", weight: 1 },
            { name: "margin_realism", description: "Are margins realistic for the industry and product type?", weight: 1 },
            { name: "sensitivity_analysis", description: "Does the analysis show how costs change with key variables?", weight: 1 },
            { name: "benchmark_grounding", description: "Are costs compared to industry benchmarks or comparable products?", weight: 1 },
        ],
        dataQuery: "cost_analysis",
    },
    matching_suppliers: {
        stage: "matching_suppliers",
        dimensions: [
            { name: "match_relevance", description: "Are matched suppliers actually capable of producing the required parts?", weight: 1 },
            { name: "geographic_coverage", description: "Is there supplier diversity across regions (not all from one country)?", weight: 1 },
            { name: "minimum_three_per_part", description: "Does every bill of materials row have at least 3 supplier matches?", weight: 1.5 },
            { name: "no_phantom_urls", description: "Do supplier URLs resolve to actual company pages (not blogs, 404s, or marketplace listings)?", weight: 1.5 },
        ],
        dataQuery: "supplier_matches",
    },
    running_fang_reviews: {
        stage: "running_fang_reviews",
        dimensions: [
            { name: "issue_depth", description: "Are engineering issues specific and technical (not vague 'consider improving')?", weight: 1 },
            { name: "actionability", description: "Can each issue be acted on with the information provided?", weight: 1 },
            { name: "coverage_per_module", description: "Does every module have a substantive review (not just rubber-stamped)?", weight: 1 },
            { name: "severity_calibration", description: "Are severity levels (critical/major/minor) calibrated correctly for the domain?", weight: 1 },
        ],
        dataQuery: "fang_reviews",
    },
    proofreading: {
        stage: "proofreading",
        dimensions: [
            { name: "factual_accuracy", description: "Are all stated facts, numbers, and claims accurate and internally consistent?", weight: 1 },
            { name: "internal_consistency", description: "Do numbers match across sections (e.g. cost in summary matches cost in detailed breakdown)?", weight: 1 },
            { name: "unit_verification", description: "Are all units correct and consistently used?", weight: 1 },
            { name: "readability", description: "Is the text clear, well-structured, and free of obvious errors?", weight: 1 },
        ],
        dataQuery: "proofreader_report",
    },
}

// Stages that produce no scoreable content (just lock/render)
const SKIP_SCORING_STAGES: AutopilotStage[] = [
    "locking_brief",
    "generating_illustration",
    "generating_pdf",
    "done",
    "failed",
    "solver_error",
    "preflight_blocked",
    "gate_1_blocked",
    "waiting_max_redecomposition",
]

// ── Data loading ──────────────────────────────────────────────────────────

async function loadStageData(
    projectId: string,
    rubric: StageRubric,
): Promise<string> {
    const admin = createAdminClient()

    switch (rubric.dataQuery) {
        case "research": {
            const { data } = await admin
                .from("cad_lab_projects")
                .select("research")
                .eq("id", projectId)
                .maybeSingle()
            const research = data?.research as Record<string, unknown> | null
            if (!research) return "No research data found."
            return JSON.stringify(research, null, 2).slice(0, 12000)
        }
        case "modules": {
            const { data } = await admin
                .from("cad_lab_projects")
                .select("modules")
                .eq("id", projectId)
                .maybeSingle()
            const modules = data?.modules as Record<string, unknown> | null
            if (!modules) return "No modules data found."
            return JSON.stringify(modules, null, 2).slice(0, 12000)
        }
        case "dimension_sheet": {
            const { data } = await admin
                .from("cad_lab_projects")
                .select("dimension_sheet")
                .eq("id", projectId)
                .maybeSingle()
            const ds = data?.dimension_sheet as Record<string, unknown> | null
            if (!ds) return "No dimension sheet found."
            return JSON.stringify(ds, null, 2).slice(0, 12000)
        }
        case "layout": {
            const { data } = await admin
                .from("cad_lab_projects")
                .select("layout_data")
                .eq("id", projectId)
                .maybeSingle()
            const layout = data?.layout_data as Record<string, unknown> | null
            if (!layout) return "No layout data found."
            return JSON.stringify(layout, null, 2).slice(0, 12000)
        }
        case "parts": {
            const { data } = await admin
                .from("parts")
                .select("*")
                .eq("project_id", projectId)
                .limit(200)
            if (!data?.length) return "No parts data found."
            return JSON.stringify(data, null, 2).slice(0, 12000)
        }
        case "cost_analysis": {
            const { data } = await admin
                .from("cad_lab_projects")
                .select("cost_analysis")
                .eq("id", projectId)
                .maybeSingle()
            const cost = data?.cost_analysis as Record<string, unknown> | null
            if (!cost) return "No cost analysis found."
            return JSON.stringify(cost, null, 2).slice(0, 12000)
        }
        case "supplier_matches": {
            const { data } = await admin
                .from("cad_lab_projects")
                .select("supplier_shortlist")
                .eq("id", projectId)
                .maybeSingle()
            const suppliers = data?.supplier_shortlist as Record<string, unknown> | null
            if (!suppliers) return "No supplier matches found."
            return JSON.stringify(suppliers, null, 2).slice(0, 12000)
        }
        case "fang_reviews": {
            const { data } = await admin
                .from("cad_lab_projects")
                .select("modules")
                .eq("id", projectId)
                .maybeSingle()
            const modules = data?.modules as Record<string, Record<string, unknown>> | null
            if (!modules) return "No fang review data found."
            const reviews: Record<string, unknown> = {}
            for (const [id, mod] of Object.entries(modules)) {
                if (mod && typeof mod === "object" && "engineeringReview" in mod) {
                    reviews[id] = (mod as Record<string, unknown>).engineeringReview
                }
            }
            if (!Object.keys(reviews).length) return "No engineering reviews found in modules."
            return JSON.stringify(reviews, null, 2).slice(0, 12000)
        }
        case "proofreader_report": {
            const { data } = await admin
                .from("cad_lab_projects")
                .select("proofreader_report")
                .eq("id", projectId)
                .maybeSingle()
            const report = data?.proofreader_report as Record<string, unknown> | null
            if (!report) return "No proofreader report found."
            return JSON.stringify(report, null, 2).slice(0, 12000)
        }
        default:
            return "Unknown data query type."
    }
}

// ── Scoring function ──────────────────────────────────────────────────────

export async function scoreStageOutput(
    projectId: string,
    stage: AutopilotStage,
): Promise<StageScoreResult | null> {
    if (SKIP_SCORING_STAGES.includes(stage)) return null

    const rubric = RUBRICS[stage]
    if (!rubric) return null

    const stageData = await loadStageData(projectId, rubric)

    const dimensionList = rubric.dimensions
        .map((d, i) => `${i + 1}. ${d.name}: ${d.description} (weight: ${d.weight})`)
        .join("\n")

    const systemPrompt = `You are a quality assessor for a hardware product development pipeline. Score the output of the "${stage}" stage on each dimension using a 1-10 scale where:
- 1-3: Poor — missing critical content, factual errors, or unusable output
- 4-5: Below average — significant gaps that would mislead downstream stages
- 6-7: Acceptable — functional but with notable weaknesses
- 8-9: Good — thorough, accurate, and ready for downstream consumption
- 10: Excellent — exceptional quality with no issues

Be strict but fair. An 8 means genuinely good work — do not grade inflate.

Return ONLY valid JSON in this exact format:
{
  "scores": [
    { "dimension": "<dimension_name>", "score": <1-10>, "reasoning": "<1-2 sentences>" }
  ],
  "overall_reasoning": "<2-3 sentences summarising the overall quality>"
}`

    const userPrompt = `Score this stage output on the following dimensions:

${dimensionList}

Stage data:
${stageData}`

    try {
        const { text } = await callOpenAI(
            systemPrompt,
            userPrompt,
            "gpt-4.1-mini",
            4096,
            30_000,
        )

        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
        const parsed = JSON.parse(cleaned) as {
            scores: Array<{ dimension: string; score: number; reasoning: string }>
            overall_reasoning: string
        }

        const dimensionScores: DimensionScore[] = parsed.scores.map((s) => ({
            dimension: s.dimension,
            score: Math.max(1, Math.min(10, Math.round(s.score))),
            reasoning: s.reasoning,
        }))

        let totalWeight = 0
        let weightedSum = 0
        for (const ds of dimensionScores) {
            const rubricDim = rubric.dimensions.find((d) => d.name === ds.dimension)
            const w = rubricDim?.weight ?? 1
            weightedSum += ds.score * w
            totalWeight += w
        }
        const composite = totalWeight > 0
            ? Math.round((weightedSum / totalWeight) * 100) / 100
            : 0

        return {
            stage,
            scores: dimensionScores,
            composite,
            passed: composite >= 8.0,
            reasoning: parsed.overall_reasoning,
            scored_at: new Date().toISOString(),
        }
    } catch (err) {
        console.error(
            `[stage-scoring] Failed to score project=${projectId} stage=${stage}:`,
            err instanceof Error ? err.message : err,
        )
        return null
    }
}

// ── Score persistence ─────────────────────────────────────────────────────

export async function storeStageScore(
    projectId: string,
    stage: AutopilotStage,
    result: StageScoreResult,
): Promise<void> {
    const admin = createAdminClient()
    const { data: project } = await admin
        .from("cad_lab_projects")
        .select("autopilot_state")
        .eq("id", projectId)
        .maybeSingle()

    const current = project?.autopilot_state as Record<string, unknown> | null
    if (!current) return

    const existingScores = (current.stage_scores ?? {}) as Record<string, StageScoreResult>
    existingScores[stage] = result

    await admin
        .from("cad_lab_projects")
        .update({
            autopilot_state: {
                ...current,
                stage_scores: existingScores,
            },
        } as unknown as never)
        .eq("id", projectId)
}

// ── Foundry-wide cohort gate ──────────────────────────────────────────────

/**
 * Check if ALL projects in a foundry have passed scoring for a given stage.
 * Returns true only when every project at that stage has a composite ≥ 8.0.
 *
 * This is the "no racing ahead" check — no project advances until all pass.
 */
export async function checkFoundryCohortGate(
    foundryId: string,
    stage: AutopilotStage,
): Promise<{ allPassed: boolean; results: Array<{ projectId: string; projectName: string; composite: number; passed: boolean }> }> {
    const admin = createAdminClient()

    const { data: projects } = await admin
        .from("cad_lab_projects")
        .select("id, name, autopilot_state")
        .eq("foundry_id", foundryId)
        .not("autopilot_state", "is", null)
        .not("autopilot_state->>started_at", "is", null)

    if (!projects?.length) {
        return { allPassed: false, results: [] }
    }

    const results: Array<{ projectId: string; projectName: string; composite: number; passed: boolean }> = []

    for (const p of projects) {
        const state = p.autopilot_state as Record<string, unknown> | null
        if (!state) continue

        const stageScores = state.stage_scores as Record<string, StageScoreResult> | undefined
        const stageScore = stageScores?.[stage]

        if (!stageScore) {
            results.push({
                projectId: p.id,
                projectName: p.name ?? p.id,
                composite: 0,
                passed: false,
            })
        } else {
            results.push({
                projectId: p.id,
                projectName: p.name ?? p.id,
                composite: stageScore.composite,
                passed: stageScore.passed,
            })
        }
    }

    const allPassed = results.length > 0 && results.every((r) => r.passed)
    return { allPassed, results }
}

/**
 * Stages that should be scored before advancing.
 * Excludes render/lock stages that produce no scoreable content.
 */
export function shouldScoreStage(stage: AutopilotStage): boolean {
    return !SKIP_SCORING_STAGES.includes(stage) && !!RUBRICS[stage]
}
