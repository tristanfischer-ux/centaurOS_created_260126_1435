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
  ClipboardList,
  ShoppingCart,
  Package,
  Box,
  CheckCircle2,
  Lock,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
import { GetQuoteButton } from "@/components/cad/get-quote-button"

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

export const STAGES: StageDefinition[] = [
  {
    id: "design",
    label: "Design",
    mobileLabel: "D",
    icon: Search,
    href: FORGE_ROUTES.cadLab,
    description: "Describe your product. Get research, module decomposition, and AI blueprint illustrations.",
    unlockHint: "Always available",
    features: ["Engineering research report", "Module decomposition", "AI blueprint illustrations", "Source citations"],
  },
  {
    id: "specify",
    label: "Specify",
    mobileLabel: "S",
    icon: ClipboardList,
    href: FORGE_ROUTES.cadLabSpecify,
    description: "Detailed specs per module with specialist review gate.",
    unlockHint: "Complete the Design stage first",
    features: ["Per-module diagnostics & specs", "Interface contracts", "Specialist review gate", "Early cost estimates"],
  },
  {
    id: "source",
    label: "Source",
    mobileLabel: "$",
    icon: ShoppingCart,
    href: FORGE_ROUTES.cadLabSource,
    description: "Match suppliers, create RFQs, compare quotes, and award contracts.",
    unlockHint: "Specify at least one module with specialist approval",
    features: ["Supplier matching", "RFQ creation & broadcast", "Quote comparison", "Contract award"],
  },
  {
    id: "assemble",
    label: "Assemble",
    mobileLabel: "A",
    icon: Package,
    href: FORGE_ROUTES.cadLabAssemble,
    description: "Track manufacturing orders, receive parts, and manage assembly.",
    unlockHint: "Award at least one supplier contract in Source",
    features: ["Manufacturing order tracking", "Parts receiving & QC", "Assembly job management", "Shipping & delivery"],
  },
  {
    id: "cad",
    label: "CAD",
    mobileLabel: "C",
    icon: Box,
    href: FORGE_ROUTES.cadLabCad,
    description: "Generate parametric CAD models and build the system assembly.",
    unlockHint: "Complete module decomposition in the Design stage",
    features: ["Per-module CadQuery generation", "Batch pipeline", "DFM analysis", "Hierarchical STEP assembly"],
  },
]

/**
 * Determines which stages are unlocked based on current pipeline state.
 *
 * @param hasResearch - Whether research has been completed
 * @param moduleCount - Total number of decomposed modules
 * @param specifiedModuleCount - Number of modules with complete diagnostics + specialist review
 * @param manufacturingOrderCount - Number of active manufacturing orders
 * @param isSpecificationComplete - Whether all modules have completed specification
 * @returns Access map with enabled/completed per stage
 */
export function getStageAccess(
  hasResearch: boolean,
  moduleCount: number,
  specifiedModuleCount: number,
  manufacturingOrderCount: number,
  isSpecificationComplete = false,
): Record<string, { enabled: boolean; completed: boolean }> {
  return {
    design: { enabled: true, completed: hasResearch && moduleCount > 0 },
    specify: { enabled: hasResearch && moduleCount > 0, completed: specifiedModuleCount > 0 && specifiedModuleCount === moduleCount },
    source: { enabled: specifiedModuleCount > 0, completed: manufacturingOrderCount > 0 },
    assemble: { enabled: hasResearch && moduleCount > 0, completed: manufacturingOrderCount > 0 },
    cad: { enabled: hasResearch && moduleCount > 0, completed: false },
  }
}

/**
 * CadLabBottomNav — Persistent fixed bottom bar for pipeline stage navigation.
 *
 * @description Always visible at the bottom of the viewport on pipeline pages,
 * allowing users to switch stages without scrolling back to the top stepper.
 * Active stage is highlighted in International Orange. Locked stages open the
 * same preview dialog as the top stepper.
 */
export function CadLabBottomNav(): React.ReactNode {
  const pathname = usePathname()
  const { hasResearch, modules, specifiedModuleCount, manufacturingOrderCount, isSpecificationComplete } = useCadLab()
  const [previewStageId, setPreviewStageId] = useState<string | null>(null)

  const access = getStageAccess(hasResearch, modules.length, specifiedModuleCount, manufacturingOrderCount, isSpecificationComplete)
  const previewStage = previewStageId ? STAGES.find((s) => s.id === previewStageId) : null

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border"
        aria-label="Pipeline stage navigation"
      >
        <div className="flex items-stretch h-14 max-w-screen-lg mx-auto">
          {STAGES.map((stage) => {
            const { enabled, completed } = access[stage.id]
            const isActive = stage.href === FORGE_ROUTES.cadLab
              ? pathname === FORGE_ROUTES.cadLab
              : pathname.startsWith(stage.href)
            const Icon = stage.icon

            return enabled ? (
              <Link
                key={stage.id}
                href={stage.href}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                  isActive
                    ? "text-international-orange border-t-2 border-international-orange -mt-px"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={isActive ? "step" : undefined}
              >
                {completed && !isActive
                  ? <CheckCircle2 className="h-4 w-4" />
                  : <Icon className="h-4 w-4" />}
                <span className="flex items-center gap-0.5">
                  <span className="sm:hidden">{stage.mobileLabel}</span>
                  <span className="hidden sm:inline">{stage.label}</span>
                  {stage.id === "cad" && <Badge variant="secondary" className="text-[8px] px-1 py-0 leading-tight font-semibold uppercase hidden sm:inline">Beta</Badge>}
                </span>
              </Link>
            ) : (
              <button
                key={stage.id}
                onClick={() => setPreviewStageId(stage.id)}
                className="flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground/50 transition-opacity hover:opacity-70"
              >
                <Icon className="h-4 w-4" />
                <span className="flex items-center gap-0.5">
                  <span className="sm:hidden">{stage.mobileLabel}</span>
                  <span className="hidden sm:inline">{stage.label}</span>
                  {stage.id === "cad" && <Badge variant="secondary" className="text-[8px] px-1 py-0 leading-tight font-semibold uppercase hidden sm:inline">Beta</Badge>}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Locked-stage preview dialog (same content as top stepper) */}
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
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/50 border border-muted">
                  <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-foreground">How to unlock</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{previewStage.unlockHint}</p>
                  </div>
                </div>
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

/**
 * CadLabNav — Pipeline stepper with locked-stage preview dialogs.
 *
 * @description Shows 3 stages (Concept → Build → Review) as connected circles
 * with labels. Disabled stages open a preview dialog explaining what they contain.
 * Active stage glows orange. Completed stages show a check icon.
 */
export function CadLabNav({ className }: { className?: string }): React.ReactNode {
  const pathname = usePathname()
  const {
    hasResearch, modules, specifiedModuleCount, manufacturingOrderCount, isSpecificationComplete,
    subject, diagnosticAnswers, designBrief, assumptionNotes, activeProjectId, linkedRfqId, linkRfqToProject,
  } = useCadLab()
  const [previewStageId, setPreviewStageId] = useState<string | null>(null)

  const access = getStageAccess(hasResearch, modules.length, specifiedModuleCount, manufacturingOrderCount, isSpecificationComplete)
  const previewStage = previewStageId ? STAGES.find((s) => s.id === previewStageId) : null

  return (
    <>
      <nav
        className={cn("flex items-center py-6 px-4 sm:px-6", className)}
        aria-label="The Forge pipeline stages"
      >
        <div className="flex items-start gap-1 sm:gap-2 w-full max-w-3xl mx-auto">
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
                      "h-0.5 flex-1 mt-[17px] sm:mt-[19px]",
                      prevCompleted ? "bg-international-orange" : "bg-muted",
                    )}
                    aria-hidden
                  />
                )}

                {/* Stage node */}
                {enabled ? (
                  <Link
                    href={stage.href}
                    className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-international-orange focus:ring-offset-2 rounded-sm"
                    aria-label={`${stage.label}${isActive ? " (current stage)" : ""}${completed ? " (completed)" : ""}`}
                    aria-current={isActive ? "step" : undefined}
                  >
                    <div
                      className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors",
                        isActive && "bg-international-orange text-white shadow-[0_0_12px_rgba(255,69,0,0.4)]",
                        completed && !isActive && "bg-orange-100 text-international-orange",
                        !isActive && !completed && "bg-muted text-muted-foreground",
                      )}
                    >
                      {completed && !isActive ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
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
                        {/* Module count badge for Specify stage */}
                        {stage.id === "specify" && specifiedModuleCount > 0 && modules.length > 0 && (
                          <span className="ml-1 text-xs font-mono opacity-75">
                            {specifiedModuleCount}/{modules.length}
                          </span>
                        )}
                        {stage.id === "cad" && <Badge variant="secondary" className="ml-1 text-[8px] px-1 py-0 leading-tight font-semibold uppercase">Beta</Badge>}
                      </span>
                    </span>
                  </Link>
                ) : (
                  <button
                    onClick={() => setPreviewStageId(stage.id)}
                    className="flex flex-col items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity"
                    aria-label={`${stage.label} (locked — click for preview)`}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground/50">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground/50 whitespace-nowrap">
                      <span className="sm:hidden">{stage.mobileLabel}</span>
                      <span className="hidden sm:inline">
                        {stage.label}
                        {stage.id === "cad" && <Badge variant="secondary" className="ml-1 text-[8px] px-1 py-0 leading-tight font-semibold uppercase">Beta</Badge>}
                      </span>
                    </span>
                  </button>
                )}
              </React.Fragment>
            )
          })}
        </div>

        {/* Get Quote — accessible from any pipeline stage when modules are specified */}
        {specifiedModuleCount > 0 && !linkedRfqId && (
          <div className="ml-4 flex-shrink-0 self-center">
            <GetQuoteButton
              projectId={activeProjectId}
              pipelineStage={
                pathname.includes("/source") ? "source"
                : pathname.includes("/specify") ? "specify"
                : pathname.includes("/assemble") ? "assemble"
                : "design"
              }
              modules={modules}
              diagnosticAnswers={diagnosticAnswers as Record<string, Record<string, string>>}
              designBrief={designBrief}
              assumptionNotes={assumptionNotes}
              projectName={subject}
              linkedRfqId={linkedRfqId}
              onRfqLinked={linkRfqToProject}
              size="sm"
            />
          </div>
        )}
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
