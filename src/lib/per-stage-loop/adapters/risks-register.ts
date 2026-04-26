/**
 * @file adapters/risks-register.ts — per-stage adapter for the risks register.
 *
 * @description Reads `cad_lab_projects.modules[].riskMatrix` (the FMEA-shape
 * structured risk array) for each demo and scores it 0-10. Loop 7 critique
 * findings: severity unrealistically clustered ("all medium/high"),
 * residuals magically all "low/medium", no risks for major programme
 * threats (PSTI failure, cost overrun, supplier single-source).
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

interface RiskRow {
    id?: string
    hazard?: string
    cause?: string
    consequence?: string
    severity?: number
    likelihood?: number
    existingControls?: string
    mitigation?: string
    residualSeverity?: number
    residualLikelihood?: number
    owner?: string
}

export const risksRegisterAdapter: StageAdapter = {
    name: "fang-review",
    // Note: re-using the StageName "fang-review" since the risk register
    // is one of Fang's outputs. Could fork into its own StageName later.

    async selfCheck() {
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
            const slug = DEMO_PROJECT_IDS.find((p) => p.id === r.id)?.slug ?? "unknown"
            const subject = typeof r.subject === "string" ? r.subject : ""
            const modules = Array.isArray(r.modules)
                ? (r.modules as Array<Record<string, unknown>>)
                : []
            const allRisks: RiskRow[] = []
            for (const m of modules) {
                const matrix = m.riskMatrix as RiskRow[] | undefined
                if (Array.isArray(matrix)) allRisks.push(...matrix)
            }
            inputs.push({
                id: slug,
                label: typeof r.name === "string" ? r.name : slug,
                payload: {
                    subject: subject.slice(0, 1500),
                    risks: allRisks,
                    moduleCount: modules.length,
                },
            })
        }
        return inputs
    },

    async runOne(input): Promise<StageOutput> {
        const risks = (input.payload.risks as RiskRow[]) ?? []
        const moduleCount = (input.payload.moduleCount as number) ?? 0

        // Severity distribution
        const sevDist: Record<number, number> = {}
        const likDist: Record<number, number> = {}
        const residSevDist: Record<number, number> = {}
        for (const r of risks) {
            if (typeof r.severity === "number") sevDist[r.severity] = (sevDist[r.severity] ?? 0) + 1
            if (typeof r.likelihood === "number") likDist[r.likelihood] = (likDist[r.likelihood] ?? 0) + 1
            if (typeof r.residualSeverity === "number") residSevDist[r.residualSeverity] = (residSevDist[r.residualSeverity] ?? 0) + 1
        }
        const ownerFilled = risks.filter((r) => r.owner && r.owner.trim().length > 0).length
        const mitigationFilled = risks.filter((r) => r.mitigation && r.mitigation.trim().length > 0).length

        return {
            inputId: input.id,
            loop: 0,
            engineCommit: "",
            elapsedMs: 0,
            costPence: 0,
            output: {
                riskCount: risks.length,
                moduleCount,
                severityDist: sevDist,
                likelihoodDist: likDist,
                residualSeverityDist: residSevDist,
                ownerFilled,
                mitigationFilled,
                sample: risks.slice(0, 8),
            },
            diagnostics: risks.length === 0 ? ["no risks declared"] : [],
        }
    },

    buildCouncilPrompt(input, output) {
        const subject =
            typeof input.payload.subject === "string"
                ? (input.payload.subject as string).slice(0, 800)
                : ""
        const out = output.output as Record<string, unknown>
        const sample = out.sample as RiskRow[]

        return `You are scoring a UK hardware engineering project's risk register on its quality as an FMEA-style risk matrix. The register drives go/no-go gates, mitigation budget, and insurer conversations.

PROJECT SUBJECT (excerpt):
${subject}

RISK SAMPLE (first 8 of ${out.riskCount} rows):
${JSON.stringify(sample, null, 2).slice(0, 4500)}

Score 0-10 on each dimension:

1. severity_distribution_realism — across the register, is the severity column distributed plausibly? Penalise "everything is severity 3" or "everything is severity 5". Real registers have a spread.
2. residual_realism — after mitigation, residuals should NOT all collapse to "low". Penalise registers where every residual lands at S2L1 or similar (looks like the engine is fudging the post-mitigation rating).
3. mitigation_specificity — does each mitigation name a concrete action ("Specify pressure-tested gaskets per BS EN 12266-1 with 1.5x design pressure soak test for 60 min") or is it generic ("Improve quality control")?
4. owner_role_specific — is the owner a real role (Battery safety lead / Electrical engineer / Founder) or boilerplate "TBD" / "Project manager"?
5. coverage_of_programme_risks — does the register include the obvious major risks for this product class (cost overrun, single-supplier failure, regulatory denial, programme slip past launch window)? Engineering risks are necessary but insufficient.

Output JSON ONLY:
{
  "dimensions": {
    "severity_distribution_realism": <0-10>,
    "residual_realism": <0-10>,
    "mitigation_specificity": <0-10>,
    "owner_role_specific": <0-10>,
    "coverage_of_programme_risks": <0-10>
  },
  "summary": "one-line aggregate",
  "next_fix": "highest-leverage prompt change OR null if at 8+",
  "missing_programme_risks": ["..."]
}`
    },

    async fireCouncil(input, output): Promise<StageScore> {
        const prompt = risksRegisterAdapter.buildCouncilPrompt(input, output)
        try {
            const result = await callOpenRouter({
                model: "anthropic/claude-sonnet-4-6",
                system:
                    "You are a chartered UK engineer scoring AI-generated risk registers. Output JSON only.",
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
                    summary: `council failed: ${result.error}`,
                    nextFix: null,
                    costPence: 0,
                }
            }
            const text = result.text.trim()
            const j0 = text.indexOf("{")
            const j1 = text.lastIndexOf("}")
            const parsed = JSON.parse(text.slice(j0, j1 + 1)) as {
                dimensions?: Record<string, number>
                summary?: string
                next_fix?: string | null
            }
            const dimensions: Record<string, number> = {}
            for (const [k, v] of Object.entries(parsed.dimensions ?? {})) {
                if (typeof v === "number") dimensions[k] = Math.max(0, Math.min(10, v))
            }
            const score =
                Object.values(dimensions).reduce((a, b) => a + b, 0) /
                Math.max(1, Object.keys(dimensions).length)
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
                summary: parsed.summary ?? "",
                nextFix: parsed.next_fix ?? null,
                costPence,
            }
        } catch (err) {
            return {
                inputId: input.id,
                score: 0,
                dimensions: {},
                summary: `council threw: ${err instanceof Error ? err.message : err}`,
                nextFix: null,
                costPence: 0,
            }
        }
    },
}
