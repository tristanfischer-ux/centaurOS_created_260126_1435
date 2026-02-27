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

import { useState } from "react"
import { ImageIcon, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Types ────────────────────────────────────────────────────────────

interface ModuleImageCardProps {
  module: CadLabModule
  /** Kept for API compatibility with ModuleImageGrid but unused in simplified card */
  isExpanded?: boolean
  /** Kept for API compatibility with ModuleImageGrid but unused in simplified card */
  onToggleExpand?: () => void
}

// ─── Image Section ────────────────────────────────────────────────────

function ImageSection({ module }: { module: CadLabModule }): React.ReactNode {
  const status = module.imageStatus

  // Pending — static skeleton
  if (!status || status === "pending") {
    return (
      <div className="aspect-[3/2] w-full rounded-t-xl bg-muted animate-pulse flex items-center justify-center">
        <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
      </div>
    )
  }

  // Generating — pulsing skeleton with spinner
  if (status === "generating") {
    return (
      <div className="aspect-[3/2] w-full rounded-t-xl bg-muted animate-pulse flex flex-col items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-international-orange/60" />
        <span className="text-xs text-muted-foreground">Generating...</span>
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
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────

export function ModuleImageCard({ module, onToggleExpand }: ModuleImageCardProps): React.ReactNode {
  const [imgError, setImgError] = useState(false)

  return (
    <Card
      className="overflow-hidden border hover:border-international-orange/30 transition-colors cursor-pointer hover:-translate-y-0.5 active:scale-[0.99] duration-200"
      onClick={onToggleExpand}
    >
      {/* Image */}
      {!imgError ? (
        <ImageSection module={module} />
      ) : (
        <div className="aspect-[3/2] w-full rounded-t-xl bg-muted/50 flex flex-col items-center justify-center gap-1.5">
          <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
          <span className="text-xs text-muted-foreground/60">Image unavailable</span>
        </div>
      )}

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
