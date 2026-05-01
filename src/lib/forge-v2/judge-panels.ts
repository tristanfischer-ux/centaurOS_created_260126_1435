/**
 * @file judge-panels.ts — Multi-model judge panel system for stage scoring.
 *
 * @description Replaces single-LLM scoring with lineage-diverse judge panels.
 * High-risk stages get 3 judges, medium-risk get 2, low-risk get 1.
 * Consensus logic: final score = average; a finding is a BLOCKER if 2+
 * judges from DIFFERENT lineages flagged it; single-judge findings = WARNING.
 *
 * All calls go through callOpenRouter() — no Anthropic credits consumed.
 */

import { callOpenRouter } from "@/lib/ai/openrouter"
import type { OpenRouterCallResult } from "@/lib/ai/openrouter"

// ── Types ───────────────────────────────────────────────────────────────────

export type JudgeLineage = "xiaomi" | "xai" | "zhipu" | "google" | "moonshot"

export interface JudgeConfig {
    model: string
    role: string
    lineage: JudgeLineage
}

export interface Finding {
    severity: "blocker" | "warning" | "info"
    description: string
    suggested_fix: string
}

export interface JudgeResult {
    model: string
    role: string
    lineage: JudgeLineage
    score: number
    findings: Finding[]
    raw: string
}

export interface JudgePanelResult {
    score: number
    findings: Finding[]
    blockers: Finding[]
    warnings: Finding[]
    rawJudgeResults: JudgeResult[]
    judgeCount: number
    successfulJudgeCount: number
}

// ── Panel configuration ─────────────────────────────────────────────────────

const JUDGE_PANELS: Record<string, JudgeConfig[]> = {
    // High-risk (3 judges)
    waiting_chase: [
        { model: "xiaomi/mimo-v2.5-pro", role: "honest anchor", lineage: "xiaomi" },
        { model: "x-ai/grok-4.3", role: "honest adversary", lineage: "xai" },
        { model: "google/gemini-3.1-pro-preview", role: "depth seat", lineage: "google" },
    ],
    waiting_max: [
        { model: "x-ai/grok-4.3", role: "adversary", lineage: "xai" },
        { model: "z-ai/glm-5.1", role: "schema enforcer", lineage: "zhipu" },
        { model: "google/gemini-3.1-pro-preview", role: "depth seat", lineage: "google" },
    ],
    waiting_bom: [
        { model: "z-ai/glm-5.1", role: "schema enforcer", lineage: "zhipu" },
        { model: "x-ai/grok-4.3", role: "honest anchor", lineage: "xai" },
        { model: "xiaomi/mimo-v2.5-pro", role: "cross-reference", lineage: "xiaomi" },
    ],
    waiting_finn: [
        { model: "x-ai/grok-4.3", role: "adversary", lineage: "xai" },
        { model: "xiaomi/mimo-v2.5-pro", role: "honest anchor", lineage: "xiaomi" },
        { model: "google/gemini-3.1-pro-preview", role: "depth seat", lineage: "google" },
    ],
    waiting_fang: [
        { model: "google/gemini-3.1-pro-preview", role: "depth", lineage: "google" },
        { model: "x-ai/grok-4.3", role: "adversary", lineage: "xai" },
        { model: "moonshotai/kimi-k2.6", role: "multimodal", lineage: "moonshot" },
    ],
    running_fang_reviews: [
        { model: "google/gemini-3.1-pro-preview", role: "depth", lineage: "google" },
        { model: "x-ai/grok-4.3", role: "adversary", lineage: "xai" },
        { model: "moonshotai/kimi-k2.6", role: "multimodal", lineage: "moonshot" },
    ],
    // Medium-risk (2 judges)
    waiting_suppliers: [
        { model: "x-ai/grok-4.3", role: "adversary", lineage: "xai" },
        { model: "xiaomi/mimo-v2.5-pro", role: "honest anchor", lineage: "xiaomi" },
    ],
    matching_suppliers: [
        { model: "x-ai/grok-4.3", role: "adversary", lineage: "xai" },
        { model: "xiaomi/mimo-v2.5-pro", role: "honest anchor", lineage: "xiaomi" },
    ],
    waiting_proofreader: [
        { model: "xiaomi/mimo-v2.5-pro", role: "honest anchor", lineage: "xiaomi" },
        { model: "x-ai/grok-4.3", role: "adversary", lineage: "xai" },
    ],
    proofreading: [
        { model: "xiaomi/mimo-v2.5-pro", role: "honest anchor", lineage: "xiaomi" },
        { model: "x-ai/grok-4.3", role: "adversary", lineage: "xai" },
    ],
    // Low-risk (1 judge)
    waiting_pdf: [
        { model: "google/gemini-3.1-pro-preview", role: "depth", lineage: "google" },
    ],
    generating_pdf: [
        { model: "google/gemini-3.1-pro-preview", role: "depth", lineage: "google" },
    ],
}

// ── Core execution ──────────────────────────────────────────────────────────

/**
 * Run a judge panel for the given stage. Fires all judges in parallel,
 * aggregates scores, and applies cross-lineage consensus logic to findings.
 *
 * Falls back to a single DeepSeek call if ALL judges fail.
 */
export async function runJudgePanel(
    stageName: string,
    stageData: string,
    projectTitle: string,
    rubricPrompt: string,
): Promise<JudgePanelResult> {
    const panel = JUDGE_PANELS[stageName]

    // No panel configured — single DeepSeek fallback
    if (!panel || panel.length === 0) {
        return runSingleJudgeFallback(stageName, stageData, projectTitle, rubricPrompt)
    }

    const judgePrompt = buildJudgePrompt(rubricPrompt, stageData, projectTitle)

    // Fire all judges in parallel
    const settled = await Promise.allSettled(
        panel.map((judge) => callSingleJudge(judge, judgePrompt)),
    )

    const results: JudgeResult[] = []
    for (let i = 0; i < settled.length; i++) {
        const outcome = settled[i]
        if (outcome.status === "fulfilled" && outcome.value !== null) {
            results.push(outcome.value)
        } else {
            const reason =
                outcome.status === "rejected"
                    ? outcome.reason instanceof Error
                        ? outcome.reason.message
                        : String(outcome.reason)
                    : "parse failure"
            console.warn(
                `[judge-panels] Judge ${panel[i].model} (${panel[i].role}) failed: ${reason}`,
            )
        }
    }

    // ALL judges failed — fall back to single DeepSeek
    if (results.length === 0) {
        console.warn(
            `[judge-panels] All ${panel.length} judges failed for ${stageName} — falling back to DeepSeek`,
        )
        return runSingleJudgeFallback(stageName, stageData, projectTitle, rubricPrompt)
    }

    // Aggregate scores
    const avgScore =
        Math.round(
            (results.reduce((sum, r) => sum + r.score, 0) / results.length) * 100,
        ) / 100

    // Consensus logic: a finding is a BLOCKER if 2+ judges from DIFFERENT lineages flagged it
    const allFindings = results.flatMap((r) =>
        r.findings.map((f) => ({ ...f, lineage: r.lineage })),
    )

    const blockers: Finding[] = []
    const warnings: Finding[] = []
    const seen = new Set<string>()

    for (const finding of allFindings) {
        const normDesc = normalise(finding.description)
        if (seen.has(normDesc)) continue
        seen.add(normDesc)

        // Count how many distinct lineages flagged a similar finding
        const lineagesAgreeing = new Set<JudgeLineage>()
        for (const other of allFindings) {
            if (isSimilar(finding.description, other.description)) {
                lineagesAgreeing.add(other.lineage)
            }
        }

        const merged: Finding = {
            severity: lineagesAgreeing.size >= 2 ? "blocker" : "warning",
            description: finding.description,
            suggested_fix: finding.suggested_fix,
        }

        if (lineagesAgreeing.size >= 2) {
            blockers.push(merged)
        } else {
            warnings.push(merged)
        }
    }

    return {
        score: avgScore,
        findings: [...blockers, ...warnings],
        blockers,
        warnings,
        rawJudgeResults: results,
        judgeCount: panel.length,
        successfulJudgeCount: results.length,
    }
}

/**
 * Get the panel config for a stage (for metadata/logging).
 */
export function getJudgePanelConfig(stageName: string): JudgeConfig[] | null {
    return JUDGE_PANELS[stageName] ?? null
}

// ── Internal helpers ────────────────────────────────────────────────────────

function buildJudgePrompt(rubricPrompt: string, stageData: string, projectTitle: string): string {
    return `${rubricPrompt}

Project: ${projectTitle}

Stage data:
${stageData}

Return ONLY valid JSON in this exact format:
{
  "score": <number 1-10>,
  "findings": [
    { "severity": "blocker"|"warning"|"info", "description": "<specific issue>", "suggested_fix": "<concrete fix>" }
  ],
  "confident": <boolean>
}`
}

async function callSingleJudge(
    judge: JudgeConfig,
    prompt: string,
): Promise<JudgeResult | null> {
    const result = await callOpenRouter({
        model: judge.model,
        system: `You are a quality judge (role: ${judge.role}) for a hardware product development pipeline. Be strict but fair. Score 1-10 where 8+ means genuinely good. Do not grade inflate. Focus on substantive issues, not formatting.`,
        prompt,
        maxTokens: 16000,
        timeoutMs: 120_000,
    })

    if (!result.ok) {
        console.warn(`[judge-panels] ${judge.model} returned error: ${result.error}`)
        return null
    }

    const successResult = result as OpenRouterCallResult
    try {
        const cleaned = successResult.text
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim()
        const parsed = JSON.parse(cleaned) as {
            score?: number
            findings?: Array<{ severity?: string; description?: string; suggested_fix?: string }>
            confident?: boolean
        }

        const score = Math.max(1, Math.min(10, Math.round(parsed.score ?? 5)))
        const findings: Finding[] = (parsed.findings ?? [])
            .filter((f) => f.description)
            .map((f) => ({
                severity: (f.severity === "blocker" || f.severity === "warning" || f.severity === "info")
                    ? f.severity
                    : "info",
                description: f.description ?? "",
                suggested_fix: f.suggested_fix ?? "",
            }))

        return {
            model: judge.model,
            role: judge.role,
            lineage: judge.lineage,
            score,
            findings,
            raw: successResult.text.slice(0, 2000),
        }
    } catch (parseErr) {
        console.warn(
            `[judge-panels] Failed to parse ${judge.model} response:`,
            parseErr instanceof Error ? parseErr.message : parseErr,
        )
        return null
    }
}

async function runSingleJudgeFallback(
    stageName: string,
    stageData: string,
    projectTitle: string,
    rubricPrompt: string,
): Promise<JudgePanelResult> {
    const prompt = buildJudgePrompt(rubricPrompt, stageData, projectTitle)

    const result = await callOpenRouter({
        model: "deepseek/deepseek-chat",
        system: `You are a quality judge for a hardware product development pipeline. Be strict but fair. Score 1-10 where 8+ means genuinely good.`,
        prompt,
        maxTokens: 4096,
        timeoutMs: 30_000,
    })

    if (!result.ok) {
        throw new Error(`[judge-panels] Fallback DeepSeek also failed: ${result.error}`)
    }

    const successResult = result as OpenRouterCallResult
    try {
        const cleaned = successResult.text
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim()
        const parsed = JSON.parse(cleaned) as {
            score?: number
            findings?: Array<{ severity?: string; description?: string; suggested_fix?: string }>
        }

        const score = Math.max(1, Math.min(10, Math.round(parsed.score ?? 5)))
        const findings: Finding[] = (parsed.findings ?? [])
            .filter((f) => f.description)
            .map((f) => ({
                severity: (f.severity === "blocker" || f.severity === "warning" || f.severity === "info")
                    ? f.severity
                    : "info",
                description: f.description ?? "",
                suggested_fix: f.suggested_fix ?? "",
            }))

        return {
            score,
            findings,
            blockers: findings.filter((f) => f.severity === "blocker"),
            warnings: findings.filter((f) => f.severity === "warning"),
            rawJudgeResults: [{
                model: "deepseek/deepseek-chat",
                role: "fallback",
                lineage: "xiaomi" as JudgeLineage, // placeholder — single judge, lineage irrelevant
                score,
                findings,
                raw: successResult.text.slice(0, 2000),
            }],
            judgeCount: 1,
            successfulJudgeCount: 1,
        }
    } catch {
        throw new Error(`[judge-panels] Fallback DeepSeek response unparseable`)
    }
}

function normalise(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
}

function isSimilar(a: string, b: string): boolean {
    const na = normalise(a)
    const nb = normalise(b)
    // Substring match on first 40 chars — same heuristic as the diagnostic council
    return na.includes(nb.slice(0, 40)) || nb.includes(na.slice(0, 40))
}
