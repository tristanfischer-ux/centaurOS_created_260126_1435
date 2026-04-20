/**
 * @file approve/page.tsx — /the-forge-v2/projects/:id/approve
 *
 * @description Approval confirmation surface — mockup-faithful port of
 * FORGE-MOCKUP-APPROVE.html. Generic approval flow used as the confirmation
 * step before locking a revision, awarding a supplier, or accepting a quote.
 * Server component that loads the project (for the breadcrumb + name) and
 * hands a typed props bundle to ApproveView for rendering.
 *
 * The page accepts a `type` query param — `revision` | `award` | `quote` —
 * which toggles the header copy + summary framing. Default is `revision`.
 *
 * No approval table exists yet so the approval-chain, trade-offs, specialist
 * recommendations, cost delta, and similar-past-decisions slots all render
 * honest empty states. We never synthesise the mockup's HAPS / Jian / Astra
 * / ±0.3mm content. The Approve button is disabled with "Approval mutation
 * ships next round" in the guidance slot until the decision spine lands.
 *
 * @related
 *   - View:   ./approve-view.tsx
 *   - Styles: ./approve-v2.css (scoped .ap2)
 *   - Mockup: FORGE-MOCKUP-APPROVE.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"

import { ApproveView, type ApprovalType, type ApproveViewProps } from "./approve-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Approve · The Forge" }
    return {
        title: `Approve · ${r.project.name}`,
        description: "Confirm the decision before it locks downstream artefacts.",
    }
}

export default async function ForgeV2ApprovePage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ type?: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const { type: typeParam } = await searchParams

    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) {
        notFound()
    }
    const project = result.project

    const type = coerceApprovalType(typeParam)

    const viewProps: ApproveViewProps = {
        project: {
            id: project.id,
            name: project.name,
            designRevision: project.designRevision,
        },
        type,
    }

    return <ApproveView {...viewProps} />
}

// ─── Helpers ───────────────────────────────────────────────────────────

function coerceApprovalType(raw: string | undefined): ApprovalType {
    if (raw === "award" || raw === "quote" || raw === "revision") {
        return raw
    }
    return "revision"
}
