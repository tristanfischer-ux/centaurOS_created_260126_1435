"use client"

/**
 * @file cad-lab-nav.tsx — Pipeline stepper navigation for The Forge stages.
 *
 * @description Five-stage pipeline stepper modeled on ForgeSubNav. Stages
 * unlock progressively: Research is always accessible, Build requires research
 * + modules, Analysis/Procurement/Review require at least one generated module.
 * Connector lines turn orange as stages complete.
 */

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Search,
  Box,
  BarChart3,
  ShoppingCart,
  ClipboardCheck,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useCadLab } from "./cad-lab-context"

// ─── Stage Definitions ───────────────────────────────────────────────

interface StageDefinition {
  id: string
  label: string
  icon: LucideIcon
  href: string
}

const STAGES: StageDefinition[] = [
  { id: "research", label: "Research", icon: Search, href: "/the-forge/cad-lab" },
  { id: "build", label: "Build", icon: Box, href: "/the-forge/cad-lab/build" },
  { id: "analysis", label: "Analysis", icon: BarChart3, href: "/the-forge/cad-lab/analysis" },
  { id: "procurement", label: "Procurement", icon: ShoppingCart, href: "/the-forge/cad-lab/procurement" },
  { id: "review", label: "Review", icon: ClipboardCheck, href: "/the-forge/cad-lab/review" },
]

/**
 * Determines which stages are unlocked based on current pipeline state.
 */
function getStageAccess(
  hasResearch: boolean,
  moduleCount: number,
  generatedCount: number,
): Record<string, { enabled: boolean; completed: boolean }> {
  return {
    research: { enabled: true, completed: hasResearch },
    build: { enabled: hasResearch && moduleCount > 0, completed: generatedCount > 0 && generatedCount === moduleCount },
    analysis: { enabled: generatedCount > 0, completed: false },
    procurement: { enabled: generatedCount > 0, completed: false },
    review: { enabled: generatedCount > 0, completed: false },
  }
}

/**
 * CadLabNav — Pipeline stepper for The Forge multi-page flow.
 *
 * @description Shows 5 stages as connected circles with labels.
 * Disabled stages are muted and not clickable. Active stage glows orange.
 * Completed stages show a check icon with orange tint.
 */
export function CadLabNav({ className }: { className?: string }): React.ReactNode {
  const pathname = usePathname()
  const { hasResearch, modules, generatedModuleCount } = useCadLab()

  const access = getStageAccess(hasResearch, modules.length, generatedModuleCount)

  return (
    <nav
      className={cn("flex items-center py-4 px-2 sm:px-4", className)}
      aria-label="The Forge pipeline stages"
    >
      <div className="flex items-start w-full max-w-2xl mx-auto">
        {STAGES.map((stage, index) => {
          const { enabled, completed } = access[stage.id]
          const isActive = stage.href === "/the-forge/cad-lab"
            ? pathname === "/the-forge/cad-lab"
            : pathname.startsWith(stage.href)
          const Icon = stage.icon

          // Connector line: orange if previous stage is completed
          const prevStage = index > 0 ? STAGES[index - 1] : null
          const prevCompleted = prevStage ? access[prevStage.id].completed : false

          return (
            <React.Fragment key={stage.id}>
              {/* Connector line */}
              {index > 0 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mt-[15px] sm:mt-[17px]",
                    prevCompleted ? "bg-international-orange" : "bg-muted",
                  )}
                  aria-hidden
                />
              )}

              {/* Stage node */}
              {enabled ? (
                <Link
                  href={stage.href}
                  className="flex flex-col items-center gap-1.5 transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-international-orange focus:ring-offset-2 rounded-sm"
                  aria-label={`${stage.label}${isActive ? " (current stage)" : ""}${completed ? " (completed)" : ""}`}
                  aria-current={isActive ? "step" : undefined}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors sm:h-9 sm:w-9",
                      isActive && "bg-international-orange text-white shadow-[0_0_12px_rgba(255,69,0,0.4)]",
                      completed && !isActive && "bg-orange-100 text-international-orange",
                      !isActive && !completed && "bg-muted text-muted-foreground",
                    )}
                  >
                    {completed && !isActive ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span
                    className={cn(
                      "hidden text-xs font-medium transition-colors sm:block whitespace-nowrap",
                      isActive && "text-international-orange font-semibold",
                      completed && !isActive && "text-international-orange",
                      !isActive && !completed && "text-muted-foreground",
                    )}
                  >
                    {stage.label}
                    {/* Module count badge for Build stage */}
                    {stage.id === "build" && generatedModuleCount > 0 && modules.length > 0 && (
                      <span className="ml-1 text-[9px] font-mono opacity-75">
                        {generatedModuleCount}/{modules.length}
                      </span>
                    )}
                  </span>
                </Link>
              ) : (
                <div className="flex flex-col items-center gap-1.5 cursor-not-allowed" aria-disabled="true">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground/50 sm:h-9 sm:w-9">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="hidden text-xs font-medium text-muted-foreground/50 sm:block whitespace-nowrap">
                    {stage.label}
                  </span>
                </div>
              )}
            </React.Fragment>
          )
        })}
      </div>
    </nav>
  )
}
