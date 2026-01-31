/**
 * Billing Library
 * Central export for all billing-related functionality
 */

// Fee calculation
export {
  getSellerFeePercent,
  calculateOrderFee,
  getFeeDescription,
  calculateFeeBreakdownSync,
  FEE_TIERS,
} from './fees'

// Subscription management
export {
  getUserSubscription,
  createSubscriptionCheckout,
  createBillingPortalSession,
  cancelSubscription,
  resumeSubscription,
  handleSubscriptionEvent,
  checkSubscriptionLimit,
  SUBSCRIPTION_PLANS,
  type SubscriptionTier,
  type SubscriptionStatus,
  type SubscriptionPlan,
  type UserSubscription,
} from './subscriptions'

// Bank transfers
export {
  createBankTransferRequest,
  getPendingBankTransfers,
  getBankTransferRequest,
  cancelBankTransferRequest,
  handleBankTransferReceived,
  handleBankTransferCompleted,
  formatBankTransferInstructions,
  type BankTransferStatus,
  type BankTransferRequest,
  type BankTransferInstructions,
} from './bank-transfers'
