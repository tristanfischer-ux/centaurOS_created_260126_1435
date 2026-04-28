/**
 * @file new/page.tsx — /the-forge-v2/new PROJECT-CREATE wizard (V2 — mockup-faithful rebuild).
 *
 * @description Mockup-faithful port of FORGE-MOCKUP-PROJECT-CREATE.html. The
 * route is the global "start a new project" wizard — reached from the sidebar
 * "+ New project" CTA, the Today "Start a new build" tile, and the workspace
 * header button. This server page is a thin shell that only owns metadata,
 * the route-segment config, and the render of the client view. All interaction
 * lives in `./project-create-view.tsx` (scoped `.pc2`, self-contained).
 *
 * Data contract: no mutation is wired in V1. Submit is disabled with a
 * tooltip that reads "Project creation ships with the `createCadLabProject`
 * server action wire-up" — the existing action in `src/actions/cad-lab-projects.ts`
 * is intentionally NOT called from this route yet. Form state is
 * client-side-only and feeds the live "What this will create" preview card.
 *
 * @related
 * - Mockup: FORGE-MOCKUP-PROJECT-CREATE.html (repo root)
 * - View:   ./project-create-view.tsx
 * - Styles: ./project-create-v2.css (scoped `.pc2` — do NOT modify elsewhere)
 *
 * @history This file + its view/css siblings were written in a parallel
 *          sub-agent wave; the initial port commit was swept into
 *          88a1dba8 by a concurrent agent. This trailing commit restores
 *          the proper subject line for bisect / changelog discovery.
 */

import type { Metadata } from "next"

import { ProjectCreateView } from "./project-create-view"

export const dynamic = "force-dynamic"
// GOTCHA (W19 — 2026-04-28): Same edge-function/after() issue as the simple
// start page. createCadLabProject uses after() for Chase auto-trigger, which
// only works on the Node.js runtime. Without this, the wizard submit blocks
// until Chase completes (92s+), overruns the 300s cap, and returns nothing.
export const runtime = "nodejs"
export const maxDuration = 30

export const metadata: Metadata = {
    title: "Start a new project · The Forge",
    description:
        "A project begins as a short voice memo or free-text spec. Chase and Max draft rev 0.1 of the Brief from what you say — you review before anything else happens.",
}

export default function NewProjectPage(): React.ReactElement {
    return <ProjectCreateView />
}
