/**
 * @file run-proofreader.ts — Engine self-review (Phase 1).
 *
 * @description Single-pass fact-check on the assembled project state
 * before PDF emission. Catches: hallucinated standards (e.g. "United
 * Laboratories"), brief-vs-sizing contradictions, math errors in cost
 * waterfall, missing units, citation failures, suppliers below
 * threshold ranked as candidates.
 *
 * Phase 1 scope: append findings to `cad_lab_projects.proofread_findings`
 * for the PDF "Engine self-review" appendix to render. NO auto-correction
 * yet (that's Phase 3). NO image vision yet (that's Phase 2).
 *
 * Cost: ~£0.015/project (one V4-Pro call, ~8K input + 2K output tokens
 * at $0.55/$2.20 per M). Cheaper than Anthropic Haiku at any tier per
 * Tristan's 2026-04-25 NIGHT cost-pivot directive.
 *
 * @related
 *   - Migration: cad_lab_projects.proofread_findings (added 2026-04-25 NIGHT)
 *   - PDF appendix: src/actions/export-project-pdf.tsx — renders findings
 *   - Stage config: src/lib/forge-v2/stage-config.ts — "proofreading" stage
 *   - OR wrapper: src/lib/ai/openrouter.ts (callOpenRouter)
 */

"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import {
    callOpenRouter,
    MID_STRUCTURED_MODEL,
    CHEAP_PROSE_MODEL,
} from "@/lib/ai/openrouter"

/**
 * V4-Pro is the preferred proofreader (frontier reasoning at half-Haiku
 * cost). Loop 2 regen revealed it 429s frequently from upstream. We
 * fall back to Gemini 2.5 Flash on failure — same JSON discipline,
 * different lineage, ~10× cheaper but still well-suited to fact-check.
 * Both run via OpenRouter so the OPENROUTER_API_KEY covers both.
 */
const PROOFREADER_MODELS: ReadonlyArray<string> = [
    MID_STRUCTURED_MODEL, // deepseek/deepseek-v4-pro
    CHEAP_PROSE_MODEL,    // google/gemini-2.5-flash
] as const

export interface ProofreaderResult {
    ok: boolean
    error?: string
    findingCount?: number
    blockerCount?: number
}

export interface ProofreadFinding {
    section: string
    severity: "cosmetic" | "content" | "blocker"
    location: string
    issue: string
    suggested_fix: string
    confidence: "high" | "medium" | "low"
}

export interface ProofreadFindings {
    ran_at: string
    model: string
    cost_pence: number
    finding_count: number
    blocker_count: number
    findings: ProofreadFinding[]
}

/** Background entry — called from the autopilot fire endpoint. */
export async function runProofreaderBackground(
    projectId: string,
    foundryId: string,
    _userId: string | null = null,
): Promise<ProofreaderResult> {
    const admin = createAdminClient()

    const { data: project, error: projectErr } = await admin
        .from("cad_lab_projects")
        .select(
            "id, foundry_id, name, subject, design_revision, brief_locked_at, " +
                "research, modules, dimension_sheet, spatial_plan, reviews, " +
                "result, system_illustration_url",
        )
        .eq("id", projectId)
        .maybeSingle()
    if (projectErr || !project) {
        return { ok: false, error: projectErr?.message ?? "Project not found" }
    }
    if (project.foundry_id !== foundryId) {
        return { ok: false, error: "Project not in foundry" }
    }

    // Pull supplier shortlist + parts in parallel.
    const [shortlistRes, partsRes] = await Promise.all([
        admin
            .from("forge_supplier_shortlist")
            .select(
                "supplier_id, supplier_name, module_ids, matched_part_numbers, project_synthesis, best_match_score, all_match_reasons",
            )
            .eq("project_id", projectId),
        admin
            .from("parts")
            .select(
                "part_number, name, source_module_id, process, material, mass_kg, estimated_unit_cost_gbp, is_purchased",
            )
            .eq("cad_lab_project_id", projectId)
            .order("part_number", { ascending: true }),
    ])
    const shortlist = shortlistRes.data ?? []
    const parts = partsRes.data ?? []

    const research = project.research as Record<string, unknown> | null
    const modules = (Array.isArray(project.modules) ? project.modules : []) as Array<
        Record<string, unknown>
    >
    const reviews = project.reviews as Record<string, unknown> | null
    const dimensionSheet = project.dimension_sheet as Record<string, unknown> | null
    const spatialPlan = project.spatial_plan as Record<string, unknown> | null
    const finnResult = project.result as Record<string, unknown> | null

    // Compose a structured project-state digest small enough to fit a
    // single LLM call but rich enough to surface cross-section errors.
    const sections = composeSections({
        projectName: typeof project.name === "string" ? project.name : "Project",
        subject: typeof project.subject === "string" ? project.subject : "",
        research,
        modules,
        dimensionSheet,
        spatialPlan,
        reviews,
        finnResult,
        parts,
        shortlist,
    })

    const systemPrompt =
        "You are an engineering proofreader. You read an auto-generated " +
        "engineering report's structured state and surface FACTUAL ERRORS, " +
        "INTERNAL CONTRADICTIONS, HALLUCINATED STANDARDS, MATH ERRORS, and " +
        "CITATION FAILURES. You do NOT critique writing style, completeness, " +
        "or strategic decisions — you check whether what is on the page is " +
        "TRUE and CONSISTENT.\n\n" +
        "Output STRICTLY a JSON object:\n" +
        "{ \"findings\": [ { \"section\": \"brief|regulatory|sizing|modules|bom|cost|suppliers|risks|cross-section\", " +
        "\"severity\": \"cosmetic|content|blocker\", \"location\": \"where in the report (e.g. 'Module 3, Container Enclosure, KEY PARTS')\", " +
        "\"issue\": \"what is wrong\", \"suggested_fix\": \"what it should say or what to do\", " +
        "\"confidence\": \"high|medium|low\" } ] }\n\n" +
        "SEVERITY RULES:\n" +
        " - blocker: founder cannot use this report; sized for wrong target, fabricated standard, brief contradiction\n" +
        " - content: wrong but not blocking (incorrect citation, low-confidence supplier listed without caveat)\n" +
        " - cosmetic: typo, formatting, label mismatch\n\n" +
        "CONFIDENCE RULES:\n" +
        " - high: you can prove it from the structured state alone\n" +
        " - medium: domain knowledge says it's wrong, would need a vendor/standard lookup to confirm\n" +
        " - low: smells off but you'd want a human to check\n\n" +
        "Do NOT hallucinate findings. If everything looks consistent, return { \"findings\": [] }.\n" +
        "Do NOT propose stylistic improvements. Do NOT critique the brief itself.\n" +
        "Output ONLY the JSON object — no markdown, no preamble."

    const userPrompt = sections

    // Try each model in priority order. If V4-Pro rate-limits or
    // 5xx-fails, fall through to Gemini 2.5 Flash. The proofreader is
    // non-blocking (the fire-endpoint always advances the stage), but
    // we still want findings when possible. Returning silently with
    // `result=null` collapses to an empty findings array in the column.
    let result: Awaited<ReturnType<typeof callOpenRouter>> | null = null
    let lastError: string | null = null
    for (const model of PROOFREADER_MODELS) {
        const attempt = await callOpenRouter({
            model,
            system: systemPrompt,
            prompt: userPrompt,
            maxTokens: 16384,
            temperature: 0.1,
            timeoutMs: 90_000,
        })
        if (attempt.ok) {
            result = attempt
            break
        }
        lastError = attempt.error
        if (!attempt.retriable) {
            // Hard failure (auth, bad request, etc.) — try next model.
            continue
        }
        // Retriable (429 / 5xx) — fall through to next model.
        console.warn(
            `[run-proofreader] ${model} retriable error: ${attempt.error} — falling back`,
        )
    }
    if (!result || !result.ok) {
        return {
            ok: false,
            error: `All proofreader models failed: ${lastError ?? "unknown"}`,
        }
    }

    let findings: ProofreadFinding[] = []
    try {
        const parsed = JSON.parse(extractJson(result.text)) as { findings?: unknown }
        if (Array.isArray(parsed.findings)) {
            findings = parsed.findings
                .filter((f): f is ProofreadFinding =>
                    typeof f === "object" && f !== null && typeof (f as ProofreadFinding).section === "string",
                )
                .slice(0, 50) // cap to keep the appendix readable
        }
    } catch (err) {
        // Soft fail — log and continue. Better to ship a PDF without
        // findings than to wedge the chain on a JSON parse miss.
        console.warn(
            "[run-proofreader] JSON parse failed:",
            err instanceof Error ? err.message : err,
        )
        findings = []
    }

    const blockerCount = findings.filter((f) => f.severity === "blocker").length
    // Rough cost estimate: V4-Pro ~$0.55/M input, $2.20/M output.
    // Convert USD → GBP-pence at 1 USD ≈ 80p. Gives ~3p per typical run.
    const usdEstimate =
        (result.inputTokens / 1_000_000) * 0.55 +
        (result.outputTokens / 1_000_000) * 2.2
    const costPence = Math.round(usdEstimate * 80)

    const payload: ProofreadFindings = {
        ran_at: new Date().toISOString(),
        model: result.modelUsed,
        cost_pence: costPence,
        finding_count: findings.length,
        blocker_count: blockerCount,
        findings,
    }

    const { error: updateErr } = await admin
        .from("cad_lab_projects")
        .update({ proofread_findings: payload as unknown as never })
        .eq("id", projectId)
    if (updateErr) {
        return {
            ok: false,
            error: `Failed to persist findings: ${updateErr.message}`,
        }
    }

    return {
        ok: true,
        findingCount: findings.length,
        blockerCount,
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function extractJson(text: string): string {
    const trimmed = text.trim()
    if (trimmed.startsWith("```")) {
        const stripped = trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
        return stripped
    }
    const firstBrace = trimmed.indexOf("{")
    const lastBrace = trimmed.lastIndexOf("}")
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        return trimmed.slice(firstBrace, lastBrace + 1)
    }
    return trimmed
}

interface ComposeInput {
    projectName: string
    subject: string
    research: Record<string, unknown> | null
    modules: Array<Record<string, unknown>>
    dimensionSheet: Record<string, unknown> | null
    spatialPlan: Record<string, unknown> | null
    reviews: Record<string, unknown> | null
    finnResult: Record<string, unknown> | null
    parts: Array<Record<string, unknown>>
    shortlist: Array<Record<string, unknown>>
}

function composeSections(p: ComposeInput): string {
    const out: string[] = []
    out.push(`# PROJECT: ${p.projectName}`)
    out.push(`Subject: ${p.subject || "(none)"}`)
    out.push("")

    // Brief
    const brief = (p.research?.designBrief as Record<string, unknown> | undefined) ?? null
    if (brief) {
        const briefText =
            typeof p.research?.report === "string"
                ? (p.research.report as string).slice(0, 2000)
                : ""
        const targets = (brief.targets as Record<string, number> | undefined) ?? {}
        const constraints = (brief.constraints as Record<string, unknown> | undefined) ?? {}
        out.push("## BRIEF")
        if (briefText) out.push(`Excerpt:\n${briefText}`)
        out.push(`Structured targets: ${JSON.stringify(targets)}`)
        out.push(`Constraints: ${JSON.stringify(constraints)}`)
        out.push("")
    }

    // Sizing
    if (p.dimensionSheet) {
        out.push("## SIZING (dimension sheet)")
        out.push(JSON.stringify(p.dimensionSheet).slice(0, 1500))
        out.push("")
    }
    if (p.spatialPlan) {
        out.push("## SPATIAL PLAN")
        out.push(JSON.stringify(p.spatialPlan).slice(0, 1500))
        out.push("")
    }

    // Modules
    if (p.modules.length > 0) {
        out.push(`## MODULES (${p.modules.length})`)
        for (const m of p.modules) {
            const id = (m.id as string) ?? "?"
            const name = (m.name as string) ?? "?"
            const purpose = (m.purpose as string) ?? ""
            const desc = ((m.description as string) ?? "").slice(0, 800)
            const why = ((m.whyItMatters as string) ?? "").slice(0, 500)
            const keyParts = Array.isArray(m.keyParts)
                ? (m.keyParts as unknown[]).slice(0, 8).map((kp) =>
                      typeof kp === "string" ? kp.slice(0, 250) : JSON.stringify(kp).slice(0, 250),
                  )
                : []
            out.push(`### ${id} · ${name}`)
            if (purpose) out.push(`Purpose: ${purpose}`)
            if (desc) out.push(`Description: ${desc}`)
            if (why) out.push(`Why it matters: ${why}`)
            if (keyParts.length > 0) out.push(`Key parts:\n${keyParts.map((k) => `  • ${k}`).join("\n")}`)
            out.push("")
        }
    }

    // BOM (parts)
    if (p.parts.length > 0) {
        out.push(`## BOM (${p.parts.length} parts)`)
        for (const part of p.parts.slice(0, 80)) {
            const cost = part.estimated_unit_cost_gbp
            out.push(
                `${part.part_number} · ${part.name} · module=${part.source_module_id} · ` +
                    `process=${part.process} · material=${part.material} · ` +
                    `mass_kg=${part.mass_kg} · cost_gbp=${cost ?? "?"} · ` +
                    `purchased=${part.is_purchased !== false}`,
            )
        }
        if (p.parts.length > 80) out.push(`...and ${p.parts.length - 80} more parts`)
        out.push("")
    }

    // Cost (Finn result)
    if (p.finnResult) {
        out.push("## COST WATERFALL (Finn output)")
        out.push(JSON.stringify(p.finnResult).slice(0, 1500))
        out.push("")
    }

    // Risks (Fang reviews)
    if (p.reviews) {
        out.push("## RISKS (Fang reviews)")
        for (const [moduleId, review] of Object.entries(p.reviews).slice(0, 12)) {
            const r = review as Record<string, unknown>
            const failures = Array.isArray(r.failureModes) ? r.failureModes : []
            const opens = Array.isArray(r.openQuestions) ? r.openQuestions : []
            out.push(
                `### ${moduleId}\n  failure modes: ${failures.length}; open questions: ${opens.length}`,
            )
            if (failures.length > 0) {
                out.push(`  • first failure: ${String(failures[0]).slice(0, 300)}`)
            }
            if (opens.length > 0) {
                out.push(`  • first open: ${String(opens[0]).slice(0, 300)}`)
            }
        }
        out.push("")
    }

    // Suppliers
    if (p.shortlist.length > 0) {
        out.push(`## SUPPLIERS (${p.shortlist.length} shortlisted)`)
        for (const s of p.shortlist.slice(0, 30)) {
            const matchedParts = Array.isArray(s.matched_part_numbers)
                ? (s.matched_part_numbers as string[]).join(", ")
                : "?"
            out.push(
                `• ${s.supplier_name} · score=${s.best_match_score ?? "?"}/100 · ` +
                    `parts=[${matchedParts}] · ` +
                    `synthesis="${(s.project_synthesis as string)?.slice(0, 150) ?? "(none)"}"`,
            )
        }
        if (p.shortlist.length > 30) out.push(`...and ${p.shortlist.length - 30} more suppliers`)
        out.push("")
    }

    // Cap total length defensively (proofreader budget = 16K tokens ≈ 60K chars).
    const composed = out.join("\n")
    if (composed.length > 50_000) {
        return composed.slice(0, 50_000) + "\n\n[... truncated to fit context budget ...]"
    }
    return composed
}
