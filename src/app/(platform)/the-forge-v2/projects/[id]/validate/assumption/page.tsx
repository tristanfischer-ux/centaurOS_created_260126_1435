/**
 * @file validate/assumption/page.tsx — /the-forge-v2/projects/:id/validate/assumption
 *
 * @description Assumption-test artefact for the Validate flow. Ported from
 * FORGE-MOCKUP-ASSUMPTION-TEST.html. The mockup drills into a single
 * "Progressive Maize WTP" assumption; production starts blank because no
 * `assumptions` table exists yet — the client form captures hypothesis,
 * test method, what/how/success/failure criteria, and a pre-committed
 * verdict, all in local state. Persistence ships with the validation
 * store in a later round.
 *
 * Query params:
 *   - id=<assumptionId>  Optional. When present, the empty-state block is
 *                        suppressed (user is drilling into an existing
 *                        assumption). Because there's no table yet we do
 *                        NOT try to hydrate the form from the id — we just
 *                        echo the reference under the hypothesis banner.
 *
 * Mockup specifics (Progressive Maize, co-ops, £120–£150, Samuel Okello,
 * Prof. Wanjiru, SAM figures) are NOT baked in as fallbacks. Placeholders
 * are generic prompts — the founder fills in their own testable bet.
 *
 * Auth / routing: `loadCadLabProject` is scoped to the caller's foundry
 * via `withAuth`. A bad id returns `{ error }` and we 404 to avoid
 * leaking project existence across tenants.
 *
 * @related
 *   - View:   ./assumption-view.tsx
 *   - Styles: ./assumption-v2.css (scoped .at2 — do NOT modify)
 *   - Mockup: FORGE-MOCKUP-ASSUMPTION-TEST.html
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"

import { AssumptionView } from "./assumption-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Assumption test · The Forge",
    description: "Turn a belief into a test — hypothesis, method, recipients, pass/fail criteria.",
}

export default async function ForgeV2ValidateAssumptionPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ id?: string | string[] }>
}): Promise<React.ReactNode> {
    const [{ id: projectId }, sp] = await Promise.all([params, searchParams])

    const loadResult = await loadCadLabProject(projectId)
    if ("error" in loadResult || !loadResult.project) {
        notFound()
    }
    const project = loadResult.project

    // `?id=<assumptionId>` — first value wins if the param repeats. No hydration
    // because there's no assumptions table; the view just echoes the reference.
    const rawAssumptionId = Array.isArray(sp.id) ? sp.id[0] : sp.id
    const assumptionId = typeof rawAssumptionId === "string" && rawAssumptionId.trim().length > 0
        ? rawAssumptionId.trim()
        : null

    return (
        <AssumptionView
            project={{ id: project.id, name: project.name }}
            assumptionId={assumptionId}
        />
    )
}
