'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { chartColors, moneyMapColors } from '@/lib/chart-colors'
import { formatCurrency, formatCompactCurrency } from '@/types/payments'
import type { BurnWeekRow } from '@/types/cash-burn'

// ============================================================
// Types
// ============================================================

interface BurnAreaChartProps {
  data: BurnWeekRow[]
  comparisonData?: Array<{ name: string; weeks: BurnWeekRow[] }>
}

// Semantic colors from centralised palette
const COLOR_SUCCESS = chartColors[2]      // Emerald
const COLOR_DESTRUCTIVE = moneyMapColors.loss // Red

// ============================================================
// Component
// ============================================================

export function BurnAreaChart({ data, comparisonData }: BurnAreaChartProps) {
  const hasComparison = comparisonData && comparisonData.length > 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-lg font-semibold text-foreground">Cumulative Balance</h3>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLOR_SUCCESS} stopOpacity={0.3} />
                <stop offset="95%" stopColor={COLOR_DESTRUCTIVE} stopOpacity={0.1} />
              </linearGradient>
              {/* Comparison gradients */}
              {hasComparison &&
                comparisonData.map((_, idx) => (
                  <linearGradient
                    key={`comp-gradient-${idx}`}
                    id={`compGradient-${idx}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={chartColors[(idx + 1) % chartColors.length]}
                      stopOpacity={0.2}
                    />
                    <stop
                      offset="95%"
                      stopColor={chartColors[(idx + 1) % chartColors.length]}
                      stopOpacity={0.05}
                    />
                  </linearGradient>
                ))}
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              opacity={0.5}
            />
            <XAxis
              dataKey="weekLabel"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatCompactCurrency(v)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Balance']}
            />

            {/* Zero reference line */}
            <ReferenceLine
              y={0}
              stroke={COLOR_DESTRUCTIVE}
              strokeDasharray="8 4"
              strokeWidth={2}
            />

            {/* Main balance area */}
            <Area
              type="monotone"
              dataKey="cumulativeBalance"
              stroke={COLOR_SUCCESS}
              strokeWidth={2}
              fill="url(#balanceGradient)"
              name="Balance"
            />

            {/* Comparison scenarios */}
            {hasComparison && (
              <Legend />
            )}
            {hasComparison &&
              comparisonData.map((scenario, idx) => (
                <Area
                  key={scenario.name}
                  type="monotone"
                  dataKey="cumulativeBalance"
                  data={scenario.weeks}
                  stroke={chartColors[(idx + 1) % chartColors.length]}
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  fill={`url(#compGradient-${idx})`}
                  name={scenario.name}
                />
              ))}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
