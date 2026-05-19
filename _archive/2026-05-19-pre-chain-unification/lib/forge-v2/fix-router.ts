/**
 * @file fix-router.ts — Role 3: Coding Fix Router
 *
 * When judge panels identify BLOCKER findings in stage output, this router
 * classifies fix complexity, dispatches the right coding model, and produces
 * corrected stage data that can be written back to the database.
 *
 * Routing table (from STAGE-JUDGE-PANELS-BRIEF.md):
 *   complex_multifile  → Gemini 3.1 Pro  (Coding 56, IFBench 77%)
 *   standard_single    → Gemini 3.1 Pro  (proxy for Sonnet — no OpenRouter tool access)
 *   spec_precise       → MiMo V2.5 Pro   (IFBench 80%, non-hallucination 75%, follows spec without fabricating)
 *   bulk_mechanical    → DeepSeek V4-Flash ($0.07/M, fine for template changes)
 *   high_stakes        → GPT-5.5         (Coding 59, cross-checked by MiMo V2.5 Pro)
 */

import { callOpenRouter } from "@/lib/ai/openrouter"
import type { OpenRouterCallResult } from "@/lib/ai/openrouter"
import type { Finding, JudgePanelResult } from "@/lib/forge-v2/judge-panels"

// ── Types ───────────────────────────────────────────────────────────────────

export type FixComplexity =
    | "complex_multifile"
    | "standard_single"
    | "spec_precise"
    | "bulk_mechanical"
    | "high_stakes"

export interface FixRouteConfig {
    model: string
    maxTokens: number
    crossCheck?: string
}

export interface FixLogEntry {
    finding: string
    complexity: FixComplexity
    model: string
    applied: boolean
    crossChecked?: boolean
    crossCheckPassed?: boolean
    reason?: string
}

export interface FixRouterResult {
    fixesApplied: number
    fixesSkipped: number
    crossChecksPassed: number
    crossChecksFailed: number
    correctedOutput?: unknown
    log: FixLogEntry[]
}

// ── Routing table ───────────────────────────────────────────────────────────

const FIX_ROUTING: Record<FixComplexity, FixRouteConfig> = {
    complex_multifile: {
        model: "google/gemini-3.1-pro-preview",
        maxTokens: 16000,
    },
    standard_single: {
        model: "google/gemini-3.1-pro-preview",
        maxTokens: 16000,
    },
    spec_precise: {
        model: "xiaomi/mimo-v2.5-pro",
        maxTokens: 16000,
    },
    bulk_mechanical: {
        model: "deepseek/deepseek-v4-flash",
        maxTokens: 16000,
    },
    high_stakes: {
        model: "openai/gpt-5.5",
        maxTokens: 16000,
        crossCheck: "xiaomi/mimo-v2.5-pro",
    },
}

// ── Data column mapping (dataQuery → DB column for write-back) ──────────────

export const DATA_QUERY_TO_COLUMN: Record<string, { table: string; column: string; idColumn: string }> = {
    research: { table: "cad_lab_projects", column: "research", idColumn: "id" },
    modules: { table: "cad_lab_projects", column: "modules", idColumn: "id" },
    dimension_sheet: { table: "cad_lab_projects", column: "dimension_sheet", idColumn: "id" },
    layout: { table: "cad_lab_projects", column: "layout_data", idColumn: "id" },
    ai_cost_estimates: { table: "cad_lab_projects", column: "ai_cost_estimates", idColumn: "id" },
    supplier_matches: { table: "cad_lab_projects", column: "supplier_shortlist", idColumn: "id" },
    fang_reviews: { table: "cad_lab_projects", column: "fang_reviews", idColumn: "id" },
    proofread_findings: { table: "cad_lab_projects", column: "proofread_findings", idColumn: "id" },
}

// ── Classification ──────────────────────────────────────────────────────────

const HIGH_STAKES_KEYWORDS = [
    "auth", "schema", "migration", "security", "rls", "permission",
    "credential", "encryption", "token", "secret",
]

const COMPLEX_KEYWORDS = [
    "multiple files", "cross-file", "architectural", "refactor",
    "cross-module", "cross-stage", "restructure", "schema change",
]

const PRECISE_KEYWORDS = [
    "change to", "replace with", "set to", "update value",
    "specific line", "exact value", "rename",
]

const BULK_KEYWORDS = [
    "template", "config", "repetitive", "bulk", "boilerplate",
    "formatting", "consistent", "standardise",
]

export function classifyFixComplexity(finding: Finding): FixComplexity {
    const text = `${finding.description} ${finding.suggested_fix}`.toLowerCase()

    if (HIGH_STAKES_KEYWORDS.some((kw) => text.includes(kw))) {
        return "high_stakes"
    }
    if (COMPLEX_KEYWORDS.some((kw) => text.includes(kw))) {
        return "complex_multifile"
    }
    if (PRECISE_KEYWORDS.some((kw) => text.includes(kw))) {
        return "spec_precise"
    }
    if (BULK_KEYWORDS.some((kw) => text.includes(kw))) {
        return "bulk_mechanical"
    }
    return "standard_single"
}

// ── Core fix router ─────────────────────────────────────────────────────────

export async function routeAndApplyFixes(
    panelResult: JudgePanelResult,
    stageContext: {
        projectId: string
        stage: string
        stageData: string
        dataQuery: string
    },
): Promise<FixRouterResult> {
    const log: FixLogEntry[] = []
    let fixesApplied = 0
    let fixesSkipped = 0
    let crossChecksPassed = 0
    let crossChecksFailed = 0

    // Only auto-fix BLOCKERs (2+ judges from different lineages agreed)
    const blockersToFix = panelResult.blockers
    const warningsSkipped = panelResult.warnings

    // Log skipped warnings
    for (const w of warningsSkipped) {
        fixesSkipped++
        log.push({
            finding: w.description,
            complexity: classifyFixComplexity(w),
            model: "none",
            applied: false,
            reason: "WARNING — single-judge finding, not auto-applied",
        })
    }

    if (blockersToFix.length === 0) {
        return { fixesApplied, fixesSkipped, crossChecksPassed, crossChecksFailed, log }
    }

    // Build a combined fix prompt with ALL blocker findings
    const blockerSummary = blockersToFix
        .map((b, i) => `${i + 1}. [${b.severity.toUpperCase()}] ${b.description}\n   Suggested fix: ${b.suggested_fix}`)
        .join("\n\n")

    // Classify by the most complex finding
    const complexities = blockersToFix.map(classifyFixComplexity)
    const complexityPriority: FixComplexity[] = [
        "high_stakes", "complex_multifile", "standard_single", "spec_precise", "bulk_mechanical",
    ]
    const highestComplexity = complexityPriority.find((c) => complexities.includes(c)) ?? "standard_single"
    const route = FIX_ROUTING[highestComplexity]

    console.info(
        `[fix-router] ${blockersToFix.length} BLOCKER findings for ${stageContext.stage}. ` +
        `Routing to ${route.model} (complexity: ${highestComplexity})`,
    )

    // Call the coding model to produce corrected output
    const fixPrompt = buildFixPrompt(stageContext, blockerSummary)
    const fixResult = await callOpenRouter({
        model: route.model,
        system: buildFixSystemPrompt(stageContext.stage),
        prompt: fixPrompt,
        maxTokens: route.maxTokens,
        timeoutMs: 120_000,
    })

    if (!fixResult.ok) {
        console.warn(`[fix-router] Fix model ${route.model} failed: ${fixResult.error}`)
        for (const b of blockersToFix) {
            log.push({
                finding: b.description,
                complexity: highestComplexity,
                model: route.model,
                applied: false,
                reason: `Fix model failed: ${fixResult.error}`,
            })
        }
        return { fixesApplied, fixesSkipped, crossChecksPassed, crossChecksFailed, log }
    }

    const successResult = fixResult as OpenRouterCallResult
    let correctedOutput: unknown

    try {
        const cleaned = successResult.text
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim()
        correctedOutput = JSON.parse(cleaned)
    } catch {
        console.warn(`[fix-router] Fix model ${route.model} returned unparseable JSON`)
        for (const b of blockersToFix) {
            log.push({
                finding: b.description,
                complexity: highestComplexity,
                model: route.model,
                applied: false,
                reason: "Fix model returned unparseable output",
            })
        }
        return { fixesApplied, fixesSkipped, crossChecksPassed, crossChecksFailed, log }
    }

    // Cross-check for high-stakes fixes
    if (route.crossCheck) {
        console.info(`[fix-router] Cross-checking ${route.model} fix with ${route.crossCheck}`)
        const crossCheckResult = await callOpenRouter({
            model: route.crossCheck,
            system: "You are an honest code reviewer. Check whether the proposed fix is correct, safe, and complete. Return JSON: { \"approved\": boolean, \"concerns\": string[] }",
            prompt: `Original data:\n${stageContext.stageData.slice(0, 4000)}\n\nBlocker findings:\n${blockerSummary}\n\nProposed corrected output:\n${JSON.stringify(correctedOutput, null, 2).slice(0, 8000)}\n\nIs this fix correct and safe to apply?`,
            maxTokens: 4096,
            timeoutMs: 60_000,
        })

        if (crossCheckResult.ok) {
            const ccResult = crossCheckResult as OpenRouterCallResult
            try {
                const ccCleaned = ccResult.text
                    .replace(/```json\n?/g, "")
                    .replace(/```\n?/g, "")
                    .trim()
                const ccParsed = JSON.parse(ccCleaned) as { approved?: boolean; concerns?: string[] }

                if (ccParsed.approved) {
                    crossChecksPassed++
                    console.info(`[fix-router] Cross-check PASSED by ${route.crossCheck}`)
                } else {
                    crossChecksFailed++
                    console.warn(
                        `[fix-router] Cross-check FAILED by ${route.crossCheck}: ` +
                        (ccParsed.concerns ?? []).join("; "),
                    )
                    for (const b of blockersToFix) {
                        log.push({
                            finding: b.description,
                            complexity: highestComplexity,
                            model: route.model,
                            applied: false,
                            crossChecked: true,
                            crossCheckPassed: false,
                            reason: `Cross-check failed: ${(ccParsed.concerns ?? []).join("; ")}`,
                        })
                    }
                    return {
                        fixesApplied,
                        fixesSkipped,
                        crossChecksPassed,
                        crossChecksFailed,
                        log,
                    }
                }
            } catch {
                console.warn(`[fix-router] Cross-check response unparseable — treating as failed`)
                crossChecksFailed++
                for (const b of blockersToFix) {
                    log.push({
                        finding: b.description,
                        complexity: highestComplexity,
                        model: route.model,
                        applied: false,
                        crossChecked: true,
                        crossCheckPassed: false,
                        reason: "Cross-check response unparseable",
                    })
                }
                return {
                    fixesApplied,
                    fixesSkipped,
                    crossChecksPassed,
                    crossChecksFailed,
                    log,
                }
            }
        } else {
            console.warn(`[fix-router] Cross-check model ${route.crossCheck} failed — skipping fix`)
            crossChecksFailed++
            for (const b of blockersToFix) {
                log.push({
                    finding: b.description,
                    complexity: highestComplexity,
                    model: route.model,
                    applied: false,
                    crossChecked: true,
                    crossCheckPassed: false,
                    reason: "Cross-check model unreachable",
                })
            }
            return {
                fixesApplied,
                fixesSkipped,
                crossChecksPassed,
                crossChecksFailed,
                log,
            }
        }
    }

    // All checks passed — mark findings as fixed
    fixesApplied = blockersToFix.length
    for (const b of blockersToFix) {
        log.push({
            finding: b.description,
            complexity: highestComplexity,
            model: route.model,
            applied: true,
            crossChecked: !!route.crossCheck,
            crossCheckPassed: route.crossCheck ? true : undefined,
        })
    }

    console.info(
        `[fix-router] Applied ${fixesApplied} fixes via ${route.model}` +
        (route.crossCheck ? ` (cross-checked by ${route.crossCheck})` : ""),
    )

    return {
        fixesApplied,
        fixesSkipped,
        crossChecksPassed,
        crossChecksFailed,
        correctedOutput,
        log,
    }
}

// ── Prompt builders ─────────────────────────────────────────────────────────

function buildFixSystemPrompt(stage: string): string {
    return `You are a specialist data-quality fixer for a hardware product development pipeline.
Your job: take stage output data that has been flagged with quality issues by a multi-model judge panel,
and produce a CORRECTED version of the data that addresses all flagged issues.

Stage: ${stage}

Rules:
- Return ONLY valid JSON — the corrected version of the stage data
- Preserve ALL existing correct data — only fix what the judges flagged
- Add missing sections/fields that the judges identified as absent
- Do not fabricate data — use reasonable estimates clearly marked as estimates
- If a finding says "missing sensitivity analysis", ADD a sensitivity_analysis section with plausible data
- If a finding says "missing benchmarks", ADD a benchmark_grounding section with industry references
- Keep the same JSON structure as the input — add fields, don't restructure`
}

function buildFixPrompt(
    stageContext: { stage: string; stageData: string },
    blockerSummary: string,
): string {
    return `The following stage output was scored below the quality threshold by a multi-model judge panel.
Fix ALL the issues listed below and return the complete corrected JSON.

STAGE: ${stageContext.stage}

BLOCKER FINDINGS (must be fixed):
${blockerSummary}

CURRENT STAGE DATA:
${stageContext.stageData}

Return the COMPLETE corrected JSON. Preserve all existing correct data. Fix only what is flagged.`
}
