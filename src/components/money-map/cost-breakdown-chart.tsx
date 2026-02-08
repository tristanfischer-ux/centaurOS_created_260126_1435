'use client'

/**
 * CostBreakdownChart — Horizontal stacked bar chart showing costs by type
 * (direct / shared / overhead) or by category (personnel / infrastructure / etc.).
 *
 * @component
 * @example
 * <CostBreakdownChart costItems={data.cost_items} />
 */

import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { moneyMapColors, getChartColor } from '@/lib/chart-colors'

import type { CostItem, CostType, CostCategory } from '@/types/money-map'
import { COST_TYPE_LABELS, COST_CATEGORY_LABELS } from '@/types/money-map'
import { normaliseToMonthly } from '@/lib/money-map/allocation'

interface CostBreakdownChartProps {
  /** Active cost items */
  costItems: CostItem[]
  /** Additional CSS classes */
  className?: string
}

type ViewMode = 'type' | 'category'

interface ChartItem {
  name: string
  value: number
  color: string
}

const TYPE_COLORS: Record<CostType, string> = {
  direct: moneyMapColors.directCost,
  indirect: moneyMapColors.indirectCost,
  overhead: moneyMapColors.overhead,
}

const CATEGORY_COLORS: Record<CostCategory, string> = {
  personnel: getChartColor(0),
  infrastructure: getChartColor(1),
  marketing: getChartColor(2),
  operations: getChartColor(3),
  other: getChartColor(4),
}

/**
 * Format currency for tooltip.
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value)
}

export function CostBreakdownChart({
  costItems,
  className,
}: CostBreakdownChartProps): React.ReactElement {
  const [viewMode, setViewMode] = useState<ViewMode>('type')

  const chartData = useMemo((): ChartItem[] => {
    if (viewMode === 'type') {
      const groups = new Map<CostType, number>()
      for (const item of costItems) {
        const monthly = normaliseToMonthly(item.amount, item.period)
        groups.set(item.cost_type, (groups.get(item.cost_type) ?? 0) + monthly)
      }
      return Array.from(groups.entries())
        .map(([type, value]) => ({
          name: COST_TYPE_LABELS[type],
          value: Math.round(value * 100) / 100,
          color: TYPE_COLORS[type],
        }))
        .sort((a, b) => b.value - a.value)
    }

    // By category
    const groups = new Map<CostCategory, number>()
    for (const item of costItems) {
      const monthly = normaliseToMonthly(item.amount, item.period)
      groups.set(item.category, (groups.get(item.category) ?? 0) + monthly)
    }
    return Array.from(groups.entries())
      .map(([cat, value]) => ({
        name: COST_CATEGORY_LABELS[cat],
        value: Math.round(value * 100) / 100,
        color: CATEGORY_COLORS[cat],
      }))
      .sort((a, b) => b.value - a.value)
  }, [costItems, viewMode])

  if (costItems.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg font-display">Cost Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No cost items configured yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-display">Cost Breakdown</CardTitle>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="type">By Type</TabsTrigger>
            <TabsTrigger value="category">By Category</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(chartData.length * 48, 120)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 80, bottom: 0, left: 0 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fontSize: 13, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ payload }) => {
                if (!payload || payload.length === 0) return null
                const item = payload[0]
                return (
                  <div className="bg-background border rounded-lg shadow-lg px-3 py-2">
                    <p className="text-sm font-medium text-foreground">{item?.payload?.name}</p>
                    <p className="text-sm text-muted-foreground">{formatCurrency(Number(item?.value ?? 0))}/mo</p>
                  </div>
                )
              }}
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
              {chartData.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t">
          {chartData.map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <div className="h-2.5 w-8 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-xs text-muted-foreground">{item.name}</span>
              <span className="text-xs font-medium text-foreground">{formatCurrency(item.value)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
