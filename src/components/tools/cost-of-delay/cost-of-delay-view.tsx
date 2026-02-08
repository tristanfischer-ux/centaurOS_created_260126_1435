"use client"

/**
 * CostOfDelayView — Reusable Cost of Delay calculator view.
 *
 * @description Extracted from the standalone page so it can be embedded
 * inside the Financial Tools tabbed page. Manages its own input state,
 * URL sync, and derived calculations.
 *
 * @component
 * @example
 * <CostOfDelayView />
 */

import { useState, useMemo, useCallback, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { CalculatorForm } from "@/components/tools/cost-of-delay/calculator-form"
import { SummaryCards } from "@/components/tools/cost-of-delay/summary-cards"
import { CumulativeChart } from "@/components/tools/cost-of-delay/cumulative-chart"
import {
  DEFAULT_INPUTS,
  generateChartData,
  calculateMetrics,
} from "@/components/tools/cost-of-delay/types"
import { Button } from "@/components/ui/button"
import { Share2, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import type { CostOfDelayInputs } from "@/components/tools/cost-of-delay/types"

/** URL param keys -- short names to keep URLs compact */
const PARAM_MAP = {
  monthlyOverhead: "oh",
  expectedMonthlyRevenue: "rev",
  monthsUntilLaunch: "launch",
  monthsSaved: "saved",
  accelerationCost: "cost",
} as const

/**
 * Reads inputs from URL search params, falling back to defaults.
 */
function parseInputsFromParams(params: URLSearchParams): CostOfDelayInputs {
  const get = (key: string, fallback: number): number => {
    const val = params.get(key)
    if (val === null) return fallback
    const num = parseFloat(val)
    return isNaN(num) ? fallback : num
  }

  return {
    monthlyOverhead: get(PARAM_MAP.monthlyOverhead, DEFAULT_INPUTS.monthlyOverhead),
    expectedMonthlyRevenue: get(PARAM_MAP.expectedMonthlyRevenue, DEFAULT_INPUTS.expectedMonthlyRevenue),
    monthsUntilLaunch: get(PARAM_MAP.monthsUntilLaunch, DEFAULT_INPUTS.monthsUntilLaunch),
    monthsSaved: get(PARAM_MAP.monthsSaved, DEFAULT_INPUTS.monthsSaved),
    accelerationCost: get(PARAM_MAP.accelerationCost, DEFAULT_INPUTS.accelerationCost),
  }
}

/**
 * Encodes inputs into URL search params.
 */
function encodeInputsToParams(inputs: CostOfDelayInputs): string {
  const params = new URLSearchParams()
  params.set(PARAM_MAP.monthlyOverhead, String(inputs.monthlyOverhead))
  params.set(PARAM_MAP.expectedMonthlyRevenue, String(inputs.expectedMonthlyRevenue))
  params.set(PARAM_MAP.monthsUntilLaunch, String(inputs.monthsUntilLaunch))
  params.set(PARAM_MAP.monthsSaved, String(inputs.monthsSaved))
  params.set(PARAM_MAP.accelerationCost, String(inputs.accelerationCost))
  return params.toString()
}

export function CostOfDelayView(): React.ReactElement {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [inputs, setInputs] = useState<CostOfDelayInputs>(() =>
    parseInputsFromParams(searchParams)
  )

  // Sync inputs to URL (debounced via effect)
  useEffect(() => {
    const encoded = encodeInputsToParams(inputs)
    const current = searchParams.toString()
    if (encoded !== current) {
      router.replace(`?${encoded}`, { scroll: false })
    }
  }, [inputs, router, searchParams])

  // Derived data -- recalculated when inputs change
  const chartData = useMemo(() => generateChartData(inputs), [inputs])
  const metrics = useMemo(() => calculateMetrics(inputs), [inputs])

  const originalLaunchMonth = inputs.monthsUntilLaunch
  const acceleratedLaunchMonth = Math.max(0, inputs.monthsUntilLaunch - inputs.monthsSaved)

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}?${encodeInputsToParams(inputs)}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link copied to clipboard")
    } catch {
      toast.error("Failed to copy link")
    }
  }, [inputs])

  const handleReset = useCallback(() => {
    setInputs(DEFAULT_INPUTS)
  }, [])

  return (
    <div className="space-y-8">
      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
        <Button variant="secondary" size="sm" onClick={handleShare}>
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </Button>
      </div>

      {/* Summary Cards */}
      <SummaryCards metrics={metrics} />

      {/* Main Content: Form + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Left: Input Form */}
        <div>
          <CalculatorForm inputs={inputs} onChange={setInputs} />
        </div>

        {/* Right: Chart */}
        <div>
          <CumulativeChart
            data={chartData}
            originalLaunchMonth={originalLaunchMonth}
            acceleratedLaunchMonth={acceleratedLaunchMonth}
          />
        </div>
      </div>

      {/* Insight callout */}
      <div className="rounded-xl border bg-muted/30 p-6">
        <h3 className="text-sm font-semibold text-foreground mb-2">How to read this</h3>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">The green line</strong> shows your cumulative financial position
            if you invest to ship earlier. <strong className="text-foreground">The amber line</strong> shows
            what happens if you stick with the current timeline.
          </p>
          <p>
            The <strong className="text-foreground">gap between the lines</strong> is money you save by
            accelerating. It grows every month because you&apos;re earning revenue sooner.
          </p>
          <p>
            <strong className="text-foreground">Rule of thumb:</strong> If the acceleration cost is less than
            one month&apos;s Cost of Delay, it&apos;s almost always worth it.
          </p>
        </div>
      </div>
    </div>
  )
}
