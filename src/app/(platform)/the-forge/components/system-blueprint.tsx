/**
 * @file system-blueprint.tsx — System diagram hero + module status grid
 *
 * @description Displays the AI-generated system process flow diagram as
 * the visual centrepiece of the dossier, with an interactive Module Status
 * Grid below for navigation and progress tracking.
 *
 * The Module Status Grid replaces the former Architecture Map. It shows
 * per-module status, lead time, and progress in a flat grid layout that
 * does NOT imply sequential ordering (modules are developed in parallel).
 *
 * @related
 * - Schema: ../services/xray-schema.ts (XRaySpec, ModuleSpec)
 */

"use client"

import React, { useState } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  ImageIcon,
  Loader2,
  Sparkles,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

import type { XRaySpec, ModuleSpec } from "../services/xray-schema"

// ─── Status Helpers ───────────────────────────────────────────────────

/**
 * Calculates interview readiness percentage for a module.
 *
 * @param m - The module to check
 * @returns Percentage of expert questions answered (0–100)
 */
function readinessFor(m: ModuleSpec): number {
  const a = m.interview?.answers || {}
  const answered = Object.keys(a).filter((k) => String(a[k] || "").trim()).length
  const total = m.detail.expertQuestions.length
  return total === 0 ? 0 : Math.round((answered / total) * 100)
}

/**
 * Derives the display status for a module based on its diagnostic
 * and interview completeness.
 *
 * @param m - The module to evaluate
 * @param diagComplete - Whether the gating diagnostic has been completed
 * @returns A status string used for visual indicators
 */
function getNodeStatus(
  m: ModuleSpec,
  diagComplete: boolean,
): "complete" | "needs-diagnostic" | "partial" | "not-started" {
  const isGating = m.isGatingModule || m.id === "react"
  if (isGating && !diagComplete) return "needs-diagnostic"
  const pct = readinessFor(m)
  if (pct === 100) return "complete"
  if (pct > 0) return "partial"
  return "not-started"
}

/**
 * Returns the dot color for a given module status.
 *
 * @param status - The module status
 * @returns A hex color string
 */
function statusDotColor(status: string): string {
  switch (status) {
    case "complete": return "#10b981"
    case "needs-diagnostic": return "#f59e0b"
    case "partial": return "#3b82f6"
    default: return "#94a3b8"
  }
}

/**
 * Checks whether the gating module's diagnostic has been completed.
 *
 * @param spec - The full X-Ray spec
 * @returns True if the gating diagnostic is complete
 */
function isGatingDiagComplete(spec: XRaySpec): boolean {
  const gating = spec.modules.find((m) => m.isGatingModule) ?? spec.modules.find((m) => m.id === "react")
  if (!gating) return true
  return !!gating.diagnostic?.derivedProcessClass
}

// ─── Props ────────────────────────────────────────────────────────────

interface SystemBlueprintProps {
  /** The full X-Ray spec (needed for module status grid) */
  spec: XRaySpec
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

// ─── Component ────────────────────────────────────────────────────────

/**
 * SystemBlueprint — Hero image section with module status grid.
 *
 * @description Full-width display of the system diagram followed by
 * an interactive Module Status Grid for navigating to module details
 * and tracking progress. The grid layout correctly represents that
 * modules are developed in parallel (no sequential arrows).
 */
export function SystemBlueprint({
  spec,
  systemImageUrl,
  systemImageStatus,
  isGeneratingImages,
  hasImages,
  onGenerateImages,
  canGenerate,
}: SystemBlueprintProps): React.ReactNode {
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const modules = spec.modules || []
  const n = modules.length
  const hasSystemImage = systemImageUrl && systemImageStatus === "complete"
  const isGenerating = isGeneratingImages || systemImageStatus === "generating"
  const diagComplete = isGatingDiagComplete(spec)

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
              Generate Blueprints
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Create technical illustrations for each module and a system-level process flow diagram.
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

  return (
    <>
      <Card className="rounded-xl shadow-sm">
        <CardContent className="pt-6 pb-6 space-y-6">
          {/* Header */}
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
            <div className="flex items-center gap-3">
              {isGenerating && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Generating images...
                </div>
              )}
              {n > 0 && (
                <Badge variant="secondary" className="text-xs">
                  <Box className="h-3 w-3 mr-1" />
                  {n} modules
                </Badge>
              )}
            </div>
          </div>

          {/* System diagram image OR generating skeleton */}
          {hasSystemImage ? (
            <>
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
            </>
          ) : isGenerating ? (
            <div className="relative rounded-xl overflow-hidden">
              <Skeleton className="h-[400px] w-full" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-3 bg-background/90 rounded-full px-5 py-2.5 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
                  <span className="text-sm font-medium text-foreground">Generating system blueprint...</span>
                </div>
              </div>
            </div>
          ) : null}

          {/* Module Status Grid */}
          {n > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {modules.map((m) => {
                  const status = getNodeStatus(m, diagComplete)
                  const progress = readinessFor(m)
                  const isGating = m.isGatingModule || m.id === "react"
                  const dotColor = statusDotColor(status)

                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        document.getElementById(`module-v2-${m.id}`)?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        })
                      }
                      className={cn(
                        "flex flex-col gap-2 rounded-lg border p-3 text-left",
                        "transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
                        "bg-background cursor-pointer",
                      )}
                    >
                      {/* Module name + status dot */}
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: dotColor }}
                        />
                        <span className="text-sm font-medium text-foreground line-clamp-1 flex-1">
                          {m.name}
                        </span>
                        {isGating && (
                          <span className={cn(
                            "inline-flex items-center gap-0.5 text-[10px] font-medium rounded-full px-1.5 py-0.5 shrink-0",
                            status === "needs-diagnostic"
                              ? "text-status-warning-dark bg-status-warning-light"
                              : "text-status-success-dark bg-status-success-light",
                          )}>
                            {status === "needs-diagnostic" ? (
                              <AlertTriangle className="h-2.5 w-2.5" />
                            ) : (
                              <CheckCircle2 className="h-2.5 w-2.5" />
                            )}
                            Gating
                          </span>
                        )}
                      </div>

                      {/* Purpose */}
                      <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                        {m.purpose}
                      </p>

                      {/* Progress bar + lead time */}
                      <div className="flex items-center gap-2 mt-auto">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(progress, 100)}%`,
                              backgroundColor: dotColor,
                            }}
                          />
                        </div>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                          {m.requirements.leadWeeks}w
                        </Badge>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Status legend */}
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
                <span className="font-medium">Status:</span>
                {[
                  { label: "Complete", color: "#10b981" },
                  { label: "In progress", color: "#3b82f6" },
                  { label: "Needs diagnostic", color: "#f59e0b" },
                  { label: "Not started", color: "#94a3b8" },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lightbox */}
      {hasSystemImage && (
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
      )}
    </>
  )
}
