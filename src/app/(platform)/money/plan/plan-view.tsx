'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Grid2X2, Plus, Upload } from 'lucide-react'
import { archivePlanLine, seedPlanFromTemplate, type PlanData, type PlanLineItem } from '@/actions/money-plan'
import { toast } from 'sonner'

const CATEGORY_LABEL: Record<string, string> = {
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

const STARTER_TEMPLATES = [
  { id: 'uk_pre_seed_4_eng', label: 'UK pre-seed · 4 engineers' },
  { id: 'uk_pre_seed_bootstrapped', label: 'UK bootstrapped · 2 founders' },
  { id: 'us_pre_seed_bootstrapped', label: 'US bootstrapped · 2 founders' },
  { id: 'uk_hardware_prototyping', label: 'UK hardware · prototyping stage' },
]

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function LineRow({ line, onArchive }: { line: PlanLineItem; onArchive: (id: string) => void }) {
  return (
    <tr className="border-b border-border/50 hover:bg-muted/30">
      <td className="py-2 pr-4 font-medium">{line.name}</td>
      <td className="py-2 pr-4 text-muted-foreground">{CATEGORY_LABEL[line.category] ?? line.category}</td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{line.frequency}</td>
      <td className={`py-2 pr-4 text-right tabular-nums ${line.direction === 'out' ? 'text-destructive' : 'text-success'}`}>
        {line.direction === 'out' ? '−' : '+'}{formatCurrency(line.amount_cents, line.currency)}
      </td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{line.probability_pct}%</td>
      <td className="py-2 pr-2 text-right">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onArchive(line.id)}
        >
          Archive
        </Button>
      </td>
    </tr>
  )
}

export function PlanView({ data }: { data: PlanData }) {
  const [seeding, setSeeding] = useState(false)

  const onArchive = async (lineId: string) => {
    const result = await archivePlanLine(lineId)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Line archived')
    }
  }

  const onSeedTemplate = async (templateId: string) => {
    setSeeding(true)
    const result = await seedPlanFromTemplate(templateId)
    setSeeding(false)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success(`Added ${result.inserted} lines from template`)
    }
  }

  const outLines = data.lines.filter((l) => l.direction === 'out')
  const inLines = data.lines.filter((l) => l.direction === 'in')

  if (data.lines.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Plan</h1>
          <p className="text-sm text-muted-foreground">
            Add your cost and income lines to build a forecast.
          </p>
        </header>
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Grid2X2 className="h-12 w-12" />}
              title="No plan lines yet"
              description="Start from a template or import a CSV from your existing spreadsheet."
              action={
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 justify-center">
                    {STARTER_TEMPLATES.map((t) => (
                      <Button
                        key={t.id}
                        variant="secondary"
                        size="sm"
                        disabled={seeding}
                        onClick={() => onSeedTemplate(t.id)}
                      >
                        {t.label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-2 justify-center">
                    <Link href="/money/plan/import">
                      <Button variant="outline" size="sm">
                        <Upload className="h-4 w-4 mr-1" />
                        Import CSV
                      </Button>
                    </Link>
                  </div>
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
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plan</h1>
          <div className="flex items-center gap-2 mt-2">
            {data.activeScenarioId ? (
              <Badge variant="secondary">
                Scenario: {data.scenarios.find((s) => s.id === data.activeScenarioId)?.name}
              </Badge>
            ) : (
              <Badge variant="outline">No default scenario</Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {data.lines.length} lines · {data.scenarios.length} scenario{data.scenarios.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/money/plan/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New line
            </Button>
          </Link>
          <Link href="/money/plan/variance">
            <Button size="sm" variant="secondary">
              Variance vs Xero
            </Button>
          </Link>
          <Link href="/money/plan/pnl">
            <Button size="sm" variant="secondary">
              P&amp;L
            </Button>
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Costs ({outLines.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {outLines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No cost lines yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">Frequency</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 pr-4">Prob.</th>
                    <th className="py-2 pr-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {outLines.map((line) => (
                    <LineRow key={line.id} line={line} onArchive={onArchive} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Income ({inLines.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {inLines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No income lines yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">Frequency</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 pr-4">Prob.</th>
                    <th className="py-2 pr-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {inLines.map((line) => (
                    <LineRow key={line.id} line={line} onArchive={onArchive} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
