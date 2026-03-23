'use client'

/**
 * @file FinancialSnapshotSection.tsx
 *
 * @description Revenue, expenses, net position, budget health, and active
 * orders — giving stakeholders immediate visibility into financial performance.
 */

import { useId } from 'react'
import { PoundSterling, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  ReportSectionHeader,
  SectionNarrativeIntro,
  TrendArrow,
  ProgressBar,
  formatPence,
} from '@/components/reports/report-visuals'
import { calculatePercentChange, getTrendDirection } from '@/lib/reports/trends'

import type { FinancialSnapshotSectionData, ReportTemplateId } from '@/lib/reports/report-document-types'

// DECISION: Recharts doesn't support CSS variables for fill/stroke, so HSL
// values are hardcoded here. Must stay in sync with design tokens.
const STATUS_SUCCESS = 'hsl(142, 72%, 29%)'
const DESTRUCTIVE = 'hsl(0, 84%, 60%)'
const AXIS_TICK_COLOR = 'hsl(215, 16%, 47%)'
const GRID_COLOR = '#e2e8f0'
const TOOLTIP_BORDER = 'hsl(214, 32%, 91%)'

interface FinancialSnapshotSectionProps extends FinancialSnapshotSectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
}

export function FinancialSnapshotSection({
  periodRevenue,
  previousPeriodRevenue,
  periodExpenses,
  previousPeriodExpenses,
  netPosition,
  previousNetPosition,
  activeOrderCount,
  activeOrdersByStatus,
  budgetHealth,
  overBudgetCount,
  sectionNarrative,
  trendData,
  chartImageUrl,
  templateId,
  sectionNumber,
}: FinancialSnapshotSectionProps): React.JSX.Element {
  const uid = useId()
  const revenueChange = calculatePercentChange(periodRevenue, previousPeriodRevenue)
  const expenseChange = calculatePercentChange(periodExpenses, previousPeriodExpenses)
  const netChange = calculatePercentChange(netPosition, previousNetPosition)

  return (
    <div className="space-y-8">
      <ReportSectionHeader
        title="Financial Snapshot"
        icon={PoundSterling}
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

      {/* Revenue vs Expenses trend chart */}
      {trendData && trendData.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <defs>
                    <linearGradient id={`${uid}-revenueGradient`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={STATUS_SUCCESS} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={STATUS_SUCCESS} stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id={`${uid}-expensesGradient`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={DESTRUCTIVE} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={DESTRUCTIVE} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12, fill: AXIS_TICK_COLOR }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: AXIS_TICK_COLOR }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                    tickFormatter={(v: number) => `£${(v / 100).toLocaleString()}`}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: `1px solid ${TOOLTIP_BORDER}`,
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
                      fontSize: '13px',
                    }}
                    formatter={(value?: number, name?: string) => [
                      value != null ? `£${(value / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}` : '£0.00',
                      name ? name.charAt(0).toUpperCase() + name.slice(1) : '',
                    ]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke={STATUS_SUCCESS}
                    fill={`url(#${uid}-revenueGradient)`}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    name="Expenses"
                    stroke={DESTRUCTIVE}
                    fill={`url(#${uid}-expensesGradient)`}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="text-xs">
          {activeOrderCount} Active Order{activeOrderCount !== 1 ? 's' : ''}
        </Badge>
        {overBudgetCount > 0 && (
          <Badge variant="destructive" className="text-xs">
            {overBudgetCount} Over Budget
          </Badge>
        )}
      </div>

      {/* Hero: Revenue / Expenses / Net */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-status-success">
          <CardContent className="p-5 space-y-1">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Revenue
            </p>
            <p className="text-2xl font-bold font-display text-foreground">
              {formatPence(periodRevenue)}
            </p>
            <TrendArrow
              trend={getTrendDirection(periodRevenue - previousPeriodRevenue, periodRevenue * 0.02)}
              changePercent={Math.round(revenueChange)}
            />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-destructive">
          <CardContent className="p-5 space-y-1">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Expenses
            </p>
            <p className="text-2xl font-bold font-display text-foreground">
              {formatPence(periodExpenses)}
            </p>
            <TrendArrow
              trend={getTrendDirection(periodExpenses - previousPeriodExpenses, periodExpenses * 0.02)}
              changePercent={Math.round(expenseChange)}
            />
          </CardContent>
        </Card>

        <Card className={cn(
          'border-l-4',
          netPosition >= 0 ? 'border-l-status-success' : 'border-l-destructive',
        )}>
          <CardContent className="p-5 space-y-1">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Net Position
            </p>
            <p className={cn(
              'text-2xl font-bold font-display',
              netPosition >= 0 ? 'text-status-success' : 'text-destructive',
            )}>
              {formatPence(netPosition)}
            </p>
            <TrendArrow
              trend={getTrendDirection(netPosition - previousNetPosition, Math.abs(netPosition) * 0.02)}
              changePercent={Math.round(netChange)}
            />
          </CardContent>
        </Card>
      </div>

      {/* Active orders by status */}
      {activeOrdersByStatus.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Active Orders
          </h3>
          <div className="flex flex-wrap gap-3">
            {activeOrdersByStatus.map(({ status, count }) => (
              <div key={status} className="flex items-center gap-2 text-sm">
                <span className="inline-block h-2 w-2 rounded-full bg-international-orange" />
                <span className="text-muted-foreground capitalize">{status.replace(/_/g, ' ')}</span>
                <span className="font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Budget health */}
      {budgetHealth.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Budget Health
          </h3>
          <div className="space-y-2">
            {budgetHealth.map((row) => {
              const isOver = row.variance < 0
              const usagePercent = row.budgeted > 0
                ? Math.min(100, Math.round((row.actual / row.budgeted) * 100))
                : 0

              return (
                <Card key={row.category}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium capitalize">{row.category}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatPence(row.actual)}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span>{formatPence(row.budgeted)}</span>
                        {isOver && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            Over
                          </Badge>
                        )}
                      </div>
                    </div>
                    <ProgressBar
                      value={usagePercent}
                      color={isOver ? 'destructive' : usagePercent > 80 ? 'warning' : 'success'}
                    />
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
