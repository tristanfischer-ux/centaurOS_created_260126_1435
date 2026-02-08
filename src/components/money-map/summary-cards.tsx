'use client'

/**
 * MoneyMapSummaryCards — KPI cards showing Total Revenue, Total Costs,
 * and Net Margin with optional period-over-period comparison.
 *
 * @component
 * @example
 * <MoneyMapSummaryCards summary={data.summary} previousSummary={snapshot?.summary} />
 */

import { TrendingUp, TrendingDown, DollarSign, Receipt, PiggyBank, BarChart3, Layers } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import type { MoneyMapSummary } from '@/types/money-map'

interface MoneyMapSummaryCardsProps {
  /** Current summary data */
  summary: MoneyMapSummary
  /** Previous period summary for comparison (from snapshot) */
  previousSummary?: MoneyMapSummary | null
  /** Additional CSS classes */
  className?: string
}

/**
 * Format currency for display.
 *
 * @param value - Numeric amount
 * @returns Formatted string like "£12,500"
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Compute percentage change between current and previous values.
 *
 * @param current - Current period value
 * @param previous - Previous period value
 * @returns Percentage change or null if no previous data
 */
function computeChange(current: number, previous?: number): number | null {
  if (previous === undefined || previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

interface KpiCardProps {
  label: string
  value: string
  change: number | null
  icon: React.ComponentType<{ className?: string }>
  accent?: 'revenue' | 'cost' | 'margin' | 'neutral'
  /** When true, a positive change is bad (e.g., costs going up) */
  invertTrend?: boolean
}

function KpiCard({ label, value, change, icon: Icon, accent = 'neutral', invertTrend = false }: KpiCardProps): React.ReactElement {
  const isPositiveChange = change !== null && change > 0
  const isGoodChange = invertTrend ? !isPositiveChange : isPositiveChange

  const accentStyles = {
    revenue: 'border-l-4 border-l-status-success',
    cost: 'border-l-4 border-l-international-orange',
    margin: 'border-l-4 border-l-electric-blue',
    neutral: '',
  } satisfies Record<string, string>

  return (
    <Card className={cn('bg-background', accentStyles[accent])}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              {label}
            </p>
            <p className="text-2xl font-display font-semibold text-foreground tracking-tight">
              {value}
            </p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
        {change !== null && (
          <div className="mt-3 flex items-center gap-1.5">
            {isGoodChange ? (
              <TrendingUp className="h-3.5 w-3.5 text-status-success" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
            )}
            <span
              className={cn(
                'text-xs font-medium',
                isGoodChange ? 'text-status-success' : 'text-destructive'
              )}
            >
              {change > 0 ? '+' : ''}{change.toFixed(1)}% vs previous
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function MoneyMapSummaryCards({
  summary,
  previousSummary,
  className,
}: MoneyMapSummaryCardsProps): React.ReactElement {
  const revenueChange = computeChange(summary.total_revenue, previousSummary?.total_revenue)
  const costChange = computeChange(summary.total_costs, previousSummary?.total_costs)
  const marginChange = computeChange(summary.net_margin, previousSummary?.net_margin)

  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6', className)}>
      <KpiCard
        label="Monthly Revenue"
        value={formatCurrency(summary.total_revenue)}
        change={revenueChange}
        icon={DollarSign}
        accent="revenue"
      />
      <KpiCard
        label="Total Costs"
        value={formatCurrency(summary.total_costs)}
        change={costChange}
        icon={Receipt}
        accent="cost"
        invertTrend
      />
      <KpiCard
        label="Net Margin"
        value={formatCurrency(summary.net_margin)}
        change={marginChange}
        icon={PiggyBank}
        accent="margin"
      />
      <KpiCard
        label="Margin %"
        value={`${summary.net_margin_pct.toFixed(1)}%`}
        change={null}
        icon={BarChart3}
        accent="neutral"
      />
    </div>
  )
}
