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
  useRef,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"
import { getSpecialistById } from "@/lib/agents/specialists-config"
import { getSpecialistForRoute } from "@/lib/route-specialist-map"
import type { Specialist } from "@/lib/agents/specialists-config"

// ─── Types ──────────────────────────────────────────────────────────────────

interface OpenPanelOptions {
  /** Context passed from the page or a referring specialist */
  handoffContext?: string | null
  /** Name of the specialist that referred the user */
  referredBy?: string | null
  /** Badge label for what entity is being discussed */
  contextLabel?: string | null
}

/** Entry in the handoff trail breadcrumb */
export interface HandoffTrailEntry {
  specialistId: string
  name: string
}

interface AdvisorPanelState {
  /** Whether the panel is visible */
  isOpen: boolean
  /** Whether the panel is in fullscreen overlay mode */
  isFullscreen: boolean
  /** The active specialist in the panel */
  activeSpecialist: Specialist | null
  /** Context passed from page or referring specialist */
  handoffContext: string | null
  /** Name of the referring specialist */
  referredBy: string | null
  /** Badge label for what's being discussed */
  contextLabel: string | null
  /** Trail of specialist handoffs for breadcrumb display */
  handoffTrail: HandoffTrailEntry[]
  /** Source specialist's thread ID for deep handoff context */
  handoffSourceThreadId: string | null
  /** Source specialist's ID for deep handoff context */
  handoffSourceSpecialistId: string | null
}

interface AdvisorPanelContextValue extends AdvisorPanelState {
  /** Open the panel with a specific specialist */
  openPanel: (specialistId: string, options?: OpenPanelOptions) => void
  /** Close the panel */
  closePanel: () => void
  /** Toggle the panel open/closed */
  togglePanel: (specialistId?: string) => void
  /** Switch to a different specialist without closing */
  switchSpecialist: (specialistId: string, handoffCtx?: string, sourceThreadId?: string, sourceSpecialistId?: string) => void
  /** Clear the handoff trail (when user opens specialist directly) */
  clearTrail: () => void
  /** Toggle fullscreen mode for the panel */
  toggleFullscreen: () => void
  /** Set fullscreen mode explicitly */
  setFullscreen: (value: boolean) => void
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
export function AdvisorPanelProvider({ children }: { children: ReactNode }): React.ReactElement {
  const pathname = usePathname()
  const prevPathname = useRef(pathname)

  const [state, setState] = useState<AdvisorPanelState>(() => ({
    isOpen: false,
    isFullscreen: false, // Default to false, will be hydrated from localStorage
    activeSpecialist: null,
    handoffContext: null,
    referredBy: null,
    contextLabel: null,
    handoffTrail: [],
    handoffSourceThreadId: null,
    handoffSourceSpecialistId: null,
  }))

  // Hydrate fullscreen preference from localStorage on mount
  useEffect(() => {
    const storedFullscreen = localStorage.getItem('forgeos:advisor:fullscreen')
    setState((prev) => ({
      ...prev,
      isFullscreen: storedFullscreen === 'true',
    }))
  }, [])

  // INTENT: Switch to the relevant specialist when the user navigates to a new
  // page while the panel is already open. Prevents stale Cal showing on Investors page.
  useEffect(() => {
    if (pathname === prevPathname.current) return
    prevPathname.current = pathname

    setState((prev) => {
      if (!prev.isOpen) return prev

      const { specialistId } = getSpecialistForRoute(pathname ?? "/")
      const newSpecialist = getSpecialistById(specialistId)
      if (!newSpecialist || newSpecialist.id === prev.activeSpecialist?.id) return prev

      return {
        ...prev,
        activeSpecialist: newSpecialist,
        handoffContext: null,
        referredBy: null,
        contextLabel: null,
        handoffTrail: [],
        handoffSourceThreadId: null,
        handoffSourceSpecialistId: null,
      }
    })
  }, [pathname])

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
      handoffTrail: [], // Direct open = fresh start, clear trail
      handoffSourceThreadId: null,
      handoffSourceSpecialistId: null,
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
            handoffTrail: [],
            handoffSourceThreadId: null,
            handoffSourceSpecialistId: null,
          }
        }
      }
      if (prev.activeSpecialist) {
        return { ...prev, isOpen: true }
      }
      return prev
    })
  }, [])

  const switchSpecialist = useCallback((specialistId: string, handoffCtx?: string, sourceThreadId?: string, sourceSpecialistId?: string) => {
    const specialist = getSpecialistById(specialistId)
    if (!specialist) return

    setState((prev) => {
      // Append current specialist to handoff trail before switching, cap at 10
      const updatedTrail = prev.activeSpecialist
        ? [...prev.handoffTrail, { specialistId: prev.activeSpecialist.id, name: prev.activeSpecialist.name }].slice(-10)
        : prev.handoffTrail

      return {
        ...prev,
        isOpen: true,
        activeSpecialist: specialist,
        handoffContext: handoffCtx ?? null,
        referredBy: handoffCtx ? prev.activeSpecialist?.name ?? null : null,
        handoffTrail: updatedTrail,
        handoffSourceThreadId: sourceThreadId ?? null,
        handoffSourceSpecialistId: sourceSpecialistId ?? null,
      }
    })
  }, [])

  const clearTrail = useCallback(() => {
    setState((prev) => ({ ...prev, handoffTrail: [] }))
  }, [])

  const toggleFullscreen = useCallback(() => {
    setState((prev) => {
      const newFullscreen = !prev.isFullscreen
      localStorage.setItem('forgeos:advisor:fullscreen', newFullscreen.toString())
      return { ...prev, isFullscreen: newFullscreen }
    })
  }, [])

  const setFullscreen = useCallback((value: boolean) => {
    setState((prev) => {
      localStorage.setItem('forgeos:advisor:fullscreen', value.toString())
      return { ...prev, isFullscreen: value }
    })
  }, [])

  const value = useMemo<AdvisorPanelContextValue>(
    () => ({
      ...state,
      openPanel,
      closePanel,
      togglePanel,
      switchSpecialist,
      clearTrail,
      toggleFullscreen,
      setFullscreen,
    }),
    [state, openPanel, closePanel, togglePanel, switchSpecialist, clearTrail, toggleFullscreen, setFullscreen],
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
