"use client"

/**
 * Agent workspace — canvas area for deep-dive content (documents,
 * presentations, charts). Shown in the right column when the advisor
 * panel is expanded. Content can be populated by the specialist or edited by the user.
 *
 * State is managed in WorkspaceContext so BriefSpecialistDialog can push
 * content (e.g. parsed slide decks) that appears here in real-time.
 */

import { cn } from "@/lib/utils"
import { useWorkspace } from "@/contexts/workspace-context"
import { WorkspaceToolbar } from "./workspace-toolbar"
import { DocumentEditor } from "./document-editor"
import { PresentationView } from "./presentation-view"
import { ChartBuilder } from "./chart-builder"
import { ExportToolbar } from "./export-toolbar"

export function AgentWorkspace(): React.ReactElement {
  const {
    activeTab,
    setActiveTab,
    documentContent,
    setDocumentContent,
    presentationData,
    chartConfig,
  } = useWorkspace()

  return (
    <div className={cn("flex flex-1 flex-col h-full bg-muted/30 overflow-hidden")}>
      <WorkspaceToolbar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "document" && (
          <DocumentEditor
            value={documentContent}
            onChange={setDocumentContent}
            className="h-full"
          />
        )}
        {activeTab === "presentation" && (
          <PresentationView data={presentationData} className="h-full" />
        )}
        {activeTab === "chart" && (
          <ChartBuilder config={chartConfig} className="h-full" />
        )}
      </div>
      <ExportToolbar
        activeTab={activeTab}
        documentContent={documentContent}
        presentationData={presentationData}
        chartConfig={chartConfig}
      />
    </div>
  )
}
