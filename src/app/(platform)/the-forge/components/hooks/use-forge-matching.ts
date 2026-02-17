"use client"

/**
 * @file use-forge-matching.ts — People + supplier matching for Forge projects.
 *
 * @description Manages async people/expert and supplier matching operations,
 * caching results in local state.
 */

import { useState, useCallback } from "react"

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

  const loadPeople = useCallback((forceRefresh = false): void => {
    if (specRef.current.modules.length === 0) return
    setIsPeopleLoading(true)
    matchPeopleAction(scanId, specRef.current.modules, forceRefresh)
      .then((result) => {
        if (!isMountedRef.current) return
        if ("people" in result) setPeople(result.people)
        else console.error("[Forge] People error:", result.error)
      })
      .catch((err) => console.error("[Forge] People error:", err))
      .finally(() => setIsPeopleLoading(false))
  }, [scanId, specRef, isMountedRef])

  const loadSuppliers = useCallback((forceRefresh = false): void => {
    if (specRef.current.modules.length === 0) return
    const diagComplete = isGatingDiagComplete(specRef.current)
    setIsSuppliersLoading(true)
    matchSuppliersAction(scanId, specRef.current.modules, diagComplete, forceRefresh)
      .then((result) => {
        if (!isMountedRef.current) return
        if ("suppliersByModule" in result) setSuppliersByModule(result.suppliersByModule)
        else console.error("[Forge] Supplier error:", result.error)
      })
      .catch((err) => console.error("[Forge] Supplier error:", err))
      .finally(() => setIsSuppliersLoading(false))
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
