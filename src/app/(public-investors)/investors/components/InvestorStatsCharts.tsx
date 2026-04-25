/**
 * @file InvestorStatsCharts.tsx
 *
 * @description Forge-Capital-style stat charts displayed below the paste-deck
 * search box on the authenticated /investors page. Visible BEFORE search. Hides
 * after a successful search so results take over the space.
 *
 * Charts shown (public-facing only — no internal/operational metrics):
 *   1. Stat tiles  — total / with websites / with portfolio / grants
 *   2. Investors by Type  — donut (PieChart with innerRadius)
 *   3. Top Sectors        — horizontal bar chart
 *   4. Stage Distribution — vertical bar chart
 *   5. Geographic Focus   — donut (PieChart with innerRadius)
 *
 * Data source: getInvestorStats() → marketplace_listings WHERE category=Finance
 * AND data_source=forge_capital.
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
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { InvestorDirectoryStats } from '@/actions/investors'

// ── Colour palette ────────────────────────────────────────────────────────────

const DONUT_COLORS = [
  '#ff4500', // international-orange (brand)
  '#f97316', // orange-500
  '#fbbf24', // amber-400
  '#84cc16', // lime-400
  '#22c55e', // green-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#a855f7', // purple-500
  '#ec4899', // pink-500
  '#64748b', // slate-500
]

const BAR_COLOR = '#ff4500' // international-orange

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  stats: InvestorDirectoryStats
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

// ── Custom donut label ─────────────────────────────────────────────────────────

// GOTCHA: Recharts v3 passes all PieLabelRenderProps fields as a single object.
// Using the spread/any pattern avoids the strict intersection type mismatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DonutLabel(props: any) {
  const { cx, cy, midAngle, innerRadius, outerRadius, name, percent } = props as {
    cx: number; cy: number; midAngle: number; innerRadius: number
    outerRadius: number; name: string; value: number; percent: number
  }
  if (percent < 0.04) return null // skip tiny slices
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 1.45
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text
      x={x}
      y={y}
      fill="#64748b"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={10}
      fontFamily="system-ui, sans-serif"
    >
      {name.length > 14 ? name.slice(0, 13) + '…' : name}
    </text>
  )
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-4 text-center">
      <div className="text-2xl font-black text-international-orange leading-none mb-1">
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
        <div className="h-5 w-1 bg-international-orange rounded-full opacity-60" />
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Directory overview — {fmt(stats.total)} investors
        </span>
      </div>

      {/* ── Stat tiles ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Total investors" value={stats.total} />
        <StatTile label="With website" value={stats.withWebsites} />
        <StatTile label="With portfolio data" value={stats.withPortfolio} />
        <StatTile label="Grant bodies" value={stats.grantsCount} />
      </div>

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Investors by Type — donut */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h4 className="text-sm font-bold text-foreground mb-4">Investors by Type</h4>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={stats.typeBreakdown}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                labelLine={false}
                label={(props) => <DonutLabel {...props} />}
              >
                {stats.typeBreakdown.map((_, i) => (
                  <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
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
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Geographic Focus — donut */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h4 className="text-sm font-bold text-foreground mb-4">Geographic Focus</h4>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={stats.geoDistribution}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                labelLine={false}
                label={(props) => <DonutLabel {...props} />}
              >
                {stats.geoDistribution.map((_, i) => (
                  <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
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
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top Sectors — horizontal bar */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h4 className="text-sm font-bold text-foreground mb-4">Top Sectors</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={stats.topSectors}
              layout="vertical"
              margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={fmt} />
              <YAxis
                type="category"
                dataKey="name"
                width={96}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v: string) => v.length > 16 ? v.slice(0, 15) + '…' : v}
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
              <Bar dataKey="value" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Stage Focus — vertical bar */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h4 className="text-sm font-bold text-foreground mb-4">Stage Focus Distribution</h4>
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
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={fmt} />
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
              <Bar dataKey="value" fill={BAR_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
