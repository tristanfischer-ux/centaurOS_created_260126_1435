/**
 * @file adapters/layout.ts — per-stage adapter for the spatial-layout stage.
 *
 * @description Mirrors `chase-regulatory.ts` / `sizing.ts` in shape — measures
 * how good Fang's `spatial_plan` output is across the 5 demo projects without
 * re-running the full pipeline. Each demo project's `cad_lab_projects.spatial_plan`
 * is one golden output already in production. The adapter pulls it, computes
 * three deterministic dimensions locally (coverage / overlap-free / envelope-fit)
 * and fires a per-stage council to score the two LLM-judged dimensions
 * (notes substantiveness + interface declarations), then persists the
 * aggregate for trend tracking.
 *
 * This adapter doesn't RE-RUN the layout engine — it scores the existing
 * output. Once we have a baseline + a scoring rubric, the next loop
 * iteration will edit the layout rule libraries / Fang prompt, regenerate
 * a single demo project end-to-end, and re-score. That's the per-stage
 * feedback cadence.
 *
 * StageName: `bom-skeleton` is borrowed for layout (the type union doesn't
 * have a layout entry; closest unclaimed slot — bom-expand is taken by
 * bom-master, all the other engineering-shaped slots are taken). If a
 * future BOM-skeleton adapter wants the slot back, swap to another
 * unclaimed name here.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { callOpenRouter } from "@/lib/ai/openrouter"
import type {
    StageAdapter,
    StageGoldenInput,
    StageOutput,
    StageScore,
} from "../types"
import type { SpatialPlan, Placement } from "@/lib/layout/types"
import type { Envelope } from "@/lib/sizing/types"

const HARNESS_OPENROUTER_MODEL =
    process.env.LAYOUT_HARNESS_OPENROUTER_MODEL ||
    "deepseek/deepseek-chat"

const DEMO_PROJECT_IDS: ReadonlyArray<{ id: string; slug: string }> = [
    { id: "0ab0457a-ab32-4d2a-b1e3-32d8b877222c", slug: "bess" },
    { id: "3acf3007-b720-400b-8dc4-818394df102d", slug: "hedgerow" },
    { id: "517ae649-b3d3-42ad-94d7-99ac408e428b", slug: "vertfarm" },
    { id: "330e1bec-58f8-422c-b225-ea42b18580d1", slug: "desal" },
    { id: "3830be2c-84e8-4446-bb84-a06527a4dfe9", slug: "sentinel" },
] as const

// ─── Deterministic helpers ─────────────────────────────────────────────

/** Count modules with at least one placement entry whose module_id matches. */
function computeCoverage(
    placements: Placement[],
    moduleIds: string[],
): { covered: number; total: number; score: number } {
    const total = moduleIds.length
    if (total === 0) return { covered: 0, total: 0, score: 0 }
    const placedIds = new Set(placements.map((p) => p.module_id))
    let covered = 0
    for (const id of moduleIds) {
        if (placedIds.has(id)) covered += 1
    }
    const score = (covered / total) * 10
    return { covered, total, score }
}

/**
 * Detect any pair of placements whose top-down (x, y) bounding boxes overlap.
 * Mounts on different surfaces (wall / ceiling / floor) are considered
 * non-overlapping for the purposes of footprint conflict, but we keep this
 * simple and only ignore the wall-vs-floor case — overlapping footprint of
 * two floor-mounted modules is a real conflict.
 */
function computeOverlapPairs(placements: Placement[]): string[] {
    const pairs: string[] = []
    for (let i = 0; i < placements.length; i++) {
        for (let j = i + 1; j < placements.length; j++) {
            const a = placements[i]
            const b = placements[j]
            // Different non-floor mounts can coexist in the same xy footprint.
            if (a.mount !== b.mount && a.mount !== "floor" && b.mount !== "floor")
                continue
            const ax1 = a.x_mm
            const ay1 = a.y_mm
            const ax2 = a.x_mm + a.w_mm
            const ay2 = a.y_mm + a.d_mm
            const bx1 = b.x_mm
            const by1 = b.y_mm
            const bx2 = b.x_mm + b.w_mm
            const by2 = b.y_mm + b.d_mm
            const overlapX = ax1 < bx2 && bx1 < ax2
            const overlapY = ay1 < by2 && by1 < ay2
            if (overlapX && overlapY) {
                pairs.push(`${a.module_id} <> ${b.module_id}`)
            }
        }
    }
    return pairs
}

/**
 * Each placement's bounding box must fit inside the envelope.
 * (x + w) ≤ interior_w_mm, (y + d) ≤ interior_d_mm, (z + h) ≤ interior_h_mm.
 */
function computeOutOfEnvelope(
    placements: Placement[],
    envelope: Envelope | null,
): string[] {
    if (!envelope) return placements.map((p) => p.module_id)
    const violations: string[] = []
    for (const p of placements) {
        const z = p.z_mm ?? 0
        const overW = p.x_mm + p.w_mm > envelope.interior_w_mm
        const overD = p.y_mm + p.d_mm > envelope.interior_d_mm
        const overH = z + p.h_mm > envelope.interior_h_mm
        if (overW || overD || overH) violations.push(p.module_id)
    }
    return violations
}

export const layoutAdapter: StageAdapter = {
    name: "bom-skeleton",

    async selfCheck() {
        const admin = createAdminClient()
        const { count, error } = await admin
            .from("cad_lab_projects")
            .select("id", { count: "exact", head: true })
            .in(
                "id",
                DEMO_PROJECT_IDS.map((p) => p.id),
            )
            .not("spatial_plan", "is", null)
        if (error) return { ok: false, error: error.message }
        // Lower threshold to 1 — layout is opt-in per-domain; not every
        // demo project has a spatial_plan yet, but scoring even one is
        // useful as a starting baseline.
        if (!count || count < 1)
            return {
                ok: false,
                error: `expected at least 1 demo project with spatial_plan, found ${count ?? 0}`,
            }
        return { ok: true }
    },

    async loadGoldenInputs(): Promise<StageGoldenInput[]> {
        const admin = createAdminClient()
        const { data: rows } = await admin
            .from("cad_lab_projects")
            .select("id, name, subject, modules, dimension_sheet, spatial_plan")
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
            const spatialPlan = (r.spatial_plan ?? null) as
                | SpatialPlan
                | null
            // Module ids come from the project's modules array. Layout
            // coverage is computed against this list.
            const modulesRaw = Array.isArray(r.modules)
                ? (r.modules as Array<{ id?: unknown }>)
                : []
            const moduleIds: string[] = []
            for (const m of modulesRaw) {
                if (m && typeof m.id === "string") moduleIds.push(m.id)
            }
            // Envelope fallback: the spatial_plan's own envelope is canonical;
            // if absent, fall back to the dimension_sheet's envelope so the
            // out-of-envelope check still has a reference.
            const dimensionSheetEnvelope =
                r.dimension_sheet &&
                typeof r.dimension_sheet === "object" &&
                "envelope" in r.dimension_sheet
                    ? ((r.dimension_sheet as { envelope?: Envelope })
                          .envelope ?? null)
                    : null
            inputs.push({
                id: slug,
                label: typeof r.name === "string" ? r.name : slug,
                payload: {
                    subject: subject.slice(0, 1500),
                    spatialPlan,
                    moduleIds,
                    dimensionSheetEnvelope,
                },
            })
        }
        return inputs
    },

    async runOne(input): Promise<StageOutput> {
        // The layout adapter scores the persisted spatial_plan directly —
        // we don't re-run the layout engine here. Per-stage iteration will
        // happen by editing the rule libraries / Fang prompt and regenerating
        // the affected demo project end-to-end, then re-scoring.
        const t0 = Date.now()
        const spatialPlan = (input.payload.spatialPlan ?? null) as
            | SpatialPlan
            | null
        const moduleIds = Array.isArray(input.payload.moduleIds)
            ? (input.payload.moduleIds as string[])
            : []
        const fallbackEnvelope = (input.payload.dimensionSheetEnvelope ??
            null) as Envelope | null
        const diagnostics: string[] = []

        if (!spatialPlan) {
            diagnostics.push("spatial_plan missing on project")
            return {
                inputId: input.id,
                loop: 0,
                engineCommit: "",
                elapsedMs: Date.now() - t0,
                costPence: 0,
                output: {
                    hasPlan: false,
                    placements: [],
                    features: [],
                    notes: [],
                    view: null,
                    envelope: null,
                    coverage: { covered: 0, total: moduleIds.length, score: 0 },
                    overlapPairs: [],
                    overlapScore: 10,
                    outOfEnvelope: [],
                    envelopeFitScore: 10,
                },
                diagnostics,
            }
        }

        const placements: Placement[] = Array.isArray(spatialPlan.placements)
            ? spatialPlan.placements
            : []
        const envelope =
            spatialPlan.envelope ?? fallbackEnvelope ?? null

        const coverage = computeCoverage(placements, moduleIds)
        const overlapPairs = computeOverlapPairs(placements)
        const overlapScore = Math.max(0, 10 - overlapPairs.length)
        const outOfEnvelope = computeOutOfEnvelope(placements, envelope)
        const envelopeFitScore = Math.max(0, 10 - 2 * outOfEnvelope.length)

        if (placements.length === 0) {
            diagnostics.push("spatial_plan has zero placements")
        }
        if (coverage.total > 0 && coverage.covered < coverage.total) {
            diagnostics.push(
                `coverage gap: ${coverage.covered}/${coverage.total} modules placed`,
            )
        }
        if (overlapPairs.length > 0) {
            diagnostics.push(
                `${overlapPairs.length} placement-pair overlap(s): ${overlapPairs.slice(0, 3).join("; ")}`,
            )
        }
        if (outOfEnvelope.length > 0) {
            diagnostics.push(
                `${outOfEnvelope.length} placement(s) outside envelope: ${outOfEnvelope.slice(0, 3).join(", ")}`,
            )
        }
        if (!spatialPlan.notes || spatialPlan.notes.length === 0) {
            diagnostics.push("no spatial-plan notes recorded")
        }

        return {
            inputId: input.id,
            loop: 0,
            engineCommit: "",
            elapsedMs: Date.now() - t0,
            costPence: 0,
            output: {
                hasPlan: true,
                placements,
                features: spatialPlan.features ?? [],
                notes: spatialPlan.notes ?? [],
                view: spatialPlan.view ?? null,
                envelope,
                coverage,
                overlapPairs,
                overlapScore,
                outOfEnvelope,
                envelopeFitScore,
            },
            diagnostics,
        }
    },

    buildCouncilPrompt(input, output) {
        const subject =
            typeof input.payload.subject === "string"
                ? (input.payload.subject as string).slice(0, 1200)
                : ""
        const planSummary = JSON.stringify(
            {
                view: output.output.view,
                envelope: output.output.envelope,
                placements: output.output.placements,
                features: output.output.features,
                notes: output.output.notes,
                coverage: output.output.coverage,
                overlap_pairs: output.output.overlapPairs,
                out_of_envelope: output.output.outOfEnvelope,
            },
            null,
            2,
        ).slice(0, 8000)

        return `You are scoring a UK hardware engineering report's spatial-layout output. The founder is a UK first-time hardware founder. The bar is "what would an expert team produce".

PROJECT SUBJECT (excerpt — this is the brief the layout engine was supposed to plan to):
${subject}

LAYOUT ENGINE OUTPUT (spatial_plan):
${planSummary}

Score 0-10 on each dimension. Three dimensions are DETERMINISTIC and reported here for your context only — they will be overridden from local truth, so you can ignore them and focus on the two LLM-judged dimensions. Return all five for completeness.

1. coverage — DETERMINISTIC. % of project modules that have a placement entry. Reported in the JSON above as coverage.score.

2. placement_overlap_check — DETERMINISTIC. 10 if zero placement-pair bounding-box overlaps, lose 1 point per overlap. Reported as 10 - len(overlap_pairs).

3. placements_within_envelope — DETERMINISTIC. Each placement's (x+w, y+d, z+h) must fit the envelope. Lose 2 points per out-of-envelope placement.

4. notes_substantive — LLM-JUDGED. Are the spatial-plan notes specific (cite real clearances in mm, service-access dimensions, cable-tray routing, door-swing radii, NFPA/IEC clearance citations) vs generic ("ensure access", "consider serviceability", "leave room for maintenance")? Reward concrete numeric clearances + standard citations; penalise hand-waving boilerplate.

5. interfaces_declared — LLM-JUDGED. Do the placements + features collectively declare the interfaces between modules (electrical bus runs, mechanical mounts, thermal pathways, fluid headers/manifolds)? Engineering layouts must show how modules connect — cable trays / pipe runs / vents in features, and adjacency or distance commentary in notes. Reward layouts that make inter-module interfaces explicit; penalise layouts that just drop modules in space without declaring how they connect.

Output JSON ONLY:
{
  "dimensions": {
    "coverage": <0-10>,
    "placement_overlap_check": <0-10>,
    "placements_within_envelope": <0-10>,
    "notes_substantive": <0-10>,
    "interfaces_declared": <0-10>
  },
  "summary": "one-line aggregate observation",
  "next_fix": "the single highest-leverage prompt or rule-library change to lift this score, or null if at 8+"
}`
    },

    async fireCouncil(input, output): Promise<StageScore> {
        const prompt = layoutAdapter.buildCouncilPrompt(input, output)
        const result = await callOpenRouter({
            model: HARNESS_OPENROUTER_MODEL,
            system:
                "You are a chartered UK engineer scoring AI-generated spatial-layout outputs. Output JSON only.",
            prompt,
            maxTokens: 2000,
            temperature: 0.1,
            timeoutMs: 90_000,
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

        // Override the deterministic dims from local truth so the LLM can't
        // drift on them. Same rubric as the prompt.
        const llmDimensions: Record<string, number> = {}
        const dimEntries = Object.entries(parsed.dimensions ?? {})
        for (const [k, v] of dimEntries) {
            if (typeof v === "number")
                llmDimensions[k] = Math.max(0, Math.min(10, v))
        }
        const coverage = output.output.coverage as
            | { covered: number; total: number; score: number }
            | undefined
        const overlapScore =
            typeof output.output.overlapScore === "number"
                ? (output.output.overlapScore as number)
                : 10
        const envelopeFitScore =
            typeof output.output.envelopeFitScore === "number"
                ? (output.output.envelopeFitScore as number)
                : 10
        llmDimensions.coverage = coverage ? coverage.score : 0
        llmDimensions.placement_overlap_check = overlapScore
        llmDimensions.placements_within_envelope = envelopeFitScore

        const dimValues = Object.values(llmDimensions)
        const score =
            dimValues.length > 0
                ? dimValues.reduce((a, b) => a + b, 0) / dimValues.length
                : 0
        // Sonnet via OpenRouter ≈ $3/M in, $15/M out → council costs <1p per call
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
            dimensions: llmDimensions,
            summary: typeof parsed.summary === "string" ? parsed.summary : "",
            nextFix: typeof parsed.next_fix === "string" ? parsed.next_fix : null,
            costPence,
        }
    },
}
