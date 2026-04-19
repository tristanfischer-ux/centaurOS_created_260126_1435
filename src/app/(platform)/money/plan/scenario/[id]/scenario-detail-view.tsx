'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Layers, AlertTriangle } from 'lucide-react'
import type { ScenarioDetail } from '@/actions/money-scenarios'

function formatCurrency(cents: number | null): string {
  if (cents === null) return '—'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export function ScenarioDetailView({ scenario }: { scenario: ScenarioDetail }) {
  const activeOverrides = scenario.overrides.filter((o) => o.archived_at === null)
  const archivedOverrides = scenario.overrides.filter((o) => o.archived_at !== null)

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{scenario.name}</h1>
          <div className="flex items-center gap-2 mt-2">
            {scenario.is_default && <Badge variant="success">Default</Badge>}
            <Badge variant="secondary">{scenario.template_source ?? 'custom'}</Badge>
            <Badge variant="outline">{scenario.visibility}</Badge>
          </div>
          {scenario.question && (
            <p className="text-sm text-muted-foreground mt-3 max-w-xl">{scenario.question}</p>
          )}
        </div>
        <Link href="/money/plan">
          <Button variant="secondary" size="sm">Back to plan</Button>
        </Link>
      </header>

      {scenario.archivedOverrideCount > 0 && (
        <Card>
          <CardContent className="py-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">
                {scenario.archivedOverrideCount} override{scenario.archivedOverrideCount === 1 ? '' : 's'} reference deleted plan lines
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                These overrides revert to 0 in projections. Restore the underlying plan line, or remove the override below.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Overrides ({activeOverrides.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeOverrides.length === 0 ? (
            <EmptyState
              icon={<Layers className="h-12 w-12" />}
              title="No overrides yet"
              description="Add an override from a plan line's detail page to model what changes in this scenario."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4">Line</th>
                    <th className="py-2 pr-4 text-right">Override amount</th>
                    <th className="py-2 pr-4">Override frequency</th>
                    <th className="py-2 pr-4">Effective</th>
                    <th className="py-2 pr-4">Probability</th>
                    <th className="py-2 pr-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {activeOverrides.map((o) => (
                    <tr key={o.id} className="border-b border-border/50">
                      <td className="py-1.5 pr-4 font-medium">
                        {o.line_item_id ? (
                          <Link href={`/money/plan/item/${o.line_item_id}`} className="text-international-orange hover:underline">
                            {o.line_name ?? o.line_item_id}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground italic">deleted line</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-4 text-right">
                        {formatCurrency(o.override_amount_cents)}
                      </td>
                      <td className="py-1.5 pr-4 text-xs text-muted-foreground">{o.override_frequency ?? '—'}</td>
                      <td className="py-1.5 pr-4 text-xs text-muted-foreground">
                        {o.override_effective_from ? `from ${o.override_effective_from}` : '—'}
                        {o.override_effective_to ? ` to ${o.override_effective_to}` : ''}
                      </td>
                      <td className="py-1.5 pr-4 text-xs text-muted-foreground">
                        {o.override_probability_pct === null ? '—' : `${o.override_probability_pct}%`}
                      </td>
                      <td className="py-1.5 pr-2 text-xs text-muted-foreground max-w-xs truncate">
                        {o.note ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {archivedOverrides.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Archived overrides ({archivedOverrides.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-xs text-muted-foreground">
              {archivedOverrides.map((o) => (
                <li key={o.id}>
                  {o.line_name ?? o.line_item_id ?? 'unknown line'} · {formatCurrency(o.override_amount_cents)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
