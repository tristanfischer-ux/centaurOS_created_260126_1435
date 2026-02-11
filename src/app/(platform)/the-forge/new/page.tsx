/**
 * @file page.tsx — New scan dedicated page
 *
 * @description Full-page scan experience: enter a product idea, run AI scan,
 * show scanning animation, then redirect to /the-forge/[id]/concept on completion.
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
  title: "New Scan | The Forge | ForgeOS",
  description: "Scan a new product idea into an engineering dossier",
}

export default function NewScanPage(): React.ReactNode {
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="pb-4 border-b border-muted">
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>New Scan</h1>
        </div>
        <p className={cn(typography.pageSubtitle, "mt-1")}>
          Describe your product idea and we will decompose it into a buildable engineering dossier.
        </p>
      </div>

      <NewScanView />
    </div>
  )
}
