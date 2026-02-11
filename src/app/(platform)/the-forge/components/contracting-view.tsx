/**
 * @file contracting-view.tsx — Stage 5: Contracting & RFQ client component
 *
 * @description "How do we formalize it?" — Full procurement dashboard for
 * generating RFQ packs, SOWs, NDAs, and tracking readiness per module.
 * Replaced the previous stub that only showed "Coming Soon."
 *
 * @related
 * - Page: src/app/(platform)/the-forge/[id]/contracting/page.tsx
 * - Context: src/app/(platform)/the-forge/components/forge-project-context.tsx
 * - Dashboard: src/app/(platform)/the-forge/components/contracting-dashboard.tsx
 */

"use client"

import React from "react"

import { EmptyState } from "@/components/ui/empty-state"

import { useForgeProject } from "./forge-project-context"
import { ContractingDashboard } from "./contracting-dashboard"

/**
 * ContractingView — Stage 5 client component.
 *
 * @description Renders the full contracting dashboard for procurement.
 * Shows empty state when no modules exist yet.
 */
export function ContractingView(): React.ReactNode {
  const { spec, scanId, project } = useForgeProject()

  const hasModules = spec.modules.length > 0

  if (!hasModules) {
    return (
      <EmptyState
        title="No modules defined yet"
        description="Scan a product idea on the Concept page first. RFQ generation will be available once modules and suppliers are identified."
      />
    )
  }

  return (
    <ContractingDashboard
      spec={spec}
      scanId={scanId}
      foundryId={project.foundryId}
      projectName={project.name ?? "Untitled Project"}
    />
  )
}
