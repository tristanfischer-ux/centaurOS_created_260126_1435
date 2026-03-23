'use client'

/**
 * @file ReportInfographic.tsx
 *
 * @description Renders a dense, single-page visual summary of a report —
 * inspired by Google NotebookLM's visual summaries. The infographic fits
 * inside an A4-proportioned container and is designed to be screenshot-
 * friendly and export-as-image-ready.
 *
 * INTENT: Gives founders/executives a shareable "at a glance" view of their
 * entire report. The fixed aspect ratio means screenshots and exports look
 * consistent regardless of viewport size.
 *
 * @related
 * - src/lib/reports/report-document-types.ts — Type definitions
 * - src/components/reports/ReportDocument.tsx — Full scrollable report renderer
 */

import { format } from 'date-fns'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import {
  MiniBar,
  ProgressBar,
  TrendArrow,
  HealthDot,
  formatMetricValue,
} from '@/components/reports/report-visuals'

import type {
  ReportDocument,
  CoverSectionData,
  KeyMetricsSectionData,
  KPIMetric,
  CompletionTrendSectionData,
  ObjectivesProgressSectionData,
  TeamActivitySectionData,
  BlockersRisksSectionData,
} from '@/lib/reports/report-document-types'

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ReportInfographicProps {
  document: ReportDocument
}

/**
 * @description Dense, single-page visual summary of a report displayed in an
 * A4-proportioned frame. Designed to be screenshot-friendly and shareable.
 *
 * @param props.document The full ReportDocument to summarize visually.
 */
export function ReportInfographic({ document }: ReportInfographicProps): React.JSX.Element {
  // --- Extract section data (graceful when absent) ---
  const coverData = document.sections.find(s => s.type === 'cover')?.data as CoverSectionData | undefined
  const metricsData = document.sections.find(s => s.type === 'key-metrics')?.data as KeyMetricsSectionData | undefined
  const trendData = document.sections.find(s => s.type === 'completion-trend')?.data as CompletionTrendSectionData | undefined
  const objectivesData = document.sections.find(s => s.type === 'objectives-progress')?.data as ObjectivesProgressSectionData | undefined
  const teamData = document.sections.find(s => s.type === 'team-activity')?.data as TeamActivitySectionData | undefined
  const blockersData = document.sections.find(s => s.type === 'blockers-risks')?.data as BlockersRisksSectionData | undefined

  const allMetrics = metricsData?.metrics ?? []
  const heroMetric = allMetrics[0] as KPIMetric | undefined
  const remainingMetrics = allMetrics.slice(1, 5)

  const topObjectives = (objectivesData?.objectives ?? []).slice(0, 3)
  const topContributors = [...(teamData?.members ?? [])]
    .sort((a, b) => b.tasksCompleted - a.tasksCompleted)
    .slice(0, 3)

  const blockers = blockersData?.blockers ?? []
  const severityCounts = {
    critical: blockers.filter(b => b.severity === 'critical').length,
    high: blockers.filter(b => b.severity === 'high').length,
    other: blockers.filter(b => b.severity !== 'critical' && b.severity !== 'high').length,
  }

  // Sparkline normalisation
  const trendPoints = trendData?.dataPoints ?? []
  const maxCompleted = Math.max(...trendPoints.map(d => d.completed), 1)
  const maxCreated = Math.max(...trendPoints.map(d => d.created), 1)

  // INTENT: Append T00:00:00 to date-only strings to prevent timezone-related
  // off-by-one errors (e.g. "2026-03-10" parsed as UTC midnight → Mar 9 in US timezones)
  const safeDate = (d: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(d + 'T00:00:00')
    return new Date(d)
  }

  const generatedDate = coverData?.generatedAt
    ? format(safeDate(coverData.generatedAt), 'd MMM yyyy')
    : format(safeDate(document.generatedAt), 'd MMM yyyy')

  const dateRangeLabel = coverData
    ? `${format(safeDate(coverData.dateRange.start), 'd MMM')} – ${format(safeDate(coverData.dateRange.end), 'd MMM yyyy')}`
    : `${format(safeDate(document.dateRange.start), 'd MMM')} – ${format(safeDate(document.dateRange.end), 'd MMM yyyy')}`

  return (
    <div className="max-w-2xl mx-auto aspect-[210/297] overflow-hidden rounded-xl border shadow-lg bg-background flex flex-col">
      {/* ================================================================
          HEADER BAND
          ================================================================ */}
      <div className="bg-international-orange px-6 py-5 text-white shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-80 mb-1">
              {coverData?.companyName ?? document.foundryName}
            </p>
            <h1 className="text-xl font-display font-bold leading-tight">
              {coverData?.reportTitle ?? document.title}
            </h1>
            <p className="text-[10px] mt-1 opacity-70">{dateRangeLabel}</p>
          </div>
          {document.branding?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={document.branding.logoUrl}
              alt=""
              className="h-8 w-auto object-contain opacity-80"
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      {/* Scrollable interior — flex-1 fills the A4 frame */}
      <div className="flex-1 flex flex-col px-6 py-4 gap-4 overflow-hidden">
        {/* ==============================================================
            HERO METRIC
            ============================================================== */}
        {heroMetric && (
          <div className="text-center py-3 shrink-0">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              {heroMetric.label}
            </p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-5xl font-bold text-foreground leading-none font-display">
                {formatMetricValue(heroMetric.value, heroMetric.format)}
              </span>
              <TrendArrow
                trend={heroMetric.trend}
                changePercent={heroMetric.changePercent}
                className="text-sm"
              />
            </div>
          </div>
        )}

        {/* ==============================================================
            KPI ROW
            ============================================================== */}
        {remainingMetrics.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
            {remainingMetrics.map((metric, idx) => (
              <div
                key={`${metric.label}-${idx}`}
                className="bg-muted/50 rounded-lg px-3 py-2.5 text-center"
              >
                <p className="text-xl font-bold text-foreground leading-none">
                  {formatMetricValue(metric.value, metric.format)}
                </p>
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground mt-1 truncate">
                  {metric.label}
                </p>
                <TrendArrow
                  trend={metric.trend}
                  changePercent={metric.changePercent}
                  className="justify-center mt-1"
                />
              </div>
            ))}
          </div>
        )}

        {/* ==============================================================
            TWO-COLUMN: TREND + OBJECTIVES
            ============================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 min-h-0">
          {/* --- Mini Completion Trend (sparkline) --- */}
          <div className="flex flex-col bg-muted/20 rounded-lg p-3 -m-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-medium">
              {trendData?.periodLabel ?? 'Completion Trend'}
            </p>
            {trendPoints.length > 0 ? (
              <div className="flex-1 flex items-end gap-[3px] min-h-[60px]">
                {trendPoints.map((point, i) => (
                  <div key={i} className="flex-1 flex items-end gap-px h-full">
                    <MiniBar
                      heightPercent={(point.completed / maxCompleted) * 100}
                      color="orange"
                    />
                    <MiniBar
                      heightPercent={(point.created / maxCreated) * 100}
                      color="muted"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No trend data</p>
            )}
            {trendPoints.length > 0 && (
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                  <span className="inline-block h-1.5 w-3 rounded-full bg-international-orange" />
                  Completed
                </span>
                <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                  <span className="inline-block h-1.5 w-3 rounded-full bg-muted-foreground/25" />
                  Created
                </span>
              </div>
            )}
          </div>

          {/* --- Top Objectives --- */}
          <div className="flex flex-col">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-medium">
              Top Objectives
            </p>
            {topObjectives.length > 0 ? (
              <div className="space-y-2.5">
                {topObjectives.map((obj) => (
                  <div key={obj.id} className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <HealthDot health={obj.health} />
                      <span className="text-xs font-medium text-foreground truncate">
                        {obj.title}
                      </span>
                    </div>
                    <ProgressBar value={obj.progress} />
                    <p className="text-[9px] text-muted-foreground">{obj.progress}% complete</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No objectives tracked</p>
            )}

            {/* Health status legend — required by design system rules */}
            {topObjectives.length > 0 && (
              <div className="flex items-center gap-3 mt-3">
                <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-status-success" />
                  On Track
                </span>
                <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-status-warning" />
                  At Risk
                </span>
                <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
                  Off Track
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ==============================================================
            TEAM & BLOCKERS ROW
            ============================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 shrink-0">
          {/* --- Top Contributors --- */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-medium">
              Top Contributors
            </p>
            {topContributors.length > 0 ? (
              <div className="space-y-1.5">
                {topContributors.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-xs text-foreground truncate">{member.name}</span>
                    <span className="shrink-0 text-[10px] font-semibold bg-muted rounded-full px-2 py-0.5 text-muted-foreground">
                      {member.tasksCompleted} tasks
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No team data</p>
            )}
          </div>

          {/* --- Blockers Summary --- */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-medium">
              Blockers
            </p>
            {blockers.length === 0 ? (
              <div className="flex items-center gap-1.5 text-status-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">No blockers</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
                  <span className="text-xs font-semibold text-foreground">
                    {blockers.length} blocker{blockers.length !== 1 && 's'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {severityCounts.critical > 0 && (
                    <span className="text-[10px] font-medium bg-status-error-light text-destructive rounded-full px-2 py-0.5">
                      {severityCounts.critical} critical
                    </span>
                  )}
                  {severityCounts.high > 0 && (
                    <span className="text-[10px] font-medium bg-status-warning-light text-status-warning-dark rounded-full px-2 py-0.5">
                      {severityCounts.high} high
                    </span>
                  )}
                  {severityCounts.other > 0 && (
                    <span className="text-[10px] font-medium bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                      {severityCounts.other} other
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================
          FOOTER BAR
          ================================================================ */}
      <div className="border-t px-6 py-3 flex items-center justify-between shrink-0">
        <p className="text-[10px] text-muted-foreground">
          Generated by <span className="font-semibold">ForgeOS</span> · {generatedDate}
        </p>
        <p className="text-[10px] font-display font-bold text-muted-foreground tracking-wide">
          ForgeOS
        </p>
      </div>
    </div>
  )
}
