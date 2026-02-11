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

import { Boxes, FlaskConical, Clock, AlertTriangle, Stethoscope } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { EmptyState } from "@/components/ui/empty-state"

import { useForgeProject } from "./forge-project-context"
import { ModuleExplorer } from "./module-explorer"
import { EngineeringSummary } from "./engineering-summary"
import { TimelineView } from "./timeline-view"
import { RiskRegister } from "./risk-register"
import { DiagnosticCenter } from "./diagnostic-center"
import { InterviewPanel } from "./interview-panel"
import { EditModuleDialog } from "./edit-module-dialog"

import type { ModuleSpec } from "../services/xray-schema"

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
    isAnalyzing,
    isRunningStructural,
    isRunningConvergence,
    isRunningPremium,
  } = useForgeProject()

  // Dialog state for interview and edit panels
  const [interviewModule, setInterviewModule] = useState<ModuleSpec | null>(null)
  const [editingModule, setEditingModule] = useState<ModuleSpec | null>(null)

  const hasModules = spec.modules.length > 0

  if (!hasModules) {
    return (
      <EmptyState
        title="No modules yet"
        description="Scan a product idea on the Concept page first. Modules will appear here once the scan is complete."
      />
    )
  }

  return (
    <>
      <Tabs defaultValue="modules">
        <TabsList className="mb-6">
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
    </>
  )
}
