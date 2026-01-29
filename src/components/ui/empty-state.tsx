import * as React from "react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  /** Set to true for dynamically appearing empty states to announce to screen readers */
  live?: boolean
}

export function EmptyState({ icon, title, description, action, className, live = false }: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-live={live ? "polite" : undefined}
      aria-atomic={live ? "true" : undefined}
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        "animate-in fade-in-50 duration-500",
        className
      )}
    >
      {icon && (
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4 text-muted-foreground" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-6">{description}</p>
      )}
      {action && (
        <div className="mt-2">
          {action}
        </div>
      )}
    </div>
  )
}
