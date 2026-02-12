/**
 * @file dossier-view.tsx — Stage 2: Engineering Dossier client component
 *
 * @description The heaviest stage, organized with internal tab navigation:
 * Modules | Analysis | Timeline | Risks | Diagnostics. Each tab renders
 * one major component from the original single-page layout.
 *
 * @related
 * - Page: src/app/(platform)/the-forge/[id]/dossier/page.tsx
 * - Context: src/app/(platform)/the-forge/components/forge-project-context.tsx
 */

"use client"

import React, { useState } from "react"
import { useSearchParams } from "next/navigation"

import { Boxes, FlaskConical, Clock, AlertTriangle, Stethoscope, FileCheck2 } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { EmptyState } from "@/components/ui/empty-state"

import { toast } from "sonner"

import { useForgeProject } from "./forge-project-context"
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

/**
 * DossierView — Stage 2 client component with tabbed navigation.
 *
 * @description Renders 5 tabs: Modules, Analysis, Timeline, Risks, Diagnostics.
 * Default tab is "Modules" as it's the primary reference document.
 * All tabs share the same spec state via ForgeProjectProvider.
 */
export function DossierView(): React.ReactNode {
  const {
    spec,
    scanId,
    handleModuleUpdate,
    handleDeriveProcessClass,
    handleGenerateCadModel,
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
  } = useForgeProject()

  // Read ?module= query param to deep-link into a specific module
  const searchParams = useSearchParams()
  const focusModuleId = searchParams.get("module")

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
      <Tabs defaultValue="modules">
        <TabsList className="mb-4 border-t border-slate-100 pt-2 rounded-t-none">
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

        <TabsContent value="modules">
          <ModuleExplorer
            spec={spec}
            onModuleUpdate={handleModuleUpdate}
            scanId={scanId}
            onDeriveProcessClass={handleDeriveProcessClass}
            onGenerateCadModel={handleGenerateCadModel}
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
