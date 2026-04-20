/**
 * @file projects/[id]/page.tsx — /the-forge-v2/projects/:id project workspace.
 *
 * @description Project cockpit (V2 — mockup-faithful rebuild). Ports
 * FORGE-MOCKUP-WORKSPACE.html verbatim into production React: breadcrumb,
 * project header, amber resumed card, 4-card health strip, system illustration
 * (empty state), three artefact clusters (Define / Deliver / Support),
 * Engineering Intelligence, Known Challenges, activity timeline, and the
 * fixed-bottom phase tabs.
 *
 * This commit ships the visual shell with stubbed mockup content (HAPS UAV
 * reference data) so Tristan can parity-check the rendered page against
 * FORGE-MOCKUP-WORKSPACE.html. Real data wiring (briefing, modules, BOM,
 * suppliers, cost, risks, library counts, activity) lands in a follow-up
 * commit.
 *
 * @related
 *  - Mockup: FORGE-MOCKUP-WORKSPACE.html (repo root)
 *  - View:   ./workspace-view.tsx
 *  - Styles: ./workspace-v2.css (scoped .w2)
 */

import type { Metadata } from "next"

import { WorkspaceView } from "./workspace-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "HAPS UAV · The Forge",
    description: "Project cockpit — health, artefacts, engineering intelligence, risks, and recent activity.",
}

export default async function ForgeV2ProjectPage({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<React.ReactNode> {
    // INTENT: visual-parity pass renders the mockup's HAPS reference data.
    // Real data wiring (loadCadLabProject + per-project content) lands in a
    // follow-up commit. Await params to satisfy Next 15+ async-params contract.
    await params

    return <WorkspaceView />
}
