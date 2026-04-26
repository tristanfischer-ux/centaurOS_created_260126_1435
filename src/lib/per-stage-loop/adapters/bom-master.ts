/**
 * @file adapters/bom-master.ts — per-stage adapter for the BOM master output.
 *
 * @description Scores the post-BOM-generation output for each of the 5
 * demo projects. Reads `cad_lab_projects.parts` row count + per-row
 * fields + the modules' keyParts coverage, fires a single Sonnet
 * council call on quality dimensions.
 *
 * Dimensions (0-10 each, mean → aggregate score):
 *
 * - row_count_plausibility — too few BOM rows for the project class is
 *   under-specified; too many is duplicate/over-fanned-out.
 * - quantity_field_present — Loop 7 critique: VertFarm BOM had no
 *   quantities on most rows ("160 bars × £600 each" with no qty
 *   column). % of rows with non-null quantity.
 * - cost_field_present — % of rows with a non-null estimated unit cost.
 * - mass_field_present — % of rows with a non-null mass.
 * - process_material_named — % of rows with non-null process AND material.
 * - module_attribution — every BOM row should have a source_source_module_id.
 *   % of rows with valid attribution.
 * - mutex_resolved — Loop 5 P5 shipped a mutex resolver. Score by
 *   absence of obvious-architectural-alternatives-as-rows
 *   (council-judged).
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

interface PartRow {
    id: string
    part_number: string | null
    name: string | null
    process: string | null
    material: string | null
    mass_kg: number | null
    estimated_unit_cost_gbp: number | null
    quantity: number | null
    source_module_id: string | null
    is_purchased: boolean | null
}

export const bomMasterAdapter: StageAdapter = {
    name: "bom-expand",

    async selfCheck() {
        const admin = createAdminClient()
        const { count, error } = await admin
            .from("parts")
            .select("id", { count: "exact", head: true })
            .in(
                "cad_lab_project_id",
                DEMO_PROJECT_IDS.map((p) => p.id),
            )
        if (error) return { ok: false, error: error.message }
        if (!count || count < 30)
            return {
                ok: false,
                error: `expected at least 30 BOM rows across 5 demos, found ${count ?? 0}`,
            }
        return { ok: true }
    },

    async loadGoldenInputs(): Promise<StageGoldenInput[]> {
        const admin = createAdminClient()
        const inputs: StageGoldenInput[] = []
        for (const { id, slug } of DEMO_PROJECT_IDS) {
            const [{ data: project }, { data: parts }] = await Promise.all([
                admin
                    .from("cad_lab_projects")
                    .select("name, subject, modules")
                    .eq("id", id)
                    .maybeSingle(),
                admin
                    .from("parts")
                    .select("id, part_number, name, process, material, mass_kg, estimated_unit_cost_gbp, source_module_id, is_purchased")
                    .eq("cad_lab_project_id", id),
            ])
            if (!project) continue
            const subject = typeof project.subject === "string" ? project.subject : ""
            const modulesArr = Array.isArray(project.modules)
                ? (project.modules as unknown[])
                : []
            inputs.push({
                id: slug,
                label: typeof project.name === "string" ? project.name : slug,
                payload: {
                    subject: subject.slice(0, 1500),
                    parts: (parts ?? []).map((p) => ({
                        ...p,
                        quantity: 1, // No quantity column today (Loop 7 finding)
                    })) as PartRow[],
                    moduleCount: modulesArr.length,
                },
            })
        }
        return inputs
    },

    async runOne(input): Promise<StageOutput> {
        const parts = (input.payload.parts as PartRow[]) ?? []
        const moduleCount = (input.payload.moduleCount as number) ?? 0

        const fieldFilled = (k: keyof PartRow) =>
            parts.filter((p) => {
                const v = p[k]
                return v != null && v !== ""
            }).length

        return {
            inputId: input.id,
            loop: 0,
            engineCommit: "",
            elapsedMs: 0,
            costPence: 0,
            output: {
                rowCount: parts.length,
                moduleCount,
                hasQuantity: fieldFilled("quantity"),
                hasCost: fieldFilled("estimated_unit_cost_gbp"),
                hasMass: fieldFilled("mass_kg"),
                hasProcess: fieldFilled("process"),
                hasMaterial: fieldFilled("material"),
                hasModuleId: fieldFilled("source_module_id"),
                samplePartNumbers: parts.slice(0, 12).map((p) => p.part_number),
            },
            diagnostics: parts.length === 0 ? ["no BOM rows"] : [],
        }
    },

    buildCouncilPrompt(input, output) {
        const subject =
            typeof input.payload.subject === "string"
                ? (input.payload.subject as string).slice(0, 800)
                : ""
        const parts = input.payload.parts as PartRow[]
        const sample = parts.slice(0, 25).map((p) => ({
            number: p.part_number,
            name: p.name,
            process: p.process,
            material: p.material,
            mass_kg: p.mass_kg,
            cost: p.estimated_unit_cost_gbp,
            source_module_id: p.source_module_id,
        }))

        return `You are scoring a UK hardware engineering project's BOM master output. The BOM is the deterministic part list that drives cost, supplier matching, and procurement.

PROJECT SUBJECT (excerpt):
${subject}

BOM SAMPLE (first 25 of ${parts.length} rows):
${JSON.stringify(sample, null, 2).slice(0, 6000)}

Score 0-10 on each dimension:

1. row_count_plausibility — for this project class, is the BOM-row count reasonable (not too sparse, not duplicate-fanned)?
2. mutex_resolved — does the BOM represent ONE buildable configuration, or does it list architectural alternatives as parallel rows (e.g. ceramic + steel + composite all priced as if all three are bought)? Penalise alternatives-as-rows.
3. naming_specificity — are part names specific ("LFP 280 Ah prismatic cell" vs "Battery cell")?
4. process_material_realism — for each row, is the process+material pairing physically realistic for the part?
5. module_attribution_correctness — does each part attribute to a sensible module (battery cells → battery rack, not container shell)?

Output JSON ONLY:
{
  "dimensions": {
    "row_count_plausibility": <0-10>,
    "mutex_resolved": <0-10>,
    "naming_specificity": <0-10>,
    "process_material_realism": <0-10>,
    "module_attribution_correctness": <0-10>
  },
  "summary": "one-line aggregate observation",
  "next_fix": "highest-leverage prompt change OR null if at 8+",
  "alternative_listed_as_row_examples": [{"part": "...", "alternative": "..."}]
}`
    },

    async fireCouncil(input, output): Promise<StageScore> {
        // Deterministic field-coverage dimensions first.
        const out = output.output as unknown as {
            rowCount: number
            moduleCount: number
            hasQuantity: number
            hasCost: number
            hasMass: number
            hasProcess: number
            hasMaterial: number
            hasModuleId: number
        }
        const safeTotal = Math.max(1, out.rowCount)
        const quantityFieldPresent = (out.hasQuantity / safeTotal) * 10
        const costFieldPresent = (out.hasCost / safeTotal) * 10
        const massFieldPresent = (out.hasMass / safeTotal) * 10
        const processMaterialNamed =
            (Math.min(out.hasProcess, out.hasMaterial) / safeTotal) * 10
        const moduleAttribution = (out.hasModuleId / safeTotal) * 10

        // Then call the council for the LLM-judged dimensions.
        const llmDims: Record<string, number> = {}
        let summary = ""
        let nextFix: string | null = null
        let costPence = 0
        try {
            const prompt = bomMasterAdapter.buildCouncilPrompt(input, output)
            const result = await callOpenRouter({
                model: "anthropic/claude-sonnet-4-6",
                system:
                    "You are a chartered UK hardware engineer scoring AI-generated BOM masters. Output JSON only.",
                prompt,
                maxTokens: 2500,
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
                    for (const [k, v] of Object.entries(parsed.dimensions ?? {})) {
                        if (typeof v === "number") {
                            llmDims[k] = Math.max(0, Math.min(10, v))
                        }
                    }
                    if (typeof parsed.summary === "string") summary = parsed.summary
                    if (typeof parsed.next_fix === "string") nextFix = parsed.next_fix
                }
                costPence =
                    Math.ceil(
                        ((result.inputTokens / 1_000_000) * 3 +
                            (result.outputTokens / 1_000_000) * 15) *
                            80 *
                            100,
                    ) || 1
            }
        } catch (err) {
            summary = `council failed: ${err instanceof Error ? err.message : err}`
        }

        const dimensions: Record<string, number> = {
            quantity_field_present: round1(quantityFieldPresent),
            cost_field_present: round1(costFieldPresent),
            mass_field_present: round1(massFieldPresent),
            process_material_named: round1(processMaterialNamed),
            module_attribution: round1(moduleAttribution),
            ...Object.fromEntries(
                Object.entries(llmDims).map(([k, v]) => [k, round1(v)]),
            ),
        }
        const dimVals = Object.values(dimensions)
        const score =
            dimVals.length > 0
                ? dimVals.reduce((a, b) => a + b, 0) / dimVals.length
                : 0

        return {
            inputId: input.id,
            score,
            dimensions,
            summary:
                summary ||
                `${out.rowCount} BOM rows; ${out.hasCost}/${out.rowCount} with cost, ${out.hasMass}/${out.rowCount} with mass, ${out.hasProcess}/${out.rowCount} with process.`,
            nextFix,
            costPence,
        }
    },
}

function round1(n: number): number {
    return Math.round(n * 10) / 10
}
