"use client"

/**
 * @file cad-lab-nav.tsx — Pipeline stepper navigation for The Forge stages.
 *
 * @description Three-stage pipeline stepper: Concept → Build → Review.
 * Stages unlock progressively: Concept is always accessible, Build requires
 * research + modules, Review requires at least one generated module.
 * Connector lines turn orange as stages complete. Locked stages show a
 * preview dialog explaining what they contain and how to unlock them.
 */

import React, { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Search,
  Box,
  ClipboardCheck,
  CheckCircle2,
  Lock,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useCadLab } from "./cad-lab-context"

// ─── Stage Definitions ───────────────────────────────────────────────

interface StageDefinition {
  id: string
  label: string
  /** Abbreviated label shown on mobile (e.g., "C", "B", "R") */
  mobileLabel: string
  icon: LucideIcon
  href: string
  /** Description shown in the locked-stage preview dialog */
  description: string
  /** What the user needs to do to unlock this stage */
  unlockHint: string
  /** Features that will be available when unlocked */
  features: string[]
}

const STAGES: StageDefinition[] = [
  {
    id: "research",
    label: "Concept",
    mobileLabel: "C",
    icon: Search,
    href: FORGE_ROUTES.cadLab,
    description: "Describe your product. Get research, module decomposition, and AI blueprint illustrations.",
    unlockHint: "Always available",
    features: ["Engineering research report", "Module decomposition", "AI blueprint illustrations", "Source citations"],
  },
  {
    id: "build",
    label: "Build",
    mobileLabel: "B",
    icon: Box,
    href: FORGE_ROUTES.cadLabBuild,
    description: "Parametric CadQuery model generation for each sub-assembly.",
    unlockHint: "Complete the Concept stage first",
    features: ["Parametric CAD code", "7 orthographic views", "STEP + STL exports", "DFM analysis"],
  },
  {
    id: "review",
    label: "Review",
    mobileLabel: "R",
    icon: ClipboardCheck,
    href: FORGE_ROUTES.cadLabReview,
    description: "Supplier-ready engineering review package.",
    unlockHint: "Generate at least one module in the Build stage",
    features: ["Review document", "Expert discipline matching", "Print & copy support", "RFQ package"],
  },
]

/**
 * Determines which stages are unlocked based on current pipeline state.
 *
 * @param hasResearch - Whether research has been completed
 * @param moduleCount - Total number of decomposed modules
 * @param generatedCount - Number of modules with generated CAD
 * @returns Access map with enabled/completed per stage
 */
function getStageAccess(
  hasResearch: boolean,
  moduleCount: number,
  generatedCount: number,
): Record<string, { enabled: boolean; completed: boolean }> {
  return {
    research: { enabled: true, completed: hasResearch },
    build: { enabled: hasResearch && moduleCount > 0, completed: generatedCount > 0 && generatedCount === moduleCount },
    review: { enabled: generatedCount > 0, completed: false },
  }
}

/**
 * CadLabNav — Pipeline stepper with locked-stage preview dialogs.
 *
 * @description Shows 3 stages (Concept → Build → Review) as connected circles
 * with labels. Disabled stages open a preview dialog explaining what they contain.
 * Active stage glows orange. Completed stages show a check icon.
 */
export function CadLabNav({ className }: { className?: string }): React.ReactNode {
  const pathname = usePathname()
  const { hasResearch, modules, generatedModuleCount } = useCadLab()
  const [previewStageId, setPreviewStageId] = useState<string | null>(null)

  const access = getStageAccess(hasResearch, modules.length, generatedModuleCount)
  const previewStage = previewStageId ? STAGES.find((s) => s.id === previewStageId) : null

  return (
    <>
      <nav
        className={cn("flex items-center py-4 px-2 sm:px-4", className)}
        aria-label="The Forge pipeline stages"
      >
        <div className="flex items-start w-full max-w-2xl mx-auto">
          {STAGES.map((stage, index) => {
            const { enabled, completed } = access[stage.id]
            const isActive = stage.href === FORGE_ROUTES.cadLab
              ? pathname === FORGE_ROUTES.cadLab
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
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors",
                        isActive && "bg-international-orange text-white shadow-[0_0_12px_rgba(255,69,0,0.4)]",
                        completed && !isActive && "bg-orange-100 text-international-orange",
                        !isActive && !completed && "bg-muted text-muted-foreground",
                      )}
                    >
                      {completed && !isActive ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium transition-colors whitespace-nowrap",
                        isActive && "text-international-orange font-semibold",
                        completed && !isActive && "text-international-orange",
                        !isActive && !completed && "text-muted-foreground",
                      )}
                    >
                      <span className="sm:hidden">{stage.mobileLabel}</span>
                      <span className="hidden sm:inline">
                        {stage.label}
                        {/* Module count badge for Build stage */}
                        {stage.id === "build" && generatedModuleCount > 0 && modules.length > 0 && (
                          <span className="ml-1 text-xs font-mono opacity-75">
                            {generatedModuleCount}/{modules.length}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                ) : (
                  <button
                    onClick={() => setPreviewStageId(stage.id)}
                    className="flex flex-col items-center gap-1.5 cursor-pointer hover:opacity-70 transition-opacity"
                    aria-label={`${stage.label} (locked — click for preview)`}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground/50">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground/50 whitespace-nowrap">
                      <span className="sm:hidden">{stage.mobileLabel}</span>
                      <span className="hidden sm:inline">{stage.label}</span>
                    </span>
                  </button>
                )}
              </React.Fragment>
            )
          })}
        </div>
      </nav>

      {/* Locked-stage preview dialog */}
      <Dialog open={previewStageId !== null} onOpenChange={(open) => { if (!open) setPreviewStageId(null) }}>
        <DialogContent size="sm">
          {previewStage && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <previewStage.icon className="h-5 w-5 text-muted-foreground" />
                  {previewStage.label}
                </DialogTitle>
                <DialogDescription>
                  {previewStage.description}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {/* Unlock hint */}
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/50 border border-muted">
                  <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-foreground">How to unlock</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{previewStage.unlockHint}</p>
                  </div>
                </div>

                {/* Features preview */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    What you&apos;ll get
                  </p>
                  <ul className="space-y-1.5">
                    {previewStage.features.map((feature) => (
                      <li key={feature} className="text-sm text-foreground flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-international-orange flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
