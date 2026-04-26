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
        // overflow-y-auto only on md+ — on mobile, body/window is the scroll
        // container so iOS Safari URL-bar collapse works and window.scrollTo fires.
        "flex-1 min-w-0 md:overflow-y-auto bg-background",
        className,
      )}
      data-tour-scroll
    >
      {children}
    </ZoomableContent>
  )
}
