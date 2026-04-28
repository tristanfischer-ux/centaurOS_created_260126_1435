'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { CircleDot, Plus, Search } from 'lucide-react'
import type { RaiseData, PipelineRow, PipelineRowWithFirm } from '@/actions/money-raise'
import type { SubscriptionTier } from '@/lib/billing/plans'
import { ExportMenu } from '@/app/(platform)/money/raise/_shared/export-menu'

const STAGE_ORDER: Array<PipelineRow['current_stage']> = [
  'target',
  'researching',
  'contacted',
  'meeting',
  'due_diligence',
  'verbal',
  'closed',
  'passed',
]

const STAGE_LABEL: Record<PipelineRow['current_stage'], string> = {
  target: 'Target',
  researching: 'Researching',
  contacted: 'Contacted',
  meeting: 'Meeting',
  due_diligence: 'DD',
  verbal: 'Verbal',
  closed: 'Closed',
  passed: 'Passed',
}

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export function RaiseView({
  data,
  currentTier,
}: {
  data: RaiseData
  currentTier: SubscriptionTier
}) {
  if (!data.activeRound && data.roundCount === 0) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Raise</h1>
          <p className="text-sm text-muted-foreground">
            Start by creating your first fundraise round, then browse 7,500+ investors from the Fractional Forge directory.
          </p>
        </header>
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<CircleDot className="h-12 w-12" />}
              title="No round created yet"
              description="Define your round target, instrument, and close date. You can add investors to your pipeline from the directory after."
              action={
                <div className="flex gap-2 justify-center">
                  <Link href="/money/raise/new-round">
                    <Button>
                      <Plus className="h-4 w-4 mr-1" />
                      Create round
                    </Button>
                  </Link>
                  <Link href="/money/raise/browse">
                    <Button variant="secondary">
                      <Search className="h-4 w-4 mr-1" />
                      Browse investors
                    </Button>
                  </Link>
                </div>
              }
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  const byStage = new Map<string, PipelineRowWithFirm[]>()
  for (const s of STAGE_ORDER) byStage.set(s, [])
  for (const row of data.pipeline) {
    byStage.get(row.current_stage)?.push(row)
  }

  const committed = data.pipeline
    .filter((r) => r.current_stage === 'verbal' || r.current_stage === 'closed')
    .reduce((s, r) => s + (r.commit_amount_cents ?? 0), 0)

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Raise</h1>
          {data.activeRound ? (
            <p className="text-sm text-muted-foreground mt-2">
              {data.activeRound.name} ·{' '}
              {formatCurrency(committed, data.activeRound.currency)} / {formatCurrency(data.activeRound.target_cents, data.activeRound.currency)}
              {' '}· closes {data.activeRound.close_date}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-2">No active round</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/money/raise/browse">
            <Button size="sm">
              <Search className="h-4 w-4 mr-1" />
              Browse investors
            </Button>
          </Link>
          <Link href="/money/raise/thesis">
            <Button size="sm" variant="secondary">Thesis</Button>
          </Link>
          <Link href="/money/raise/pitch">
            <Button size="sm" variant="secondary">Pitch prep</Button>
          </Link>
          <Link href="/money/raise/update">
            <Button size="sm" variant="secondary">Send update</Button>
          </Link>
        </div>
      </header>

      {data.pipeline.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<CircleDot className="h-12 w-12" />}
              title="No investors in pipeline yet"
              description="Browse the Fractional Forge investor directory (7,500+ firms) and add them to your pipeline."
              action={
                <Link href="/money/raise/browse">
                  <Button>
                    <Search className="h-4 w-4 mr-1" />
                    Browse investors
                  </Button>
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${STAGE_ORDER.length}, minmax(200px, 1fr))` }}>
            {STAGE_ORDER.map((stage) => {
              const rows = byStage.get(stage) ?? []
              return (
                <Card key={stage} className="min-h-[240px]">
                  <CardHeader className="py-3">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                      <span>{STAGE_LABEL[stage]}</span>
                      <Badge variant="secondary" size="sm">{rows.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    {rows.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60 py-4 text-center">Empty</p>
                    ) : (
                      rows.map((row) => {
                        const title = row.firm_title ?? 'Unnamed investor'
                        const loc = [row.firm_city, row.firm_country].filter(Boolean).join(' · ')
                        return (
                          <Link
                            key={row.id}
                            href={`/money/raise/investor/${row.id}`}
                            className="block rounded-md border border-border bg-card p-2 text-xs hover:bg-muted/30 transition-colors"
                          >
                            <div className="font-medium truncate">{title}</div>
                            {(row.firm_subcategory || loc) && (
                              <div className="mt-0.5 text-[10px] text-muted-foreground truncate">
                                {row.firm_subcategory ?? ''}
                                {row.firm_subcategory && loc ? ' · ' : ''}
                                {loc}
                              </div>
                            )}
                            <div className="mt-1 flex items-center justify-between text-muted-foreground">
                              <span>
                                {row.commit_amount_cents
                                  ? formatCurrency(row.commit_amount_cents, data.activeRound?.currency ?? 'GBP')
                                  : '—'}
                              </span>
                              {row.match_score_cached !== null && (
                                <Badge variant="outline" size="sm">
                                  {row.match_score_cached}%
                                </Badge>
                              )}
                            </div>
                          </Link>
                        )
                      })
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
