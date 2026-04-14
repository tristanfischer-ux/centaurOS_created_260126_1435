/**
 * @file InvestorInsightsPanel.tsx
 *
 * @description Collapsible insights panel for the investor directory.
 * Shows 6 stat cards and 5 charts (type distribution, top sectors, stage focus,
 * data quality histogram, regional coverage) using recharts. Data is pre-aggregated
 * server-side.
 */

"use client"

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Building2, TrendingUp, Globe, ChevronDown, ChevronUp, Award } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import type { InvestorStats } from '@/actions/investors'

// DECISION: recharts renders SVG fill attributes directly — CSS custom properties
// like `hsl(var(--color-x))` don't resolve in inline SVG attributes. Must use
// actual color values. These match the design system tokens in tailwind.config.ts.
const CHART_COLORS = {
  orange: '#ff4500',      // international-orange
  blue: '#3b82f6',        // electric-blue
  green: '#22c55e',       // success
  amber: '#f59e0b',       // warning
  red: '#ef4444',         // destructive
  muted: '#94a3b8',       // muted-foreground (slate-400)
} as const
const PALETTE = Object.values(CHART_COLORS)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvestorInsightsPanelProps {
  stats: InvestorStats
  /** When provided, shows "Filtered: X of Y" and computes stats from this subset */
  filteredFirms?: { attributes: Record<string, unknown> }[]
  filteredCount?: number
  /** Grants count from investor_grants table */
  grantsCount?: number
  /** Deduplicated portfolio company count (from RPC). Overrides stats.portfolioCompanyCount
   * which is a raw row count of the join table and inflates the displayed value. */
  portfolioCompanyCount?: number
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode
  value: number | string
  label: string
}

function StatCard({ icon, value, label }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-international-orange/10 shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground leading-none">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Truncates long tick labels so they fit within the fixed Y-axis width.
function truncate(s: string, max = 20): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

// User-preferred chronological bucketing for the stage-focus chart.
// Series C, Series D, Growth, and Late Stage all collapse into a single
// "Growth & Late Stage" bucket (per 2026-04-14 feedback — individual late
// series have tiny counts and muddy the early-stage signal).
// Final order (top-down): Pre-Seed → Seed → Series A → Series B → Growth & Late Stage.
const STAGE_ORDER: string[] = ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Growth & Late Stage']
const LATE_STAGE_SOURCES = new Set(['series c', 'series d', 'growth', 'late stage'])
const GROWTH_BUCKET = 'Growth & Late Stage'

function normaliseStageAndBucket<T extends { name: string; count: number }>(rows: T[]): Array<{ name: string; count: number }> {
  const merged = new Map<string, number>()
  for (const r of rows) {
    const key = LATE_STAGE_SOURCES.has(r.name.toLowerCase()) ? GROWTH_BUCKET : r.name
    merged.set(key, (merged.get(key) ?? 0) + r.count)
  }
  const out = Array.from(merged, ([name, count]) => ({ name, count }))
  const idx = (n: string) => {
    const i = STAGE_ORDER.findIndex(s => s.toLowerCase() === n.toLowerCase())
    return i === -1 ? STAGE_ORDER.length : i
  }
  return out.sort((a, b) => idx(a.name) - idx(b.name))
}

/**
 * Collapsible panel showing investor directory statistics and charts.
 */
export function InvestorInsightsPanel({ stats, filteredCount, grantsCount = 0, portfolioCompanyCount }: InvestorInsightsPanelProps) {
  // DECISION: Persist collapse state to localStorage so the user's preference
  // survives navigation and page refreshes.
  // GOTCHA: Read localStorage in useEffect (not useState initialiser) to avoid
  // SSR/client hydration mismatch — server always renders expanded, client
  // syncs after mount.
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('investor-insights-collapsed') === '1')
    } catch { /* Safari private mode */ }
  }, [])

  const handleToggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('investor-insights-collapsed', next ? '1' : '0') } catch {}
      return next
    })
  }, [])

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-international-orange" />
          <h2 className="text-sm font-semibold text-foreground">Investor Insights</h2>
          {filteredCount != null && filteredCount < stats.total && (
            <span className="text-xs text-muted-foreground ml-2">
              Filtered: {filteredCount} of {stats.total}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggle}
          className="text-muted-foreground h-7 gap-1 text-xs"
        >
          {collapsed ? (
            <>Expand <ChevronDown className="h-3.5 w-3.5" /></>
          ) : (
            <>Collapse <ChevronUp className="h-3.5 w-3.5" /></>
          )}
        </Button>
      </div>

      {!collapsed && (
        <div className="p-5 space-y-6">
          {/* Row 1: Key stat cards — four core metrics only, per user preference */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<Building2 className="h-4 w-4 text-international-orange" />}
              value={stats.total}
              label="Total Investors"
            />
            <StatCard
              icon={<Globe className="h-4 w-4 text-international-orange" />}
              value={stats.partnerCount}
              label="Partners"
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4 text-international-orange" />}
              value={portfolioCompanyCount ?? stats.portfolioCompanyCount}
              label="Portfolio Cos"
            />
            <StatCard
              icon={<Award className="h-4 w-4 text-international-orange" />}
              value={grantsCount}
              label="Grants"
            />
          </div>

          {/* Charts: uniform 320px-tall cards in a 2-up grid; geographic spans full width */}
          {(() => {
            const CHART_HEIGHT = 'h-[320px]'
            const BAR_MARGIN = { top: 8, right: 16, bottom: 8, left: 8 }
            const Y_AXIS_WIDTH = 110
            const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
              <div className="rounded-lg border border-border bg-background/40 p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground tracking-wide">{title}</p>
                <div className={CHART_HEIGHT}>
                  <ResponsiveContainer width="100%" height="100%">
                    {children as React.ReactElement}
                  </ResponsiveContainer>
                </div>
              </div>
            )
            return (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <ChartCard title="Investors by Type">
                    <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                      <Pie
                        data={stats.typeBreakdown}
                        cx="50%"
                        cy="45%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={1}
                        dataKey="count"
                        strokeWidth={0}
                      >
                        {stats.typeBreakdown.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                      <Legend
                        layout="horizontal"
                        align="center"
                        verticalAlign="bottom"
                        iconSize={8}
                        iconType="circle"
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      />
                    </PieChart>
                  </ChartCard>

                  <ChartCard title="Top Sectors">
                    <BarChart layout="vertical" data={stats.topSectors} margin={BAR_MARGIN}>
                      <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={Y_AXIS_WIDTH}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: string) => truncate(v, 16)}
                      />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                      <Bar dataKey="count" fill={CHART_COLORS.blue} radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ChartCard>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <ChartCard title="Stage Focus Distribution">
                    <BarChart layout="vertical" data={normaliseStageAndBucket(stats.stageFocusBreakdown)} margin={BAR_MARGIN}>
                      <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={Y_AXIS_WIDTH}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: string) => truncate(v, 16)}
                      />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                      <Bar dataKey="count" fill={CHART_COLORS.green} radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ChartCard>

                  <ChartCard title="Geographic Distribution">
                    <BarChart layout="vertical" data={stats.regionBreakdown} margin={BAR_MARGIN}>
                      <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={Y_AXIS_WIDTH}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: string) => truncate(v, 16)}
                      />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                      <Bar dataKey="count" fill={CHART_COLORS.blue} radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ChartCard>
                </div>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
