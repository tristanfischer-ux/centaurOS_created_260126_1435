/**
 * @file validate/interviews/new/page.tsx — /the-forge-v2/projects/:id/validate/interviews/new
 *
 * @description "Log an interview" — mockup-faithful port of
 * FORGE-MOCKUP-INTERVIEW-CREATE.html. Server component loads the project so
 * the breadcrumb + right-hand context card key off the real project name.
 *
 * There is no `customer_interviews` / `interviews` table in the live schema
 * yet, so Submit is disabled with a tooltip pointing at the next round. The
 * form itself is fully interactive — tag chips toggle, the #blocker banner
 * conditionally surfaces, and all fields hold local state — but nothing
 * persists. Empty-state: the right-hand "Interviews on this hypothesis" slot
 * renders a generic hardware-startup interview-question template rather than
 * fabricating interviewee-history rows from the mockup reference.
 *
 * @related
 *   - View:   ./interview-create-view.tsx
 *   - Styles: ./interview-create-v2.css (scoped .ic2)
 *   - Mockup: FORGE-MOCKUP-INTERVIEW-CREATE.html
 *   - Pair:   FORGE-MOCKUP-INTERVIEW-DETAIL.html (read surface — separate owner)
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"

import {
    InterviewCreateView,
    type InterviewCreateViewProps,
} from "./interview-create-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "Log an interview · The Forge" }
    return { title: `Log an interview · ${r.project.name}` }
}

export default async function ForgeV2InterviewCreatePage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params

    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()
    const project = result.project

    const viewProps: InterviewCreateViewProps = {
        project: {
            id: project.id,
            name: project.name,
        },
    }

    return <InterviewCreateView {...viewProps} />
}
