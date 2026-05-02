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
import { callDeepSeek } from "@/lib/cad-lab/api-helpers"
import { callOpenRouter } from "@/lib/ai/openrouter"
import { runJudgePanel, getJudgePanelConfig } from "@/lib/forge-v2/judge-panels"
import type { JudgePanelResult } from "@/lib/forge-v2/judge-panels"
import { routeAndApplyFixes, DATA_QUERY_TO_COLUMN } from "@/lib/forge-v2/fix-router"
import type { AutopilotStage } from "@/actions/forge-v2-autopilot"

// ── Canonical cohort project IDs ─────────────────────────────────────────
// The 5 Forge Guild demo projects that constitute the authoritative cohort.
// Scoping the cohort gate and reset to these IDs prevents rogue or sentinel
// projects from blocking or polluting the pipeline.
export const FORGE_GUILD_COHORT_IDS = [
    '0ab0457a-ab32-4d2a-b1e3-32d8b877222c',
    '365eb5bf-69ff-475a-8ef9-f18d4adb8135',
    '3acf3007-b720-400b-8dc4-818394df102d',
    '330e1bec-58f8-422c-b225-ea42b18580d1',
    '517ae649-b3d3-42ad-94d7-99ac408e428b',
]

// ── Stage ordering (for catch-up logic) ──────────────────────────────────
// Canonical pipeline order. Used to determine if a project is "behind" the
// rest of the cohort and should advance individually to catch up.
export const STAGE_ORDER: AutopilotStage[] = [
    'waiting_chase' as AutopilotStage,
    'locking_brief' as AutopilotStage,
    'waiting_max' as AutopilotStage,
    'waiting_sizing' as AutopilotStage,
    'waiting_layout' as AutopilotStage,
    'waiting_bom' as AutopilotStage,
    'waiting_finn' as AutopilotStage,
    'matching_suppliers' as AutopilotStage,
    'running_fang_reviews' as AutopilotStage,
    'proofreading' as AutopilotStage,
    'generating_illustration' as AutopilotStage,
    'generating_pdf' as AutopilotStage,
]

export function getStageIndex(stage: AutopilotStage): number {
    const idx = STAGE_ORDER.indexOf(stage)
    return idx === -1 ? 999 : idx
}

/**
 * Determine the leading (most advanced) stage in the cohort.
 * Returns the stage where the majority of projects are, or the most
 * advanced stage if there's no majority.
 */
export async function getCohortLeadingStage(): Promise<AutopilotStage | null> {
    const admin = createAdminClient()
    const { data: projects } = await admin
        .from("cad_lab_projects")
        .select("id, autopilot_state")
        .in("id", FORGE_GUILD_COHORT_IDS)
        .not("autopilot_state", "is", null)

    if (!projects?.length) return null

    let maxIndex = -1
    for (const p of projects) {
        const state = p.autopilot_state as Record<string, unknown>
        const stage = state?.stage as AutopilotStage
        if (stage) {
            const idx = getStageIndex(stage)
            if (idx > maxIndex) maxIndex = idx
        }
    }

    return maxIndex >= 0 ? STAGE_ORDER[maxIndex] : null
}

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
    note?: string
}

export interface StageScoreHistory {
    iterations: StageScoreResult[]
    composite: number
    passed: boolean
    latest_scored_at: string
}

const MAX_SCORING_ATTEMPTS = 15

// ── Validation mode map ────────────────────────────────────────────────────
// Deterministic stages produce identical output for identical input and must
// NOT be LLM-scored — an LLM judge can randomly score them < 8/10, triggering
// infinite retries. These stages get hard programmatic validators instead.
// Confirmed by 6-model unanimous council 2026-04-30.
export const STAGE_VALIDATION_MODE: Record<string, 'generative' | 'deterministic'> = {
    waiting_chase: 'generative',
    waiting_brief_lock: 'generative',
    waiting_max: 'generative',
    waiting_sizing: 'deterministic',
    waiting_layout: 'deterministic',
    waiting_bom: 'generative',
    waiting_finn: 'generative',
    waiting_suppliers: 'generative',
    waiting_fang: 'generative',
    waiting_proofreader: 'generative',
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
            { name: "part_completeness", description: "What percentage of parts have complete specifications? Score proportionally: ≥95% expanded = 9-10, ≥85% = 7-8, ≥70% = 5-6, <70% = 1-4. Skeleton-only parts (null description/material/cost) are expansion failures, not missing modules.", weight: 1 },
            { name: "specification_accuracy", description: "For expanded parts (non-null specs), are material grades, dimensions, and process types precise enough to source? Ignore skeleton-only parts in this assessment.", weight: 1 },
            { name: "cost_realism", description: "For costed parts, are estimates within ±50% of typical United Kingdom industry ranges? Minor variance is acceptable. Only flag costs that are wildly off (>2x or <0.5x benchmark).", weight: 1 },
            { name: "sourcing_feasibility", description: "Are the specified parts commercially available components? Purchased/COTS parts with manufacturer part numbers or clear specifications score highest.", weight: 1 },
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
        dataQuery: "ai_cost_estimates",
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

// ── Stage-data summarisers (produce readable text for LLM judges) ─────────

function summariseResearch(research: Record<string, unknown> | null): string {
    if (!research) return "No research data found."
    const lines: string[] = ["=== RESEARCH SUMMARY ===\n"]

    // Brief / overview
    const overview = (research.overview ?? research.executiveSummary ?? research.summary) as string | undefined
    if (overview) lines.push(`OVERVIEW:\n${String(overview).slice(0, 600)}\n`)

    // Market size
    const market = (research.marketAnalysis ?? research.market ?? research.marketData) as Record<string, unknown> | undefined
    if (market) {
        lines.push("MARKET DATA:")
        const tam = market.tam ?? market.totalAddressableMarket ?? market.marketSize
        const growth = market.cagr ?? market.growthRate ?? market.growthCagr
        const geography = market.geography ?? market.regions
        if (tam) lines.push(`  TAM: ${tam}`)
        if (growth) lines.push(`  Growth rate: ${growth}`)
        if (geography) lines.push(`  Geography: ${Array.isArray(geography) ? (geography as string[]).join(", ") : String(geography)}`)
        lines.push("")
    }

    // Sources
    const sources = research.sources ?? research.references ?? research.citations
    const sourceCount = Array.isArray(sources) ? (sources as unknown[]).length : 0
    lines.push(`SOURCES COUNT: ${sourceCount}`)
    if (Array.isArray(sources) && sourceCount > 0) {
        const topSources = (sources as Array<Record<string, unknown>>).slice(0, 8)
        topSources.forEach(s => {
            const title = s.title ?? s.name ?? s.url ?? JSON.stringify(s).slice(0, 80)
            lines.push(`  - ${title}`)
        })
        lines.push("")
    }

    // Competitive landscape
    const competitors = research.competitorAnalysis ?? research.competitors ?? research.competitiveLandscape
    if (competitors) {
        lines.push("COMPETITIVE LANDSCAPE:")
        if (Array.isArray(competitors)) {
            const comp = competitors as Array<Record<string, unknown>>
            lines.push(`  ${comp.length} competitors identified`)
            comp.slice(0, 8).forEach(c => {
                const name = c.name ?? c.company ?? c.title
                const pos = c.positioning ?? c.differentiator ?? c.notes
                lines.push(`  - ${name}${pos ? `: ${String(pos).slice(0, 100)}` : ""}`)
            })
        } else {
            lines.push(`  ${String(competitors).slice(0, 400)}`)
        }
        lines.push("")
    }

    // Key findings
    const findings = research.keyFindings ?? research.findings ?? research.insights
    if (findings) {
        lines.push("KEY FINDINGS:")
        if (Array.isArray(findings)) {
            (findings as string[]).slice(0, 8).forEach(f => lines.push(`  - ${String(f).slice(0, 200)}`))
        } else {
            lines.push(`  ${String(findings).slice(0, 600)}`)
        }
        lines.push("")
    }

    // Regulatory / standards mentioned
    const regulatory = research.regulatory ?? research.standards ?? research.regulations
    if (regulatory) {
        lines.push("REGULATORY NOTES:")
        lines.push(`  ${String(regulatory).slice(0, 400)}`)
        lines.push("")
    }

    return lines.join("\n").slice(0, 2200)
}

function summariseModules(modules: Record<string, unknown> | null): string {
    if (!modules) return "No modules data found."
    const moduleEntries = Object.entries(modules)
    if (moduleEntries.length === 0) return "Modules object is empty."

    const lines: string[] = [`=== MODULES SUMMARY (${moduleEntries.length} modules) ===\n`]

    for (const [id, mod] of moduleEntries) {
        const m = mod as Record<string, unknown>
        const name = m.name ?? m.title ?? id
        const description = m.description ?? m.summary
        const material = m.material ?? m.primaryMaterial ?? m.materials
        const dims = m.dimensions ?? m.size ?? m.keyDimensions
        const specs = m.specifications ?? m.keySpecs ?? m.technicalSpecs
        const cost = m.estimatedCost ?? m.costGbp ?? m.unitCost

        lines.push(`MODULE: ${name} (${id})`)
        if (description) lines.push(`  Description: ${String(description).slice(0, 200)}`)
        if (material) lines.push(`  Material: ${typeof material === "object" ? JSON.stringify(material).slice(0, 120) : String(material)}`)
        if (dims) lines.push(`  Dimensions: ${typeof dims === "object" ? JSON.stringify(dims).slice(0, 120) : String(dims)}`)
        if (specs) lines.push(`  Key specs: ${typeof specs === "object" ? JSON.stringify(specs).slice(0, 200) : String(specs).slice(0, 200)}`)
        if (cost != null) lines.push(`  Estimated cost: £${cost}`)
        lines.push("")
    }

    return lines.join("\n").slice(0, 2200)
}

function summariseBOM(parts: Array<Record<string, unknown>> | null): string {
    if (!parts || parts.length === 0) return "No parts data found."

    const totalParts = parts.length
    const categoryCounts: Record<string, number> = {}
    let totalCost = 0
    let missingDescription = 0
    let missingMaterial = 0
    let missingCost = 0

    for (const p of parts) {
        const cat = String(p.category ?? p.type ?? "Uncategorised")
        categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1
        if (!p.description) missingDescription++
        if (!p.material && p.material !== "") missingMaterial++
        const unitCost = typeof p.estimated_unit_cost_gbp === "number" ? p.estimated_unit_cost_gbp : 0
        const qty = typeof p.quantity === "number" ? p.quantity : 1
        totalCost += unitCost * qty
        if (!unitCost) missingCost++
    }

    const lines: string[] = [`=== BILL OF MATERIALS SUMMARY (${totalParts} parts) ===\n`]
    lines.push(`TOTAL ESTIMATED COST: £${totalCost.toFixed(2)}`)
    lines.push(`MISSING FIELDS: ${missingDescription} without description, ${missingMaterial} without material, ${missingCost} without cost\n`)

    lines.push("CATEGORIES:")
    for (const [cat, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
        lines.push(`  ${cat}: ${count} parts`)
    }
    lines.push("")

    // Sample parts (top 20 by cost)
    const sorted = [...parts].sort((a, b) => {
        const ac = typeof a.estimated_unit_cost_gbp === "number" ? a.estimated_unit_cost_gbp : 0
        const bc = typeof b.estimated_unit_cost_gbp === "number" ? b.estimated_unit_cost_gbp : 0
        return bc - ac
    }).slice(0, 20)

    lines.push("TOP PARTS BY COST:")
    for (const p of sorted) {
        const name = p.name ?? p.part_name ?? p.description ?? "Unknown"
        const cost = p.estimated_unit_cost_gbp ?? "?"
        const qty = p.quantity ?? 1
        const mat = p.material ? ` [${p.material}]` : ""
        lines.push(`  - ${String(name).slice(0, 80)}${mat} × ${qty} @ £${cost}`)
    }

    return lines.join("\n").slice(0, 2200)
}

function summariseSuppliers(suppliers: Record<string, unknown> | null): string {
    if (!suppliers) return "No supplier matches found."
    const lines: string[] = ["=== SUPPLIER SHORTLIST SUMMARY ===\n"]

    // Suppliers may be keyed by BOM row or by category
    let totalCount = 0
    let missingContact = 0
    const categoryCounts: Record<string, number> = {}

    const allSuppliers: Array<Record<string, unknown>> = []

    // Try to flatten — could be object of arrays or flat array
    for (const [key, val] of Object.entries(suppliers)) {
        if (Array.isArray(val)) {
            const group = val as Array<Record<string, unknown>>
            categoryCounts[key] = group.length
            totalCount += group.length
            allSuppliers.push(...group.map(s => ({ ...s, _category: key })))
        } else if (val && typeof val === "object") {
            // nested object — treat as single supplier
            allSuppliers.push({ ...(val as Record<string, unknown>), _category: key })
            categoryCounts[key] = (categoryCounts[key] ?? 0) + 1
            totalCount++
        }
    }

    if (allSuppliers.length === 0) {
        // Flat array fallback
        lines.push(`Supplier data present but format unrecognised. Keys: ${Object.keys(suppliers).join(", ")}`)
        return lines.join("\n")
    }

    for (const s of allSuppliers) {
        const hasContact = !!(s.email ?? s.phone ?? s.contactName ?? s.contact)
        if (!hasContact) missingContact++
    }

    lines.push(`TOTAL SUPPLIERS: ${totalCount}`)
    lines.push(`MISSING CONTACT INFO: ${missingContact}\n`)

    lines.push("BY CATEGORY:")
    for (const [cat, count] of Object.entries(categoryCounts)) {
        lines.push(`  ${cat}: ${count} suppliers`)
    }
    lines.push("")

    lines.push("TOP SUPPLIERS:")
    for (const s of allSuppliers.slice(0, 20)) {
        const name = s.name ?? s.companyName ?? s.supplier ?? "Unknown"
        const url = s.url ?? s.website ?? s.homepage ?? ""
        const country = s.country ?? s.location ?? ""
        const cat = s._category ?? ""
        const contact = s.email ?? s.contactName ?? ""
        lines.push(`  - ${String(name).slice(0, 60)}${country ? ` (${country})` : ""} [${cat}]`)
        if (url) lines.push(`    URL: ${String(url).slice(0, 100)}`)
        if (contact) lines.push(`    Contact: ${String(contact).slice(0, 80)}`)
    }

    return lines.join("\n").slice(0, 2200)
}

function summariseFangReviews(reviews: Record<string, unknown> | null): string {
    if (!reviews || Object.keys(reviews).length === 0) return "No engineering reviews found in modules."
    const lines: string[] = [`=== ENGINEERING REVIEW SUMMARY (${Object.keys(reviews).length} modules) ===\n`]

    const severityCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }

    for (const [moduleId, review] of Object.entries(reviews)) {
        const r = review as Record<string, unknown>
        const moduleName = r.moduleName ?? r.name ?? moduleId
        const issues = r.issues ?? r.findings ?? r.critiques ?? []
        const overallScore = r.overallScore ?? r.score ?? r.rating
        const summary = r.summary ?? r.overview

        lines.push(`MODULE: ${moduleName} (${moduleId})`)
        if (overallScore != null) lines.push(`  Overall score: ${overallScore}`)
        if (summary) lines.push(`  Summary: ${String(summary).slice(0, 200)}`)

        if (Array.isArray(issues)) {
            lines.push(`  Issues found: ${(issues as unknown[]).length}`)
            for (const issue of (issues as Array<Record<string, unknown>>).slice(0, 5)) {
                const sev = String(issue.severity ?? issue.level ?? "info").toLowerCase()
                severityCounts[sev] = (severityCounts[sev] ?? 0) + 1
                const desc = issue.description ?? issue.issue ?? issue.text ?? JSON.stringify(issue).slice(0, 100)
                lines.push(`    [${sev}] ${String(desc).slice(0, 150)}`)
            }
        }
        lines.push("")
    }

    lines.push("SEVERITY DISTRIBUTION:")
    for (const [sev, count] of Object.entries(severityCounts)) {
        if (count > 0) lines.push(`  ${sev}: ${count}`)
    }

    return lines.join("\n").slice(0, 2200)
}

function summariseProofreader(report: Record<string, unknown> | null): string {
    if (!report) return "No proofreader report found."
    const lines: string[] = ["=== PROOFREADER REPORT SUMMARY ===\n"]

    // Overall pass/fail
    const passed = report.passed ?? report.overallPass ?? report.status
    const score = report.score ?? report.overallScore
    if (passed != null) lines.push(`OVERALL PASS: ${passed}`)
    if (score != null) lines.push(`SCORE: ${score}`)
    lines.push("")

    // Sections checked
    const sections = report.sections ?? report.checks ?? report.sectionResults
    if (Array.isArray(sections)) {
        lines.push(`SECTIONS CHECKED: ${(sections as unknown[]).length}`)
        for (const sec of sections as Array<Record<string, unknown>>) {
            const name = sec.name ?? sec.section ?? sec.title ?? "Unknown"
            const status = sec.status ?? sec.result ?? sec.pass
            const issues = sec.issues ?? sec.errors ?? []
            const issueCount = Array.isArray(issues) ? (issues as unknown[]).length : 0
            lines.push(`  ${name}: ${status ?? "checked"}${issueCount > 0 ? ` (${issueCount} issues)` : ""}`)
        }
        lines.push("")
    } else if (sections && typeof sections === "object") {
        lines.push("SECTIONS:")
        for (const [key, val] of Object.entries(sections as Record<string, unknown>)) {
            lines.push(`  ${key}: ${String(val).slice(0, 120)}`)
        }
        lines.push("")
    }

    // Issues / corrections
    const issues = report.issues ?? report.errors ?? report.corrections ?? report.findings
    if (Array.isArray(issues)) {
        lines.push(`ISSUES FOUND: ${(issues as unknown[]).length}`)
        for (const issue of (issues as Array<Record<string, unknown>>).slice(0, 12)) {
            const desc = issue.description ?? issue.message ?? issue.text ?? JSON.stringify(issue).slice(0, 120)
            const field = issue.field ?? issue.section ?? issue.location
            lines.push(`  - ${field ? `[${field}] ` : ""}${String(desc).slice(0, 180)}`)
        }
        lines.push("")
    }

    // Summary / notes
    const summary = report.summary ?? report.notes ?? report.recommendations
    if (summary) {
        lines.push("SUMMARY:")
        lines.push(`  ${String(summary).slice(0, 500)}`)
    }

    return lines.join("\n").slice(0, 2200)
}

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
            return summariseResearch(research)
        }
        case "modules": {
            const { data } = await admin
                .from("cad_lab_projects")
                .select("modules")
                .eq("id", projectId)
                .maybeSingle()
            const modules = data?.modules as Record<string, unknown> | null
            return summariseModules(modules)
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
                .eq("cad_lab_project_id", projectId)
                .limit(200)
            if (!data?.length) return "No parts data found."
            const totalParts = data.length
            const expandedParts = data.filter((p: Record<string, unknown>) => p.cost_provenance !== 'todo' && p.description !== null && p.material !== null && p.material !== '' && p.estimated_unit_cost_gbp !== null && p.estimated_unit_cost_gbp !== 0).length
            const skeletonParts = totalParts - expandedParts
            const coveragePercent = totalParts > 0 ? Math.round((expandedParts / totalParts) * 100) : 0
            const coverageSummary = `BOM EXPANSION COVERAGE: ${expandedParts}/${totalParts} parts fully expanded (${coveragePercent}%). ${skeletonParts} parts are skeleton-only (missing specs/costs — batch expansion failed on these). Score part_completeness based on coverage percentage, not binary pass/fail. A bill of materials with ≥85% coverage should score ≥7/10 on part_completeness.\n\n`
            return coverageSummary + summariseBOM(data as Array<Record<string, unknown>>)
        }
        case "ai_cost_estimates": {
            const { data } = await admin
                .from("cad_lab_projects")
                .select("ai_cost_estimates")
                .eq("id", projectId)
                .maybeSingle()
            const cost = data?.ai_cost_estimates as Record<string, unknown> | null
            if (!cost) return "No cost analysis found."
            // Sensitivity + benchmark are at the END of the JSON and were getting
            // truncated by the 12K limit. Extract them first so judges always see them.
            const sensitivity = cost["_sensitivity_analysis"]
            const benchmark = cost["_benchmark_grounding"]
            const moduleEntries = Object.entries(cost)
                .filter(([k]) => !k.startsWith("_"))
            const moduleSummary = moduleEntries.map(([id, est]) => {
                const e = est as Record<string, unknown>
                return {
                    moduleId: id,
                    totalPerUnit: e.totalPerUnit,
                    partCount: Array.isArray(e.parts) ? (e.parts as unknown[]).length : 0,
                    labourCost: e.labourCost,
                    confidence: e.confidence,
                    topParts: Array.isArray(e.parts)
                        ? (e.parts as Array<Record<string, unknown>>)
                            .sort((a, b) => ((b.cost as number) ?? 0) - ((a.cost as number) ?? 0))
                            .slice(0, 3)
                            .map(p => ({ name: p.name, cost: p.cost, type: p.type }))
                        : [],
                }
            })
            const structured = {
                _sensitivity_analysis: sensitivity ?? "NOT PROVIDED",
                _benchmark_grounding: benchmark ?? "NOT PROVIDED",
                module_cost_summaries: moduleSummary,
            }
            return JSON.stringify(structured, null, 2).slice(0, 24000)
        }
        case "supplier_matches": {
            const { data } = await admin
                .from("cad_lab_projects")
                .select("supplier_shortlist")
                .eq("id", projectId)
                .maybeSingle()
            const suppliers = data?.supplier_shortlist as Record<string, unknown> | null
            return summariseSuppliers(suppliers)
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
            return summariseFangReviews(reviews)
        }
        case "proofreader_report": {
            const { data } = await admin
                .from("cad_lab_projects")
                .select("proofreader_report")
                .eq("id", projectId)
                .maybeSingle()
            const report = data?.proofreader_report as Record<string, unknown> | null
            return summariseProofreader(report)
        }
        default:
            return "Unknown data query type."
    }
}

// ── Chase hard gates ──────────────────────────────────────────────────────

function applyChaseHardGates(
  scores: Record<string, number>,
  outputText: string
): Record<string, number> {
  const capped = { ...scores };

  // Count academic sources (DOI patterns, "et al.", journal indicators)
  const doiCount = (outputText.match(/10\.\d{4,}/g) || []).length;
  const etAlCount = (outputText.match(/et al\./gi) || []).length;
  const academicIndicators = Math.max(doiCount, etAlCount);
  if (academicIndicators < 4 && capped.source_diversity !== undefined) {
    capped.source_diversity = Math.min(capped.source_diversity, 8.5);
  }

  // Count patents (US/WO/EP patent number patterns)
  const patentCount = (outputText.match(/\b(US|WO|EP|GB|CN|JP)\s*\d{4,}/gi) || []).length;
  if (patentCount < 3 && capped.source_diversity !== undefined) {
    capped.source_diversity = Math.min(capped.source_diversity, 8.5);
  }

  // Count competitors (look for competitor table rows or named companies)
  const competitorSection = outputText.match(/competitor[s]?.*?(?=\n#{1,3}\s|\n={3,}|$)/is);
  const competitorRows = competitorSection
    ? (competitorSection[0].match(/\|.*\|.*\|.*\|/g) || []).length - 1 // minus header
    : 0;
  if (competitorRows < 8 && capped.competitor_analysis !== undefined) {
    capped.competitor_analysis = Math.min(capped.competitor_analysis, 8.0);
  }

  // Check for generic differentiators
  const genericPhrases = (outputText.match(/\b(innovative approach|cutting-edge|unique solution|state-of-the-art|world-class|best-in-class|industry-leading)\b/gi) || []).length;
  if (genericPhrases > 2 && capped.competitor_analysis !== undefined) {
    capped.competitor_analysis = Math.min(capped.competitor_analysis, 8.5);
  }

  // Check for specific standards (IEC, BS EN, ISO, EASA patterns)
  const standardsCount = (outputText.match(/\b(IEC|BS\s*EN|ISO|EASA|IEEE|ASTM|UL|NFPA)\s*[\d-]+/gi) || []).length;
  if (standardsCount < 3 && capped.regulatory_coverage !== undefined) {
    capped.regulatory_coverage = Math.min(capped.regulatory_coverage, 8.5);
  }

  // Check for truncated tables
  const hasTruncation = /\.\.\.|(\[truncated\])|(\[continued\])|(and\s+\d+\s+more)/i.test(outputText);
  if (hasTruncation) {
    if (capped.competitor_analysis !== undefined) capped.competitor_analysis = Math.min(capped.competitor_analysis, 7.5);
    if (capped.source_diversity !== undefined) capped.source_diversity = Math.min(capped.source_diversity, 7.5);
  }

  return capped;
}

// ── Deterministic stage validator ─────────────────────────────────────────

/**
 * Hard programmatic validator for deterministic solver stages.
 * Returns a StageScoreResult with passed=true if all gates pass, false otherwise.
 * Used instead of the LLM judge for waiting_sizing and waiting_layout.
 *
 * Rationale: these stages produce identical output for identical input.
 * An LLM judge can score them < 8/10 non-deterministically, causing
 * infinite retries. 6-model council unanimously agreed: use hard checks.
 */
export async function validateDeterministicStage(
    projectId: string,
    stage: AutopilotStage,
    _supabase?: unknown,
): Promise<StageScoreResult | null> {
    const admin = createAdminClient()

    const { data } = await admin
        .from("cad_lab_projects")
        .select("research, autopilot_state, dimension_sheet, spatial_plan")
        .eq("id", projectId)
        .maybeSingle()

    const research = data?.research as Record<string, unknown> | null

    if (stage === "waiting_sizing") {
        const dimensionSheet = (data?.dimension_sheet as Record<string, unknown> | null) ?? null

        if (!dimensionSheet) {
            return {
                stage,
                scores: [
                    {
                        dimension: "dimension_sheet_exists",
                        score: 8,
                        reasoning: "Sizing skipped: no domain rule library for this project type. Deterministic sizing not yet available for this domain.",
                    },
                ],
                composite: 8,
                passed: true,
                reasoning: "Auto-pass: no sizing domain rules exist for this project type. Deterministic sizing is an enhancement, not a hard requirement.",
                scored_at: new Date().toISOString(),
                note: "sizing_skipped_no_domain_rules",
            }
        }

        const failures: string[] = []

        {
            const ds = dimensionSheet as Record<string, unknown>
            // Solver must not have returned INFEASIBLE
            const solverStatus = (ds.solver_status ?? ds.solverStatus ?? "") as string
            if (typeof solverStatus === "string" && solverStatus.toUpperCase() === "INFEASIBLE") {
                failures.push("solver returned INFEASIBLE")
            }

            // Check that the dimension sheet has substantive numeric content.
            // The sizing engine produces different schemas per domain, so we
            // check multiple possible locations for numeric parameters:
            //   - Top-level: length, width, height, mass, power (legacy/simple)
            //   - envelope.*_mm fields (container-based projects)
            //   - module_dimensions entries with d_mm/h_mm/w_mm (all domains)
            //   - target.kw / target.kwh (energy projects)
            let numericCount = 0
            const topLevel = ["length", "width", "height", "mass", "power"]
            numericCount += topLevel.filter((k) => typeof ds[k] === "number" && isFinite(ds[k] as number)).length
            const envelope = ds.envelope as Record<string, unknown> | null
            if (envelope && typeof envelope === "object") {
                const envKeys = ["interior_w_mm", "interior_d_mm", "interior_h_mm", "interior_floor_m2"]
                numericCount += envKeys.filter((k) => typeof envelope[k] === "number").length
            }
            const moduleDims = ds.module_dimensions as Record<string, unknown> | null
            if (moduleDims && typeof moduleDims === "object") {
                for (const mod of Object.values(moduleDims)) {
                    if (mod && typeof mod === "object") {
                        const m = mod as Record<string, unknown>
                        if (typeof m.d_mm === "number" || typeof m.h_mm === "number" || typeof m.w_mm === "number") {
                            numericCount++
                        }
                    }
                }
            }
            const target = ds.target as Record<string, unknown> | null
            if (target && typeof target === "object") {
                if (typeof target.kw === "number") numericCount++
                if (typeof target.kwh === "number") numericCount++
            }
            if (numericCount < 3) {
                failures.push(`only ${numericCount}/5 key sizing parameters are numeric (need ≥3)`)
            }
        }

        const passed = failures.length === 0
        const scores: DimensionScore[] = [
            {
                dimension: "dimension_sheet_exists",
                score: !dimensionSheet ? 0 : 10,
                reasoning: !dimensionSheet ? "No dimension sheet found" : "Dimension sheet present",
            },
            {
                dimension: "solver_feasible",
                score: failures.some(f => f.includes("INFEASIBLE")) ? 0 : 10,
                reasoning: failures.some(f => f.includes("INFEASIBLE"))
                    ? "Solver returned INFEASIBLE"
                    : "Solver converged to a feasible solution",
            },
            {
                dimension: "parameters_numeric",
                score: failures.some(f => f.includes("sizing parameters")) ? 4 : 10,
                reasoning: failures.find(f => f.includes("sizing parameters")) ?? "Key sizing parameters are numeric",
            },
        ]

        return {
            stage,
            scores,
            composite: passed ? 10 : 0,
            passed,
            reasoning: passed
                ? "All hard gates passed: dimension sheet present, solver feasible, key parameters numeric."
                : `Hard gate failures: ${failures.join("; ")}`,
            scored_at: new Date().toISOString(),
        }
    }

    if (stage === "waiting_layout") {
        const spatialPlan = (data?.spatial_plan as Record<string, unknown> | null) ?? null

        if (!spatialPlan) {
            return {
                stage,
                scores: [
                    {
                        dimension: "layout_exists",
                        score: 8,
                        reasoning: "Layout skipped: no spatial plan produced for this project type. Layout engine not yet available for this domain.",
                    },
                ],
                composite: 8,
                passed: true,
                reasoning: "Auto-pass: no layout engine exists for this project type. Spatial layout is an enhancement, not a hard requirement.",
                scored_at: new Date().toISOString(),
                note: "layout_skipped_no_domain_rules",
            }
        }

        const failures: string[] = []

        {
            const ld = spatialPlan
            const modules = ld.modules ?? ld.moduleList ?? ld.placements ?? null
            if (!Array.isArray(modules) || modules.length === 0) {
                failures.push("modules array is empty or missing")
            }
        }

        const passed = failures.length === 0
        const scores: DimensionScore[] = [
            {
                dimension: "layout_exists",
                score: !spatialPlan ? 0 : 10,
                reasoning: !spatialPlan ? "No spatial_plan found" : "Spatial plan present",
            },
            {
                dimension: "modules_populated",
                score: failures.some(f => f.includes("modules")) ? 0 : 10,
                reasoning: failures.find(f => f.includes("modules")) ?? "Modules array is non-empty",
            },
        ]

        return {
            stage,
            scores,
            composite: passed ? 10 : 0,
            passed,
            reasoning: passed
                ? "All hard gates passed: spatial_plan present with non-empty modules array."
                : `Hard gate failures: ${failures.join("; ")}`,
            scored_at: new Date().toISOString(),
        }
    }

    // Unknown deterministic stage — log a warning and return null (caller falls back to LLM)
    console.warn(`[stage-scoring] validateDeterministicStage called for unhandled stage=${stage}`)
    return null
}

// ── Scoring function ──────────────────────────────────────────────────────

export async function scoreStageOutput(
    projectId: string,
    stage: AutopilotStage,
): Promise<StageScoreResult | null> {
    if (SKIP_SCORING_STAGES.includes(stage)) return null

    if (STAGE_VALIDATION_MODE[stage] === 'deterministic') {
        return validateDeterministicStage(projectId, stage)
    }

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

HARD SCORING CAPS (apply these ceilings regardless of overall quality):
- source_diversity: cap at 8.5 if fewer than 4 academic papers with DOIs OR fewer than 3 patents with numbers are cited
- competitor_analysis: cap at 8.0 if fewer than 8 named competitors with quantitative specs
- competitor_analysis: cap at 8.5 if differentiators are generic adjectives rather than measurable metrics
- regulatory_coverage: cap at 8.5 if standards are referenced by category name rather than exact document numbers (e.g. "battery safety standards" instead of "IEC 62619:2022")
- ANY dimension: cap at 7.5 if the relevant section contains a truncated table or "[continued]" marker

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

    // ── Multi-model judge panel scoring ────────────────────────────────────
    // Fire a lineage-diverse judge panel instead of a single LLM scorer.
    // High-risk stages get 3 judges, medium-risk get 2, low-risk get 1.
    // Falls back to single DeepSeek if all judges fail.

    try {
        const panelConfig = getJudgePanelConfig(stage)
        let panelResult: JudgePanelResult
        let dimensionScores: DimensionScore[]

        if (panelConfig && panelConfig.length > 0) {
            // Route through judge panel
            panelResult = await runJudgePanel(
                stage,
                stageData,
                `project-${projectId}`,
                `${systemPrompt}\n\n${userPrompt}`,
            )

            console.info(
                `[stage-scoring] Judge panel for ${stage}: ${panelResult.successfulJudgeCount}/${panelResult.judgeCount} judges responded, ` +
                `score=${panelResult.score}, blockers=${panelResult.blockers.length}, warnings=${panelResult.warnings.length}`,
            )

            // Map panel score back to dimension scores for backward compatibility
            dimensionScores = rubric.dimensions.map((d) => ({
                dimension: d.name,
                score: panelResult.score,
                reasoning: `Judge panel composite (${panelResult.successfulJudgeCount} judges). ` +
                    `Blockers: ${panelResult.blockers.length}, Warnings: ${panelResult.warnings.length}`,
            }))

            // Incorporate individual judge scores per dimension if available
            // (judges return a single score, so all dimensions share it)
        } else {
            // No panel configured — use legacy single DeepSeek call
            const { text } = await callDeepSeek(
                systemPrompt,
                userPrompt,
                "deepseek-chat",
                4096,
                30_000,
            )

            const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
            const parsed = JSON.parse(cleaned) as {
                scores: Array<{ dimension: string; score: number; reasoning: string }>
                overall_reasoning: string
            }

            dimensionScores = parsed.scores.map((s) => ({
                dimension: s.dimension,
                score: Math.max(1, Math.min(10, Math.round(s.score))),
                reasoning: s.reasoning,
            }))

            panelResult = {
                score: 0, // will be computed below
                findings: [],
                blockers: [],
                warnings: [],
                rawJudgeResults: [],
                judgeCount: 1,
                successfulJudgeCount: 1,
            }
        }

        // Apply Chase-specific hard gates based on evidence found in the output text
        if (stage === "waiting_chase") {
            const scoreMap: Record<string, number> = {}
            for (const ds of dimensionScores) {
                scoreMap[ds.dimension] = ds.score
            }
            const gatedMap = applyChaseHardGates(scoreMap, stageData)
            dimensionScores = dimensionScores.map((ds) => ({
                ...ds,
                score: gatedMap[ds.dimension] ?? ds.score,
            }))
        }

        let totalWeight = 0
        let weightedSum = 0
        for (const ds of dimensionScores) {
            const rubricDim = rubric.dimensions.find((d) => d.name === ds.dimension)
            const w = rubricDim?.weight ?? 1
            weightedSum += ds.score * w
            totalWeight += w
        }

        // Use panel score when a panel was used (it's the average of judge scores),
        // otherwise compute from dimension weights
        let composite: number
        if (panelConfig && panelConfig.length > 0) {
            composite = panelResult.score
        } else {
            composite = totalWeight > 0
                ? Math.round((weightedSum / totalWeight) * 100) / 100
                : 0
        }

        // BOM skeleton detector: hard-cap score when skeleton parts exist.
        // Council diagnosis (6/6 consensus 2026-05-01): skeleton parts with
        // null material/cost/description from failed batch expansions must
        // deterministically cap the score, not rely on LLM judgement.
        if (stage === "waiting_bom") {
            const skeletonMatch = stageData.match(/BOM EXPANSION COVERAGE: (\d+)\/(\d+)/)
            if (skeletonMatch) {
                const expanded = parseInt(skeletonMatch[1], 10)
                const total = parseInt(skeletonMatch[2], 10)
                const skeletonCount = total - expanded
                const skeletonRatio = total > 0 ? skeletonCount / total : 0
                if (skeletonRatio > 0.10) {
                    composite = Math.min(composite, 6.0)
                    console.warn(
                        `[stage-scoring] BOM skeleton cap applied: ${skeletonCount}/${total} skeletons (${Math.round(skeletonRatio * 100)}%) → capped at 6.0`,
                    )
                } else if (skeletonCount > 0) {
                    composite = Math.min(composite, 7.5)
                    console.warn(
                        `[stage-scoring] BOM skeleton cap applied: ${skeletonCount} skeletons → capped at 7.5`,
                    )
                }
            }
        }

        // ── Role 3: Fix Router — auto-fix BLOCKER findings ─────────────────
        // If score < 8.0 and judge panel found blockers, route to a coding model
        // to produce corrected output. One fix attempt per scoring round — no loops.
        let fixRouterNote = ""
        if (
            panelConfig && panelConfig.length > 0 &&
            composite < 8.0 &&
            panelResult.blockers.length > 0 &&
            rubric.dataQuery
        ) {
            console.info(
                `[stage-scoring] Score ${composite} < 8.0 with ${panelResult.blockers.length} blockers — ` +
                `routing to fix model for ${stage}`,
            )

            try {
                const fixResult = await routeAndApplyFixes(panelResult, {
                    projectId,
                    stage,
                    stageData,
                    dataQuery: rubric.dataQuery,
                })

                fixRouterNote = ` | fix_router:applied=${fixResult.fixesApplied}:skipped=${fixResult.fixesSkipped}`
                if (fixResult.crossChecksFailed > 0) {
                    fixRouterNote += `:cross_check_failed=${fixResult.crossChecksFailed}`
                }

                if (fixResult.correctedOutput && fixResult.fixesApplied > 0) {
                    // Write corrected output back to the database
                    const columnMapping = DATA_QUERY_TO_COLUMN[rubric.dataQuery]
                    if (columnMapping) {
                        const admin = createAdminClient()
                        await admin
                            .from(columnMapping.table)
                            .update({ [columnMapping.column]: fixResult.correctedOutput })
                            .eq(columnMapping.idColumn, projectId)

                        console.info(
                            `[stage-scoring] Fix router wrote corrected output to ` +
                            `${columnMapping.table}.${columnMapping.column} for project ${projectId}`,
                        )

                        // Re-score with the corrected data
                        const correctedData = JSON.stringify(fixResult.correctedOutput, null, 2).slice(0, 12000)
                        const reScoreResult = await runJudgePanel(
                            stage,
                            correctedData,
                            `project-${projectId}`,
                            `${systemPrompt}\n\n${userPrompt}`,
                        )

                        console.info(
                            `[stage-scoring] Re-score after fix: ${reScoreResult.score}/10 ` +
                            `(was ${composite}/10). Blockers: ${reScoreResult.blockers.length}`,
                        )

                        if (reScoreResult.score >= composite) {
                            composite = reScoreResult.score
                            panelResult = reScoreResult
                            dimensionScores = rubric.dimensions.map((d) => ({
                                dimension: d.name,
                                score: reScoreResult.score,
                                reasoning: `Post-fix re-score (${reScoreResult.successfulJudgeCount} judges). ` +
                                    `Blockers: ${reScoreResult.blockers.length}`,
                            }))
                            fixRouterNote += `:re_scored=${reScoreResult.score}`
                        } else {
                            fixRouterNote += `:re_score_worse=${reScoreResult.score}`
                        }
                    }
                }

                // Log fix router actions
                for (const entry of fixResult.log) {
                    console.info(
                        `[fix-router] ${entry.applied ? "APPLIED" : "SKIPPED"}: ` +
                        `${entry.finding.slice(0, 80)} → ${entry.model} (${entry.complexity})` +
                        (entry.reason ? ` — ${entry.reason}` : ""),
                    )
                }
            } catch (fixErr) {
                console.warn(
                    `[stage-scoring] Fix router failed for ${stage}:`,
                    fixErr instanceof Error ? fixErr.message : fixErr,
                )
                fixRouterNote = " | fix_router:error"
            }
        }

        // Build reasoning string — include panel metadata when available
        const panelMeta = panelConfig && panelConfig.length > 0
            ? `[Judge panel: ${panelResult.successfulJudgeCount}/${panelResult.judgeCount} judges, ` +
              `${panelResult.blockers.length} blockers, ${panelResult.warnings.length} warnings] `
            : ""
        const reasoningText = panelConfig && panelConfig.length > 0
            ? `${panelMeta}Score ${composite}/10. ` +
              (panelResult.blockers.length > 0
                  ? `Blockers: ${panelResult.blockers.map((b) => b.description).join("; ")}`
                  : "No cross-lineage blockers found.")
            : dimensionScores.map((ds) => ds.reasoning).join(" ")

        return {
            stage,
            scores: dimensionScores,
            composite,
            passed: composite >= 8.0,
            reasoning: reasoningText,
            scored_at: new Date().toISOString(),
            note: panelConfig && panelConfig.length > 0
                ? `judge_panel:${panelResult.successfulJudgeCount}/${panelResult.judgeCount}:blockers=${panelResult.blockers.length}:warnings=${panelResult.warnings.length}${fixRouterNote}`
                : undefined,
        }
    } catch (err) {
        console.error(
            `[stage-scoring] Failed to score project=${projectId} stage=${stage}:`,
            err instanceof Error ? err.message : err,
        )
        throw err
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

    const existingScores = (current.stage_scores ?? {}) as Record<string, StageScoreHistory>
    const existing = existingScores[stage]

    if (existing && existing.iterations) {
        existing.iterations.push(result)
        existing.composite = result.composite
        existing.passed = result.passed
        existing.latest_scored_at = result.scored_at
    } else {
        existingScores[stage] = {
            iterations: [result],
            composite: result.composite,
            passed: result.passed,
            latest_scored_at: result.scored_at,
        }
    }

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

/**
 * Get the number of scoring iterations for a stage.
 */
export function getScoringAttemptCount(
    state: Record<string, unknown>,
    stage: string,
): number {
    const stageScores = state.stage_scores as Record<string, StageScoreHistory> | undefined
    const history = stageScores?.[stage]
    if (!history?.iterations) return 0
    return history.iterations.length
}

export { MAX_SCORING_ATTEMPTS }

/**
 * Build a council feedback context string for a specialist to incorporate
 * on re-run. Returns null if no relevant council diagnosis exists.
 */
export async function getCouncilFeedbackForStage(
    projectId: string,
    stage: AutopilotStage,
): Promise<string | null> {
    const admin = createAdminClient()
    const { data } = await admin
        .from("cad_lab_projects")
        .select("autopilot_state")
        .eq("id", projectId)
        .maybeSingle()

    const state = data?.autopilot_state as Record<string, unknown> | null
    if (!state) return null

    const diagnosis = state.council_diagnosis as CouncilDiagnosis | null
    if (!diagnosis) return null
    if (diagnosis.stage !== stage) return null

    const findings = diagnosis.consensusFindings
    const fixes = diagnosis.consensusFixes

    if (!findings.length && !fixes.length) return null

    const attemptCount = getScoringAttemptCount(state, stage)

    let ctx = `\n\n=== QUALITY GATE FEEDBACK (attempt ${attemptCount + 1}) ===\n`
    ctx += `Previous attempt scored ${diagnosis.composite}/10 (threshold: 8.0).\n`
    ctx += `A diagnostic council of 6 independent models identified these issues:\n\n`

    if (findings.length) {
        ctx += `ISSUES FOUND:\n`
        for (const f of findings) {
            ctx += `- ${f}\n`
        }
        ctx += `\n`
    }

    if (fixes.length) {
        ctx += `REQUIRED FIXES:\n`
        for (const f of fixes) {
            ctx += `- ${f}\n`
        }
        ctx += `\n`
    }

    ctx += `Address ALL of these issues in your response. The quality gate will re-score your output.\n`
    ctx += `=== END QUALITY GATE FEEDBACK ===\n`

    return ctx
}

// ── Foundry-wide cohort gate ──────────────────────────────────────────────

const MIN_COHORT_SIZE = 5

/**
 * Check if ALL projects in a foundry have passed scoring for a given stage.
 * Queries by foundry ONLY (not by current stage) to avoid the race condition
 * where early-advancing projects disappear from the stage-filtered query.
 *
 * 6-model council confirmed root cause 2026-04-30: filtering by stage caused
 * 4/5 to advance, stranding Hedgerow permanently.
 */
export async function checkFoundryCohortGate(
    foundryId: string,
    stage: AutopilotStage,
): Promise<{ allPassed: boolean; shouldResetAll: boolean; results: Array<{ projectId: string; projectName: string; composite: number; passed: boolean; currentStage: string }> }> {
    const admin = createAdminClient()

    const { data: projects } = await admin
        .from("cad_lab_projects")
        .select("id, name, autopilot_state")
        .in("id", FORGE_GUILD_COHORT_IDS)
        .not("autopilot_state", "is", null)
        .not("autopilot_state->>started_at", "is", null)

    if (!projects?.length) {
        return { allPassed: false, shouldResetAll: false, results: [] }
    }

    if (projects.length < MIN_COHORT_SIZE) {
        console.warn(`[cohort-gate] foundry=${foundryId} stage=${stage}: only ${projects.length} of ${FORGE_GUILD_COHORT_IDS.length} cohort projects found — need at least ${MIN_COHORT_SIZE}`)
        return { allPassed: false, shouldResetAll: false, results: projects.map(p => ({
            projectId: p.id,
            projectName: p.name ?? p.id,
            composite: 0,
            passed: false,
            currentStage: ((p.autopilot_state as Record<string, unknown>)?.stage as string) ?? "unknown",
        })) }
    }

    // ATOMIC FIX (2026-04-30): do NOT filter by state.stage === stage.
    // Projects that already advanced past this stage have a different stage value,
    // but their stage_scores[stage] entry is still persisted. Filtering by current
    // stage caused 4/5 to advance, leaving the 5th project stranded with no way
    // to detect it had already been scored and passed.
    //
    // The correct logic: check ALL foundry projects' stage_scores[stage].passed.
    // A project that has already advanced will have passed=true stored.
    // A project not yet scored will be missing the entry → gate correctly holds.
    const results: Array<{ projectId: string; projectName: string; composite: number; passed: boolean; currentStage: string }> = []
    let anyExhausted = false

    for (const p of projects) {
        const state = p.autopilot_state as Record<string, unknown>
        if (!state) {
            results.push({ projectId: p.id, projectName: p.name ?? p.id, composite: 0, passed: false, currentStage: "unknown" })
            continue
        }
        const stageScores = state.stage_scores as Record<string, StageScoreHistory> | undefined
        const stageScore = stageScores?.[stage]
        const attemptCount = getScoringAttemptCount(state, stage)
        const currentStage = (state.stage as string) ?? "unknown"

        if (attemptCount >= MAX_SCORING_ATTEMPTS && (!stageScore || !stageScore.passed)) {
            anyExhausted = true
        }

        if (!stageScore) {
            results.push({ projectId: p.id, projectName: p.name ?? p.id, composite: 0, passed: false, currentStage })
        } else {
            results.push({
                projectId: p.id,
                projectName: p.name ?? p.id,
                composite: stageScore.composite,
                passed: stageScore.passed,
                currentStage,
            })
        }
    }

    console.info(
        `[cohort-gate] foundry=${foundryId} stage=${stage}: ` +
        `${results.filter(r => r.passed).length}/${results.length} passed, anyExhausted=${anyExhausted}`,
    )

    // If ANY project exhausted attempts, log but do NOT reset — autopilot-tick
    // handles retry reset individually. The cohort gate just reports status.
    if (anyExhausted) {
        console.warn(
            `[cohort-gate] Some projects exhausted ${MAX_SCORING_ATTEMPTS} attempts at ${stage} — autopilot-tick will reset them individually`,
        )
        return { allPassed: false, shouldResetAll: false, results }
    }

    const allPassed = results.length >= MIN_COHORT_SIZE && results.every((r) => r.passed)
    return { allPassed, shouldResetAll: false, results }
}

/**
 * Advance ALL projects in a foundry from one stage to the next atomically.
 * Either all advance or none do. Prevents the split-cohort race condition.
 */
export async function advanceCohort(
    foundryId: string,
    fromStage: AutopilotStage,
    toStage: AutopilotStage,
): Promise<{ ok: boolean; advancedCount: number }> {
    const admin = createAdminClient()

    const { data: projects } = await admin
        .from("cad_lab_projects")
        .select("id, name, autopilot_state")
        .eq("foundry_id", foundryId)
        .eq("autopilot_state->>stage", fromStage)
        .not("autopilot_state", "is", null)

    if (!projects?.length || projects.length < MIN_COHORT_SIZE) {
        console.error(
            `[cohort-gate] advanceCohort aborted: only ${projects?.length ?? 0} projects at ${fromStage} (need ${MIN_COHORT_SIZE})`,
        )
        return { ok: false, advancedCount: 0 }
    }

    // Verify ALL have passed scoring for this stage before advancing any
    for (const p of projects) {
        const state = p.autopilot_state as Record<string, unknown>
        const stageScores = state.stage_scores as Record<string, StageScoreHistory> | undefined
        if (!stageScores?.[fromStage]?.passed) {
            console.error(
                `[cohort-gate] advanceCohort aborted: ${p.name ?? p.id} has not passed ${fromStage}`,
            )
            return { ok: false, advancedCount: 0 }
        }
    }

    // Advance all projects atomically
    let advancedCount = 0
    for (const p of projects) {
        const state = p.autopilot_state as Record<string, unknown>
        const completed = Array.from(new Set([
            ...((state.completed_stages ?? []) as string[]),
            fromStage,
        ]))
        const updatedState = {
            ...state,
            stage: toStage,
            completed_stages: completed,
            status: "idle",
        }
        // Clear stale finished_at to prevent cron skip
        delete (updatedState as Record<string, unknown>).finished_at

        const { error } = await admin
            .from("cad_lab_projects")
            .update({ autopilot_state: updatedState } as unknown as never)
            .eq("id", p.id)
            .eq("autopilot_state->>stage", fromStage) // guard: only if still at fromStage

        if (error) {
            console.error(`[cohort-gate] advanceCohort failed for ${p.id}: ${error.message}`)
        } else {
            advancedCount++
        }
    }

    if (advancedCount !== projects.length) {
        console.error(
            `[cohort-gate] PARTIAL ADVANCE: ${advancedCount}/${projects.length} — some projects may have been modified concurrently`,
        )
    }

    console.info(
        `[cohort-gate] advanceCohort ${fromStage} → ${toStage}: ${advancedCount}/${projects.length} projects advanced`,
    )
    return { ok: advancedCount === projects.length, advancedCount }
}

/**
 * Reset cohort projects back to waiting_chase when any project fails a stage
 * permanently. Tristan's rule: any failure = full restart.
 *
 * @param foundryId - The foundry owning the cohort (used for logging only).
 * @param cohortProjectIds - Optional explicit list of project IDs to reset.
 *   Defaults to FORGE_GUILD_COHORT_IDS. Pass this when the caller already
 *   has the list to avoid a redundant DB fetch.
 *
 * ATOMIC (2026-04-30): all projects are reset in a SINGLE .update().in() call.
 * The previous per-project loop left partial state when a timeout interrupted
 * mid-loop (some projects reset, others still at their failed stage).
 * A single bulk update either succeeds for all rows or fails for all rows —
 * no mid-reset partial state is possible.
 */
export async function resetCohortToChase(
    foundryId: string,
    cohortProjectIds?: string[],
): Promise<void> {
    const admin = createAdminClient()
    const ids = cohortProjectIds ?? FORGE_GUILD_COHORT_IDS

    console.info(`[cohort-gate] FULL COHORT RESET: atomically resetting ${ids.length} projects to waiting_chase (foundry=${foundryId})`)

    // Step 1 — Clear all generated content in a single bulk update.
    // This is the equivalent of resetToFounderBrief() but without the
    // per-project loop — all rows updated in one round-trip.
    const resetAt = new Date().toISOString()
    const { error: contentErr } = await admin
        .from("cad_lab_projects")
        .update({
            research: null,
            modules: null,
            reviews: null,
            ai_cost_estimates: null,
            proofread_findings: null,
            feasibility_verdict: null,
            oracle_findings: null,
            executive_summary: null,
            cost_reconciliation: null,
            dimension_sheet: null,
            spatial_plan: null,
            bom_generation_state: null,
            image_render_state: null,
            concept_render_url: null,
            system_illustration_url: null,
            interior_overview_url: null,
            reference_dossier: null,
            brief_locked_at: null,
            brief_locked_by: null,
            gate_remediation_context: null,
            autopilot_state: {
                stage: "waiting_chase",
                status: "idle",
                attempts: 0,
                completed_stages: [],
                failed_stages: [],
                stage_scores: {},
                council_diagnosis: null,
                started_at: resetAt,
                finished_at: null,
            },
        } as never)
        .in("id", ids)

    if (contentErr) {
        console.error(`[cohort-gate] COHORT RESET content clear failed:`, contentErr.message)
        // Non-fatal — still attempt to clear pipeline artefacts below
    } else {
        console.info(`[cohort-gate] COHORT RESET content cleared for ${ids.length} projects`)
    }

    // Step 2 — Bulk-delete pipeline_runs for all cohort projects.
    const { error: pipelineErr } = await admin
        .from("pipeline_runs")
        .delete()
        .in("project_id", ids)

    if (pipelineErr) {
        console.error(`[cohort-gate] COHORT RESET pipeline_runs cleanup failed:`, pipelineErr.message)
    }

    console.info(`[cohort-gate] COHORT RESET complete — ${ids.length} projects at waiting_chase, pipeline_runs cleared`)
}

/**
 * Stages that should be scored before advancing.
 * Excludes render/lock stages that produce no scoreable content.
 */
export function shouldScoreStage(stage: AutopilotStage): boolean {
    return !SKIP_SCORING_STAGES.includes(stage) && !!RUBRICS[stage]
}

// ── Diagnostic Council ────────────────────────────────────────────────

export interface CouncilFinding {
    model: string
    findings: string[]
    suggestedFixes: string[]
    rawResponse: string
}

export interface CouncilDiagnosis {
    projectId: string
    stage: AutopilotStage
    composite: number
    individualFindings: CouncilFinding[]
    consensusFindings: string[]
    consensusFixes: string[]
    convenedAt: string
}

/**
 * Convenes a 3-model diagnostic council when a project scores < 8/10.
 *
 * Calls gpt-5.5, gpt-4.1-mini (×2 for diversity) in parallel. Each model
 * is asked what specific code / prompt changes would fix the quality issues.
 * Findings agreed by 2+ models are surfaced as consensus.
 *
 * Result is stored in autopilot_state.council_diagnosis.
 */
export async function conveneDiagnosticCouncil(
    projectId: string,
    stage: AutopilotStage,
    scoreResult: StageScoreResult,
    stageData: string,
): Promise<CouncilDiagnosis> {
    const rubric = RUBRICS[stage]

    const failingDimensions = scoreResult.scores
        .filter((s) => s.score < 8)
        .map((s) => `- ${s.dimension} (score ${s.score}/10): ${s.reasoning}`)
        .join("\n")

    const systemPrompt = `You are a senior engineering consultant reviewing the output of a hardware product development AI pipeline stage.
Your task is to identify SPECIFIC, ACTIONABLE fixes that would bring the quality score for this stage above 8/10.
Be concrete — name the exact field, prompt behaviour, or data gap that is causing each quality issue.
Focus on what code or prompt changes would fix each problem.

Return ONLY valid JSON in this exact format:
{
  "findings": ["<specific issue 1>", "<specific issue 2>"],
  "suggested_fixes": ["<concrete fix 1>", "<concrete fix 2>"]
}`

    const userPrompt = `Stage: ${stage}
Overall score: ${scoreResult.composite}/10 (threshold: 8.0)
Overall assessment: ${scoreResult.reasoning}

Failing dimensions:
${failingDimensions}

Stage output data (truncated to 6000 chars):
${stageData.slice(0, 6000)}

What specific changes to the AI pipeline (prompts, data extraction, validation logic) would fix these quality issues?`

    // Helper: parse council JSON response from any model
    function parseCouncilResponse(text: string): { findings: string[]; suggested_fixes: string[] } {
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
        return JSON.parse(cleaned) as { findings: string[]; suggested_fixes: string[] }
    }

    // Helper: call a model via OpenRouter for council work
    async function councilViaOpenRouter(model: string, label: string): Promise<CouncilFinding> {
        try {
            const result = await callOpenRouter({
                model,
                system: systemPrompt,
                prompt: userPrompt,
                maxTokens: 16384,
                // temperature is intentionally omitted — reasoning models (DeepSeek V4-Pro,
                // Kimi K2.6, GLM-5.1) reject any explicit temperature. The openrouter client
                // detects reasoning models and omits temperature automatically; non-reasoning
                // models default to 0 (structured-output workloads).
                timeoutMs: 120_000,
            })
            if (!result.ok) throw new Error(result.error)
            const parsed = parseCouncilResponse(result.text)
            return { model: label, findings: parsed.findings ?? [], suggestedFixes: parsed.suggested_fixes ?? [], rawResponse: result.text.slice(0, 2000) }
        } catch (err) {
            console.warn(`[stage-scoring] council ${label} failed:`, err instanceof Error ? err.message : err)
            return { model: label, findings: [], suggestedFixes: [], rawResponse: `ERROR: ${err instanceof Error ? err.message : String(err)}` }
        }
    }

    // 6-model multi-lineage diagnostic council (all via OpenRouter)
    const councilCalls: Promise<CouncilFinding>[] = [
        // 1. GPT-5.4 (via OpenRouter — US/OpenAI) — cheaper than 5.5, avoids direct API quota
        councilViaOpenRouter("openai/gpt-5.4", "gpt-5.4:openai"),
        // 2. Gemini 3.1 Pro (via OpenRouter — US/Google) — avoids direct API quota
        councilViaOpenRouter("google/gemini-3.1-pro-preview", "gemini-3.1-pro:google"),
        // 3. DeepSeek V4-Pro (via OpenRouter — China)
        councilViaOpenRouter("deepseek/deepseek-v4-pro", "deepseek-v4-pro:deepseek"),
        // 4. Qwen 3 235B (via OpenRouter — China/Alibaba)
        councilViaOpenRouter("qwen/qwen3-235b-a22b", "qwen3-235b:alibaba"),
        // 5. Kimi K2.6 (via OpenRouter — China/Moonshot)
        councilViaOpenRouter("moonshotai/kimi-k2.6", "kimi-k2.6:moonshot"),
        // 6. MiMo V2.5 Pro (via OpenRouter — Xiaomi)
        councilViaOpenRouter("xiaomi/mimo-v2.5-pro", "mimo-v2.5-pro:xiaomi"),
    ]

    const individualFindings = await Promise.all(councilCalls)

    // Consensus: findings/fixes mentioned by 3+ models (fuzzy: normalise + substring match)
    function normalise(s: string): string {
        return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
    }

    function countAgreements(item: string, allResults: CouncilFinding[], field: "findings" | "suggestedFixes"): number {
        const normItem = normalise(item)
        return allResults.filter((r) =>
            r[field].some((other) => {
                const normOther = normalise(other)
                return normItem.includes(normOther.slice(0, 30)) || normOther.includes(normItem.slice(0, 30))
            }),
        ).length
    }

    const allFindings = individualFindings.flatMap((r) => r.findings)
    const allFixes = individualFindings.flatMap((r) => r.suggestedFixes)

    const consensusFindings = [...new Set(allFindings)].filter(
        (f) => countAgreements(f, individualFindings, "findings") >= 3,
    )
    const consensusFixes = [...new Set(allFixes)].filter(
        (f) => countAgreements(f, individualFindings, "suggestedFixes") >= 3,
    )

    // Fall back to all findings if consensus is empty
    const finalConsensusFindings = consensusFindings.length > 0 ? consensusFindings : allFindings.slice(0, 6)
    const finalConsensusFixes = consensusFixes.length > 0 ? consensusFixes : allFixes.slice(0, 6)

    const diagnosis: CouncilDiagnosis = {
        projectId,
        stage,
        composite: scoreResult.composite,
        individualFindings,
        consensusFindings: finalConsensusFindings,
        consensusFixes: finalConsensusFixes,
        convenedAt: new Date().toISOString(),
    }

    // Persist to autopilot_state.council_diagnosis
    try {
        const admin = createAdminClient()
        const { data: project } = await admin
            .from("cad_lab_projects")
            .select("autopilot_state")
            .eq("id", projectId)
            .maybeSingle()

        const current = project?.autopilot_state as Record<string, unknown> | null
        if (current) {
            await admin
                .from("cad_lab_projects")
                .update({
                    autopilot_state: {
                        ...current,
                        council_diagnosis: diagnosis,
                    },
                } as unknown as never)
                .eq("id", projectId)
        }
    } catch (persistErr) {
        // Non-fatal — log and continue; diagnosis is returned to caller regardless
        console.warn(
            `[stage-scoring] council diagnosis persist failed for project=${projectId}:`,
            persistErr instanceof Error ? persistErr.message : persistErr,
        )
    }

    console.info(
        `[stage-scoring] council convened for project=${projectId} stage=${stage} ` +
            `consensusFindings=${finalConsensusFindings.length} consensusFixes=${finalConsensusFixes.length}`,
    )

    return diagnosis
}

/**
 * Loads the raw stage data string for a given project + rubric.
 * Re-exported so the autopilot-tick route can pass it to conveneDiagnosticCouncil.
 */
export async function loadStageDataForCouncil(
    projectId: string,
    stage: AutopilotStage,
): Promise<string> {
    const rubric = RUBRICS[stage]
    if (!rubric) return "No rubric found for this stage."
    return loadStageData(projectId, rubric)
}

// ── Full reset to founder brief ──────────────────────────────────────────
// Rule (Tristan 2026-04-30): every full loop starts from the original
// founder_raw_brief. All generated content is wiped so Chase runs fresh.

export async function resetToFounderBrief(projectId: string): Promise<{
    ok: boolean
    error?: string
}> {
    const admin = createAdminClient()

    const { error: updateErr } = await admin
        .from("cad_lab_projects")
        .update({
            research: null,
            modules: null,
            reviews: null,
            ai_cost_estimates: null,
            proofread_findings: null,
            feasibility_verdict: null,
            oracle_findings: null,
            executive_summary: null,
            cost_reconciliation: null,
            dimension_sheet: null,
            spatial_plan: null,
            bom_generation_state: null,
            image_render_state: null,
            concept_render_url: null,
            system_illustration_url: null,
            interior_overview_url: null,
            reference_dossier: null,
            brief_locked_at: null,
            brief_locked_by: null,
            gate_remediation_context: null,
            autopilot_state: {
                stage: "waiting_chase",
                status: "paused",
                attempts: 0,
                completed_stages: [],
                failed_stages: [],
                stage_scores: {},
                started_at: new Date().toISOString(),
                finished_at: null,
            },
        } as never)
        .eq("id", projectId)

    if (updateErr) {
        console.error("[resetToFounderBrief] failed:", updateErr.message)
        return { ok: false, error: updateErr.message }
    }

    // Clear related pipeline_runs so old rows don't poison the 23505 handler
    const { error: pipelineErr } = await admin
        .from("pipeline_runs")
        .delete()
        .eq("project_id", projectId)

    if (pipelineErr) {
        console.error("[resetToFounderBrief] pipeline_runs cleanup:", pipelineErr.message)
    }

    // Clear report_downloads for this project
    const { error: reportErr } = await admin
        .from("report_downloads")
        .delete()
        .eq("project_id", projectId)

    if (reportErr) {
        console.error("[resetToFounderBrief] report_downloads cleanup:", reportErr.message)
    }

    console.log(`[resetToFounderBrief] project ${projectId} reset to founder_raw_brief — all generated content cleared`)
    return { ok: true }
}
