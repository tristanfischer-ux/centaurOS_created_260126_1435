/**
 * @file validate/competitors/[competitorId]/page.tsx
 *        /the-forge-v2/projects/:id/validate/competitors/:competitorId
 *
 * @description Competitor deep-dive drill-in from the validate flow. There
 * is no `competitors` table yet — competitor persistence ships with the
 * validation store — so this page always renders the layout with every
 * content-bearing surface in an honest empty state. The founder sees the
 * shape of the page they&apos;ll fill in (snapshot, products, channels,
 * moat, feature matrix, win/lose, overlap map) without any fabricated
 * competitor data.
 *
 * Mockup ref: FORGE-MOCKUP-COMPETITOR-DETAIL.html. Scoped CSS under `.cd2`.
 *
 * Route-param handling:
 *   - The parent project row IS loaded (via loadCadLabProject) for auth +
 *     foundry scoping, and to render the breadcrumb project name. If the
 *     project is missing / forbidden / bad id we 404.
 *   - The competitorId param is echoed in the breadcrumb only. There is no
 *     attempt to look it up today — every render is the empty-state layout.
 *     When the competitors table ships, swap the constant-view for a row
 *     lookup + data-wired view while keeping this route path.
 *
 * Empty-state policy: never fabricate mockup specifics (SunCulture, £69M,
 * RainMaker2, Kiambu, etc.). Every copy line here is either (a) a column
 * header / section title that also appears in the mockup, or (b) an honest
 * "populate once logged" hint.
 *
 * @related
 *   - View:   ./competitor-detail-view.tsx
 *   - Styles: ./competitor-detail-v2.css (scoped .cd2 — do NOT modify)
 *   - Mockup: FORGE-MOCKUP-COMPETITOR-DETAIL.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"

import { CompetitorDetailView } from "./competitor-detail-view"

export const dynamic = "force-dynamic"

// ─── Metadata ───────────────────────────────────────────────────────

export async function generateMetadata(
    { params }: { params: Promise<{ id: string; competitorId: string }> },
): Promise<Metadata> {
    const { id } = await params
    try {
        const result = await loadCadLabProject(id)
        if ("error" in result || !result.project) {
            return { title: "Competitor · The Forge" }
        }
        return { title: `Competitor · ${result.project.name} · The Forge` }
    } catch {
        return { title: "Competitor · The Forge" }
    }
}

// ─── Page ───────────────────────────────────────────────────────────

export default async function ForgeV2CompetitorDetailPage(
    { params }: { params: Promise<{ id: string; competitorId: string }> },
): Promise<React.ReactNode> {
    const { id, competitorId } = await params

    // ── Project load (auth + foundry scoping via withAuth) ─────────────
    // 404 only on missing project — `competitorId` is echoed by the view
    // because competitor persistence doesn't exist yet.
    const projectResult = await loadCadLabProject(id)
    if ("error" in projectResult || !projectResult.project) notFound()
    const project = projectResult.project

    return (
        <CompetitorDetailView
            project={{ id: project.id, name: project.name }}
            competitorId={competitorId}
        />
    )
}
