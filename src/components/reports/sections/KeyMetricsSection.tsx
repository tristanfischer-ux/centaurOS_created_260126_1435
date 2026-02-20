'use client'

import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import type { KeyMetricsSectionData, KPIMetric } from '@/lib/reports/report-document-types'

type KeyMetricsSectionProps = KeyMetricsSectionData

const TREND_ICON = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  stable: Minus,
} as const

const TREND_COLOR = {
  up: 'text-status-success',
  down: 'text-destructive',
  stable: 'text-muted-foreground',
} as const

function formatMetricValue(value: number, format: KPIMetric['format']): string {
  switch (format) {
    case 'percentage':
      return `${Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)}%`
    case 'decimal':
      return Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(value)
    case 'number':
    default:
      return Intl.NumberFormat('en-US').format(value)
  }
}

export function KeyMetricsSection({ metrics }: KeyMetricsSectionProps) {
  return (
    <section className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="h-6 w-1 rounded-full bg-international-orange" />
        <h2 className="text-2xl font-display font-bold text-foreground">
          Key Metrics
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {metrics.map((metric) => {
          const TrendIcon = TREND_ICON[metric.trend]
          const trendColor = TREND_COLOR[metric.trend]

          return (
            <Card key={metric.label}>
              <CardContent className="p-6">
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  {metric.label}
                </p>

                <div className="mt-3 flex items-end gap-3">
                  <span className="text-4xl font-display font-bold text-foreground">
                    {formatMetricValue(metric.value, metric.format)}
                  </span>

                  <span className={cn('mb-1 flex items-center gap-0.5 text-sm font-medium', trendColor)}>
                    <TrendIcon className="h-4 w-4" />
                    {Math.abs(metric.changePercent).toFixed(1)}%
                  </span>
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  vs {formatMetricValue(metric.previousValue, metric.format)} last period
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
