'use client'

/**
 * /money/plan/pnl view — Income Statement + Balance Sheet + waterfall +
 * horizontal bars. Client component for the interactive surfaces (week
 * selector, CSV export). Data comes from getPnlReport() in the parent.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowLeft, BarChart3, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  BalanceSheetWeek,
  HorizontalBarRow,
  PnlMonth,
  WaterfallStep,
} from '@/lib/money/pnl-engine'

type PnlViewProps = {
  report: {
    monthly: PnlMonth[]
    balanceSheet: BalanceSheetWeek[]
    waterfall: WaterfallStep[]
    horizontalBars: HorizontalBarRow[]
    totals: {
      revenue_cents: number
      cogs_cents: number
      gross_profit_cents: number
      operating_expenses_cents: number
      operating_profit_cents: number
      other_income_cents: number
      net_profit_cents: number
    }
    scenarioName: string | null
    currency: string
    lineCount: number
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  revenue: 'Revenue',
  grants: 'Grants',
  loans: 'Loans',
  equity: 'Equity',
  people: 'People',
  premises: 'Premises',
  tools: 'Tools',
  materials: 'Materials',
  growth: 'Growth',
  other: 'Other',
  cogs: 'Cost of goods',
  production: 'Production',
}

function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? (cat.charAt(0).toUpperCase() + cat.slice(1))
}

function makeCurrencyFormatter(currency: string): (cents: number) => string {
  const nf = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  })
  return (cents: number) => nf.format(cents / 100)
}

function makeCompactFormatter(currency: string): (cents: number) => string {
  const nf = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    notation: 'compact',
  })
  return (cents: number) => nf.format(cents / 100)
}

function amountClass(cents: number, positiveIsGood = true): string {
  if (cents === 0) return 'text-muted-foreground'
  const good = positiveIsGood ? cents > 0 : cents < 0
  return good ? 'text-success' : 'text-destructive'
}

// ────────────────────────────────────────────────────────────────────

export function PnlView({ report }: PnlViewProps) {
  const fmt = useMemo(
    () => makeCurrencyFormatter(report.currency),
    [report.currency],
  )
  const fmtCompact = useMemo(
    () => makeCompactFormatter(report.currency),
    [report.currency],
  )

  // Balance sheet week selector (defaults to last week of horizon).
  const defaultWeekIndex = Math.min(report.balanceSheet.length - 1, 12)
  const [weekIndex, setWeekIndex] = useState<number>(
    defaultWeekIndex >= 0 ? defaultWeekIndex : 0,
  )
  const selectedWeek =
    report.balanceSheet[weekIndex] ?? report.balanceSheet[0] ?? null

  const onDownloadCsv = () => {
    const rows: string[] = []
    const escape = (v: string | number): string => {
      const s = String(v).replace(/"/g, '""')
      return /[",\n]/.test(s) ? `"${s}"` : s
    }
    // Header: Line, then each month label, then Total
    const header = [
      'Line',
      ...report.monthly.map((m) => m.monthLabel),
      'Total',
    ]
    rows.push(header.map(escape).join(','))

    const lines: Array<{
      label: string
      values: (m: PnlMonth) => number
    }> = [
      { label: 'Revenue', values: (m) => m.revenue_cents },
      { label: 'COGS', values: (m) => m.cogs_cents },
      { label: 'Gross Profit', values: (m) => m.gross_profit_cents },
      {
        label: 'Operating Expenses',
        values: (m) => m.operating_expenses_cents,
      },
      {
        label: 'Operating Profit',
        values: (m) => m.operating_profit_cents,
      },
      { label: 'Other Income', values: (m) => m.other_income_cents },
      { label: 'Net Profit', values: (m) => m.net_profit_cents },
      {
        label: 'Cumulative Cash',
        values: (m) => m.cumulative_cash_cents,
      },
    ]

    for (const line of lines) {
      const monthlyValues = report.monthly.map((m) => line.values(m))
      const total = monthlyValues.reduce((s, v) => s + v, 0)
      rows.push(
        [line.label, ...monthlyValues.map((v) => v / 100), total / 100]
          .map(escape)
          .join(','),
      )
    }

    const csv = '\uFEFF' + rows.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const stamp = new Date().toISOString().slice(0, 10)
    a.download = `pnl-${stamp}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Waterfall data for Recharts — convert signed totals to [low, high]
  // range bars so negatives draw downward between successive subtotals.
  const waterfallChart = useMemo(() => {
    let cursor = 0
    return report.waterfall.map((step, i) => {
      if (step.kind === 'total') {
        const bar = {
          name: step.label,
          range: [0, step.value_cents] as [number, number],
          value: step.value_cents,
          kind: step.kind,
        }
        cursor = step.value_cents
        return bar
      }
      const start = cursor
      const end = cursor + step.value_cents
      cursor = end
      return {
        name: step.label,
        range: [Math.min(start, end), Math.max(start, end)] as [number, number],
        value: step.value_cents,
        kind: step.kind,
      }
    })
  }, [report.waterfall])

  const incomeBars = report.horizontalBars
    .filter((r) => r.direction === 'in')
    .slice(0, 10)
  const expenseBars = report.horizontalBars
    .filter((r) => r.direction === 'out')
    .slice(0, 10)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/money/plan">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to plan
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">P&amp;L</h1>
            <p className="text-sm text-muted-foreground">
              Monthly Income Statement, projected Balance Sheet, and waterfall.
            </p>
            <div className="flex items-center gap-2 mt-2">
              {report.scenarioName && (
                <Badge variant="secondary">Scenario: {report.scenarioName}</Badge>
              )}
              <Badge variant="outline">{report.currency}</Badge>
              <span className="text-xs text-muted-foreground">
                Based on {report.lineCount} plan line
                {report.lineCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onDownloadCsv}>
          <Download className="h-4 w-4 mr-1" />
          Export CSV
        </Button>
      </div>

      {report.lineCount === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-2 text-sm">
            <p className="font-medium">No plan lines yet</p>
            <p className="text-muted-foreground">
              Add cost and income lines on the plan to see your P&amp;L.
            </p>
            <div className="pt-3">
              <Button asChild variant="default" size="sm">
                <Link href="/money/plan">Go to plan</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Income Statement */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Income Statement · next 12 months
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <caption className="sr-only">
              Projected monthly Income Statement across revenue, COGS, gross
              profit, operating expenses, operating profit, other income, and
              net profit, plus cumulative cash.
            </caption>
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="py-2 pr-4">
                  Line
                </th>
                {report.monthly.map((m) => (
                  <th
                    scope="col"
                    key={m.month}
                    className="py-2 px-2 text-right"
                  >
                    {m.monthLabel}
                  </th>
                ))}
                <th scope="col" className="py-2 pl-2 text-right">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  label: 'Revenue',
                  key: 'revenue_cents' as const,
                  positiveGood: true,
                  bold: false,
                },
                {
                  label: 'COGS',
                  key: 'cogs_cents' as const,
                  positiveGood: false,
                  bold: false,
                },
                {
                  label: 'Gross Profit',
                  key: 'gross_profit_cents' as const,
                  positiveGood: true,
                  bold: true,
                },
                {
                  label: 'Operating Expenses',
                  key: 'operating_expenses_cents' as const,
                  positiveGood: false,
                  bold: false,
                },
                {
                  label: 'Operating Profit',
                  key: 'operating_profit_cents' as const,
                  positiveGood: true,
                  bold: true,
                },
                {
                  label: 'Other Income',
                  key: 'other_income_cents' as const,
                  positiveGood: true,
                  bold: false,
                },
                {
                  label: 'Net Profit',
                  key: 'net_profit_cents' as const,
                  positiveGood: true,
                  bold: true,
                },
              ].map((row) => {
                const total = report.monthly.reduce(
                  (s, m) => s + m[row.key],
                  0,
                )
                return (
                  <tr
                    key={row.key}
                    className={`border-b border-border/50 ${
                      row.bold ? 'bg-muted/30 font-semibold' : ''
                    }`}
                  >
                    <td className="py-1.5 pr-4">{row.label}</td>
                    {report.monthly.map((m) => {
                      const v = m[row.key]
                      return (
                        <td
                          key={m.month}
                          className={`py-1.5 px-2 text-right ${amountClass(
                            v,
                            row.positiveGood,
                          )}`}
                        >
                          {v === 0 ? '—' : fmt(v)}
                        </td>
                      )
                    })}
                    <td
                      className={`py-1.5 pl-2 text-right ${amountClass(
                        total,
                        row.positiveGood,
                      )}`}
                    >
                      {total === 0 ? '—' : fmt(total)}
                    </td>
                  </tr>
                )
              })}
              <tr className="bg-muted/50">
                <td className="py-2 pr-4 font-semibold">Cumulative cash</td>
                {report.monthly.map((m) => (
                  <td
                    key={m.month}
                    className={`py-2 px-2 text-right font-semibold ${amountClass(
                      m.cumulative_cash_cents,
                      true,
                    )}`}
                  >
                    {fmt(m.cumulative_cash_cents)}
                  </td>
                ))}
                <td className="py-2 pl-2 text-right font-semibold text-muted-foreground">
                  —
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Waterfall */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            How {fmtCompact(report.totals.revenue_cents)} revenue becomes{' '}
            {fmtCompact(report.totals.net_profit_cents)} net profit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={waterfallChart}
                margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  fontSize={11}
                  tickMargin={8}
                  interval={0}
                />
                <YAxis
                  fontSize={11}
                  tickFormatter={(v: number) => fmtCompact(v)}
                  width={70}
                />
                <Tooltip
                  formatter={(_v: unknown, _name: unknown, item) => {
                    const payload = item as {
                      payload?: { value?: number }
                    }
                    const v = payload?.payload?.value ?? 0
                    return [fmt(v), 'Value']
                  }}
                  cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                />
                <Bar dataKey="range" radius={[2, 2, 0, 0]}>
                  {waterfallChart.map((step) => (
                    <Cell
                      key={step.name}
                      fill={
                        step.kind === 'in'
                          ? 'hsl(var(--success))'
                          : step.kind === 'out'
                          ? 'hsl(var(--destructive))'
                          : 'hsl(var(--muted-foreground))'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Horizontal bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Top income categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            {incomeBars.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No income lines.
              </p>
            ) : (
              <ul className="space-y-2">
                {incomeBars.map((row) => {
                  const max = Math.max(
                    ...incomeBars.map((r) => r.total_cents),
                    1,
                  )
                  const pct = Math.round((row.total_cents / max) * 100)
                  return (
                    <li
                      key={`in-${row.category}`}
                      className="flex items-center gap-3"
                    >
                      <span className="w-24 text-xs text-foreground shrink-0 truncate">
                        {categoryLabel(row.category)}
                      </span>
                      <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
                        <div
                          className="h-full bg-success"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-20 text-right text-xs tabular-nums text-foreground shrink-0">
                        {fmtCompact(row.total_cents)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Top expense categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expenseBars.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No expense lines.
              </p>
            ) : (
              <ul className="space-y-2">
                {expenseBars.map((row) => {
                  const max = Math.max(
                    ...expenseBars.map((r) => r.total_cents),
                    1,
                  )
                  const pct = Math.round((row.total_cents / max) * 100)
                  return (
                    <li
                      key={`out-${row.category}`}
                      className="flex items-center gap-3"
                    >
                      <span className="w-24 text-xs text-foreground shrink-0 truncate">
                        {categoryLabel(row.category)}
                      </span>
                      <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
                        <div
                          className="h-full bg-destructive"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-20 text-right text-xs tabular-nums text-foreground shrink-0">
                        {fmtCompact(row.total_cents)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Balance Sheet */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Projected Balance Sheet
            </CardTitle>
            {report.balanceSheet.length > 0 && (
              <div className="flex items-center gap-2">
                <label
                  htmlFor="bs-week"
                  className="text-xs text-muted-foreground"
                >
                  As of
                </label>
                <Select
                  value={String(weekIndex)}
                  onValueChange={(v) => setWeekIndex(Number(v))}
                >
                  <SelectTrigger
                    id="bs-week"
                    className="w-56 h-8 text-xs"
                  >
                    <SelectValue placeholder="Select week" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {report.balanceSheet.map((w, i) => (
                      <SelectItem key={w.week_start} value={String(i)}>
                        {w.week_label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!selectedWeek ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No balance sheet rows.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Assets
                </p>
                <div className="flex items-center justify-between text-sm">
                  <span>Cash</span>
                  <span
                    className={`tabular-nums ${amountClass(
                      selectedWeek.assets_cash_cents,
                    )}`}
                  >
                    {fmt(selectedWeek.assets_cash_cents)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Receivables</span>
                  <span className="tabular-nums text-foreground">
                    {fmt(selectedWeek.assets_receivables_cents)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-border pt-2 font-semibold">
                  <span>Total assets</span>
                  <span
                    className={`tabular-nums ${amountClass(
                      selectedWeek.total_assets_cents,
                    )}`}
                  >
                    {fmt(selectedWeek.total_assets_cents)}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Liabilities
                </p>
                <div className="flex items-center justify-between text-sm">
                  <span>Loans</span>
                  <span className="tabular-nums text-foreground">
                    {fmt(selectedWeek.liabilities_loans_cents)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-border pt-2 font-semibold">
                  <span>Total liabilities</span>
                  <span className="tabular-nums text-foreground">
                    {fmt(selectedWeek.total_liabilities_cents)}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Equity
                </p>
                <div className="flex items-center justify-between text-sm border-t border-border pt-2 font-semibold">
                  <span>Equity</span>
                  <span
                    className={`tabular-nums ${amountClass(
                      selectedWeek.equity_cents,
                    )}`}
                  >
                    {fmt(selectedWeek.equity_cents)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground pt-2">
                  Assets − Liabilities. Week {selectedWeek.week_index + 1} of{' '}
                  {report.balanceSheet.length}.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground italic">
        Projected from plan line items + scenario overrides. For audited
        financials, connect your accounting software via the Variance view.
      </p>
    </div>
  )
}
