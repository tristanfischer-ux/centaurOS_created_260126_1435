/**
 * @file adapters/proofreader-self-review.ts — per-stage adapter for the
 *   END-OF-PIPELINE engine self-review (proofreader) pass.
 *
 * @description Loop 7 critique flagged that the proofreader is
 * "non-correcting" — it logs problems via Gemini 2.5 Flash into
 * `cad_lab_projects.proofread_findings`, but the engine ships the PDF
 * regardless. So a proofreader that "found a blocker" is no use unless
 * the engine actually GATES on it. This adapter scores the persisted
 * findings without re-running the proofreader.
 *
 * Inputs read:
 *   - cad_lab_projects.proofread_findings : jsonb of shape
 *       { ran_at, model, cost_pence, findings: [
 *           { section, severity, message, suggestion? }
 *         ] }
 *     where severity ∈ {"blocker", "content", "cosmetic"}.
 *   - cad_lab_projects.stage              : current pipeline stage. Used
 *                                           to detect "blockers shipped
 *                                           anyway" (non-correcting).
 *   - cad_lab_projects.status             : "done" / similar shipped
 *                                           markers — fallback when stage
 *                                           is generic.
 *   - cad_lab_projects.subject            : project context for council.
 *
 * Dimensions (0-10 each, mean → aggregate score):
 *
 *  DETERMINISTIC:
 *  1. findings_count_plausibility   — was the run actually executed AND
 *                                     did it produce a plausible finding
 *                                     count? 0 if missing/empty;
 *                                     5 if 1-5 (probably under-detected);
 *                                     10 if 6-30; 5 if 31-100 (likely
 *                                     over-flagging).
 *  2. severity_diversity            — across findings, count how many of
 *                                     {blocker, content, cosmetic} buckets
 *                                     are present + check rough
 *                                     proportionality. 10 if all three
 *                                     buckets present in non-degenerate
 *                                     ratios; degraded scores when
 *                                     monotone or two-bucket.
 *  5. non_correcting_visibility     — DID THE ENGINE BLOCK? Read project
 *                                     stage/status; if blockers exist
 *                                     AND project advanced to "done",
 *                                     score 0 (Tristan's complaint:
 *                                     blockers ship). 10 if blockers DID
 *                                     prevent the PDF.
 *
 *  LLM-JUDGED (single Sonnet council call):
 *  3. actionability                 — are findings actionable (cite
 *                                     specific page/section/row + a
 *                                     concrete fix) vs generic
 *                                     ("review section X")?
 *  4. blocker_calibration           — when severity is "blocker", are
 *                                     they real blockers (numerical
 *                                     impossibility, regulatory
 *                                     misclassification, hallucinated
 *                                     supplier) vs false-positives
 *                                     (style nitpicks)?
 *
 * Self-check: at least 2 of 5 demos must have proofread_findings with a
 * non-empty findings array.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { callOpenRouter } from "@/lib/ai/openrouter"
import type {
    StageAdapter,
    StageGoldenInput,
    StageOutput,
    StageScore,
} from "../types"

const DEMO_PROJECT_IDS: ReadonlyArray<{ id: string; slug: string }> = [
    { id: "0ab0457a-ab32-4d2a-b1e3-32d8b877222c", slug: "bess" },
    { id: "3acf3007-b720-400b-8dc4-818394df102d", slug: "hedgerow" },
    { id: "517ae649-b3d3-42ad-94d7-99ac408e428b", slug: "vertfarm" },
    { id: "330e1bec-58f8-422c-b225-ea42b18580d1", slug: "desal" },
    { id: "3830be2c-84e8-4446-bb84-a06527a4dfe9", slug: "sentinel" },
] as const

type Severity = "blocker" | "content" | "cosmetic"

interface ProofreadFinding {
    section?: string | null
    severity?: string | null
    // Real production data uses `issue` + `suggested_fix`. The interface
    // also accepts `message` + `suggestion` for back-compat — runOne
    // prefers the issue/suggested_fix names with message/suggestion as
    // fallbacks.
    message?: string | null
    suggestion?: string | null
    issue?: string | null
    suggested_fix?: string | null
    location?: string | null
    confidence?: string | null
}

interface ProofreadFindingsBlob {
    ran_at?: string | null
    model?: string | null
    cost_pence?: number | null
    findings?: ProofreadFinding[]
}

function normaliseSeverity(raw: unknown): Severity | null {
    if (typeof raw !== "string") return null
    const v = raw.trim().toLowerCase()
    if (v === "blocker" || v === "content" || v === "cosmetic") return v
    return null
}

/** A project counts as "shipped" if its pipeline stage or status reads as
 *  done/completed. Either field can carry the marker depending on engine
 *  version, so check both defensively. */
function isShipped(stage: string | null, status: string | null): boolean {
    const haystack = `${stage ?? ""} ${status ?? ""}`.toLowerCase()
    return (
        haystack.includes("done") ||
        haystack.includes("completed") ||
        haystack.includes("complete") ||
        haystack.includes("shipped") ||
        haystack.includes("delivered")
    )
}

export const proofreaderSelfReviewAdapter: StageAdapter = {
    name: "proofreader-self-review",

    async selfCheck() {
        const admin = createAdminClient()
        const { data: rows, error } = await admin
            .from("cad_lab_projects")
            .select("id, proofread_findings")
            .in(
                "id",
                DEMO_PROJECT_IDS.map((p) => p.id),
            )
        if (error) return { ok: false, error: error.message }
        if (!rows)
            return { ok: false, error: "no rows returned for demo project IDs" }
        let withFindings = 0
        for (const r of rows) {
            const blob = (r as Record<string, unknown>)["proofread_findings"] as
                | ProofreadFindingsBlob
                | null
            const findings = Array.isArray(blob?.findings) ? blob!.findings : []
            if (findings.length > 0) withFindings += 1
        }
        if (withFindings < 2)
            return {
                ok: false,
                error: `expected at least 2 demos with non-empty proofread_findings, found ${withFindings}`,
            }
        return { ok: true }
    },

    async loadGoldenInputs(): Promise<StageGoldenInput[]> {
        const admin = createAdminClient()
        const { data: rows } = await admin
            .from("cad_lab_projects")
            .select(
                "id, name, subject, stage, status, proofread_findings",
            )
            .in(
                "id",
                DEMO_PROJECT_IDS.map((p) => p.id),
            )
        if (!rows) return []
        const inputs: StageGoldenInput[] = []
        for (const r of rows) {
            const slug =
                DEMO_PROJECT_IDS.find((p) => p.id === r.id)?.slug ?? "unknown"
            const subject = typeof r.subject === "string" ? r.subject : ""
            const stage = typeof r.stage === "string" ? r.stage : null
            const status = typeof r.status === "string" ? r.status : null
            const blob = (r as Record<string, unknown>)["proofread_findings"] as
                | ProofreadFindingsBlob
                | null
            const findings: ProofreadFinding[] = Array.isArray(blob?.findings)
                ? (blob!.findings as ProofreadFinding[])
                : []
            inputs.push({
                id: slug,
                label: typeof r.name === "string" ? r.name : slug,
                payload: {
                    subject: subject.slice(0, 1500),
                    stage,
                    status,
                    findings,
                    ranAt: blob?.ran_at ?? null,
                    model: blob?.model ?? null,
                    runCostPence: blob?.cost_pence ?? null,
                },
            })
        }
        return inputs
    },

    async runOne(input): Promise<StageOutput> {
        const t0 = Date.now()
        const findings = (input.payload.findings as ProofreadFinding[]) ?? []
        const stage = (input.payload.stage as string | null) ?? null
        const status = (input.payload.status as string | null) ?? null

        const sevDist: Record<Severity | "unknown", number> = {
            blocker: 0,
            content: 0,
            cosmetic: 0,
            unknown: 0,
        }
        for (const f of findings) {
            const sev = normaliseSeverity(f?.severity)
            if (sev) sevDist[sev] += 1
            else sevDist.unknown += 1
        }
        const blockerCount = sevDist.blocker
        const shipped = isShipped(stage, status)

        const diagnostics: string[] = []
        if (findings.length === 0)
            diagnostics.push("no proofread_findings — run was missing or empty")
        if (blockerCount > 0 && shipped)
            diagnostics.push(
                `${blockerCount} blocker finding(s) but project shipped (stage=${stage ?? "?"}, status=${status ?? "?"}) — proofreader is non-correcting`,
            )

        return {
            inputId: input.id,
            loop: 0,
            engineCommit: "",
            elapsedMs: Date.now() - t0,
            costPence: 0,
            output: {
                findingsCount: findings.length,
                severityDist: sevDist,
                blockerCount,
                stage,
                status,
                shipped,
                ranAt: input.payload.ranAt ?? null,
                model: input.payload.model ?? null,
                runCostPence: input.payload.runCostPence ?? null,
                sample: findings.slice(0, 12).map((f) => {
                    // Real production data uses `issue` + `suggested_fix`;
                    // some legacy rows used `message` + `suggestion`. Read
                    // both, prefer the production names.
                    const msg = (f?.issue ?? f?.message) as string | null | undefined
                    const fix = (f?.suggested_fix ?? f?.suggestion) as
                        | string
                        | null
                        | undefined
                    return {
                        section: f?.section ?? null,
                        severity: f?.severity ?? null,
                        location: f?.location ?? null,
                        confidence: f?.confidence ?? null,
                        message: typeof msg === "string" ? msg.slice(0, 600) : null,
                        suggestion:
                            typeof fix === "string" ? fix.slice(0, 400) : null,
                    }
                }),
            },
            diagnostics,
        }
    },

    buildCouncilPrompt(input, output) {
        const subject =
            typeof input.payload.subject === "string"
                ? (input.payload.subject as string).slice(0, 800)
                : ""
        const out = output.output as Record<string, unknown>
        const sample = (out.sample as Array<Record<string, unknown>>) ?? []
        const findingsCount = (out.findingsCount as number) ?? 0
        const blockerCount = (out.blockerCount as number) ?? 0
        const sevDist = (out.severityDist as Record<string, number>) ?? {}

        return `You are scoring the engine-self-review (proofreader) pass on a UK hardware engineering project's draft report. The proofreader is run by Gemini 2.5 Flash at the END of the pipeline; it is supposed to surface real defects (numerical impossibilities, regulatory misclassification, hallucinated suppliers, contradictions across sections) so they get fixed before the PDF ships.

PROJECT SUBJECT (excerpt):
${subject}

FINDINGS COUNT: ${findingsCount}
SEVERITY DISTRIBUTION: ${JSON.stringify(sevDist)}
BLOCKER COUNT: ${blockerCount}

FINDINGS SAMPLE (first ${sample.length} of ${findingsCount}):
${JSON.stringify(sample, null, 2).slice(0, 5500)}

Score 0-10 on each LLM-judged dimension:

1. actionability — Are findings ACTIONABLE? A good finding cites a specific page / section / table row / module name AND proposes a concrete fix ("BOM line 14 lists 3.2mm fastener but Sizing module specifies M4 — change to M4x12"). A bad finding is generic ("review section 3 for accuracy", "consider adding more detail"). Penalise vagueness; reward specificity.
2. blocker_calibration — When the proofreader flags severity="blocker", is it a REAL blocker (numerical impossibility, regulatory misclassification, hallucinated supplier, ceiling violation, schema corruption) or a FALSE POSITIVE (style nitpick, capitalisation, "consider rewording", presentation polish that should be cosmetic)? Score 10 if every blocker reads as genuinely report-blocking; lower as false-positives creep in. If there are 0 blockers but the report obviously needs them, that is also a calibration failure.

Output JSON ONLY:
{
  "dimensions": {
    "actionability": <0-10>,
    "blocker_calibration": <0-10>
  },
  "summary": "one-line aggregate observation",
  "next_fix": "the single highest-leverage proofreader-prompt change to lift this score, or null if at 8+"
}`
    },

    async fireCouncil(input, output): Promise<StageScore> {
        const out = output.output as unknown as {
            findingsCount: number
            severityDist: Record<string, number>
            blockerCount: number
            shipped: boolean
        }

        // ── Deterministic dimensions ──────────────────────────────────────

        // 1. findings_count_plausibility — non-zero count, in a sensible
        //    band. 0 if missing/empty; 5 if under-detecting (1-5);
        //    10 if 6-30; 5 if 31-100 (over-flagging); 0 if >100 noise.
        let findingsCountPlausibility: number
        if (out.findingsCount === 0) findingsCountPlausibility = 0
        else if (out.findingsCount <= 5) findingsCountPlausibility = 5
        else if (out.findingsCount <= 30) findingsCountPlausibility = 10
        else if (out.findingsCount <= 100) findingsCountPlausibility = 5
        else findingsCountPlausibility = 0

        // 2. severity_diversity — count distinct buckets in
        //    {blocker, content, cosmetic} that have at least 1 finding,
        //    then penalise extreme lopsidedness. A real proofreader run
        //    surfaces a mix.
        const blockers = out.severityDist["blocker"] ?? 0
        const content = out.severityDist["content"] ?? 0
        const cosmetics = out.severityDist["cosmetic"] ?? 0
        const totalKnown = blockers + content + cosmetics
        let severityDiversity: number
        if (totalKnown === 0) {
            severityDiversity = 0
        } else {
            const buckets = [blockers, content, cosmetics].filter((n) => n > 0)
                .length
            // Lopsidedness: dominant bucket share.
            const dominantShare =
                Math.max(blockers, content, cosmetics) / totalKnown
            if (buckets === 3) {
                // All three present. Reward when no single bucket exceeds
                // 70% of the total; else down-weight to 7.
                severityDiversity = dominantShare <= 0.7 ? 10 : 7
            } else if (buckets === 2) {
                severityDiversity = 5
            } else {
                // Single-bucket — likely "everything cosmetic" or
                // "everything content". Strong red flag.
                severityDiversity = 2
            }
        }

        // 5. non_correcting_visibility — the headline complaint. If the
        //    proofreader flagged blockers but the project shipped anyway,
        //    score 0. If 0 blockers, neutral 5 (we can't observe the gate).
        //    If blockers AND project NOT shipped, score 10 (gate worked).
        let nonCorrectingVisibility: number
        if (out.blockerCount === 0) {
            nonCorrectingVisibility = 5
        } else if (out.shipped) {
            nonCorrectingVisibility = 0
        } else {
            nonCorrectingVisibility = 10
        }

        // ── LLM-judged dimensions ────────────────────────────────────────
        const llmDims: Record<string, number> = {}
        let summary = ""
        let nextFix: string | null = null
        let costPence = 0
        try {
            const prompt = proofreaderSelfReviewAdapter.buildCouncilPrompt(
                input,
                output,
            )
            const result = await callOpenRouter({
                model: "anthropic/claude-sonnet-4-6",
                system:
                    "You are a chartered UK hardware engineer scoring an AI-generated report-proofreader's findings. Output JSON only.",
                prompt,
                maxTokens: 2000,
                temperature: 0.1,
                timeoutMs: 90_000,
            })
            if (result.ok) {
                const text = result.text.trim()
                const j0 = text.indexOf("{")
                const j1 = text.lastIndexOf("}")
                if (j0 >= 0 && j1 > j0) {
                    const parsed = JSON.parse(text.slice(j0, j1 + 1)) as {
                        dimensions?: Record<string, number>
                        summary?: string
                        next_fix?: string | null
                    }
                    for (const [k, v] of Object.entries(
                        parsed.dimensions ?? {},
                    )) {
                        if (typeof v === "number") {
                            llmDims[k] = Math.max(0, Math.min(10, v))
                        }
                    }
                    if (typeof parsed.summary === "string")
                        summary = parsed.summary
                    if (typeof parsed.next_fix === "string")
                        nextFix = parsed.next_fix
                }
                // Sonnet via OpenRouter ≈ $3/M in, $15/M out → council <1p.
                costPence =
                    Math.ceil(
                        ((result.inputTokens / 1_000_000) * 3 +
                            (result.outputTokens / 1_000_000) * 15) *
                            80 *
                            100,
                    ) || 1
            } else {
                summary = `council call failed: ${result.error}`
            }
        } catch (err) {
            summary = `council failed: ${err instanceof Error ? err.message : err}`
        }

        const dimensions: Record<string, number> = {
            findings_count_plausibility: round1(findingsCountPlausibility),
            severity_diversity: round1(severityDiversity),
            non_correcting_visibility: round1(nonCorrectingVisibility),
            ...Object.fromEntries(
                Object.entries(llmDims).map(([k, v]) => [k, round1(v)]),
            ),
        }
        const dimVals = Object.values(dimensions)
        const score =
            dimVals.length > 0
                ? dimVals.reduce((a, b) => a + b, 0) / dimVals.length
                : 0

        const fallbackSummary = `${out.findingsCount} findings (blocker:${blockers}/content:${content}/cosmetic:${cosmetics})${out.blockerCount > 0 && out.shipped ? " — BLOCKERS SHIPPED" : ""}`

        return {
            inputId: input.id,
            score,
            dimensions,
            summary: summary || fallbackSummary,
            nextFix,
            costPence,
        }
    },
}

function round1(n: number): number {
    return Math.round(n * 10) / 10
}
