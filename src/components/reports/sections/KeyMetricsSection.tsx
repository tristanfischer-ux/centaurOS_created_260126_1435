'use client'

/**
 * @file KeyMetricsSection.tsx
 *
 * @description Rich KPI metrics section with a hero metric callout for the
 * most important stat, and remaining metrics in visually rich cards with
 * sparkline trend visualization.
 */

import { useId } from 'react'
import { TrendingUp as TrendingUpIcon } from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'

import { Card, CardContent } from '@/components/ui/card'
import {
  ReportSectionHeader,
  SectionNarrativeIntro,
  TrendArrow,
  formatMetricValue,
} from '@/components/reports/report-visuals'

import type { KeyMetricsSectionData, KPIMetric, ReportTemplateId } from '@/lib/reports/report-document-types'

// DECISION: Recharts doesn't support CSS variables for fill/stroke, so HSL
// values are hardcoded here. Must stay in sync with design tokens.
const INTERNATIONAL_ORANGE = 'hsl(14, 100%, 50%)'
const MUTED = 'hsl(215, 16%, 47%)'

const SPARKLINE_COLORS: Record<'orange' | 'muted', { stroke: string; fill: string }> = {
  orange: { stroke: INTERNATIONAL_ORANGE, fill: INTERNATIONAL_ORANGE },
  muted: { stroke: MUTED, fill: MUTED },
}

function RechartsSparkline({
  data,
  color = 'orange',
  height = 40,
  className,
}: {
  data: number[]
  color?: 'orange' | 'muted'
  height?: number
  className?: string
}): React.JSX.Element {
  const uid = useId()
  const chartData = data.map((value, index) => ({ index, value }))
  const colors = SPARKLINE_COLORS[color]

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={`${uid}-sparkGrad-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.fill} stopOpacity={0.3} />
              <stop offset="95%" stopColor={colors.fill} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={colors.stroke}
            fill={`url(#${uid}-sparkGrad-${color})`}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

interface KeyMetricsSectionProps extends KeyMetricsSectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
  chartImageUrl?: string
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
            <RechartsSparkline
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
            <RechartsSparkline
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
  sectionNarrative,
  chartImageUrl,
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
      <SectionNarrativeIntro narrative={sectionNarrative} />

      {chartImageUrl && (
        <div className="rounded-xl overflow-hidden border bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={chartImageUrl} alt="" className="w-full h-auto" aria-hidden="true" />
        </div>
      )}

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
