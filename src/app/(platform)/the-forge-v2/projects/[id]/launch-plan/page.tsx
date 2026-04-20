/**
 * @file launch-plan/page.tsx — /the-forge-v2/projects/:id/launch-plan
 *
 * @description Launch Checklist — mockup-faithful port of
 * FORGE-MOCKUP-LAUNCH.html. Server component loads the project and hands a
 * typed props bundle to LaunchPlanView.
 *
 * Launch Checklist is the one-shot pre-ship gate: Go/No-go checklist, FAI,
 * regulatory compliance, packaging + shipping, launch date, comms plan,
 * press release, customer comms and post-launch metrics plan. It sits
 * dormant until at least one make-category is fully awarded, then unlocks
 * and archives after first delivery.
 *
 * Empty-state policy: almost every field the mockup shows (FAI owners,
 * compliance test houses, packaging vendors, launch date, comms drafts,
 * success metrics) DOES NOT EXIST in the database yet. We render the
 * mockup's sections verbatim but every item is an honest "not yet
 * declared" / "not drafted yet" slot. Real data gates populate only where
 * we can check them: brief-lock state, CAD module count, and supplier
 * shortlist state.
 *
 * @related
 *   - View:   ./launch-plan-view.tsx
 *   - Styles: ./launch-plan-v2.css (scoped .lp2)
 *   - Mockup: FORGE-MOCKUP-LAUNCH.html
 *   - Sibling: ../launch/ (launch-handoff, different artefact)
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"

import {
    LaunchPlanView,
    type LaunchPlanViewProps,
} from "./launch-plan-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Launch Checklist · The Forge" }
    return { title: `Launch Checklist · ${r.project.name}` }
}

export default async function ForgeV2LaunchPlanPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()

    const project = result.project
    const modules = project.modules ?? []

    // ── Real-data gates for the checklist ──────────────────────────
    // These are the only items we can check today. Everything else stays
    // in honest empty state until the downstream feeds land.
    const briefLocked = project.briefLockedAt != null
    const hasModules = modules.length > 0
    // "CAD uploaded" proxy: any module with a unified or individual result.
    const hasCad = modules.some(
        (m) => Boolean((m as { stlUrl?: string | null }).stlUrl) ||
               Boolean((m as { stepUrl?: string | null }).stepUrl) ||
               Boolean(project.integratedAssemblyStlUrl) ||
               Boolean(project.integratedAssemblyStepUrl),
    )

    // Quantity target + target first-ship date from brief constraints.
    const quantityTarget =
        typeof project.research?.designBrief?.quantityTarget === "string" &&
        project.research.designBrief.quantityTarget.trim().length > 0
            ? project.research.designBrief.quantityTarget.trim()
            : null
    const firstShipDateIso = project.research?.designBrief?.constraints?.firstShipDate ?? null

    const viewProps: LaunchPlanViewProps = {
        project: {
            id: project.id,
            name: project.name,
            designRevision: project.designRevision,
        },
        brief: {
            quantityTarget,
            firstShipDateIso,
        },
        gates: {
            briefLocked,
            hasModules,
            moduleCount: modules.length,
            hasCad,
            // No supplier-award feed exists yet. Dormant banner in the
            // mockup keys off "first batch awarded" — we surface the same
            // dormant banner because no awards can exist yet.
            firstBatchAwarded: false,
        },
    }

    return <LaunchPlanView {...viewProps} />
}
