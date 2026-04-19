'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { PnlCategory, PnlReport } from '@/lib/money/pnl'

const COST_CATEGORIES: PnlCategory[] = ['people', 'premises', 'tools', 'materials', 'growth', 'other']
const INCOME_CATEGORIES: PnlCategory[] = ['revenue', 'grants', 'equity', 'loans']

const CATEGORY_LABEL: Record<PnlCategory, string> = {
  people: 'People',
  premises: 'Premises',
  tools: 'Tools',
  materials: 'Materials',
  growth: 'Growth',
  other: 'Other',
  revenue: 'Revenue',
  grants: 'Grants',
  equity: 'Equity',
  loans: 'Loans',
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export function PnlView({ report }: { report: PnlReport }) {
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Forecast P&amp;L</h1>
          <p className="text-sm text-muted-foreground mt-2">
            12-month forecast aggregated from your plan lines. Costs and income shown by category.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/money/plan">
            <Button variant="secondary" size="sm">Back to plan</Button>
          </Link>
          <Link href="/money/plan/variance">
            <Button variant="secondary" size="sm">Variance vs Xero</Button>
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Costs</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4">Category</th>
                {report.rows.map((r) => (
                  <th key={r.periodStart} className="py-2 px-2 text-right">{r.periodLabel}</th>
                ))}
                <th className="py-2 pl-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {COST_CATEGORIES.map((cat) => {
                const total = report.rows.reduce((s, r) => s + r.byCategory[cat], 0)
                return (
                  <tr key={cat} className="border-b border-border/50">
                    <td className="py-1.5 pr-4 font-medium">{CATEGORY_LABEL[cat]}</td>
                    {report.rows.map((r) => (
                      <td key={r.periodStart} className="py-1.5 px-2 text-right text-destructive">
                        {r.byCategory[cat] > 0 ? formatCurrency(r.byCategory[cat]) : '—'}
                      </td>
                    ))}
                    <td className="py-1.5 pl-2 text-right text-destructive font-medium">
                      {total > 0 ? formatCurrency(total) : '—'}
                    </td>
                  </tr>
                )
              })}
              <tr className="border-b border-border bg-muted/30">
                <td className="py-2 pr-4 font-semibold">Total costs</td>
                {report.rows.map((r) => (
                  <td key={r.periodStart} className="py-2 px-2 text-right font-semibold text-destructive">
                    {r.totalOut > 0 ? formatCurrency(r.totalOut) : '—'}
                  </td>
                ))}
                <td className="py-2 pl-2 text-right font-semibold text-destructive">
                  {formatCurrency(report.rows.reduce((s, r) => s + r.totalOut, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Income</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4">Category</th>
                {report.rows.map((r) => (
                  <th key={r.periodStart} className="py-2 px-2 text-right">{r.periodLabel}</th>
                ))}
                <th className="py-2 pl-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {INCOME_CATEGORIES.map((cat) => {
                const total = report.rows.reduce((s, r) => s + r.byCategory[cat], 0)
                return (
                  <tr key={cat} className="border-b border-border/50">
                    <td className="py-1.5 pr-4 font-medium">{CATEGORY_LABEL[cat]}</td>
                    {report.rows.map((r) => (
                      <td key={r.periodStart} className="py-1.5 px-2 text-right text-success">
                        {r.byCategory[cat] > 0 ? formatCurrency(r.byCategory[cat]) : '—'}
                      </td>
                    ))}
                    <td className="py-1.5 pl-2 text-right text-success font-medium">
                      {total > 0 ? formatCurrency(total) : '—'}
                    </td>
                  </tr>
                )
              })}
              <tr className="border-b border-border bg-muted/30">
                <td className="py-2 pr-4 font-semibold">Total income</td>
                {report.rows.map((r) => (
                  <td key={r.periodStart} className="py-2 px-2 text-right font-semibold text-success">
                    {r.totalIn > 0 ? formatCurrency(r.totalIn) : '—'}
                  </td>
                ))}
                <td className="py-2 pl-2 text-right font-semibold text-success">
                  {formatCurrency(report.rows.reduce((s, r) => s + r.totalIn, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Net</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4"></th>
                {report.rows.map((r) => (
                  <th key={r.periodStart} className="py-2 px-2 text-right">{r.periodLabel}</th>
                ))}
                <th className="py-2 pl-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2 pr-4 font-semibold">Net cash flow</td>
                {report.rows.map((r) => (
                  <td
                    key={r.periodStart}
                    className={`py-2 px-2 text-right font-semibold ${r.net < 0 ? 'text-destructive' : 'text-success'}`}
                  >
                    {formatCurrency(r.net)}
                  </td>
                ))}
                <td className={`py-2 pl-2 text-right font-semibold ${report.rows.reduce((s, r) => s + r.net, 0) < 0 ? 'text-destructive' : 'text-success'}`}>
                  {formatCurrency(report.rows.reduce((s, r) => s + r.net, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
