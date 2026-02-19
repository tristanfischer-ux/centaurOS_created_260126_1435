"use client"

/**
 * @file component-card.tsx — Compact card for the assembly catalog sidebar.
 *
 * @description Displays a single component from the geometry library with
 * name, category, key specs (weight, cost), and a compatibility indicator.
 * Click to assign to the active slot.
 *
 * @component
 * @example
 * <ComponentCard component={motor} isCompatible={true} onSelect={handleSelect} />
 */

import { memo } from "react"
import type { LucideIcon } from "lucide-react"
import {
  Cpu,
  Zap,
  Box,
  CircleDot,
  Wrench,
  Shield,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

import type { CatalogComponent } from "@/actions/assembly-builder"

// ─── Category Icons ──────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  motor: Zap,
  fastener: Wrench,
  bearing: CircleDot,
  connector: Cpu,
  structural: Shield,
  electronics: Cpu,
  sensor: CircleDot,
  default: Box,
}

/**
 * Returns the appropriate icon for a component category.
 *
 * @param category - The component category string
 * @returns A Lucide icon component
 */
function getCategoryIcon(category: string): LucideIcon {
  const lower = category.toLowerCase()
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (lower.includes(key)) return icon
  }
  return CATEGORY_ICONS.default
}

// ─── Tier Colors ─────────────────────────────────────────────────────

const TIER_STYLES = {
  universal: "bg-muted text-muted-foreground",
  electromechanical: "bg-status-info-light text-status-info-dark",
  domain: "bg-status-warning-light text-status-warning-dark",
} as const

// ─── Props ───────────────────────────────────────────────────────────

interface ComponentCardProps {
  /** The component data to display */
  component: CatalogComponent
  /** Whether this component is compatible with the active slot */
  isCompatible?: boolean
  /** Brief reason why incompatible (shown when isCompatible is false) */
  incompatibleReason?: string
  /** Whether this card is currently selected */
  isSelected?: boolean
  /** Called when user clicks the card */
  onSelect?: (component: CatalogComponent) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Extracts estimated cost from procurement data.
 *
 * @param procurement - The procurement JSONB data
 * @returns Formatted cost string or null
 */
function getEstimatedCost(procurement: Record<string, unknown>): string | null {
  const cost = procurement?.typical_cost_gbp as number | undefined
  if (!cost) return null
  return `£${cost.toFixed(2)}`
}

/**
 * Extracts estimated weight from physical properties.
 *
 * @param props - The physical_properties JSONB data
 * @returns Formatted weight string or null
 */
function getEstimatedWeight(props: Record<string, unknown>): string | null {
  const mass = props?.mass as Record<string, unknown> | undefined
  const value = mass?.typical_g as number | undefined
  if (!value) return null
  if (value >= 1000) return `${(value / 1000).toFixed(1)}kg`
  return `${Math.round(value)}g`
}

// ─── Component ───────────────────────────────────────────────────────

export const ComponentCard = memo(function ComponentCard({
  component,
  isCompatible,
  incompatibleReason,
  isSelected,
  onSelect,
}: ComponentCardProps): React.ReactNode {
  const Icon = getCategoryIcon(component.category)
  const cost = getEstimatedCost(component.procurement)
  const weight = getEstimatedWeight(component.physicalProperties)
  const tierStyle =
    TIER_STYLES[component.tier as keyof typeof TIER_STYLES] ?? TIER_STYLES.universal

  return (
    <button
      type="button"
      onClick={() => onSelect?.(component)}
      className={cn(
        "w-full text-left rounded-lg border p-3 transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5",
        "focus:outline-none focus:ring-2 focus:ring-international-orange focus:ring-offset-2",
        isSelected && "ring-2 ring-international-orange border-international-orange bg-international-orange-light/20",
        !isSelected && isCompatible === true && "border-status-success/40 hover:border-status-success",
        !isSelected && isCompatible === false && "opacity-50 border-muted",
        !isSelected && isCompatible === undefined && "border hover:border-foreground/20",
      )}
      aria-label={`Select ${component.name}`}
    >
      {/* Header row */}
      <div className="flex items-start gap-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${component.defaultColour}20` }}
        >
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            {component.name}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {component.category}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {weight && (
          <span className="text-[11px] text-muted-foreground font-mono">
            {weight}
          </span>
        )}
        {cost && (
          <span className="text-[11px] text-muted-foreground font-mono">
            {cost}
          </span>
        )}
        <Badge
          className={cn("text-[10px] px-1.5 py-0", tierStyle)}
          variant="secondary"
        >
          {component.tier === "universal"
            ? "T1"
            : component.tier === "electromechanical"
              ? "T2"
              : "T3"}
        </Badge>

        {isCompatible === true && (
          <Badge variant="success" className="text-[10px] px-1.5 py-0">
            Compatible
          </Badge>
        )}
        {isCompatible === false && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 opacity-60">
            Incompatible
          </Badge>
        )}
      </div>

      {/* Incompatibility reason */}
      {isCompatible === false && incompatibleReason && (
        <p className="text-[10px] text-muted-foreground mt-1 opacity-70">
          {incompatibleReason}
        </p>
      )}
    </button>
  )
})
