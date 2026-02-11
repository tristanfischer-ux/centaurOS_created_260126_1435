/**
 * @file concept-view.tsx — Stage 1: Concept client component
 *
 * @description Renders the concept definition stage: ScanHero (in edit/refine mode),
 * SystemBlueprint, and ExecutiveDashboard. This is the "What am I building?" view.
 *
 * @related
 * - Page: src/app/(platform)/the-forge/[id]/concept/page.tsx
 * - Context: src/app/(platform)/the-forge/components/forge-project-context.tsx
 */

"use client"

import React, { useState, useRef, useEffect } from "react"

import { useForgeProject } from "./forge-project-context"
import { ScanHero } from "./scan-hero"
import { SystemBlueprint } from "./system-blueprint"
import { ExecutiveDashboard } from "./executive-dashboard"
import { QuickInsights } from "./quick-insights"
import { ScanCelebration } from "./scan-celebration"

/**
 * ConceptView — Stage 1 client component.
 *
 * @description Renders concept definition tools: ScanHero (in edit/refine mode),
 * celebration banner on scan completion, SystemBlueprint with staggered module
 * reveal, QuickInsights highlights, and ExecutiveDashboard metrics.
 */
export function ConceptView(): React.ReactNode {
  const {
    spec,
    scanId,
    isScanning,
    scanStatus,
    isGeneratingImages,
    isGeneratingSystemCad,
    handleRefineScan,
    handleGenerateImages,
    setSpec,
  } = useForgeProject()

  const hasModules = spec.modules.length > 0
  // Treat both client-side isScanning and DB scan_status as "scanning"
  // (covers the case where user navigated away and came back)
  const effectivelyScanning = isScanning || scanStatus === "scanning"

  // Track scan completion to trigger celebration + stagger animation
  const wasScanningRef = useRef(false)
  const [justScanned, setJustScanned] = useState(false)

  useEffect(() => {
    // Detect transition from scanning → not scanning (scan just finished)
    if (wasScanningRef.current && !effectivelyScanning && hasModules) {
      setJustScanned(true)
    }
    wasScanningRef.current = effectivelyScanning
  }, [effectivelyScanning, hasModules])

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

      {/* Celebration banner — auto-dismisses after 8 seconds */}
      {justScanned && (
        <ScanCelebration
          moduleCount={spec.modules.length}
          onDismiss={() => setJustScanned(false)}
        />
      )}

      {hasModules && (
        <>
          {/* System Blueprint with staggered module reveal */}
          <SystemBlueprint
            spec={spec}
            systemImageUrl={spec.systemImageUrl}
            systemImageStatus={spec.systemImageStatus}
            isGeneratingImages={isGeneratingImages}
            isGeneratingSystemCad={isGeneratingSystemCad}
            hasImages={spec.modules.some((m) => m.imageStatus === "complete")}
            onGenerateImages={handleGenerateImages}
            canGenerate={!!scanId}
            justScanned={justScanned}
          />

          {/* Key findings at a glance */}
          <QuickInsights spec={spec} justScanned={justScanned} />

          {/* Executive summary dashboard */}
          <ExecutiveDashboard spec={spec} />
        </>
      )}
    </div>
  )
}
