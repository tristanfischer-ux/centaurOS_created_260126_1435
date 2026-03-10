'use client'

/**
 * @file BlockersRisksSection.tsx
 *
 * @description Visual blockers and risks section with severity-colored cards,
 * summary stats, and at-risk objective progress indicators.
 */

import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ReportSectionHeader, SectionNarrativeIntro, ProgressBar } from '@/components/reports/report-visuals'

import type { BlockersRisksSectionData, BlockerRow, AtRiskObjective, ReportTemplateId } from '@/lib/reports/report-document-types'

const SEVERITY_CHART_COLOR: Record<string, string> = {
  critical: 'hsl(0, 84%, 60%)',
  high: 'hsl(38, 92%, 50%)',
  medium: 'hsl(215, 16%, 47%)',
  low: 'hsl(142, 72%, 29%)',
  other: 'hsl(215, 20%, 65%)',
}

// INTENT: Ordered severity keys for stacked bar — determines left-to-right render order
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'other'] as const
const TOOLTIP_BORDER = 'hsl(214, 32%, 91%)'

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
    medium: blockers.filter(b => b.severity === 'medium').length,
    low: blockers.filter(b => b.severity === 'low').length,
    other: blockers.filter(b => !b.severity || !['critical', 'high', 'medium', 'low'].includes(b.severity)).length,
  }

  // INTENT: Stacked bar data — single row with severity segments
  const severityBarData = blockers.length > 0 ? [{
    name: 'Severity',
    critical: severityCounts.critical,
    high: severityCounts.high,
    medium: severityCounts.medium,
    low: severityCounts.low,
    other: severityCounts.other,
  }] : []

  // INTENT: Dynamically compute which segments are visible for correct bar radius
  const visibleSeverities = SEVERITY_ORDER.filter(key => severityCounts[key] > 0)

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
          {(severityCounts.other + severityCounts.medium + severityCounts.low) > 0 && (
            <span className="text-xs font-medium bg-muted text-muted-foreground rounded-full px-3 py-1.5">
              {severityCounts.medium + severityCounts.low + severityCounts.other} other
            </span>
          )}
        </div>
      )}

      {/* Severity stacked bar */}
      {severityBarData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="h-12">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={severityBarData} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" hide />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: `1px solid ${TOOLTIP_BORDER}`,
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
                      fontSize: '13px',
                    }}
                  />
                  {visibleSeverities.map((key, idx) => {
                    const isFirst = idx === 0
                    const isLast = idx === visibleSeverities.length - 1
                    const isOnly = isFirst && isLast
                    const radius: [number, number, number, number] = isOnly
                      ? [4, 4, 4, 4]
                      : isFirst ? [4, 0, 0, 4]
                      : isLast ? [0, 4, 4, 0]
                      : [0, 0, 0, 0]
                    return (
                      <Bar
                        key={key}
                        dataKey={key}
                        name={key.charAt(0).toUpperCase() + key.slice(1)}
                        stackId="severity"
                        fill={SEVERITY_CHART_COLOR[key]}
                        radius={radius}
                      />
                    )
                  })}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {visibleSeverities.map(key => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: SEVERITY_CHART_COLOR[key] }} />
                  <span className="text-xs text-muted-foreground capitalize">{key}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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
