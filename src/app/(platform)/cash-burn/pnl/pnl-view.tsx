/**
 * @file pnl-view.tsx — Client component for P&L page
 *
 * @description Income Statement and Balance Sheet views derived from
 * cash flow data. Tabs toggle between the two, with period toggles.
 */

'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { BarChart3, TrendingDown, TrendingUp, Package, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { IncomeStatementTable } from '@/components/cash-burn/income-statement-table'
import { BalanceSheetTable } from '@/components/cash-burn/balance-sheet-table'
import { WaterfallChart } from '@/components/cash-burn/waterfall-chart'
import { HorizontalBar } from '@/components/cash-burn/horizontal-bar'
import { Badge } from '@/components/ui/badge'
import { buildIncomeStatement, buildBalanceSheet } from '@/lib/cash-burn/pnl-builder'
import { getProducts } from '@/actions/products'
import { formatCurrency } from '@/types/payments'
import type { ProductSummary } from '@/types/product'
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

  const [products, setProducts] = useState<ProductSummary[]>([])

  useEffect(() => {
    getProducts().then(result => {
      if (result.data) setProducts(result.data)
    })
  }, [])

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

  // ── Product P&L aggregation ────────────────────────────────────────
  // INTENT: Group existing cashIn/cashOut by productId for per-product P&L
  const productNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of products) map[p.id] = p.name
    return map
  }, [products])

  const productPnlRows = useMemo(() => {
    // Sum revenue (cashIn) by productId
    const revenueByProduct: Record<string, number> = {}
    for (const item of cashIn) {
      const key = item.productId ?? '__unattributed__'
      revenueByProduct[key] = (revenueByProduct[key] ?? 0) + (item.weeklyAmount * 52)
    }
    // Sum COGS (cashOut where pnlCategory === 'cogs') by productId
    const cogsByProduct: Record<string, number> = {}
    for (const item of cashOut) {
      if (item.pnlCategory === 'cogs') {
        const key = item.productId ?? '__unattributed__'
        cogsByProduct[key] = (cogsByProduct[key] ?? 0) + (item.weeklyAmount * 52)
      }
    }
    // Merge all product IDs
    const allKeys = new Set([...Object.keys(revenueByProduct), ...Object.keys(cogsByProduct)])
    const rows: Array<{
      productId: string | null
      productName: string
      revenue: number
      cogs: number
      grossProfit: number
      marginPct: number
    }> = []
    for (const key of allKeys) {
      const revenue = revenueByProduct[key] ?? 0
      const cogs = cogsByProduct[key] ?? 0
      const grossProfit = revenue - cogs
      rows.push({
        productId: key === '__unattributed__' ? null : key,
        productName: key === '__unattributed__' ? 'Unattributed' : (productNameMap[key] ?? 'Unknown Product'),
        revenue,
        cogs,
        grossProfit,
        marginPct: revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0,
      })
    }
    // Sort: named products first (by revenue desc), unattributed last
    rows.sort((a, b) => {
      if (!a.productId) return 1
      if (!b.productId) return -1
      return b.revenue - a.revenue
    })
    return rows
  }, [cashIn, cashOut, productNameMap])

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

      {/* Unclassified-cost warning — items without a pnlCategory are silently
          excluded from the income statement, which can understate costs.
          Surface the count so the founder can classify them. */}
      {(() => {
        const unclassifiedCount = cashOut.filter(i => !i.pnlCategory).length
        if (unclassifiedCount === 0) return null
        return (
          <Card className="border-status-warning/30 bg-status-warning-light/30">
            <CardContent className="py-3 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-status-warning-dark shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-foreground">
                  {unclassifiedCount} cost item{unclassifiedCount === 1 ? '' : 's'} without a P&amp;L category
                </p>
                <p className="text-muted-foreground mt-0.5">
                  These are excluded from the income statement below. Edit each item and
                  set COGS, OpEx, or R&amp;D so the projection reflects your true costs.
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link href="/cash-burn/cash-out">Review costs</Link>
              </Button>
            </CardContent>
          </Card>
        )
      })()}

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
          <TabsTrigger value="product-pnl">Product P&L</TabsTrigger>
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

        <TabsContent value="product-pnl" className="space-y-6 mt-6">
          {productPnlRows.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-3">
                <div className="flex justify-center">
                  <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-3 max-w-sm mx-auto">
                  <p className="text-sm font-medium text-foreground">No product-level data yet</p>
                  <p className="text-sm text-muted-foreground">
                    Tag revenue and COGS items to a product in Cash In and Cash Out — per-product P&amp;L will build itself as you go.
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <Link
                      href="/cash-burn/cash-in"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      Tag revenue
                    </Link>
                    <Link
                      href="/cash-burn/cash-out"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      Tag COGS
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Product</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Revenue (ann.)</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">COGS (ann.)</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Gross Profit</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Margin %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productPnlRows.map(row => (
                        <tr key={row.productId ?? '__unattributed__'} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {row.productId ? (
                                <Link href={`/products/${row.productId}`} className="text-international-orange hover:underline font-medium">
                                  {row.productName}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground italic">{row.productName}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-foreground">{formatCurrency(row.revenue)}</td>
                          <td className="py-3 px-4 text-right tabular-nums text-foreground">{formatCurrency(row.cogs)}</td>
                          <td className={`py-3 px-4 text-right tabular-nums font-medium ${row.grossProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {formatCurrency(row.grossProfit)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Badge variant={row.marginPct >= 50 ? 'success' : row.marginPct >= 20 ? 'warning' : 'destructive'} size="sm">
                              {row.marginPct}%
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground italic">
            Annualised from weekly cash flow items linked to products. COGS includes items categorised as cost of goods sold.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
