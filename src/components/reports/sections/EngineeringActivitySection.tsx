'use client'

/**
 * @file EngineeringActivitySection.tsx
 *
 * @description CAD Lab project activity: total active, stage breakdown,
 * module generation stats, recent projects list, specialist review health,
 * cost estimates, design-to-manufacture funnel, and process/material tags.
 */

import { useId } from 'react'
import { Cog, Box, Layers, ShieldCheck, PoundSterling, GitBranch, Wrench } from 'lucide-react'
import { format } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  ReportSectionHeader,
  SectionNarrativeIntro,
  StatCallout,
} from '@/components/reports/report-visuals'

import type {
  EngineeringActivitySectionData,
  ReportTemplateId,
  ReviewSummary,
  CostSummary,
  ManufacturingFunnel,
} from '@/lib/reports/report-document-types'

// DECISION: Recharts doesn't support CSS variables for fill/stroke, so HSL
// values are hardcoded here. Must stay in sync with design tokens.
const INTERNATIONAL_ORANGE = 'hsl(14, 100%, 50%)'
const AXIS_TICK_COLOR = 'hsl(215, 16%, 47%)'
const GRID_COLOR = '#e2e8f0'
const TOOLTIP_BORDER = 'hsl(214, 32%, 91%)'

// Verdict colors for review health bar
const VERDICT_COLORS = {
  approved: 'hsl(142, 71%, 45%)',
  conditional: 'hsl(38, 92%, 50%)',
  rejected: 'hsl(0, 84%, 60%)',
  pending: 'hsl(215, 16%, 72%)',
}

// Funnel gradient — deeper orange to lighter
const FUNNEL_COLORS = [
  'hsl(14, 100%, 50%)',
  'hsl(14, 90%, 58%)',
  'hsl(14, 80%, 66%)',
  'hsl(14, 70%, 74%)',
]

interface EngineeringActivitySectionProps extends EngineeringActivitySectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
  chartImageUrl?: string
}

const STAGE_COLORS: Record<string, string> = {
  research: 'bg-electric-blue',
  design: 'bg-international-orange',
  generation: 'bg-status-warning',
  review: 'bg-purple-500',
  complete: 'bg-status-success',
}

export function EngineeringActivitySection({
  totalActive,
  createdThisPeriod,
  completedThisPeriod,
  byStage,
  // byStatus intentionally unused — kept in type for snapshot compatibility
  totalModulesGenerated,
  recentProjects,
  sectionNarrative,
  chartImageUrl,
  templateId,
  sectionNumber,
  reviewSummary,
  costSummary,
  manufacturingFunnel,
  designHealth,
  processBreakdown,
  materialBreakdown,
}: EngineeringActivitySectionProps): React.JSX.Element {
  const uid = useId()
  // INTENT: Show content if there's any activity OR any deep forge data from completed projects
  const hasDeepForgeData = !!(reviewSummary || costSummary || manufacturingFunnel || designHealth || processBreakdown || materialBreakdown)
  const isEmpty = totalActive === 0 && createdThisPeriod === 0 && !hasDeepForgeData

  return (
    <div className="space-y-8">
      <ReportSectionHeader
        title="Engineering Activity"
        icon={Cog}
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

      {isEmpty ? (
        <div className="text-center py-12">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Cog className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No engineering activity this period.</p>
        </div>
      ) : (
        <>
          {/* Summary pills */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="text-xs">
              {totalActive} Active
            </Badge>
            {createdThisPeriod > 0 && (
              <Badge variant="secondary" className="text-xs">
                +{createdThisPeriod} New
              </Badge>
            )}
            {completedThisPeriod > 0 && (
              <Badge variant="success" className="text-xs">
                {completedThisPeriod} Completed
              </Badge>
            )}
            {totalModulesGenerated > 0 && (
              <Badge variant="secondary" className="text-xs">
                <Layers className="h-3 w-3 mr-1" />
                {totalModulesGenerated} Modules
              </Badge>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <StatCallout value={String(totalActive)} label="Active Projects" size="sm" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <StatCallout value={String(createdThisPeriod)} label="Created This Period" size="sm" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <StatCallout value={String(totalModulesGenerated)} label="Total Modules" size="sm" />
              </CardContent>
            </Card>
          </div>

          {/* Projects by Stage chart */}
          {byStage.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byStage} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                      <defs>
                        <linearGradient id={`${uid}-engBarGradient`} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={INTERNATIONAL_ORANGE} stopOpacity={1} />
                          <stop offset="100%" stopColor={INTERNATIONAL_ORANGE} stopOpacity={0.6} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 12, fill: AXIS_TICK_COLOR }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        dataKey="stage"
                        type="category"
                        tick={{ fontSize: 12, fill: AXIS_TICK_COLOR }}
                        axisLine={false}
                        tickLine={false}
                        width={90}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: `1px solid ${TOOLTIP_BORDER}`,
                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
                          fontSize: '13px',
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name="Projects"
                        fill={`url(#${uid}-engBarGradient)`}
                        radius={[0, 4, 4, 0]}
                        maxBarSize={24}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* By Stage legend */}
          {byStage.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                By Stage
              </h3>
              <div className="flex flex-wrap gap-3">
                {byStage.map(({ stage, count }) => (
                  <div key={stage} className="flex items-center gap-2 text-sm">
                    <span className={cn(
                      'inline-block h-2 w-2 rounded-full',
                      STAGE_COLORS[stage.toLowerCase()] ?? 'bg-muted-foreground',
                    )} />
                    <span className="text-muted-foreground capitalize">{stage}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent projects */}
          {recentProjects.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Recent Projects
              </h3>
              <div className="space-y-2">
                {recentProjects.map((project) => (
                  <Card key={project.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-international-orange/10">
                          <Box className="h-4 w-4 text-international-orange" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{project.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(project.createdAt), 'd MMM yyyy')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          {project.stage}
                        </Badge>
                        <Badge
                          variant={project.status === 'completed' ? 'success' : 'secondary'}
                          className="text-[10px] capitalize"
                        >
                          {project.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* ======================== */}
          {/* Deep Forge Analytics      */}
          {/* ======================== */}

          {/* Review Health Bar */}
          {reviewSummary && <ReviewHealthBar summary={reviewSummary} />}

          {/* Cost Summary Card */}
          {costSummary && <CostSummaryCard summary={costSummary} />}

          {/* Design-to-Manufacture Funnel */}
          {manufacturingFunnel && <ManufacturingFunnelChart funnel={manufacturingFunnel} />}

          {/* Design Health */}
          {designHealth && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Design Health
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <StatCallout value={String(designHealth.averageRevisions)} label="Avg Revisions" size="sm" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <StatCallout value={String(designHealth.projectsWithStaleImages)} label="Stale Images" size="sm" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <StatCallout value={String(designHealth.totalModulesAcrossProjects)} label="Total Modules" size="sm" />
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Process & Material Tags */}
          {(processBreakdown || materialBreakdown) && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                Process & Material Distribution
              </h3>
              {processBreakdown && processBreakdown.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Processes</p>
                  <div className="flex flex-wrap gap-2">
                    {processBreakdown.map(({ process, count }) => (
                      <Badge key={process} variant="secondary" className="text-xs">
                        {process}
                        <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">
                          {count}
                        </span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {materialBreakdown && materialBreakdown.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Materials</p>
                  <div className="flex flex-wrap gap-2">
                    {materialBreakdown.map(({ material, count }) => (
                      <Badge key={material} variant="secondary" className="text-xs">
                        {material}
                        <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">
                          {count}
                        </span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ========================
// Sub-components
// ========================

function ReviewHealthBar({ summary }: { summary: ReviewSummary }): React.JSX.Element {
  const { totalReviewed, totalProjects, verdicts, topIssues } = summary
  const total = verdicts.approved + verdicts.conditional + verdicts.rejected + verdicts.pending
  if (total === 0) return <></>

  const segments = [
    { key: 'approved', value: verdicts.approved, color: VERDICT_COLORS.approved, label: 'Approved' },
    { key: 'conditional', value: verdicts.conditional, color: VERDICT_COLORS.conditional, label: 'Conditional' },
    { key: 'rejected', value: verdicts.rejected, color: VERDICT_COLORS.rejected, label: 'Rejected' },
    { key: 'pending', value: verdicts.pending, color: VERDICT_COLORS.pending, label: 'Pending' },
  ].filter(s => s.value > 0)

  const chartData = [{ name: 'Reviews', ...Object.fromEntries(segments.map(s => [s.key, s.value])) }]

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <ShieldCheck className="h-4 w-4" />
        Specialist Review Health
      </h3>
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="h-10">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                {segments.map((s, i) => {
                  const isFirst = i === 0
                  const isLast = i === segments.length - 1
                  const radius: [number, number, number, number] | number = isFirst && isLast
                    ? [4, 4, 4, 4]
                    : isFirst ? [4, 0, 0, 4]
                    : isLast ? [0, 4, 4, 0]
                    : 0
                  return (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.label}
                      stackId="reviews"
                      fill={s.color}
                      radius={radius}
                    />
                  )
                })}
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: `1px solid ${TOOLTIP_BORDER}`,
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
                    fontSize: '13px',
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {totalReviewed} of {totalProjects} projects reviewed
            </p>
            <div className="flex flex-wrap gap-2">
              {segments.map(s => (
                <div key={s.key} className="flex items-center gap-1.5 text-xs">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-semibold">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
          {topIssues.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {topIssues.map((issue) => (
                <Badge key={issue} variant="destructive" className="text-[10px] font-normal">
                  {issue}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CostSummaryCard({ summary }: { summary: CostSummary }): React.JSX.Element {
  const { totalEstimatedCost, averageCostPerUnit, averageConfidence, projectsWithEstimates, buyVsMake } = summary
  const confidencePercent = Math.round(averageConfidence * 100)
  const buyTotal = buyVsMake.buy + buyVsMake.make
  const buyPercent = buyTotal > 0 ? Math.round((buyVsMake.buy / buyTotal) * 100) : 0

  const formatGBP = (v: number) =>
    `£${Intl.NumberFormat('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)}`

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <PoundSterling className="h-4 w-4" />
        Cost Estimates
      </h3>
      <Card>
        <CardContent className="p-6 space-y-4">
          <StatCallout value={formatGBP(totalEstimatedCost)} label="Total Estimated Cost" size="md" />
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Avg Per Unit</p>
              <p className="text-lg font-bold font-display">{formatGBP(averageCostPerUnit)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Confidence</p>
              <p className="text-lg font-bold font-display">{confidencePercent}%</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Projects</p>
              <p className="text-lg font-bold font-display">{projectsWithEstimates}</p>
            </div>
          </div>
          {buyTotal > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Buy vs Make</p>
              <div className="flex h-2 w-full rounded-full overflow-hidden bg-muted">
                <div
                  className="h-full bg-electric-blue transition-all"
                  style={{ width: `${buyPercent}%` }}
                />
                <div
                  className="h-full bg-international-orange transition-all"
                  style={{ width: `${100 - buyPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Buy {buyVsMake.buy}</span>
                <span>Make {buyVsMake.make}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ManufacturingFunnelChart({ funnel }: { funnel: ManufacturingFunnel }): React.JSX.Element {
  const data = [
    { stage: 'Designed', value: funnel.designed },
    { stage: 'Reviewed', value: funnel.reviewed },
    { stage: 'Costed', value: funnel.costed },
    { stage: 'Ordered', value: funnel.ordered },
  ]

  // Don't render an empty chart when no projects have progressed through any stage
  if (data.every(d => d.value === 0)) return <></>

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Design-to-Manufacture Funnel
      </h3>
      <Card>
        <CardContent className="p-6">
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                <XAxis
                  dataKey="stage"
                  tick={{ fontSize: 12, fill: AXIS_TICK_COLOR }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: AXIS_TICK_COLOR }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: `1px solid ${TOOLTIP_BORDER}`,
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
                    fontSize: '13px',
                  }}
                />
                <Bar dataKey="value" name="Projects" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {data.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={FUNNEL_COLORS[index]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
