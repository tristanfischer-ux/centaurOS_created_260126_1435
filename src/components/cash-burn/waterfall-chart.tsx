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
// Types
// ============================================================

interface WaterfallChartProps {
  data: IncomeStatementRow
}

interface WaterfallBar {
  name: string
  value: number
  base: number
  fill: string
}

// ============================================================
// Component
// ============================================================

export function WaterfallChart({ data }: WaterfallChartProps) {
  // INTENT: Build waterfall bars — Revenue -> -COGS -> Gross Profit -> -OpEx -> -R&D -> EBITDA
  const bars: WaterfallBar[] = [
    {
      name: 'Revenue',
      value: data.revenue,
      base: 0,
      fill: COLOR_SUCCESS,
    },
    {
      name: 'COGS',
      value: data.cogs,
      base: data.revenue - data.cogs,
      fill: COLOR_DESTRUCTIVE,
    },
    {
      name: 'Gross Profit',
      value: data.grossProfit,
      base: 0,
      fill: COLOR_INFO,
    },
    {
      name: 'OpEx',
      value: data.opex,
      base: data.grossProfit - data.opex,
      fill: COLOR_DESTRUCTIVE,
    },
    {
      name: 'R&D',
      value: data.rnd,
      base: data.grossProfit - data.opex - data.rnd,
      fill: COLOR_DESTRUCTIVE,
    },
    {
      name: 'EBITDA',
      value: data.ebitda,
      base: 0,
      fill: data.ebitda >= 0 ? COLOR_SUCCESS : COLOR_DESTRUCTIVE,
    },
  ]

  // Recharts stacked bar trick: base (invisible) + value (visible)
  const chartData = bars.map((bar) => ({
    name: bar.name,
    base: Math.max(0, bar.base),
    value: Math.abs(bar.value),
    fill: bar.fill,
    rawValue: bar.value,
  }))

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
              tickFormatter={(v: number) => formatCurrency(v)}
            />
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
