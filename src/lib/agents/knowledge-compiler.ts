/**
 * @file knowledge-compiler.ts — Extracts reusable manufacturing knowledge from completed CAD Lab projects.
 *
 * @description Analyses completed CAD Lab projects (modules, metrics, design briefs) and uses Claude
 * to extract validated facts and metrics. Results are written to the specialist knowledge base
 * via upsertKnowledge so specialists benefit from accumulated project learnings.
 *
 * @related src/lib/agents/knowledge-base.ts — CRUD for specialist_knowledge_base
 * @related src/lib/cad-lab/failure-patterns.ts — failure pattern aggregation
 * @related src/actions/cad-lab.ts — CAD generation pipeline
 *
 * @security Uses createAdminClient() — bypasses RLS. Always scoped by foundry_id.
 */

import Anthropic from "@anthropic-ai/sdk"

import { createAdminClient } from "@/lib/supabase/admin"
import { upsertKnowledge } from "@/lib/agents/knowledge-base"
import type { KnowledgeType } from "@/lib/agents/knowledge-base"

// INTENT: Only "fact" and "metric" are relevant for compiled project knowledge.
// Preferences, decisions, relationships, goals come from conversations, not project data.
type CompilerKnowledgeType = Extract<KnowledgeType, "fact" | "metric">

export const VALID_TARGET_SPECIALISTS = [
    "vp-manufacturing",
    "vp-engineering",
    "cto",
    "vp-supply-chain",
    "finance-lead",
] as const

export interface KnowledgeCandidate {
    knowledgeType: "fact" | "metric"
    key: string
    value: string
    confidence: number
    targetSpecialists: string[]
    source: string
}

export interface CompiledKnowledge {
    projectId: string
    foundryId: string
    candidates: KnowledgeCandidate[]
    compiledAt: string
}

// DECISION: Module result shape matches what the CAD pipeline actually writes.
// The original fields (firstAttemptSuccess, visionScore) are from generation_metrics, not the module result.
interface ModuleResult {
    success?: boolean
    error?: string
    massGrams?: number
    volumeMm3?: number
    dfm?: {
        printable?: boolean
        issues?: Array<{ message: string; category: string; severity: string }>
        compatiblePrinters?: string[]
        estimatedMaterialG?: number
        estimatedPrintTimeMin?: number
    }
    codeLines?: number
    generationTime?: number
    modelUsed?: string
    // Legacy fields (from generation_metrics, rarely in module result)
    firstAttemptSuccess?: boolean
    repairAttempts?: number
    visionScore?: number
    validationWarnings?: string[]
    assumptions?: string[]
}

const SYSTEM_PROMPT = `You extract reusable manufacturing knowledge from completed CAD Lab projects.

Extract these categories:

1. VALIDATED FACTS (things that worked):
   Key format: "validated:{domain}:{process}:{topic}"
   Only for modules with firstAttemptSuccess=true or visionScore >= 7.

2. FAILURE LESSONS (things that broke):
   Key format: "failure-lesson:{domain}:{error_category}:{topic}"
   Only for modules that failed initially (firstAttemptSuccess=false).

3. DESIGN BRIEF OBSERVATIONS:
   Key format: "brief-observation:{domain}:{material}:{process}"
   Aggregate stats about how the brief settings performed.

Rules:
- Only extract knowledge SUPPORTED BY THE DATA. No speculation.
- Confidence: 0.95 if success=true + DFM printable + no critical issues, 0.85 if success=true, 0.75 if partial success, 0.65 single observation.
- Values under 200 chars each.
- Include project ID in each value.
- targetSpecialists: use IDs from this list: "vp-manufacturing", "vp-engineering", "cto", "vp-supply-chain", "finance-lead"
- knowledgeType: use "fact" for engineering knowledge, "metric" for cost/performance data.

Return a JSON array of objects with keys: knowledgeType, key, value, confidence, targetSpecialists
Return ONLY the JSON array — no markdown fences, no commentary.`

/**
 * Compile knowledge from a completed CAD Lab project.
 *
 * @param projectId - The project UUID to analyse
 * @returns Compiled knowledge with validated candidates
 * @throws If the project is not found or the Claude API call fails
 */
export async function compileProjectKnowledge(projectId: string): Promise<CompiledKnowledge> {
    const supabase = createAdminClient()

    // Step 1 — Fetch data
    // GOTCHA: cad_lab_projects has no 'industry_domain' column — domain is inferred from subject/metrics.
    // GOTCHA: 'modules' is a JSON column on cad_lab_projects, NOT a separate table.
    const { data: project, error: projectError } = await supabase
        .from("cad_lab_projects")
        .select("id, foundry_id, name, subject, modules, quality_ratings")
        .eq("id", projectId)
        .single()

    if (projectError || !project) {
        throw new Error(`[KnowledgeCompiler] Project not found: ${projectId}`)
    }

    const foundryId = project.foundry_id as string

    // DECISION: Modules are stored as JSON on the project row, not in a separate table.
    // Parse them into a workable array.
    interface ModuleEntry {
        id?: string
        name?: string
        purpose?: string
        status?: string
        result?: ModuleResult
    }

    const rawModules = (project.modules ?? []) as ModuleEntry[]
    const modules = rawModules.filter(m => m.status === "generated" || m.result)

    if (modules.length === 0) {
        return {
            projectId,
            foundryId,
            candidates: [],
            compiledAt: new Date().toISOString(),
        }
    }

    const { data: metrics } = await supabase
        .from("cad_lab_generation_metrics")
        .select("module_id, first_attempt_success, error_category, domain, vision_score, repair_attempts")
        .eq("project_id", projectId)

    // Step 2 — Build summary text
    // DECISION: No design_brief column; use subject as the project description.
    let summary = `PROJECT: ${project.name}\n`
    summary += `Subject: ${project.subject ?? "N/A"}\n`

    // Infer domain from metrics if available
    const domains = new Set((metrics ?? []).map(m => m.domain).filter(Boolean))
    summary += `Domains (from metrics): ${domains.size > 0 ? [...domains].join(", ") : "N/A"}\n\n`

    const totalModules = modules.length
    let firstAttemptSuccessCount = 0
    let visionScoreSum = 0
    let visionScoreCount = 0

    summary += `MODULES (${totalModules} with results):\n`
    for (const mod of modules) {
        const result = (mod.result ?? {}) as ModuleResult
        summary += `\n- Module: ${mod.name ?? mod.id ?? "unnamed"}\n`
        summary += `  Purpose: ${mod.purpose ?? "N/A"}\n`
        summary += `  success: ${result.success ?? "unknown"}\n`
        if (result.error) summary += `  error: ${result.error}\n`
        if (result.massGrams != null) summary += `  massGrams: ${result.massGrams}\n`
        if (result.volumeMm3 != null) summary += `  volumeMm3: ${result.volumeMm3}\n`
        if (result.codeLines != null) summary += `  codeLines: ${result.codeLines}\n`
        if (result.generationTime != null) summary += `  generationTimeMs: ${result.generationTime}\n`
        if (result.modelUsed) summary += `  modelUsed: ${result.modelUsed}\n`
        if (result.dfm) {
            summary += `  dfm.printable: ${result.dfm.printable ?? "unknown"}\n`
            if (result.dfm.issues && result.dfm.issues.length > 0) {
                summary += `  dfm.issues: ${result.dfm.issues.map(i => `[${i.severity}] ${i.message}`).join("; ")}\n`
            }
            if (result.dfm.compatiblePrinters) summary += `  dfm.compatiblePrinters: ${result.dfm.compatiblePrinters.join(", ")}\n`
            if (result.dfm.estimatedMaterialG != null) summary += `  dfm.estimatedMaterialG: ${result.dfm.estimatedMaterialG}\n`
            if (result.dfm.estimatedPrintTimeMin != null) summary += `  dfm.estimatedPrintTimeMin: ${result.dfm.estimatedPrintTimeMin}\n`
        }
        // Legacy fields if present
        if (result.firstAttemptSuccess != null) summary += `  firstAttemptSuccess: ${result.firstAttemptSuccess}\n`
        if (result.visionScore != null) summary += `  visionScore: ${result.visionScore}\n`

        if (result.firstAttemptSuccess) firstAttemptSuccessCount++
        if (result.visionScore != null) {
            visionScoreSum += result.visionScore
            visionScoreCount++
        }
    }

    if (metrics && metrics.length > 0) {
        summary += `\nMETRICS:\n`
        for (const m of metrics) {
            summary += `- module=${m.module_id}, domain=${m.domain ?? "N/A"}, first_attempt=${m.first_attempt_success}, error_category=${m.error_category ?? "none"}, vision_score=${m.vision_score ?? "N/A"}\n`
        }
    }

    const avgVision = visionScoreCount > 0 ? (visionScoreSum / visionScoreCount).toFixed(1) : "N/A"
    summary += `\nAGGREGATES: total_modules=${totalModules}, first_attempt_successes=${firstAttemptSuccessCount}, avg_vision_score=${avgVision}\n`

    // Step 3 — Send to Claude
    const anthropic = new Anthropic()
    let response: Anthropic.Message
    try {
        response = await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 2048,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: summary }],
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`[KnowledgeCompiler] Claude API error: ${message}`)
    }

    const textBlock = response.content.find((b) => b.type === "text")
    if (!textBlock || textBlock.type !== "text") {
        throw new Error("[KnowledgeCompiler] Claude returned no text content")
    }

    // Parse and validate
    // GOTCHA: Claude sometimes wraps JSON in markdown fences (```json ... ```) — strip them
    let rawCandidates: unknown[]
    try {
        let text = textBlock.text.trim()
        const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (fenceMatch) {
            text = fenceMatch[1].trim()
        }
        const parsed = JSON.parse(text)
        if (!Array.isArray(parsed)) {
            throw new Error("Response is not an array")
        }
        rawCandidates = parsed
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`[KnowledgeCompiler] Failed to parse Claude response: ${message}`)
    }

    const validTypes: ReadonlyArray<string> = ["fact", "metric"]
    const validSpecialists: ReadonlyArray<string> = VALID_TARGET_SPECIALISTS

    const candidates: KnowledgeCandidate[] = []
    for (const raw of rawCandidates) {
        if (typeof raw !== "object" || raw === null) {
            console.warn("[KnowledgeCompiler] Skipping non-object entry")
            continue
        }

        const entry = raw as Record<string, unknown>

        // Validate knowledgeType
        if (typeof entry.knowledgeType !== "string" || !validTypes.includes(entry.knowledgeType)) {
            console.warn(`[KnowledgeCompiler] Skipping entry with invalid knowledgeType: ${String(entry.knowledgeType)}`)
            continue
        }

        // Validate key and value
        if (typeof entry.key !== "string" || typeof entry.value !== "string") {
            console.warn("[KnowledgeCompiler] Skipping entry with non-string key/value")
            continue
        }

        // Validate confidence
        if (typeof entry.confidence !== "number" || entry.confidence < 0 || entry.confidence > 1) {
            console.warn(`[KnowledgeCompiler] Skipping entry with invalid confidence: ${String(entry.confidence)}`)
            continue
        }

        // Validate targetSpecialists
        if (!Array.isArray(entry.targetSpecialists)) {
            console.warn("[KnowledgeCompiler] Skipping entry with non-array targetSpecialists")
            continue
        }

        const filteredSpecialists = (entry.targetSpecialists as unknown[]).filter(
            (s): s is string => typeof s === "string" && validSpecialists.includes(s)
        )

        if (filteredSpecialists.length === 0) {
            console.warn("[KnowledgeCompiler] Skipping entry with no valid targetSpecialists")
            continue
        }

        candidates.push({
            knowledgeType: entry.knowledgeType as CompilerKnowledgeType,
            key: entry.key,
            value: entry.value,
            confidence: entry.confidence,
            targetSpecialists: filteredSpecialists,
            source: `cad-project:${projectId}`,
        })
    }

    return {
        projectId,
        foundryId,
        candidates,
        compiledAt: new Date().toISOString(),
    }
}

/**
 * Apply compiled knowledge to the specialist knowledge base.
 *
 * @param compiled - The compiled knowledge to apply
 * @returns Count of applied and skipped entries
 */
export async function applyCompiledKnowledge(
    compiled: CompiledKnowledge
): Promise<{ applied: number; skipped: number }> {
    let applied = 0
    let skipped = 0

    for (const candidate of compiled.candidates) {
        for (const specialistId of candidate.targetSpecialists) {
            try {
                await upsertKnowledge(compiled.foundryId, specialistId, {
                    knowledgeType: candidate.knowledgeType,
                    key: candidate.key,
                    value: candidate.value,
                    confidence: candidate.confidence,
                    source: candidate.source,
                })
                applied++
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                console.error(`[KnowledgeCompiler] Failed to upsert for ${specialistId}: ${message}`)
                skipped++
            }
        }
    }

    return { applied, skipped }
}
