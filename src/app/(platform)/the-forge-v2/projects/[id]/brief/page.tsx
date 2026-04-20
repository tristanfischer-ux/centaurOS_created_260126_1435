/**
 * @file brief/page.tsx — /the-forge-v2/projects/:id/brief (V2 — mockup-faithful rebuild)
 *
 * @description Brief artefact — the anchor spec (intent · target markets ·
 * regulatory envelope · constraints) that every downstream artefact (BOM,
 * Suppliers, Risks, Cost) cites. Ports FORGE-MOCKUP-BRIEF.html verbatim
 * into production React: page header with lock chip, dual-pane hero
 * (concept render + mission envelope SVG), locked-revision banner,
 * narrative + sidebar grid (regulatory posture / cost vs ceiling / mass
 * budget), revision history, and "design grounded in" footer.
 *
 * This commit ships the visual shell with stubbed mockup content (HAPS UAV
 * / Revision A locked / £172k over / 68.17 kg MTOW) so Tristan can
 * parity-check the rendered page against FORGE-MOCKUP-BRIEF.html. Data
 * wiring + the brief-lock schema migration (`brief_locked_at`,
 * `lockCadLabBrief` / `unlockCadLabBrief` actions) land in a follow-up
 * commit.
 */

import type { Metadata } from "next"

import { BriefView } from "./brief-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Brief · The Forge",
    description: "The anchor spec — intent, target markets, regulatory envelope, constraints.",
}

export default async function ForgeV2BriefPage(): Promise<React.ReactNode> {
    return <BriefView />
}
