"use client"

/**
 * @file supply-flow/page.tsx — Supply Flow fan diagram page.
 *
 * @description Visualises how a product's components fan out to individual
 * part manufacturers, then converge to assembly/drop-ship fulfilment companies.
 * Uses the CadLab context for modules and diagnostics, and calls the
 * getSupplyFlowData server action to build the three-tier graph.
 */

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, GitBranch, Loader2 } from "lucide-react"

import { FORGE_ROUTES } from "@/lib/forge-routes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"

import { getSupplyFlowData } from "@/actions/supply-flow"
import type { SupplyFlowData } from "../components/supply-flow-types"
import { SupplyFlowDiagram } from "../components/supply-flow-diagram"
import { useCadLab } from "../cad-lab-context"

// ─── Legend items ───────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { label: "Components", color: "bg-chart-1" },
  { label: "Manufacturers", color: "bg-chart-4" },
  { label: "Assembly & Fulfillment", color: "bg-chart-2" },
]

// ─── Page ───────────────────────────────────────────────────────────

export default function SupplyFlowPage(): React.ReactNode {
  const router = useRouter()
  const { modules, subject, diagnosticAnswers } = useCadLab()

  const [data, setData] = useState<SupplyFlowData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!modules.length) return

    let cancelled = false
    setLoading(true)
    setError(null)

    const input = modules.map((m) => ({
      id: m.id,
      name: m.name,
      purpose: m.purpose,
      keyParts: m.keyParts,
      description: m.description,
    }))

    getSupplyFlowData(input, diagnosticAnswers)
      .then((result) => {
        if (cancelled) return
        setData(result)
      })
      .catch((err) => {
        if (cancelled) return
        console.error("[SUPPLY-FLOW] Failed to load:", err)
        setError("Failed to load supply flow data. Please try again.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [modules, diagnosticAnswers])

  return (
    <div className="space-y-6">
      {/* Header with accent bar */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-1 rounded-full bg-international-orange" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Supply Flow
          </h1>
          <p className="text-xs text-muted-foreground">
            Component → manufacturer → assembly pipeline for {subject || "this project"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs gap-1.5"
          onClick={() => router.push(FORGE_ROUTES.cadLabReview)}
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Review
        </Button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Building supply flow graph…</p>
            </div>
            <div className="mt-6 space-y-3">
              <Skeleton className="h-4 w-3/4 mx-auto" />
              <Skeleton className="h-4 w-1/2 mx-auto" />
              <Skeleton className="h-4 w-2/3 mx-auto" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state — no modules */}
      {!loading && !modules.length && (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<GitBranch className="h-10 w-10" />}
              title="No modules to visualise"
              description="Build modules in the CAD Lab first, then view the supply flow here."
            />
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {!loading && error && (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<GitBranch className="h-10 w-10" />}
              title="Something went wrong"
              description={error}
            />
          </CardContent>
        </Card>
      )}

      {/* Diagram */}
      {!loading && data && !error && (
        <>
          <SupplyFlowDiagram data={data} />

          {/* Color legend */}
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            {LEGEND_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${item.color}`} />
                {item.label}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Footer */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs gap-1.5"
          onClick={() => router.push(FORGE_ROUTES.cadLabReview)}
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Review
        </Button>
      </div>
    </div>
  )
}
