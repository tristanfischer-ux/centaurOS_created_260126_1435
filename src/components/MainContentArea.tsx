"use client"

/**
 * Wraps the main platform content (ZoomableContent) and collapses it
 * when the advisor panel is expanded so the panel can take full width.
 */

import { useAdvisorPanel } from "@/contexts/advisor-panel-context"
import { ZoomableContent } from "@/components/ZoomProvider"
import { cn } from "@/lib/utils"

interface MainContentAreaProps {
  children: React.ReactNode
  className?: string
}

export function MainContentArea({ children, className }: MainContentAreaProps): React.ReactElement {
  const { panelViewMode } = useAdvisorPanel()
  const isExpanded = panelViewMode === "expanded"

  return (
    <ZoomableContent
      className={cn(
        "overflow-y-auto bg-background transition-[width] duration-200 ease-out",
        isExpanded ? "w-0 min-w-0 overflow-hidden" : "flex-1 min-w-0",
        className,
      )}
    >
      {children}
    </ZoomableContent>
  )
}
