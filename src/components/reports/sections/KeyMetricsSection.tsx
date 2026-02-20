'use client'

/**
 * @file KeyMetricsSection.tsx
 *
 * @description Rich KPI metrics section with a hero metric callout for the
 * most important stat, and remaining metrics in visually rich cards with
 * sparkline trend visualization.
 */

import { TrendingUp as TrendingUpIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  ReportSectionHeader,
  TrendArrow,
  Sparkline,
  formatMetricValue,
} from '@/components/reports/report-visuals'

import type { KeyMetricsSectionData, KPIMetric, ReportTemplateId } from '@/lib/reports/report-document-types'

interface KeyMetricsSectionProps extends KeyMetricsSectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
}

function MetricCard({ metric }: { metric: KPIMetric }): React.JSX.Element {
  // INTENT: Generate synthetic sparkline data from the metric's change percent
  // to give a visual sense of trend direction. Real sparkline data would come
  // from the generator if available.
  const sparklineData = metric.sparklineData ?? generateSyntheticSparkline(metric)

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {metric.label}
        </p>

        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <span className="text-3xl font-display font-bold text-foreground">
              {formatMetricValue(metric.value, metric.format)}
            </span>
            <div className="mt-1.5 flex items-center gap-2">
              <TrendArrow
                trend={metric.trend}
                changePercent={metric.changePercent}
              />
              <span className="text-xs text-muted-foreground">
                vs {formatMetricValue(metric.previousValue, metric.format)}
              </span>
            </div>
          </div>

          {/* Mini sparkline */}
          {sparklineData.length > 0 && (
            <Sparkline
              data={sparklineData}
              color={metric.trend === 'down' ? 'muted' : 'orange'}
              height={40}
              className="w-20 shrink-0"
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function HeroMetric({ metric }: { metric: KPIMetric }): React.JSX.Element {
  const sparklineData = metric.sparklineData ?? generateSyntheticSparkline(metric)

  return (
    <Card className="overflow-hidden border-2 border-international-orange/20 bg-international-orange/[0.03]">
      <CardContent className="p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
              {metric.label}
            </p>
            <span className="text-5xl font-display font-bold text-foreground leading-none">
              {formatMetricValue(metric.value, metric.format)}
            </span>
            <div className="mt-3 flex items-center gap-3">
              <TrendArrow
                trend={metric.trend}
                changePercent={metric.changePercent}
                className="text-sm"
              />
              <span className="text-sm text-muted-foreground">
                from {formatMetricValue(metric.previousValue, metric.format)} last period
              </span>
            </div>
          </div>

          {sparklineData.length > 0 && (
            <Sparkline
              data={sparklineData}
              color={metric.trend === 'down' ? 'muted' : 'orange'}
              height={56}
              className="w-32 shrink-0"
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// INTENT: Generate a plausible sparkline from a metric's current and previous
// values when real historical data isn't available. The shape conveys the
// general trend direction to maintain visual consistency.
function generateSyntheticSparkline(metric: KPIMetric): number[] {
  const points = 7
  const start = metric.previousValue
  const end = metric.value
  const range = end - start
  const data: number[] = []

  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1)
    const base = start + range * progress
    const jitter = range * 0.1 * (Math.sin(i * 2.1) + Math.cos(i * 1.3))
    data.push(Math.max(0, base + jitter))
  }

  return data
}

export function KeyMetricsSection({
  metrics,
  templateId,
  sectionNumber,
}: KeyMetricsSectionProps): React.JSX.Element {
  const [heroMetric, ...remainingMetrics] = metrics

  return (
    <section className="space-y-8">
      <ReportSectionHeader
        title="Key Metrics"
        icon={TrendingUpIcon}
        templateId={templateId}
        sectionNumber={sectionNumber}
      />

      {/* Hero metric — full width */}
      {heroMetric && <HeroMetric metric={heroMetric} />}

      {/* Remaining metrics — 2-column grid */}
      {remainingMetrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {remainingMetrics.map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </div>
      )}
    </section>
  )
}
