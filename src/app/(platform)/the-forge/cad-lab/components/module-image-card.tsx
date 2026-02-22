"use client"

/**
 * @file module-image-card.tsx — Module card with Gemini-generated blueprint illustration.
 *
 * @description Shows a module's engineering illustration with key metadata.
 * Supports four image states: pending (skeleton), generating (pulsing skeleton),
 * complete (image), and failed (placeholder). Click to expand for full detail
 * (description, inputs/outputs, failure modes, unknowns).
 *
 * Animation is handled by the parent ModuleImageGrid via framer-motion variants,
 * not inside this component — keeping the card pure and letting stagger work correctly.
 *
 * @related
 * - Grid parent: src/app/(platform)/the-forge/cad-lab/components/module-image-grid.tsx
 * - Types: src/lib/cad-lab-types.ts
 */

import { useState } from "react"
import {
  ChevronDown,
  Clock,
  ImageIcon,
  Loader2,
  AlertTriangle,
  HelpCircle,
  ArrowRight,
  ArrowLeft,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Types ────────────────────────────────────────────────────────────

interface ModuleImageCardProps {
  module: CadLabModule
  isExpanded: boolean
  onToggleExpand: () => void
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
          className="w-full h-full object-cover transition-transform hover:scale-105"
          loading="lazy"
        />
      </div>
    )
  }

  // Failed — placeholder
  return (
    <div className="aspect-[3/2] w-full rounded-t-xl bg-muted/50 flex flex-col items-center justify-center gap-1.5">
      <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
      <span className="text-xs text-muted-foreground/60">Image unavailable</span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────

export function ModuleImageCard({ module, isExpanded, onToggleExpand }: ModuleImageCardProps): React.ReactNode {
  const [imgError, setImgError] = useState(false)

  return (
    <Card className="overflow-hidden border hover:border-international-orange/30 transition-colors">
      {/* Image */}
      {!imgError ? (
        <ImageSection module={module} />
      ) : (
        <div className="aspect-[3/2] w-full rounded-t-xl bg-muted/50 flex flex-col items-center justify-center gap-1.5">
          <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
          <span className="text-xs text-muted-foreground/60">Image unavailable</span>
        </div>
      )}

      {/* Content */}
      <CardContent className="p-4 space-y-2.5">
        {/* Name + purpose */}
        <div>
          <h3 className="text-sm font-semibold text-foreground leading-tight">
            {module.name}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {module.purpose}
          </p>
        </div>

        {/* Key parts + lead time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1 min-w-0 flex-1">
            {module.keyParts.slice(0, 3).map((part) => (
              <Badge key={part} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal truncate max-w-[120px]">
                {part}
              </Badge>
            ))}
            {module.keyParts.length > 3 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                +{module.keyParts.length - 3}
              </Badge>
            )}
          </div>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 gap-1">
            <Clock className="h-2.5 w-2.5" />
            {module.leadWeeks}w
          </Badge>
        </div>

        {/* Expand toggle */}
        <button
          onClick={onToggleExpand}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full pt-1"
        >
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              isExpanded && "rotate-180",
            )}
          />
          {isExpanded ? "Less detail" : "More detail"}
        </button>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="space-y-3 pt-2 border-t border-muted animate-in fade-in slide-in-from-top-1 duration-200">
            {/* Description */}
            {module.description && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                <p className="text-xs text-foreground leading-relaxed">{module.description}</p>
              </div>
            )}

            {/* Inputs / Outputs */}
            {(module.inputs.length > 0 || module.outputs.length > 0) && (
              <div className="flex gap-4">
                {module.inputs.length > 0 && (
                  <div className="flex-1">
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" /> Inputs
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {module.inputs.map((input) => (
                        <Badge key={input} variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                          {input}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {module.outputs.length > 0 && (
                  <div className="flex-1">
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <ArrowLeft className="h-3 w-3" /> Outputs
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {module.outputs.map((output) => (
                        <Badge key={output} variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                          {output}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Failure modes */}
            {module.failureModes.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-status-warning" /> Failure Modes
                </p>
                <ul className="space-y-0.5">
                  {module.failureModes.map((mode) => (
                    <li key={mode} className="text-xs text-foreground flex items-start gap-1.5">
                      <span className="text-status-warning mt-1">•</span>
                      {mode}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Unknowns */}
            {module.unknowns.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <HelpCircle className="h-3 w-3 text-electric-blue" /> Open Questions
                </p>
                <ul className="space-y-0.5">
                  {module.unknowns.map((unknown) => (
                    <li key={unknown} className="text-xs text-foreground flex items-start gap-1.5">
                      <span className="text-electric-blue mt-1">•</span>
                      {unknown}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
