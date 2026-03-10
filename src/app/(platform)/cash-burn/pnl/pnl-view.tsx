/**
 * @file pnl-view.tsx — Client component for P&L page
 *
 * @description Income Statement and Balance Sheet views derived from
 * cash flow data. Tabs toggle between the two, with period toggles.
 */

'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { IncomeStatementTable } from '@/components/cash-burn/income-statement-table'
import { BalanceSheetTable } from '@/components/cash-burn/balance-sheet-table'
import { WaterfallChart } from '@/components/cash-burn/waterfall-chart'
import { HorizontalBar } from '@/components/cash-burn/horizontal-bar'
import { buildIncomeStatement, buildBalanceSheet } from '@/lib/cash-burn/pnl-builder'
import type { CashOutItem, CashInItem, IncomeStatementRow } from '@/types/cash-burn'

interface PnlViewProps {
  initialData: {
    cashOut: CashOutItem[]
    cashIn: CashInItem[]
    openingBalance: number
  } | null
  hasError: boolean
}

const WEEKS = 52

export function PnlView({ initialData, hasError }: PnlViewProps) {
  const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('monthly')
  const [balanceSheetWeek, setBalanceSheetWeek] = useState(0)

  const cashOut = initialData?.cashOut ?? []
  const cashIn = initialData?.cashIn ?? []
  const openingBalance = initialData?.openingBalance ?? 0

  // Build income statement
  const incomeStatementRows = useMemo(
    () => buildIncomeStatement(cashOut, cashIn, WEEKS, periodType),
    [cashOut, cashIn, periodType]
  )

  // Aggregate totals for waterfall chart
  const totals: IncomeStatementRow = useMemo(() => {
    return incomeStatementRows.reduce(
      (acc, row) => ({
        period: 'Total',
        revenue: acc.revenue + row.revenue,
        cogs: acc.cogs + row.cogs,
        grossProfit: acc.grossProfit + row.grossProfit,
        opex: acc.opex + row.opex,
        rnd: acc.rnd + row.rnd,
        ebitda: acc.ebitda + row.ebitda,
      }),
      { period: 'Total', revenue: 0, cogs: 0, grossProfit: 0, opex: 0, rnd: 0, ebitda: 0 }
    )
  }, [incomeStatementRows])

  // Balance sheet at selected week
  const balanceSheetDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + balanceSheetWeek * 7)
    return d
  }, [balanceSheetWeek])

  const balanceSheet = useMemo(
    () => buildBalanceSheet(cashOut, cashIn, openingBalance, balanceSheetDate),
    [cashOut, cashIn, openingBalance, balanceSheetDate]
  )

  if (hasError || !initialData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">P&L</h1>
            <p className="text-sm text-muted-foreground">Projected financial statements</p>
          </div>
        </div>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              Unable to load P&L data. Please try again.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
          <BarChart3 className="h-5 w-5 text-international-orange" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">P&L</h1>
          <p className="text-sm text-muted-foreground">
            Income Statement and Balance Sheet projected from cash flow data
          </p>
        </div>
      </div>

      {cashOut.length === 0 && cashIn.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <div className="flex justify-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No costs or revenue entered yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Set up your costs and revenue to see projected P&L statements.
              </p>
            </div>
            <div className="flex justify-center gap-3">
              <Button asChild variant="default" size="sm">
                <Link href="/cash-burn/cash-out">Set up costs</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/cash-burn/cash-in">Add revenue</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="income-statement">
        <TabsList>
          <TabsTrigger value="income-statement">Income Statement</TabsTrigger>
          <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
        </TabsList>

        <TabsContent value="income-statement" className="space-y-6 mt-6">
          {/* Period toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Period:</span>
            <Button
              variant={periodType === 'weekly' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriodType('weekly')}
            >
              Weekly
            </Button>
            <Button
              variant={periodType === 'monthly' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriodType('monthly')}
            >
              Monthly
            </Button>
          </div>

          <ErrorBoundary>
            {/* Waterfall Chart */}
            <WaterfallChart data={totals} />
          </ErrorBoundary>

          {/* Income Statement Table */}
          <IncomeStatementTable rows={incomeStatementRows} periodType={periodType} />

          {/* Disclaimer */}
          <p className="text-xs text-muted-foreground italic">
            Projected from cash flow data. For audited financials, connect your accounting software.
          </p>
        </TabsContent>

        <TabsContent value="balance-sheet" className="space-y-6 mt-6">
          {/* Balance Sheet week selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                Balance Sheet as of: <span className="text-international-orange">
                  {balanceSheetDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </label>
              <span className="text-xs text-muted-foreground">Week {balanceSheetWeek}</span>
            </div>
            <input
              type="range"
              min={0}
              max={52}
              value={balanceSheetWeek}
              onChange={(e) => setBalanceSheetWeek(Number(e.target.value))}
              className="w-full accent-international-orange"
            />
          </div>

          <ErrorBoundary>
            {/* Balance Sheet Chart */}
            <HorizontalBar data={balanceSheet} />
          </ErrorBoundary>

          {/* Balance Sheet Table with slider */}
          <BalanceSheetTable
            cashOutItems={cashOut}
            cashInItems={cashIn}
            openingBalance={openingBalance}
            weeks={WEEKS}
            controlledWeekIndex={balanceSheetWeek}
          />

          {/* Disclaimer */}
          <p className="text-xs text-muted-foreground italic">
            Projected from cash flow data. For audited financials, connect your accounting software.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
