/**
 * @file allocation.ts
 *
 * @description Cost allocation engine for the Money Map. Implements four
 * allocation strategies for distributing shared and overhead costs across
 * revenue streams.
 *
 * @dependencies None (pure computation, no database access)
 */

import type {
  RevenueStream,
  CostItem,
  CostLink,
  AllocatedCost,
  StreamProfitability,
  MoneyMapSummary,
  AllocationMethod,
  Period,
} from '@/types/money-map'

import { PERIOD_TO_MONTHLY } from '@/types/money-map'

// ============================================================
// Normalisation
// ============================================================

/**
 * Normalise an amount to a monthly figure.
 *
 * @param amount - The raw amount
 * @param period - The period the amount covers
 * @returns Monthly-equivalent amount
 */
export function normaliseToMonthly(amount: number, period: Period): number {
  return amount * PERIOD_TO_MONTHLY[period]
}

// ============================================================
// Allocation Strategies
// ============================================================

/**
 * Compute allocation percentages for a cost item across revenue streams
 * using the specified method. Returns a map of revenue_stream_id → percentage.
 *
 * @param method - The allocation strategy
 * @param revenueStreams - All active revenue streams
 * @param costLinks - Existing custom links (used only for 'custom' method)
 * @param costItemId - The cost item being allocated
 * @returns Map of revenue_stream_id → allocation percentage (0-100)
 */
export function computeAllocationPercentages(
  method: AllocationMethod,
  revenueStreams: RevenueStream[],
  costLinks: CostLink[],
  costItemId: string
): Map<string, number> {
  const result = new Map<string, number>()

  if (revenueStreams.length === 0) return result

  switch (method) {
    case 'revenue_proportional': {
      const totalRevenue = revenueStreams.reduce(
        (sum, rs) => sum + normaliseToMonthly(rs.amount, rs.period),
        0
      )
      if (totalRevenue === 0) {
        // Fall back to equal split when no revenue yet
        const pct = 100 / revenueStreams.length
        for (const rs of revenueStreams) {
          result.set(rs.id, pct)
        }
      } else {
        for (const rs of revenueStreams) {
          const monthly = normaliseToMonthly(rs.amount, rs.period)
          result.set(rs.id, (monthly / totalRevenue) * 100)
        }
      }
      break
    }

    case 'equal': {
      const pct = 100 / revenueStreams.length
      for (const rs of revenueStreams) {
        result.set(rs.id, pct)
      }
      break
    }

    case 'headcount': {
      // Headcount allocation is simplified to equal split for now.
      // When team-to-stream assignments exist, this can use real headcount data.
      const pct = 100 / revenueStreams.length
      for (const rs of revenueStreams) {
        result.set(rs.id, pct)
      }
      break
    }

    case 'custom': {
      // Use the manually-set percentages from cost_links
      const links = costLinks.filter((l) => l.cost_item_id === costItemId)
      for (const link of links) {
        result.set(link.revenue_stream_id, link.allocation_pct)
      }
      break
    }
  }

  return result
}

// ============================================================
// Profitability Computation
// ============================================================

/**
 * Compute full profitability for every revenue stream.
 *
 * @description For each revenue stream, sums up all direct, indirect, and
 * overhead costs allocated to it, then calculates net and margin %.
 *
 * @param revenueStreams - Active revenue streams
 * @param costItems - Active cost items
 * @param costLinks - Allocation links
 * @returns Array of StreamProfitability — one per revenue stream
 */
export function computeProfitability(
  revenueStreams: RevenueStream[],
  costItems: CostItem[],
  costLinks: CostLink[]
): StreamProfitability[] {
  if (revenueStreams.length === 0) return []

  // Build a lookup of allocated costs per revenue stream
  const allocations = new Map<string, AllocatedCost[]>()
  for (const rs of revenueStreams) {
    allocations.set(rs.id, [])
  }

  for (const cost of costItems) {
    const monthlyAmount = normaliseToMonthly(cost.amount, cost.period)
    if (monthlyAmount === 0) continue

    // Determine the allocation method — use the first link's method, or default
    const itemLinks = costLinks.filter((l) => l.cost_item_id === cost.id)
    const method: AllocationMethod = itemLinks.length > 0
      ? itemLinks[0].allocation_method
      : (cost.cost_type === 'direct' ? 'custom' : 'revenue_proportional')

    const pctMap = computeAllocationPercentages(method, revenueStreams, costLinks, cost.id)

    for (const [rsId, pct] of pctMap) {
      const allocated: AllocatedCost = {
        cost_item_id: cost.id,
        cost_name: cost.name,
        cost_type: cost.cost_type,
        revenue_stream_id: rsId,
        allocated_amount: (monthlyAmount * pct) / 100,
        allocation_pct: pct,
        allocation_method: method,
      }
      allocations.get(rsId)?.push(allocated)
    }
  }

  // Build profitability rows
  return revenueStreams.map((rs) => {
    const monthlyRevenue = normaliseToMonthly(rs.amount, rs.period)
    const costs = allocations.get(rs.id) ?? []

    const directCosts = costs
      .filter((c) => c.cost_type === 'direct')
      .reduce((sum, c) => sum + c.allocated_amount, 0)

    const indirectCosts = costs
      .filter((c) => c.cost_type === 'indirect')
      .reduce((sum, c) => sum + c.allocated_amount, 0)

    const overheadCosts = costs
      .filter((c) => c.cost_type === 'overhead')
      .reduce((sum, c) => sum + c.allocated_amount, 0)

    const totalCosts = directCosts + indirectCosts + overheadCosts
    const net = monthlyRevenue - totalCosts
    const marginPct = monthlyRevenue > 0 ? (net / monthlyRevenue) * 100 : 0

    return {
      revenue_stream: rs,
      direct_costs: Math.round(directCosts * 100) / 100,
      indirect_costs: Math.round(indirectCosts * 100) / 100,
      overhead_costs: Math.round(overheadCosts * 100) / 100,
      total_costs: Math.round(totalCosts * 100) / 100,
      net: Math.round(net * 100) / 100,
      margin_pct: Math.round(marginPct * 10) / 10,
    }
  })
}

// ============================================================
// Summary Computation
// ============================================================

/**
 * Compute aggregate summary KPIs for the entire money map.
 *
 * @param revenueStreams - Active revenue streams
 * @param costItems - Active cost items
 * @param profitability - Pre-computed profitability rows
 * @returns MoneyMapSummary with totals and margin
 */
export function computeMoneyMapSummary(
  revenueStreams: RevenueStream[],
  costItems: CostItem[],
  profitability: StreamProfitability[]
): MoneyMapSummary {
  const totalRevenue = revenueStreams.reduce(
    (sum, rs) => sum + normaliseToMonthly(rs.amount, rs.period),
    0
  )

  const totalDirectCosts = costItems
    .filter((c) => c.cost_type === 'direct')
    .reduce((sum, c) => sum + normaliseToMonthly(c.amount, c.period), 0)

  const totalIndirectCosts = costItems
    .filter((c) => c.cost_type === 'indirect')
    .reduce((sum, c) => sum + normaliseToMonthly(c.amount, c.period), 0)

  const totalOverheadCosts = costItems
    .filter((c) => c.cost_type === 'overhead')
    .reduce((sum, c) => sum + normaliseToMonthly(c.amount, c.period), 0)

  const totalCosts = totalDirectCosts + totalIndirectCosts + totalOverheadCosts
  const netMargin = totalRevenue - totalCosts
  const netMarginPct = totalRevenue > 0 ? (netMargin / totalRevenue) * 100 : 0

  return {
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_direct_costs: Math.round(totalDirectCosts * 100) / 100,
    total_indirect_costs: Math.round(totalIndirectCosts * 100) / 100,
    total_overhead_costs: Math.round(totalOverheadCosts * 100) / 100,
    total_costs: Math.round(totalCosts * 100) / 100,
    net_margin: Math.round(netMargin * 100) / 100,
    net_margin_pct: Math.round(netMarginPct * 10) / 10,
    stream_count: revenueStreams.length,
    cost_count: costItems.length,
  }
}
