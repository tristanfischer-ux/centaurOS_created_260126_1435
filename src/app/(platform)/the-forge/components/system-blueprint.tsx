/**
 * @file system-blueprint.tsx — System diagram hero + 3D viewer + module status grid
 *
 * @description Displays the system-level visuals on the concept page:
 * 1. Hero section: Interactive 3D CAD viewer (when ready), system diagram, or generation skeleton
 * 2. Module Status Grid: per-module progress tracking with stagger animation
 *
 * The hero section prioritizes visual impact:
 * - System image appears first (~15s via Gemini)
 * - 3D CAD model replaces/augments it when ready (~60-120s via Modal)
 * - User can toggle between "3D Model" and "System Diagram" views
 *
 * @related
 * - Schema: ../services/xray-schema.ts (XRaySpec, ModuleSpec)
 * - STL viewer: ./stl-viewer.tsx (3D rendering)
 * - CAD generator: ../services/cad-generator.ts (produces STL)
 */

"use client"

import React, { useState, useRef, useEffect, lazy, Suspense } from "react"

import { motion, type Variants } from "framer-motion"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Cog,
  ImageIcon,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

import type { XRaySpec, ModuleSpec } from "../services/xray-schema"

// Lazy-load the 3D viewer to avoid loading three.js until needed
const StlViewer = lazy(() =>
  import("./stl-viewer").then((mod) => ({ default: mod.StlViewer })),
)

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

// ─── Hero View Types ──────────────────────────────────────────────────

type HeroView = "3d" | "diagram"

// ─── Animation Variants ──────────────────────────────────────────────

/** Parent container variant — orchestrates stagger timing */
const gridContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
}

/** Individual module card variant — fade + scale + slide up */
const moduleCardVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 24,
    },
  },
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
  /** Whether a scan just completed (triggers stagger animation) */
  justScanned?: boolean
  /** Whether the system CAD model is currently generating */
  isGeneratingSystemCad?: boolean
}

// ─── Component ────────────────────────────────────────────────────────

/**
 * SystemBlueprint — Hero visual section with 3D viewer + module status grid.
 *
 * @description Prioritizes visual impact on the concept page:
 * 1. System image appears first (fast, ~15s)
 * 2. 3D CAD viewer activates when STL is ready (slower, ~60-120s)
 * 3. User can toggle between views
 * 4. Module status grid shows progress below
 */
export function SystemBlueprint({
  spec,
  systemImageUrl,
  systemImageStatus,
  isGeneratingImages,
  hasImages,
  onGenerateImages,
  canGenerate,
  justScanned = false,
  isGeneratingSystemCad = false,
}: SystemBlueprintProps): React.ReactNode {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [heroView, setHeroView] = useState<HeroView>("diagram")
  const [stlLoadFailed, setStlLoadFailed] = useState(false)
  const hasAnimatedRef = useRef(false)
  const shouldAnimate = justScanned && !hasAnimatedRef.current

  useEffect(() => {
    if (justScanned && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true
    }
  }, [justScanned])

  // Auto-switch to 3D view when the CAD model becomes available
  const hasSystemCad = spec.systemCadUrl && spec.systemCadStatus === "complete"
  const prevHadCad = useRef(false)
  useEffect(() => {
    if (hasSystemCad && !prevHadCad.current) {
      setHeroView("3d")
      prevHadCad.current = true
    }
  }, [hasSystemCad])

  const modules = spec.modules || []
  const n = modules.length
  const hasSystemImage = systemImageUrl && systemImageStatus === "complete"
  const isGenerating = isGeneratingImages || systemImageStatus === "generating"
  const diagComplete = isGatingDiagComplete(spec)

  // If no images at all and not generating, show the CTA
  if (!hasSystemImage && !isGenerating && !hasImages && !hasSystemCad) {
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
          {/* Header with view toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-1 h-7 bg-international-orange rounded-full" />
              <div>
                <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">
                  System Blueprint
                </h3>
                <p className="text-xs text-muted-foreground">
                  {heroView === "3d"
                    ? "Interactive 3D product model — drag to rotate, scroll to zoom"
                    : "System-level process flow diagram"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* View toggle — only show when both views available */}
              {hasSystemCad && hasSystemImage && (
                <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
                  <button
                    onClick={() => setHeroView("3d")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      heroView === "3d"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Box className="h-3.5 w-3.5" />
                    3D Model
                  </button>
                  <button
                    onClick={() => setHeroView("diagram")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      heroView === "diagram"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Diagram
                  </button>
                </div>
              )}

              {/* Generation indicators */}
              {(isGenerating || isGeneratingSystemCad) && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {isGeneratingSystemCad ? "Building 3D model..." : "Generating images..."}
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

          {/* Hero Section — 3D viewer or system diagram */}
          {heroView === "3d" && hasSystemCad && !stlLoadFailed ? (
            <div className="space-y-2">
              <Suspense fallback={<Skeleton className="h-[500px] w-full rounded-xl" />}>
                <StlViewer
                  stlUrl={spec.systemCadUrl!}
                  height={500}
                  onLoadError={() => {
                    // Auto-fallback to diagram view when 3D fails to load
                    setStlLoadFailed(true)
                    if (hasSystemImage) {
                      setHeroView("diagram")
                    }
                  }}
                />
              </Suspense>
              <p className="text-xs text-muted-foreground text-center font-medium">
                Interactive 3D Product Model — Drag to rotate, scroll to zoom
              </p>
            </div>
          ) : heroView === "3d" && isGeneratingSystemCad ? (
            /* 3D view selected but still generating */
            <div className="relative rounded-xl overflow-hidden">
              <Skeleton className="h-[500px] w-full" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 bg-background/90 rounded-2xl px-8 py-5 shadow-sm">
                  <RotateCcw className="h-8 w-8 animate-spin text-international-orange" style={{ animationDuration: "3s" }} />
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Building 3D model...</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Generating CadQuery code and rendering the product
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : heroView === "3d" && spec.systemCadStatus === "failed" ? (
            /* 3D generation failed — show clear feedback with fallback */
            <div className="rounded-xl border border-dashed border-muted-foreground/20 flex flex-col items-center justify-center gap-3 py-16">
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-foreground">3D model generation failed</p>
                <p className="text-xs text-muted-foreground">
                  The product geometry was too complex to render. The system diagram is still available.
                </p>
              </div>
              {hasSystemImage && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setHeroView("diagram")}
                >
                  <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
                  View Diagram
                </Button>
              )}
            </div>
          ) : hasSystemImage ? (
            /* System diagram view */
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
            /* Initial generation skeleton */
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

          {/* Module Status Grid — stagger animation on first reveal */}
          {n > 0 && (
            <div className="space-y-4">
              <motion.div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                variants={shouldAnimate ? gridContainerVariants : undefined}
                initial={shouldAnimate ? "hidden" : undefined}
                animate={shouldAnimate ? "visible" : undefined}
              >
                {modules.map((m) => {
                  const status = getNodeStatus(m, diagComplete)
                  const progress = readinessFor(m)
                  const isGating = m.isGatingModule || m.id === "react"
                  const dotColor = statusDotColor(status)

                  return (
                    <motion.button
                      key={m.id}
                      type="button"
                      variants={shouldAnimate ? moduleCardVariants : undefined}
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

                      {/* Module stats — key parts + failure modes */}
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Cog className="h-2.5 w-2.5" />
                          {m.keyParts.length} parts
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <ShieldAlert className="h-2.5 w-2.5" />
                          {m.detail.commonFailureModes.length} risks
                        </span>
                      </div>

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
                    </motion.button>
                  )
                })}
              </motion.div>

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

      {/* Lightbox for system diagram */}
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
