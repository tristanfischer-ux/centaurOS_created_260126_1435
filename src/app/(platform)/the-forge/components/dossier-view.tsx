/**
 * @file dossier-view.tsx — Stage 2: Engineering Dossier client component
 *
 * @description The heaviest stage, organized with internal tab navigation:
 * Summary | Modules | Analysis | Timeline | Risks | Diagnostics | Review Package.
 *
 * The Summary tab (default) shows the high-level overview that was previously
 * on the Concept page: System Blueprint, Key Findings, and Executive Summary.
 * This follows a top-down information architecture (overview → detail).
 *
 * Supports URL-driven tab selection via `?tab=summary|modules|...` query param.
 *
 * @related
 * - Page: src/app/(platform)/the-forge/[id]/dossier/page.tsx
 * - Context: src/app/(platform)/the-forge/components/forge-project-context.tsx
 * - Concept auto-navigate: src/app/(platform)/the-forge/components/concept-view.tsx
 */

"use client"

import React, { useState } from "react"
import { useSearchParams } from "next/navigation"

import {
  LayoutDashboard,
  Boxes,
  FlaskConical,
  Clock,
  AlertTriangle,
  Stethoscope,
  FileCheck2,
} from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { EmptyState } from "@/components/ui/empty-state"

import { toast } from "sonner"

import { useForgeProject } from "./forge-project-context"
import { SystemBlueprint } from "./system-blueprint"
import { ExecutiveDashboard } from "./executive-dashboard"
import { QuickInsights } from "./quick-insights"
import { ModuleExplorer } from "./module-explorer"
import { EngineeringSummary } from "./engineering-summary"
import { TimelineView } from "./timeline-view"
import { RiskRegister } from "./risk-register"
import { DiagnosticCenter } from "./diagnostic-center"
import { InterviewPanel } from "./interview-panel"
import { EditModuleDialog } from "./edit-module-dialog"
import { DesignChangesDialog } from "./design-changes-dialog"
import { EngineeringReviewPackage } from "./engineering-review-package"

import type { ModuleSpec } from "../services/xray-schema"
import type { ChangeReview } from "./design-changes-dialog"

/** Valid tab IDs for the dossier view */
type DossierTab = "summary" | "modules" | "analysis" | "timeline" | "risks" | "diagnostics" | "review"

const VALID_TABS: DossierTab[] = ["summary", "modules", "analysis", "timeline", "risks", "diagnostics", "review"]

/**
 * DossierView — Stage 2 client component with tabbed navigation.
 *
 * @description Renders 7 tabs: Summary, Modules, Analysis, Timeline, Risks,
 * Diagnostics, Review Package. Default tab is "Summary" which provides the
 * high-level overview (Executive Summary metrics, System Blueprint, Key Findings).
 *
 * Supports URL-driven tab selection via `?tab=` query parameter.
 * All tabs share the same spec state via ForgeProjectProvider.
 */
export function DossierView(): React.ReactNode {
  const {
    spec,
    scanId,
    handleModuleUpdate,
    handleDeriveProcessClass,
    handleRefineModule,
    handleRunAnalysis,
    handleRunStructural,
    handleRunConvergence,
    handleRunPremium,
    handleRunFullPipeline,
    pipelineProgress,
    dismissPipelineChanges,
    handleCreateReviewObjective,
    handleApplyDesignChanges,
    isAnalyzing,
    isRunningStructural,
    isRunningConvergence,
    isRunningPremium,
    // Summary tab needs these for SystemBlueprint
    isGeneratingImages,
    isGeneratingModuleImages,
    handleGenerateImages,
  } = useForgeProject()

  // Read query params for deep-linking
  const searchParams = useSearchParams()
  const focusModuleId = searchParams.get("module")
  const tabParam = searchParams.get("tab") as DossierTab | null
  const initialTab: DossierTab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : "summary"

  // Controlled tab state so URL param drives initial selection
  const [activeTab, setActiveTab] = useState<DossierTab>(initialTab)

  // Dialog state for interview and edit panels
  const [interviewModule, setInterviewModule] = useState<ModuleSpec | null>(null)
  const [editingModule, setEditingModule] = useState<ModuleSpec | null>(null)

  const hasModules = spec.modules.length > 0

  if (!hasModules) {
    return (
      <EmptyState
        title="No modules yet"
        description="Create a product concept on the Concept page first. Modules will appear here once the concept is ready."
      />
    )
  }

  return (
    <>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DossierTab)}>
        <TabsList className="mb-4 border-t border-border pt-2 rounded-t-none">
          <TabsTrigger value="summary" className="gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Summary
          </TabsTrigger>
          <TabsTrigger value="modules" className="gap-2">
            <Boxes className="h-4 w-4" />
            Modules
          </TabsTrigger>
          <TabsTrigger value="analysis" className="gap-2">
            <FlaskConical className="h-4 w-4" />
            Analysis
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-2">
            <Clock className="h-4 w-4" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="risks" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Risks
          </TabsTrigger>
          <TabsTrigger value="diagnostics" className="gap-2">
            <Stethoscope className="h-4 w-4" />
            Diagnostics
          </TabsTrigger>
          <TabsTrigger value="review" className="gap-2">
            <FileCheck2 className="h-4 w-4" />
            Review Package
          </TabsTrigger>
        </TabsList>

        {/* Summary tab — high-level overview (moved from Concept page) */}
        <TabsContent value="summary">
          <div className="space-y-8">
            {/* Executive metrics first — "at a glance" numbers */}
            <ExecutiveDashboard spec={spec} />

            {/* System Blueprint — diagram + module status grid */}
            <SystemBlueprint
              spec={spec}
              systemImageUrl={spec.systemImageUrl}
              systemImageStatus={spec.systemImageStatus}
              isGeneratingImages={isGeneratingImages}
              isGeneratingModuleImages={isGeneratingModuleImages}
              hasImages={spec.modules.some((m) => m.imageStatus === "complete")}
              onGenerateImages={handleGenerateImages}
              canGenerate={!!scanId}
            />

            {/* Key Findings — gating module, highest risk, longest lead time */}
            <QuickInsights spec={spec} />
          </div>
        </TabsContent>

        <TabsContent value="modules">
          <ModuleExplorer
            spec={spec}
            onModuleUpdate={handleModuleUpdate}
            scanId={scanId}
            onDeriveProcessClass={handleDeriveProcessClass}
            onOpenInterview={setInterviewModule}
            onEditModule={setEditingModule}
            defaultExpandedId={focusModuleId ?? undefined}
          />
        </TabsContent>

        <TabsContent value="analysis">
          <EngineeringSummary
            spec={spec}
            onRunAnalysis={handleRunAnalysis}
            isAnalyzing={isAnalyzing}
            onRunStructural={handleRunStructural}
            isRunningStructural={isRunningStructural}
            onRunConvergence={handleRunConvergence}
            isRunningConvergence={isRunningConvergence}
            onRunPremium={handleRunPremium}
            isRunningPremium={isRunningPremium}
            onRunFullPipeline={handleRunFullPipeline}
            pipelineProgress={pipelineProgress}
            onCreateReviewObjective={handleCreateReviewObjective}
          />
        </TabsContent>

        <TabsContent value="timeline">
          <TimelineView spec={spec} />
        </TabsContent>

        <TabsContent value="risks">
          <RiskRegister spec={spec} />
        </TabsContent>

        <TabsContent value="diagnostics">
          <DiagnosticCenter
            spec={spec}
            scanId={scanId}
            onModuleUpdate={handleModuleUpdate}
            onDeriveProcessClass={handleDeriveProcessClass}
          />
        </TabsContent>

        <TabsContent value="review">
          <EngineeringReviewPackage spec={spec} />
        </TabsContent>
      </Tabs>

      {/* Interview Panel Dialog */}
      {interviewModule && (
        <InterviewPanel
          module={interviewModule}
          open={!!interviewModule}
          onClose={() => setInterviewModule(null)}
          onSave={handleModuleUpdate}
        />
      )}

      {/* Edit Module Dialog */}
      {editingModule && (
        <EditModuleDialog
          module={editingModule}
          spec={spec}
          scanId={scanId}
          open={!!editingModule}
          onClose={() => setEditingModule(null)}
          onSave={handleModuleUpdate}
          onRefineWithAI={handleRefineModule}
        />
      )}

      {/* Design Changes Review Dialog — appears after full pipeline completes */}
      {pipelineProgress.convergenceResult && pipelineProgress.proposedChanges && (
        <DesignChangesDialog
          open
          onClose={dismissPipelineChanges}
          evaluation={pipelineProgress.convergenceResult}
          onApplyChanges={async (approved: ChangeReview[]) => {
            // Convert approved changes to parameter modifications
            const paramChanges = approved
              .filter((r) => r.decision === "approve" || r.decision === "modify")
              .map((r) => ({
                moduleId: r.change.moduleId,
                parameter: r.change.parameter,
                newValue: r.decision === "modify" && r.userValue
                  ? r.userValue
                  : r.change.suggestedValue,
              }))
              .filter((c) => c.parameter && c.newValue)

            if (paramChanges.length > 0) {
              const success = await handleApplyDesignChanges(paramChanges)
              if (!success) return // toast already shown by handler
            } else {
              toast.success(`${approved.length} change${approved.length !== 1 ? "s" : ""} acknowledged`)
            }

            dismissPipelineChanges()
          }}
        />
      )}
    </>
  )
}
