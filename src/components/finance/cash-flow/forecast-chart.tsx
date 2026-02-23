/**
 * @file forecast-chart.tsx — Cash flow forecast with scenario bands
 *
 * @description Recharts AreaChart showing projected balance over time
 * with best/expected/worst case bands rendered as stacked areas.
 */

'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { ForecastPoint } from '@/lib/finance/forecast'

interface ForecastChartProps {
  data: ForecastPoint[]
  currency?: string
  className?: string
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value / 100)
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string }>
  label?: string
}) {
  if (!active || !payload) return null

  const expected = payload.find(p => p.name === 'balance')
  const best = payload.find(p => p.name === 'bestCase')
  const worst = payload.find(p => p.name === 'worstCase')

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-md text-xs">
      <p className="font-medium text-foreground mb-2">{label}</p>
      {expected && (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-international-orange" />
          <span className="text-muted-foreground">Expected:</span>
          <span className="font-medium">{formatAmount(expected.value)}</span>
        </div>
      )}
      {best && (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#10b981' }} />
          <span className="text-muted-foreground">Best case:</span>
          <span className="font-medium">{formatAmount(best.value)}</span>
        </div>
      )}
      {worst && (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#ef4444' }} />
          <span className="text-muted-foreground">Worst case:</span>
          <span className="font-medium">{formatAmount(worst.value)}</span>
        </div>
      )}
    </div>
  )
}

export function ForecastChart({ data, className }: ForecastChartProps) {
  if (data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Cash Flow Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No forecast data available. Add revenue streams and costs in Money Map.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Cash Flow Forecast</CardTitle>
        <CardDescription>
          Projected balance over the next {data.length} months with best/worst case bands.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradExpected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff4500" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ff4500" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradBest" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradWorst" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={formatAmount}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              width={70}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey="bestCase"
              name="bestCase"
              stroke="#10b981"
              fill="url(#gradBest)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <Area
              type="monotone"
              dataKey="worstCase"
              name="worstCase"
              stroke="#ef4444"
              fill="url(#gradWorst)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <Area
              type="monotone"
              dataKey="balance"
              name="balance"
              stroke="#ff4500"
              fill="url(#gradExpected)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
