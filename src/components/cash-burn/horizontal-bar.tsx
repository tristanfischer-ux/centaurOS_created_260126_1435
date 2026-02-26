'use client'

import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { chartColors, moneyMapColors } from '@/lib/chart-colors'
import { formatCurrency } from '@/types/payments'
import type { BalanceSheet } from '@/types/cash-burn'

// Semantic colors from centralised palette
const COLOR_SUCCESS = chartColors[2]        // Emerald — assets / equity
const COLOR_WARNING = chartColors[3]        // Amber — liabilities
const COLOR_INFO = chartColors[1]           // Electric Blue — invested capital

// ============================================================
// Types
// ============================================================

interface HorizontalBarProps {
  data: BalanceSheet
}

interface BarRow {
  label: string
  value: number
  color: string
  maxValue: number
}

// ============================================================
// Component
// ============================================================

export function HorizontalBar({ data }: HorizontalBarProps) {
  const maxValue = Math.max(
    data.totalAssets,
    data.totalLiabilities,
    data.totalEquity,
    1 // avoid division by zero
  )

  const rows: BarRow[] = [
    { label: 'Cash', value: data.cash, color: COLOR_SUCCESS, maxValue },
    { label: 'Equipment', value: data.equipment, color: COLOR_SUCCESS, maxValue },
    { label: 'Total Assets', value: data.totalAssets, color: COLOR_SUCCESS, maxValue },
    { label: 'Loans', value: data.loans, color: COLOR_WARNING, maxValue },
    { label: 'Total Liabilities', value: data.totalLiabilities, color: COLOR_WARNING, maxValue },
    { label: 'Invested Capital', value: data.equityInvested, color: COLOR_INFO, maxValue },
    { label: 'Retained Earnings', value: data.retainedEarnings, color: COLOR_INFO, maxValue },
    { label: 'Total Equity', value: data.totalEquity, color: COLOR_INFO, maxValue },
  ]

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-lg font-semibold text-foreground">Balance Sheet Overview</h3>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => {
          const widthPct = maxValue > 0 ? Math.max(0, Math.min(100, (Math.abs(row.value) / maxValue) * 100)) : 0
          const isTotalRow = row.label.startsWith('Total')
          const isNegative = row.value < 0

          return (
            <div key={row.label} className={isTotalRow ? 'pt-1' : ''}>
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-sm ${
                    isTotalRow ? 'font-semibold text-foreground' : 'text-foreground'
                  }`}
                >
                  {row.label}
                </span>
                <span
                  className={`text-sm tabular-nums ${
                    isNegative ? 'text-destructive' : 'text-foreground'
                  } ${isTotalRow ? 'font-semibold' : ''}`}
                >
                  {formatCurrency(row.value)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: isNegative ? moneyMapColors.loss : row.color,
                  }}
                />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
