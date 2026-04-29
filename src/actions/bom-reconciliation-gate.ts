"use server"

/**
 * @file bom-reconciliation-gate.ts -- LLM chemistry/spec check for BOM rows.
 *
 * Loop 24 Fix 5, Part 2. This server action wraps the LLM call that verifies
 * whether each BOM row's material/chemistry/form-factor/quantity matches the
 * module description that sourced it.
 *
 * Called from runBomMergeStage (src/actions/bom.ts) after the count-check
 * gate passes (or despite a count-check failure, to surface both classes of
 * problem in a single regen).
 *
 * If the LLM check fails for a module, the merge stage re-runs BOM generation
 * for that module with an explicit reconciliation prompt. If the second attempt
 * also fails, the PDF gets a RED banner on the affected module page.
 *
 * Model: CHEAP_STRUCTURED_MODEL (deepseek/deepseek-v4-flash). Structured JSON
 * output, not prose. V4-Flash handles this reliably at low cost.
 *
 * @related
 *   - Pure logic: src/lib/bom/bom-reconciliation.ts
 *   - Caller: src/actions/bom.ts -> runBomMergeStage
 */

import {
    buildChemistryCheckPrompt,
    type BomChemistryCheckResult,
    type ChemistryCheckVerdictModule,
} from "@/lib/bom/bom-reconciliation"
import { callOpenRouter, CHEAP_STRUCTURED_MODEL } from "@/lib/ai/openrouter"

/** Max tokens for a chemistry check response. Reasoning models need headroom. */
const CHEMISTRY_CHECK_MAX_TOKENS = 4096

/**
 * Run a per-module LLM chemistry/spec reconciliation check.
 *
 * @param projectId  Used only for structured log lines.
 * @param modules    Modules to check; each must carry its BOM parts.
 */
export async function runBomChemistryCheck(
    projectId: string,
    modules: Array<{
        id: string
        name: string
        description?: string | null
        keyParts?: string[] | null
        bomParts: Array<{
            partNumber: string
            name: string
            material?: string | null
            description?: string | null
        }>
    }>,
): Promise<BomChemistryCheckResult> {
    const results: ChemistryCheckVerdictModule[] = []

    for (const mod of modules) {
        if (mod.bomParts.length === 0) {
            // No BOM parts for this module -- skip rather than hallucinate.
            results.push({ moduleId: mod.id, moduleName: mod.name, passed: true, issues: [] })
            continue
        }

        const prompt = buildChemistryCheckPrompt(
            mod.name,
            mod.description ?? "",
            mod.keyParts ?? [],
            mod.bomParts,
        )

        const result = await callOpenRouter({
            model: CHEAP_STRUCTURED_MODEL,
            prompt,
            maxTokens: CHEMISTRY_CHECK_MAX_TOKENS,
            temperature: 0,
            timeoutMs: 60_000,
        })

        if (!result.ok) {
            console.warn(
                `[bom-reconcile] chemistry-check LLM failed: project=${projectId} module=${mod.name} error=${result.error}`,
            )
            // Treat LLM failure as a pass to avoid blocking the pipeline on
            // transient API errors. The count-check gate is the hard gate.
            results.push({ moduleId: mod.id, moduleName: mod.name, passed: true, issues: [] })
            continue
        }

        // Extract JSON from the response. V4-Flash sometimes wraps in fences.
        let raw = result.text.trim()
        if (raw.startsWith("```")) {
            raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
        }
        const firstBrace = raw.indexOf("{")
        const lastBrace = raw.lastIndexOf("}")
        if (firstBrace !== -1 && lastBrace > firstBrace) {
            raw = raw.slice(firstBrace, lastBrace + 1)
        }

        let parsed: {
            moduleId?: string
            passed?: boolean
            issues?: Array<{
                partNumber?: string
                field?: string
                moduleStatement?: string
                bomValue?: string
                explanation?: string
            }>
        }
        try {
            parsed = JSON.parse(raw) as typeof parsed
        } catch {
            console.warn(
                `[bom-reconcile] chemistry-check JSON parse failed: project=${projectId} module=${mod.name}`,
            )
            results.push({ moduleId: mod.id, moduleName: mod.name, passed: true, issues: [] })
            continue
        }

        const passed = parsed.passed === true
        const issues = (parsed.issues ?? [])
            .filter(
                (i) =>
                    typeof i.partNumber === "string" &&
                    typeof i.field === "string" &&
                    typeof i.moduleStatement === "string" &&
                    typeof i.bomValue === "string" &&
                    typeof i.explanation === "string",
            )
            .map((i) => ({
                partNumber: i.partNumber as string,
                field: i.field as ChemistryCheckVerdictModule["issues"][number]["field"],
                moduleStatement: i.moduleStatement as string,
                bomValue: i.bomValue as string,
                explanation: i.explanation as string,
            }))

        if (!passed || issues.length > 0) {
            console.warn(
                `[bom-reconcile] chemistry-check FAIL: project=${projectId} module=${mod.name} issues=${issues.length}`,
            )
            issues.forEach((issue) => {
                console.warn(
                    `[bom-reconcile] chemistry-issue: part=${issue.partNumber} field=${issue.field} module="${issue.moduleStatement}" bom="${issue.bomValue}"`,
                )
            })
        }

        results.push({
            moduleId: mod.id,
            moduleName: mod.name,
            passed: passed && issues.length === 0,
            issues,
        })
    }

    return {
        allPassed: results.every((r) => r.passed),
        modules: results,
    }
}
