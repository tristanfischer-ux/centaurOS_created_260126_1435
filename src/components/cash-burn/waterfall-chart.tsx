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
import { formatCurrency, formatCompactCurrency } from '@/types/payments'
import type { IncomeStatementRow } from '@/types/cash-burn'

// Semantic colors from centralised palette
const COLOR_SUCCESS = chartColors[2]        // Emerald
const COLOR_DESTRUCTIVE = moneyMapColors.loss // Red

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
  // Uses Recharts range bars: each bar value is [low, high] so the bar renders
  // between those two Y-axis positions. Total bars (Revenue, Gross Profit, EBITDA)
  // span from 0 to their total. Delta bars (COGS, OpEx, R&D) float between
  // successive running totals.

  const chartData = [
    {
      name: 'Revenue',
      value: [0, data.revenue] as [number, number],
      fill: data.revenue >= 0 ? COLOR_SUCCESS : COLOR_DESTRUCTIVE,
      rawValue: data.revenue,
    },
    {
      name: 'COGS',
      value: [data.grossProfit, data.revenue] as [number, number],
      fill: COLOR_DESTRUCTIVE,
      rawValue: -data.cogs,
    },
    {
      name: 'Gross Profit',
      value: [0, data.grossProfit] as [number, number],
      fill: data.grossProfit >= 0 ? COLOR_SUCCESS : COLOR_DESTRUCTIVE,
      rawValue: data.grossProfit,
    },
    {
      name: 'OpEx',
      value: [data.grossProfit - data.opex, data.grossProfit] as [number, number],
      fill: COLOR_DESTRUCTIVE,
      rawValue: -data.opex,
    },
    {
      name: 'R&D',
      value: [data.ebitda, data.grossProfit - data.opex] as [number, number],
      fill: COLOR_DESTRUCTIVE,
      rawValue: -data.rnd,
    },
    {
      name: 'EBITDA',
      value: [0, data.ebitda] as [number, number],
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
                return [formatCurrency(props.payload.rawValue, 'GBP', 0), 'Amount']
              }) as never}
            />
            <Bar dataKey="value" radius={[2, 2, 0, 0]}>
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
