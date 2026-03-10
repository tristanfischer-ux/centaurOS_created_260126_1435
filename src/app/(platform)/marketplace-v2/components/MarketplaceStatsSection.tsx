'use client'

/**
 * @file MarketplaceStatsSection.tsx
 * @description Collapsible analytics section for the marketplace page.
 * Shows 6 KPI cards and two rows of charts:
 *   Row 1: Subcategory Distribution (bar), Company Size (donut), Regional Coverage (bar)
 *   Row 2: Industry/Sector Breakdown (bar), Certification Distribution (bar), Company Type (bar)
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
  Filter,
  Award,
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
  /** Row 2 chart 1 title (default: "Industry / Sector Breakdown") */
  chart4Title?: string
  /** Row 2 chart 2 title (default: "Certification Distribution") */
  chart5Title?: string
  /** Row 2 chart 3 title (default: "Company Type Distribution") */
  chart6Title?: string
  barTooltipNoun?: string
  donutTooltipNoun?: string
}

interface MarketplaceStatsSectionProps {
  stats: MarketplaceStats
  labels?: StatsLabels
  /** Whether the stats section starts expanded. Defaults to true. */
  defaultExpanded?: boolean
  selectedCompanyTypes?: string[]
  selectedCompanySizes?: string[]
  selectedSubRegions?: string[]
  selectedIndustries?: string[]
  selectedCertifications?: string[]
  selectedSubcategories?: string[]
  onCompanyTypeClick?: (type: string) => void
  onCompanySizeClick?: (size: string) => void
  onRegionClick?: (region: string) => void
  onIndustryClick?: (industry: string) => void
  onCertificationClick?: (certification: string) => void
  onSubcategoryChartClick?: (subcategory: string) => void
  hasActiveFilters?: boolean
  onClearFilters?: () => void
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

// ─── Horizontal Bar Chart (reusable) ────────────────────────────────────────

function HorizontalBarChart({
  data,
  title,
  selectedItems = [],
  onItemClick,
  colorIndex = 0,
  noun = 'suppliers',
  labelWidth = 120,
}: {
  data: { name: string; count: number }[]
  title: string
  selectedItems?: string[]
  onItemClick?: (name: string) => void
  colorIndex?: number
  noun?: string
  labelWidth?: number
}) {
  if (data.length === 0) return null

  return (
    <Card className="rounded-xl border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {title}
          {onItemClick && <span className="text-[10px] text-muted-foreground/60 ml-2">Click to filter</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[200px] sm:h-[240px] md:h-[280px]" role="img" aria-label={`${title} bar chart`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
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
                width={labelWidth}
              />
              <Tooltip
                content={<BarTooltip noun={noun} />}
                cursor={{ fill: 'hsl(var(--muted))' }}
              />
              <Bar
                dataKey="count"
                radius={[0, 4, 4, 0]}
                barSize={16}
                cursor={onItemClick ? 'pointer' : undefined}
                onClick={onItemClick ? (barData) => {
                  const name = barData?.payload?.name as string | undefined
                  if (name) onItemClick(name)
                } : undefined}
              >
                {data.map((entry, index) => {
                  const isSelected = selectedItems.includes(entry.name)
                  const hasSelection = selectedItems.length > 0
                  return (
                    <Cell
                      key={`bar-${index}`}
                      fill={getChartColor(index + colorIndex, true)}
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
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function MarketplaceStatsSection({
  stats,
  labels,
  defaultExpanded,
  selectedCompanyTypes = [],
  selectedCompanySizes = [],
  selectedSubRegions = [],
  selectedIndustries = [],
  selectedCertifications = [],
  selectedSubcategories = [],
  onCompanyTypeClick,
  onCompanySizeClick,
  onRegionClick,
  onIndustryClick,
  onCertificationClick,
  onSubcategoryChartClick,
  hasActiveFilters,
  onClearFilters,
}: MarketplaceStatsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded ?? true)

  const {
    totalListings,
    verifiedCount,
    manufacturingTypes,
    regionCount,
    companyTypeCounts,
    companySizeCounts,
    regionCounts,
    avgCompanyAge,
    subcategoryCounts,
    industryCounts,
    certificationCounts,
    withCertificationsCount,
  } = stats

  // Destructure labels with marketplace defaults
  const {
    sectionTitle = 'Marketplace Insights',
    kpi1Label = 'Suppliers',
    kpi1Icon: kpi1IconName,
    kpi3Label = 'Mfg Types',
    kpi3Icon: kpi3IconName,
    chart2Title = 'Company Size',
    chart3Title = 'Regional Coverage',
    chart4Title = 'Industry / Sector Breakdown',
    chart5Title = 'Certification Distribution',
    chart6Title = 'Company Type Distribution',
    barTooltipNoun = 'suppliers',
    donutTooltipNoun = 'companies',
  } = labels ?? {}

  const KPI1Icon = (kpi1IconName && ICON_MAP[kpi1IconName]) || Factory
  const KPI3Icon = (kpi3IconName && ICON_MAP[kpi3IconName]) || Wrench

  // Avoid re-slicing on every render
  const typeData = useMemo(() => companyTypeCounts.slice(0, 12), [companyTypeCounts])
  const subcategoryData = useMemo(() => subcategoryCounts?.slice(0, 12) ?? [], [subcategoryCounts])

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
          {/* KPI Cards — 6 cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPICard icon={KPI1Icon} value={totalListings} label={kpi1Label} />
            <KPICard icon={ShieldCheck} value={verifiedCount} label="Verified" />
            <KPICard icon={KPI3Icon} value={manufacturingTypes} label={kpi3Label} />
            <KPICard icon={MapPin} value={regionCount} label="Regions" />
            <KPICard icon={Award} value={withCertificationsCount} label="Certified" />
            {avgCompanyAge !== null && (
              <KPICard icon={Calendar} value={`${avgCompanyAge} yrs`} label="Avg. Age" />
            )}
          </div>

          {/* Filter indicator */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-1.5">
              <Filter className="h-3 w-3" />
              <span>Showing filtered view — click chart segments to toggle</span>
              {onClearFilters && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs ml-auto" onClick={onClearFilters}>
                  Clear all
                </Button>
              )}
            </div>
          )}

          {/* Row 1: Subcategory, Company Size, Regional Coverage */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Subcategory Distribution — lead chart */}
            <HorizontalBarChart
              data={subcategoryData}
              title="Subcategory Distribution"
              selectedItems={selectedSubcategories}
              onItemClick={onSubcategoryChartClick}
              colorIndex={0}
              noun={barTooltipNoun}
            />

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
                  <div className="h-[200px] sm:h-[240px] md:h-[280px] relative" role="img" aria-label="Company size breakdown donut chart">
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
            <HorizontalBarChart
              data={regionCounts}
              title={chart3Title}
              selectedItems={selectedSubRegions}
              onItemClick={onRegionClick}
              colorIndex={2}
              noun={barTooltipNoun}
              labelWidth={100}
            />
          </div>

          {/* Row 2: Industry, Certification, Company Type */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Industry/Sector Breakdown */}
            <HorizontalBarChart
              data={industryCounts ?? []}
              title={chart4Title}
              selectedItems={selectedIndustries}
              onItemClick={onIndustryClick}
              colorIndex={4}
              noun={barTooltipNoun}
            />

            {/* Certification Distribution */}
            <HorizontalBarChart
              data={certificationCounts ?? []}
              title={chart5Title}
              selectedItems={selectedCertifications}
              onItemClick={onCertificationClick}
              colorIndex={6}
              noun={barTooltipNoun}
            />

            {/* Company Type Distribution — moved from row 1 */}
            <HorizontalBarChart
              data={typeData}
              title={chart6Title}
              selectedItems={selectedCompanyTypes}
              onItemClick={onCompanyTypeClick}
              colorIndex={0}
              noun={barTooltipNoun}
            />
          </div>
        </CardContent>
      )}
    </Card>
  )
}
