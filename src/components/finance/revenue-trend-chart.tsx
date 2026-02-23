/**
 * @file revenue-trend-chart.tsx — Stacked area chart showing revenue over time
 *
 * @description Recharts AreaChart with stacked areas for orders, retainers,
 * and subscriptions revenue. Uses gradient fills and ResponsiveContainer.
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
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/types/payments'
import type { RevenueTrendPoint } from '@/types/finance'

interface RevenueTrendChartProps {
  data: RevenueTrendPoint[]
  currency?: string
  className?: string
}

function formatAxisValue(value: number): string {
  if (value >= 100000) return `${(value / 100000).toFixed(0)}k`
  if (value >= 10000) return `${(value / 100).toFixed(0)}`
  if (value >= 1000) return `${(value / 100).toFixed(0)}`
  return `${(value / 100).toFixed(0)}`
}

function CustomTooltip({ active, payload, label, currency }: {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string }>
  label?: string
  currency: string
}) {
  if (!active || !payload) return null
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-md">
      <p className="text-xs font-medium text-foreground mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground capitalize">{entry.name}</span>
          </span>
          <span className="font-medium text-foreground tabular-nums">
            {formatCurrency(entry.value ?? 0, currency)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function RevenueTrendChart({ data, currency = 'GBP', className }: RevenueTrendChartProps) {
  if (data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Revenue Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No revenue data available yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Revenue Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="colorRetainers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="colorSubscriptions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(258, 90%, 66%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(258, 90%, 66%)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatAxisValue}
            />
            <Tooltip content={<CustomTooltip currency={currency} />} />
            <Legend
              verticalAlign="top"
              height={36}
              formatter={(value: string) => (
                <span className="text-xs text-muted-foreground capitalize">{value}</span>
              )}
            />
            <Area
              type="monotone"
              dataKey="orders"
              stackId="1"
              stroke="hsl(160, 84%, 39%)"
              strokeWidth={2}
              fill="url(#colorOrders)"
            />
            <Area
              type="monotone"
              dataKey="retainers"
              stackId="1"
              stroke="hsl(217, 91%, 60%)"
              strokeWidth={2}
              fill="url(#colorRetainers)"
            />
            <Area
              type="monotone"
              dataKey="subscriptions"
              stackId="1"
              stroke="hsl(258, 90%, 66%)"
              strokeWidth={2}
              fill="url(#colorSubscriptions)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
