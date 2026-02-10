/**
 * @file product-xray-view.tsx — Persistence wrapper for X-Ray Workbench
 *
 * @description Renders the standard page header then mounts the workbench
 * with localStorage-based state restoration as offline cache.
 * When a scanId is available, loads from Supabase DB instead.
 *
 * @related
 * - Server actions: src/actions/xray.ts
 * - Demo component: ./demo/ForgeOS_CompanyScan_Demo.tsx
 */

"use client"

import React, { useState, useEffect, useCallback } from "react"

import { typography } from "@/lib/design-system"
import { cn } from "@/lib/utils"
import ForgeOS_CompanyScan_Demo from "./demo/ForgeOS_CompanyScan_Demo"

import type { XRaySpec } from "./demo/ForgeOS_CompanyScan_Demo"

// ─── localStorage persistence (offline cache) ────────────────────────

const STORAGE_KEY = "xray-workbench-state"

interface PersistedState {
  spec: XRaySpec
  activeTab: string
  scanId?: string
  savedAt: string
}

/**
 * Reads persisted X-Ray workbench state from localStorage.
 */
function readPersistedState(): PersistedState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (parsed && typeof parsed.spec === "object" && typeof parsed.activeTab === "string") {
      return parsed
    }
    return null
  } catch {
    console.warn("[ProductXRay] Failed to parse persisted state, starting fresh.")
    return null
  }
}

/**
 * Writes X-Ray workbench state to localStorage.
 */
function writePersistedState(state: PersistedState): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.warn("[ProductXRay] Failed to persist state:", error instanceof Error ? error.message : "Unknown error")
  }
}

// ─── Main wrapper ────────────────────────────────────────────────────

/**
 * ProductXRayView — Persistence wrapper around the X-Ray Workbench.
 *
 * @description Renders the standard page header (orange accent bar) then mounts
 * the workbench with localStorage-based state restoration. On every spec
 * or tab change, the wrapper writes to localStorage so the user can refresh
 * without losing progress.
 */
export function ProductXRayView() {
  const [restored, setRestored] = useState<PersistedState | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  const specRef = React.useRef<XRaySpec | null>(null)
  const tabRef = React.useRef<string>("A")
  const scanIdRef = React.useRef<string | undefined>(undefined)

  // Read localStorage on mount
  useEffect(() => {
    const persisted = readPersistedState()
    if (persisted) {
      setRestored(persisted)
      specRef.current = persisted.spec
      tabRef.current = persisted.activeTab
      scanIdRef.current = persisted.scanId
    }
    setIsHydrated(true)
  }, [])

  const handleSpecChange = useCallback((spec: XRaySpec) => {
    specRef.current = spec
    writePersistedState({
      spec,
      activeTab: tabRef.current,
      scanId: scanIdRef.current,
      savedAt: new Date().toISOString(),
    })
  }, [])

  const handleTabChange = useCallback((tab: string) => {
    tabRef.current = tab
    if (specRef.current) {
      writePersistedState({
        spec: specRef.current,
        activeTab: tab,
        scanId: scanIdRef.current,
        savedAt: new Date().toISOString(),
      })
    }
  }, [])

  if (!isHydrated) {
    return (
      <div className="space-y-8">
        <PageHeader />
        <div className="h-96 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading workbench...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader />
      <ForgeOS_CompanyScan_Demo
        initialSpec={restored?.spec}
        initialTab={restored?.activeTab}
        initialScanId={restored?.scanId}
        onSpecChange={handleSpecChange}
        onTabChange={handleTabChange}
        hideHeader
      />
    </div>
  )
}

// ─── Page Header ─────────────────────────────────────────────────────

function PageHeader(): React.ReactNode {
  return (
    <div className="pb-4 border-b border-muted">
      <div className={typography.pageHeader}>
        <div className={typography.pageHeaderAccent} />
        <h1 className={typography.h1}>Product X-Ray</h1>
      </div>
      <p className={cn(typography.pageSubtitle, "mt-1")}>
        Scan an idea into a structured machine spec. Derive the experts, suppliers, and
        procurement scaffolding needed to build it.
      </p>
    </div>
  )
}
