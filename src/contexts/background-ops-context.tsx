"use client"

/**
 * @file background-ops-context.tsx
 *
 * @description Global operations registry that survives page navigation.
 * Mounted at the platform layout level so any feature can register
 * long-running async work (AI analysis, batch generation, image creation,
 * etc.) and have it continue running — with visible progress — even when
 * the user navigates to a different page.
 *
 * Features own their async logic; this context is a dumb status registry
 * that fires toasts on completion/failure and auto-dismisses finished ops.
 *
 * @related
 * - useBackgroundOp hook: src/hooks/useBackgroundOp.ts
 * - BackgroundOpsIndicator: src/components/BackgroundOpsIndicator.tsx
 * - Platform layout: src/app/(platform)/layout.tsx
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

// ─── Types ──────────────────────────────────────────────────────────────────

export type BackgroundOpStatus = "running" | "complete" | "error"

export interface BackgroundOp {
  /** Unique identifier for this operation */
  id: string
  /** Human-readable label (e.g. "Generating blueprints") */
  label: string
  /** Route the operation was started from (e.g. "/the-forge/projects/abc") */
  sourceRoute: string
  /** Current status */
  status: BackgroundOpStatus
  /** Optional 0–100 progress percentage */
  progress?: number
  /** Optional label for the current step (e.g. "Running Structural FEA") */
  stepLabel?: string
  /** Error message when status is "error" */
  error?: string
  /** Success or completion message */
  successMessage?: string
  /** Timestamp when the operation started */
  startedAt: number
  /** Timestamp when the operation finished (complete or error) */
  finishedAt?: number
}

/** Fields that can be updated on a running operation */
export interface BackgroundOpUpdate {
  progress?: number
  stepLabel?: string
}

interface BackgroundOpsContextValue {
  /** All tracked operations (running + recently finished) */
  ops: BackgroundOp[]
  /** Number of currently running operations */
  activeCount: number
  /** Register a new operation and return its id */
  startOp: (label: string, sourceRoute: string) => string
  /** Update progress/step on a running operation */
  updateOp: (id: string, update: BackgroundOpUpdate) => void
  /** Mark an operation as successfully completed */
  completeOp: (id: string, successMessage?: string) => void
  /** Mark an operation as failed */
  failOp: (id: string, errorMessage?: string) => void
  /** Remove an operation from the list immediately */
  dismissOp: (id: string) => void
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Completed/errored ops auto-dismiss after this duration */
const AUTO_DISMISS_MS = 30_000

// ─── Context ────────────────────────────────────────────────────────────────

const BackgroundOpsContext = createContext<BackgroundOpsContextValue | null>(null)

// ─── Provider ───────────────────────────────────────────────────────────────

let nextOpId = 1

/**
 * Provides global background operations tracking to the platform layout.
 *
 * @description Wraps the platform layout so any feature can register
 * long-running work, report progress, and have it survive navigation.
 * Fires toasts on completion/failure and auto-dismisses finished ops.
 */
export function BackgroundOpsProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [ops, setOps] = useState<BackgroundOp[]>([])
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router
  const dismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Clean up timers on unmount
  useEffect(() => {
    const timers = dismissTimers.current
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    }
  }, [])

  const scheduleDismiss = useCallback((id: string) => {
    // Clear any existing timer for this op
    const existing = dismissTimers.current.get(id)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      setOps((prev) => prev.filter((op) => op.id !== id))
      dismissTimers.current.delete(id)
    }, AUTO_DISMISS_MS)

    dismissTimers.current.set(id, timer)
  }, [])

  const startOp = useCallback((label: string, sourceRoute: string): string => {
    const id = `bg-op-${nextOpId++}`
    const op: BackgroundOp = {
      id,
      label,
      sourceRoute,
      status: "running",
      startedAt: Date.now(),
    }
    setOps((prev) => [...prev, op])
    return id
  }, [])

  const updateOp = useCallback((id: string, update: BackgroundOpUpdate): void => {
    setOps((prev) =>
      prev.map((op) =>
        op.id === id && op.status === "running"
          ? { ...op, ...update }
          : op,
      ),
    )
  }, [])

  const completeOp = useCallback((id: string, successMessage?: string): void => {
    setOps((prev) =>
      prev.map((op) =>
        op.id === id
          ? { ...op, status: "complete" as const, progress: 100, finishedAt: Date.now(), successMessage }
          : op,
      ),
    )
    // INTENT: Find the op to show a meaningful toast with optional "View" link
    // when the user has navigated away from the source page.
    setOps((prev) => {
      const op = prev.find((o) => o.id === id)
      if (op) {
        const isOnSourcePage = window.location.pathname.startsWith(op.sourceRoute)
        toast.success(successMessage ?? `${op.label} complete`, {
          duration: isOnSourcePage ? 4000 : 10000,
          ...(!isOnSourcePage ? {
            action: {
              label: "View",
              onClick: () => { routerRef.current.push(op.sourceRoute) },
            },
          } : {}),
        })
      }
      return prev
    })
    scheduleDismiss(id)
  }, [scheduleDismiss])

  const failOp = useCallback((id: string, errorMessage?: string): void => {
    setOps((prev) =>
      prev.map((op) =>
        op.id === id
          ? { ...op, status: "error" as const, error: errorMessage, finishedAt: Date.now() }
          : op,
      ),
    )
    setOps((prev) => {
      const op = prev.find((o) => o.id === id)
      if (op) {
        const isOnSourcePage = window.location.pathname.startsWith(op.sourceRoute)
        toast.error(errorMessage ?? `${op.label} failed`, {
          duration: isOnSourcePage ? 4000 : 10000,
          ...(!isOnSourcePage ? {
            action: {
              label: "View",
              onClick: () => { routerRef.current.push(op.sourceRoute) },
            },
          } : {}),
        })
      }
      return prev
    })
    scheduleDismiss(id)
  }, [scheduleDismiss])

  const dismissOp = useCallback((id: string): void => {
    const existing = dismissTimers.current.get(id)
    if (existing) {
      clearTimeout(existing)
      dismissTimers.current.delete(id)
    }
    setOps((prev) => prev.filter((op) => op.id !== id))
  }, [])

  const activeCount = useMemo(() => ops.filter((op) => op.status === "running").length, [ops])

  const value = useMemo<BackgroundOpsContextValue>(
    () => ({
      ops,
      activeCount,
      startOp,
      updateOp,
      completeOp,
      failOp,
      dismissOp,
    }),
    [ops, activeCount, startOp, updateOp, completeOp, failOp, dismissOp],
  )

  return (
    <BackgroundOpsContext.Provider value={value}>
      {children}
    </BackgroundOpsContext.Provider>
  )
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Access the background operations registry.
 *
 * @description Used by features to register long-running work and by
 * the BackgroundOpsIndicator to display progress.
 *
 * @throws Error if used outside BackgroundOpsProvider
 */
export function useBackgroundOps(): BackgroundOpsContextValue {
  const ctx = useContext(BackgroundOpsContext)
  if (!ctx) {
    throw new Error("useBackgroundOps must be used within BackgroundOpsProvider")
  }
  return ctx
}
