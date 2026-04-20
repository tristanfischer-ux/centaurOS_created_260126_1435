/**
 * @file brief/page.tsx — /the-forge-v2/projects/:id/brief (V2 — mockup-faithful rebuild).
 *
 * @description Brief artefact — the anchor spec (intent · target markets ·
 * regulatory envelope · constraints) that every downstream artefact (BOM,
 * Suppliers, Risks, Cost) cites. Server component that loads the project
 * + ancillary data in parallel, then hands a typed props bundle to
 * BriefView for rendering. If a field does not exist in the schema yet
 * (see the schema-gaps list at the foot of this file) we pass `null` and
 * the view renders the neutral empty-state variant of that slot. We
 * NEVER synthesise the mockup's HAPS content — real or empty, never fake.
 *
 * Data sources, slot by slot:
 *   - project.name / project.subject              → breadcrumb + product line
 *   - project.research.designBrief.quantityTarget → Batch 1 constraint slot
 *   - modules[].estimatedMassKg (sum)             → Mass budget card
 *   - project.aiCostEstimates (sum totalPerUnit)  → All-in cost card
 *   - design_standards (aerospace/quality/reg...) → Regulatory posture grid
 *   - project.systemIllustrationUrl               → Concept render hero pane
 *   - project.designRevision + createdAt          → Revision history (1 row)
 *
 * Schema gaps that force empty states (TODO follow-up migrations):
 *   - projects.brief_locked_at column (lock chip + green banner state)
 *   - brief_revisions table (multi-row revision history)
 *   - designBrief.mission / targetCustomers / whyNow (narrative fields)
 *   - designBrief.constraints.{unitCostCeilingGbp, firstShipDate,
 *     maxMassKg, batchSize, markets, productionRegion}
 *   - designBrief.regulatory[] (structured posture per standard)
 *
 * If loadCadLabProject returns an error or null we 404 so bogus ids
 * don't leak project existence across foundries.
 *
 * @related
 *   - View:   ./brief-view.tsx
 *   - Styles: ./brief-v2.css (scoped .b2 — do NOT modify)
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"

import { BriefView, type BriefViewProps, type RegulatoryStandardRow } from "./brief-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Brief · The Forge",
    description: "The anchor spec — intent, target markets, regulatory envelope, constraints.",
}

export default async function ForgeV2BriefPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params

    // ── 1. Fetch project + ancillary data in parallel ──────────────────
    // loadCadLabProject enforces auth + foundry scoping inside withAuth.
    // design_standards is a public read so we can fire it in parallel.
    // If the project load fails we 404 after both settle — saves one
    // round-trip for the happy path without waiting on a failed query.
    const [loadResult, regulatoryStandards] = await Promise.all([
        loadCadLabProject(id),
        safeRegulatoryStandards(),
    ])
    if ("error" in loadResult || !loadResult.project) {
        notFound()
    }
    const project = loadResult.project

    // ── 3. Derived numbers off the project row ─────────────────────────
    const modules = project.modules ?? []

    // Mass budget — sum estimatedMassKg across modules when present.
    // Null if no module has a mass yet → card renders the "no modules"
    // empty state. Decimal arithmetic is fine for display (2 dp).
    const moduleMassesKg = modules
        .map((m) => (typeof m.estimatedMassKg === "number" ? m.estimatedMassKg : null))
        .filter((v): v is number => v !== null)
    const totalMassKg = moduleMassesKg.length > 0
        ? moduleMassesKg.reduce((acc, v) => acc + v, 0)
        : null

    // All-in cost — sum AiCostEstimate.totalPerUnit across modules.
    // Null if nothing has been estimated yet.
    const costRows = Object.values(project.aiCostEstimates ?? {})
    const totalUnitCostGbp = costRows.length > 0
        ? costRows.reduce((acc, row) => acc + (typeof row?.totalPerUnit === "number" ? row.totalPerUnit : 0), 0)
        : null

    // Brief narrative fields — none of these exist on CadLabDesignBrief today.
    // Schema-gap → always empty state.
    const designBrief = project.research?.designBrief ?? null
    const quantityTarget = designBrief?.quantityTarget?.trim() || null

    const viewProps: BriefViewProps = {
        project: {
            id: project.id,
            name: project.name,
            subject: project.subject,
            designRevision: project.designRevision,
            createdAt: project.createdAt,
            systemIllustrationUrl: project.systemIllustrationUrl,
        },
        // Lock state is not captured in schema yet. Always draft.
        lockState: {
            isLocked: false,
            lockedAt: null,
        },
        narrative: {
            // Mission / customers / whyNow fields not captured in
            // CadLabDesignBrief today → always null → empty state.
            mission: null,
            targetCustomers: null,
            whyNow: null,
        },
        constraints: {
            // Only Batch 1 (quantityTarget) exists on the brief today.
            unitCostCeiling: null,
            firstShipDate: null,
            maxMass: null,
            batchSize: quantityTarget,
            markets: null,
            productionRegion: null,
        },
        regulatory: regulatoryStandards,
        cost: {
            totalUnitCostGbp,
            unitCostCeilingGbp: null,
        },
        mass: {
            totalMassKg,
            maxMassKg: null,
            moduleCount: modules.length,
        },
    }

    return <BriefView {...viewProps} />
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Fetches regulatory standards candidates for the Brief's regulatory
 * posture grid.
 *
 * Strategy: pull rows whose industry_domain is in a broad engineering
 * set (aerospace / quality / regulatory / safety). We cap at 6 rows
 * since the grid is a fixed 6-tile layout. If we get back 0 rows the
 * view renders a single full-span empty-state tile.
 *
 * Status is always "not-started" here because we do not yet track
 * per-project compliance status. Follow-up: once a
 * project_compliance_packet table exists, join on it and infer status
 * (met / in-progress / not-started).
 */
async function safeRegulatoryStandards(): Promise<RegulatoryStandardRow[]> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from("design_standards")
            .select("standard_code, standard_name, summary, industry_domain")
            .in("industry_domain", ["aerospace", "quality", "regulatory", "safety"])
            .limit(6)
        if (error || !data) return []
        return data.map((r) => ({
            code: r.standard_code as string,
            name: r.standard_name as string,
            summary: typeof r.summary === "string"
                ? (r.summary.length > 96 ? `${r.summary.slice(0, 93)}…` : r.summary)
                : "",
            status: "not-started" as const,
        }))
    } catch (err) {
        console.error("[BRIEF-PAGE] regulatory standards failed:", err)
        return []
    }
}
