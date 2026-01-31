/**
 * Billing system types for CentaurOS
 * Covers saved payment methods, credit balance, fee configuration,
 * payment retry, and payout preferences
 */

// ==========================================
// SAVED PAYMENT METHODS
// ==========================================

export interface SavedPaymentMethod {
  id: string
  userId: string
  stripePaymentMethodId: string
  cardBrand: string | null
  cardLastFour: string | null
  cardExpMonth: number | null
  cardExpYear: number | null
  isDefault: boolean
  billingName: string | null
  billingEmail: string | null
  createdAt: string
  updatedAt: string
}

export interface CreatePaymentMethodParams {
  stripePaymentMethodId: string
  setAsDefault?: boolean
}

// ==========================================
// ROLE-BASED FEES
// ==========================================

export type UserRole = 'executive' | 'founder' | 'apprentice' | 'default'
export type FeeOrderType = 'people_booking' | 'product_rfq' | 'service' | 'retainer' | 'default'

export interface PlatformFeeConfig {
  id: string
  role: UserRole
  orderType: FeeOrderType
  feePercent: number
  minFeeAmount: number | null
  maxFeeAmount: number | null
  effectiveFrom: string
  effectiveUntil: string | null
  createdAt: string
}

export interface FeeCalculation {
  grossAmount: number
  feePercent: number
  feeAmount: number
  netAmount: number
  role: UserRole
  orderType: FeeOrderType
}

// Default fee percentages (fallbacks if DB not available)
export const DEFAULT_FEE_CONFIG: Record<UserRole, Record<FeeOrderType, number>> = {
  default: {
    people_booking: 8,
    product_rfq: 8,
    service: 8,
    retainer: 10,
    default: 8,
  },
  executive: {
    people_booking: 8,
    product_rfq: 8,
    service: 8,
    retainer: 10,
    default: 8,
  },
  founder: {
    people_booking: 8,
    product_rfq: 8,
    service: 8,
    retainer: 10,
    default: 8,
  },
  apprentice: {
    people_booking: 5,
    product_rfq: 5,
    service: 5,
    retainer: 7,
    default: 5,
  },
}

// ==========================================
// CREDIT BALANCE / WALLET
// ==========================================

export interface AccountBalance {
  id: string
  userId: string
  balanceAmount: number // in smallest currency unit (pence)
  currency: string
  lastToppedUpAt: string | null
  createdAt: string
  updatedAt: string
}

export type BalanceTransactionType = 'top_up' | 'spend' | 'refund' | 'adjustment' | 'withdrawal'

export interface BalanceTransaction {
  id: string
  userId: string
  transactionType: BalanceTransactionType
  amount: number // positive for credits, negative for debits
  balanceBefore: number
  balanceAfter: number
  referenceType: string | null
  referenceId: string | null
  stripePaymentIntentId: string | null
  description: string | null
  createdAt: string
}

export interface TopUpParams {
  amount: number // in smallest currency unit
  paymentMethodId?: string // Use saved payment method, or null for new card
}

export interface SpendFromBalanceParams {
  amount: number
  orderId?: string
  description?: string
}

// ==========================================
// PAYMENT RETRY
// ==========================================

export type FailedPaymentStatus = 'pending' | 'retrying' | 'succeeded' | 'exhausted' | 'cancelled'

export interface FailedPayment {
  id: string
  orderId: string | null
  timesheetId: string | null
  userId: string
  stripePaymentIntentId: string | null
  failureCode: string | null
  failureMessage: string | null
  amount: number
  currency: string
  retryCount: number
  maxRetries: number
  nextRetryAt: string | null
  lastRetryAt: string | null
  status: FailedPaymentStatus
  createdAt: string
  resolvedAt: string | null
}

export interface RetryPaymentResult {
  success: boolean
  paymentIntentId?: string
  error?: string
  nextRetryAt?: string
}

// ==========================================
// MULTI-CURRENCY
// ==========================================

export type SupportedCurrency = 'GBP' | 'EUR' | 'USD'

export interface ExchangeRate {
  id: string
  baseCurrency: string
  targetCurrency: string
  rate: number
  fetchedAt: string
  expiresAt: string
}

export interface ConvertedAmount {
  originalAmount: number
  originalCurrency: SupportedCurrency
  convertedAmount: number
  targetCurrency: SupportedCurrency
  exchangeRate: number
  rateTimestamp: string
}

export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  GBP: '£',
  EUR: '€',
  USD: '$',
}

export const CURRENCY_LOCALES: Record<SupportedCurrency, string> = {
  GBP: 'en-GB',
  EUR: 'de-DE',
  USD: 'en-US',
}

// ==========================================
// PAYOUT PREFERENCES
// ==========================================

export type PayoutSchedule = 'automatic' | 'manual' | 'weekly' | 'monthly'

export interface PayoutPreferences {
  id: string
  providerId: string
  payoutSchedule: PayoutSchedule
  minimumPayoutAmount: number
  preferredPayoutDay: number | null
  instantPayoutEnabled: boolean
  createdAt: string
  updatedAt: string
}

export type PayoutRequestStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface PayoutRequest {
  id: string
  providerId: string
  amount: number
  currency: string
  status: PayoutRequestStatus
  stripePayoutId: string | null
  failureReason: string | null
  requestedAt: string
  processedAt: string | null
  completedAt: string | null
}

export interface RequestPayoutParams {
  amount: number
}

// ==========================================
// BILLING DASHBOARD TYPES
// ==========================================

export interface BuyerBillingDashboard {
  savedPaymentMethods: SavedPaymentMethod[]
  defaultPaymentMethod: SavedPaymentMethod | null
  accountBalance: AccountBalance | null
  recentTransactions: BalanceTransaction[]
  failedPayments: FailedPayment[]
  preferredCurrency: SupportedCurrency
}

export interface ProviderBillingDashboard {
  payoutPreferences: PayoutPreferences | null
  pendingPayouts: number
  availableBalance: number
  recentPayoutRequests: PayoutRequest[]
  feeConfig: PlatformFeeConfig | null
}

// ==========================================
// FORMATTING UTILITIES
// ==========================================

/**
 * Format amount from smallest unit to display string
 */
export function formatAmount(
  amount: number,
  currency: SupportedCurrency = 'GBP'
): string {
  const formatter = new Intl.NumberFormat(CURRENCY_LOCALES[currency], {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  })
  return formatter.format(amount / 100)
}

/**
 * Format card display (e.g., "Visa •••• 4242")
 */
export function formatCardDisplay(method: SavedPaymentMethod): string {
  const brand = method.cardBrand ? method.cardBrand.charAt(0).toUpperCase() + method.cardBrand.slice(1) : 'Card'
  const lastFour = method.cardLastFour || '****'
  return `${brand} •••• ${lastFour}`
}

/**
 * Check if card is expiring soon (within 3 months)
 */
export function isCardExpiringSoon(method: SavedPaymentMethod): boolean {
  if (!method.cardExpMonth || !method.cardExpYear) return false
  
  const now = new Date()
  const expDate = new Date(method.cardExpYear, method.cardExpMonth - 1)
  const threeMonthsFromNow = new Date()
  threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3)
  
  return expDate <= threeMonthsFromNow && expDate >= now
}

/**
 * Check if card is expired
 */
export function isCardExpired(method: SavedPaymentMethod): boolean {
  if (!method.cardExpMonth || !method.cardExpYear) return false
  
  const now = new Date()
  const expDate = new Date(method.cardExpYear, method.cardExpMonth)
  
  return expDate < now
}
