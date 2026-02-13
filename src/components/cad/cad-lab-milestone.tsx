"use client"

/**
 * @file cad-lab-milestone.tsx — Celebration banners for CAD Lab milestones.
 *
 * @description Shows a brief, dismissible celebration when major milestones
 * are reached: research complete, decomposition done, full generation done.
 * Includes estimated time/money saved to reinforce value.
 *
 * @component
 */

import { useState, useEffect } from "react"
import { X, Clock, DollarSign, Sparkles, CheckCircle2, Boxes, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"

type MilestoneType = "research" | "decompose" | "generate"

interface CadLabMilestoneProps {
  /** Which milestone was just completed */
  type: MilestoneType
  /** Number of modules (used for decompose/generate messages) */
  moduleCount?: number
  /** Callback when banner is dismissed */
  onDismiss: () => void
}

const MILESTONE_CONFIG: Record<MilestoneType, {
  icon: typeof CheckCircle2
  title: string
  timeSaved: string
  costSaved: string
  description: (moduleCount?: number) => string
}> = {
  research: {
    icon: Sparkles,
    title: "Research Complete",
    timeSaved: "~8 hours",
    costSaved: "$1,200-2,400",
    description: () => "AI analysed market data, dimensional specs, material options, and existing designs. Manual equivalent: a full day of engineering research.",
  },
  decompose: {
    icon: Boxes,
    title: "Product Decomposed",
    timeSaved: "~2 days",
    costSaved: "$2,400-4,800",
    description: (n) => `Broke your product into ${n ?? "multiple"} manufacturable sub-assemblies with dependencies, lead times, and risk analysis. This is typically a multi-day systems engineering exercise.`,
  },
  generate: {
    icon: Zap,
    title: "Manufacturing-Ready",
    timeSaved: "2-4 weeks",
    costSaved: "$5,000-15,000",
    description: (n) => `Generated parametric CAD for ${n ?? "all"} modules with 3D models, DFM analysis, cost estimates, supplier specs, and contract templates. You just compressed weeks of engineering into minutes.`,
  },
}

/**
 * CadLabMilestone — Celebration banner showing time and money saved.
 *
 * @description Appears briefly after major milestones to reinforce the
 * value proposition. Auto-dismisses after 12 seconds or on user click.
 */
export function CadLabMilestone({ type, moduleCount, onDismiss }: CadLabMilestoneProps) {
  const [isVisible, setIsVisible] = useState(false)
  const config = MILESTONE_CONFIG[type]
  const Icon = config.icon

  // Animate in, auto-dismiss after 12s
  useEffect(() => {
    const showTimer = setTimeout(() => setIsVisible(true), 100)
    const hideTimer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onDismiss, 300)
    }, 12000)
    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [onDismiss])

  const handleDismiss = () => {
    setIsVisible(false)
    setTimeout(onDismiss, 300)
  }

  return (
    <div
      className={`transition-all duration-300 ease-out overflow-hidden ${
        isVisible ? "opacity-100 max-h-[200px]" : "opacity-0 max-h-0"
      }`}
    >
      <div className="relative rounded-lg border border-international-orange/30 bg-gradient-to-r from-international-orange-light/30 via-background to-international-orange-light/10 p-4">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={handleDismiss}
          aria-label="Dismiss milestone"
        >
          <X className="h-3.5 w-3.5" />
        </Button>

        <div className="flex items-start gap-3 pr-8">
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-international-orange/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-international-orange" />
          </div>
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{config.title}</h3>
              <CheckCircle2 className="h-4 w-4 text-status-success" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {config.description(moduleCount)}
            </p>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1 font-medium text-international-orange">
                <Clock className="h-3 w-3" />
                {config.timeSaved} saved
              </span>
              <span className="flex items-center gap-1 font-medium text-status-success">
                <DollarSign className="h-3 w-3" />
                {config.costSaved} in engineering costs
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
