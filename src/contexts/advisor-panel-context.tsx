"use client"

/**
 * @file advisor-panel-context.tsx
 *
 * @description Global state for the persistent advisor sidebar panel.
 * Lives at the platform layout level so the panel persists across
 * page navigations. All entry points (FAB, AskSpecialistButton,
 * SpecialistsLanding) use this context instead of managing their
 * own local dialog state.
 *
 * @related
 * - AdvisorPanel: src/components/specialists/advisor-panel.tsx
 * - FloatingSpecialistFAB: src/components/specialists/floating-specialist-fab.tsx
 * - AskSpecialistButton: src/components/specialists/ask-specialist-button.tsx
 * - Platform layout: src/app/(platform)/layout.tsx
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from "react"
import { getSpecialistById } from "@/app/(platform)/agents/specialists-data"
import type { Specialist } from "@/app/(platform)/agents/specialists-data"

// ─── Types ──────────────────────────────────────────────────────────────────

interface OpenPanelOptions {
  /** Context passed from the page or a referring specialist */
  handoffContext?: string | null
  /** Name of the specialist that referred the user */
  referredBy?: string | null
  /** Badge label for what entity is being discussed */
  contextLabel?: string | null
}

export type PanelViewMode = "sidebar" | "expanded"

interface AdvisorPanelState {
  /** Whether the panel is visible */
  isOpen: boolean
  /** The active specialist in the panel */
  activeSpecialist: Specialist | null
  /** Context passed from page or referring specialist */
  handoffContext: string | null
  /** Name of the referring specialist */
  referredBy: string | null
  /** Badge label for what's being discussed */
  contextLabel: string | null
  /** Sidebar (narrow) vs expanded (full-width) view */
  panelViewMode: PanelViewMode
}

interface AdvisorPanelContextValue extends AdvisorPanelState {
  /** Open the panel with a specific specialist */
  openPanel: (specialistId: string, options?: OpenPanelOptions) => void
  /** Close the panel */
  closePanel: () => void
  /** Toggle the panel open/closed */
  togglePanel: (specialistId?: string) => void
  /** Switch to a different specialist without closing */
  switchSpecialist: (specialistId: string, handoffCtx?: string) => void
  /** Expand panel to full width (chat + workspace) */
  expandPanel: () => void
  /** Collapse panel back to sidebar width */
  collapsePanel: () => void
}

// ─── Context ────────────────────────────────────────────────────────────────

const AdvisorPanelContext = createContext<AdvisorPanelContextValue | null>(null)

// ─── Provider ───────────────────────────────────────────────────────────────

/**
 * Provides global advisor panel state to the platform layout.
 *
 * @description Wraps the platform layout so any component can open,
 * close, or switch the advisor panel without managing local dialog state.
 */
const PANEL_VIEW_MODE_KEY = "forgeOS-advisor-panel-view-mode"

function getStoredPanelViewMode(): PanelViewMode {
  if (typeof window === "undefined") return "sidebar"
  try {
    const stored = localStorage.getItem(PANEL_VIEW_MODE_KEY)
    if (stored === "expanded" || stored === "sidebar") return stored
  } catch {
    /* ignore */
  }
  return "sidebar"
}

export function AdvisorPanelProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [state, setState] = useState<AdvisorPanelState>(() => ({
    isOpen: false,
    activeSpecialist: null,
    handoffContext: null,
    referredBy: null,
    contextLabel: null,
    panelViewMode: getStoredPanelViewMode(),
  }))

  const openPanel = useCallback((specialistId: string, options?: OpenPanelOptions) => {
    const specialist = getSpecialistById(specialistId)
    if (!specialist) {
      console.warn("[AdvisorPanel] Unknown specialist:", specialistId)
      return
    }
    setState((prev) => ({
      ...prev,
      isOpen: true,
      activeSpecialist: specialist,
      handoffContext: options?.handoffContext ?? null,
      referredBy: options?.referredBy ?? null,
      contextLabel: options?.contextLabel ?? null,
    }))
  }, [])

  const closePanel = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }))
  }, [])

  const togglePanel = useCallback((specialistId?: string) => {
    setState((prev) => {
      if (prev.isOpen) {
        return { ...prev, isOpen: false }
      }
      if (specialistId) {
        const specialist = getSpecialistById(specialistId)
        if (specialist) {
          return {
            ...prev,
            isOpen: true,
            activeSpecialist: specialist,
            handoffContext: null,
            referredBy: null,
            contextLabel: null,
          }
        }
      }
      if (prev.activeSpecialist) {
        return { ...prev, isOpen: true }
      }
      return prev
    })
  }, [])

  const switchSpecialist = useCallback((specialistId: string, handoffCtx?: string) => {
    const specialist = getSpecialistById(specialistId)
    if (!specialist) return

    setState((prev) => ({
      ...prev,
      isOpen: true,
      activeSpecialist: specialist,
      handoffContext: handoffCtx ?? null,
      referredBy: handoffCtx ? prev.activeSpecialist?.name ?? null : null,
    }))
  }, [])

  const expandPanel = useCallback(() => {
    setState((prev) => ({ ...prev, panelViewMode: "expanded" }))
    try {
      localStorage.setItem(PANEL_VIEW_MODE_KEY, "expanded")
    } catch {
      /* ignore */
    }
  }, [])

  const collapsePanel = useCallback(() => {
    setState((prev) => ({ ...prev, panelViewMode: "sidebar" }))
    try {
      localStorage.setItem(PANEL_VIEW_MODE_KEY, "sidebar")
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "e") {
        e.preventDefault()
        setState((prev) => {
          const next = prev.panelViewMode === "expanded" ? "sidebar" : "expanded"
          try {
            localStorage.setItem(PANEL_VIEW_MODE_KEY, next)
          } catch {
            /* ignore */
          }
          return { ...prev, panelViewMode: next }
        })
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const value = useMemo<AdvisorPanelContextValue>(
    () => ({
      ...state,
      openPanel,
      closePanel,
      togglePanel,
      switchSpecialist,
      expandPanel,
      collapsePanel,
    }),
    [state, openPanel, closePanel, togglePanel, switchSpecialist, expandPanel, collapsePanel],
  )

  return (
    <AdvisorPanelContext.Provider value={value}>
      {children}
    </AdvisorPanelContext.Provider>
  )
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Access the advisor panel state and controls.
 *
 * @description Used by FloatingSpecialistFAB, AskSpecialistButton,
 * SpecialistsLanding, and the AdvisorPanel itself to coordinate
 * the persistent sidebar panel.
 *
 * @throws Error if used outside AdvisorPanelProvider
 */
export function useAdvisorPanel(): AdvisorPanelContextValue {
  const ctx = useContext(AdvisorPanelContext)
  if (!ctx) {
    throw new Error("useAdvisorPanel must be used within AdvisorPanelProvider")
  }
  return ctx
}
