"use client"

/**
 * @file slot-popover.tsx — Detail popover for a selected assembly slot.
 *
 * @description Shows slot info (name, group, requirements, constraints),
 * the currently assigned component (if any), and actions to change/remove.
 * Appears when a slot is clicked on the schematic.
 *
 * @component
 * @example
 * <SlotPopover
 *   slot={activeSlot}
 *   placedComponent={placed}
 *   component={comp}
 *   onBrowse={handleBrowse}
 *   onRemove={handleRemove}
 *   onClose={handleClose}
 * />
 */

import {
  Crosshair,
  Package,
  PackageCheck,
  Trash2,
  ArrowRight,
  Weight,
  PoundSterling,
  Shield,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

import type {
  TemplateSlot,
  PlacedComponent,
  CatalogComponent,
} from "@/actions/assembly-builder"

// ─── Props ───────────────────────────────────────────────────────────

interface SlotPopoverProps {
  /** The slot definition */
  slot: TemplateSlot
  /** The placed component in this slot (if any) */
  placedComponent?: PlacedComponent | null
  /** Full component data for the placed component */
  component?: CatalogComponent | null
  /** Called to browse compatible components for this slot */
  onBrowse: () => void
  /** Called to remove the current component */
  onRemove: () => void
  /** Called to close the popover */
  onClose: () => void
  /** Optional className */
  className?: string
}

// ─── Component ───────────────────────────────────────────────────────

export function SlotPopover({
  slot,
  placedComponent,
  component,
  onBrowse,
  onRemove,
  onClose,
  className,
}: SlotPopoverProps): React.ReactNode {
  const isFilled = !!placedComponent
  const cost = component
    ? (component.procurement?.typical_cost_gbp as number)
    : null
  const mass = component
    ? ((component.physicalProperties?.mass as Record<string, unknown>)
        ?.typical_g as number)
    : null

  return (
    <Card className={cn("w-72 shadow-lg border", className)}>
      <CardContent className="p-4 space-y-3">
        {/* Slot Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Crosshair className="h-3.5 w-3.5 text-international-orange" />
              <h4 className="text-sm font-semibold text-foreground">
                {slot.label}
              </h4>
            </div>
            <p className="text-[11px] text-muted-foreground capitalize">
              {slot.group} · {slot.required ? "Required" : "Optional"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-0.5"
            aria-label="Close slot detail"
          >
            ×
          </button>
        </div>

        {/* Requirements */}
        <div className="flex flex-wrap gap-1">
          {slot.compatibleCategories.map((cat) => (
            <Badge key={cat} variant="secondary" className="text-[10px] py-0">
              {cat}
            </Badge>
          ))}
          {slot.mountingStandard && (
            <Badge variant="info" className="text-[10px] py-0">
              <Shield className="h-2.5 w-2.5 mr-0.5" />
              {slot.mountingStandard}
            </Badge>
          )}
        </div>

        {/* Constraints */}
        {Object.keys(slot.constraints).length > 0 && (
          <div className="text-[11px] text-muted-foreground space-y-0.5">
            {slot.constraints.max_weight_g != null && (
              <p>Max weight: {String(slot.constraints.max_weight_g)}g</p>
            )}
            {slot.constraints.min_kv != null && (
              <p>
                KV range: {String(slot.constraints.min_kv)} –{" "}
                {String(slot.constraints.max_kv)}
              </p>
            )}
          </div>
        )}

        {/* Assigned Component */}
        {isFilled && component ? (
          <div className="rounded-lg bg-muted/50 p-2.5 space-y-1.5">
            {/* Catalog indicator */}
            {placedComponent?.geometryTypeSlug && (
              <div className="flex items-center gap-1 text-[10px] text-status-success font-medium">
                <PackageCheck className="h-3 w-3" />
                Catalog Part
              </div>
            )}

            <div className="flex items-center gap-2">
              <div
                className="h-6 w-6 rounded-md flex items-center justify-center"
                style={{ backgroundColor: `${component.defaultColour}20` }}
              >
                <Package
                  className="h-3 w-3"
                  style={{ color: component.defaultColour }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">
                  {component.name}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {component.category}
                </p>
              </div>
            </div>

            {/* Component description (first ~100 chars) */}
            {component.description && (
              <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">
                {component.description}
              </p>
            )}

            {/* Component specs */}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              {mass != null && mass > 0 && (
                <span className="flex items-center gap-0.5 font-mono">
                  <Weight className="h-2.5 w-2.5" />
                  {mass >= 1000
                    ? `${(mass / 1000).toFixed(1)}kg`
                    : `${Math.round(mass)}g`}
                </span>
              )}
              {cost != null && cost > 0 && (
                <span className="flex items-center gap-0.5 font-mono">
                  <PoundSterling className="h-2.5 w-2.5" />£{cost.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3 text-center">
            <p className="text-xs text-muted-foreground">No component assigned</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={onBrowse}
            className="flex-1 h-8 text-xs"
          >
            {isFilled ? "Change" : "Browse Compatible"}
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
          {isFilled && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemove}
              className="h-8 text-xs text-destructive hover:text-destructive"
              aria-label="Remove component from slot"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
