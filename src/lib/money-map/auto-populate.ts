/**
 * @file auto-populate.ts
 *
 * @description Aggregates real financial data from platform tables (orders,
 * retainers, escrow_transactions) and converts them into Money Map revenue
 * streams and cost items.
 *
 * @security Requires authenticated Supabase client with foundry membership.
 * RLS on source tables ensures users only see their own foundry's data.
 */

import { createClient } from '@/lib/supabase/server'

import type {
  RevenueStreamInput,
  CostItemInput,
} from '@/types/money-map'

interface AutoPopulateResult {
  revenue_streams: RevenueStreamInput[]
  cost_items: CostItemInput[]
}

// DECISION: These row shapes describe future platform columns that are not yet
// in the generated Supabase types (foundry_id, weekly_rate, platform_fee, etc.).
// Each query is wrapped in try/catch so a schema mismatch at runtime is safe.
// Once the columns land in a migration, regenerate types and remove the casts.
interface OrderRow { total_amount: number; status: string; created_at: string }
interface RetainerRow { weekly_rate: number; status: string }
interface EscrowRow { platform_fee: number; stripe_fee: number; created_at: string }

/**
 * Aggregate platform data into Money Map inputs.
 *
 * @description Queries orders, retainers, and escrow_transactions to build
 * auto-populated revenue streams and cost items. Uses monthly aggregation
 * based on the last 3 months of data for stable estimates.
 *
 * @param foundryId - The foundry to aggregate data for
 * @returns Revenue stream and cost item suggestions from platform data
 */
export async function aggregatePlatformData(foundryId: string): Promise<AutoPopulateResult> {
  const supabase = await createClient()

  // Date range: last 3 complete months for stable monthly averages
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const since = threeMonthsAgo.toISOString()

  const revenueStreams: RevenueStreamInput[] = []
  const costItems: CostItemInput[] = []

  // -------------------------------------------------------
  // 1. Marketplace order revenue (as buyer or seller)
  // -------------------------------------------------------
  try {
    // GOTCHA: 'delivered' is not yet in the order_status enum; cast needed on .in() values
    const validStatuses = ['completed', 'delivered'] as const
    const { data: orders } = await supabase
      .from('orders')
      .select('total_amount, status, created_at')
      .eq('foundry_id' as string, foundryId)
      .in('status', validStatuses as unknown as ('completed' | 'pending')[])
      .gte('created_at', since) as unknown as { data: OrderRow[] | null }

    if (orders && orders.length > 0) {
      const total = orders.reduce((sum: number, o) => sum + (o.total_amount || 0), 0)
      const monthlyAvg = Math.round((total / 3) * 100) / 100

      if (monthlyAvg > 0) {
        revenueStreams.push({
          name: 'Marketplace Orders',
          category: 'marketplace',
          amount: monthlyAvg,
          period: 'monthly',
          source: 'auto',
          auto_source_type: 'marketplace_orders',
          description: `Auto-calculated: ${orders.length} completed orders over 3 months`,
        })
      }
    }
  } catch {
    // Orders table may not exist or have different structure
    console.warn('[MoneyMap] Could not aggregate marketplace orders')
  }

  // -------------------------------------------------------
  // 2. Retainer revenue
  // -------------------------------------------------------
  try {
    const { data: retainers } = await supabase
      .from('retainers')
      .select('weekly_rate, status')
      .eq('foundry_id' as string, foundryId)
      .eq('status', 'active') as unknown as { data: RetainerRow[] | null }

    if (retainers && retainers.length > 0) {
      // Weekly rate × ~4.33 weeks/month
      const monthlyTotal = retainers.reduce(
        (sum: number, r) => sum + (r.weekly_rate || 0) * 4.33,
        0
      )
      const monthlyAvg = Math.round(monthlyTotal * 100) / 100

      if (monthlyAvg > 0) {
        revenueStreams.push({
          name: 'Retainer Agreements',
          category: 'service',
          amount: monthlyAvg,
          period: 'monthly',
          source: 'auto',
          auto_source_type: 'retainers',
          description: `Auto-calculated: ${retainers.length} active retainers`,
        })
      }
    }
  } catch {
    console.warn('[MoneyMap] Could not aggregate retainer data')
  }

  // -------------------------------------------------------
  // 3. Platform fees (escrow fee amounts)
  // -------------------------------------------------------
  try {
    const { data: escrow } = await supabase
      .from('escrow_transactions')
      .select('platform_fee, stripe_fee, created_at')
      .eq('foundry_id' as string, foundryId)
      .gte('created_at', since) as unknown as { data: EscrowRow[] | null }

    if (escrow && escrow.length > 0) {
      const totalPlatformFees = escrow.reduce(
        (sum: number, e) => sum + (e.platform_fee || 0),
        0
      )
      const totalStripeFees = escrow.reduce(
        (sum: number, e) => sum + (e.stripe_fee || 0),
        0
      )

      const monthlyPlatformFees = Math.round((totalPlatformFees / 3) * 100) / 100
      const monthlyStripeFees = Math.round((totalStripeFees / 3) * 100) / 100

      if (monthlyStripeFees > 0) {
        costItems.push({
          name: 'Payment Processing (Stripe)',
          category: 'operations',
          amount: monthlyStripeFees,
          period: 'monthly',
          cost_type: 'direct',
          source: 'auto',
          description: `Auto-calculated from ${escrow.length} escrow transactions over 3 months`,
        })
      }

      if (monthlyPlatformFees > 0) {
        revenueStreams.push({
          name: 'Platform Fees Collected',
          category: 'marketplace',
          amount: monthlyPlatformFees,
          period: 'monthly',
          source: 'auto',
          auto_source_type: 'platform_fees',
          description: `Auto-calculated from escrow transactions`,
        })
      }
    }
  } catch {
    console.warn('[MoneyMap] Could not aggregate escrow data')
  }

  return { revenue_streams: revenueStreams, cost_items: costItems }
}
