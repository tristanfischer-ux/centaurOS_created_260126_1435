"use client"

/**
 * @file provider-comparison.tsx — Side-by-side 3D provider A/B comparison grid.
 *
 * @description Renders a responsive grid of 3D model viewers, one per provider.
 * Each cell shows the provider badge, model viewer, and generation metrics.
 * Viewers are lazy-loaded via IntersectionObserver to prevent memory issues.
 */

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react"
import { Loader2, CheckCircle2, XCircle, Download, Clock, Triangle, HardDrive, DollarSign } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ModelViewer } from "@/components/cad/model-viewer"
import type { ABProvider, ProviderResult } from "@/lib/cad-lab-types"

// ─── Provider metadata ───────────────────────────────────────────────

const PROVIDER_INFO: Record<ABProvider, { label: string; tier: string; badgeVariant: "default" | "secondary" | "outline" }> = {
  meshy: { label: "Meshy", tier: "Commercial", badgeVariant: "default" },
  tripo: { label: "Tripo", tier: "Commercial", badgeVariant: "default" },
  trellis: { label: "TRELLIS.2", tier: "Self-hosted", badgeVariant: "secondary" },
  sf3d: { label: "SF3D", tier: "Self-hosted", badgeVariant: "secondary" },
  zoo: { label: "Zoo.dev", tier: "Parametric", badgeVariant: "outline" },
  gencad: { label: "GenCAD", tier: "Baseline", badgeVariant: "outline" },
}

// ─── Lazy-loaded viewer cell ─────────────────────────────────────────

function LazyViewerCell({ result }: { result: ProviderResult }) {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "100px" },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const hasModel = !!(result.glbUrl || result.stlUrl)

  return (
    <div ref={ref} className="h-[300px]">
      {isVisible && hasModel ? (
        <ModelViewer
          glbUrl={result.glbUrl}
          stlUrl={result.stlUrl}
          className="h-full"
        />
      ) : hasModel ? (
        <div className="h-full rounded-lg border border-border bg-muted flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Scroll to load viewer</p>
        </div>
      ) : (
        <div className="h-full rounded-lg border border-border bg-muted flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No 3D model</p>
        </div>
      )}
    </div>
  )
}

// ─── Status indicator ────────────────────────────────────────────────

function StatusIndicator({ status }: { status: ProviderResult["status"] }): ReactNode {
  switch (status) {
    case "generating":
    case "pending":
      return <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-success" />
    case "failed":
      return <XCircle className="h-4 w-4 text-destructive" />
  }
}

// ─── Metric row ──────────────────────────────────────────────────────

function MetricRow({ result }: { result: ProviderResult }) {
  if (result.status !== "completed") return null

  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {result.generationTimeMs != null && (
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {(result.generationTimeMs / 1000).toFixed(1)}s
        </span>
      )}
      {result.triangleCount != null && (
        <span className="flex items-center gap-1">
          <Triangle className="h-3 w-3" />
          {result.triangleCount.toLocaleString()} tris
        </span>
      )}
      {(result.glbSizeKb != null || result.stlSizeKb != null) && (
        <span className="flex items-center gap-1">
          <HardDrive className="h-3 w-3" />
          {result.glbSizeKb ? `${result.glbSizeKb}kb GLB` : `${result.stlSizeKb}kb STL`}
        </span>
      )}
      {result.estimatedCostUsd != null && (
        <span className="flex items-center gap-1">
          <DollarSign className="h-3 w-3" />
          ${result.estimatedCostUsd.toFixed(2)}
        </span>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────

interface ProviderComparisonProps {
  providerResults: Record<string, ProviderResult>
  isComparing: boolean
}

export function ProviderComparison({ providerResults, isComparing }: ProviderComparisonProps) {
  const results = Object.values(providerResults)

  const handleDownloadModel = useCallback((result: ProviderResult) => {
    const url = result.glbUrl || result.stlUrl || result.stepUrl
    if (!url) return
    const ext = result.stepUrl ? "step" : result.glbUrl ? "glb" : "stl"
    const link = document.createElement("a")
    link.href = url
    link.download = `model-${result.provider}.${ext}`
    link.click()
  }, [])

  if (results.length === 0 && !isComparing) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Provider Comparison
        </h2>
        {isComparing && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Generating across {results.length} providers...
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map((result) => {
          const info = PROVIDER_INFO[result.provider]
          return (
            <Card key={result.provider}>
              <CardContent className="pt-4 pb-4 space-y-3">
                {/* Provider header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusIndicator status={result.status} />
                    <span className="text-sm font-medium text-foreground">{info.label}</span>
                    <Badge variant={info.badgeVariant} className="text-[10px] px-1.5 py-0">
                      {info.tier}
                    </Badge>
                  </div>
                  {result.status === "completed" && (result.glbUrl || result.stlUrl || result.stepUrl) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => handleDownloadModel(result)}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {/* 3D viewer or status */}
                {result.status === "completed" ? (
                  <LazyViewerCell result={result} />
                ) : result.status === "generating" || result.status === "pending" ? (
                  <div className="h-[300px] rounded-lg border border-border bg-muted flex flex-col items-center justify-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-international-orange" />
                    <p className="text-sm text-muted-foreground">Generating...</p>
                  </div>
                ) : (
                  <div className="h-[300px] rounded-lg border border-destructive/20 bg-destructive/5 flex flex-col items-center justify-center gap-2 px-4">
                    <XCircle className="h-6 w-6 text-destructive" />
                    <p className="text-xs text-destructive text-center line-clamp-3">
                      {result.error || "Generation failed"}
                    </p>
                  </div>
                )}

                {/* Metrics */}
                <MetricRow result={result} />
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
