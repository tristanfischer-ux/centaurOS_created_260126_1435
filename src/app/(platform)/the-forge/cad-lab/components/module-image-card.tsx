"use client"

/**
 * @file module-image-card.tsx — Lightweight module card for the Concept stage.
 *
 * @description Shows a module's engineering illustration with name and one-line
 * purpose. Intentionally minimal — detailed specs (key parts, IO, failure modes)
 * are shown in the Build stage. Supports four image states: pending (skeleton),
 * generating (pulsing skeleton), complete (image), and failed (placeholder).
 *
 * Animation is handled by the parent ModuleImageGrid via framer-motion variants,
 * not inside this component — keeping the card pure and letting stagger work correctly.
 *
 * @related
 * - Grid parent: src/app/(platform)/the-forge/cad-lab/components/module-image-grid.tsx
 * - Types: src/lib/cad-lab-types.ts
 * - Build detail: src/app/(platform)/the-forge/cad-lab/build/page.tsx
 */

import { Clock, ImageIcon, Loader2, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Types ────────────────────────────────────────────────────────────

interface ModuleImageCardProps {
  module: CadLabModule
  /** Kept for API compatibility with ModuleImageGrid but unused in simplified card */
  isExpanded?: boolean
  /** Kept for API compatibility with ModuleImageGrid but unused in simplified card */
  onToggleExpand?: () => void
  /** Retry callback for failed image generation */
  onRetry?: () => void
}

// ─── Image Section ────────────────────────────────────────────────────

function ImageSection({ module, onRetry }: { module: CadLabModule; onRetry?: () => void }): React.ReactNode {
  const status = module.imageStatus

  // Pending — modules need full expansion + hero image before per-module illustrations start
  if (!status || status === "pending") {
    return (
      <div className="aspect-[3/2] w-full rounded-t-xl bg-muted/50 flex flex-col items-center justify-center gap-2 px-6">
        <Clock className="h-5 w-5 text-muted-foreground/40" />
        <div className="text-center space-y-0.5">
          <span className="text-xs font-medium text-muted-foreground/60">Illustration queued</span>
          <p className="text-[11px] text-muted-foreground/40 leading-tight">
            Blueprints begin after all modules are expanded and the hero image is created
          </p>
        </div>
      </div>
    )
  }

  // Generating — pulsing skeleton with spinner
  if (status === "generating") {
    return (
      <div className="aspect-[3/2] w-full rounded-t-xl bg-muted/50 animate-pulse flex flex-col items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-international-orange/60" />
        <span className="text-xs text-muted-foreground">Generating illustration…</span>
      </div>
    )
  }

  // Complete — show image
  if (status === "complete" && module.imageUrl) {
    return (
      <div className="aspect-[3/2] w-full rounded-t-xl overflow-hidden bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={module.imageUrl}
          alt={`Engineering blueprint of ${module.name}`}
          className="w-full h-full object-contain transition-transform hover:scale-105"
          loading="lazy"
        />
      </div>
    )
  }

  // Failed — show error when available, fallback to generic message
  return (
    <div className="aspect-[3/2] w-full rounded-t-xl bg-muted/50 flex flex-col items-center justify-center gap-1.5 px-4">
      <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
      <span className="text-xs text-muted-foreground/60 text-center line-clamp-2">
        {module.imageError || "Image unavailable"}
      </span>
      {onRetry && (
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={(e) => { e.stopPropagation(); onRetry(); }}>
          <RefreshCw className="h-3 w-3" /> Retry
        </Button>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────

export function ModuleImageCard({ module, onToggleExpand, onRetry }: ModuleImageCardProps): React.ReactNode {
  return (
    <Card
      className="overflow-hidden border hover:border-international-orange/30 transition-colors cursor-pointer hover:-translate-y-0.5 active:scale-[0.99] duration-200"
      onClick={onToggleExpand}
    >
      {/* Image */}
      <ImageSection module={module} onRetry={onRetry} />

      {/* Content — name + purpose only */}
      <CardContent className="p-4 space-y-1">
        <h3 className="text-sm font-semibold text-foreground leading-tight">
          {module.name}
        </h3>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {module.purpose}
        </p>
      </CardContent>
    </Card>
  )
}
