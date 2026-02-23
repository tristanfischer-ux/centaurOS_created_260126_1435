/**
 * @file expense-breakdown-chart.tsx — Donut chart showing expenses by category
 *
 * @description Recharts PieChart with Pie component configured as a donut
 * (innerRadius/outerRadius). Each category gets a distinct color.
 */

'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ExpenseCategory } from '@/types/finance'

interface ExpenseBreakdownChartProps {
  data: ExpenseCategory[]
  className?: string
}

function formatLabel(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value)
}

function CustomTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ payload: ExpenseCategory }>
}) {
  if (!active || !payload || !payload[0]) return null
  const data = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-md">
      <div className="flex items-center gap-2 text-xs">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: data.color }} />
        <span className="font-medium text-foreground capitalize">{data.category}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {formatLabel(data.amount)} ({data.percentage}%)
      </p>
    </div>
  )
}

export function ExpenseBreakdownChart({ data, className }: ExpenseBreakdownChartProps) {
  if (data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Expense Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No expense data available yet. Add costs in Money Map.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Expense Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="amount"
              nameKey="category"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value: string) => (
                <span className="text-xs text-muted-foreground capitalize">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
