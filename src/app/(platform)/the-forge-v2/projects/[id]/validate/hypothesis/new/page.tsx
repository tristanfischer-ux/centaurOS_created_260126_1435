/**
 * @file validate/hypothesis/new/page.tsx — /the-forge-v2/projects/:id/validate/hypothesis/new
 *
 * @description "New hypothesis" — mockup-faithful port of
 * FORGE-MOCKUP-HYPOTHESIS-CREATE.html. Server component loads the project so
 * the breadcrumb can key off the real project name.
 *
 * Submit mutation is NOT yet wired — the form renders fully interactive, the
 * If/Then/Because fields are validated (min 10 chars each, live one-liner
 * preview), and Submit is disabled with a tooltip pointing at the validation
 * store. There is no `hypotheses` table yet, so nothing persists.
 *
 * Empty-state: form starts blank. A right-rail examples card shows 3 generic
 * hypothesis templates so a first-time founder sees the shape of a good
 * hypothesis without HAPS-specific boilerplate leaking in from the mockup.
 *
 * @related
 *   - View:   ./hypothesis-create-view.tsx
 *   - Styles: ./hypothesis-create-v2.css (scoped .hc2)
 *   - Mockup: FORGE-MOCKUP-HYPOTHESIS-CREATE.html
 *   - Sibling create form: ../../risks/new (shares the same pattern)
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"

import {
    HypothesisCreateView,
    type HypothesisCreateViewProps,
} from "./hypothesis-create-view"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const r = await loadCadLabProject(id)
    if ("error" in r) return { title: "New hypothesis · The Forge" }
    return { title: `New hypothesis · ${r.project.name}` }
}

export default async function ForgeV2HypothesisCreatePage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    const { id } = await params

    const result = await loadCadLabProject(id)
    if ("error" in result || !result.project) notFound()
    const project = result.project

    const viewProps: HypothesisCreateViewProps = {
        project: {
            id: project.id,
            name: project.name,
        },
    }

    return <HypothesisCreateView {...viewProps} />
}
