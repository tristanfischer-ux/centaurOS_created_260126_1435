/**
 * @file adapters/chase-regulatory.ts — per-stage adapter for Chase regulatory.
 *
 * @description First concrete StageAdapter — measures how good Chase's
 * regulatory-matrix output is across the 6 demo projects without
 * running a full pipeline regen. Each demo project's `research.designBrief.regulatory`
 * is one golden output already in production. The adapter pulls it,
 * fires a per-stage council to score it 0-10 on the dimensions that
 * matter for regulatory output (matrix vs bibliography, UK statutory vs
 * reference distinction, applicability fields filled, etc.), and
 * persists the score for trend tracking.
 *
 * This adapter doesn't RE-RUN Chase — it scores the existing output.
 * Once we have a baseline + a scoring rubric, the next loop iteration
 * will edit the Chase prompt, re-run on a single demo project, and
 * re-score. That's the per-stage feedback cadence.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { callOpenRouter } from "@/lib/ai/openrouter"
import {
    extractDesignBriefFromReport,
    buildChaseExtractionPrompts,
    parseChaseExtraction,
} from "@/actions/specialists/run-chase-research"
import type {
    StageAdapter,
    StageGoldenInput,
    StageOutput,
    StageScore,
} from "../types"

// Loop 8 P5 — harness-side OpenRouter route for when the direct Anthropic
// key is dry. Set CHASE_HARNESS_VIA_OPENROUTER=1 to bypass callClaude and
// route through OpenRouter (separate credit pool) using the same Sonnet
// model the engine uses in production.
const HARNESS_VIA_OPENROUTER =
    process.env.CHASE_HARNESS_VIA_OPENROUTER === "1"
const HARNESS_OPENROUTER_MODEL =
    process.env.CHASE_HARNESS_OPENROUTER_MODEL || "anthropic/claude-sonnet-4-6"

const DEMO_PROJECT_IDS: ReadonlyArray<{ id: string; slug: string }> = [
    { id: "0ab0457a-ab32-4d2a-b1e3-32d8b877222c", slug: "bess" },
    { id: "3acf3007-b720-400b-8dc4-818394df102d", slug: "hedgerow" },
    { id: "517ae649-b3d3-42ad-94d7-99ac408e428b", slug: "vertfarm" },
    { id: "330e1bec-58f8-422c-b225-ea42b18580d1", slug: "desal" },
    { id: "3830be2c-84e8-4446-bb84-a06527a4dfe9", slug: "sentinel" },
] as const

export const chaseRegulatoryAdapter: StageAdapter = {
    name: "chase-regulatory",

    async selfCheck() {
        const admin = createAdminClient()
        const { count, error } = await admin
            .from("cad_lab_projects")
            .select("id", { count: "exact", head: true })
            .in(
                "id",
                DEMO_PROJECT_IDS.map((p) => p.id),
            )
        if (error) return { ok: false, error: error.message }
        if (!count || count < 3)
            return {
                ok: false,
                error: `expected at least 3 demo projects, found ${count ?? 0}`,
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
            const report =
                typeof research?.["report"] === "string"
                    ? (research["report"] as string)
                    : ""
            inputs.push({
                id: slug,
                label: typeof r.name === "string" ? r.name : slug,
                payload: {
                    subject: subject.slice(0, 1500),
                    report,
                    persistedRegulatory: Array.isArray(
                        (research?.["designBrief"] as
                            | Record<string, unknown>
                            | null)?.["regulatory"],
                    )
                        ? ((research!["designBrief"] as Record<string, unknown>)[
                              "regulatory"
                          ] as unknown[])
                        : [],
                },
            })
        }
        return inputs
    },

    async runOne(input): Promise<StageOutput> {
        // Per-stage iteration loop (Loop 8 P5): re-extract the regulatory
        // matrix from the stored research.report using the CURRENT Chase
        // prompt so prompt edits are scored against fresh output rather
        // than stale persisted data. Falls back to the persisted array
        // when the report is missing OR extraction returns nothing — that
        // way the council still scores the production state for those
        // demos until they're regenerated end-to-end.
        const subject =
            typeof input.payload.subject === "string"
                ? (input.payload.subject as string)
                : ""
        const report =
            typeof input.payload.report === "string"
                ? (input.payload.report as string)
                : ""
        const persisted =
            (input.payload.persistedRegulatory as unknown[] | undefined) ?? []

        const t0 = Date.now()
        let regulatory: unknown[] = persisted
        let costPence = 0
        const diagnostics: string[] = []
        let extractedFresh = false
        if (report.length > 200) {
            if (HARNESS_VIA_OPENROUTER) {
                const { systemPrompt, userPrompt } = await buildChaseExtractionPrompts(
                    subject,
                    report,
                    undefined,
                )
                const result = await callOpenRouter({
                    model: HARNESS_OPENROUTER_MODEL,
                    system: systemPrompt,
                    prompt: userPrompt,
                    maxTokens: 8192,
                    temperature: 0.1,
                    // Loop 4 (db04b611) expanded the prompt with a UK regime
                    // taxonomy + coverage checklist — Sonnet via OpenRouter
                    // started timing out at exactly 120 s on every demo
                    // (vertfarm/sentinel/hedgerow all 120004 ms). Bumping
                    // to 240 s so the matrix output has time to emit.
                    timeoutMs: 240_000,
                })
                if (result.ok) {
                    const parsed = await parseChaseExtraction(result.text)
                    if (
                        parsed &&
                        Array.isArray(parsed.regulatory) &&
                        parsed.regulatory.length > 0
                    ) {
                        regulatory = parsed.regulatory
                        extractedFresh = true
                        // Sonnet via OpenRouter ≈ $3/M in, $15/M out.
                        costPence =
                            Math.ceil(
                                ((result.inputTokens / 1_000_000) * 3 +
                                    (result.outputTokens / 1_000_000) * 15) *
                                    80 *
                                    100,
                            ) || 1
                    } else {
                        diagnostics.push(
                            "OpenRouter extraction parsed empty regulatory; using persisted",
                        )
                    }
                } else {
                    diagnostics.push(
                        `OpenRouter extraction failed: ${result.error}`,
                    )
                }
            } else {
                try {
                    const result = await extractDesignBriefFromReport(
                        subject,
                        report,
                        undefined,
                    )
                    if (
                        result.ok &&
                        result.brief &&
                        Array.isArray(result.brief.regulatory) &&
                        result.brief.regulatory.length > 0
                    ) {
                        regulatory = result.brief.regulatory
                        extractedFresh = true
                        costPence =
                            Math.ceil(
                                ((result.tokensIn / 1_000_000) * 3 +
                                    (result.tokensOut / 1_000_000) * 15) *
                                    80 *
                                    100,
                            ) || 1
                    } else {
                        diagnostics.push(
                            "fresh extraction returned empty regulatory; using persisted",
                        )
                    }
                } catch (err) {
                    diagnostics.push(
                        `fresh extraction threw: ${err instanceof Error ? err.message : String(err)}`,
                    )
                }
            }
        } else {
            diagnostics.push("research.report missing or <200 chars")
        }
        if (regulatory.length === 0) {
            diagnostics.push("no regulatory rows")
        }
        if (!extractedFresh) {
            diagnostics.push("scored persisted output (no fresh extraction)")
        }
        return {
            inputId: input.id,
            loop: 0,
            engineCommit: "",
            elapsedMs: Date.now() - t0,
            costPence,
            output: {
                regulatory,
                count: regulatory.length,
                extractedFresh,
            },
            diagnostics,
        }
    },

    buildCouncilPrompt(input, output) {
        const subject =
            typeof input.payload.subject === "string"
                ? (input.payload.subject as string).slice(0, 800)
                : ""
        const reg = JSON.stringify(output.output.regulatory ?? [], null, 2).slice(
            0,
            6000,
        )
        return `You are scoring a UK hardware engineering report's regulatory section. The founder is a UK first-time hardware founder. The bar is "what would an expert team produce".

PROJECT SUBJECT (excerpt):
${subject}

REGULATORY OUTPUT FROM ENGINE:
${reg}

Score 0-10 on each dimension:

1. matrix_not_bibliography — is each row a project-mapped compliance entry (applicability, design impact, evidence required, owner, gap action) vs a bibliography of standards with 1-line summaries?
2. statutory_vs_reference_distinguished — for UK projects, are statutory standards (BS 7671, UKCA, LVD/EMC/Machinery, ESQCR) clearly separated from reference standards (NFPA 855, UL 9540) that insurers/NFCC cite but aren't UK law?
3. uk_specific_correctness — are the right UK/EU equivalents named (BS EN IEC 62933-5-2, BS EN 15004-1) vs US-only standards being mis-cited as statutory?
4. applicability_specificity — is each row's applicability field tied to a specific design element of THIS project, or is it generic boilerplate?
5. evidence_required_actionable — does evidence_required name a concrete artefact the founder can obtain (test cert / supplier declaration / UKAS lab report) rather than vague "demonstrate compliance"?
6. coverage — are the obvious major standards for this product class present? Are any glaring gaps (e.g., UN 38.3 for batteries, BS 7671 for AC wiring)?
7. owner_role_specific — is ownerRole a real role (Electrical Engineer, Battery Lead, Founder) or boilerplate "TBD"?

Output JSON ONLY:
{
  "dimensions": {
    "matrix_not_bibliography": <0-10>,
    "statutory_vs_reference_distinguished": <0-10>,
    "uk_specific_correctness": <0-10>,
    "applicability_specificity": <0-10>,
    "evidence_required_actionable": <0-10>,
    "coverage": <0-10>,
    "owner_role_specific": <0-10>
  },
  "summary": "one-line aggregate observation",
  "next_fix": "the single highest-leverage prompt change to lift this score, or null if at 8+"
}`
    },

    async fireCouncil(input, output): Promise<StageScore> {
        const prompt = chaseRegulatoryAdapter.buildCouncilPrompt(input, output)
        const result = await callOpenRouter({
            model: "openai/gpt-5.5",
            system:
                "You are a chartered UK engineer scoring AI-generated regulatory matrices. Output JSON only.",
            prompt,
            maxTokens: 2000,
            temperature: 0.1,
            timeoutMs: 60_000,
        })
        if (!result.ok) {
            return {
                inputId: input.id,
                score: 0,
                dimensions: {},
                summary: `council call failed: ${result.error}`,
                nextFix: null,
                costPence: 0,
            }
        }
        let parsed: {
            dimensions?: Record<string, number>
            summary?: string
            next_fix?: string | null
        }
        try {
            const text = result.text.trim()
            const jsonStart = text.indexOf("{")
            const jsonEnd = text.lastIndexOf("}")
            const slice = text.slice(jsonStart, jsonEnd + 1)
            parsed = JSON.parse(slice)
        } catch (err) {
            return {
                inputId: input.id,
                score: 0,
                dimensions: {},
                summary: `council JSON parse failed: ${err instanceof Error ? err.message : err}`,
                nextFix: null,
                costPence: 0,
            }
        }
        const dimensions: Record<string, number> = {}
        const dimEntries = Object.entries(parsed.dimensions ?? {})
        for (const [k, v] of dimEntries) {
            if (typeof v === "number") dimensions[k] = Math.max(0, Math.min(10, v))
        }
        const score =
            dimEntries.length > 0
                ? Object.values(dimensions).reduce((a, b) => a + b, 0) /
                  Object.values(dimensions).length
                : 0
        // Rough cost: GPT-5.5 ~$3/M in, $15/M out → council costs <1p per call
        const costPence =
            Math.round(
                ((result.inputTokens / 1_000_000) * 3 +
                    (result.outputTokens / 1_000_000) * 15) *
                    80 *
                    100,
            ) || 1
        return {
            inputId: input.id,
            score,
            dimensions,
            summary: typeof parsed.summary === "string" ? parsed.summary : "",
            nextFix: typeof parsed.next_fix === "string" ? parsed.next_fix : null,
            costPence,
        }
    },
}
