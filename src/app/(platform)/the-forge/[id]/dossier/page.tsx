/**
 * @file page.tsx — Stage 2: Engineering Dossier page
 *
 * @description "What are the engineering details?" — The heaviest stage
 * with internal tab navigation: Summary | Modules | Analysis | Timeline |
 * Risks | Diagnostics | Review Package.
 *
 * The Summary tab (default) shows the high-level overview moved from the
 * Concept page: Executive Summary, System Blueprint, and Key Findings.
 *
 * Wrapped in Suspense because DossierView uses useSearchParams() for
 * deep-linking (e.g. ?module=frame-and-structure or ?tab=summary).
 *
 * @related
 * - Layout: src/app/(platform)/the-forge/[id]/layout.tsx
 * - Components: system-blueprint.tsx, executive-dashboard.tsx, quick-insights.tsx,
 *   module-explorer.tsx, engineering-summary.tsx, timeline-view.tsx, etc.
 */

import React, { Suspense } from "react"

import { DossierView } from "../../components/dossier-view"

export default function DossierPage(): React.ReactNode {
  return (
    <Suspense>
      <DossierView />
    </Suspense>
  )
}
