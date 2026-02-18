"use client"

/**
 * Agent workspace — canvas area for deep-dive content (documents,
 * presentations, charts). Shown in the right column when the advisor
 * panel is expanded. Content can be populated by the specialist or edited by the user.
 */

import { useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { WorkspaceToolbar, type WorkspaceTab } from "./workspace-toolbar"
import { DocumentEditor } from "./document-editor"
import { PresentationView, type PresentationData } from "./presentation-view"
import { ChartBuilder, type ChartConfig } from "./chart-builder"
import { ExportToolbar } from "./export-toolbar"

const DEFAULT_DOCUMENT = ""
const DEFAULT_PRESENTATION: PresentationData | null = null
const DEFAULT_CHART: ChartConfig | null = null

export function AgentWorkspace(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("document")
  const [documentContent, setDocumentContent] = useState(DEFAULT_DOCUMENT)
  const [presentationData, setPresentationData] = useState<PresentationData | null>(DEFAULT_PRESENTATION)
  const [chartConfig, setChartConfig] = useState<ChartConfig | null>(DEFAULT_CHART)

  const handleTabChange = useCallback((tab: WorkspaceTab) => {
    setActiveTab(tab)
  }, [])

  return (
    <div className={cn("flex flex-1 flex-col h-full bg-muted/30 overflow-hidden")}>
      <WorkspaceToolbar activeTab={activeTab} onTabChange={handleTabChange} />
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
