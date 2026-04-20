/**
 * @file operations/page.tsx — /the-forge-v2/projects/:id/operations
 *
 * @description Operations artefact — mockup-faithful port of
 * FORGE-MOCKUP-OPERATIONS.html. Server component loads the project,
 * aggregates module-level lead-time / mass data, and hands a typed props
 * bundle to OperationsView.
 *
 * Operations is the "build the thing" surface — production cadence, station
 * schedule, assembly milestones, inspection / FAI gates, shipping plan,
 * BOM-watch, supplier scorecards, revisions, compliance calendar.
 *
 * Empty-state policy: almost every field the mockup shows — station
 * assignments, FAI schedule, ship-date milestones, takt / cycle time, BOM
 * watch rows, supplier scorecard roll-ups, compliance renewals — DOES NOT
 * EXIST in the database yet. We render the mockup's structural sections
 * verbatim but fill every data slot with an honest empty state. We NEVER
 * mirror the mockup's HAPS / Drone / T-Motor / Astra example content when
 * the data isn't real.
 *
 * @related
 *   - View:   ./operations-view.tsx
 *   - Styles: ./operations-v2.css (scoped .op2)
 *   - Mockup: FORGE-MOCKUP-OPERATIONS.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import type { CadLabModule } from "@/lib/cad-lab-types"

import {
    OperationsView,
    type OperationsProductionRow,
    type OperationsViewProps,
} from "./operations-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Operations · The Forge" }
    return { title: `Operations · ${r.project.name}` }
}

export default async function ForgeV2OperationsPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()

    const project = result.project
    const modules = project.modules ?? []

    // ── Quantity target from brief (if declared) ─────────────────
    const quantityTarget =
        typeof project.research?.designBrief?.quantityTarget === "string" &&
        project.research.designBrief.quantityTarget.trim().length > 0
            ? project.research.designBrief.quantityTarget.trim()
            : null

    // ── First-ship date from brief constraints (if declared) ─────
    const firstShipDateIso = project.research?.designBrief?.constraints?.firstShipDate ?? null

    // ── Module-level production roll-up ──────────────────────────
    // Each module becomes a row in the "Production timeline" shell. Lead
    // weeks drives the skeleton band width. No real station assignments or
    // takt data exists yet — those slots render honest em-dashes.
    const longestLead = modules.reduce(
        (acc, m) => (typeof m.leadWeeks === "number" && m.leadWeeks > acc ? m.leadWeeks : acc),
        0,
    )
    // Track which module owns the longest lead so the summary tile can
    // surface that module's provenance tag next to the week number.
    const longestLeadModule = modules.find(
        (m) => typeof m.leadWeeks === "number" && m.leadWeeks === longestLead && longestLead > 0,
    )
    const longestLeadSource: CadLabModule["leadTimeSource"] | null =
        longestLeadModule ? ((longestLeadModule as CadLabModule).leadTimeSource ?? null) : null
    const productionRows: OperationsProductionRow[] = modules.map((m, i) => ({
        id: m.id,
        moduleNum: `M${i + 1}`,
        moduleName: m.name,
        leadWeeks: typeof m.leadWeeks === "number" ? m.leadWeeks : null,
        // Forward the module's provenance tag so the view can render a chip
        // next to every lead-time week number. Falls back to null when the
        // module hasn't been tagged — the view then renders "source unknown".
        leadTimeSource:
            (m as CadLabModule).leadTimeSource ?? null,
        // Band width as a fraction of the longest lead-time, so the
        // skeleton timeline is visually coherent without fabricating dates.
        bandFraction:
            typeof m.leadWeeks === "number" && longestLead > 0
                ? Math.max(0.15, m.leadWeeks / longestLead)
                : 0,
    }))

    // ── Mass roll-up for the summary strip ───────────────────────
    const currentMassKg = modules.every((m) => typeof m.estimatedMassKg !== "number")
        ? null
        : modules.reduce((acc, m) => acc + (typeof m.estimatedMassKg === "number" ? m.estimatedMassKg : 0), 0)
    const budgetMassKg = modules.every((m) => {
        const budget = (m as { budgetMassKg?: number }).budgetMassKg
        return typeof budget !== "number"
    })
        ? null
        : modules.reduce((acc, m) => {
            const budget = (m as { budgetMassKg?: number }).budgetMassKg
            return acc + (typeof budget === "number" ? budget : 0)
        }, 0)

    const viewProps: OperationsViewProps = {
        project: {
            id: project.id,
            name: project.name,
            designRevision: project.designRevision,
        },
        brief: {
            quantityTarget,
            firstShipDateIso,
        },
        summary: {
            moduleCount: modules.length,
            longestLeadWeeks: longestLead > 0 ? longestLead : null,
            longestLeadSource,
            currentMassKg,
            budgetMassKg,
        },
        productionRows,
    }

    return <OperationsView {...viewProps} />
}
