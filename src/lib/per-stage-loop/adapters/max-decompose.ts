/**
 * @file adapters/max-decompose.ts — per-stage adapter for Max's module
 * decomposition.
 *
 * @description Max is the upstream specialist whose output drives every
 * downstream stage (Sizing, Layout, BOM, Finn, Fang). When Max produces
 * overlapping modules, missing major sub-systems, or implausible mass
 * roll-ups, every section of the PDF inherits the problem. Scoring Max
 * directly catches the issues at the cheapest stage to fix.
 *
 * Reads `cad_lab_projects.modules` (the structured module decomposition)
 * for each demo, fires a single Sonnet-via-OpenRouter council call on
 * 6 dimensions, returns the score.
 *
 * The adapter does NOT re-run Max — Max is expensive (Sonnet, 8K-16K
 * tokens) and the iteration loop should be fast. It scores the existing
 * decomposition. After a Max-prompt change, the next end-to-end regen
 * will surface new module data and the harness will pick it up.
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

interface ModuleSummary {
    id: string
    name: string
    purpose?: string | null
    massKg?: number | null
    keyPartCount?: number
}

export const maxDecomposeAdapter: StageAdapter = {
    name: "max-decompose",

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
            .select("id, name, subject, modules")
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
            const modulesRaw = Array.isArray(r.modules)
                ? (r.modules as Array<Record<string, unknown>>)
                : []
            const moduleSummaries: ModuleSummary[] = modulesRaw.map((m) => ({
                id: typeof m.id === "string" ? m.id : "",
                name: typeof m.name === "string" ? m.name : "",
                purpose:
                    typeof m.purpose === "string" ? m.purpose : null,
                massKg:
                    typeof m.estimatedMassKg === "number"
                        ? m.estimatedMassKg
                        : null,
                keyPartCount: Array.isArray(m.keyParts)
                    ? (m.keyParts as unknown[]).length
                    : 0,
            }))
            inputs.push({
                id: slug,
                label: typeof r.name === "string" ? r.name : slug,
                payload: {
                    subject: subject.slice(0, 1500),
                    modules: moduleSummaries,
                },
            })
        }
        return inputs
    },

    async runOne(input): Promise<StageOutput> {
        const modules = (input.payload.modules as ModuleSummary[]) ?? []
        const totalMass = modules.reduce(
            (acc, m) => acc + (typeof m.massKg === "number" ? m.massKg : 0),
            0,
        )
        return {
            inputId: input.id,
            loop: 0,
            engineCommit: "",
            elapsedMs: 0,
            costPence: 0,
            output: {
                modules,
                moduleCount: modules.length,
                totalMassKg: totalMass > 0 ? totalMass : null,
                modulesWithoutKeyParts: modules.filter(
                    (m) => (m.keyPartCount ?? 0) === 0,
                ).length,
            },
            diagnostics:
                modules.length === 0 ? ["no modules in decomposition"] : [],
        }
    },

    buildCouncilPrompt(input, output) {
        const subject =
            typeof input.payload.subject === "string"
                ? (input.payload.subject as string).slice(0, 800)
                : ""
        const modules = output.output.modules as ModuleSummary[]
        const moduleListing = modules
            .map(
                (m, i) =>
                    `${i + 1}. ${m.name}${m.massKg != null ? ` — ${m.massKg.toFixed(2)} kg` : ""}${m.keyPartCount ? ` — ${m.keyPartCount} key parts` : " — 0 key parts"}\n   purpose: ${m.purpose ?? "(not set)"}`,
            )
            .join("\n")

        return `You are scoring a UK hardware engineering project's module decomposition. The decomposition is the upstream specialist's output that drives every downstream stage (sizing, layout, BOM, cost, supplier matching, manufacturing review).

PROJECT SUBJECT (excerpt):
${subject}

MODULE DECOMPOSITION (${modules.length} modules):
${moduleListing}

Score 0-10 on each dimension:

1. module_count_plausibility — is the count reasonable for this product class? Too few (≤3) suggests under-decomposed; too many (≥15) suggests duplicates or over-fine granularity. Battery storage typically 6-9; consumer IoT 5-8; vertical farm 6-9; medical device 4-7.
2. module_distinctness — every module's purpose should be functionally distinct. Penalise overlap such as "Container Shell" + "Outer Enclosure" + "Structural Frame" all describing the same physical part. Penalise repeats like "Battery Module" appearing 3× when the project has one battery sub-system with 3 racks.
3. domain_coverage — are the major sub-systems for this product class present? Battery storage needs cells + BMS + PCS + cooling + fire safety + container; vertical farm needs lights + nutrients + climate + structure; connected IoT needs power + compute + radio + sensor + enclosure. Missing a major sub-system scores low.
4. mass_rollup_plausibility — does sum of module masses match a plausible total for this project class? 40 ft BESS ~30-40 t (gross 40 t flatbed limit); £220 garden bird feeder ~3-5 kg; container farm ~5-8 t; container desal ~7-12 t; walking stick + electronics ~0.5 kg.
5. key_parts_coverage — do modules carry key parts? Modules with zero key parts indicate Max didn't carry decomposition through. Score by % of modules with ≥3 key parts.
6. naming_clarity — are module names specific and engineering-clear ("LFP battery rack with cooling plate" vs "Battery system")? Generic / vague names score low.

Output JSON ONLY:
{
  "dimensions": {
    "module_count_plausibility": <0-10>,
    "module_distinctness": <0-10>,
    "domain_coverage": <0-10>,
    "mass_rollup_plausibility": <0-10>,
    "key_parts_coverage": <0-10>,
    "naming_clarity": <0-10>
  },
  "summary": "one-line aggregate observation",
  "next_fix": "the single highest-leverage prompt change to lift this score, or null if at 8+",
  "missing_subsystems": ["…"],
  "duplicate_pairs": [["module a", "module b"]]
}`
    },

    async fireCouncil(input, output): Promise<StageScore> {
        const prompt = maxDecomposeAdapter.buildCouncilPrompt(input, output)
        const result = await callOpenRouter({
            model: "anthropic/claude-sonnet-4-6",
            system:
                "You are a chartered UK engineer scoring AI-generated module decompositions for hardware products. Output JSON only.",
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
        const costPence =
            Math.ceil(
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
