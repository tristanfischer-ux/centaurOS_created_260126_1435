'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { VarianceReport } from '@/actions/money-plan'
import type { PnlCategory } from '@/lib/money/pnl'

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

function varianceTone(category: PnlCategory, varianceCents: number): 'success' | 'destructive' | 'muted' {
  if (varianceCents === 0) return 'muted'
  const isCost = COST_CATEGORIES.includes(category)
  // Costs over forecast (positive variance) = bad. Income under forecast (negative variance) = bad.
  if (isCost) return varianceCents > 0 ? 'destructive' : 'success'
  return varianceCents > 0 ? 'success' : 'destructive'
}

export function VarianceView({ data }: { data: VarianceReport }) {
  const allCategories: PnlCategory[] = [...COST_CATEGORIES, ...INCOME_CATEGORIES]

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Variance vs Xero</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Forecast (plan) vs actuals (Xero) over the trailing {data.forecast.rows.length} months. Costs over forecast and income under forecast are flagged.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/money/plan">
            <Button variant="secondary" size="sm">Back to plan</Button>
          </Link>
          <Link href="/money/plan/pnl">
            <Button variant="secondary" size="sm">P&amp;L view</Button>
          </Link>
        </div>
      </header>

      {data.actuals.rows.every((r) => r.totalIn === 0 && r.totalOut === 0) && (
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <Badge variant="secondary">Manual only</Badge>
            <p className="text-sm text-muted-foreground">
              No Xero actuals on file. Connect Xero to populate the right-hand columns.
              <Link href="/money/cockpit/connect" className="ml-2 text-international-orange underline">
                Connect Xero
              </Link>
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Variance by category and period
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4">Category</th>
                {data.forecast.rows.map((r) => (
                  <th key={r.periodStart} className="py-2 px-2 text-right" colSpan={3}>
                    {r.periodLabel}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-border text-[10px] text-muted-foreground/70">
                <th></th>
                {data.forecast.rows.flatMap((r) => [
                  <th key={`${r.periodStart}-f`} className="py-1 pl-2 text-right font-normal">Forecast</th>,
                  <th key={`${r.periodStart}-a`} className="py-1 px-2 text-right font-normal">Actual</th>,
                  <th key={`${r.periodStart}-v`} className="py-1 pr-2 text-right font-normal">Δ</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {allCategories.map((cat) => {
                const isCost = COST_CATEGORIES.includes(cat)
                return (
                  <tr key={cat} className="border-b border-border/50">
                    <td className="py-1.5 pr-4 font-medium">
                      {CATEGORY_LABEL[cat]}
                      <span className="ml-2 text-[10px] text-muted-foreground/70">{isCost ? 'cost' : 'income'}</span>
                    </td>
                    {data.forecast.rows.flatMap((f, idx) => {
                      const a = data.actuals.rows[idx]
                      const v = data.variance.rows[idx]
                      const fc = f.byCategory[cat]
                      const ac = a?.byCategory[cat] ?? 0
                      const vc = v?.byCategory[cat] ?? 0
                      const tone = varianceTone(cat, vc)
                      return [
                        <td key={`${f.periodStart}-f`} className="py-1.5 pl-2 text-right text-muted-foreground">
                          {fc > 0 ? formatCurrency(fc) : '—'}
                        </td>,
                        <td key={`${f.periodStart}-a`} className="py-1.5 px-2 text-right">
                          {ac > 0 ? formatCurrency(ac) : '—'}
                        </td>,
                        <td
                          key={`${f.periodStart}-v`}
                          className={`py-1.5 pr-2 text-right ${tone === 'destructive' ? 'text-destructive' : tone === 'success' ? 'text-success' : 'text-muted-foreground'}`}
                        >
                          {vc === 0 ? '—' : `${vc > 0 ? '+' : ''}${formatCurrency(vc)}`}
                        </td>,
                      ]
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
