'use client'

/**
 * @file ObjectivesProgressSection.tsx
 *
 * @description Rich objectives progress section with visual progress bars,
 * health badges, and summary stats — enhanced with icons and consistent
 * section header treatment.
 */

import { Target } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ReportSectionHeader, SectionNarrativeIntro, HealthDot } from '@/components/reports/report-visuals'

import type { ObjectivesProgressSectionData, ObjectiveRow, ReportTemplateId } from '@/lib/reports/report-document-types'

// DECISION: Recharts doesn't support CSS variables for fill/stroke, so HSL
// values are hardcoded here. Must stay in sync with design tokens.
const STATUS_SUCCESS = 'hsl(142, 72%, 29%)'
const STATUS_WARNING = 'hsl(38, 92%, 50%)'
const DESTRUCTIVE = 'hsl(0, 84%, 60%)'
const MUTED = 'hsl(215, 16%, 47%)'
const TOOLTIP_BORDER = 'hsl(214, 32%, 91%)'

const HEALTH_CHART_COLOR: Record<string, string> = {
  'on-track': STATUS_SUCCESS,
  'completed': STATUS_SUCCESS,
  'at-risk': STATUS_WARNING,
  'off-track': DESTRUCTIVE,
  'not-started': MUTED,
}

const HEALTH_LEGEND_ITEMS: { key: string; label: string; color: string }[] = [
  { key: 'on-track', label: 'On Track', color: STATUS_SUCCESS },
  { key: 'at-risk', label: 'At Risk', color: STATUS_WARNING },
  { key: 'off-track', label: 'Off Track', color: DESTRUCTIVE },
  { key: 'completed', label: 'Completed', color: STATUS_SUCCESS },
  { key: 'not-started', label: 'Not Started', color: MUTED },
]

interface ObjectivesProgressSectionProps extends ObjectivesProgressSectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
  chartImageUrl?: string
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
  chartImageUrl,
  templateId,
  sectionNumber,
}: ObjectivesProgressSectionProps): React.JSX.Element {
  // INTENT: Build donut data by counting health statuses across all objectives
  const healthCounts = objectives.reduce<Record<string, number>>((acc, obj) => {
    acc[obj.health] = (acc[obj.health] ?? 0) + 1
    return acc
  }, {})

  const donutData = Object.entries(healthCounts).map(([health, count]) => ({
    name: health.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    value: count,
    health,
  }))

  const averageProgress = objectives.length > 0
    ? Math.round(objectives.reduce((sum, o) => sum + o.progress, 0) / objectives.length)
    : 0

  return (
    <section className="space-y-8">
      <ReportSectionHeader
        title="Objectives Progress"
        icon={Target}
        templateId={templateId}
        sectionNumber={sectionNumber}
      />
      <SectionNarrativeIntro narrative={sectionNarrative} />

      {chartImageUrl && (
        <div className="rounded-xl overflow-hidden border bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={chartImageUrl} alt="" className="w-full h-auto" aria-hidden="true" />
        </div>
      )}

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

      {/* Health distribution donut chart */}
      {donutData.length > 0 && (
        <div className="relative h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donutData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={2}
                strokeWidth={0}
              >
                {donutData.map((entry) => (
                  <Cell
                    key={entry.health}
                    fill={HEALTH_CHART_COLOR[entry.health] ?? MUTED}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => {
                  const v = Number(value ?? 0)
                  return [`${v} objective${v !== 1 ? 's' : ''}`, String(name ?? '')]
                }}
                contentStyle={{
                  borderRadius: '8px',
                  border: `1px solid ${TOOLTIP_BORDER}`,
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
                  fontSize: '13px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Centered average progress label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-2xl font-display font-bold text-foreground">{averageProgress}%</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Progress</p>
            </div>
          </div>
        </div>
      )}

      {/* Health distribution legend */}
      {donutData.length > 0 && (
        <div className="flex flex-wrap justify-center gap-4">
          {HEALTH_LEGEND_ITEMS
            .filter(item => healthCounts[item.key])
            .map(item => (
              <div key={item.key} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <span className="text-xs font-semibold text-foreground">{healthCounts[item.key]}</span>
              </div>
            ))}
        </div>
      )}

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
