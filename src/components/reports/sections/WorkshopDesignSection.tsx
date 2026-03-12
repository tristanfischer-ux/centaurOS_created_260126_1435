'use client'

/**
 * @file WorkshopDesignSection.tsx
 *
 * @description Design phase report section — CAD Lab projects, workshop funnel,
 * generation sparkline, enriched metrics, and period-over-period deltas.
 */

import { useId } from 'react'
import { Pencil, Layers, Zap } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ReportSectionHeader,
  SectionNarrativeIntro,
  StatCallout,
  Sparkline,
  TrendArrow,
} from '@/components/reports/report-visuals'
import { calculatePercentChange, getTrendDirection } from '@/lib/reports/trends'

import type { WorkshopDesignSectionData, ReportTemplateId } from '@/lib/reports/report-document-types'

// DECISION: Recharts doesn't support CSS variables for fill/stroke, so HSL
// values are hardcoded here. Must stay in sync with design tokens.
const FUNNEL_COLORS = [
  'hsl(14, 100%, 50%)',   // Design — International Orange
  'hsl(217, 91%, 60%)',   // Specify — Electric Blue
  'hsl(160, 84%, 39%)',   // Source — Emerald
  'hsl(38, 92%, 50%)',    // Assemble — Amber
  'hsl(271, 91%, 65%)',   // Complete — Purple
]
const STAGE_LABELS: Record<string, string> = {
  design: 'Design',
  specify: 'Specify',
  source: 'Source',
  assemble: 'Assemble',
  complete: 'Complete',
}
const AXIS_TICK_COLOR = 'hsl(215, 16%, 47%)'
const GRID_COLOR = '#e2e8f0'
const TOOLTIP_BORDER = 'hsl(214, 32%, 91%)'

interface WorkshopDesignSectionProps extends WorkshopDesignSectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function WorkshopDesignSection({
  totalProjects,
  activeProjects,
  projects,
  generationMetrics,
  sectionNarrative,
  templateId,
  sectionNumber,
  workshopFunnel,
  previousTotalProjects,
  previousActiveProjects,
  generationTrend,
  firstAttemptSuccessRate,
  totalTokensUsed,
  qualityFailureRate,
  avgRepairAttempts,
  previousGenerationCount,
}: WorkshopDesignSectionProps): React.JSX.Element {
  const uid = useId()
  const isEmpty = totalProjects === 0

  // Deltas
  const projectsDelta = previousTotalProjects != null
    ? calculatePercentChange(totalProjects, previousTotalProjects)
    : undefined
  const activeDelta = previousActiveProjects != null
    ? calculatePercentChange(activeProjects, previousActiveProjects)
    : undefined
  const genCountDelta = previousGenerationCount != null && generationMetrics
    ? calculatePercentChange(generationMetrics.totalGenerations, previousGenerationCount)
    : undefined

  // Funnel chart data
  const funnelData = workshopFunnel?.map(s => ({
    name: STAGE_LABELS[s.stage] ?? s.stage,
    value: s.count,
  }))

  return (
    <div className="space-y-8">
      <ReportSectionHeader
        title="Workshop: Design"
        icon={Pencil}
        templateId={templateId}
        sectionNumber={sectionNumber}
      />

      <SectionNarrativeIntro narrative={sectionNarrative} />

      {isEmpty ? (
        <div className="text-center py-12">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Pencil className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No CAD Lab projects found.</p>
        </div>
      ) : (
        <>
          {/* Hero stats with deltas */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <StatCallout
                  value={String(totalProjects)}
                  label="Total Projects"
                  size="md"
                  trend={projectsDelta != null ? getTrendDirection(projectsDelta) : undefined}
                  changePercent={projectsDelta != null ? Math.round(projectsDelta) : undefined}
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <StatCallout
                  value={String(activeProjects)}
                  label="Active"
                  size="md"
                  trend={activeDelta != null ? getTrendDirection(activeDelta) : undefined}
                  changePercent={activeDelta != null ? Math.round(activeDelta) : undefined}
                />
              </CardContent>
            </Card>
            {generationMetrics != null && (
              <Card>
                <CardContent className="p-4 text-center">
                  <StatCallout
                    value={`${generationMetrics.successRate}%`}
                    label="Generation Success"
                    size="md"
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Workshop funnel chart */}
          {funnelData != null && funnelData.some(d => d.value > 0) && (
            <Card>
              <CardContent className="p-6">
                <h3 className="text-sm font-semibold mb-4">Workshop Funnel</h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelData} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                      <defs>
                        {FUNNEL_COLORS.map((color, i) => (
                          <linearGradient key={i} id={`${uid}-funnelGrad${i}`} x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor={color} stopOpacity={1} />
                            <stop offset="100%" stopColor={color} stopOpacity={0.6} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 12, fill: AXIS_TICK_COLOR }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tick={{ fontSize: 12, fill: AXIS_TICK_COLOR }}
                        axisLine={false}
                        tickLine={false}
                        width={80}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: `1px solid ${TOOLTIP_BORDER}`,
                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
                          fontSize: '13px',
                        }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
                        {funnelData.map((_, i) => (
                          <Cell key={i} fill={`url(#${uid}-funnelGrad${i % FUNNEL_COLORS.length})`} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-3">
                  {funnelData.map((stage, i) => (
                    <div key={stage.name} className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }}
                      />
                      <span className="text-xs text-muted-foreground">{stage.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Generation metrics detail */}
          {generationMetrics != null && generationMetrics.totalGenerations > 0 && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-international-orange/10">
                    <Zap className="h-4 w-4 text-international-orange" />
                  </div>
                  <h3 className="text-sm font-semibold">Generation Metrics</h3>
                </div>

                {/* Sparkline */}
                {generationTrend != null && generationTrend.length > 1 && (
                  <Sparkline
                    data={generationTrend.map(d => d.count)}
                    color="orange"
                    height={36}
                    className="mb-2"
                  />
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold font-display">
                      {generationMetrics.totalGenerations}
                      {genCountDelta != null && (
                        <TrendArrow
                          trend={getTrendDirection(genCountDelta)}
                          changePercent={Math.round(genCountDelta)}
                          className="ml-1 text-xs align-middle"
                        />
                      )}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Generations</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold font-display text-status-success">
                      {generationMetrics.successRate}%
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Success</p>
                  </div>
                  {firstAttemptSuccessRate != null && (
                    <div>
                      <p className="text-lg font-bold font-display">{firstAttemptSuccessRate}%</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">First Attempt</p>
                    </div>
                  )}
                  <div>
                    <p className="text-lg font-bold font-display">
                      {generationMetrics.averageTimeMs > 0
                        ? `${(generationMetrics.averageTimeMs / 1000).toFixed(1)}s`
                        : '—'}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Time</p>
                  </div>
                  {qualityFailureRate != null && (
                    <div>
                      <p className="text-lg font-bold font-display text-destructive">{qualityFailureRate}%</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Quality Failures</p>
                    </div>
                  )}
                  {avgRepairAttempts != null && (
                    <div>
                      <p className="text-lg font-bold font-display">{avgRepairAttempts}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Repairs</p>
                    </div>
                  )}
                </div>

                {/* Token usage + model badges */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {totalTokensUsed != null && totalTokensUsed > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Tokens: {formatTokens(totalTokensUsed)}
                    </span>
                  )}
                  {generationMetrics.topModels.map(({ model, count }) => (
                    <Badge key={model} variant="secondary" className="text-[10px]">
                      {model}: {count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Project list */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Projects
            </h3>
            <div className="space-y-2">
              {projects.slice(0, 10).map(p => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3 bg-card"
                >
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <Badge variant="secondary" className="text-[10px]">
                      {p.moduleCount} module{p.moduleCount !== 1 ? 's' : ''}
                    </Badge>
                    <Badge
                      variant={p.status === 'completed' ? 'success' : 'secondary'}
                      className="text-[10px] capitalize"
                    >
                      {p.stage}
                    </Badge>
                  </div>
                </div>
              ))}
              {projects.length > 10 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  + {projects.length - 10} more projects
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
