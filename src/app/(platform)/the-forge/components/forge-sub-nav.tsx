/**
 * @file forge-sub-nav.tsx — Pipeline stage navigation for Forge projects
 *
 * @description Horizontal pipeline stepper showing the 5 sequential stages
 * as connected circles with labels. Connector lines and icon states
 * communicate progression: completed stages show a check, the active
 * stage glows orange, and pending stages are muted. All stages remain
 * freely navigable (no gating).
 *
 * @related
 * - Layout: src/app/(platform)/the-forge/[id]/layout.tsx
 * - Context: src/app/(platform)/the-forge/components/forge-project-context.tsx
 * - Similar pattern: src/components/sidebar/JourneyIndicator.tsx
 */

"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Lightbulb,
  Wrench,
  Users,
  Truck,
  FileText,
  CheckCircle2,
} from "lucide-react"
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

  // People: user has answered at least one expert question (actual engagement)
  if (spec.modules.some((m) => {
    const answers = m.interview?.answers
    if (!answers) return false
    return Object.values(answers).some((v) => String(v ?? "").trim().length > 0)
  })) {
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
 * ForgeSubNav — Pipeline stepper navigation for forge projects.
 *
 * @description Shows 5 sequential pipeline stages as circle icons connected
 * by horizontal lines. Completed stages show a check icon with orange tint,
 * the active stage glows orange, and pending stages are muted. Labels appear
 * below circles on medium+ screens. All stages are freely navigable links.
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
        "flex items-center justify-center py-4 px-2 sm:px-4",
        className,
      )}
      aria-label="Forge project stages"
    >
      <div className="flex items-start w-full max-w-2xl">
        {STAGES.map((stage, index) => {
          const href = `/the-forge/${projectId}/${stage.segment}`
          const isActive = pathname.endsWith(`/${stage.segment}`)
          const hasData = stagesWithData.has(stage.id)
          const isCompleted = hasData && !isActive
          const Icon = stage.icon

          // Connector is orange if the stage before it is completed (has data)
          const prevStage = index > 0 ? STAGES[index - 1] : null
          const prevHasData = prevStage ? stagesWithData.has(prevStage.id) : false

          return (
            <React.Fragment key={stage.id}>
              {/* Connector line between stages */}
              {index > 0 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mt-[15px] sm:mt-[17px]",
                    prevHasData
                      ? "bg-international-orange"
                      : "bg-muted",
                  )}
                  aria-hidden
                />
              )}

              {/* Stage node: circle + label, wrapped in a link */}
              <Link
                href={href}
                className="flex flex-col items-center gap-1.5 transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-international-orange focus:ring-offset-2 rounded-sm"
                aria-label={`${stage.label}${isActive ? " (current stage)" : ""}${isCompleted ? " (completed)" : ""}`}
                aria-current={isActive ? "step" : undefined}
              >
                {/* Circle icon */}
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors sm:h-9 sm:w-9",
                    isActive &&
                      "bg-international-orange text-white shadow-[0_0_12px_rgba(255,69,0,0.4)]",
                    isCompleted &&
                      "bg-orange-100 text-international-orange",
                    !isActive && !isCompleted &&
                      "bg-muted text-muted-foreground",
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>

                {/* Label — hidden on mobile for compact layout */}
                <span
                  className={cn(
                    "hidden text-xs font-medium transition-colors sm:block whitespace-nowrap",
                    isActive && "text-international-orange font-semibold",
                    isCompleted && "text-international-orange",
                    !isActive && !isCompleted && "text-muted-foreground",
                  )}
                >
                  {stage.label}
                </span>
              </Link>
            </React.Fragment>
          )
        })}
      </div>
    </nav>
  )
}
