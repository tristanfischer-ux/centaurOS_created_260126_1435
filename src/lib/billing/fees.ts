/**
 * Fee Calculation Utilities
 * Handles role-based platform fee calculation with database lookup
 */

import { createClient } from '@/lib/supabase/server'
import { UserRole, FeeOrderType, DEFAULT_FEE_CONFIG } from '@/types/billing'
import { DEFAULT_PLATFORM_FEE_PERCENT, RETAINER_PLATFORM_FEE_PERCENT } from '@/types/payments'

/**
 * Get the platform fee percentage for a given seller and order type
 * Uses database configuration with fallback to defaults
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
 * Standardized to 10% across all roles as of Feb 2026.
 */
export function getFeeDescription(_role: UserRole): string {
  return '10% platform fee on all transactions'
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
 * Fee tier information by role
 *
 * @description Standardized to 10% across all roles as of Feb 2026.
 * All roles now pay the same platform fee.
 */
export const FEE_TIERS = {
  executive: {
    label: 'Executive',
    standardFee: 10,
    retainerFee: 10,
    description: 'Standard 10% platform fee',
  },
  founder: {
    label: 'Founder',
    standardFee: 10,
    retainerFee: 10,
    description: 'Standard 10% platform fee',
  },
  apprentice: {
    label: 'Apprentice',
    standardFee: 10,
    retainerFee: 10,
    description: 'Standard 10% platform fee',
  },
  default: {
    label: 'Standard',
    standardFee: 10,
    retainerFee: 10,
    description: 'Standard 10% platform fee',
  },
} as const
