'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import type { ObjectivesProgressSectionData, ObjectiveRow } from '@/lib/reports/report-document-types'

type ObjectivesProgressSectionProps = ObjectivesProgressSectionData

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
}: ObjectivesProgressSectionProps) {
  return (
    <section className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="h-6 w-1 rounded-full bg-international-orange" />
        <h2 className="text-2xl font-display font-bold text-foreground">
          Objectives Progress
        </h2>
      </div>

      <p className="text-sm text-muted-foreground">
        {totalActive} active · {totalCompleted} completed
      </p>

      <div className="space-y-3">
        {objectives.map((objective) => (
          <div
            key={objective.id}
            className="rounded-lg border bg-card p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-4">
              <h3 className="min-w-0 truncate font-medium text-foreground">
                {objective.title}
              </h3>
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
                {objective.progress}% · {objective.tasksRemaining} task{objective.tasksRemaining !== 1 ? 's' : ''} remaining
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
