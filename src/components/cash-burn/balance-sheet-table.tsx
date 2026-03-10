'use client'

import { useState, useMemo } from 'react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/types/payments'
import { buildBalanceSheet } from '@/lib/cash-burn/pnl-builder'
import type { CashOutItem, CashInItem, BalanceSheet } from '@/types/cash-burn'

// ============================================================
// Types
// ============================================================

interface BalanceSheetTableProps {
  cashOutItems: CashOutItem[]
  cashInItems: CashInItem[]
  openingBalance: number
  weeks?: number
  /** When provided, the table uses this week index (controlled mode) and hides its own slider */
  controlledWeekIndex?: number
}

// ============================================================
// Row rendering helper
// ============================================================

interface SectionRow {
  label: string
  value: number
  isBold?: boolean
}

function renderSection(title: string, rows: SectionRow[]) {
  return (
    <>
      <tr className="border-b border-border bg-muted/30">
        <td colSpan={2} className="py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.label} className="border-b border-border/50">
          <td className={`py-2 px-3 ${row.isBold ? 'font-semibold text-foreground' : 'text-foreground pl-6'}`}>
            {row.label}
          </td>
          <td
            className={`py-2 px-3 text-right tabular-nums ${
              row.isBold ? 'font-semibold text-foreground' : 'text-foreground'
            } ${row.value < 0 ? 'text-destructive' : ''}`}
          >
            {formatCurrency(row.value)}
          </td>
        </tr>
      ))}
    </>
  )
}

// ============================================================
// Component
// ============================================================

export function BalanceSheetTable({
  cashOutItems,
  cashInItems,
  openingBalance,
  weeks = 52,
  controlledWeekIndex,
}: BalanceSheetTableProps) {
  const [internalWeekIndex, setInternalWeekIndex] = useState(0)
  // INTENT: When controlledWeekIndex is provided (from parent slider), use it.
  // Otherwise fall back to internal state with own slider.
  const weekIndex = controlledWeekIndex ?? internalWeekIndex
  const isControlled = controlledWeekIndex !== undefined

  const asOfDate = useMemo(() => {
    const now = new Date()
    const d = new Date(now)
    d.setDate(d.getDate() + weekIndex * 7)
    return d
  }, [weekIndex])

  const sheet: BalanceSheet = useMemo(
    () => buildBalanceSheet(cashOutItems, cashInItems, openingBalance, asOfDate),
    [cashOutItems, cashInItems, openingBalance, asOfDate]
  )

  const weekLabel = weekIndex === 0 ? 'Today' : `Week ${weekIndex}`

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Balance Sheet</h3>
          <span className="text-sm font-medium text-international-orange">{weekLabel}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Week selector — hidden when parent controls the week index */}
        {!isControlled && (
          <div className="space-y-1.5">
            <label htmlFor="bs-week-slider" className="text-sm font-medium text-foreground">
              As of: <span className="text-international-orange">{weekLabel}</span>
            </label>
            <input
              id="bs-week-slider"
              type="range"
              aria-label="Balance sheet week selector"
              min={0}
              max={weeks - 1}
              step={1}
              value={weekIndex}
              onChange={(e) => setInternalWeekIndex(Number(e.target.value))}
              className="w-full accent-international-orange"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Today</span>
              <span>Week {Math.floor(weeks / 2)}</span>
              <span>Week {weeks - 1}</span>
            </div>
          </div>
        )}

        {/* Balance sheet table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {renderSection('Assets', [
                { label: 'Cash', value: sheet.cash },
                { label: 'Equipment', value: sheet.equipment },
                { label: 'Total Assets', value: sheet.totalAssets, isBold: true },
              ])}
              {renderSection('Liabilities', [
                { label: 'Loans', value: sheet.loans },
                { label: 'Total Liabilities', value: sheet.totalLiabilities, isBold: true },
              ])}
              {renderSection('Equity', [
                { label: 'Invested Capital', value: sheet.equityInvested },
                { label: 'Retained Earnings', value: sheet.retainedEarnings },
                { label: 'Total Equity', value: sheet.totalEquity, isBold: true },
              ])}
            </tbody>
          </table>
        </div>

        {/* Accounting identity check */}
        <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border">
          Assets ({formatCurrency(sheet.totalAssets)}) = Liabilities ({formatCurrency(sheet.totalLiabilities)}) + Equity ({formatCurrency(sheet.totalEquity)})
        </div>
      </CardContent>
    </Card>
  )
}
