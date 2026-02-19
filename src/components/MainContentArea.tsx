"use client"

/**
 * Wraps the main platform content (ZoomableContent).
 */

import { ZoomableContent } from "@/components/ZoomProvider"
import { cn } from "@/lib/utils"

interface MainContentAreaProps {
  children: React.ReactNode
  className?: string
}

export function MainContentArea({ children, className }: MainContentAreaProps): React.ReactElement {
  return (
    <ZoomableContent
      className={cn(
        "flex-1 min-w-0 overflow-y-auto bg-background",
        className,
      )}
    >
      {children}
    </ZoomableContent>
  )
}
