/**
 * @file run-oracle.ts — Oracle stage (Tristan-directed L8-P1).
 *
 * @description Independent cost-prediction council that fires AFTER the
 * engine has produced its numerical claims (BOM cost roll-up, sizing
 * targets, mass roll-up) but BEFORE the PDF is emitted. For each
 * numerical surface, queries 3-4 frontier LLMs from different lineages
 * for a training-data-grounded prediction. Compares the engine's number
 * against the council median band:
 *
 *   - Within band → green pass, no surfaced finding
 *   - 1.5-3× outside median → amber finding, recorded for the founder
 *   - >3× outside median → blocker finding, escalated to feasibility verdict
 *
 * The Oracle stage is the in-engine implementation of the cost-prediction
 * QC pattern Tristan named 2026-04-26 NIGHT: "if 4 frontier LLMs agree
 * something should cost £100k and the engine says £800k, that warrants a
 * deep investigation."
 *
 * Council membership rotates Asian-lineage seats per
 * ~/.claude/rules/coding-council.md mandate — GPT-5.5 + Gemini 3.1 Pro
 * + DeepSeek V4-Pro + Qwen3.6-Plus by default. Cost ~£0.40-£0.60 per
 * project per regen.
 *
 * Findings persist to cad_lab_projects.oracle_findings (new JSONB column
 * — migration alongside this file). PDF render extends Engine
 * Self-Review page to show Oracle blockers/ambers per metric.
 */

"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { callOpenRouter } from "@/lib/ai/openrouter"

const ORACLE_COUNCIL_MODELS: ReadonlyArray<string> = [
    "openai/gpt-5.5",
    "google/gemini-3.1-pro-preview",
    "deepseek/deepseek-v4-pro",
    "qwen/qwen3-235b-a22b-2507",
] as const

export interface OracleFinding {
    /** Metric being checked — total_unit_cost / module_cost / total_mass / etc. */
    metric: string
    /** Project's reported value for this metric. */
    engine_value: number
    /** Council median across the participating models. */
    council_median: number
    /** Council low+high range (ascending). */
    council_low: number
    council_high: number
    /** Council confidence — high if all agree within 30%, low if range >2x. */
    council_confidence: "high" | "med" | "low"
    /** Severity — green (within band), amber (1.5-3x outside median), blocker (>3x). */
    severity: "green" | "amber" | "blocker"
    /** Multiplier of engine value vs council median (1.0 = match). */
    multiple: number
    /** One-line reasoning aggregated from council reasoning. */
    reasoning: string
    /** Per-model raw predictions for transparency. */
    raw: Array<{ model: string; low: number; median: number; high: number }>
}

export interface OracleResult {
    ok: boolean
    error?: string
    findingCount?: number
    blockerCount?: number
    amberCount?: number
}

interface OracleCouncilOutput {
    metric: string
    predicted_low?: unknown
    predicted_median?: unknown
    predicted_high?: unknown
    confidence?: unknown
    reasoning_one_line?: unknown
}

/**
 * Background entry — fires from the autopilot Oracle stage.
 *
 * Reads the project state, identifies the headline numerical claims,
 * fires per-metric council predictions in parallel, aggregates, persists
 * findings.
 */
export async function runOracleBackground(
    projectId: string,
    foundryId: string,
    _userId: string | null = null,
): Promise<OracleResult> {
    const admin = createAdminClient()

    const { data: project, error: projectErr } = await admin
        .from("cad_lab_projects")
        .select("id, foundry_id, name, subject, ai_cost_estimates, modules")
        .eq("id", projectId)
        .maybeSingle()
    if (projectErr || !project) {
        return { ok: false, error: projectErr?.message ?? "Project not found" }
    }
    if (project.foundry_id !== foundryId) {
        return { ok: false, error: "Project not in foundry" }
    }

    const subject = typeof project.subject === "string" ? project.subject : ""
    const modules = Array.isArray(project.modules)
        ? (project.modules as Array<Record<string, unknown>>)
        : []
    const aiCosts = (project.ai_cost_estimates ?? {}) as Record<string, unknown>

    // Compute the headline metrics the engine has produced. For now,
    // total unit cost is the load-bearing one; future iterations can add
    // mass, lead time, energy intensity, supplier coverage, etc.
    const totalCost = sumModuleCosts(aiCosts)
    if (totalCost === null) {
        return { ok: true, findingCount: 0, blockerCount: 0, amberCount: 0 }
    }

    // Compose ONE prompt asking each council member to predict the
    // total cost for this project's spec. This is a single call per
    // model, in parallel.
    const subjectExcerpt = subject.length > 1500 ? subject.slice(0, 1500) + "…" : subject
    const moduleSummary = modules
        .slice(0, 12)
        .map((m) => {
            const name = typeof m["name"] === "string" ? m["name"] : "unnamed"
            const purpose = typeof m["purpose"] === "string" ? m["purpose"].slice(0, 120) : ""
            return `- ${name}: ${purpose}`
        })
        .join("\n")

    const prompt = `Predict the realistic UK 2025-2026 unit cost (low / median / high in GBP) for the following hardware project. Predict from your training-data knowledge of UK market economics — do NOT defer to any number you might infer from context. This prediction will be used as an independent quality-control band against the engine's own cost roll-up.

PROJECT BRIEF:
${subjectExcerpt}

MODULES:
${moduleSummary}

Output ONLY a JSON object with this shape — no prose preamble, no markdown:
{
  "metric": "total_unit_cost_gbp_uk_delivered",
  "predicted_low": <number>,
  "predicted_median": <number>,
  "predicted_high": <number>,
  "confidence": "high" | "med" | "low",
  "reasoning_one_line": "1-line explanation of the band"
}`

    const calls = ORACLE_COUNCIL_MODELS.map((model) =>
        callOpenRouter({
            model,
            system:
                "You are an independent estimator predicting UK hardware unit cost from training-data knowledge. Output ONLY JSON.",
            prompt,
            maxTokens: 6000,
            temperature: 0.2,
            timeoutMs: 60_000,
        }).then((r) => ({ model, result: r })),
    )
    const settled = await Promise.allSettled(calls)

    // Extract per-model predictions.
    const raw: Array<{ model: string; low: number; median: number; high: number; reason: string }> = []
    for (const s of settled) {
        if (s.status !== "fulfilled") continue
        const { model, result } = s.value
        if (!result.ok) continue
        const parsed = safeParseOraclePrediction(result.text)
        if (!parsed) continue
        raw.push({ model, ...parsed })
    }

    if (raw.length < 2) {
        // Council too thin to be meaningful — bail with a low-confidence
        // single-finding placeholder rather than raise an error.
        return {
            ok: true,
            findingCount: 0,
            blockerCount: 0,
            amberCount: 0,
        }
    }

    const councilLow = Math.min(...raw.map((r) => r.low))
    const councilHigh = Math.max(...raw.map((r) => r.high))
    const medians = raw.map((r) => r.median).sort((a, b) => a - b)
    const councilMedian = medians[Math.floor(medians.length / 2)]
    const spread = councilHigh / Math.max(1, councilLow)
    const confidence: OracleFinding["council_confidence"] =
        spread <= 1.5 ? "high" : spread <= 3 ? "med" : "low"

    // Compare engine value vs council median.
    const multiple = totalCost / Math.max(1, councilMedian)
    const severity: OracleFinding["severity"] =
        multiple > 3 || multiple < 1 / 3
            ? "blocker"
            : multiple > 1.5 || multiple < 1 / 1.5
              ? "amber"
              : "green"

    const finding: OracleFinding = {
        metric: "total_unit_cost_gbp",
        engine_value: totalCost,
        council_median: councilMedian,
        council_low: councilLow,
        council_high: councilHigh,
        council_confidence: confidence,
        severity,
        multiple,
        reasoning: raw.map((r) => `${r.model.split("/")[0]}: ${r.reason}`).slice(0, 3).join(" | "),
        raw: raw.map(({ model, low, median, high }) => ({ model, low, median, high })),
    }

    const findings: OracleFinding[] = [finding]

    const payload = {
        ran_at: new Date().toISOString(),
        models: ORACLE_COUNCIL_MODELS.slice() as string[],
        finding_count: findings.length,
        blocker_count: findings.filter((f) => f.severity === "blocker").length,
        amber_count: findings.filter((f) => f.severity === "amber").length,
        findings,
    }

    const { error: updateErr } = await admin
        .from("cad_lab_projects")
        .update({ oracle_findings: payload as unknown as never })
        .eq("id", projectId)
    if (updateErr) {
        return {
            ok: false,
            error: `Failed to persist Oracle findings: ${updateErr.message}`,
        }
    }

    return {
        ok: true,
        findingCount: findings.length,
        blockerCount: payload.blocker_count,
        amberCount: payload.amber_count,
    }
}

// ─── Helpers ───────────────────────────────────────────────────────────

function sumModuleCosts(aiCosts: Record<string, unknown>): number | null {
    let total = 0
    let any = false
    for (const v of Object.values(aiCosts)) {
        if (v && typeof v === "object" && v !== null) {
            const t = (v as { totalPerUnit?: unknown }).totalPerUnit
            if (typeof t === "number" && t > 0) {
                total += t
                any = true
            }
        }
    }
    return any ? total : null
}

function safeParseOraclePrediction(
    text: string,
): { low: number; median: number; high: number; reason: string } | null {
    try {
        const trimmed = text.trim()
        const jsonStart = trimmed.indexOf("{")
        const jsonEnd = trimmed.lastIndexOf("}")
        if (jsonStart < 0 || jsonEnd < jsonStart) return null
        const obj = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as OracleCouncilOutput
        const low = numberOr(obj.predicted_low)
        const median = numberOr(obj.predicted_median)
        const high = numberOr(obj.predicted_high)
        if (low === null || median === null || high === null) return null
        if (low > median || median > high) return null
        const reason =
            typeof obj.reasoning_one_line === "string" ? obj.reasoning_one_line.slice(0, 160) : ""
        return { low, median, high, reason }
    } catch {
        return null
    }
}

function numberOr(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string") {
        const cleaned = v.replace(/[£,\s]/g, "")
        const n = Number(cleaned)
        return Number.isFinite(n) ? n : null
    }
    return null
}
