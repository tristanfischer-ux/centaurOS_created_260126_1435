"use client"

/**
 * @file use-forge-matching.ts — People + supplier matching for Forge projects.
 *
 * @description Manages async people/expert and supplier matching operations,
 * caching results in local state.
 */

import { useState, useCallback, useRef } from "react"
import { toast } from "sonner"

import { matchPeopleAction, matchSuppliersAction } from "@/actions/xray"

import type { XRaySpec, ModuleSpec } from "../../services/xray-schema"
import type { PersonMatch } from "../../services/people"
import type { SupplierMatch } from "../../services/suppliers"

interface UseForgeMatchingOptions {
  scanId: string
  specRef: React.MutableRefObject<XRaySpec>
  isMountedRef: React.MutableRefObject<boolean>
}

export interface UseForgeMatchingReturn {
  people: PersonMatch[]
  isPeopleLoading: boolean
  loadPeople: (forceRefresh?: boolean) => void
  suppliersByModule: Record<string, SupplierMatch[]>
  isSuppliersLoading: boolean
  loadSuppliers: (forceRefresh?: boolean) => void
}

function findGatingModule(modules: ModuleSpec[]): ModuleSpec | undefined {
  return modules.find((m) => m.isGatingModule) ?? modules.find((m) => m.id === "react")
}

function isGatingDiagComplete(spec: XRaySpec): boolean {
  const gating = findGatingModule(spec.modules)
  if (!gating) return true
  if (gating.diagnostic?.derivedProcessClass) return true
  return false
}

/**
 * useForgeMatching — People and supplier matching with caching.
 */
export function useForgeMatching({
  scanId,
  specRef,
  isMountedRef,
}: UseForgeMatchingOptions): UseForgeMatchingReturn {
  const [people, setPeople] = useState<PersonMatch[]>([])
  const [isPeopleLoading, setIsPeopleLoading] = useState(false)
  const [suppliersByModule, setSuppliersByModule] = useState<Record<string, SupplierMatch[]>>({})
  const [isSuppliersLoading, setIsSuppliersLoading] = useState(false)

  // Request versioning: if a newer request fires before the old completes,
  // the stale result is ignored.
  const peopleVersionRef = useRef(0)
  const supplierVersionRef = useRef(0)

  const loadPeople = useCallback((forceRefresh = false): void => {
    if (specRef.current.modules.length === 0) return
    const version = ++peopleVersionRef.current
    setIsPeopleLoading(true)
    matchPeopleAction(scanId, specRef.current.modules, forceRefresh)
      .then((result) => {
        if (!isMountedRef.current || version !== peopleVersionRef.current) return
        if ("people" in result) {
          setPeople(result.people)
        } else {
          console.error("[Forge] People error:", result.error)
          toast.error("Failed to find expert matches")
        }
      })
      .catch((err) => {
        console.error("[Forge] People error:", err)
        if (isMountedRef.current && version === peopleVersionRef.current) {
          toast.error("Failed to load expert matches")
        }
      })
      .finally(() => {
        if (isMountedRef.current && version === peopleVersionRef.current) {
          setIsPeopleLoading(false)
        }
      })
  }, [scanId, specRef, isMountedRef])

  const loadSuppliers = useCallback((forceRefresh = false): void => {
    if (specRef.current.modules.length === 0) return
    const diagComplete = isGatingDiagComplete(specRef.current)
    const version = ++supplierVersionRef.current
    setIsSuppliersLoading(true)
    matchSuppliersAction(scanId, specRef.current.modules, diagComplete, forceRefresh)
      .then((result) => {
        if (!isMountedRef.current || version !== supplierVersionRef.current) return
        if ("suppliersByModule" in result) {
          setSuppliersByModule(result.suppliersByModule)
        } else {
          console.error("[Forge] Supplier error:", result.error)
          toast.error("Failed to find supplier matches")
        }
      })
      .catch((err) => {
        console.error("[Forge] Supplier error:", err)
        if (isMountedRef.current && version === supplierVersionRef.current) {
          toast.error("Failed to load supplier matches")
        }
      })
      .finally(() => {
        if (isMountedRef.current && version === supplierVersionRef.current) {
          setIsSuppliersLoading(false)
        }
      })
  }, [scanId, specRef, isMountedRef])

  return {
    people,
    isPeopleLoading,
    loadPeople,
    suppliersByModule,
    isSuppliersLoading,
    loadSuppliers,
  }
}
