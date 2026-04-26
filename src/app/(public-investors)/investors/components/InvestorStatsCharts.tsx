/**
 * @file InvestorStatsCharts.tsx
 *
 * @description Forge-Capital-style stat charts displayed below the paste-deck
 * search box on the authenticated /investors page. Visible BEFORE search. Hides
 * after a successful search so results take over the space.
 *
 * Charts shown (ported from Forge Capital dashboard — line 1298 / 1393-1417):
 *   1. Stat tiles            — total / with websites / with portfolio / grants
 *   2. Investors by Type     — donut (55% cutout, legend right)
 *   3. Top Sectors           — horizontal bar (#4f46e5cc, borderRadius 4, no legend)
 *   4. Stage Focus           — vertical bar (#0891b2cc, borderRadius 4, no legend)
 *   5. Grants by Country     — donut (COLORS palette, 55% cutout, legend right)
 *                              Only rendered when stats.grantsByCountry.length > 0
 *
 * Data source: getInvestorDirectoryStats() → marketplace_listings WHERE
 *              category=Finance AND data_source=forge_capital.
 *
 * DECISION: Removed Geographic Focus chart (replaced by Grants by Country to
 * match Forge Capital's conditional grant_country_count > 0 pattern).
 * DECISION: Removed Data Quality Distribution chart (not in Forge Capital spec).
 */

'use client'

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { InvestorDirectoryStats } from '@/actions/investors'

// ── Colour palette — Forge Capital line 1298 ─────────────────────────────────

const COLORS = [
  '#4f46e5',
  '#0891b2',
  '#db2777',
  '#d97706',
  '#059669',
  '#dc2626',
  '#7c3aed',
  '#0284c7',
  '#c026d3',
  '#65a30d',
]

const BAR_COLOR_SECTORS  = '#4f46e5' // indigo-600 (Forge Capital Top Sectors)
const BAR_COLOR_STAGE    = '#0891b2' // cyan-600   (Forge Capital Stage Focus)

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  stats: InvestorDirectoryStats
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card shadow-sm rounded-xl px-5 py-4 text-center">
      <div className="text-2xl font-black text-foreground leading-none mb-1">
        {typeof value === 'number' ? fmt(value) : value}
      </div>
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InvestorStatsCharts({ stats }: Props) {
  return (
    <div className="space-y-6 mt-2 mb-8">
      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <div className="h-5 w-1 bg-muted-foreground/40 rounded-full" />
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Directory overview — {fmt(stats.total)} investors
        </span>
      </div>

      {/* ── Stat tiles ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Total investors"      value={stats.total} />
        <StatTile label="With website"         value={stats.withWebsites} />
        <StatTile label="With portfolio data"  value={stats.withPortfolio} />
        <StatTile label="Grant bodies"         value={stats.grantsCount} />
      </div>

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Investors by Type — donut, 55% cutout, legend right */}
        <div className="bg-card shadow-sm rounded-xl p-5">
          <h4 className="text-sm font-bold text-foreground mb-4">Investors by Type</h4>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={stats.typeBreakdown}
                dataKey="value"
                nameKey="name"
                cx="40%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
              >
                {stats.typeBreakdown.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => [fmt(Number(value)), String(name)]}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => (
                  <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>
                    {value.length > 16 ? value.slice(0, 15) + '…' : value}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top Sectors — horizontal bar, single colour, borderRadius 4, no legend */}
        <div className="bg-card shadow-sm rounded-xl p-5">
          <h4 className="text-sm font-bold text-foreground mb-4">Top Sectors</h4>
          {/* Height grows with item count so all 10 y-axis labels render. */}
          <ResponsiveContainer width="100%" height={Math.max(260, stats.topSectors.length * 26)}>
            <BarChart
              data={stats.topSectors}
              layout="vertical"
              margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={fmt}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                interval={0}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 17) + '…' : v}
              />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => [fmt(Number(value)), 'Investors']}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              {/* Forge Capital: indexAxis:'y', single colour #4f46e5cc, borderRadius:4 */}
              <Bar dataKey="value" fill={BAR_COLOR_SECTORS} fillOpacity={0.8} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Stage Focus — vertical bar, single colour #0891b2cc, borderRadius 4, no legend */}
        <div className="bg-card shadow-sm rounded-xl p-5">
          <h4 className="text-sm font-bold text-foreground mb-4">Stage Focus</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={stats.stageFocus}
              margin={{ top: 0, right: 8, bottom: 24, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={fmt}
              />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => [fmt(Number(value)), 'Investors']}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              {/* Forge Capital: single colour #0891b2cc, borderRadius:4 */}
              <Bar dataKey="value" fill={BAR_COLOR_STAGE} fillOpacity={0.8} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Grants by Country — donut, COLORS palette, 55% cutout, legend right */}
        {/* INTENT: Only rendered when grant_country_count > 0 (Forge Capital conditional) */}
        {stats.grantsByCountry.length > 0 && (
          <div className="bg-card shadow-sm rounded-xl p-5">
            <h4 className="text-sm font-bold text-foreground mb-4">Grants by Country</h4>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={stats.grantsByCountry}
                  dataKey="value"
                  nameKey="name"
                  cx="40%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {stats.grantsByCountry.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any) => [fmt(Number(value)), String(name)]}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>
                      {value.length > 16 ? value.slice(0, 15) + '…' : value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

      </div>
    </div>
  )
}
