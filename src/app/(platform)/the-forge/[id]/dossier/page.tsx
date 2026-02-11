/**
 * @file page.tsx — Stage 2: Engineering Dossier page
 *
 * @description "What are the engineering details?" — The heaviest stage
 * with internal tab navigation: Modules | Analysis | Timeline | Risks | Diagnostics.
 * This is the primary reference document users come back to repeatedly.
 *
 * @related
 * - Layout: src/app/(platform)/the-forge/[id]/layout.tsx
 * - Components: module-explorer.tsx, engineering-summary.tsx, timeline-view.tsx, etc.
 */

import React from "react"

import { DossierView } from "../../components/dossier-view"

export default function DossierPage(): React.ReactNode {
  return <DossierView />
}
