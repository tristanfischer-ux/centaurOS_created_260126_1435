/**
 * @file kpi-cards.tsx — Six KPI cards for the Finance Hub dashboard
 *
 * @description Displays key financial metrics: Cash Position, Monthly Revenue,
 * Monthly Expenses, Net Margin, Outstanding Invoices, and Overdue Amount.
 * Follows the KpiCard pattern from Money Map summary-cards.tsx.
 */

'use client'

import {
  TrendingUp,
  TrendingDown,
  PoundSterling,
  Receipt,
  PiggyBank,
  BarChart3,
  FileText,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/types/payments'
import type { FinanceDashboardData, FinanceDashboardComparison } from '@/types/finance'
import { computeChange } from '@/lib/finance/aggregation'

// ============================================================
// KPI Card
// ============================================================

type AccentStyle = 'revenue' | 'cost' | 'margin' | 'neutral' | 'warning'

interface KpiCardProps {
  label: string
  value: string
  change: number | null
  icon: React.ComponentType<{ className?: string }>
  accent?: AccentStyle
  invertTrend?: boolean
}

const accentStyles = {
  revenue: 'border-l-4 border-l-status-success',
  cost: 'border-l-4 border-l-international-orange',
  margin: 'border-l-4 border-l-electric-blue',
  neutral: '',
  warning: 'border-l-4 border-l-warning',
} satisfies Record<AccentStyle, string>

function KpiCard({ label, value, change, icon: Icon, accent = 'neutral', invertTrend = false }: KpiCardProps) {
  const isPositiveChange = change !== null && change > 0
  const isGoodChange = invertTrend ? !isPositiveChange : isPositiveChange

  return (
    <Card className={cn('bg-background', accentStyles[accent])}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="text-2xl font-display font-semibold text-foreground tracking-tight">{value}</p>
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
            <span className={cn('text-xs font-medium', isGoodChange ? 'text-status-success' : 'text-destructive')}>
              {change > 0 ? '+' : ''}{change.toFixed(1)}% vs last month
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// KPI Cards Grid
// ============================================================

interface FinanceKpiCardsProps {
  data: FinanceDashboardData
  comparison: FinanceDashboardComparison
  className?: string
}

export function FinanceKpiCards({ data, comparison, className }: FinanceKpiCardsProps) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6', className)}>
      <KpiCard
        label="Cash Position"
        value={formatCurrency(data.cashPosition, data.currency)}
        change={computeChange(data.cashPosition, comparison.cashPosition)}
        icon={PoundSterling}
        accent="revenue"
      />
      <KpiCard
        label="Monthly Revenue"
        value={formatCurrency(data.monthlyRevenue, data.currency)}
        change={computeChange(data.monthlyRevenue, comparison.monthlyRevenue)}
        icon={BarChart3}
        accent="revenue"
      />
      <KpiCard
        label="Monthly Expenses"
        value={formatCurrency(data.monthlyExpenses, data.currency)}
        change={computeChange(data.monthlyExpenses, comparison.monthlyExpenses)}
        icon={Receipt}
        accent="cost"
        invertTrend
      />
      <KpiCard
        label="Net Margin"
        value={`${formatCurrency(data.netMargin, data.currency)} (${data.netMarginPct}%)`}
        change={null}
        icon={PiggyBank}
        accent="margin"
      />
      <KpiCard
        label="Outstanding Invoices"
        value={`${data.outstandingInvoicesCount} (${formatCurrency(data.outstandingInvoicesAmount, data.currency)})`}
        change={computeChange(data.outstandingInvoicesAmount, comparison.outstandingInvoicesAmount)}
        icon={FileText}
        accent="neutral"
      />
      <KpiCard
        label="Overdue Amount"
        value={formatCurrency(data.overdueAmount, data.currency)}
        change={null}
        icon={AlertTriangle}
        accent={data.overdueAmount > 0 ? 'warning' : 'neutral'}
      />
    </div>
  )
}
