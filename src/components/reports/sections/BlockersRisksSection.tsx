'use client'

/**
 * @file BlockersRisksSection.tsx
 *
 * @description Visual blockers and risks section with severity-colored cards,
 * summary stats, and at-risk objective progress indicators.
 */

import { CheckCircle2, AlertTriangle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ReportSectionHeader, SectionNarrativeIntro, ProgressBar } from '@/components/reports/report-visuals'

import type { BlockersRisksSectionData, BlockerRow, AtRiskObjective, ReportTemplateId } from '@/lib/reports/report-document-types'

interface BlockersRisksSectionProps extends BlockersRisksSectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
}

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

function BlockerCard({ blocker }: { blocker: BlockerRow }): React.JSX.Element {
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
          {blocker.ageInDays != null && blocker.ageInDays > 0 && (
            <span className={cn(
              'text-xs font-medium rounded-full px-2 py-0.5',
              blocker.ageInDays >= 7 ? 'bg-status-error-light text-destructive' :
              blocker.ageInDays >= 3 ? 'bg-status-warning-light text-status-warning-dark' :
              'bg-muted text-muted-foreground'
            )}>
              {blocker.ageInDays}d old
            </span>
          )}
        </div>
        <p className="text-sm text-foreground leading-relaxed">
          {blocker.description}
        </p>
      </CardContent>
    </Card>
  )
}

function AtRiskRow({ objective }: { objective: AtRiskObjective }): React.JSX.Element {
  const isUrgent = objective.daysRemaining < 7

  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-4">
          <p className="truncate text-sm font-medium text-foreground">
            {objective.title}
          </p>
          <span
            className={cn(
              'shrink-0 text-xs font-medium tabular-nums',
              isUrgent ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {objective.daysRemaining}d left
          </span>
        </div>
        <ProgressBar
          value={objective.progress}
          color={isUrgent ? 'destructive' : 'warning'}
        />
        <p className="text-xs text-muted-foreground tabular-nums">
          {objective.progress}% complete
        </p>
      </div>
    </div>
  )
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 py-14 text-center">
      <CheckCircle2 className="h-10 w-10 text-status-success" />
      <p className="mt-4 text-sm font-medium text-foreground">
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
  sectionNarrative,
  templateId,
  sectionNumber,
}: BlockersRisksSectionProps): React.JSX.Element {
  const hasContent = blockers.length > 0 || atRiskObjectives.length > 0

  // Summary counts by severity
  const severityCounts = {
    critical: blockers.filter(b => b.severity === 'critical').length,
    high: blockers.filter(b => b.severity === 'high').length,
    other: blockers.filter(b => b.severity !== 'critical' && b.severity !== 'high').length,
  }

  return (
    <section className="space-y-8">
      <ReportSectionHeader
        title="Blockers & Risks"
        icon={AlertTriangle}
        templateId={templateId}
        sectionNumber={sectionNumber}
      />
      <SectionNarrativeIntro narrative={sectionNarrative} />

      {!hasContent && <EmptyState />}

      {/* Severity summary pills */}
      {blockers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-muted/50 px-3 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
            <span className="text-xs font-semibold text-foreground">
              {blockers.length} blocker{blockers.length !== 1 && 's'}
            </span>
          </div>
          {severityCounts.critical > 0 && (
            <span className="text-xs font-medium bg-status-error-light text-destructive rounded-full px-3 py-1.5">
              {severityCounts.critical} critical
            </span>
          )}
          {severityCounts.high > 0 && (
            <span className="text-xs font-medium bg-status-warning-light text-status-warning-dark rounded-full px-3 py-1.5">
              {severityCounts.high} high
            </span>
          )}
          {severityCounts.other > 0 && (
            <span className="text-xs font-medium bg-muted text-muted-foreground rounded-full px-3 py-1.5">
              {severityCounts.other} other
            </span>
          )}
        </div>
      )}

      {/* Blocker cards */}
      {blockers.length > 0 && (
        <div className="space-y-3">
          {blockers.map((blocker) => (
            <BlockerCard key={blocker.id} blocker={blocker} />
          ))}
        </div>
      )}

      {/* At-risk objectives with progress */}
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
          <div className="space-y-3">
            {atRiskObjectives.map((objective) => (
              <AtRiskRow key={objective.id} objective={objective} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
