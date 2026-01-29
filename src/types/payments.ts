/**
 * Payment system types for CentaurOS marketplace
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
export type EscrowStatus = 'pending' | 'held' | 'partial_release' | 'released' | 'refunded'

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
 * Platform fee configuration
 */
export interface PlatformFeeConfig {
  feePercent: number
  minFee?: number
  maxFee?: number
}

/**
 * Default platform fee percentage (8%)
 */
export const DEFAULT_PLATFORM_FEE_PERCENT = 8

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
 */
export interface FeeBreakdown {
  subtotal: number
  platformFee: number
  vat: number
  total: number
  currency: string
}

/**
 * Calculate fee breakdown
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

  return {
    subtotal: amount,
    platformFee,
    vat,
    total,
    currency,
  }
}

/**
 * Format currency amount for display
 */
export function formatCurrency(amount: number, currency: string = 'GBP'): string {
  const formatter = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  })

  // Convert from smallest unit (pence) to main unit (pounds)
  return formatter.format(amount / 100)
}
