'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Coins, Save, TrendingUp, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import {
  updateCreditsBudget,
  type CreditsSummary,
  type CreditsPeriodType,
  type SpecialistUsageRow,
  type SpecialistModelRow,
} from '@/actions/money-credits'

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const fmt: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startIso} – ${endIso}`
  }
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear()
  return `${start.toLocaleDateString('en-GB', fmt)} – ${end.toLocaleDateString('en-GB', { ...fmt, year: sameYear ? undefined : 'numeric' })} ${end.getUTCFullYear()}`
}

export function CreditsView({ summary }: { summary: CreditsSummary }) {
  return (
    <div className="space-y-6">
      <UsageHeader summary={summary} />
      <BudgetForm summary={summary} />
      <SpecialistTable rows={summary.bySpecialist} totalBillable={summary.totalBillableCents} />
      <SpecialistModelTable rows={summary.bySpecialistModel} totalBillable={summary.totalBillableCents} />
      <SectionTable rows={summary.bySection} totalBillable={summary.totalBillableCents} />
    </div>
  )
}

function UsageHeader({ summary }: { summary: CreditsSummary }) {
  const showBreached = summary.isBreached && summary.budget !== null
  const showWarning = summary.isWarning && !showBreached

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Usage this period</CardTitle>
            <CardDescription>
              {formatDateRange(summary.windowStart, summary.windowEnd)}
            </CardDescription>
          </div>
          {showBreached && (
            <Badge variant="destructive">Budget breached</Badge>
          )}
          {showWarning && (
            <Badge variant="warning">Approaching cap</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-3">
          <div className="text-3xl font-bold tabular-nums tracking-tight">
            {formatCents(summary.totalBillableCents)}
          </div>
          {summary.budget && (
            <div className="text-sm text-muted-foreground">
              of {formatCents(summary.budget.cap_cents)} cap
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {summary.invocationCount.toLocaleString('en-GB')} specialist invocations · raw cost {formatCents(summary.totalSpendCents)}
        </p>

        {summary.budget && summary.percentOfCap !== null && (
          <div className="space-y-1.5">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${summary.isBreached ? 'bg-destructive' : summary.isWarning ? 'bg-warning' : 'bg-success'}`}
                style={{ width: `${Math.min(100, summary.percentOfCap)}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {summary.percentOfCap}% of cap used · warning at {summary.budget.warning_threshold_pct}%
            </p>
          </div>
        )}

        {showBreached && (
          <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="flex-1 space-y-2 text-sm">
              <p className="text-foreground">
                You&apos;ve hit the credits budget for this period.{' '}
                {summary.budget?.breach_behaviour === 'block'
                  ? 'New specialist calls are being blocked.'
                  : 'Specialist calls continue, but cost is no longer guarded.'}
              </p>
              <Link href="/settings/billing">
                <Button size="sm" variant="default">
                  <TrendingUp className="h-4 w-4 mr-1" />
                  Review billing &amp; upgrade
                </Button>
              </Link>
            </div>
          </div>
        )}

        {!summary.budget && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            No budget set for this period — usage is shown month-to-date. Set a cap below to enable warnings.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BudgetForm({ summary }: { summary: CreditsSummary }) {
  const [periodType, setPeriodType] = useState<CreditsPeriodType>(
    summary.budget?.period_type ?? 'monthly',
  )
  const [capMajor, setCapMajor] = useState<string>(
    summary.budget ? String(Math.round(summary.budget.cap_cents) / 100) : '',
  )
  const [warningPct, setWarningPct] = useState<number>(
    summary.budget?.warning_threshold_pct ?? 80,
  )
  const [breachBehaviour, setBreachBehaviour] = useState<'block' | 'warn_only'>(
    summary.budget?.breach_behaviour ?? 'block',
  )
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    const major = Number(capMajor)
    if (!Number.isFinite(major) || major < 0) {
      toast.error('Cap must be a non-negative number.')
      return
    }
    startTransition(async () => {
      const result = await updateCreditsBudget({
        period_type: periodType,
        cap_cents: Math.round(major * 100),
        warning_threshold_pct: warningPct,
        breach_behaviour: breachBehaviour,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Budget saved.')
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-international-orange" />
          <CardTitle className="text-base">Budget</CardTitle>
        </div>
        <CardDescription>
          Hard ceiling for specialist spend per period. Breach behaviour decides whether new calls are blocked.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="budget-period">Period</Label>
            <Select value={periodType} onValueChange={(v) => setPeriodType(v as CreditsPeriodType)}>
              <SelectTrigger id="budget-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="custom">Custom (this calendar month)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Period window auto-derives from today; edit ranges live in the database for now.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget-cap">Cap (GBP)</Label>
            <Input
              id="budget-cap"
              type="number"
              min={0}
              step={1}
              value={capMajor}
              onChange={(e) => setCapMajor(e.target.value)}
              placeholder="e.g. 100"
            />
            <p className="text-xs text-muted-foreground">
              Whole pounds. The cap stores as cents internally.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget-warning">Warning at (%)</Label>
            <Input
              id="budget-warning"
              type="number"
              min={1}
              max={100}
              value={warningPct}
              onChange={(e) => setWarningPct(Number(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget-breach">Breach behaviour</Label>
            <Select value={breachBehaviour} onValueChange={(v) => setBreachBehaviour(v as 'block' | 'warn_only')}>
              <SelectTrigger id="budget-breach">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="block">Block new calls when over cap</SelectItem>
                <SelectItem value="warn_only">Warn only — never block</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <Button onClick={handleSave} disabled={isPending}>
            <Save className="h-4 w-4 mr-1" />
            {isPending ? 'Saving…' : 'Save budget'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function SpecialistTable({
  rows,
  totalBillable,
}: {
  rows: SpecialistUsageRow[]
  totalBillable: number
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">By specialist</CardTitle>
        <CardDescription>Billable spend this period, biggest first.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Coins className="h-10 w-10" />}
            title="No specialist activity yet"
            description="Specialist invocations from across Forge, Products, Plan, and Money show up here."
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => {
              const pct = totalBillable > 0 ? (row.total_billable_cents / totalBillable) * 100 : 0
              return (
                <li key={row.specialist_id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{row.specialist_id}</span>
                    <span className="tabular-nums text-foreground">
                      {formatCents(row.total_billable_cents)}{' '}
                      <span className="text-xs text-muted-foreground">
                        · {row.invocations} call{row.invocations === 1 ? '' : 's'}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-international-orange rounded-full"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function SpecialistModelTable({
  rows,
  totalBillable,
}: {
  rows: SpecialistModelRow[]
  totalBillable: number
}) {
  if (rows.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">By specialist &amp; model</CardTitle>
        <CardDescription>
          Per-call running totals — the canonical &quot;what cost what&quot; view from the ledger. Use this to spot model swaps that would save credits.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Specialist</th>
              <th className="py-2 pr-4 font-medium">Model</th>
              <th className="py-2 pr-4 font-medium text-right">Spend</th>
              <th className="py-2 pr-4 font-medium text-right">Calls</th>
              <th className="py-2 pr-4 font-medium text-right">Tokens (in / out)</th>
              <th className="py-2 pr-4 font-medium text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const pct = totalBillable > 0 ? (row.total_billable_cents / totalBillable) * 100 : 0
              return (
                <tr key={`${row.specialist_id}-${row.model_id}`} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-medium">{row.specialist_id}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{row.model_id}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatCents(row.total_billable_cents)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                    {row.invocations}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                    {row.total_input_tokens.toLocaleString('en-GB')} / {row.total_output_tokens.toLocaleString('en-GB')}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                    {pct.toFixed(0)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

function SectionTable({
  rows,
  totalBillable,
}: {
  rows: Array<{ section: string; total_billable_cents: number; invocations: number }>
  totalBillable: number
}) {
  if (rows.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">By section</CardTitle>
        <CardDescription>Where the spend happened — Forge, Products, Plan, Money.</CardDescription>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Section</th>
              <th className="py-2 pr-4 font-medium text-right">Spend</th>
              <th className="py-2 pr-4 font-medium text-right">Calls</th>
              <th className="py-2 pr-4 font-medium text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const pct = totalBillable > 0 ? (row.total_billable_cents / totalBillable) * 100 : 0
              return (
                <tr key={row.section} className="border-b border-border/50">
                  <td className="py-2 pr-4 capitalize">{row.section}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatCents(row.total_billable_cents)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                    {row.invocations}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                    {pct.toFixed(0)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
