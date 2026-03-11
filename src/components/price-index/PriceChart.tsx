/**
 * @file PriceChart.tsx
 *
 * @description UKSHI Trend & Forecast chart. Renders historical prices as solid
 * lines and forecast data as dashed lines, with a vertical reference line at
 * the history/forecast boundary. Supports category mode (5 fixed series) and
 * product mode (dynamic series from product slugs).
 */

'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { chartColorsExtended, getChartColor } from '@/lib/chart-colors'

export interface ChartSeries {
  /** Data key in the chart data objects */
  key: string
  /** Display label */
  label: string
  /** HSL color string */
  color: string
}

export interface ChartDataPoint {
  /** Formatted week label (e.g. "10 Mar") */
  label: string
  /** ISO week start for sorting */
  weekStart: string
  /** Whether this point is a forecast */
  isForecast?: boolean
  /** Dynamic keys for each series (category or product slug) */
  [key: string]: string | number | boolean | undefined
}

interface PriceChartProps {
  /** Combined historical + forecast data points */
  data: ChartDataPoint[]
  /** Series configuration */
  series: ChartSeries[]
  /** Label of the boundary week between history and forecast */
  forecastBoundary?: string
  /** 'category' or 'product' */
  mode: 'category' | 'product'
  className?: string
}

/** 20-colour palette for product mode */
const PRODUCT_PALETTE = [
  ...chartColorsExtended,
  'hsl(30, 90%, 55%)',    // Tangerine
  'hsl(180, 60%, 45%)',   // Teal
  'hsl(300, 60%, 55%)',   // Fuchsia
  'hsl(120, 50%, 45%)',   // Forest
  'hsl(45, 85%, 55%)',    // Gold
  'hsl(210, 80%, 50%)',   // Royal Blue
  'hsl(0, 70%, 55%)',     // Crimson
  'hsl(150, 60%, 50%)',   // Jade
  'hsl(240, 60%, 60%)',   // Periwinkle
  'hsl(60, 70%, 45%)',    // Olive
]

/**
 * Get the color for a product series by index.
 *
 * @param index - Series index
 * @returns HSL color string
 */
export function getProductColor(index: number): string {
  return PRODUCT_PALETTE[index % PRODUCT_PALETTE.length]
}

function formatPrice(value: number): string {
  return `£${value.toFixed(2)}`
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string; dataKey: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-md text-xs max-h-64 overflow-y-auto">
      <p className="font-medium text-foreground mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground truncate max-w-[120px]">{entry.name}</span>
          <span className="font-medium ml-auto">{formatPrice(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function PriceChart({ data, series, forecastBoundary, mode, className }: PriceChartProps) {
  if (data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-base font-semibold">UKSHI Trend &amp; Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No price data available.</p>
        </CardContent>
      </Card>
    )
  }

  // DECISION: Split data into historical and forecast segments for dashed styling.
  // Recharts doesn't support per-point dash, so we render two Line elements per series.
  const historyEnd = data.findIndex((d) => d.isForecast)
  const hasHistory = historyEnd > 0 || historyEnd === -1
  const hasForecast = historyEnd >= 0

  // For the transition, include the last historical point in the forecast data
  const historyData = hasHistory
    ? data.slice(0, historyEnd === -1 ? data.length : historyEnd + 1)
    : []
  const forecastData = hasForecast
    ? data.slice(Math.max(0, historyEnd - 1))
    : []

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base font-semibold">UKSHI Trend &amp; Forecast</CardTitle>
        <CardDescription>
          {mode === 'category'
            ? '26-week history with 26-week forecast by category'
            : '26-week history with 26-week forecast by product'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              allowDuplicatedCategory={false}
            />
            <YAxis
              tickFormatter={formatPrice}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              width={65}
            />
            <Tooltip content={<CustomTooltip />} />
            {series.length <= 10 && (
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                iconType="line"
              />
            )}

            {/* Forecast boundary line */}
            {forecastBoundary && (
              <ReferenceLine
                x={forecastBoundary}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{
                  value: 'Forecast →',
                  position: 'top',
                  fontSize: 10,
                  fill: 'hsl(var(--muted-foreground))',
                }}
              />
            )}

            {/* Historical lines (solid) */}
            {hasHistory && series.map((s) => (
              <Line
                key={`hist-${s.key}`}
                data={historyData}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                legendType="line"
              />
            ))}

            {/* Forecast lines (dashed) */}
            {hasForecast && series.map((s) => (
              <Line
                key={`fcst-${s.key}`}
                data={forecastData}
                type="monotone"
                dataKey={s.key}
                name={`${s.label} (forecast)`}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                legendType="none"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
