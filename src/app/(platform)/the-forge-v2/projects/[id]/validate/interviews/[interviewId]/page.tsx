/**
 * @file validate/interviews/[interviewId]/page.tsx — /the-forge-v2/projects/:id/validate/interviews/:interviewId
 *
 * @description Customer-interview detail drill-in. There is no interview
 * table in the schema yet, so this route renders the full mockup-faithful
 * layout with honest empty states instead of 404-ing on an unknown id.
 *
 * Server component: loads the project via loadCadLabProject (enforces auth
 * + foundry scoping). If the project is missing / user lacks access, the
 * route 404s — same as the supplier-detail sibling. Otherwise we hand the
 * route param through to the client view verbatim.
 *
 * Mockup ref: FORGE-MOCKUP-INTERVIEW-DETAIL.html. Scoped CSS under `.id2`.
 *
 * Empty-state policy: Interview data (interviewee name, transcript, tagged
 * quotes, derived assumptions, linked LOIs, attachments, follow-ups,
 * related interviews) ships when the validation store lands. Until then
 * every field renders "—" or an italic "not tracked yet" line. We NEVER
 * synthesise mockup specifics (John Kimani / Kiambu / £150 price ceiling /
 * SMS UX rule / 46-minute duration) — only the route param and project
 * context are real.
 *
 * @related
 *   - View:   ./interview-detail-view.tsx
 *   - Styles: ./interview-detail-v2.css (scoped .id2 — do NOT modify)
 *   - Mockup: FORGE-MOCKUP-INTERVIEW-DETAIL.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"

import { InterviewDetailView } from "./interview-detail-view"

export const dynamic = "force-dynamic"

// ─── Metadata ───────────────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
    return { title: "Interview · Validate · The Forge" }
}

// ─── Page ───────────────────────────────────────────────────────────

export default async function ForgeV2InterviewDetailPage(
    { params }: { params: Promise<{ id: string; interviewId: string }> },
): Promise<React.ReactNode> {
    const { id, interviewId } = await params

    // Project load enforces auth + foundry scoping. If the project doesn't
    // exist or the user doesn't belong, 404 — same shape as the supplier
    // detail sibling.
    const projectResult = await loadCadLabProject(id)
    if ("error" in projectResult || !projectResult.project) notFound()
    const project = projectResult.project

    // No interview table yet — render the layout for any interviewId so
    // Tristan can see the page shell. When the store ships the page picks
    // up real data via a fetch next to the project load above.
    return (
        <InterviewDetailView
            project={{ id: project.id, name: project.name }}
            interviewId={interviewId}
        />
    )
}
