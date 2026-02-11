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

import React, { useState } from "react"

import { useForgeProject } from "./forge-project-context"
import { ScanHero } from "./scan-hero"
import { SystemBlueprint } from "./system-blueprint"
import { ExecutiveDashboard } from "./executive-dashboard"
import { InterviewPanel } from "./interview-panel"
import { EditModuleDialog } from "./edit-module-dialog"

import type { ModuleSpec } from "../services/xray-schema"

/**
 * ConceptView — Stage 1 client component.
 *
 * @description Renders concept definition tools. ScanHero is in
 * "edit/refine" mode since the initial scan was done on /the-forge/new.
 */
export function ConceptView(): React.ReactNode {
  const {
    spec,
    scanId,
    isScanning,
    isGeneratingImages,
    handleRefineScan,
    handleGenerateImages,
    setSpec,
  } = useForgeProject()

  const hasModules = spec.modules.length > 0

  return (
    <div className="space-y-8">
      {/* Idea refinement */}
      <ScanHero
        idea={spec.idea}
        functionStatement={spec.function}
        isScanning={isScanning}
        hasExistingSpec={hasModules}
        onScan={handleRefineScan}
        onRefine={handleRefineScan}
        onIdeaChange={(idea) => setSpec({ ...spec, idea })}
      />

      {hasModules && (
        <>
          {/* System Blueprint with module status grid */}
          <SystemBlueprint
            spec={spec}
            systemImageUrl={spec.systemImageUrl}
            systemImageStatus={spec.systemImageStatus}
            isGeneratingImages={isGeneratingImages}
            hasImages={spec.modules.some((m) => m.imageStatus === "complete")}
            onGenerateImages={handleGenerateImages}
            canGenerate={!!scanId}
          />

          {/* Executive summary dashboard */}
          <ExecutiveDashboard spec={spec} />
        </>
      )}
    </div>
  )
}
