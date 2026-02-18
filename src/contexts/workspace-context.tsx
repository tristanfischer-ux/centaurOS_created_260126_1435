"use client"

/**
 * @file workspace-context.tsx
 *
 * @description Shared state for the agent workspace (document, presentation,
 * chart tabs). Consumed by both BriefSpecialistDialog (to push content) and
 * AgentWorkspace (to display content). Without this, the two components are
 * siblings in AdvisorPanel with no communication channel.
 *
 * @related
 * - AgentWorkspace: src/components/specialists/workspace/agent-workspace.tsx
 * - BriefSpecialistDialog: src/app/(platform)/agents/brief-specialist-dialog.tsx
 * - AdvisorPanel: src/components/specialists/advisor-panel.tsx
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react"
import type { PresentationData } from "@/components/specialists/workspace/presentation-view"
import type { ChartConfig } from "@/components/specialists/workspace/chart-builder"
import type { WorkspaceTab } from "@/components/specialists/workspace/workspace-toolbar"

// ─── Types ──────────────────────────────────────────────────────────────────

interface WorkspaceContextValue {
  /** Current active workspace tab */
  activeTab: WorkspaceTab
  /** Switch the visible tab */
  setActiveTab: (tab: WorkspaceTab) => void
  /** Document markdown content */
  documentContent: string
  /** Update document content */
  setDocumentContent: (content: string) => void
  /** Parsed slide deck data (null = empty state) */
  presentationData: PresentationData | null
  /** Push a parsed slide deck into the workspace */
  setPresentationData: (data: PresentationData | null) => void
  /** Chart configuration (null = empty state) */
  chartConfig: ChartConfig | null
  /** Push a chart config into the workspace */
  setChartConfig: (config: ChartConfig | null) => void
}

// ─── Context ────────────────────────────────────────────────────────────────

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

// ─── Provider ───────────────────────────────────────────────────────────────

/**
 * Provides shared workspace state so the chat dialog can push content
 * (presentations, documents, charts) that the workspace component displays.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [activeTab, setActiveTabRaw] = useState<WorkspaceTab>("document")
  const [documentContent, setDocumentContentRaw] = useState("")
  const [presentationData, setPresentationDataRaw] = useState<PresentationData | null>(null)
  const [chartConfig, setChartConfigRaw] = useState<ChartConfig | null>(null)

  const setActiveTab = useCallback((tab: WorkspaceTab) => setActiveTabRaw(tab), [])
  const setDocumentContent = useCallback((c: string) => setDocumentContentRaw(c), [])
  const setPresentationData = useCallback((d: PresentationData | null) => setPresentationDataRaw(d), [])
  const setChartConfig = useCallback((c: ChartConfig | null) => setChartConfigRaw(c), [])

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      activeTab,
      setActiveTab,
      documentContent,
      setDocumentContent,
      presentationData,
      setPresentationData,
      chartConfig,
      setChartConfig,
    }),
    [activeTab, setActiveTab, documentContent, setDocumentContent, presentationData, setPresentationData, chartConfig, setChartConfig],
  )

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Access shared workspace state for reading or writing content.
 *
 * @throws Error if used outside WorkspaceProvider
 */
export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider")
  }
  return ctx
}
