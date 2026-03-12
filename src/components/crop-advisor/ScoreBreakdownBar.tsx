"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface ScoreBreakdownBarProps {
  demandScore: number
  priceTrendScore: number
  supplyGapScore: number
  capabilityScore: number
}

const segments = [
  { key: "demand", label: "Demand", color: "bg-international-orange" },
  { key: "priceTrend", label: "Price Trend", color: "bg-info" },
  { key: "supplyGap", label: "Supply Gap", color: "bg-success" },
  { key: "capability", label: "Capability", color: "bg-warning" },
] as const

/**
 * Horizontal stacked bar showing the four scoring signals.
 * Each segment's width is proportional to its score out of 100.
 */
export function ScoreBreakdownBar({
  demandScore,
  priceTrendScore,
  supplyGapScore,
  capabilityScore,
}: ScoreBreakdownBarProps) {
  const scores = {
    demand: demandScore,
    priceTrend: priceTrendScore,
    supplyGap: supplyGapScore,
    capability: capabilityScore,
  }

  const total = demandScore + priceTrendScore + supplyGapScore + capabilityScore

  return (
    <div className="flex items-center gap-1">
      <div className="flex-1 flex h-2.5 rounded-full overflow-hidden bg-muted">
        {segments.map(({ key, label, color }) => {
          const value = scores[key]
          if (value <= 0) return null
          const widthPct = (value / 100) * 100

          return (
            <Tooltip key={key} delayDuration={100}>
              <TooltipTrigger asChild>
                <div
                  className={`${color} transition-all duration-300`}
                  style={{ width: `${widthPct}%` }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{label}: {value}/25</p>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
      <span className="text-xs font-medium text-muted-foreground w-8 text-right">
        {total}
      </span>
    </div>
  )
}
