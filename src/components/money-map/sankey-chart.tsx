'use client'

/**
 * MoneyMapSankey — Sankey flow diagram showing money flowing from revenue
 * streams through cost categories to net profit/loss per stream.
 *
 * @description The centrepiece visualisation of the Money Map. Nodes on the
 * left represent revenue streams, middle nodes represent cost buckets (direct,
 * indirect, overhead), and right nodes show net margin per stream.
 *
 * @component
 * @example
 * <MoneyMapSankey data={moneyMapData} />
 */

import { useMemo, useState, useCallback } from 'react'
import { Sankey, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'
import { moneyMapColors, getChartColor } from '@/lib/chart-colors'

import type { MoneyMapData, SankeyData } from '@/types/money-map'
import { normaliseToMonthly } from '@/lib/money-map/allocation'

interface MoneyMapSankeyProps {
  /** Full money map data (revenue, costs, links, profitability) */
  data: MoneyMapData
  /** Additional CSS classes */
  className?: string
}

/**
 * Format a currency value for display.
 *
 * @param value - Numeric amount
 * @returns Formatted string like "£12,500"
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Transform MoneyMapData into the { nodes, links } format Recharts Sankey expects.
 *
 * Node layout (left → right):
 *   0..N-1           = Revenue streams
 *   N                = "Direct Costs" bucket
 *   N+1              = "Shared Costs" bucket
 *   N+2              = "Overhead" bucket
 *   N+3..N+3+N-1     = Net per stream
 */
function buildSankeyData(data: MoneyMapData): SankeyData {
  const { revenue_streams, profitability } = data

  if (revenue_streams.length === 0) {
    return { nodes: [], links: [] }
  }

  const nodes: SankeyData['nodes'] = []
  const links: SankeyData['links'] = []

  // Revenue stream nodes (column 0)
  for (const rs of revenue_streams) {
    const monthlyRevenue = normaliseToMonthly(rs.amount, rs.period)
    nodes.push({ name: rs.name, value: monthlyRevenue, category: 'revenue' })
  }

  const N = revenue_streams.length

  // Cost bucket nodes (column 1)
  nodes.push({ name: 'Direct Costs', category: 'direct' })       // index N
  nodes.push({ name: 'Shared Costs', category: 'indirect' })     // index N+1
  nodes.push({ name: 'Overhead', category: 'overhead' })         // index N+2

  // Net margin nodes (column 2) — one per revenue stream
  for (const p of profitability) {
    const label = p.net >= 0
      ? `${p.revenue_stream.name} Profit`
      : `${p.revenue_stream.name} Loss`
    nodes.push({ name: label, value: Math.abs(p.net), category: p.net >= 0 ? 'profit' : 'loss' })
  }

  // Links: Revenue → Cost buckets
  for (let i = 0; i < profitability.length; i++) {
    const p = profitability[i]

    if (p.direct_costs > 0) {
      links.push({ source: i, target: N, value: p.direct_costs })
    }
    if (p.indirect_costs > 0) {
      links.push({ source: i, target: N + 1, value: p.indirect_costs })
    }
    if (p.overhead_costs > 0) {
      links.push({ source: i, target: N + 2, value: p.overhead_costs })
    }
  }

  // Links: Cost buckets → Net margin nodes
  // Aggregate totals per cost bucket to distribute to margin nodes
  for (let i = 0; i < profitability.length; i++) {
    const p = profitability[i]
    const netNodeIdx = N + 3 + i

    // Revenue that flows through to profit (revenue - total costs)
    const monthlyRevenue = normaliseToMonthly(p.revenue_stream.amount, p.revenue_stream.period)
    const flowToNet = Math.max(monthlyRevenue - p.total_costs, 0)

    if (flowToNet > 0) {
      links.push({ source: i, target: netNodeIdx, value: flowToNet })
    }

    // Costs flow from buckets to net node (representing cost impact)
    if (p.direct_costs > 0) {
      links.push({ source: N, target: netNodeIdx, value: p.direct_costs })
    }
    if (p.indirect_costs > 0) {
      links.push({ source: N + 1, target: netNodeIdx, value: p.indirect_costs })
    }
    if (p.overhead_costs > 0) {
      links.push({ source: N + 2, target: netNodeIdx, value: p.overhead_costs })
    }
  }

  return { nodes, links }
}

/**
 * Custom node renderer for the Sankey diagram.
 * Colours nodes based on their category.
 */
function CustomNode(props: Record<string, unknown>): React.ReactElement {
  const { x, y, width, height, index, payload } = props as {
    x: number
    y: number
    width: number
    height: number
    index: number
    payload: { name: string; category?: string; depth?: number }
  }

  const category = payload.category ?? 'default'
  const colorMap: Record<string, string> = {
    revenue: moneyMapColors.revenue,
    direct: moneyMapColors.directCost,
    indirect: moneyMapColors.indirectCost,
    overhead: moneyMapColors.overhead,
    profit: moneyMapColors.profit,
    loss: moneyMapColors.loss,
    default: getChartColor(index),
  }

  const fill = colorMap[category] ?? colorMap.default

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        rx={4}
        ry={4}
      />
      <text
        x={x + width + 8}
        y={y + height / 2}
        dy="0.35em"
        textAnchor="start"
        className="fill-foreground text-xs"
      >
        {payload.name}
      </text>
    </g>
  )
}

export function MoneyMapSankey({ data, className }: MoneyMapSankeyProps): React.ReactElement {
  const [hoveredLink, setHoveredLink] = useState<number | null>(null)

  const sankeyData = useMemo(() => buildSankeyData(data), [data])

  const handleMouseEnter = useCallback(
    (_item: unknown, type: string, _e: unknown) => {
      if (type === 'link') {
        const item = _item as { index?: number }
        setHoveredLink(item.index ?? null)
      }
    },
    []
  )

  const handleMouseLeave = useCallback(() => {
    setHoveredLink(null)
  }, [])

  if (sankeyData.nodes.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-[400px] bg-muted/30 rounded-xl', className)}>
        <p className="text-muted-foreground text-sm">
          Add revenue streams and costs to see your Money Map flow
        </p>
      </div>
    )
  }

  return (
    <div className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={400}>
        <Sankey
          data={sankeyData}
          nodeWidth={16}
          nodePadding={24}
          linkCurvature={0.5}
          iterations={64}
          node={CustomNode as unknown as undefined}
          link={{
            stroke: 'hsl(var(--border))',
            strokeOpacity: 0.4,
          }}
          margin={{ top: 20, right: 160, bottom: 20, left: 20 }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <Tooltip
            content={({ payload }) => {
              if (!payload || payload.length === 0) return null
              const item = payload[0]
              const name = item?.name ?? ''
              const value = item?.value ?? 0
              return (
                <div className="bg-background border rounded-lg shadow-lg px-3 py-2">
                  <p className="text-sm font-medium text-foreground">{name}</p>
                  <p className="text-sm text-muted-foreground">{formatCurrency(Number(value))}/mo</p>
                </div>
              )
            }}
          />
        </Sankey>
      </ResponsiveContainer>
    </div>
  )
}
