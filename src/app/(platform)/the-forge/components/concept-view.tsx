/**
 * @file concept-view.tsx — Stage 1: Concept client component
 *
 * @description Renders the concept definition stage: ScanHero (idea input)
 * and ConceptResearch (product research with Gemini + Claude Opus).
 *
 * After a successful scan generates modules, the user is auto-navigated
 * to the Dossier's Summary tab where the System Blueprint, Key Findings,
 * and Executive Summary live. If the user returns to the Concept page
 * after scan, a CTA card links them back to the Dossier.
 *
 * The flow is: Enter idea → Research product → Generate modules → Dossier
 *
 * @related
 * - Page: src/app/(platform)/the-forge/[id]/concept/page.tsx
 * - Context: src/app/(platform)/the-forge/components/forge-project-context.tsx
 * - Research: src/app/(platform)/the-forge/components/concept-research.tsx
 * - Dossier Summary: src/app/(platform)/the-forge/components/dossier-view.tsx
 */

"use client"

import React, { useRef, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { CheckCircle2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

import { useForgeProject } from "./forge-project-context"
import { ScanHero } from "./scan-hero"
import { ConceptResearch } from "./concept-research"

/**
 * ConceptView — Stage 1 client component.
 *
 * @description Renders the concept flow:
 * 1. ScanHero — idea input and refinement
 * 2. ConceptResearch — AI-powered product research (Gemini Search + Claude Opus)
 * 3. Post-scan CTA — links to Dossier Summary after modules are generated
 *
 * Auto-navigates to Dossier Summary tab when a scan completes.
 */
export function ConceptView(): React.ReactNode {
  const router = useRouter()
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

  // Auto-navigate to Dossier Summary when scan completes.
  // Detects the transition from scanning → not scanning with modules present.
  const wasScanningRef = useRef(false)

  useEffect(() => {
    if (wasScanningRef.current && !effectivelyScanning && hasModules) {
      router.push(`/the-forge/${scanId}/dossier?tab=summary`)
    }
    wasScanningRef.current = effectivelyScanning
  }, [effectivelyScanning, hasModules, router, scanId])

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

      {/* Product research — appears after idea is entered, before module generation */}
      {spec.idea.trim() && (
        <ConceptResearch
          idea={spec.idea}
          scanId={scanId}
          savedResearch={project.researchReport}
          isScanning={effectivelyScanning}
        />
      )}

      {/* Post-scan CTA — shown when modules exist and user returns to Concept */}
      {hasModules && !effectivelyScanning && (
        <Card className="border-international-orange/20 bg-status-success-light/30">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-status-success-light">
                <CheckCircle2 className="h-6 w-6 text-status-success" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-foreground">
                  Concept created — {spec.modules.length} module{spec.modules.length !== 1 ? "s" : ""} identified
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
