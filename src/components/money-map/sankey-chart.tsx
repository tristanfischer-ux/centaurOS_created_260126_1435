'use client'

/**
 * MoneyMapSankey — Income statement-style Sankey flow diagram.
 *
 * @description Visualises the company's income statement as a left-to-right
 * waterfall flow: Revenue Sources → Revenue → Gross Profit → Operating Profit
 * → Net Profit, with cost branches diverging downward at each deduction stage.
 *
 * Income flows are green, cost flows are red. Inspired by the income statement
 * Sankey style popularised by App Economy Insights.
 *
 * @component
 * @example
 * <MoneyMapSankey data={moneyMapData} />
 */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'

import type { MoneyMapData } from '@/types/money-map'
import { normaliseToMonthly } from '@/lib/money-map/allocation'

// ============================================================
// Constants
// ============================================================

/** SVG viewBox dimensions */
const VB_W = 1020
const VB_H = 620

/** Main cascade area */
const FLOW_TOP = 50
const MAX_BAR_H = 280
const BAR_W = 20

/** Revenue source bars */
const SRC_BAR_W = 40
const SRC_BAR_X = 90
const SRC_LABEL_END = 84 // x for right-aligned source labels

/** Cascade column left-edge x positions */
const COL_REV = 210
const COL_GP = 420
const COL_OP = 630
const COL_NP = 840

/** Cost area */
const COST_Y = 395
const COST_BAR_W = 16
const COST_BAR_MAX_H = 80
const COST_X_DC = 260
const COST_X_SC = 470
const COST_X_OH = 680

/** Colour palette — green for income, red for costs */
const C = {
  incomeBar: '#059669',
  incomeBarLight: '#34d399',
  incomeFlow: 'rgba(16, 185, 129, 0.38)',
  costBar: '#dc2626',
  costBarLight: '#f87171',
  costFlow: 'rgba(239, 68, 68, 0.38)',
  lossBar: '#dc2626',
  textDark: '#1e293b',
  textMuted: '#64748b',
  textLight: '#94a3b8',
} as const

// ============================================================
// Types
// ============================================================

interface WaterfallData {
  totalRevenue: number
  directCosts: number
  grossProfit: number
  sharedCosts: number
  operatingProfit: number
  overhead: number
  netProfit: number
  sources: Array<{ name: string; amount: number }>
  directItems: Array<{ name: string; amount: number }>
  sharedItems: Array<{ name: string; amount: number }>
  overheadItems: Array<{ name: string; amount: number }>
}

interface MoneyMapSankeyProps {
  /** Full money map data (revenue, costs, links, profitability) */
  data: MoneyMapData
  /** Additional CSS classes */
  className?: string
}

// ============================================================
// Helpers
// ============================================================

/**
 * Format a currency value for compact display.
 *
 * @param value - Numeric amount
 * @returns Formatted string like "£12k" or "£1.2M"
 */
function fmtCompact(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(0)}k`
  return `${sign}£${abs.toFixed(0)}`
}

/**
 * Format a full currency value for tooltips.
 *
 * @param value - Numeric amount
 * @returns Formatted string like "£12,500"
 */
function fmtFull(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Compute percentage as a string.
 *
 * @param part - Numerator
 * @param whole - Denominator
 * @returns Percentage string like "60%"
 */
function pct(part: number, whole: number): string {
  if (whole === 0) return '0%'
  return `${Math.round((part / whole) * 100)}%`
}

/**
 * Compute the income-statement waterfall from raw MoneyMapData.
 *
 * @param data - Full money map state
 * @returns Computed waterfall values and grouped cost items
 */
function computeWaterfall(data: MoneyMapData): WaterfallData {
  const { summary, revenue_streams, cost_items } = data

  const totalRevenue = summary.total_revenue
  const directCosts = summary.total_direct_costs
  const grossProfit = Math.max(totalRevenue - directCosts, 0)
  const sharedCosts = summary.total_indirect_costs
  const operatingProfit = Math.max(grossProfit - sharedCosts, 0)
  const overhead = summary.total_overhead_costs
  const netProfit = operatingProfit - overhead

  const sources = revenue_streams.map((rs) => ({
    name: rs.name,
    amount: normaliseToMonthly(rs.amount, rs.period),
  }))

  const groupByType = (type: string): Array<{ name: string; amount: number }> =>
    cost_items
      .filter((c) => c.cost_type === type)
      .map((c) => ({ name: c.name, amount: normaliseToMonthly(c.amount, c.period) }))
      .sort((a, b) => b.amount - a.amount)

  return {
    totalRevenue,
    directCosts,
    grossProfit,
    sharedCosts,
    operatingProfit,
    overhead,
    netProfit,
    sources,
    directItems: groupByType('direct'),
    sharedItems: groupByType('indirect'),
    overheadItems: groupByType('overhead'),
  }
}

/**
 * Generate a Sankey flow path between two vertical ranges.
 * Creates a smooth S-curve connecting left edge to right edge.
 *
 * @param x1 - Source x (right edge of source bar)
 * @param y1t - Source top y
 * @param y1b - Source bottom y
 * @param x2 - Target x (left edge of target bar)
 * @param y2t - Target top y
 * @param y2b - Target bottom y
 * @returns SVG path d-attribute string
 */
function flowPath(
  x1: number, y1t: number, y1b: number,
  x2: number, y2t: number, y2b: number,
): string {
  const mx = (x1 + x2) / 2
  return [
    `M ${x1} ${y1t}`,
    `C ${mx} ${y1t}, ${mx} ${y2t}, ${x2} ${y2t}`,
    `L ${x2} ${y2b}`,
    `C ${mx} ${y2b}, ${mx} ${y1b}, ${x1} ${y1b}`,
    'Z',
  ].join(' ')
}

// ============================================================
// Sub-components
// ============================================================

/**
 * Render a cost bucket section (bar + label + individual items).
 */
function CostSection({
  label,
  total,
  totalRevenue,
  items,
  x,
  y,
  barH,
}: {
  label: string
  total: number
  totalRevenue: number
  items: Array<{ name: string; amount: number }>
  x: number
  y: number
  barH: number
}): React.ReactElement | null {
  if (total <= 0) return null

  const maxItemAmount = Math.max(...items.map((i) => i.amount), 1)
  const MAX_MINI_W = 50
  const itemX = x + COST_BAR_W + 8

  return (
    <g>
      {/* Cost bucket bar */}
      <rect x={x} y={y} width={COST_BAR_W} height={barH} fill={C.costBar} rx={3}>
        <title>{label}: {fmtFull(total)}/mo ({pct(total, totalRevenue)} of revenue)</title>
      </rect>

      {/* Bucket label */}
      <text x={itemX} y={y + 11} fontSize={10} fontWeight={700} fill={C.costBar}>
        {label}
      </text>
      <text x={itemX} y={y + 24} fontSize={8.5} fill={C.textMuted}>
        {fmtCompact(total)} · {pct(total, totalRevenue)} of revenue
      </text>

      {/* Individual cost items */}
      {items.slice(0, 4).map((item, i) => {
        const barW = Math.max((item.amount / maxItemAmount) * MAX_MINI_W, 4)
        const iy = y + 38 + i * 16
        return (
          <g key={i}>
            <rect
              x={itemX}
              y={iy}
              width={barW}
              height={8}
              fill={C.costBarLight}
              rx={2}
              opacity={0.55}
            />
            <text x={itemX + barW + 5} y={iy + 7} fontSize={7.5} fill={C.textMuted}>
              {item.name} {fmtCompact(item.amount)}
            </text>
            <title>{item.name}: {fmtFull(item.amount)}/mo</title>
          </g>
        )
      })}
      {items.length > 4 && (
        <text
          x={itemX + 4}
          y={y + 38 + 4 * 16 + 8}
          fontSize={7}
          fill={C.textLight}
        >
          &amp; {items.length - 4} more
        </text>
      )}
    </g>
  )
}

// ============================================================
// Main Component
// ============================================================

export function MoneyMapSankey({ data, className }: MoneyMapSankeyProps): React.ReactElement {
  const wf = useMemo(() => computeWaterfall(data), [data])

  // ---- Empty state ----
  if (wf.totalRevenue === 0) {
    return (
      <div className={cn('flex items-center justify-center h-[400px] bg-muted/30 rounded-xl', className)}>
        <p className="text-muted-foreground text-sm">
          Add revenue streams and costs to see your Money Map flow
        </p>
      </div>
    )
  }

  // ---- Scaling ----
  const scale = MAX_BAR_H / wf.totalRevenue
  const revH = wf.totalRevenue * scale
  const gpH = wf.grossProfit * scale
  const opH = wf.operatingProfit * scale
  const npH = Math.max(Math.abs(wf.netProfit) * scale, 0)
  const isProfit = wf.netProfit >= 0

  // Cost bar heights (separate scale for readability)
  const maxCostAmt = Math.max(wf.directCosts, wf.sharedCosts, wf.overhead, 1)
  const costScale = COST_BAR_MAX_H / maxCostAmt
  const dcBarH = wf.directCosts > 0 ? Math.max(wf.directCosts * costScale, 20) : 0
  const scBarH = wf.sharedCosts > 0 ? Math.max(wf.sharedCosts * costScale, 20) : 0
  const ohBarH = wf.overhead > 0 ? Math.max(wf.overhead * costScale, 20) : 0

  // ---- Cascade bar Y positions (top-aligned) ----
  const revY1 = FLOW_TOP
  const revY2 = FLOW_TOP + revH
  const gpY1 = FLOW_TOP
  const gpY2 = FLOW_TOP + gpH
  const opY1 = FLOW_TOP
  const opY2 = FLOW_TOP + opH
  const npY1 = FLOW_TOP
  const npY2 = FLOW_TOP + Math.max(npH, 6) // minimum visibility

  // ---- Right/left edges of bars ----
  const revR = COL_REV + BAR_W
  const gpR = COL_GP + BAR_W
  const opR = COL_OP + BAR_W

  // ---- Revenue source bars (stacked with gaps) ----
  const srcGap = 4
  const totalSrcGaps = Math.max(wf.sources.length - 1, 0) * srcGap
  const availSrcH = revH - totalSrcGaps
  let runningY = FLOW_TOP

  const srcBars = wf.sources.map((src) => {
    const h = Math.max((src.amount / wf.totalRevenue) * availSrcH, 6)
    const y = runningY
    runningY += h + srcGap
    return { ...src, y, h }
  })

  // Where each source maps onto the Revenue bar (no gaps)
  let revRunY = FLOW_TOP
  const srcTargets = wf.sources.map((src) => {
    const h = (src.amount / wf.totalRevenue) * revH
    const y = revRunY
    revRunY += h
    return { y, h }
  })

  // ---- Flow split positions on cascade bars ----
  // Revenue bar: top gpH → GP (green), bottom (revH - gpH) → DC (red)
  const revGpSplit = FLOW_TOP + gpH

  // GP bar: top opH → OP (green), bottom (gpH - opH) → SC (red)
  const gpOpSplit = gpH > 0 ? FLOW_TOP + opH : FLOW_TOP

  // OP bar: top npH → NP (green if profit), bottom (opH - npH) → OH (red)
  const opNpSplit = opH > 0 && isProfit ? FLOW_TOP + npH : FLOW_TOP

  return (
    <div className={cn('w-full', className)}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full h-auto"
        style={{ maxHeight: 620 }}
        role="img"
        aria-label="Income statement flow diagram showing revenue, costs, and profit"
      >
        {/* ================================================================ */}
        {/* LAYER 1: FLOWS (drawn first so bars render on top)               */}
        {/* ================================================================ */}

        {/* Sources → Revenue (green) */}
        {srcBars.map((src, i) => {
          const t = srcTargets[i]
          return (
            <path
              key={`flow-src-${i}`}
              d={flowPath(
                SRC_BAR_X + SRC_BAR_W, src.y, src.y + src.h,
                COL_REV, t.y, t.y + t.h,
              )}
              fill={C.incomeFlow}
            />
          )
        })}

        {/* Revenue → Gross Profit (green, upper portion) */}
        {gpH > 0 && (
          <path
            d={flowPath(revR, revY1, revGpSplit, COL_GP, gpY1, gpY2)}
            fill={C.incomeFlow}
          />
        )}

        {/* Revenue → Direct Costs (red, lower portion) */}
        {wf.directCosts > 0 && (
          <path
            d={flowPath(revR, revGpSplit, revY2, COST_X_DC, COST_Y, COST_Y + dcBarH)}
            fill={C.costFlow}
          />
        )}

        {/* GP → Operating Profit (green, upper portion) */}
        {opH > 0 && gpH > 0 && (
          <path
            d={flowPath(gpR, gpY1, gpOpSplit, COL_OP, opY1, opY2)}
            fill={C.incomeFlow}
          />
        )}

        {/* GP → Shared Costs (red, lower portion) */}
        {wf.sharedCosts > 0 && gpH > 0 && (
          <path
            d={flowPath(gpR, gpOpSplit, gpY2, COST_X_SC, COST_Y, COST_Y + scBarH)}
            fill={C.costFlow}
          />
        )}

        {/* OP → Net Profit (green, upper portion — only if profitable) */}
        {isProfit && npH > 0 && opH > 0 && (
          <path
            d={flowPath(opR, opY1, opNpSplit, COL_NP, npY1, npY2)}
            fill={C.incomeFlow}
          />
        )}

        {/* OP → Overhead (red, lower portion) */}
        {wf.overhead > 0 && opH > 0 && (
          <path
            d={flowPath(opR, opNpSplit, opY2, COST_X_OH, COST_Y, COST_Y + ohBarH)}
            fill={C.costFlow}
          />
        )}

        {/* ================================================================ */}
        {/* LAYER 2: BARS                                                    */}
        {/* ================================================================ */}

        {/* Revenue source bars */}
        {srcBars.map((src, i) => (
          <rect
            key={`src-bar-${i}`}
            x={SRC_BAR_X}
            y={src.y}
            width={SRC_BAR_W}
            height={src.h}
            fill={C.incomeBarLight}
            rx={4}
          >
            <title>{src.name}: {fmtFull(src.amount)}/mo</title>
          </rect>
        ))}

        {/* Revenue bar */}
        <rect x={COL_REV} y={revY1} width={BAR_W} height={revH} fill={C.incomeBar} rx={4}>
          <title>Revenue: {fmtFull(wf.totalRevenue)}/mo</title>
        </rect>

        {/* Gross Profit bar */}
        {gpH > 0 && (
          <rect x={COL_GP} y={gpY1} width={BAR_W} height={gpH} fill={C.incomeBar} rx={4}>
            <title>Gross Profit: {fmtFull(wf.grossProfit)}/mo ({pct(wf.grossProfit, wf.totalRevenue)} margin)</title>
          </rect>
        )}

        {/* Operating Profit bar */}
        {opH > 0 && (
          <rect x={COL_OP} y={opY1} width={BAR_W} height={opH} fill={C.incomeBar} rx={4}>
            <title>Operating Profit: {fmtFull(wf.operatingProfit)}/mo ({pct(wf.operatingProfit, wf.totalRevenue)} margin)</title>
          </rect>
        )}

        {/* Net Profit / Loss bar */}
        <rect
          x={COL_NP}
          y={npY1}
          width={BAR_W}
          height={Math.max(npH, 6)}
          fill={isProfit ? C.incomeBar : C.lossBar}
          rx={4}
        >
          <title>
            {isProfit ? 'Net Profit' : 'Net Loss'}: {fmtFull(Math.abs(wf.netProfit))}/mo
            ({pct(Math.abs(wf.netProfit), wf.totalRevenue)} of revenue)
          </title>
        </rect>

        {/* ================================================================ */}
        {/* LAYER 3: LABELS                                                  */}
        {/* ================================================================ */}

        {/* Revenue source labels */}
        {srcBars.map((src, i) => (
          <g key={`src-lbl-${i}`}>
            {src.h >= 22 ? (
              <>
                <text
                  x={SRC_LABEL_END}
                  y={src.y + src.h / 2 - 5}
                  textAnchor="end"
                  fontSize={9}
                  fontWeight={600}
                  fill={C.textDark}
                >
                  {src.name}
                </text>
                <text
                  x={SRC_LABEL_END}
                  y={src.y + src.h / 2 + 7}
                  textAnchor="end"
                  fontSize={8}
                  fill={C.incomeBar}
                  fontWeight={600}
                >
                  {fmtCompact(src.amount)}
                </text>
              </>
            ) : (
              <text
                x={SRC_LABEL_END}
                y={src.y + src.h / 2 + 3}
                textAnchor="end"
                fontSize={8}
                fill={C.textMuted}
              >
                {src.name} {fmtCompact(src.amount)}
              </text>
            )}
          </g>
        ))}

        {/* Revenue label */}
        <text
          x={COL_REV + BAR_W / 2}
          y={revY1 - 22}
          textAnchor="middle"
          fontSize={12}
          fontWeight={700}
          fill={C.textDark}
        >
          Revenue
        </text>
        <text
          x={COL_REV + BAR_W / 2}
          y={revY1 - 8}
          textAnchor="middle"
          fontSize={10}
          fontWeight={600}
          fill={C.incomeBar}
        >
          {fmtCompact(wf.totalRevenue)}
        </text>

        {/* Gross Profit label */}
        {gpH > 0 && (
          <>
            <text
              x={COL_GP + BAR_W / 2}
              y={gpY1 - 22}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill={C.textDark}
            >
              Gross Profit
            </text>
            <text
              x={COL_GP + BAR_W / 2}
              y={gpY1 - 8}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              fill={C.incomeBar}
            >
              {fmtCompact(wf.grossProfit)} · {pct(wf.grossProfit, wf.totalRevenue)} margin
            </text>
          </>
        )}

        {/* Operating Profit label */}
        {opH > 0 && (
          <>
            <text
              x={COL_OP + BAR_W / 2}
              y={opY1 - 22}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill={C.textDark}
            >
              Operating Profit
            </text>
            <text
              x={COL_OP + BAR_W / 2}
              y={opY1 - 8}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              fill={C.incomeBar}
            >
              {fmtCompact(wf.operatingProfit)} · {pct(wf.operatingProfit, wf.totalRevenue)} margin
            </text>
          </>
        )}

        {/* Net Profit / Loss label */}
        <text
          x={COL_NP + BAR_W / 2}
          y={npY1 - 22}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill={C.textDark}
        >
          {isProfit ? 'Net Profit' : 'Net Loss'}
        </text>
        <text
          x={COL_NP + BAR_W / 2}
          y={npY1 - 8}
          textAnchor="middle"
          fontSize={9}
          fontWeight={600}
          fill={isProfit ? C.incomeBar : C.lossBar}
        >
          {fmtCompact(Math.abs(wf.netProfit))} · {pct(Math.abs(wf.netProfit), wf.totalRevenue)}
        </text>

        {/* ================================================================ */}
        {/* LAYER 4: COST SECTIONS (bars + item breakdowns)                  */}
        {/* ================================================================ */}

        <CostSection
          label="Direct Costs"
          total={wf.directCosts}
          totalRevenue={wf.totalRevenue}
          items={wf.directItems}
          x={COST_X_DC}
          y={COST_Y}
          barH={dcBarH}
        />

        <CostSection
          label="Shared Costs"
          total={wf.sharedCosts}
          totalRevenue={wf.totalRevenue}
          items={wf.sharedItems}
          x={COST_X_SC}
          y={COST_Y}
          barH={scBarH}
        />

        <CostSection
          label="Overhead"
          total={wf.overhead}
          totalRevenue={wf.totalRevenue}
          items={wf.overheadItems}
          x={COST_X_OH}
          y={COST_Y}
          barH={ohBarH}
        />

        {/* ================================================================ */}
        {/* LAYER 5: LEGEND                                                  */}
        {/* ================================================================ */}

        <g transform={`translate(${VB_W / 2 - 120}, ${VB_H - 22})`}>
          <rect x={0} y={0} width={14} height={14} fill={C.incomeBar} rx={3} />
          <text x={20} y={11} fontSize={9.5} fill={C.textMuted} fontWeight={500}>
            Income / Profit
          </text>
          <rect x={130} y={0} width={14} height={14} fill={C.costBar} rx={3} />
          <text x={150} y={11} fontSize={9.5} fill={C.textMuted} fontWeight={500}>
            Costs / Expenses
          </text>
        </g>
      </svg>
    </div>
  )
}
