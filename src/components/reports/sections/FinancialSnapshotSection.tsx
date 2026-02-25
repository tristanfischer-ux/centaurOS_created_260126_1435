'use client'

/**
 * @file FinancialSnapshotSection.tsx
 *
 * @description Revenue, expenses, net position, budget health, and active
 * orders — giving stakeholders immediate visibility into financial performance.
 */

import { PoundSterling, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'

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
  templateId,
  sectionNumber,
}: FinancialSnapshotSectionProps): React.JSX.Element {
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
      <div className="grid grid-cols-3 gap-4">
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
