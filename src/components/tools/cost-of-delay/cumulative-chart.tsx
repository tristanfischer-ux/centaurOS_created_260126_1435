"use client"

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3 } from "lucide-react"

import type { ChartDataPoint } from "./types"

interface CumulativeChartProps {
  data: ChartDataPoint[]
  originalLaunchMonth: number
  acceleratedLaunchMonth: number
}

/** Chart color constants (from design system chart tokens) */
const COLORS = {
  doNothing: "#f59e0b",    // Amber — the "warning/delay" path
  accelerate: "#10b981",   // Emerald — the "savings" path
  savings: "#3b82f6",      // Electric Blue — net difference
  grid: "#e2e8f0",         // Muted grid
  refLine: "#94a3b8",      // Subtle reference line
} as const

/**
 * Formats currency values for axis labels.
 */
function formatAxisValue(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${value < 0 ? "-" : ""}£${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${value < 0 ? "-" : ""}£${(abs / 1_000).toFixed(0)}k`
  return `£${value.toFixed(0)}`
}

/**
 * Custom tooltip component matching the design system.
 */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border bg-card p-3 shadow-md">
      <p className="text-sm font-semibold text-foreground mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
          </span>
          <span className="font-medium text-foreground">
            {formatAxisValue(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Primary visualization: cumulative net financial position over 24 months.
 *
 * @description Shows two area curves — "Do Nothing" vs "Accelerate" —
 * making the financial advantage of shipping earlier viscerally obvious.
 * Reference lines mark launch dates for both scenarios.
 */
export function CumulativeChart({
  data,
  originalLaunchMonth,
  acceleratedLaunchMonth,
}: CumulativeChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-electric-blue-light">
            <BarChart3 className="h-4 w-4 text-electric-blue" />
          </div>
          Cumulative Net Position
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          How your financial position evolves over 24 months under each scenario.
          The gap between the lines is money you save by accelerating.
        </p>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-6 mb-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-8 rounded-full" style={{ backgroundColor: COLORS.accelerate }} />
            <span className="text-foreground font-medium">Accelerate</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-8 rounded-full" style={{ backgroundColor: COLORS.doNothing }} />
            <span className="text-foreground font-medium">Do Nothing</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-8 border-t-2 border-dashed" style={{ borderColor: COLORS.refLine }} />
            <span className="text-muted-foreground">Launch dates</span>
          </div>
        </div>

        {/* Chart */}
        <div className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval={2}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatAxisValue}
                width={60}
              />
              <Tooltip content={<ChartTooltip />} />

              {/* Reference lines for launch dates */}
              <ReferenceLine
                x={acceleratedLaunchMonth === 0 ? "Now" : `Mo ${acceleratedLaunchMonth}`}
                stroke={COLORS.accelerate}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: "Accelerated launch",
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: COLORS.accelerate,
                }}
              />
              <ReferenceLine
                x={originalLaunchMonth === 0 ? "Now" : `Mo ${originalLaunchMonth}`}
                stroke={COLORS.doNothing}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: "Original launch",
                  position: "insideTopLeft",
                  fontSize: 10,
                  fill: COLORS.doNothing,
                }}
              />

              {/* Zero line */}
              <ReferenceLine y={0} stroke={COLORS.refLine} strokeWidth={1} />

              {/* Area: Do Nothing */}
              <Area
                type="monotone"
                dataKey="doNothing"
                name="Do Nothing"
                stroke={COLORS.doNothing}
                fill={COLORS.doNothing}
                fillOpacity={0.1}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
              />

              {/* Area: Accelerate */}
              <Area
                type="monotone"
                dataKey="accelerate"
                name="Accelerate"
                stroke={COLORS.accelerate}
                fill={COLORS.accelerate}
                fillOpacity={0.15}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
