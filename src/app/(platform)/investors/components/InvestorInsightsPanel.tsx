/**
 * @file InvestorInsightsPanel.tsx
 *
 * @description Collapsible insights panel for the investor directory.
 * Shows 4 stat cards and 3 charts (subcategory distribution, active deploying
 * donut, top cities) using recharts. Data is pre-aggregated server-side.
 */

"use client"

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Building2, TrendingUp, Globe, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts'
import type { InvestorStats } from '@/actions/investors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvestorInsightsPanelProps {
  stats: InvestorStats
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode
  value: number
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
            {value.toLocaleString()}
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
export function InvestorInsightsPanel({ stats }: InvestorInsightsPanelProps) {
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
    { name: 'Other', value: stats.total - stats.activeDeployingCount },
  ]

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-international-orange" />
          <h2 className="text-sm font-semibold text-foreground">Investor Insights</h2>
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
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<Building2 className="h-4 w-4 text-international-orange" />}
              value={stats.total}
              label="Total firms"
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4 text-international-orange" />}
              value={stats.forgeCapitalCount}
              label="Deep-profiled"
            />
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4 text-international-orange" />}
              value={stats.activeDeployingCount}
              label="Actively deploying"
            />
            <StatCard
              icon={<Globe className="h-4 w-4 text-international-orange" />}
              value={stats.partnerCount}
              label="Partner contacts"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Chart 1: Subcategory Distribution */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Subcategory Distribution
              </p>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={stats.subcategoryBreakdown}
                    margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={140}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: string) => truncate(v, 20)}
                    />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                    <Bar dataKey="count" fill="var(--color-international-orange)" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Active Deploying Donut */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Active Deploying Capital
              </p>
              <div className="h-[220px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={activeDeployingData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={2}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      <Cell fill="hsl(var(--status-success))" />
                      <Cell fill="hsl(var(--muted-foreground) / 0.2)" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                {/* Center text — aligned to cy="50%" */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-foreground">
                    {stats.activeDeployingCount}
                  </span>
                  <span className="text-[10px] text-muted-foreground">active</span>
                </div>
                {/* Legend */}
                <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                    Active ({stats.activeDeployingCount})
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/20" />
                    Other ({stats.total - stats.activeDeployingCount})
                  </span>
                </div>
              </div>
            </div>

            {/* Chart 3: Regional Coverage */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Regional Coverage
              </p>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={stats.regionBreakdown}
                    margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: string) => truncate(v, 16)}
                    />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                    <Bar dataKey="count" fill="var(--color-electric-blue)" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
