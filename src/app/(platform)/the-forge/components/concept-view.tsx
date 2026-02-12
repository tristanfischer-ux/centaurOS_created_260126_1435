/**
 * @file concept-view.tsx — Stage 1: Concept client component
 *
 * @description Renders the concept definition stage with a deliberate,
 * step-by-step flow:
 * 1. ScanHero — idea input and refinement
 * 2. ConceptResearch — AI-powered product research (Gemini Search + Claude Opus)
 * 3. Approval — user reviews the research and confirms ("Yes, I like it")
 * 4. View Dossier CTA — manual navigation to the engineering dossier
 *
 * There is NO auto-navigation. The user controls every transition.
 *
 * @related
 * - Page: src/app/(platform)/the-forge/[id]/concept/page.tsx
 * - Context: src/app/(platform)/the-forge/components/forge-project-context.tsx
 * - Research: src/app/(platform)/the-forge/components/concept-research.tsx
 * - Dossier Summary: src/app/(platform)/the-forge/components/dossier-view.tsx
 */

"use client"

import React, { useState } from "react"
import Link from "next/link"

import { CheckCircle2, ArrowRight, ThumbsUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

import { useForgeProject } from "./forge-project-context"
import { ScanHero } from "./scan-hero"
import { ConceptResearch } from "./concept-research"

/**
 * ConceptView — Stage 1 client component.
 *
 * @description Renders the concept flow with manual progression:
 * 1. ScanHero — idea input and refinement
 * 2. ConceptResearch — AI-powered product research (auto-triggers on scan)
 * 3. Approval step — user confirms the research looks good
 * 4. View Dossier CTA — user clicks to navigate to the dossier
 *
 * No auto-navigation. Every transition requires user action.
 */
export function ConceptView(): React.ReactNode {
  const {
    project,
    spec,
    scanId,
    isScanning,
    scanStatus,
    handleRefineScan,
    setSpec,
  } = useForgeProject()

  const hasModules = spec.modules.length > 0
  // Treat both client-side isScanning and DB scan_status as "scanning"
  // (covers the case where user navigated away and came back)
  const effectivelyScanning = isScanning || scanStatus === "scanning"

  // Manual approval state — user must confirm research before seeing dossier CTA
  const [isApproved, setIsApproved] = useState(false)

  return (
    <div className="space-y-8">
      {/* Idea refinement */}
      <ScanHero
        idea={spec.idea}
        functionStatement={spec.function}
        isScanning={effectivelyScanning}
        hasExistingSpec={hasModules}
        onScan={handleRefineScan}
        onRefine={handleRefineScan}
        onIdeaChange={(idea) => setSpec({ ...spec, idea })}
      />

      {/* Product research — appears after idea is entered, auto-triggers on scan */}
      {spec.idea.trim() && (
        <ConceptResearch
          idea={spec.idea}
          scanId={scanId}
          savedResearch={project.researchReport}
          isScanning={effectivelyScanning}
        />
      )}

      {/* Approval step — shown when modules exist, user hasn't approved yet */}
      {hasModules && !effectivelyScanning && !isApproved && (
        <Card className="border-international-orange/20 bg-international-orange/5">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-international-orange/10">
                <ThumbsUp className="h-6 w-6 text-international-orange" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-foreground">
                  Concept ready — {spec.modules.length} module{spec.modules.length !== 1 ? "s" : ""} identified
                </h3>
                <p className="text-sm text-muted-foreground">
                  Review the research above. If it looks good, confirm to proceed to the engineering dossier.
                </p>
              </div>
              <Button
                onClick={() => setIsApproved(true)}
                className="shrink-0 bg-international-orange hover:bg-international-orange-hover text-white"
              >
                <ThumbsUp className="h-4 w-4 mr-2" />
                Yes, I like it
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* View Dossier CTA — shown after user approves */}
      {hasModules && !effectivelyScanning && isApproved && (
        <Card className="border-status-success/20 bg-status-success-light/30">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-status-success-light">
                <CheckCircle2 className="h-6 w-6 text-status-success" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-foreground">
                  Concept approved
                </h3>
                <p className="text-sm text-muted-foreground">
                  View the engineering dossier for the system blueprint, key findings, and executive summary.
                </p>
              </div>
              <Button asChild className="shrink-0">
                <Link href={`/the-forge/${scanId}/dossier?tab=summary`}>
                  View Dossier
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
