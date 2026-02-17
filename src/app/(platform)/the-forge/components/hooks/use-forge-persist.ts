"use client"

/**
 * @file use-forge-persist.ts — Debounced spec persistence + Realtime subscription.
 *
 * @description Manages the XRaySpec state, debounced server persistence,
 * Supabase Realtime subscription for background scan updates, and provides
 * setSpec (with auto-persist) and raw setSpecInternal (no persist).
 *
 * @related forge-project-context.tsx — Composes this hook with others
 */

import { useState, useCallback, useRef, useEffect } from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { updateScanSpecAction } from "@/actions/xray"

import type { XRaySpec, ModuleSpec } from "../../services/xray-schema"
import type { ScanStatus, ForgeProject } from "../forge-project-context"

interface UseForgePersistOptions {
  initialProject: ForgeProject
}

export interface UseForgePersistReturn {
  /** Current spec state */
  spec: XRaySpec
  /** Update spec AND trigger debounced persist */
  setSpec: (next: XRaySpec) => void
  /** Update spec WITHOUT triggering persist (for server-action results already saved) */
  setSpecDirect: (next: XRaySpec) => void
  /** Ref holding the latest spec (for use in closures) */
  specRef: React.MutableRefObject<XRaySpec>
  /** Ref tracking whether the component is still mounted */
  isMountedRef: React.MutableRefObject<boolean>
  /** Current scan status from Realtime */
  scanStatus: ScanStatus
  /** Non-null when last persist failed */
  persistError: string | null
  /** True when debounced persist is in progress */
  isSaving: boolean
  /** Update a single module in the spec and persist */
  handleModuleUpdate: (updated: ModuleSpec) => void
  /** Assign a supplier name to a module */
  handleAssignSupplier: (moduleId: string, supplierName: string) => void
}

/**
 * useForgePersist — Core spec state management with debounced server persist
 * and Supabase Realtime subscription for background updates.
 */
export function useForgePersist({ initialProject }: UseForgePersistOptions): UseForgePersistReturn {
  const [spec, setSpecInternal] = useState<XRaySpec>(initialProject.spec)
  const specRef = useRef<XRaySpec>(initialProject.spec)
  const scanId = initialProject.scanId

  const [scanStatus, setScanStatus] = useState<ScanStatus>(initialProject.scanStatus || "idle")
  const [persistError, setPersistError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const lastStatusRef = useRef<string>(initialProject.scanStatus || "idle")
  const localEditInProgressRef = useRef(false)
  const isMountedRef = useRef(true)
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSpecRef = useRef<XRaySpec | null>(null)

  // Unmount cleanup
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current)
        persistTimeoutRef.current = null
      }
    }
  }, [])

  // ── Supabase Realtime subscription ──
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`xray-scan-${scanId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "xray_scans",
          filter: `id=eq.${scanId}`,
        },
        (payload) => {
          if (!isMountedRef.current) return
          if (localEditInProgressRef.current) return

          const newRow = payload.new as {
            scan_status?: string
            spec?: XRaySpec
          }

          const previousStatus = lastStatusRef.current

          if (newRow.scan_status) {
            setScanStatus(newRow.scan_status as ScanStatus)
            lastStatusRef.current = newRow.scan_status
          }

          if (
            newRow.scan_status === "complete" &&
            previousStatus !== "complete" &&
            newRow.spec
          ) {
            const updatedSpec = newRow.spec as XRaySpec
            if (updatedSpec.modules && updatedSpec.modules.length > 0 && isMountedRef.current) {
              setSpecInternal(updatedSpec)
              specRef.current = updatedSpec
              toast.success(`Concept ready: ${updatedSpec.modules.length} modules identified`)
            }
          }

          if (newRow.spec && newRow.scan_status !== "complete" && !localEditInProgressRef.current) {
            const incomingSpec = newRow.spec as XRaySpec
            if (incomingSpec.modules?.length > 0 && isMountedRef.current) {
              setSpecInternal(incomingSpec)
              specRef.current = incomingSpec
            }
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [scanId])

  // ── Debounced persist ──
  const persistSpec = useCallback(async (nextSpec: XRaySpec): Promise<void> => {
    try {
      await updateScanSpecAction(scanId, nextSpec)
      if (isMountedRef.current) {
        setPersistError(null)
        setIsSaving(false)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown"
      console.warn("[Forge] Failed to persist spec:", msg)
      if (isMountedRef.current) {
        setPersistError("Failed to save. Please refresh and retry.")
        setIsSaving(false)
        toast.warning("Failed to save changes. Please refresh and retry.")
      }
    } finally {
      if (isMountedRef.current) localEditInProgressRef.current = false
    }
  }, [scanId])

  const flushPersist = useCallback((): void => {
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current)
      persistTimeoutRef.current = null
    }
    const specToSave = pendingSpecRef.current
    pendingSpecRef.current = null
    if (specToSave) persistSpec(specToSave)
  }, [persistSpec])

  const schedulePersist = useCallback((nextSpec: XRaySpec): void => {
    pendingSpecRef.current = nextSpec
    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current)
    persistTimeoutRef.current = setTimeout(flushPersist, 500)
  }, [flushPersist])

  // setSpec: update state + auto-persist
  const setSpec = useCallback((next: XRaySpec) => {
    setSpecInternal(next)
    specRef.current = next
    localEditInProgressRef.current = true
    setIsSaving(true)
    schedulePersist(next)
  }, [schedulePersist])

  // setSpecDirect: update state only (for server-action results already persisted)
  const setSpecDirect = useCallback((next: XRaySpec) => {
    setSpecInternal(next)
    specRef.current = next
  }, [])

  const handleModuleUpdate = useCallback((updated: ModuleSpec): void => {
    const next = { ...specRef.current, modules: specRef.current.modules.map((m) => (m.id === updated.id ? updated : m)) }
    setSpec(next)
  }, [setSpec])

  const handleAssignSupplier = useCallback((moduleId: string, supplierName: string): void => {
    const next = { ...specRef.current, modules: specRef.current.modules.map((m) => (m.id === moduleId ? { ...m, supplier: supplierName } : m)) }
    setSpec(next)
  }, [setSpec])

  return {
    spec,
    setSpec,
    setSpecDirect,
    specRef,
    isMountedRef,
    scanStatus,
    persistError,
    isSaving,
    handleModuleUpdate,
    handleAssignSupplier,
  }
}
