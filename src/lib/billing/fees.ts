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
    console.error('Error getting seller fee percent:', error)
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
export function getFeeDescription(role: UserRole): string {
  switch (role) {
    case 'apprentice':
      return 'Apprentice rate: 5% platform fee (7% for retainers)'
    case 'executive':
    case 'founder':
      return 'Standard rate: 8% platform fee (10% for retainers)'
    default:
      return '8% platform fee (10% for retainers)'
  }
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
export const FEE_TIERS = {
  executive: {
    label: 'Executive',
    standardFee: 8,
    retainerFee: 10,
    description: 'Standard platform fees for executive professionals',
  },
  founder: {
    label: 'Founder',
    standardFee: 8,
    retainerFee: 10,
    description: 'Standard platform fees for founders',
  },
  apprentice: {
    label: 'Apprentice',
    standardFee: 5,
    retainerFee: 7,
    description: 'Reduced fees to encourage apprentice hiring',
  },
  default: {
    label: 'Standard',
    standardFee: 8,
    retainerFee: 10,
    description: 'Default platform fees',
  },
} as const
