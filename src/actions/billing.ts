// @ts-nocheck - Tables exist but types not regenerated after billing_enhancements migration
'use server'

/**
 * Billing Server Actions
 * Handles saved payment methods, credit balance, fee configuration,
 * payment retry, and payout preferences
 */

import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/client'
import { revalidatePath } from 'next/cache'
import {
  SavedPaymentMethod,
  AccountBalance,
  BalanceTransaction,
  FailedPayment,
  PayoutPreferences,
  PayoutRequest,
  PlatformFeeConfig,
  ExchangeRate,
  UserRole,
  FeeOrderType,
  SupportedCurrency,
  DEFAULT_FEE_CONFIG,
} from '@/types/billing'

// ==========================================
// STRIPE CUSTOMER MANAGEMENT
// ==========================================

/**
 * Get or create Stripe customer for the current user
 */
export async function getOrCreateStripeCustomer(): Promise<{
  customerId: string | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { customerId: null, error: 'Not authenticated' }
    }
    
    // Check if user already has a Stripe customer ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email, full_name')
      .eq('id', user.id)
      .single()
    
    if (profileError) {
      return { customerId: null, error: 'Failed to fetch profile' }
    }
    
    if (profile.stripe_customer_id) {
      return { customerId: profile.stripe_customer_id, error: null }
    }
    
    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: profile.email || user.email,
      name: profile.full_name || undefined,
      metadata: {
        user_id: user.id,
      },
    })
    
    // Store customer ID in profile
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ stripe_customer_id: customer.id })
      .eq('id', user.id)
    
    if (updateError) {
      console.error('Failed to store Stripe customer ID:', updateError)
      // Still return the customer ID since it was created
    }
    
    return { customerId: customer.id, error: null }
  } catch (error) {
    console.error('Error in getOrCreateStripeCustomer:', error)
    return { customerId: null, error: 'Failed to create Stripe customer' }
  }
}

// ==========================================
// SAVED PAYMENT METHODS
// ==========================================

/**
 * Get saved payment methods for the current user
 */
export async function getSavedPaymentMethods(): Promise<{
  methods: SavedPaymentMethod[]
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { methods: [], error: 'Not authenticated' }
    }
    
    const { data, error } = await supabase
      .from('saved_payment_methods')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
    
    if (error) {
      return { methods: [], error: error.message }
    }
    
    const methods: SavedPaymentMethod[] = (data || []).map(m => ({
      id: m.id,
      userId: m.user_id,
      stripePaymentMethodId: m.stripe_payment_method_id,
      cardBrand: m.card_brand,
      cardLastFour: m.card_last_four,
      cardExpMonth: m.card_exp_month,
      cardExpYear: m.card_exp_year,
      isDefault: m.is_default,
      billingName: m.billing_name,
      billingEmail: m.billing_email,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    }))
    
    return { methods, error: null }
  } catch (error) {
    console.error('Error in getSavedPaymentMethods:', error)
    return { methods: [], error: 'Failed to fetch payment methods' }
  }
}

/**
 * Create a setup intent for adding a new payment method
 */
export async function createSetupIntent(): Promise<{
  clientSecret: string | null
  error: string | null
}> {
  try {
    const { customerId, error: customerError } = await getOrCreateStripeCustomer()
    
    if (customerError || !customerId) {
      return { clientSecret: null, error: customerError || 'Failed to get customer' }
    }
    
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    })
    
    return { clientSecret: setupIntent.client_secret, error: null }
  } catch (error) {
    console.error('Error in createSetupIntent:', error)
    return { clientSecret: null, error: 'Failed to create setup intent' }
  }
}

/**
 * Save a payment method after successful setup
 */
export async function savePaymentMethod(
  stripePaymentMethodId: string,
  setAsDefault: boolean = false
): Promise<{ method: SavedPaymentMethod | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { method: null, error: 'Not authenticated' }
    }
    
    // Retrieve payment method details from Stripe
    const paymentMethod = await stripe.paymentMethods.retrieve(stripePaymentMethodId)
    
    if (!paymentMethod.card) {
      return { method: null, error: 'Only card payment methods are supported' }
    }
    
    // Check if this is the user's first payment method
    const { count } = await supabase
      .from('saved_payment_methods')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
    
    const isFirstMethod = (count || 0) === 0
    
    // Save to database
    const { data, error } = await supabase
      .from('saved_payment_methods')
      .insert({
        user_id: user.id,
        stripe_payment_method_id: stripePaymentMethodId,
        card_brand: paymentMethod.card.brand,
        card_last_four: paymentMethod.card.last4,
        card_exp_month: paymentMethod.card.exp_month,
        card_exp_year: paymentMethod.card.exp_year,
        is_default: setAsDefault || isFirstMethod, // First card is always default
        billing_name: paymentMethod.billing_details.name,
        billing_email: paymentMethod.billing_details.email,
      })
      .select()
      .single()
    
    if (error) {
      return { method: null, error: error.message }
    }
    
    const method: SavedPaymentMethod = {
      id: data.id,
      userId: data.user_id,
      stripePaymentMethodId: data.stripe_payment_method_id,
      cardBrand: data.card_brand,
      cardLastFour: data.card_last_four,
      cardExpMonth: data.card_exp_month,
      cardExpYear: data.card_exp_year,
      isDefault: data.is_default,
      billingName: data.billing_name,
      billingEmail: data.billing_email,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
    
    revalidatePath('/settings')
    revalidatePath('/buyer')
    
    return { method, error: null }
  } catch (error) {
    console.error('Error in savePaymentMethod:', error)
    return { method: null, error: 'Failed to save payment method' }
  }
}

/**
 * Set a payment method as default
 */
export async function setDefaultPaymentMethod(
  paymentMethodId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Verify ownership and update
    const { error } = await supabase
      .from('saved_payment_methods')
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    revalidatePath('/settings')
    
    return { success: true, error: null }
  } catch (error) {
    console.error('Error in setDefaultPaymentMethod:', error)
    return { success: false, error: 'Failed to set default payment method' }
  }
}

/**
 * Delete a saved payment method
 */
export async function deletePaymentMethod(
  paymentMethodId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Get the payment method to get Stripe ID
    const { data: method, error: fetchError } = await supabase
      .from('saved_payment_methods')
      .select('stripe_payment_method_id, is_default')
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
      .single()
    
    if (fetchError || !method) {
      return { success: false, error: 'Payment method not found' }
    }
    
    // Detach from Stripe customer
    try {
      await stripe.paymentMethods.detach(method.stripe_payment_method_id)
    } catch (stripeError) {
      console.error('Failed to detach payment method from Stripe:', stripeError)
      // Continue with deletion even if Stripe detach fails
    }
    
    // Delete from database
    const { error } = await supabase
      .from('saved_payment_methods')
      .delete()
      .eq('id', paymentMethodId)
      .eq('user_id', user.id)
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    // If deleted method was default, set another as default
    if (method.is_default) {
      const { data: remaining } = await supabase
        .from('saved_payment_methods')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .single()
      
      if (remaining) {
        await supabase
          .from('saved_payment_methods')
          .update({ is_default: true })
          .eq('id', remaining.id)
      }
    }
    
    revalidatePath('/settings')
    
    return { success: true, error: null }
  } catch (error) {
    console.error('Error in deletePaymentMethod:', error)
    return { success: false, error: 'Failed to delete payment method' }
  }
}

// ==========================================
// CREDIT BALANCE / WALLET
// ==========================================

/**
 * Get account balance for the current user
 */
export async function getAccountBalance(): Promise<{
  balance: AccountBalance | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { balance: null, error: 'Not authenticated' }
    }
    
    const { data, error } = await supabase
      .from('account_balances')
      .select('*')
      .eq('user_id', user.id)
      .single()
    
    if (error && error.code !== 'PGRST116') { // Not found is OK
      return { balance: null, error: error.message }
    }
    
    if (!data) {
      // Return default balance
      return {
        balance: {
          id: '',
          userId: user.id,
          balanceAmount: 0,
          currency: 'GBP',
          lastToppedUpAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        error: null,
      }
    }
    
    return {
      balance: {
        id: data.id,
        userId: data.user_id,
        balanceAmount: data.balance_amount,
        currency: data.currency,
        lastToppedUpAt: data.last_topped_up_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error in getAccountBalance:', error)
    return { balance: null, error: 'Failed to fetch account balance' }
  }
}

/**
 * Get balance transaction history
 */
export async function getBalanceTransactions(
  limit: number = 20
): Promise<{ transactions: BalanceTransaction[]; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { transactions: [], error: 'Not authenticated' }
    }
    
    const { data, error } = await supabase
      .from('balance_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)
    
    if (error) {
      return { transactions: [], error: error.message }
    }
    
    const transactions: BalanceTransaction[] = (data || []).map(t => ({
      id: t.id,
      userId: t.user_id,
      transactionType: t.transaction_type,
      amount: t.amount,
      balanceBefore: t.balance_before,
      balanceAfter: t.balance_after,
      referenceType: t.reference_type,
      referenceId: t.reference_id,
      stripePaymentIntentId: t.stripe_payment_intent_id,
      description: t.description,
      createdAt: t.created_at,
    }))
    
    return { transactions, error: null }
  } catch (error) {
    console.error('Error in getBalanceTransactions:', error)
    return { transactions: [], error: 'Failed to fetch transactions' }
  }
}

/**
 * Create a payment intent for topping up balance
 */
export async function createBalanceTopUpIntent(
  amount: number, // in smallest currency unit (pence)
  paymentMethodId?: string
): Promise<{
  clientSecret: string | null
  paymentIntentId: string | null
  error: string | null
}> {
  try {
    if (amount < 500) { // £5 minimum
      return { clientSecret: null, paymentIntentId: null, error: 'Minimum top-up amount is £5' }
    }
    
    if (amount > 10000000) { // £100,000 maximum
      return { clientSecret: null, paymentIntentId: null, error: 'Maximum top-up amount is £100,000' }
    }
    
    const { customerId, error: customerError } = await getOrCreateStripeCustomer()
    
    if (customerError || !customerId) {
      return { clientSecret: null, paymentIntentId: null, error: customerError || 'Failed to get customer' }
    }
    
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'gbp',
      customer: customerId,
      payment_method: paymentMethodId,
      setup_future_usage: paymentMethodId ? undefined : 'off_session',
      metadata: {
        type: 'balance_top_up',
        user_id: user?.id || '',
      },
    })
    
    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      error: null,
    }
  } catch (error) {
    console.error('Error in createBalanceTopUpIntent:', error)
    return { clientSecret: null, paymentIntentId: null, error: 'Failed to create payment intent' }
  }
}

/**
 * Confirm balance top-up after successful payment
 * This should be called from webhook or after payment confirmation
 */
export async function confirmBalanceTopUp(
  paymentIntentId: string
): Promise<{ success: boolean; newBalance: number | null; error: string | null }> {
  try {
    // Retrieve payment intent to verify it succeeded
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
    
    if (paymentIntent.status !== 'succeeded') {
      return { success: false, newBalance: null, error: 'Payment not successful' }
    }
    
    const userId = paymentIntent.metadata.user_id
    if (!userId) {
      return { success: false, newBalance: null, error: 'Missing user ID in payment metadata' }
    }
    
    const supabase = await createClient()
    
    // Check if already processed (idempotency)
    const { data: existing } = await supabase
      .from('balance_transactions')
      .select('id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single()
    
    if (existing) {
      // Already processed
      const { balance } = await getAccountBalance()
      return { success: true, newBalance: balance?.balanceAmount || 0, error: null }
    }
    
    // Adjust balance using database function
    const { data, error } = await supabase.rpc('adjust_account_balance', {
      p_user_id: userId,
      p_amount: paymentIntent.amount,
      p_transaction_type: 'top_up',
      p_stripe_payment_intent_id: paymentIntentId,
      p_description: 'Account balance top-up',
    })
    
    if (error || !data?.[0]?.success) {
      return { success: false, newBalance: null, error: error?.message || data?.[0]?.error_message || 'Failed to adjust balance' }
    }
    
    revalidatePath('/buyer')
    revalidatePath('/settings')
    
    return { success: true, newBalance: data[0].new_balance, error: null }
  } catch (error) {
    console.error('Error in confirmBalanceTopUp:', error)
    return { success: false, newBalance: null, error: 'Failed to confirm top-up' }
  }
}

// ==========================================
// FEE CONFIGURATION
// ==========================================

/**
 * Get platform fee percentage for a given role and order type
 */
export async function getPlatformFeePercent(
  role: UserRole = 'default',
  orderType: FeeOrderType = 'default'
): Promise<{ feePercent: number; error: string | null }> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase.rpc('get_platform_fee_percent', {
      p_role: role,
      p_order_type: orderType,
    })
    
    if (error || data === null) {
      // Fall back to default configuration
      const defaultFee = DEFAULT_FEE_CONFIG[role]?.[orderType] 
        || DEFAULT_FEE_CONFIG[role]?.default 
        || DEFAULT_FEE_CONFIG.default[orderType]
        || 8
      return { feePercent: defaultFee, error: null }
    }
    
    return { feePercent: Number(data), error: null }
  } catch (error) {
    console.error('Error in getPlatformFeePercent:', error)
    // Fall back to default
    return { feePercent: DEFAULT_FEE_CONFIG[role]?.[orderType] || 8, error: null }
  }
}

/**
 * Calculate fee breakdown for an amount
 */
export async function calculateFeeBreakdown(
  grossAmount: number,
  role: UserRole = 'default',
  orderType: FeeOrderType = 'default'
): Promise<{
  grossAmount: number
  feePercent: number
  feeAmount: number
  netAmount: number
  error: string | null
}> {
  const { feePercent } = await getPlatformFeePercent(role, orderType)
  const feeAmount = Math.round(grossAmount * (feePercent / 100))
  const netAmount = grossAmount - feeAmount
  
  return {
    grossAmount,
    feePercent,
    feeAmount,
    netAmount,
    error: null,
  }
}

// ==========================================
// FAILED PAYMENT TRACKING
// ==========================================

/**
 * Get failed payments for the current user
 */
export async function getFailedPayments(): Promise<{
  payments: FailedPayment[]
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { payments: [], error: 'Not authenticated' }
    }
    
    const { data, error } = await supabase
      .from('failed_payments')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['pending', 'retrying'])
      .order('created_at', { ascending: false })
    
    if (error) {
      return { payments: [], error: error.message }
    }
    
    const payments: FailedPayment[] = (data || []).map(p => ({
      id: p.id,
      orderId: p.order_id,
      timesheetId: p.timesheet_id,
      userId: p.user_id,
      stripePaymentIntentId: p.stripe_payment_intent_id,
      failureCode: p.failure_code,
      failureMessage: p.failure_message,
      amount: p.amount,
      currency: p.currency,
      retryCount: p.retry_count,
      maxRetries: p.max_retries,
      nextRetryAt: p.next_retry_at,
      lastRetryAt: p.last_retry_at,
      status: p.status,
      createdAt: p.created_at,
      resolvedAt: p.resolved_at,
    }))
    
    return { payments, error: null }
  } catch (error) {
    console.error('Error in getFailedPayments:', error)
    return { payments: [], error: 'Failed to fetch failed payments' }
  }
}

/**
 * Retry a failed payment with a different payment method
 */
export async function retryFailedPayment(
  failedPaymentId: string,
  paymentMethodId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Get failed payment details
    const { data: failedPayment, error: fetchError } = await supabase
      .from('failed_payments')
      .select('*, order:orders(*)')
      .eq('id', failedPaymentId)
      .eq('user_id', user.id)
      .single()
    
    if (fetchError || !failedPayment) {
      return { success: false, error: 'Failed payment not found' }
    }
    
    if (failedPayment.status === 'succeeded') {
      return { success: true, error: null }
    }
    
    if (failedPayment.status === 'exhausted' || failedPayment.status === 'cancelled') {
      return { success: false, error: 'This payment cannot be retried' }
    }
    
    const { customerId, error: customerError } = await getOrCreateStripeCustomer()
    
    if (customerError || !customerId) {
      return { success: false, error: 'Failed to get customer' }
    }
    
    // Create new payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: failedPayment.amount,
      currency: failedPayment.currency.toLowerCase(),
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      metadata: {
        failed_payment_id: failedPaymentId,
        order_id: failedPayment.order_id || '',
        retry_of: failedPayment.stripe_payment_intent_id || '',
      },
    })
    
    if (paymentIntent.status === 'succeeded') {
      // Mark as succeeded
      await supabase
        .from('failed_payments')
        .update({
          status: 'succeeded',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', failedPaymentId)
      
      // If this was for an order, update the order
      if (failedPayment.order_id) {
        await supabase
          .from('orders')
          .update({
            stripe_payment_intent_id: paymentIntent.id,
            escrow_status: 'held',
          })
          .eq('id', failedPayment.order_id)
      }
      
      revalidatePath('/buyer')
      return { success: true, error: null }
    }
    
    // Payment didn't succeed immediately
    return { success: false, error: 'Payment requires additional action' }
  } catch (error) {
    console.error('Error in retryFailedPayment:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to retry payment' }
  }
}

// ==========================================
// PAYOUT PREFERENCES
// ==========================================

/**
 * Get payout preferences for the current provider
 */
export async function getPayoutPreferences(): Promise<{
  preferences: PayoutPreferences | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { preferences: null, error: 'Not authenticated' }
    }
    
    // Get provider profile
    const { data: provider } = await supabase
      .from('provider_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()
    
    if (!provider) {
      return { preferences: null, error: 'Not a provider' }
    }
    
    const { data, error } = await supabase
      .from('payout_preferences')
      .select('*')
      .eq('provider_id', provider.id)
      .single()
    
    if (error && error.code !== 'PGRST116') {
      return { preferences: null, error: error.message }
    }
    
    if (!data) {
      // Return default preferences
      return {
        preferences: {
          id: '',
          providerId: provider.id,
          payoutSchedule: 'automatic',
          minimumPayoutAmount: 5000, // £50
          preferredPayoutDay: null,
          instantPayoutEnabled: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        error: null,
      }
    }
    
    return {
      preferences: {
        id: data.id,
        providerId: data.provider_id,
        payoutSchedule: data.payout_schedule,
        minimumPayoutAmount: data.minimum_payout_amount,
        preferredPayoutDay: data.preferred_payout_day,
        instantPayoutEnabled: data.instant_payout_enabled,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error in getPayoutPreferences:', error)
    return { preferences: null, error: 'Failed to fetch payout preferences' }
  }
}

/**
 * Update payout preferences
 */
export async function updatePayoutPreferences(
  preferences: Partial<Pick<PayoutPreferences, 'payoutSchedule' | 'minimumPayoutAmount' | 'preferredPayoutDay'>>
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Get provider profile
    const { data: provider } = await supabase
      .from('provider_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()
    
    if (!provider) {
      return { success: false, error: 'Not a provider' }
    }
    
    // Validate minimum payout amount
    if (preferences.minimumPayoutAmount !== undefined && preferences.minimumPayoutAmount < 100) {
      return { success: false, error: 'Minimum payout amount must be at least £1' }
    }
    
    // Upsert preferences
    const { error } = await supabase
      .from('payout_preferences')
      .upsert({
        provider_id: provider.id,
        payout_schedule: preferences.payoutSchedule,
        minimum_payout_amount: preferences.minimumPayoutAmount,
        preferred_payout_day: preferences.preferredPayoutDay,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'provider_id',
      })
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    revalidatePath('/provider-portal/payments')
    
    return { success: true, error: null }
  } catch (error) {
    console.error('Error in updatePayoutPreferences:', error)
    return { success: false, error: 'Failed to update payout preferences' }
  }
}

/**
 * Request a manual payout
 */
export async function requestPayout(
  amount: number
): Promise<{ request: PayoutRequest | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { request: null, error: 'Not authenticated' }
    }
    
    // Get provider profile with Stripe account
    const { data: provider } = await supabase
      .from('provider_profiles')
      .select('id, stripe_account_id')
      .eq('user_id', user.id)
      .single()
    
    if (!provider || !provider.stripe_account_id) {
      return { request: null, error: 'Provider not found or Stripe account not connected' }
    }
    
    // Check available balance from Stripe
    const balance = await stripe.balance.retrieve({
      stripeAccount: provider.stripe_account_id,
    })
    
    const availableGBP = balance.available.find(b => b.currency === 'gbp')?.amount || 0
    
    if (amount > availableGBP) {
      return { request: null, error: `Insufficient balance. Available: £${(availableGBP / 100).toFixed(2)}` }
    }
    
    if (amount < 100) { // £1 minimum
      return { request: null, error: 'Minimum payout amount is £1' }
    }
    
    // Create payout request
    const { data, error } = await supabase
      .from('payout_requests')
      .insert({
        provider_id: provider.id,
        amount,
        currency: 'GBP',
        status: 'pending',
      })
      .select()
      .single()
    
    if (error) {
      return { request: null, error: error.message }
    }
    
    // Initiate the payout in Stripe
    try {
      const payout = await stripe.payouts.create({
        amount,
        currency: 'gbp',
        metadata: {
          payout_request_id: data.id,
          provider_id: provider.id,
        },
      }, {
        stripeAccount: provider.stripe_account_id,
      })
      
      // Update request with payout ID
      await supabase
        .from('payout_requests')
        .update({
          stripe_payout_id: payout.id,
          status: 'processing',
          processed_at: new Date().toISOString(),
        })
        .eq('id', data.id)
    } catch (stripeError) {
      // Mark as failed
      await supabase
        .from('payout_requests')
        .update({
          status: 'failed',
          failure_reason: stripeError instanceof Error ? stripeError.message : 'Failed to initiate payout',
        })
        .eq('id', data.id)
      
      return { request: null, error: 'Failed to initiate payout with Stripe' }
    }
    
    revalidatePath('/provider-portal/payments')
    
    return {
      request: {
        id: data.id,
        providerId: data.provider_id,
        amount: data.amount,
        currency: data.currency,
        status: 'processing',
        stripePayoutId: null,
        failureReason: null,
        requestedAt: data.requested_at,
        processedAt: new Date().toISOString(),
        completedAt: null,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error in requestPayout:', error)
    return { request: null, error: 'Failed to request payout' }
  }
}

// ==========================================
// MULTI-CURRENCY
// ==========================================

/**
 * Get user's preferred currency
 */
export async function getPreferredCurrency(): Promise<{
  currency: SupportedCurrency
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { currency: 'GBP', error: null }
    }
    
    const { data } = await supabase
      .from('profiles')
      .select('preferred_currency')
      .eq('id', user.id)
      .single()
    
    return { currency: (data?.preferred_currency as SupportedCurrency) || 'GBP', error: null }
  } catch (error) {
    return { currency: 'GBP', error: null }
  }
}

/**
 * Update user's preferred currency
 */
export async function updatePreferredCurrency(
  currency: SupportedCurrency
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    const { error } = await supabase
      .from('profiles')
      .update({ preferred_currency: currency })
      .eq('id', user.id)
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    revalidatePath('/settings')
    
    return { success: true, error: null }
  } catch (error) {
    console.error('Error in updatePreferredCurrency:', error)
    return { success: false, error: 'Failed to update currency preference' }
  }
}

/**
 * Get exchange rates (cached)
 */
export async function getExchangeRates(): Promise<{
  rates: ExchangeRate[]
  error: string | null
}> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('currency_exchange_rates')
      .select('*')
      .gt('expires_at', new Date().toISOString())
    
    if (error) {
      return { rates: [], error: error.message }
    }
    
    const rates: ExchangeRate[] = (data || []).map(r => ({
      id: r.id,
      baseCurrency: r.base_currency,
      targetCurrency: r.target_currency,
      rate: Number(r.rate),
      fetchedAt: r.fetched_at,
      expiresAt: r.expires_at,
    }))
    
    return { rates, error: null }
  } catch (error) {
    console.error('Error in getExchangeRates:', error)
    return { rates: [], error: 'Failed to fetch exchange rates' }
  }
}

/**
 * Convert amount between currencies
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency
): Promise<{
  convertedAmount: number
  rate: number
  error: string | null
}> {
  if (fromCurrency === toCurrency) {
    return { convertedAmount: amount, rate: 1, error: null }
  }
  
  const { rates } = await getExchangeRates()
  
  const rate = rates.find(
    r => r.baseCurrency === fromCurrency && r.targetCurrency === toCurrency
  )
  
  if (!rate) {
    // Try reverse rate
    const reverseRate = rates.find(
      r => r.baseCurrency === toCurrency && r.targetCurrency === fromCurrency
    )
    
    if (reverseRate) {
      const calculatedRate = 1 / reverseRate.rate
      return {
        convertedAmount: Math.round(amount * calculatedRate),
        rate: calculatedRate,
        error: null,
      }
    }
    
    // Fallback to hardcoded approximate rates
    const fallbackRates: Record<string, number> = {
      'GBP_EUR': 1.17,
      'GBP_USD': 1.27,
      'EUR_GBP': 0.85,
      'EUR_USD': 1.09,
      'USD_GBP': 0.79,
      'USD_EUR': 0.92,
    }
    
    const fallbackRate = fallbackRates[`${fromCurrency}_${toCurrency}`]
    if (fallbackRate) {
      return {
        convertedAmount: Math.round(amount * fallbackRate),
        rate: fallbackRate,
        error: null,
      }
    }
    
    return { convertedAmount: amount, rate: 1, error: 'Exchange rate not available' }
  }
  
  return {
    convertedAmount: Math.round(amount * rate.rate),
    rate: rate.rate,
    error: null,
  }
}
