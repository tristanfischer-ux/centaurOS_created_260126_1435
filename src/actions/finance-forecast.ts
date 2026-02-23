'use server'

/**
 * @file finance-forecast.ts — Server actions for cash flow forecasting
 *
 * @description Assembles forecast input data from existing tables
 * (retainers, money_map_cost_items, account_balances, subscriptions)
 * and returns it for client-side projection.
 *
 * @security All queries filter by foundry_id via getFoundryIdCached().
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import type { FinanceActionResult } from '@/types/finance'
import type { RecurringRevenue, RecurringCost, ForecastInput } from '@/lib/finance/forecast'

// ============================================================
// Types
// ============================================================

export interface CashFlowData {
  forecastInput: ForecastInput
  revenueBreakdown: RecurringRevenue[]
  costBreakdown: RecurringCost[]
}

// ============================================================
// Actions
// ============================================================

/**
 * Assemble all data needed for cash flow forecasting.
 */
export async function getCashFlowData(
  months: number = 12
): Promise<FinanceActionResult<CashFlowData>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Parallel data fetches
    const [balanceResult, retainersResult, costsResult, revenueStreamsResult] = await Promise.all([
      // Current cash balance
      supabase
        .from('account_balances')
        .select('balance_amount')
        .eq('user_id', user.id)
        .single(),

      // Active retainers (recurring revenue)
      supabase
        .from('retainers')
        .select('id, buyer_id, hourly_rate, weekly_hours, status')
        .eq('status', 'active'),

      // Active cost items from Money Map
      supabase
        .from('money_map_cost_items')
        .select('id, name, amount, period, category, is_active')
        .eq('foundry_id', foundryId)
        .eq('is_active', true),

      // Revenue streams from Money Map
      supabase
        .from('money_map_revenue_streams')
        .select('id, name, amount, period, category, is_active')
        .eq('foundry_id', foundryId)
        .eq('is_active', true),
    ])

    const currentBalance = balanceResult.data?.balance_amount ?? 0

    // Build recurring revenue from retainers
    const recurringRevenue: RecurringRevenue[] = []

    if (retainersResult.data) {
      for (const retainer of retainersResult.data) {
        // INTENT: hourly_rate is DECIMAL(10,2) in pounds, weekly_hours is INTEGER
        // Monthly revenue = hourly_rate * weekly_hours * ~4.33 weeks/month
        const hourlyRatePence = Math.round((retainer.hourly_rate ?? 0) * 100)
        const weeklyHours = retainer.weekly_hours ?? 0
        const monthlyAmount = Math.round(hourlyRatePence * weeklyHours * 4.33)

        if (monthlyAmount > 0) {
          recurringRevenue.push({
            source: `Retainer #${retainer.id.slice(0, 8)}`,
            monthlyAmount,
          })
        }
      }
    }

    // Add revenue streams from Money Map
    if (revenueStreamsResult.data) {
      for (const stream of revenueStreamsResult.data) {
        const monthlyAmount = normaliseToMonthlyPence(stream.amount, stream.period)
        if (monthlyAmount > 0) {
          recurringRevenue.push({
            source: stream.name ?? stream.category ?? 'Revenue stream',
            monthlyAmount,
          })
        }
      }
    }

    // Build recurring costs from Money Map cost items
    const recurringCosts: RecurringCost[] = []

    if (costsResult.data) {
      for (const cost of costsResult.data) {
        const monthlyAmount = normaliseToMonthlyPence(cost.amount, cost.period)
        if (monthlyAmount > 0) {
          recurringCosts.push({
            source: cost.name ?? 'Cost item',
            monthlyAmount,
            category: cost.category ?? 'other',
          })
        }
      }
    }

    return {
      data: {
        forecastInput: {
          currentBalance,
          recurringRevenue,
          recurringCosts,
          months,
        },
        revenueBreakdown: recurringRevenue,
        costBreakdown: recurringCosts,
      },
      error: null,
    }
  } catch (err) {
    console.error('[Finance] Failed to get cash flow data:', err)
    return { data: null, error: 'Failed to load cash flow data' }
  }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert amount + period into monthly pence.
 * Money Map amounts are in pounds (NUMERIC(15,2)).
 */
function normaliseToMonthlyPence(amount: number | null, period: string | null): number {
  if (!amount) return 0
  const amountPence = Math.round(amount * 100)

  switch (period) {
    case 'annual':
      return Math.round(amountPence / 12)
    case 'quarterly':
      return Math.round(amountPence / 3)
    case 'monthly':
    default:
      return amountPence
  }
}
