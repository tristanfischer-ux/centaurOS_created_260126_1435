/**
 * @file validate/lois/[loiId]/page.tsx — /the-forge-v2/projects/:id/validate/lois/:loiId
 *
 * @description Letter of Intent detail page. An LOI is the single
 * highest-weight piece of market evidence a pre-revenue founder produces:
 * a signed commercial commitment from a prospective customer or partner
 * covering parties, scope, pricing, deposit, delivery, and exclusivity.
 *
 * ── Data contract (as of 2026-04-20) ────────────────────────────────
 * There is NO `lois` table. The validation store has not shipped yet.
 * This page therefore loads only the project record (for auth + breadcrumb
 * context) and renders the mockup-faithful layout with honest empty fields
 * ("—") instead of 404-ing. The raw `loiId` param is rendered verbatim as
 * the breadcrumb leaf and header sub-line — we do NOT synthesise a customer
 * name from it.
 *
 * ── 404 policy ──────────────────────────────────────────────────────
 * We 404 only when the PROJECT cannot be loaded (invalid id, wrong foundry,
 * or row missing). The loiId is accepted as-is, intentionally. Once the
 * `lois` table ships, this file should also resolve the LOI row and 404 on
 * miss.
 *
 * ── Mockup ref ──────────────────────────────────────────────────────
 * FORGE-MOCKUP-LOI-DETAIL.html. Scoped CSS under `.ld2`.
 *
 * ── Empty-state policy ──────────────────────────────────────────────
 * Every field on the mockup (commitment value, deposit, delivery window,
 * member reach, commercial terms, milestones, contact roster, notes) is
 * rendered with "—" or "not yet captured" copy. We NEVER fabricate mockup
 * specifics (Kiambu Coffee, £7,250, 50 units, 6-month exclusivity, contact
 * names, note entries). The empty-state banner at the top tells the user
 * why every field is blank.
 *
 * @related
 *   - View:   ./loi-detail-view.tsx
 *   - Styles: ./loi-detail-v2.css (scoped .ld2)
 *   - Mockup: FORGE-MOCKUP-LOI-DETAIL.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"

import { LoiDetailView, type LoiDetailViewProps } from "./loi-detail-view"

export const dynamic = "force-dynamic"

// ─── Metadata ───────────────────────────────────────────────────────

export async function generateMetadata(
    { params }: { params: Promise<{ id: string; loiId: string }> },
): Promise<Metadata> {
    const { loiId } = await params
    return { title: `LOI ${loiId} · Validate · The Forge` }
}

// ─── Page ───────────────────────────────────────────────────────────

export default async function ForgeV2LoiDetailPage(
    { params }: { params: Promise<{ id: string; loiId: string }> },
): Promise<React.ReactNode> {
    const { id, loiId } = await params

    // ── Project load (enforces auth + foundry scoping via withAuth) ──
    // We only 404 on a missing project — the loiId is rendered verbatim
    // in the view because the `lois` table does not yet exist.
    const projectResult = await loadCadLabProject(id)
    if ("error" in projectResult || !projectResult.project) notFound()
    const project = projectResult.project

    const viewProps: LoiDetailViewProps = {
        project: {
            id: project.id,
            name: project.name,
        },
        loiId,
    }

    return <LoiDetailView {...viewProps} />
}
