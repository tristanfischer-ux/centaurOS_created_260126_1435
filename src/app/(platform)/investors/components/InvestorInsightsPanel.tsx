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
import { Building2, TrendingUp, Globe, CheckCircle2, ChevronDown, ChevronUp, Award } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
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
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

/**
 * Collapsible panel showing investor directory statistics and charts.
 */
export function InvestorInsightsPanel({ stats, filteredFirms, filteredCount, grantsCount = 0 }: InvestorInsightsPanelProps) {
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

  const activeDeployingData = [
    { name: 'Active', value: stats.activeDeployingCount },
    { name: 'Other', value: Math.max(0, stats.total - stats.activeDeployingCount) },
  ]

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
          {/* Row 1: Key stat cards — matching Forge Capital overview */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
            <StatCard
              icon={<Building2 className="h-4 w-4 text-international-orange" />}
              value={stats.total}
              label="Total Investors"
            />
            <StatCard
              icon={<Globe className="h-4 w-4 text-international-orange" />}
              value={stats.withWebsiteCount}
              label="With Websites"
            />
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4 text-international-orange" />}
              value={stats.forgeCapitalCount}
              label="Deep Profiles"
            />
            <StatCard
              icon={<Globe className="h-4 w-4 text-international-orange" />}
              value={stats.partnerCount}
              label="Partners"
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4 text-international-orange" />}
              value={stats.portfolioCompanyCount}
              label="Portfolio Cos"
            />
            <StatCard
              icon={<Award className="h-4 w-4 text-international-orange" />}
              value={grantsCount}
              label="Grants"
            />
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4 text-international-orange" />}
              value={stats.avgQuality.toFixed(1)}
              label="Avg Quality"
            />
          </div>

          {/* Row 2: Type distribution pie chart and Top sectors bar chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Chart: Investors by Type */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Investors by Type
              </p>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.typeBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={1}
                      dataKey="count"
                      strokeWidth={0}
                    >
                      {stats.typeBreakdown.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PALETTE[index % PALETTE.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart: Top Sectors */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Top Sectors
              </p>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={stats.topSectors}
                    margin={{ top: 0, right: 16, bottom: 0, left: 100 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={100}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: string) => truncate(v, 14)}
                    />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                    <Bar dataKey="count" fill={CHART_COLORS.blue} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Row 3: Stage Focus and Data Quality Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Chart: Stage Focus */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Stage Focus Distribution
              </p>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={stats.stageFocusBreakdown}
                    margin={{ top: 0, right: 16, bottom: 0, left: 100 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={100}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: string) => truncate(v, 14)}
                    />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                    <Bar dataKey="count" fill={CHART_COLORS.green} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart: Data Quality Distribution */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Data Quality Distribution
              </p>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.qualityDistribution}
                    margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                  >
                    <XAxis
                      dataKey="range"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                    <Bar dataKey="count" fill={CHART_COLORS.amber} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Row 4: Regional Coverage */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Regional Coverage
            </p>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={stats.regionBreakdown}
                  margin={{ top: 0, right: 16, bottom: 0, left: 10 }}
                >
                  <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) => truncate(v, 16)}
                  />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  <Bar dataKey="count" fill={CHART_COLORS.blue} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
