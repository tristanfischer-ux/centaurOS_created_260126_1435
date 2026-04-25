'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'

/**
 * Daily-cost row passed from the server page to the chart.
 *
 * @property date — ISO `YYYY-MM-DD` for the day.
 * @property cost — Day total cost in GBP.
 */
export interface DailyCost {
  date: string
  cost: number
}

interface CostDashboardViewProps {
  daily: DailyCost[]
  /** Formatter for axis / tooltip values, supplied by the server page so the
   * client can use the same compact GBP format without duplicating the
   * Intl.NumberFormat config. */
  formatLabel: (n: number) => string
}

/**
 * Cost dashboard interactive view — chart + refresh button.
 *
 * @description Lifted into a client component because Recharts hooks into
 * window/ResizeObserver and the refresh button needs `router.refresh()`.
 * Everything else on the page stays server-rendered.
 */
export function CostDashboardView({ daily, formatLabel }: CostDashboardViewProps) {
  const router = useRouter()
  const [isRefreshing, startRefresh] = useTransition()

  const chartData = daily.map((d) => ({
    // Display label like "23 Apr" — keeps axis short.
    label: new Date(d.date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    }),
    isoDate: d.date,
    cost: Number(d.cost.toFixed(2)),
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => startRefresh(() => router.refresh())}
          disabled={isRefreshing}
          className="text-muted-foreground"
        >
          <RefreshCw
            className={isRefreshing ? 'h-4 w-4 mr-2 animate-spin' : 'h-4 w-4 mr-2'}
          />
          {isRefreshing ? 'Refreshing' : 'Refresh'}
        </Button>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'currentColor' }}
              tickLine={false}
              axisLine={false}
              className="text-muted-foreground"
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'currentColor' }}
              tickLine={false}
              axisLine={false}
              className="text-muted-foreground"
              tickFormatter={(v) => formatLabel(Number(v))}
              width={70}
            />
            <Tooltip
              cursor={{ className: 'fill-muted/40' }}
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '0.5rem',
                color: 'hsl(var(--foreground))',
                fontSize: '0.75rem',
              }}
              formatter={(value) => [formatLabel(Number(value)), 'Cost'] as [string, string]}
              labelFormatter={((label: unknown, payload: unknown) => {
                const arr = payload as Array<{ payload?: { isoDate?: string } }> | undefined
                const iso = arr?.[0]?.payload?.isoDate
                return iso ?? String(label ?? '')
              }) as never}
            />
            <Bar dataKey="cost" radius={[4, 4, 0, 0]} className="fill-international-orange" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
