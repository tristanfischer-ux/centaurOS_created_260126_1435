"use client"

/**
 * @file design-revision-banner.tsx — Design version banner for post-review workflow.
 *
 * @description Shows project-level design version status at the top of the
 * Specialist Review tab. Three states: stale (drawings outdated), regenerating,
 * and current (all drawings up to date).
 */

import { Loader2, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface DesignRevisionBannerProps {
  designRevision: number
  imagesStale: boolean
  revisedModuleCount: number
  isRegenerating: boolean
  progressLines: string[]
}

export function DesignRevisionBanner({
  designRevision,
  imagesStale,
  revisedModuleCount,
  isRegenerating,
  progressLines,
}: DesignRevisionBannerProps) {
  if (designRevision < 2) return null

  // Regenerating state
  if (isRegenerating) {
    const lastLine = progressLines[progressLines.length - 1] ?? "Starting..."
    return (
      <div className={cn(
        "rounded-lg border-l-4 border-warning bg-warning/5 px-4 py-3",
      )}>
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-warning flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              Regenerating drawings for Design v{designRevision}...
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {lastLine}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Stale state — drawings don't match current specs, auto-regen about to start
  if (imagesStale) {
    return (
      <div className={cn(
        "rounded-lg border-l-4 border-warning bg-warning/5 px-4 py-3",
      )}>
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-warning flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              Design v{designRevision} — preparing to regenerate drawings for {revisedModuleCount} revised module{revisedModuleCount !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Drawings will update automatically.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Current state — all drawings match
  return (
    <div className={cn(
      "rounded-lg border-l-4 border-success bg-success/5 px-4 py-3",
    )}>
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
        <p className="text-sm font-medium text-foreground">
          Design v{designRevision} — All drawings up to date.
        </p>
      </div>
    </div>
  )
}
