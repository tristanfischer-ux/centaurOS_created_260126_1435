'use client'

/**
 * @file ObjectivesProgressSection.tsx
 *
 * @description Rich objectives progress section with visual progress bars,
 * health badges, and summary stats — enhanced with icons and consistent
 * section header treatment.
 */

import { Target } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ReportSectionHeader, SectionNarrativeIntro, HealthDot } from '@/components/reports/report-visuals'

import type { ObjectivesProgressSectionData, ObjectiveRow, ReportTemplateId } from '@/lib/reports/report-document-types'

interface ObjectivesProgressSectionProps extends ObjectivesProgressSectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
}

const HEALTH_BADGE_VARIANT: Record<ObjectiveRow['health'], 'success' | 'warning' | 'destructive' | 'secondary'> = {
  'on-track': 'success',
  'completed': 'success',
  'at-risk': 'warning',
  'off-track': 'destructive',
  'not-started': 'secondary',
}

const HEALTH_LABEL: Record<ObjectiveRow['health'], string> = {
  'on-track': 'On Track',
  'completed': 'Completed',
  'at-risk': 'At Risk',
  'off-track': 'Off Track',
  'not-started': 'Not Started',
}

const PROGRESS_BAR_COLOR: Record<ObjectiveRow['health'], string> = {
  'on-track': 'bg-status-success',
  'completed': 'bg-status-success',
  'at-risk': 'bg-status-warning',
  'off-track': 'bg-destructive',
  'not-started': 'bg-muted-foreground',
}

function formatEndDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateStr))
}

export function ObjectivesProgressSection({
  objectives,
  totalActive,
  totalCompleted,
  sectionNarrative,
  templateId,
  sectionNumber,
}: ObjectivesProgressSectionProps): React.JSX.Element {
  return (
    <section className="space-y-8">
      <ReportSectionHeader
        title="Objectives Progress"
        icon={Target}
        templateId={templateId}
        sectionNumber={sectionNumber}
      />
      <SectionNarrativeIntro narrative={sectionNarrative} />

      {/* Summary stat pills */}
      <div className="flex flex-wrap gap-3">
        <div className="rounded-xl bg-muted/50 px-4 py-2.5 text-center">
          <p className="text-2xl font-display font-bold text-foreground">{totalActive}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Active</p>
        </div>
        <div className="rounded-xl bg-status-success-light px-4 py-2.5 text-center">
          <p className="text-2xl font-display font-bold text-status-success-dark">{totalCompleted}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Completed</p>
        </div>
      </div>

      {/* Objective cards */}
      <div className="space-y-3">
        {objectives.map((objective) => (
          <div
            key={objective.id}
            className="rounded-xl border bg-card p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <HealthDot health={objective.health} />
                <h3 className="min-w-0 truncate font-medium text-foreground">
                  {objective.title}
                </h3>
              </div>
              <Badge variant={HEALTH_BADGE_VARIANT[objective.health]} size="sm" className="shrink-0">
                {HEALTH_LABEL[objective.health]}
              </Badge>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-all', PROGRESS_BAR_COLOR[objective.health])}
                style={{ width: `${Math.min(100, Math.max(0, objective.progress))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{objective.progress}%</span>
                {objective.progressDelta != null && objective.progressDelta !== 0 && (
                  <span className={cn(
                    'font-medium',
                    objective.progressDelta > 0 ? 'text-status-success' : 'text-destructive'
                  )}>
                    {' '}{objective.progressDelta > 0 ? '+' : ''}{objective.progressDelta}pp
                  </span>
                )}
                {' '}· {objective.tasksRemaining} task{objective.tasksRemaining !== 1 ? 's' : ''} remaining
              </span>
              {objective.endDate && (
                <span>Due {formatEndDate(objective.endDate)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
