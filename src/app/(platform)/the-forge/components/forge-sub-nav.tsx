/**
 * @file forge-sub-nav.tsx — Stage navigation bar for Forge projects
 *
 * @description Horizontal sub-navigation showing the 5 pipeline stages.
 * Active stage uses international-orange. Stages with data show a
 * small progress dot. All stages are freely navigable (no gating).
 *
 * @related
 * - Layout: src/app/(platform)/the-forge/[id]/layout.tsx
 * - Context: src/app/(platform)/the-forge/components/forge-project-context.tsx
 */

"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Lightbulb, Wrench, Users, Truck, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

import type { XRaySpec } from "../services/xray-schema"
import type { ForgeStage } from "./forge-project-context"

// ─── Stage Definitions ───────────────────────────────────────────────

interface StageDefinition {
  id: ForgeStage
  label: string
  icon: React.ElementType
  segment: string
}

const STAGES: StageDefinition[] = [
  { id: "concept", label: "Concept", icon: Lightbulb, segment: "concept" },
  { id: "dossier", label: "Dossier", icon: Wrench, segment: "dossier" },
  { id: "people", label: "People", icon: Users, segment: "people" },
  { id: "supply_chain", label: "Supply Chain", icon: Truck, segment: "supply-chain" },
  { id: "contracting", label: "Contracting", icon: FileText, segment: "contracting" },
]

// ─── Stage Progress Detection ────────────────────────────────────────

/**
 * Determines which stages have meaningful data.
 *
 * @param spec - The current XRaySpec
 * @returns Set of stage IDs that have data
 */
function getStagesWithData(spec: XRaySpec): Set<ForgeStage> {
  const stages = new Set<ForgeStage>()

  // Concept: has modules defined
  if (spec.modules.length > 0) {
    stages.add("concept")
  }

  // Dossier: has any analysis, images, or diagnostic data
  const hasAnalysis = spec.modules.some((m) => m.cadModel?.analysis)
  const hasImages = spec.modules.some((m) => m.imageStatus === "complete")
  const hasDiagnostic = spec.modules.some((m) => m.diagnostic?.derivedProcessClass)
  if (hasAnalysis || hasImages || hasDiagnostic) {
    stages.add("dossier")
  }

  // People: has expert questions defined (always available after scan)
  if (spec.modules.some((m) => m.detail?.expertQuestions?.length > 0)) {
    stages.add("people")
  }

  // Supply chain: has supplier assignments
  if (spec.modules.some((m) => m.supplier)) {
    stages.add("supply_chain")
  }

  // Contracting: has estimated costs
  if (spec.modules.some((m) => m.estCost)) {
    stages.add("contracting")
  }

  return stages
}

// ─── Component ───────────────────────────────────────────────────────

interface ForgeSubNavProps {
  /** The project/scan ID for building links */
  projectId: string
  /** The current XRaySpec for progress detection */
  spec: XRaySpec
  /** Optional className */
  className?: string
}

/**
 * ForgeSubNav — Horizontal stage navigation bar for forge projects.
 *
 * @description Shows 5 pipeline stages as clickable links. Active stage
 * has international-orange styling. Stages with data show a small dot.
 * All stages are freely navigable.
 *
 * @example
 * <ForgeSubNav projectId={scanId} spec={spec} />
 */
export function ForgeSubNav({ projectId, spec, className }: ForgeSubNavProps): React.ReactNode {
  const pathname = usePathname()
  const stagesWithData = getStagesWithData(spec)

  return (
    <nav
      className={cn(
        "flex items-center gap-1 border-b border-muted overflow-x-auto",
        className,
      )}
      aria-label="Forge project stages"
    >
      {STAGES.map((stage) => {
        const href = `/the-forge/${projectId}/${stage.segment}`
        const isActive = pathname.includes(`/${stage.segment}`)
        const hasData = stagesWithData.has(stage.id)
        const Icon = stage.icon

        return (
          <Link
            key={stage.id}
            href={href}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap relative",
              isActive
                ? "text-international-orange"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{stage.label}</span>

            {/* Progress dot */}
            {hasData && !isActive && (
              <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
            )}

            {/* Active bottom border accent */}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-international-orange rounded-full" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
