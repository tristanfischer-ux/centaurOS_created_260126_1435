"use client"

/**
 * @file template-card.tsx — Card for the template picker page.
 *
 * @description Displays an assembly template with name, description,
 * slot count, difficulty badge, and estimated cost range. Clickable
 * to create a new assembly from this template.
 *
 * @component
 * @example
 * <TemplateCard template={quadcopter} onSelect={handleSelect} />
 */

import { memo } from "react"
import {
  Layers,
  ChevronRight,
  Gauge,
  PoundSterling,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import type { AssemblyTemplate } from "@/actions/assembly-builder"

// ─── Difficulty Styles ───────────────────────────────────────────────

const DIFFICULTY_STYLES = {
  beginner: {
    label: "Beginner",
    className: "bg-status-success-light text-status-success-dark",
  },
  intermediate: {
    label: "Intermediate",
    className: "bg-status-warning-light text-status-warning-dark",
  },
  advanced: {
    label: "Advanced",
    className: "bg-status-error-light text-status-error-dark",
  },
} as const

// ─── Category Icons ──────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  drone: "🛸",
  robot: "🤖",
  satellite: "🛰️",
  vehicle: "🚗",
  iot: "📡",
  residential: "🏠",
  farming: "🌱",
}

// ─── Props ───────────────────────────────────────────────────────────

interface TemplateCardProps {
  /** The template data */
  template: AssemblyTemplate
  /** Called when user selects this template */
  onSelect: (template: AssemblyTemplate) => void
  /** Whether this template is loading (being created) */
  isLoading?: boolean
}

// ─── Component ───────────────────────────────────────────────────────

export const TemplateCard = memo(function TemplateCard({
  template,
  onSelect,
  isLoading,
}: TemplateCardProps): React.ReactNode {
  const slots = template.slots ?? []
  const requiredSlots = slots.filter((s) => s.required)
  const difficulty =
    DIFFICULTY_STYLES[template.difficulty as keyof typeof DIFFICULTY_STYLES] ??
    DIFFICULTY_STYLES.beginner
  const emoji = CATEGORY_EMOJI[template.category] ?? "📦"

  // Estimate cost range from default stats
  const stats = template.defaultStats ?? {}
  const minCost = (stats.estimatedMinCost as number) ?? null
  const maxCost = (stats.estimatedMaxCost as number) ?? null

  return (
    <Card
      className={cn(
        "group cursor-pointer transition-all duration-200",
        "hover:shadow-lg hover:-translate-y-0.5 hover:border-international-orange/30",
        "focus-within:ring-2 focus-within:ring-international-orange focus-within:ring-offset-2",
        isLoading && "opacity-60 pointer-events-none",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(template)}
        className="w-full text-left focus:outline-none"
        aria-label={`Create assembly from ${template.name} template`}
        disabled={isLoading}
      >
        <CardContent className="p-5 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl" role="img" aria-hidden>
                {emoji}
              </span>
              <div>
                <h3 className="text-base font-semibold text-foreground group-hover:text-international-orange transition-colors">
                  {template.name}
                </h3>
                <p className="text-xs text-muted-foreground capitalize">
                  {template.category}
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-international-orange transition-colors mt-1" />
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {template.description}
          </p>

          {/* Stats row */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Slot count */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Layers className="h-3 w-3" />
              <span>
                {slots.length} slots ({requiredSlots.length} required)
              </span>
            </div>

            {/* Cost range */}
            {minCost != null && maxCost != null && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <PoundSterling className="h-3 w-3" />
                <span>
                  £{minCost}–£{maxCost}
                </span>
              </div>
            )}

            {/* Difficulty */}
            <Badge className={cn("text-[10px] py-0", difficulty.className)}>
              <Gauge className="h-2.5 w-2.5 mr-0.5" />
              {difficulty.label}
            </Badge>
          </div>
        </CardContent>
      </button>
    </Card>
  )
})
