"use client"

/**
 * @file design-revision-banner.tsx — Design version banner for post-review workflow.
 *
 * @description Shows project-level design version status at the top of the
 * Specialist Review tab. Three states: stale (drawings outdated), regenerating,
 * and current (all drawings up to date).
 */

import { Loader2, RefreshCw, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface DesignRevisionBannerProps {
  designRevision: number
  imagesStale: boolean
  revisedModuleCount: number
  isRegenerating: boolean
  progressLines: string[]
  onRegenerate: () => void
}

export function DesignRevisionBanner({
  designRevision,
  imagesStale,
  revisedModuleCount,
  isRegenerating,
  progressLines,
  onRegenerate,
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

  // Stale state — drawings don't match current specs
  if (imagesStale) {
    return (
      <div className={cn(
        "rounded-lg border-l-4 border-warning bg-warning/5 px-4 py-3",
      )}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              Design v{designRevision} — {revisedModuleCount} module{revisedModuleCount !== 1 ? "s" : ""} revised from specialist review
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Drawings are based on v{designRevision - 1} specs.
            </p>
          </div>
          <Button onClick={onRegenerate} size="sm" className="gap-1.5 flex-shrink-0">
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate Drawings
          </Button>
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
