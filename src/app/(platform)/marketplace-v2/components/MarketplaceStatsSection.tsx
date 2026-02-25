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

import { useState, useMemo } from 'react'
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
  Calendar,
  Users,
  Briefcase,
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

// ─── Icon lookup (serialisable string → component) ──────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  factory: Factory,
  wrench: Wrench,
  users: Users,
  briefcase: Briefcase,
  shieldCheck: ShieldCheck,
  mapPin: MapPin,
  calendar: Calendar,
}

// ─── Configurable Labels ─────────────────────────────────────────────────────

export interface StatsLabels {
  sectionTitle?: string
  kpi1Label?: string
  /** Icon name key — resolved via ICON_MAP in this client component */
  kpi1Icon?: string
  kpi3Label?: string
  /** Icon name key — resolved via ICON_MAP in this client component */
  kpi3Icon?: string
  chart1Title?: string
  chart2Title?: string
  chart3Title?: string
  barTooltipNoun?: string
  donutTooltipNoun?: string
}

interface MarketplaceStatsSectionProps {
  stats: MarketplaceStats
  labels?: StatsLabels
  selectedCompanyTypes?: string[]
  selectedCompanySizes?: string[]
  selectedSubRegions?: string[]
  onCompanyTypeClick?: (type: string) => void
  onCompanySizeClick?: (size: string) => void
  onRegionClick?: (region: string) => void
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

function getSizeColor(name: string, index?: number): string {
  return SIZE_COLORS[name] ?? (index !== undefined ? getChartColor(index) : chartColors[4])
}

// ─── Tooltip Components ─────────────────────────────────────────────────────

function BarTooltip({ active, payload, noun = 'suppliers' }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: { name: string; count: number } }>
  noun?: string
}) {
  if (!active || !payload || !payload[0]) return null
  const data = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 shadow-lg text-xs">
      <p className="font-medium text-foreground">{data.name}</p>
      <p className="text-muted-foreground mt-0.5">{data.count} {noun}</p>
    </div>
  )
}

function DonutTooltip({ active, payload, noun = 'companies' }: {
  active?: boolean
  payload?: Array<{ payload: { name: string; count: number } }>
  noun?: string
}) {
  if (!active || !payload || !payload[0]) return null
  const data = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 shadow-lg text-xs">
      <p className="font-medium text-foreground">{data.name}</p>
      <p className="text-muted-foreground mt-0.5">{data.count} {noun}</p>
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

export function MarketplaceStatsSection({
  stats,
  labels,
  selectedCompanyTypes = [],
  selectedCompanySizes = [],
  selectedSubRegions = [],
  onCompanyTypeClick,
  onCompanySizeClick,
  onRegionClick,
}: MarketplaceStatsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const {
    totalListings,
    verifiedCount,
    manufacturingTypes,
    regionCount,
    companyTypeCounts,
    companySizeCounts,
    regionCounts,
    avgCompanyAge,
  } = stats

  // Destructure labels with marketplace defaults
  const {
    sectionTitle = 'Marketplace Insights',
    kpi1Label = 'Suppliers',
    kpi1Icon: kpi1IconName,
    kpi3Label = 'Mfg Types',
    kpi3Icon: kpi3IconName,
    chart1Title = 'Manufacturing Type Distribution',
    chart2Title = 'Company Size',
    chart3Title = 'Regional Coverage',
    barTooltipNoun = 'suppliers',
    donutTooltipNoun = 'companies',
  } = labels ?? {}

  const KPI1Icon = (kpi1IconName && ICON_MAP[kpi1IconName]) || Factory
  const KPI3Icon = (kpi3IconName && ICON_MAP[kpi3IconName]) || Wrench

  // Fix 6: avoid re-slicing on every render
  const typeData: { name: string; count: number }[] = useMemo(() => companyTypeCounts.slice(0, 12), [companyTypeCounts])

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
            {sectionTitle}
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
          <div className={`grid grid-cols-2 gap-3 ${avgCompanyAge !== null ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
            <KPICard icon={KPI1Icon} value={totalListings} label={kpi1Label} />
            <KPICard icon={ShieldCheck} value={verifiedCount} label="Verified" />
            <KPICard icon={KPI3Icon} value={manufacturingTypes} label={kpi3Label} />
            <KPICard icon={MapPin} value={regionCount} label="Regions" />
            {avgCompanyAge !== null && (
              <KPICard icon={Calendar} value={`${avgCompanyAge} yrs`} label="Avg. Age" />
            )}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Manufacturing Type Distribution — Horizontal Bar */}
            {companyTypeCounts.length > 0 && (
              <Card className="rounded-xl border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    {chart1Title}
                    {onCompanyTypeClick && <span className="text-[10px] text-muted-foreground/60 ml-2">Click to filter</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={typeData}
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
                          content={<BarTooltip noun={barTooltipNoun} />}
                          cursor={{ fill: 'hsl(var(--muted))' }}
                        />
                        <Bar
                          dataKey="count"
                          radius={[0, 4, 4, 0]}
                          barSize={16}
                          cursor={onCompanyTypeClick ? 'pointer' : undefined}
                          onClick={onCompanyTypeClick ? (data) => {
                            const name = data?.payload?.name as string | undefined
                            if (name) onCompanyTypeClick(name)
                          } : undefined}
                        >
                          {typeData.map((entry, index) => {
                            const isSelected = selectedCompanyTypes.includes(entry.name)
                            const hasSelection = selectedCompanyTypes.length > 0
                            return (
                              <Cell
                                key={`type-${index}`}
                                fill={getChartColor(index, true)}
                                fillOpacity={hasSelection ? (isSelected ? 1 : 0.3) : 1}
                                stroke={isSelected ? 'hsl(var(--foreground))' : 'none'}
                                strokeWidth={isSelected ? 1.5 : 0}
                              />
                            )
                          })}
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
                    {chart2Title}
                    {onCompanySizeClick && <span className="text-[10px] text-muted-foreground/60 ml-2">Click to filter</span>}
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
                          cursor={onCompanySizeClick ? 'pointer' : undefined}
                          onClick={onCompanySizeClick ? (data: { name: string }) => {
                            if (data?.name) onCompanySizeClick(data.name)
                          } : undefined}
                        >
                          {companySizeCounts.map((entry, index) => {
                            const isSelected = selectedCompanySizes.includes(entry.name)
                            const hasSelection = selectedCompanySizes.length > 0
                            return (
                              <Cell
                                key={`size-${index}`}
                                fill={getSizeColor(entry.name, index)}
                                fillOpacity={hasSelection ? (isSelected ? 1 : 0.3) : 1}
                                stroke={isSelected ? 'hsl(var(--foreground))' : 'none'}
                                strokeWidth={isSelected ? 2 : 0}
                              />
                            )
                          })}
                        </Pie>
                        <Tooltip content={<DonutTooltip noun={donutTooltipNoun} />} />
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
                    {companySizeCounts.map((entry, index) => {
                      const isSelected = selectedCompanySizes.includes(entry.name)
                      const hasSelection = selectedCompanySizes.length > 0
                      return (
                        <button
                          key={entry.name}
                          type="button"
                          onClick={() => onCompanySizeClick?.(entry.name)}
                          className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          style={{ opacity: hasSelection && !isSelected ? 0.4 : 1 }}
                        >
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{
                              backgroundColor: getSizeColor(entry.name, index),
                              outline: isSelected ? '2px solid hsl(var(--foreground))' : 'none',
                              outlineOffset: '1px',
                            }}
                          />
                          <span className={isSelected ? 'font-medium text-foreground' : ''}>
                            {entry.name} ({entry.count})
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Regional Coverage — Horizontal Bar */}
            {regionCounts.length > 0 && (
              <Card className="rounded-xl border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    {chart3Title}
                    {onRegionClick && <span className="text-[10px] text-muted-foreground/60 ml-2">Click to filter</span>}
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
                          content={<BarTooltip noun={barTooltipNoun} />}
                          cursor={{ fill: 'hsl(var(--muted))' }}
                        />
                        <Bar
                          dataKey="count"
                          radius={[0, 4, 4, 0]}
                          barSize={16}
                          cursor={onRegionClick ? 'pointer' : undefined}
                          onClick={onRegionClick ? (data) => {
                            const name = data?.payload?.name as string | undefined
                            if (name) onRegionClick(name)
                          } : undefined}
                        >
                          {regionCounts.map((entry, index) => {
                            const isSelected = selectedSubRegions.includes(entry.name)
                            const hasSelection = selectedSubRegions.length > 0
                            return (
                              <Cell
                                key={`region-${index}`}
                                fill={chartColors[1]}
                                fillOpacity={hasSelection ? (isSelected ? 1 : 0.3) : 1}
                                stroke={isSelected ? 'hsl(var(--foreground))' : 'none'}
                                strokeWidth={isSelected ? 1.5 : 0}
                              />
                            )
                          })}
                        </Bar>
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
