/**
 * @file cost/page.tsx — /the-forge-v2/projects/:id/cost
 *
 * @description Cost artefact — mockup-faithful port of FORGE-MOCKUP-COST.html.
 * Server component reads the project, builds the cost hero (Unit BOM · +OFE ·
 * +NRE · =All-in) + waterfall rows (one per module) + ceiling comparison, then
 * hands a typed props bundle to CostView for rendering.
 *
 * Data sources, slot by slot:
 *   - project.aiCostEstimates[moduleId].totalPerUnit  → waterfall rows + Unit BOM
 *   - project.aiCostEstimates[moduleId].confidence    → source tag per row
 *   - project.modules[].name / .id / .keyParts        → row name + category heuristic
 *   - project.research.designBrief.constraints.unitCostCeilingGbp → ceiling bar
 *   - material_properties / standard_hardware / process_capabilities → grounding pills
 *
 * Empty-state policy (no mockup content leaks):
 *   - OFE solar + NRE amortised → null until declared on the Brief (card renders
 *     "Not declared on Brief" subtitle; All-in excludes them)
 *   - Quote-vs-benchmark table → honest empty state until RFQ responses exist
 *   - No ceiling declared → neutral grey bar with caption
 *
 * @related
 *   - View:   ./cost-view.tsx
 *   - Styles: ./cost-v2.css (scoped .c2)
 *   - Mockup: FORGE-MOCKUP-COST.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { createClient } from "@/lib/supabase/server"

import { CostView, type CostCategory, type CostViewProps, type CostWaterfallRow } from "./cost-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Cost · The Forge" }
    return { title: `Cost · ${r.project.name}` }
}

export default async function ForgeV2CostPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()

    const project = result.project
    const modules = project.modules ?? []
    const estimatesById = project.aiCostEstimates ?? {}

    // ── 1. Waterfall rows — one per module, real data only ──────────────
    const rows: CostWaterfallRow[] = []
    let unitBomTotal: number | null = null

    for (const m of modules) {
        const est = estimatesById[m.id]
        if (!est || typeof est.totalPerUnit !== "number") continue

        const valueGbp = est.totalPerUnit
        const { category, categoryLabel } = inferCategory(m.id, m.name, m.keyParts ?? [])
        const confidence = est.confidence ?? "medium"

        rows.push({
            id: m.id,
            name: m.name,
            category,
            categoryLabel,
            valueGbp,
            source: `Specialist estimate · ${confidence} confidence`,
            href: `/the-forge-v2/projects/${project.id}/modules/${m.id}`,
        })

        unitBomTotal = (unitBomTotal ?? 0) + valueGbp
    }

    // Sort descending by value so the biggest bars show first — founders read
    // the waterfall top-to-bottom, largest-cost-first, so the shape of the
    // project's spend is obvious without scanning.
    rows.sort((a, b) => b.valueGbp - a.valueGbp)

    // ── 2. Brief-driven constraints ─────────────────────────────────────
    const ceilingGbp =
        project.research?.designBrief?.constraints?.unitCostCeilingGbp ?? null

    // OFE + NRE are not yet declared on the brief schema. Honest null until
    // a follow-up migration adds them. The view renders "Not declared on Brief"
    // for each. All-in falls back to unitBomTotal + (OFE ?? 0) + (NRE ?? 0).
    const ofeGbp: number | null = null
    const nreGbp: number | null = null

    const allInGbp =
        unitBomTotal != null
            ? unitBomTotal + (ofeGbp ?? 0) + (nreGbp ?? 0)
            : null

    // ── 3. Engineering library grounding counts ─────────────────────────
    const grounding = await safeLibraryCounts()

    const viewProps: CostViewProps = {
        project: {
            id: project.id,
            name: project.name,
            designRevision: project.designRevision,
        },
        allInGbp,
        unitBomGbp: unitBomTotal,
        ofeGbp,
        nreGbp,
        ceilingGbp,
        rows,
        grounding,
    }

    return <CostView {...viewProps} />
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Heuristic category mapper off module id/name/keyParts. The mockup groups
 * rows into Structure / Electrical / Propulsion / Labour / Inspect / Logistics
 * / OFE / NRE. We don't have structured tagging yet so we infer from text
 * tokens — biased toward precision ("wing" → Structure) with a neutral
 * fallback so we never fabricate a category we can't justify.
 */
function inferCategory(
    id: string,
    name: string,
    keyParts: string[],
): { category: CostCategory; categoryLabel: string } {
    const haystack = `${id} ${name} ${keyParts.join(" ")}`.toLowerCase()

    // Solar / OFE tokens
    if (/solar|photovoltaic|pv cell|ibc/.test(haystack)) {
        return { category: "solar", categoryLabel: "OFE · Solar" }
    }
    // Propulsion
    if (/propulsion|motor|propeller|prop |esc |rotor|thrust/.test(haystack)) {
        return { category: "prop", categoryLabel: "Propulsion" }
    }
    // Electrical / avionics / battery
    if (/battery|mppt|avionic|imu|pcba|flight computer|radio|comms|wiring|harness|sensor/.test(haystack)) {
        return { category: "electrical", categoryLabel: "Electrical" }
    }
    // Structure — wing, fuselage, tail, airframe, spar, rib, skin, chassis, frame
    if (/wing|fuselage|tail|airframe|spar|rib|skin|chassis|frame|structure|cfrp|composite/.test(haystack)) {
        return { category: "structure", categoryLabel: "Structure" }
    }
    // Labour / assembly
    if (/assembly|integration|labour|labor|layup/.test(haystack)) {
        return { category: "labour", categoryLabel: "Labour" }
    }
    // Inspect / test
    if (/inspect|test|ndt|metrology|fai|qa|quality/.test(haystack)) {
        return { category: "inspect", categoryLabel: "Inspect" }
    }
    // Logistics
    if (/freight|logistics|packaging|shipping|duty|tax/.test(haystack)) {
        return { category: "logistics", categoryLabel: "Logistics" }
    }
    // NRE / tooling
    if (/tooling|nre|autoclave|fixture/.test(haystack)) {
        return { category: "nre", categoryLabel: "NRE" }
    }

    return { category: "neutral", categoryLabel: "Module" }
}

async function safeLibraryCounts(): Promise<{ materials: number; hardware: number; processes: number }> {
    try {
        const supabase = await createClient()
        const [m, h, p] = await Promise.all([
            supabase.from("material_properties").select("*", { count: "exact", head: true }),
            supabase.from("standard_hardware").select("*", { count: "exact", head: true }),
            supabase.from("process_capabilities").select("*", { count: "exact", head: true }),
        ])
        return {
            materials: m.count ?? 0,
            hardware: h.count ?? 0,
            processes: p.count ?? 0,
        }
    } catch (err) {
        console.error("[COST-PAGE] library counts failed:", err)
        return { materials: 0, hardware: 0, processes: 0 }
    }
}
