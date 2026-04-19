'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Gauge, TrendingDown, TrendingUp, AlertCircle, Check } from 'lucide-react'
import type { CockpitData } from '@/actions/money-cockpit'

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function runwayBadgeVariant(
  weeks: number | null,
  danger: number,
  healthy: number,
): 'destructive' | 'warning' | 'success' | 'secondary' {
  if (weeks === null) return 'success'
  if (weeks <= danger) return 'destructive'
  if (weeks < healthy) return 'warning'
  return 'success'
}

function xeroStateLabel(state: CockpitData['xeroSyncState']): { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' } {
  switch (state) {
    case 'healthy':
      return { label: 'Xero · Healthy', variant: 'success' }
    case 'syncing':
      return { label: 'Xero · Syncing', variant: 'secondary' }
    case 'error':
      return { label: 'Xero · Error', variant: 'destructive' }
    case 'paused':
      return { label: 'Xero · Paused', variant: 'warning' }
    case 'disconnected':
    default:
      return { label: 'Manual only', variant: 'secondary' }
  }
}

export function CockpitView({ data }: { data: CockpitData }) {
  const runwayVariant = runwayBadgeVariant(
    data.runwayWeeks,
    data.settings.runway_danger_weeks,
    data.settings.runway_healthy_weeks,
  )
  const runwayLabel =
    data.runwayWeeks === null
      ? 'Sustainable'
      : `${data.runwayMonths ?? Math.floor(data.runwayWeeks / 4.333)} months · ${data.runwayWeeks} weeks`

  const xero = xeroStateLabel(data.xeroSyncState)

  const isFirstRun = data.planLineCount === 0 && data.xeroSyncState === 'disconnected'

  if (isFirstRun) {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Cockpit</h1>
          <p className="text-sm text-muted-foreground">
            Connect Xero or add your first plan line to start tracking runway.
          </p>
        </header>
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Gauge className="h-12 w-12" />}
              title="No runway data yet"
              description="Connect Xero to pull live actuals, or start a manual plan with a starter template."
              action={
                <div className="flex gap-3">
                  <Link href="/money/cockpit/connect">
                    <Button>Connect Xero</Button>
                  </Link>
                  <Link href="/money/plan">
                    <Button variant="secondary">Start a plan</Button>
                  </Link>
                </div>
              }
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Cockpit</h1>
          <div className="flex items-center gap-2">
            <Badge variant={xero.variant}>{xero.label}</Badge>
            {data.lastSyncAt && (
              <span className="text-xs text-muted-foreground">
                Synced {new Date(data.lastSyncAt).toLocaleString('en-GB')}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/money/plan/log-expense">
            <Button variant="secondary" size="sm">
              <TrendingDown className="h-4 w-4 mr-1" />
              Log expense
            </Button>
          </Link>
          <Link href="/money/plan/send-invoice">
            <Button variant="secondary" size="sm">
              <TrendingUp className="h-4 w-4 mr-1" />
              Send invoice
            </Button>
          </Link>
        </div>
      </header>

      {/* Single-number runway tile (Brex pattern — competitor research) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Runway
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-4">
            <div className="text-4xl font-bold tabular-nums tracking-tight">
              {runwayLabel}
            </div>
            <Badge variant={runwayVariant}>
              {runwayVariant === 'success'
                ? 'Healthy'
                : runwayVariant === 'warning'
                  ? 'Caution'
                  : 'Critical'}
            </Badge>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Monthly burn: {formatCurrency(data.monthlyBurnCents, data.settings.currency)} ·
            Opening balance: {formatCurrency(data.openingBalanceCents, data.settings.currency)}
          </p>
        </CardContent>
      </Card>

      {/* 26-week projection table (charts come later) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            26-week projection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4">Week</th>
                  <th className="py-2 pr-4 text-right">In</th>
                  <th className="py-2 pr-4 text-right">Out</th>
                  <th className="py-2 pr-4 text-right">Net</th>
                  <th className="py-2 pr-4 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.weeks.slice(0, 26).map((w) => (
                  <tr key={w.weekStart} className="border-b border-border/50">
                    <td className="py-1.5 pr-4">{w.weekStart}</td>
                    <td className="py-1.5 pr-4 text-right text-success">
                      {w.totalInCents > 0 ? formatCurrency(w.totalInCents, data.settings.currency) : '—'}
                    </td>
                    <td className="py-1.5 pr-4 text-right text-destructive">
                      {w.totalOutCents > 0 ? formatCurrency(w.totalOutCents, data.settings.currency) : '—'}
                    </td>
                    <td className={`py-1.5 pr-4 text-right ${w.netCents < 0 ? 'text-destructive' : 'text-success'}`}>
                      {formatCurrency(w.netCents, data.settings.currency)}
                    </td>
                    <td className={`py-1.5 pr-4 text-right font-medium ${w.cumulativeBalanceCents < 0 ? 'text-destructive' : 'text-foreground'}`}>
                      {formatCurrency(w.cumulativeBalanceCents, data.settings.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {!data.hasActiveRound && (
        <Card>
          <CardContent className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-info" />
              <div>
                <p className="text-sm font-medium">No active fundraise round</p>
                <p className="text-xs text-muted-foreground">
                  Create a round to start tracking investor pipeline coverage vs runway.
                </p>
              </div>
            </div>
            <Link href="/money/raise">
              <Button size="sm" variant="secondary">Go to Raise</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {data.hasActiveRound && (
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <Check className="h-5 w-5 text-success" />
            <p className="text-sm">Active round in progress · visit <Link href="/money/raise" className="text-international-orange underline">Raise</Link> for the pipeline.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
