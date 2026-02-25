'use client'

/**
 * @file report-visuals.tsx
 *
 * @description Shared visual primitives used across report sections and the
 * infographic view. Extracted from ReportInfographic.tsx so both the full
 * document view and the dense infographic share the same visual language.
 *
 * @related
 * - src/components/reports/ReportInfographic.tsx — Dense infographic view
 * - src/components/reports/ReportDocument.tsx — Full document renderer
 * - src/components/reports/sections/ — Individual section renderers
 */

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

import { cn } from '@/lib/utils'

import type { ReportTemplateId } from '@/lib/reports/report-document-types'

// ---------------------------------------------------------------------------
// Section Narrative Intro
// ---------------------------------------------------------------------------

interface SectionNarrativeIntroProps {
  narrative?: string
}

/**
 * @description Subtle styled intro paragraph for AI-generated section narratives.
 * Renders nothing if no narrative is provided.
 */
export function SectionNarrativeIntro({ narrative }: SectionNarrativeIntroProps): React.JSX.Element | null {
  if (!narrative) return null

  return (
    <p className="text-sm leading-relaxed text-muted-foreground italic">
      {narrative}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Sparkline Mini Bar
// ---------------------------------------------------------------------------

interface MiniBarProps {
  heightPercent: number
  color: 'orange' | 'blue' | 'muted'
}

/**
 * @description Tiny vertical bar for sparkline-style mini charts.
 * Used in metric cards and trend visualizations.
 */
export function MiniBar({ heightPercent, color }: MiniBarProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'w-1.5 rounded-full transition-all',
        color === 'orange' && 'bg-international-orange',
        color === 'blue' && 'bg-electric-blue',
        color === 'muted' && 'bg-muted-foreground/25',
      )}
      style={{ height: `${Math.max(heightPercent, 4)}%` }}
    />
  )
}

// ---------------------------------------------------------------------------
// Progress Bar
// ---------------------------------------------------------------------------

interface ProgressBarProps {
  value: number
  className?: string
  color?: 'orange' | 'success' | 'warning' | 'destructive' | 'muted'
}

/**
 * @description Thin horizontal progress bar with percentage fill.
 * Color adapts to health status or defaults to orange brand.
 */
export function ProgressBar({ value, className, color = 'orange' }: ProgressBarProps): React.JSX.Element {
  const clamped = Math.min(100, Math.max(0, value))
  const colorClass = {
    orange: 'bg-international-orange',
    success: 'bg-status-success',
    warning: 'bg-status-warning',
    destructive: 'bg-destructive',
    muted: 'bg-muted-foreground',
  }[color]

  return (
    <div className={cn('h-1.5 w-full rounded-full bg-muted', className)}>
      <div
        className={cn('h-full rounded-full transition-all', colorClass)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trend Arrow
// ---------------------------------------------------------------------------

interface TrendArrowProps {
  trend: 'up' | 'down' | 'stable'
  changePercent: number
  className?: string
}

/**
 * @description Up/down/stable trend indicator with semantic color.
 */
export function TrendArrow({ trend, changePercent, className }: TrendArrowProps): React.JSX.Element {
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-semibold',
        trend === 'up' && 'text-status-success',
        trend === 'down' && 'text-destructive',
        trend === 'stable' && 'text-muted-foreground',
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {changePercent !== 0 && (
        <span>{changePercent > 0 ? '+' : ''}{changePercent.toFixed(0)}%</span>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Health Dot
// ---------------------------------------------------------------------------

/**
 * @description Small colored dot for objective health status.
 */
export function HealthDot({ health }: { health: string }): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full shrink-0',
        health === 'on-track' && 'bg-status-success',
        health === 'completed' && 'bg-status-success',
        health === 'at-risk' && 'bg-status-warning',
        health === 'off-track' && 'bg-destructive',
        health === 'not-started' && 'bg-muted-foreground/40',
      )}
    />
  )
}

// ---------------------------------------------------------------------------
// Section Header
// ---------------------------------------------------------------------------

interface ReportSectionHeaderProps {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  templateId?: ReportTemplateId
  sectionNumber?: number
}

/**
 * @description Consistent section header for report document view.
 * Board Pack gets numbered headings; all templates get icons.
 */
export function ReportSectionHeader({
  title,
  icon: Icon,
  templateId,
  sectionNumber,
}: ReportSectionHeaderProps): React.JSX.Element {
  const showNumber = templateId === 'board-pack' && sectionNumber != null

  return (
    <div className="flex items-center gap-3">
      <div className="h-6 w-1 rounded-full bg-international-orange" />
      {Icon && (
        <Icon className="h-5 w-5 text-international-orange" />
      )}
      <h2 className="text-2xl font-display font-bold text-foreground">
        {showNumber && (
          <span className="text-muted-foreground font-normal mr-1">{sectionNumber}.</span>
        )}
        {title}
      </h2>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat Callout Card
// ---------------------------------------------------------------------------

interface StatCalloutProps {
  value: string
  label: string
  trend?: 'up' | 'down' | 'stable'
  changePercent?: number
  size?: 'sm' | 'md' | 'lg'
}

/**
 * @description Large-number stat callout for visual impact.
 * Used as hero metrics, pull-quotes, and summary stats.
 */
export function StatCallout({ value, label, trend, changePercent, size = 'md' }: StatCalloutProps): React.JSX.Element {
  const textSize = {
    sm: 'text-2xl',
    md: 'text-4xl',
    lg: 'text-5xl',
  }[size]

  return (
    <div className="text-center py-3">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
        {label}
      </p>
      <div className="flex items-center justify-center gap-3">
        <span className={cn(textSize, 'font-bold text-foreground leading-none font-display')}>
          {value}
        </span>
        {trend && changePercent != null && (
          <TrendArrow trend={trend} changePercent={changePercent} className="text-sm" />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sparkline Chart
// ---------------------------------------------------------------------------

interface SparklineProps {
  data: number[]
  color?: 'orange' | 'blue' | 'muted'
  height?: number
  className?: string
}

/**
 * @description Inline sparkline bar chart for trend visualization.
 * Renders as a row of tiny bars proportional to the max value.
 */
export function Sparkline({ data, color = 'orange', height = 32, className }: SparklineProps): React.JSX.Element {
  const max = Math.max(...data, 1)

  return (
    <div className={cn('flex items-end gap-[2px]', className)} style={{ height }}>
      {data.map((value, i) => (
        <div
          key={i}
          className={cn(
            'flex-1 rounded-full min-w-[2px] transition-all',
            color === 'orange' && 'bg-international-orange',
            color === 'blue' && 'bg-electric-blue',
            color === 'muted' && 'bg-muted-foreground/30',
          )}
          style={{ height: `${Math.max((value / max) * 100, 6)}%` }}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Metric format helper
// ---------------------------------------------------------------------------

/**
 * @description Formats a numeric metric value based on its format type.
 */
export function formatMetricValue(value: number, format: 'percentage' | 'number' | 'decimal' | 'currency'): string {
  switch (format) {
    case 'percentage':
      return `${Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)}%`
    case 'decimal':
      return Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(value)
    case 'currency':
      return `£${Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100)}`
    case 'number':
    default:
      return Intl.NumberFormat('en-US').format(value)
  }
}

/**
 * @description Formats a pence value to a human-readable currency string.
 * Used by financial report sections.
 */
export function formatPence(pence: number): string {
  return `£${Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(pence / 100)}`
}
