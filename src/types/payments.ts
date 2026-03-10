/**
 * Payment system types for ForgeOS marketplace
 */

// Payment status enum matching database
export type PaymentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'canceled'
  | 'succeeded'

// Escrow status enum matching database
export type EscrowStatus = 'pending' | 'held' | 'partial_release' | 'released' | 'refunded' | 'partial_refund'

// Order status enum matching database
export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'disputed'
  | 'cancelled'

// Milestone status enum matching database
export type MilestoneStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'paid'

// Escrow transaction type matching database
export type EscrowTransactionType = 'deposit' | 'hold' | 'release' | 'refund' | 'fee_deduction'

/**
 * Payment intent information from Stripe
 */
export interface PaymentIntent {
  id: string
  clientSecret: string
  status: PaymentStatus
  amount: number
  currency: string
  orderId: string
  metadata?: Record<string, string>
}

/**
 * Escrow transaction record
 */
export interface EscrowTransaction {
  id: string
  orderId: string
  milestoneId?: string | null
  type: EscrowTransactionType
  amount: number
  stripeTransferId?: string | null
  createdAt: string
}

/**
 * Order milestone record
 */
export interface Milestone {
  id: string
  orderId: string
  title: string
  description?: string | null
  amount: number
  dueDate?: string | null
  status: MilestoneStatus
  submittedAt?: string | null
  approvedAt?: string | null
  createdAt: string
}

/**
 * Order with payment information
 */
export interface Order {
  id: string
  orderNumber?: string | null
  buyerId: string
  sellerId: string
  listingId?: string | null
  orderType: 'people_booking' | 'product_rfq' | 'service'
  status: OrderStatus
  totalAmount: number
  platformFee: number
  currency: string
  stripePaymentIntentId?: string | null
  escrowStatus: EscrowStatus
  objectiveId?: string | null
  businessFunctionId?: string | null
  vatAmount: number
  vatRate: number
  taxTreatment: 'standard' | 'reverse_charge' | 'exempt' | 'zero_rated'
  createdAt: string
  completedAt?: string | null
}

/**
 * Parameters for initiating a payment
 */
export interface InitiatePaymentParams {
  orderId: string
  amount: number
  currency?: string
  description?: string
}

/**
 * Parameters for releasing escrow funds
 */
export interface ReleaseEscrowParams {
  orderId: string
  amount: number
  milestoneId?: string
}

/**
 * Parameters for processing a refund
 */
export interface RefundParams {
  orderId: string
  amount?: number
  reason?: string
}

/**
 * Payment status response with full details
 */
export interface PaymentStatusResponse {
  order: Order
  escrowTransactions: EscrowTransaction[]
  milestones: Milestone[]
  totalHeld: number
  totalReleased: number
  totalRefunded: number
  pendingRelease: number
}

/**
 * Milestone creation input
 */
export interface MilestoneInput {
  title: string
  description?: string
  amount: number
  dueDate?: string
}

/**
 * Lightweight fee configuration for payment calculations.
 * For the full DB-backed config, see PlatformFeeConfig in types/billing.ts.
 */
export interface FeeConfigSimple {
  feePercent: number
  minFee?: number
  maxFee?: number
}

// ==========================================
// PLATFORM FEE CONFIGURATION (Single Source of Truth)
// ==========================================

/**
 * Standard platform fee percentage for all transaction types (10%)
 *
 * @description Standardized to 10% across all order types as of Feb 2026.
 * Previously varied: 8% orders, 10% retainers, 5% apprentice.
 * Decision: single consistent rate simplifies pricing, eliminates confusion,
 * and removes arbitrage potential between order types.
 */
export const DEFAULT_PLATFORM_FEE_PERCENT = 10

/**
 * @deprecated Use DEFAULT_PLATFORM_FEE_PERCENT instead — all fee rates are now unified at 10%.
 */
export const RETAINER_PLATFORM_FEE_PERCENT = DEFAULT_PLATFORM_FEE_PERCENT

/**
 * UK VAT rate (20%)
 */
export const DEFAULT_VAT_RATE = 0.20

/**
 * Calculate platform fee for any amount
 * @param amount Amount in smallest currency unit
 * @param feePercent Fee percentage (default: 10%)
 */
export function calculatePlatformFeeAmount(
  amount: number,
  feePercent: number = DEFAULT_PLATFORM_FEE_PERCENT
): number {
  return Math.round(amount * (feePercent / 100))
}

/**
 * Payment form props
 */
export interface PaymentFormProps {
  orderId: string
  amount: number
  currency?: string
  onSuccess?: (paymentIntentId: string) => void
  onError?: (error: string) => void
}

/**
 * Escrow status display props
 */
export interface EscrowStatusProps {
  orderId: string
  showTimeline?: boolean
}

/**
 * Milestone tracker props
 */
export interface MilestoneTrackerProps {
  orderId: string
  milestones: Milestone[]
  userRole: 'buyer' | 'seller'
  onSubmit?: (milestoneId: string, notes?: string) => Promise<void>
  onApprove?: (milestoneId: string) => Promise<void>
  onDispute?: (milestoneId: string, reason: string) => Promise<void>
}

/**
 * Fee breakdown for display
 *
 * @description `total` is the buyer-facing amount (subtotal + VAT).
 * The `platformFee` is deducted from the seller's payout, NOT added to buyer total.
 * Use `sellerReceives` for the amount transferred to the seller after fee deduction.
 */
export interface FeeBreakdown {
  subtotal: number
  platformFee: number
  vat: number
  /** Buyer pays: subtotal + VAT. Platform fee is deducted from seller's payout. */
  total: number
  /** Amount seller receives after platform fee deduction (subtotal - platformFee). */
  sellerReceives: number
  currency: string
}

/**
 * Calculate fee breakdown
 *
 * @description Computes buyer total (subtotal + VAT) and seller payout (subtotal - fee).
 * The platform fee is NOT added to the buyer's total — it is deducted from the seller's share.
 */
export function calculateFeeBreakdown(
  amount: number,
  feePercent: number = DEFAULT_PLATFORM_FEE_PERCENT,
  vatRate: number = 0.2,
  currency: string = 'GBP'
): FeeBreakdown {
  const platformFee = Math.round(amount * (feePercent / 100))
  const vat = Math.round(amount * vatRate)
  const total = amount + vat
  const sellerReceives = amount - platformFee

  return {
    subtotal: amount,
    platformFee,
    vat,
    total,
    sellerReceives,
    currency,
  }
}

/**
 * Format currency in compact form for chart axes (values in pence)
 */
export function formatCompactCurrency(pence: number): string {
  const pounds = pence / 100
  const abs = Math.abs(pounds)
  const sign = pounds < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(0)}k`
  return `${sign}£${abs.toFixed(0)}`
}

/**
 * Format currency amount for display
 */
export function formatCurrency(amount: number, currency: string = 'GBP', decimals: number = 2): string {
  const formatter = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  // Convert from smallest unit (pence) to main unit (pounds)
  return formatter.format(amount / 100)
}
