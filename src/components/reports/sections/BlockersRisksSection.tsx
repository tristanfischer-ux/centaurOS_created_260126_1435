'use client'

import { CheckCircle2, AlertTriangle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import type { BlockersRisksSectionData, BlockerRow, AtRiskObjective } from '@/lib/reports/report-document-types'

type BlockersRisksSectionProps = BlockersRisksSectionData

const SEVERITY_BORDER: Record<NonNullable<BlockerRow['severity']>, string> = {
  critical: 'border-l-4 border-l-destructive',
  high: 'border-l-4 border-l-status-warning',
  medium: 'border-l-4 border-l-status-info',
  low: 'border-l-4 border-l-muted',
}

const SEVERITY_LABEL: Record<NonNullable<BlockerRow['severity']>, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

function BlockerCard({ blocker }: { blocker: BlockerRow }) {
  const borderClass = blocker.severity
    ? SEVERITY_BORDER[blocker.severity]
    : 'border-l-4 border-l-muted'

  return (
    <Card className={cn('overflow-hidden', borderClass)}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">
            {blocker.reporterName}
          </span>
          {blocker.reporterRole && (
            <span className="text-xs text-muted-foreground">
              · {blocker.reporterRole}
            </span>
          )}
          {blocker.severity && (
            <Badge variant="outline" size="sm">
              {SEVERITY_LABEL[blocker.severity]}
            </Badge>
          )}
          {blocker.needsHelp && (
            <Badge variant="destructive" size="sm">
              Needs Help
            </Badge>
          )}
        </div>
        <p className="text-sm text-foreground leading-relaxed">
          {blocker.description}
        </p>
      </CardContent>
    </Card>
  )
}

function AtRiskRow({ objective }: { objective: AtRiskObjective }) {
  const isUrgent = objective.daysRemaining < 7

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {objective.title}
        </p>
      </div>
      <div className="flex items-center gap-4 shrink-0 text-sm">
        <span className="tabular-nums text-muted-foreground">
          {objective.progress}%
        </span>
        <span
          className={cn(
            'tabular-nums',
            isUrgent ? 'text-destructive font-medium' : 'text-muted-foreground'
          )}
        >
          {objective.daysRemaining}d left
        </span>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 py-12 text-center">
      <CheckCircle2 className="h-8 w-8 text-status-success" />
      <p className="mt-3 text-sm font-medium text-foreground">
        All clear — no blockers or at-risk objectives
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        The team is tracking well this period
      </p>
    </div>
  )
}

export function BlockersRisksSection({
  blockers,
  atRiskObjectives,
}: BlockersRisksSectionProps) {
  const hasContent = blockers.length > 0 || atRiskObjectives.length > 0

  return (
    <section className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="h-6 w-1 rounded-full bg-international-orange" />
        <h2 className="text-2xl font-display font-bold text-foreground">
          Blockers &amp; Risks
        </h2>
      </div>

      {!hasContent && <EmptyState />}

      {blockers.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-status-warning" />
            <h3 className="text-base font-medium text-foreground">
              Active Blockers
            </h3>
            <span className="text-xs text-muted-foreground">
              ({blockers.length})
            </span>
          </div>
          <div className="space-y-3">
            {blockers.map((blocker) => (
              <BlockerCard key={blocker.id} blocker={blocker} />
            ))}
          </div>
        </div>
      )}

      {atRiskObjectives.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h3 className="text-base font-medium text-foreground">
              At-Risk Objectives
            </h3>
            <span className="text-xs text-muted-foreground">
              ({atRiskObjectives.length})
            </span>
          </div>
          <div className="space-y-2">
            {atRiskObjectives.map((objective) => (
              <AtRiskRow key={objective.id} objective={objective} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
