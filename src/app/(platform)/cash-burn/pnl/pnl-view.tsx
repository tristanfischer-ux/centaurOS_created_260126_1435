/**
 * @file pnl-view.tsx — Client component for P&L page
 *
 * @description Income Statement and Balance Sheet views derived from
 * cash flow data. Tabs toggle between the two, with period toggles.
 */

'use client'

import { useState, useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
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

  // Balance sheet at current date
  const balanceSheet = useMemo(
    () => buildBalanceSheet(cashOut, cashIn, openingBalance, new Date()),
    [cashOut, cashIn, openingBalance]
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

          {/* Waterfall Chart */}
          <WaterfallChart data={totals} />

          {/* Income Statement Table */}
          <IncomeStatementTable rows={incomeStatementRows} periodType={periodType} />

          {/* Disclaimer */}
          <p className="text-xs text-muted-foreground italic">
            Projected from cash flow data. For audited financials, connect your accounting software.
          </p>
        </TabsContent>

        <TabsContent value="balance-sheet" className="space-y-6 mt-6">
          {/* Balance Sheet Chart */}
          <HorizontalBar data={balanceSheet} />

          {/* Balance Sheet Table with slider */}
          <BalanceSheetTable
            cashOutItems={cashOut}
            cashInItems={cashIn}
            openingBalance={openingBalance}
            weeks={WEEKS}
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
