/**
 * @file runway-card.tsx — Runway and burn rate display
 *
 * @description Shows months of runway remaining, monthly burn rate,
 * and a visual progress indicator.
 */

'use client'

import { TrendingUp, TrendingDown, Infinity } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/types/payments'
import type { RunwayResult } from '@/lib/finance/forecast'

interface RunwayCardProps {
  runway: RunwayResult
  currency?: string
  className?: string
}

function getRunwayColor(months: number | null): string {
  if (months === null) return 'text-status-success' // sustainable
  if (months >= 12) return 'text-status-success'
  if (months >= 6) return 'text-warning'
  return 'text-destructive'
}

function getRunwayBg(months: number | null): string {
  if (months === null) return 'bg-success/10'
  if (months >= 12) return 'bg-success/10'
  if (months >= 6) return 'bg-warning/10'
  return 'bg-destructive/10'
}

export function RunwayCard({ runway, currency = 'GBP', className }: RunwayCardProps) {
  const isSustainable = runway.monthsRemaining === null

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Runway</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Runway months */}
        <div className={`rounded-lg p-4 ${getRunwayBg(runway.monthsRemaining)}`}>
          <div className="flex items-center gap-2">
            {isSustainable ? (
              <Infinity className={`h-5 w-5 ${getRunwayColor(runway.monthsRemaining)}`} />
            ) : (
              <span className={`text-3xl font-display font-bold ${getRunwayColor(runway.monthsRemaining)}`}>
                {runway.monthsRemaining}
              </span>
            )}
            <span className={`text-sm font-medium ${getRunwayColor(runway.monthsRemaining)}`}>
              {isSustainable ? 'Sustainable' : `month${runway.monthsRemaining !== 1 ? 's' : ''} remaining`}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {isSustainable
              ? 'Revenue covers costs — your balance is growing.'
              : 'At current burn rate, before your balance reaches zero.'}
          </p>
        </div>

        {/* Breakdown */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-status-success" />
              <span className="text-muted-foreground">Monthly revenue</span>
            </div>
            <span className="font-medium">{formatCurrency(runway.totalMonthlyRevenue, currency)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-muted-foreground">Monthly costs</span>
            </div>
            <span className="font-medium">{formatCurrency(runway.totalMonthlyCosts, currency)}</span>
          </div>
          <div className="border-t border-border pt-2 flex items-center justify-between text-sm">
            <span className="font-medium">Net monthly</span>
            <span className={`font-semibold ${runway.burnRate >= 0 ? 'text-status-success' : 'text-destructive'}`}>
              {runway.burnRate >= 0 ? '+' : ''}{formatCurrency(Math.abs(runway.burnRate), currency)}
              {runway.burnRate < 0 && '/mo burn'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
