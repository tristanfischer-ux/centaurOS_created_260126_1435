/**
 * @file validate/market-sizing/page.tsx
 *    /the-forge-v2/projects/:id/validate/market-sizing
 *
 * @description Market sizing artefact — mockup-faithful port of
 * FORGE-MOCKUP-MARKET-SIZING.html. Server component loads the project for
 * name + industry hint, then hands a typed props bundle to MarketSizingView
 * for rendering.
 *
 * Data sources, slot by slot:
 *   - project.name                                      → breadcrumb + title
 *   - project.research.industryDomain                   → industry hint chip
 *     falls back to designBrief.useCase when industry isn't inferred.
 *
 * Empty-state policy (no mockup content leaks):
 *   - No `market_sizing` table exists today. Every numeric tile renders
 *     "—". Methodology picker, computation inputs, drivers, CI band and
 *     source cards all render in neutral/placeholder state.
 *   - Inputs are interactive client-side but disabled so no fabricated
 *     values are entered or persisted.
 *   - When the validation store ships, a subsequent change will swap
 *     placeholders for loaded data; nothing here pretends a number exists
 *     today.
 *
 * @related
 *   - View:   ./market-sizing-view.tsx
 *   - Styles: ./market-sizing-v2.css (scoped `.ms2`)
 *   - Mockup: FORGE-MOCKUP-MARKET-SIZING.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"

import { MarketSizingView, type MarketSizingViewProps } from "./market-sizing-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Market sizing · The Forge" }
    return { title: `Market sizing · ${r.project.name}` }
}

export default async function ForgeV2MarketSizingPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()

    const project = result.project

    // Industry hint is best-effort — we pull it from the brief's useCase
    // when a brief has been saved on the project. Null otherwise; the view
    // gracefully omits the chip. When the validation store lands, a first-
    // class industry field will supersede this fallback.
    const useCase = project.research?.designBrief?.useCase?.trim() ?? null
    const industryHint = useCase && useCase.length > 0 ? useCase : null

    const viewProps: MarketSizingViewProps = {
        project: {
            id: project.id,
            name: project.name,
        },
        industryHint,
    }

    return <MarketSizingView {...viewProps} />
}
