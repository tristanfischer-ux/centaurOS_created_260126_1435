"use client"

/**
 * Toggle button to expand or collapse the advisor panel between
 * sidebar width and full-width (chat + workspace) view.
 */

import { Button } from "@/components/ui/button"
import { Maximize2, Minimize2 } from "lucide-react"
import { useAdvisorPanel } from "@/contexts/advisor-panel-context"
import { cn } from "@/lib/utils"

interface PanelExpandToggleProps {
  className?: string
  size?: "icon" | "default" | "sm" | "lg"
  variant?: "ghost" | "outline" | "secondary"
}

export function PanelExpandToggle({
  className,
  size = "icon",
  variant = "ghost",
}: PanelExpandToggleProps): React.ReactElement {
  const { panelViewMode, expandPanel, collapsePanel } = useAdvisorPanel()
  const isExpanded = panelViewMode === "expanded"

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("text-muted-foreground hover:text-foreground", className)}
      onClick={() => (isExpanded ? collapsePanel() : expandPanel())}
      aria-label={isExpanded ? "Collapse panel to sidebar" : "Expand panel to full width"}
    >
      {isExpanded ? (
        <Minimize2 className="h-4 w-4" />
      ) : (
        <Maximize2 className="h-4 w-4" />
      )}
    </Button>
  )
}
