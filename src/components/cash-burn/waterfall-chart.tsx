'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { chartColors, moneyMapColors } from '@/lib/chart-colors'
import { formatCurrency } from '@/types/payments'
import type { IncomeStatementRow } from '@/types/cash-burn'

// Semantic colors from centralised palette
const COLOR_SUCCESS = chartColors[2]        // Emerald
const COLOR_DESTRUCTIVE = moneyMapColors.loss // Red
const COLOR_INFO = chartColors[1]           // Electric Blue

// ============================================================
// Helpers
// ============================================================

/** Compact currency for Y-axis labels (values arrive in pence) */
function formatCompactCurrency(pence: number): string {
  const pounds = pence / 100
  const abs = Math.abs(pounds)
  const sign = pounds < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(0)}k`
  return `${sign}£${abs.toFixed(0)}`
}

// ============================================================
// Types
// ============================================================

interface WaterfallChartProps {
  data: IncomeStatementRow
}

// ============================================================
// Component
// ============================================================

export function WaterfallChart({ data }: WaterfallChartProps) {
  // INTENT: Build waterfall bars — Revenue -> -COGS -> Gross Profit -> -OpEx -> -R&D -> EBITDA
  //
  // Recharts stacked-bar trick: invisible "base" bar (0 → base) positions the
  // visible "value" bar (base → base+value).  For bars that hang below zero
  // the base is negative so the invisible bar extends downward and the visible
  // bar stacks back upward from there.
  //
  // Total bars (Revenue, Gross Profit, EBITDA) span from 0 to their total.
  // Delta bars (COGS, OpEx, R&D) float between successive running totals.

  const chartData = [
    {
      name: 'Revenue',
      base: Math.min(0, data.revenue),
      value: Math.abs(data.revenue),
      fill: COLOR_SUCCESS,
      rawValue: data.revenue,
    },
    {
      name: 'COGS',
      base: Math.min(data.revenue, data.grossProfit),
      value: Math.abs(data.cogs),
      fill: COLOR_DESTRUCTIVE,
      rawValue: -data.cogs,
    },
    {
      name: 'Gross Profit',
      base: Math.min(0, data.grossProfit),
      value: Math.abs(data.grossProfit),
      fill: COLOR_INFO,
      rawValue: data.grossProfit,
    },
    {
      name: 'OpEx',
      base: Math.min(data.grossProfit, data.grossProfit - data.opex),
      value: Math.abs(data.opex),
      fill: COLOR_DESTRUCTIVE,
      rawValue: -data.opex,
    },
    {
      name: 'R&D',
      base: Math.min(data.grossProfit - data.opex, data.ebitda),
      value: Math.abs(data.rnd),
      fill: COLOR_DESTRUCTIVE,
      rawValue: -data.rnd,
    },
    {
      name: 'EBITDA',
      base: Math.min(0, data.ebitda),
      value: Math.abs(data.ebitda),
      fill: data.ebitda >= 0 ? COLOR_SUCCESS : COLOR_DESTRUCTIVE,
      rawValue: data.ebitda,
    },
  ]

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-lg font-semibold text-foreground">P&L Waterfall</h3>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              opacity={0.5}
            />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatCompactCurrency}
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={((_value: number, _name: string, props: { payload: { rawValue: number } }) => {
                return [formatCurrency(props.payload.rawValue), 'Amount']
              }) as never}
            />
            {/* Invisible base bar */}
            <Bar dataKey="base" stackId="waterfall" fill="transparent" />
            {/* Visible value bar */}
            <Bar dataKey="value" stackId="waterfall" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
