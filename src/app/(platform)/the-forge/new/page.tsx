/**
 * @file page.tsx — Create concept dedicated page
 *
 * @description Full-page concept creation: enter a product idea, run AI analysis,
 * show progress animation, then redirect to /the-forge/[id]/concept on completion.
 *
 * @related
 * - Scan service: src/app/(platform)/the-forge/services/scan.ts
 * - Actions: src/actions/xray.ts (scanIdeaAction)
 */

import React from "react"

import { typography } from "@/lib/design-system"
import { cn } from "@/lib/utils"

import { NewScanView } from "../components/new-scan-view"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Create Concept | The Forge | ForgeOS",
  description: "Turn a product idea into an engineering dossier",
}

export default function NewScanPage(): React.ReactNode {
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="pb-4 border-b border-muted">
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>Create Concept</h1>
        </div>
        <p className={cn(typography.pageSubtitle, "mt-1")}>
          Describe your product idea and we will decompose it into a buildable engineering dossier.
        </p>
      </div>

      <NewScanView />
    </div>
  )
}
