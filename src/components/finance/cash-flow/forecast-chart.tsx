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
import { chartColors } from '@/lib/chart-colors'
import type { ForecastPoint } from '@/lib/finance/forecast'
import type { FundingEvent } from '@/actions/finance-forecast'

// Semantic aliases from the shared chart palette
const COLOR_EXPECTED = chartColors[0] // International Orange
const COLOR_BEST = chartColors[2]     // Emerald
const COLOR_WORST = 'hsl(0, 84%, 60%)'  // Red (loss color from moneyMapColors)

interface ForecastChartProps {
  data: ForecastPoint[]
  fundingEvents?: FundingEvent[]
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
          <span className="h-2 w-2 rounded-full bg-status-success" />
          <span className="text-muted-foreground">Best case:</span>
          <span className="font-medium">{formatAmount(best.value)}</span>
        </div>
      )}
      {worst && (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-destructive" />
          <span className="text-muted-foreground">Worst case:</span>
          <span className="font-medium">{formatAmount(worst.value)}</span>
        </div>
      )}
    </div>
  )
}

export function ForecastChart({ data, fundingEvents = [], className }: ForecastChartProps) {
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

  // Map funding events to chart x-axis labels (ForecastPoint.label) for ReferenceLine positioning
  const fundingByLabel: Record<string, FundingEvent[]> = {}
  for (const event of fundingEvents) {
    // Convert ISO month "2026-03" → label format "Mar 2026"
    const [year, month] = event.month.split('-').map(Number)
    const label = new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    if (!fundingByLabel[label]) fundingByLabel[label] = []
    fundingByLabel[label].push(event)
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Cash Flow Forecast</CardTitle>
        <CardDescription>
          Projected balance over the next {data.length} months with best/worst case bands.
          {fundingEvents.length > 0 && (
            <span className="ml-1 text-status-success">· {fundingEvents.length} funding event{fundingEvents.length > 1 ? 's' : ''} included</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradExpected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLOR_EXPECTED} stopOpacity={0.3} />
                <stop offset="95%" stopColor={COLOR_EXPECTED} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradBest" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLOR_BEST} stopOpacity={0.15} />
                <stop offset="95%" stopColor={COLOR_BEST} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradWorst" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLOR_WORST} stopOpacity={0.15} />
                <stop offset="95%" stopColor={COLOR_WORST} stopOpacity={0} />
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
            {/* Funding event markers — vertical lines at months when won funding lands */}
            {Object.entries(fundingByLabel).map(([label, events]) => (
              <ReferenceLine
                key={label}
                x={label}
                stroke="hsl(var(--status-success))"
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{
                  value: `+${formatAmount(events.reduce((s, e) => s + e.amount, 0))}`,
                  position: 'top',
                  fontSize: 10,
                  fill: 'hsl(var(--status-success))',
                }}
              />
            ))}
            <Area
              type="monotone"
              dataKey="bestCase"
              name="bestCase"
              stroke={COLOR_BEST}
              fill="url(#gradBest)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <Area
              type="monotone"
              dataKey="worstCase"
              name="worstCase"
              stroke={COLOR_WORST}
              fill="url(#gradWorst)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <Area
              type="monotone"
              dataKey="balance"
              name="balance"
              stroke={COLOR_EXPECTED}
              fill="url(#gradExpected)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
