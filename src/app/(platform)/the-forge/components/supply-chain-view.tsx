/**
 * @file supply-chain-view.tsx — Stage 4: Supply Chain client component
 *
 * @description "Who builds it?" — Matches suppliers to modules and allows
 * supplier comparison and assignment. Loads suppliers on mount.
 *
 * @related
 * - Page: src/app/(platform)/the-forge/[id]/supply-chain/page.tsx
 * - Context: src/app/(platform)/the-forge/components/forge-project-context.tsx
 */

"use client"

import React, { useEffect } from "react"

import { EmptyState } from "@/components/ui/empty-state"

import { useForgeProject } from "./forge-project-context"
import { SupplyChain } from "./supply-chain"

import type { XRaySpec } from "../services/xray-schema"

// ─── Helpers ─────────────────────────────────────────────────────────

function isGatingDiagComplete(spec: XRaySpec): boolean {
  const gating = spec.modules.find((m) => m.isGatingModule) ?? spec.modules.find((m) => m.id === "react")
  if (!gating) return true
  if (gating.diagnostic?.derivedProcessClass) return true
  return false
}

/**
 * SupplyChainView — Stage 4 client component.
 *
 * @description Renders the SupplyChain component for supplier matching.
 * Automatically loads supplier matches on mount if modules exist.
 */
export function SupplyChainView(): React.ReactNode {
  const {
    spec,
    suppliersByModule,
    isSuppliersLoading,
    loadSuppliers,
    handleAssignSupplier,
  } = useForgeProject()

  const hasModules = spec.modules.length > 0
  const diagComplete = isGatingDiagComplete(spec)

  // Auto-load suppliers on mount
  useEffect(() => {
    if (hasModules && Object.keys(suppliersByModule).length === 0 && !isSuppliersLoading) {
      loadSuppliers(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasModules])

  if (!hasModules) {
    return (
      <EmptyState
        title="No modules defined yet"
        description="Scan a product idea on the Concept page first. Supplier matches will appear here based on the modules identified."
      />
    )
  }

  return (
    <SupplyChain
      spec={spec}
      diagComplete={diagComplete}
      suppliersByModule={suppliersByModule}
      isSuppliersLoading={isSuppliersLoading}
      onRefreshSuppliers={() => loadSuppliers(true)}
      onAssignSupplier={handleAssignSupplier}
    />
  )
}
