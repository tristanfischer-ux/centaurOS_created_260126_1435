"use server"

/**
 * @file run-executive-summary.ts — synthesises the 1-page Executive Summary
 * that lands as page 2 of every Forge project PDF.
 *
 * @description Tristan-directed 2026-04-26 (Loop 8 CONVERGED-DOC-STRUCTURE.md
 * Tier 1). Investors and contract manufacturers read page 1, decide whether
 * to keep going. Currently the founder reads 30 pages to extract the 1-page
 * version. This stage runs ONE LLM call over the whole project's structured
 * state and emits a tight summary that goes on the cover/page-2 of the PDF.
 *
 * Inputs (read from cad_lab_projects):
 *   - subject + name
 *   - research.designBrief (mission, customers, whyNow, useCase, constraints)
 *   - modules (decomposition + key_parts count)
 *   - parts (BOM totals)
 *   - ai_cost_estimates (cost roll-up)
 *   - feasibility_verdict
 *   - reviews jsonb (top engineering concerns)
 *
 * Output (persisted to cad_lab_projects.executive_summary):
 *   A single TEXT block — 5-8 short paragraphs, each ≤ 3 sentences.
 *   Structure:
 *     1. What is being built (1 sentence — the elevator pitch)
 *     2. Why now (1 sentence — market/regulatory/tech moment)
 *     3. Cost / scale headlines (unit cost vs ceiling, mass, modules)
 *     4. Feasibility verdict (RED/AMBER/GREEN + biggest blocker)
 *     5. Top 3 engineering risks (1 line each)
 *     6. Top 3 actions for the founder this week
 *     7. Supplier coverage (% of BOM rows with ≥3 candidates)
 *
 * Cost: single Sonnet-via-OpenRouter call, ~£0.05 per project. Runs
 * AFTER all other stages so it has the complete picture.
 *
 * @see CONVERGED-DOC-STRUCTURE.md for the full set of new sections planned
 *      (executive summary is Tier 1, item 1 of 7).
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { callOpenRouter } from "@/lib/ai/openrouter"

export interface RunExecutiveSummaryResult {
    ok: true
    summary: string
    tokensIn: number
    tokensOut: number
    costPence: number
}

export interface RunExecutiveSummaryError {
    ok: false
    error: string
}

export type RunExecutiveSummaryReturn =
    | RunExecutiveSummaryResult
    | RunExecutiveSummaryError

export async function runExecutiveSummary(
    projectId: string,
): Promise<RunExecutiveSummaryReturn> {
    if (!projectId || !/^[0-9a-f-]{36}$/.test(projectId)) {
        return { ok: false, error: "invalid project id" }
    }
    const admin = createAdminClient()

    const { data: project, error } = await admin
        .from("cad_lab_projects")
        .select(
            "id, name, subject, research, modules, ai_cost_estimates, feasibility_verdict, reviews, target_unit_cost_gbp",
        )
        .eq("id", projectId)
        .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!project) return { ok: false, error: "project not found" }

    const { count: bomRowCount } = await admin
        .from("parts")
        .select("id", { count: "exact", head: true })
        .eq("cad_lab_project_id", projectId)

    const { count: supplierRowCount } = await admin
        .from("forge_supplier_shortlist")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)

    const designBrief = (project.research as Record<string, unknown> | null)
        ?.designBrief as Record<string, unknown> | undefined
    const modulesArr = Array.isArray(project.modules)
        ? (project.modules as Array<Record<string, unknown>>)
        : []
    const reviewsObj = (project.reviews as Record<string, unknown> | null) ?? {}

    // Compose a compact JSON-ish snapshot for the model.
    const snapshot = {
        name: project.name,
        subject:
            typeof project.subject === "string" ? project.subject.slice(0, 1500) : "",
        mission: designBrief?.mission ?? null,
        targetCustomers: designBrief?.targetCustomers ?? null,
        whyNow: designBrief?.whyNow ?? null,
        useCase: designBrief?.useCase ?? null,
        constraints: designBrief?.constraints ?? null,
        targetUnitCostGbp: project.target_unit_cost_gbp ?? null,
        moduleCount: modulesArr.length,
        modules: modulesArr.slice(0, 12).map((m) => ({
            name: typeof m.name === "string" ? m.name : "",
            purpose: typeof m.purpose === "string" ? m.purpose.slice(0, 200) : null,
            massKg: typeof m.estimatedMassKg === "number" ? m.estimatedMassKg : null,
        })),
        bomRowCount: bomRowCount ?? 0,
        supplierRowCount: supplierRowCount ?? 0,
        feasibility: project.feasibility_verdict ?? null,
        reviewsKeys: Object.keys(reviewsObj).length,
        // Sample of review issues for top-risks extraction
        reviewSample: Object.values(reviewsObj)
            .slice(0, 4)
            .flatMap((r) => {
                const reviews = Array.isArray(r) ? r : [r]
                return reviews.flatMap((rv) => {
                    const issues = (rv as Record<string, unknown>)?.issues
                    return Array.isArray(issues)
                        ? issues
                              .slice(0, 3)
                              .map((i) => ({
                                  severity: (i as Record<string, unknown>)?.severity ?? "",
                                  category: (i as Record<string, unknown>)?.category ?? "",
                                  message:
                                      typeof (i as Record<string, unknown>)?.message ===
                                      "string"
                                          ? ((i as Record<string, unknown>).message as string).slice(
                                                0,
                                                200,
                                            )
                                          : "",
                              }))
                        : []
                })
            }),
    }

    const systemPrompt = `You are writing the EXECUTIVE SUMMARY for a UK hardware engineering project pack. Audience: investors, contract manufacturers, certification reviewers — they read this page first and decide whether to keep going. Tight, factual, dense.

Required structure (one short paragraph per section, separated by blank lines):

PARA 1 — WHAT IS BEING BUILT (one sentence: the elevator pitch — what + for whom + what makes it credible).

PARA 2 — WHY NOW (one sentence: the market / regulatory / technology moment).

PARA 3 — HEADLINE NUMBERS (unit cost vs target, modules, BOM rows, mass, supplier coverage). Plain text, GBP figures, no jargon.

PARA 4 — FEASIBILITY (RED/AMBER/GREEN + the biggest blocker if not GREEN, in 1 sentence).

PARA 5 — TOP 3 ENGINEERING RISKS (3 bullets, ≤ 1 line each). Cite a specific module if possible. No filler.

PARA 6 — THIS WEEK'S 3 ACTIONS (3 bullets — what the founder needs to do this week to move the programme forward).

PARA 7 — SUPPLIER COVERAGE (one sentence: how many BOM rows have ≥ 3 candidates, where the gaps are).

Rules:
- British English, plain prose, no marketing copy.
- Cite numbers from the snapshot. Do not invent figures.
- No headers, no markdown — plain paragraphs separated by blank lines.
- Total length ≤ 250 words.
- Do not output preamble or postamble. Output the summary text directly.`

    const userPrompt = `Project snapshot:

${JSON.stringify(snapshot, null, 2).slice(0, 8000)}

Write the executive summary now. Plain paragraphs separated by blank lines. ≤ 250 words.`

    const result = await callOpenRouter({
        model: "anthropic/claude-sonnet-4-6",
        system: systemPrompt,
        prompt: userPrompt,
        maxTokens: 1200,
        temperature: 0.2,
        timeoutMs: 60_000,
    })
    if (!result.ok) {
        return { ok: false, error: `executive summary call failed: ${result.error}` }
    }

    const summary = result.text.trim()
    if (summary.length === 0) {
        return { ok: false, error: "empty executive summary" }
    }

    const { error: writeErr } = await admin
        .from("cad_lab_projects")
        .update({ executive_summary: summary })
        .eq("id", projectId)
    if (writeErr) {
        return { ok: false, error: `persist failed: ${writeErr.message}` }
    }

    const costPence =
        Math.ceil(
            ((result.inputTokens / 1_000_000) * 3 +
                (result.outputTokens / 1_000_000) * 15) *
                80 *
                100,
        ) || 1
    return {
        ok: true,
        summary,
        tokensIn: result.inputTokens,
        tokensOut: result.outputTokens,
        costPence,
    }
}
