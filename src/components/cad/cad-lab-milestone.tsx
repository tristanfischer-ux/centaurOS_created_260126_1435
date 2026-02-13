"use client"

/**
 * @file cad-lab-milestone.tsx — Subject-aware milestone celebration banners.
 *
 * @description Shows a congratulatory banner when a major milestone completes,
 * referencing the actual product name and the specific capabilities delivered
 * at each stage (7 views, CoG data, DFM analysis, etc.).
 *
 * @component
 */

import { useState } from "react"
import {
  CheckCircle2,
  X,
  Search,
  Layers,
  Cog,
  Zap,
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface MilestoneConfig {
  icon: React.ComponentType<{ className?: string }>
  title: string
  getDescription: (subject: string) => string
  timeSaved: string
  valueDetail: string
}

const MILESTONE_CONFIG: Record<string, MilestoneConfig> = {
  research: {
    icon: Search,
    title: "Research Complete",
    getDescription: (subject: string) =>
      subject
        ? `We've compiled real-world specifications for "${subject}" — dimensions from datasheets, material candidates from engineering databases, and manufacturing constraints from industry data.`
        : "Real-world specifications compiled — dimensions, materials, and manufacturing constraints sourced from engineering databases.",
    timeSaved: "3-5 days of manual research",
    valueDetail: "Dimensional data, material properties, and reference designs sourced and synthesised.",
  },
  breakdown: {
    icon: Layers,
    title: "Module Breakdown Complete",
    getDescription: (subject: string) =>
      subject
        ? `"${subject}" has been architectured into manufacturable sub-assemblies — each with defined interfaces, material requirements, and manufacturing process classification.`
        : "Your product has been architectured into manufacturable sub-assemblies with defined interfaces and manufacturing classifications.",
    timeSaved: "1-2 weeks of systems engineering",
    valueDetail: "Sub-assemblies mapped with interfaces, BOM structure, and manufacturing process assignments.",
  },
  generate: {
    icon: Cog,
    title: "CAD Generation Complete",
    getDescription: (subject: string) =>
      subject
        ? `Parametric 3D model for "${subject}" is ready — complete with 7 orthographic projections, STEP + STL exports, DFM analysis, and center-of-gravity data.`
        : "Parametric 3D model ready — 7 orthographic projections, STEP + STL exports, DFM analysis, and mass properties including center of gravity.",
    timeSaved: "2-4 weeks of manual CAD work",
    valueDetail: "7 projection views • STEP + STL export • DFM assessment • mass properties with CoG",
  },
  batch: {
    icon: Zap,
    title: "Full System Generated",
    getDescription: (subject: string) =>
      subject
        ? `Every module of "${subject}" now has parametric CAD, engineering drawings, DFM analysis, and system-level metrics. Ready for design review.`
        : "All modules have parametric CAD, engineering drawings, DFM analysis, and system-level metrics. Ready for design review.",
    timeSaved: "1-3 months of engineering effort",
    valueDetail: "System mass • max envelope • manufacturing readiness grade • per-module cost estimates",
  },
}

interface CadLabMilestoneProps {
  /** Which milestone was reached */
  milestone: "research" | "breakdown" | "generate" | "batch" | null
  /** Called when the user dismisses the banner */
  onDismiss: () => void
  /** The user's subject input for personalised messaging */
  subject?: string
}

/**
 * CadLabMilestone — Subject-aware celebration banners with specific capability callouts.
 *
 * @description References the actual product name and specific capabilities
 * delivered (7 views, CoG, DFM) instead of generic "congratulations" text.
 */
export function CadLabMilestone({ milestone, onDismiss, subject = "" }: CadLabMilestoneProps) {
  const [isVisible, setIsVisible] = useState(true)

  if (!milestone || !isVisible) return null

  const config = MILESTONE_CONFIG[milestone]
  if (!config) return null

  const Icon = config.icon

  const handleDismiss = (): void => {
    setIsVisible(false)
    onDismiss()
  }

  return (
    <Alert
      className={cn(
        "border-status-success/50 bg-status-success-light/30",
        "animate-in fade-in slide-in-from-top-2 duration-500"
      )}
    >
      <div className="flex items-start gap-3 w-full col-span-full">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-status-success/10 flex-shrink-0">
          <Icon className="h-4 w-4 text-status-success" />
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-status-success" />
            <span className="text-sm font-semibold text-foreground">{config.title}</span>
            <span className="text-xs text-status-success font-medium bg-status-success-light/50 px-2 py-0.5 rounded-full">
              ~{config.timeSaved} saved
            </span>
          </div>

          <AlertDescription className="text-sm text-muted-foreground leading-relaxed">
            {config.getDescription(subject)}
          </AlertDescription>

          <p className="text-xs text-muted-foreground/80 mt-1">
            {config.valueDetail}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0 h-6 w-6"
          onClick={handleDismiss}
          aria-label="Dismiss milestone"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Alert>
  )
}
