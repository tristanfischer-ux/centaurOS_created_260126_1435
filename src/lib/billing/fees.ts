/**
 * Fee Calculation Utilities
 * Handles tier-based and introductory platform fee calculation with database lookup
 *
 * DECISION: Fee structure as of Mar 2026:
 * - All new accounts: 0% fee on first 3 marketplace orders (intro offer)
 * - Explorer / Startup tiers: 10% standard fee after intro
 * - Professional tier: 5% reduced fee after intro
 * - Enterprise: custom (via DB config)
 *
 * FLOW: getEffectiveFeePercent() checks intro eligibility first, then tier-based rate.
 */

import { createClient } from '@/lib/supabase/server'
import { UserRole, FeeOrderType, DEFAULT_FEE_CONFIG } from '@/types/billing'
import { DEFAULT_PLATFORM_FEE_PERCENT, RETAINER_PLATFORM_FEE_PERCENT } from '@/types/payments'
import type { SubscriptionTier } from '@/lib/billing/plans'

/** Number of intro orders with 0% fee for all new accounts */
const INTRO_FREE_ORDERS = 3

/** Fee percentage by subscription tier (after intro orders are used) */
const TIER_FEE_PERCENT: Record<SubscriptionTier, number> = {
  free: 10,
  seed: 10,
  starter: 10,
  professional: 5,
  enterprise: 5, // Enterprise may be overridden by DB config
}

/**
 * Get the effective fee percentage for a buyer, considering:
 * 1. Intro offer (0% on first 3 orders)
 * 2. Subscription tier (Professional = 5%, others = 10%)
 * 3. Database overrides (for enterprise/custom deals)
 *
 * @param buyerUserId - The buyer's auth user ID
 * @returns Fee percentage to apply
 */
export async function getEffectiveFeePercent(
  buyerUserId: string
): Promise<{ feePercent: number; isIntroOrder: boolean; introOrdersRemaining: number }> {
  try {
    const supabase = await createClient()

    // Count how many completed marketplace orders this buyer has
    const { count: completedOrders } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', buyerUserId)
      .in('status', ['completed'])

    const orderCount = completedOrders ?? 0
    const introOrdersRemaining = Math.max(0, INTRO_FREE_ORDERS - orderCount)

    // If still in intro period, 0% fee
    if (orderCount < INTRO_FREE_ORDERS) {
      return { feePercent: 0, isIntroOrder: true, introOrdersRemaining }
    }

    // Get buyer's subscription tier
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('tier')
      .eq('user_id', buyerUserId)
      .eq('status', 'active')
      .single()

    const tier = (subscription?.tier as SubscriptionTier) || 'free'
    const feePercent = TIER_FEE_PERCENT[tier] ?? DEFAULT_PLATFORM_FEE_PERCENT

    return { feePercent, isIntroOrder: false, introOrdersRemaining: 0 }
  } catch (error) {
    console.error('[BillingFees] Error getting effective fee:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    // Fail-safe: charge standard fee rather than giving 0% by accident
    return { feePercent: DEFAULT_PLATFORM_FEE_PERCENT, isIntroOrder: false, introOrdersRemaining: 0 }
  }
}

/**
 * Get the platform fee percentage for a given seller and order type
 * Uses database configuration with fallback to defaults
 *
 * GOTCHA: This is the SELLER-side fee lookup (legacy). For buyer-facing
 * tiered fees (0% intro, 5% Professional), use getEffectiveFeePercent() instead.
 */
export async function getSellerFeePercent(
  sellerId: string,
  orderType: FeeOrderType = 'default'
): Promise<number> {
  try {
    const supabase = await createClient()

    // Get seller's role from their profile
    const { data: sellerProfile } = await supabase
      .from('provider_profiles')
      .select(`
        id,
        user:profiles!provider_profiles_user_id_fkey(
          role
        )
      `)
      .eq('id', sellerId)
      .single()

    const role = (sellerProfile?.user as { role?: string } | null)?.role as UserRole || 'default'

    // Try to get fee from database configuration
    const { data: feeData } = await supabase.rpc('get_platform_fee_percent', {
      p_role: role,
      p_order_type: orderType,
    })

    if (feeData !== null && feeData !== undefined) {
      return Number(feeData)
    }

    // Fall back to default configuration
    return DEFAULT_FEE_CONFIG[role]?.[orderType]
      || DEFAULT_FEE_CONFIG[role]?.default
      || DEFAULT_FEE_CONFIG.default[orderType]
      || DEFAULT_PLATFORM_FEE_PERCENT
  } catch (error) {
    console.error('[BillingFees] Error getting seller fee percent:', { error: error instanceof Error ? error.message : 'Unknown error' })
    // Return default based on order type
    return orderType === 'retainer' ? RETAINER_PLATFORM_FEE_PERCENT : DEFAULT_PLATFORM_FEE_PERCENT
  }
}

/**
 * Calculate platform fee for an order
 * @param amount - Amount in smallest currency unit
 * @param sellerId - The seller's provider profile ID
 * @param orderType - Type of order
 * @returns Fee calculation details
 */
export async function calculateOrderFee(
  amount: number,
  sellerId: string,
  orderType: FeeOrderType = 'default'
): Promise<{
  feePercent: number
  feeAmount: number
  sellerAmount: number
}> {
  const feePercent = await getSellerFeePercent(sellerId, orderType)
  const feeAmount = Math.round(amount * (feePercent / 100))
  const sellerAmount = amount - feeAmount
  
  return {
    feePercent,
    feeAmount,
    sellerAmount,
  }
}

/**
 * Get fee display information for UI
 * Returns a user-friendly description of the fee structure
 */
/**
 * Get fee display information for UI
 *
 * @description Returns a user-friendly description of the fee structure.
 * Updated Mar 2026: tiered fees — 0% intro, 10% standard, 5% Professional.
 *
 * @param _role - User role (currently unused, kept for API compatibility)
 * @param tier - Subscription tier for tier-specific messaging
 */
export function getFeeDescription(_role: UserRole, tier?: SubscriptionTier): string {
  if (tier === 'professional' || tier === 'enterprise') {
    return '5% platform fee on marketplace transactions'
  }
  return '10% platform fee on marketplace transactions (0% on your first 3 orders)'
}

/**
 * Calculate fee breakdown for display
 */
export function calculateFeeBreakdownSync(
  amount: number,
  feePercent: number
): {
  subtotal: number
  feeAmount: number
  sellerReceives: number
} {
  const feeAmount = Math.round(amount * (feePercent / 100))
  return {
    subtotal: amount,
    feeAmount,
    sellerReceives: amount - feeAmount,
  }
}

/**
 * Fee tier information by role
 */
/**
 * Fee tier information by subscription tier
 *
 * @description Updated Mar 2026: tiered by subscription, not role.
 * - All accounts: 0% on first 3 orders (intro offer)
 * - Explorer / Starter: 10% after intro
 * - Professional / Enterprise: 5% after intro
 */
export const FEE_TIERS = {
  free: {
    label: 'Explorer',
    standardFee: 10,
    introFee: 0,
    introOrders: INTRO_FREE_ORDERS,
    description: '0% on first 3 orders, then 10%',
  },
  starter: {
    label: 'Startup Team',
    standardFee: 10,
    introFee: 0,
    introOrders: INTRO_FREE_ORDERS,
    description: '0% on first 3 orders, then 10%',
  },
  professional: {
    label: 'Professional',
    standardFee: 5,
    introFee: 0,
    introOrders: INTRO_FREE_ORDERS,
    description: '0% on first 3 orders, then 5%',
  },
  enterprise: {
    label: 'Enterprise',
    standardFee: 5,
    introFee: 0,
    introOrders: INTRO_FREE_ORDERS,
    description: '0% on first 3 orders, then 5%',
  },
} as const

// DECISION: Keep legacy role-based export for backward compatibility.
// New code should use FEE_TIERS (subscription-based) instead.
export const FEE_TIERS_BY_ROLE = {
  executive: { label: 'Executive', standardFee: 10, retainerFee: 10, description: 'Standard 10% platform fee' },
  founder: { label: 'Founder', standardFee: 10, retainerFee: 10, description: 'Standard 10% platform fee' },
  apprentice: { label: 'Apprentice', standardFee: 10, retainerFee: 10, description: 'Standard 10% platform fee' },
  default: { label: 'Standard', standardFee: 10, retainerFee: 10, description: 'Standard 10% platform fee' },
} as const
