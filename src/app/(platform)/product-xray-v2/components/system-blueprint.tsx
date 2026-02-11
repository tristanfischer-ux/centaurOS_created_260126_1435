/**
 * @file system-blueprint.tsx — Full-width system diagram hero
 *
 * @description Displays the Gemini-generated system P&ID diagram as
 * the visual centrepiece of the dossier. Includes click-to-enlarge
 * lightbox, generating skeleton, and "Generate AI Blueprints" CTA.
 */

"use client"

import React, { useState } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { ImageIcon, Loader2, X, Sparkles } from "lucide-react"

// ─── Props ───────────────────────────────────────────────────────────

interface SystemBlueprintProps {
  /** URL of the system-level diagram */
  systemImageUrl?: string
  /** Generation status */
  systemImageStatus?: string
  /** Whether images are currently being generated */
  isGeneratingImages: boolean
  /** Whether any module images have been generated */
  hasImages: boolean
  /** Called to trigger image generation */
  onGenerateImages: () => void
  /** Whether a scanId exists (needed to generate) */
  canGenerate: boolean
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * SystemBlueprint — Hero image section.
 *
 * @description Full-width display of the AI-generated system diagram.
 * This is the first visual a user sees after scanning, transforming
 * the page from data into something that feels like engineering.
 */
export function SystemBlueprint({
  systemImageUrl,
  systemImageStatus,
  isGeneratingImages,
  hasImages,
  onGenerateImages,
  canGenerate,
}: SystemBlueprintProps): React.ReactNode {
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const hasSystemImage = systemImageUrl && systemImageStatus === "complete"
  const isGenerating = isGeneratingImages || systemImageStatus === "generating"

  // If no images at all and not generating, show the CTA
  if (!hasSystemImage && !isGenerating && !hasImages) {
    return (
      <Card className="rounded-xl shadow-sm border border-dashed border-muted-foreground/20">
        <CardContent className="py-12 flex flex-col items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-international-orange/10 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-international-orange" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-lg font-display font-semibold text-foreground">
              Generate AI Blueprints
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Create technical illustrations for each module and a system-level process flow diagram using AI.
            </p>
          </div>
          <Button
            onClick={onGenerateImages}
            disabled={!canGenerate}
            className="bg-international-orange hover:bg-international-orange-hover text-white"
          >
            <ImageIcon className="h-4 w-4 mr-2" />
            Generate blueprints
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Generating state
  if (isGenerating && !hasSystemImage) {
    return (
      <Card className="rounded-xl shadow-sm">
        <CardContent className="pt-6 pb-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 bg-international-orange rounded-full" />
            <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">
              System Blueprint
            </h3>
          </div>
          <div className="relative rounded-xl overflow-hidden">
            <Skeleton className="h-[400px] w-full" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-3 bg-background/90 rounded-full px-5 py-2.5 shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
                <span className="text-sm font-medium text-foreground">Generating system blueprint...</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Image available
  if (hasSystemImage) {
    return (
      <>
        <Card className="rounded-xl shadow-sm">
          <CardContent className="pt-6 pb-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1 h-7 bg-international-orange rounded-full" />
                <div>
                  <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">
                    System Blueprint
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    AI-generated system-level process flow diagram
                  </p>
                </div>
              </div>
              {isGenerating && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Generating module images...
                </div>
              )}
            </div>

            <button
              onClick={() => setLightboxOpen(true)}
              className="w-full cursor-zoom-in rounded-xl overflow-hidden border bg-muted/5 p-6 hover:shadow-md transition-shadow"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={systemImageUrl}
                alt="System-level process flow diagram"
                className="w-full h-auto object-contain max-h-[600px]"
              />
            </button>
            <p className="text-xs text-muted-foreground text-center font-medium">
              System-Level Process Flow Diagram — Click to enlarge
            </p>
          </CardContent>
        </Card>

        {/* Lightbox */}
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent size="xl" className="max-w-[95vw] max-h-[95vh] p-0">
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3 z-10 bg-background/90 hover:bg-background shadow-sm"
                onClick={() => setLightboxOpen(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
              <div className="overflow-auto max-h-[95vh] p-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={systemImageUrl}
                  alt="System-level process flow diagram"
                  className="w-full h-auto"
                />
              </div>
            </div>
            <DialogTitle className="sr-only">System Blueprint</DialogTitle>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // Fallback: images exist on modules but not system image
  return null
}
