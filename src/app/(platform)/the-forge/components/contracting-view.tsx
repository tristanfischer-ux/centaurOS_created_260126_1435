/**
 * @file contracting-view.tsx — Stage 5: Contracting & RFQ client component
 *
 * @description "How do we formalize it?" — Generate Requests for Quotation,
 * review terms, and formalize procurement for each module.
 *
 * @related
 * - Page: src/app/(platform)/the-forge/[id]/contracting/page.tsx
 * - Context: src/app/(platform)/the-forge/components/forge-project-context.tsx
 */

"use client"

import React from "react"

import { EmptyState } from "@/components/ui/empty-state"

import { useForgeProject } from "./forge-project-context"
import { RfqSection } from "./rfq-section"

/**
 * ContractingView — Stage 5 client component.
 *
 * @description Renders the RFQ section for procurement formalization.
 */
export function ContractingView(): React.ReactNode {
  const { spec } = useForgeProject()

  const hasModules = spec.modules.length > 0

  if (!hasModules) {
    return (
      <EmptyState
        title="No modules defined yet"
        description="Scan a product idea on the Concept page first. RFQ generation will be available once modules and suppliers are identified."
      />
    )
  }

  return <RfqSection spec={spec} />
}
