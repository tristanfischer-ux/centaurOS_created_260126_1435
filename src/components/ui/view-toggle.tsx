import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * ViewToggle - Standardized segmented-control for switching between views.
 *
 * @description Renders a group of toggle buttons (icon-only or icon+label)
 * inside a pill-shaped container. Used app-wide for view mode switching
 * (grid / list / orbit / timeline, etc.).
 *
 * @example
 * // Icon-only
 * <ViewToggle
 *   options={[
 *     { value: 'cards', icon: LayoutGrid, ariaLabel: 'Cards view' },
 *     { value: 'list', icon: List, ariaLabel: 'List view' },
 *   ]}
 *   value={viewMode}
 *   onValueChange={setViewMode}
 * />
 *
 * @example
 * // Mixed icon-only and icon+label
 * <ViewToggle
 *   options={[
 *     { value: 'orbit', label: 'Orbit', icon: Orbit, ariaLabel: 'Orbit view' },
 *     { value: 'cards', icon: LayoutGrid, ariaLabel: 'Cards view' },
 *     { value: 'list', icon: List, ariaLabel: 'List view' },
 *   ]}
 *   value={viewMode}
 *   onValueChange={setViewMode}
 * />
 */

export interface ViewToggleOption {
  /** Unique value for this option */
  value: string
  /** Optional text label — if omitted, renders an icon-only button */
  label?: string
  /** Lucide icon component (required unless label is provided) */
  icon?: React.ComponentType<{ className?: string }>
  /** Accessible name (required for icon-only options) */
  ariaLabel: string
}

export interface ViewToggleProps {
  /** Available toggle options */
  options: ViewToggleOption[]
  /** Currently selected value */
  value: string
  /** Called when user selects a different option */
  onValueChange: (value: string) => void
  /** Additional class names for the outer container */
  className?: string
}

/**
 * Standardized view-toggle segmented control.
 *
 * Container: bg-muted/50, p-1, rounded-xl, border border-muted
 * Icon-only button: h-8 w-8, icon h-4 w-4
 * Text+icon button: h-8 px-3, icon h-3.5 w-3.5
 * Active: bg-international-orange/10 text-international-orange shadow-sm
 * Inactive: text-muted-foreground hover:text-foreground hover:bg-muted
 */
export function ViewToggle({
  options,
  value,
  onValueChange,
  className,
}: ViewToggleProps): React.ReactElement {
  return (
    <div
      role="radiogroup"
      className={cn(
        "flex items-center bg-muted/50 p-1 rounded-xl border border-muted",
        className,
      )}
    >
      {options.map((option) => {
        const Icon = option.icon
        const isActive = option.value === value
        const hasLabel = Boolean(option.label)
        const hasIcon = Boolean(Icon)

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={option.ariaLabel}
            onClick={() => onValueChange(option.value)}
            className={cn(
              // Shared styles
              "inline-flex items-center justify-center rounded-lg transition-all duration-200 font-medium",
              // Size — icon-only vs text+icon vs text-only
              hasLabel
                ? "h-8 min-h-[44px] px-3 text-xs gap-1.5"
                : "h-8 w-8 min-h-[44px] min-w-[44px] p-0",
              // Active / inactive
              isActive
                ? "bg-international-orange/10 text-international-orange shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {Icon && <Icon className={cn(hasLabel ? "h-3.5 w-3.5" : "h-4 w-4")} />}
            {hasLabel && option.label}
          </button>
        )
      })}
    </div>
  )
}
