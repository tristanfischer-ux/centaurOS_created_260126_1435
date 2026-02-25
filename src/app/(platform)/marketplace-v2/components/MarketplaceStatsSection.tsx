'use client'

/**
 * @file MarketplaceStatsSection.tsx
 * @description Collapsible analytics section for the marketplace page.
 * Shows KPI cards and three charts: manufacturing type distribution (bar),
 * company size breakdown (donut), and regional coverage (bar).
 *
 * FLOW: Stats are computed server-side in getMarketplaceStats() and passed
 * as props from the marketplace page.tsx.
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Factory,
  ShieldCheck,
  Wrench,
  MapPin,
  ChevronDown,
  ChevronUp,
  BarChart3,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from 'recharts'
import { chartColors, getChartColor } from '@/lib/chart-colors'
import type { MarketplaceStats } from '@/actions/marketplace-stats'

interface MarketplaceStatsSectionProps {
  stats: MarketplaceStats
}

// ─── Size color mapping for donut chart ─────────────────────────────────────

const SIZE_COLORS: Record<string, string> = {
  Micro: chartColors[3],     // Amber
  Small: chartColors[2],     // Emerald
  Medium: chartColors[1],    // Electric Blue
  Large: chartColors[0],     // International Orange
  Dormant: 'hsl(var(--muted-foreground))',
  Unknown: 'hsl(var(--muted-foreground) / 0.4)',
}

function getSizeColor(name: string): string {
  return SIZE_COLORS[name] ?? chartColors[4]
}

// ─── Tooltip Components ─────────────────────────────────────────────────────

function BarTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: { name: string; count: number } }>
}) {
  if (!active || !payload || !payload[0]) return null
  const data = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 shadow-lg text-xs">
      <p className="font-medium text-foreground">{data.name}</p>
      <p className="text-muted-foreground mt-0.5">{data.count} suppliers</p>
    </div>
  )
}

function DonutTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ payload: { name: string; count: number } }>
}) {
  if (!active || !payload || !payload[0]) return null
  const data = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 shadow-lg text-xs">
      <p className="font-medium text-foreground">{data.name}</p>
      <p className="text-muted-foreground mt-0.5">{data.count} companies</p>
    </div>
  )
}

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KPICard({ icon: Icon, value, label }: {
  icon: React.ComponentType<{ className?: string }>
  value: string | number
  label: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-international-orange/10">
        <Icon className="h-5 w-5 text-international-orange" />
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight text-foreground">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function MarketplaceStatsSection({ stats }: MarketplaceStatsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const {
    totalListings,
    verifiedCount,
    manufacturingTypes,
    regionCount,
    companyTypeCounts,
    companySizeCounts,
    regionCounts,
  } = stats

  // Don't render if no data
  if (totalListings === 0) return null

  return (
    <Card className="rounded-xl border shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-international-orange/10">
              <BarChart3 className="h-4 w-4 text-international-orange" />
            </div>
            Marketplace Insights
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-muted-foreground"
          >
            {isExpanded ? (
              <>
                Collapse <ChevronUp className="ml-1 h-3 w-3" />
              </>
            ) : (
              <>
                Expand <ChevronDown className="ml-1 h-3 w-3" />
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6 pb-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard icon={Factory} value={totalListings} label="Suppliers" />
            <KPICard icon={ShieldCheck} value={verifiedCount} label="Verified" />
            <KPICard icon={Wrench} value={manufacturingTypes} label="Mfg Types" />
            <KPICard icon={MapPin} value={regionCount} label="Regions" />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Manufacturing Type Distribution — Horizontal Bar */}
            {companyTypeCounts.length > 0 && (
              <Card className="rounded-xl border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Manufacturing Type Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={companyTypeCounts.slice(0, 12)}
                        layout="vertical"
                        margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
                      >
                        <XAxis type="number" hide />
                        <YAxis
                          type="category"
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10 }}
                          width={120}
                        />
                        <Tooltip
                          content={<BarTooltip />}
                          cursor={{ fill: 'hsl(var(--muted))' }}
                        />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
                          {companyTypeCounts.slice(0, 12).map((_, index) => (
                            <Cell
                              key={`type-${index}`}
                              fill={getChartColor(index, true)}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Company Size — Donut Chart */}
            {companySizeCounts.length > 0 && (
              <Card className="rounded-xl border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Company Size
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="h-[280px] relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={companySizeCounts}
                          cx="50%"
                          cy="45%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="count"
                          nameKey="name"
                        >
                          {companySizeCounts.map((entry, index) => (
                            <Cell
                              key={`size-${index}`}
                              fill={getSizeColor(entry.name)}
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<DonutTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center label */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingBottom: '10%' }}>
                      <div className="text-center">
                        <p className="text-lg font-bold text-foreground">
                          {companySizeCounts.reduce((sum, c) => sum + c.count, 0)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Total</p>
                      </div>
                    </div>
                  </div>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-1">
                    {companySizeCounts.map((entry) => (
                      <div key={entry.name} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: getSizeColor(entry.name) }}
                        />
                        {entry.name} ({entry.count})
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Regional Coverage — Horizontal Bar */}
            {regionCounts.length > 0 && (
              <Card className="rounded-xl border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Regional Coverage
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={regionCounts}
                        layout="vertical"
                        margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
                      >
                        <XAxis type="number" hide />
                        <YAxis
                          type="category"
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10 }}
                          width={100}
                        />
                        <Tooltip
                          content={<BarTooltip />}
                          cursor={{ fill: 'hsl(var(--muted))' }}
                        />
                        <Bar
                          dataKey="count"
                          radius={[0, 4, 4, 0]}
                          barSize={16}
                          fill={chartColors[1]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
