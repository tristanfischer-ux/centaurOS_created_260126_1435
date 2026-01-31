/**
 * Bank Transfer / Wire Transfer Service
 * Handles bank transfers for enterprise accounts using Stripe Bank Transfer
 */

import { stripe } from '@/lib/stripe/client'
import { createClient } from '@/lib/supabase/server'

// ==========================================
// TYPES
// ==========================================

export type BankTransferStatus = 
  | 'pending' 
  | 'awaiting_funds' 
  | 'processing' 
  | 'completed' 
  | 'expired' 
  | 'failed'

export interface BankTransferRequest {
  id: string
  userId: string
  amount: number
  currency: string
  status: BankTransferStatus
  stripePaymentIntentId: string | null
  bankTransferInstructions: BankTransferInstructions | null
  referenceNumber: string
  expiresAt: string | null
  completedAt: string | null
  createdAt: string
}

export interface BankTransferInstructions {
  financialAddresses: {
    type: string
    sortCode?: string
    accountNumber?: string
    iban?: string
    bic?: string
    accountHolderName: string
    bankName: string
  }[]
  reference: string
  amountRemaining: number
  currency: string
}

// ==========================================
// BANK TRANSFER MANAGEMENT
// ==========================================

/**
 * Create a bank transfer request for large payments
 * Uses Stripe's customer_balance payment method with bank transfer funding
 */
export async function createBankTransferRequest(
  userId: string,
  amount: number,
  currency: string = 'GBP',
  description?: string
): Promise<{
  request: BankTransferRequest | null
  instructions: BankTransferInstructions | null
  error: string | null
}> {
  try {
    // Minimum amount for bank transfers: £500
    if (amount < 50000) {
      return { 
        request: null, 
        instructions: null, 
        error: 'Minimum amount for bank transfer is £500' 
      }
    }

    const supabase = await createClient()
    
    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email, full_name')
      .eq('id', userId)
      .single()
    
    let customerId = profile?.stripe_customer_id
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email || undefined,
        name: profile?.full_name || undefined,
        metadata: { user_id: userId },
      })
      customerId = customer.id
      
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId)
    }

    // Create a payment intent with bank transfer as the payment method
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: currency.toLowerCase(),
      customer: customerId,
      payment_method_types: ['customer_balance'],
      payment_method_data: {
        type: 'customer_balance',
      },
      payment_method_options: {
        customer_balance: {
          funding_type: 'bank_transfer',
          bank_transfer: {
            type: currency.toLowerCase() === 'gbp' ? 'gb_bank_transfer' : 'eu_bank_transfer',
          },
        },
      },
      description: description || 'CentaurOS Account Balance Top-up',
      metadata: {
        type: 'bank_transfer_topup',
        user_id: userId,
      },
    })

    // Extract bank transfer instructions
    const instructions = extractBankTransferInstructions(paymentIntent)

    // Create the request record
    const { data: request, error: insertError } = await supabase
      .from('bank_transfer_requests')
      .insert({
        user_id: userId,
        amount,
        currency,
        status: 'awaiting_funds',
        stripe_payment_intent_id: paymentIntent.id,
        bank_transfer_instructions: instructions,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      })
      .select()
      .single()

    if (insertError) {
      return { request: null, instructions: null, error: insertError.message }
    }

    return {
      request: {
        id: request.id,
        userId: request.user_id,
        amount: request.amount,
        currency: request.currency,
        status: request.status as BankTransferStatus,
        stripePaymentIntentId: request.stripe_payment_intent_id,
        bankTransferInstructions: request.bank_transfer_instructions as BankTransferInstructions,
        referenceNumber: request.reference_number,
        expiresAt: request.expires_at,
        completedAt: request.completed_at,
        createdAt: request.created_at,
      },
      instructions,
      error: null,
    }
  } catch (error) {
    console.error('Error creating bank transfer request:', error)
    return { 
      request: null, 
      instructions: null, 
      error: error instanceof Error ? error.message : 'Failed to create bank transfer request' 
    }
  }
}

/**
 * Get pending bank transfer requests for a user
 */
export async function getPendingBankTransfers(
  userId: string
): Promise<{ requests: BankTransferRequest[]; error: string | null }> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('bank_transfer_requests')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['pending', 'awaiting_funds', 'processing'])
      .order('created_at', { ascending: false })
    
    if (error) {
      return { requests: [], error: error.message }
    }
    
    const requests: BankTransferRequest[] = (data || []).map(r => ({
      id: r.id,
      userId: r.user_id,
      amount: r.amount,
      currency: r.currency,
      status: r.status as BankTransferStatus,
      stripePaymentIntentId: r.stripe_payment_intent_id,
      bankTransferInstructions: r.bank_transfer_instructions as BankTransferInstructions,
      referenceNumber: r.reference_number,
      expiresAt: r.expires_at,
      completedAt: r.completed_at,
      createdAt: r.created_at,
    }))
    
    return { requests, error: null }
  } catch (error) {
    console.error('Error getting pending bank transfers:', error)
    return { requests: [], error: 'Failed to get bank transfers' }
  }
}

/**
 * Get bank transfer request by ID
 */
export async function getBankTransferRequest(
  requestId: string
): Promise<{ request: BankTransferRequest | null; error: string | null }> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('bank_transfer_requests')
      .select('*')
      .eq('id', requestId)
      .single()
    
    if (error) {
      return { request: null, error: error.message }
    }
    
    return {
      request: {
        id: data.id,
        userId: data.user_id,
        amount: data.amount,
        currency: data.currency,
        status: data.status as BankTransferStatus,
        stripePaymentIntentId: data.stripe_payment_intent_id,
        bankTransferInstructions: data.bank_transfer_instructions as BankTransferInstructions,
        referenceNumber: data.reference_number,
        expiresAt: data.expires_at,
        completedAt: data.completed_at,
        createdAt: data.created_at,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error getting bank transfer request:', error)
    return { request: null, error: 'Failed to get bank transfer request' }
  }
}

/**
 * Cancel a pending bank transfer request
 */
export async function cancelBankTransferRequest(
  requestId: string,
  userId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    
    // Verify ownership and status
    const { data: request, error: fetchError } = await supabase
      .from('bank_transfer_requests')
      .select('status, stripe_payment_intent_id')
      .eq('id', requestId)
      .eq('user_id', userId)
      .single()
    
    if (fetchError || !request) {
      return { success: false, error: 'Bank transfer request not found' }
    }
    
    if (!['pending', 'awaiting_funds'].includes(request.status)) {
      return { success: false, error: 'Cannot cancel this request' }
    }
    
    // Cancel the Stripe payment intent if it exists
    if (request.stripe_payment_intent_id) {
      try {
        await stripe.paymentIntents.cancel(request.stripe_payment_intent_id)
      } catch (stripeError) {
        console.error('Failed to cancel Stripe payment intent:', stripeError)
        // Continue anyway - the payment intent might already be canceled
      }
    }
    
    // Update status
    const { error: updateError } = await supabase
      .from('bank_transfer_requests')
      .update({ status: 'expired' })
      .eq('id', requestId)
    
    if (updateError) {
      return { success: false, error: updateError.message }
    }
    
    return { success: true, error: null }
  } catch (error) {
    console.error('Error canceling bank transfer request:', error)
    return { success: false, error: 'Failed to cancel bank transfer request' }
  }
}

/**
 * Handle bank transfer received webhook
 * Called when Stripe receives the bank transfer
 */
export async function handleBankTransferReceived(
  paymentIntentId: string
): Promise<void> {
  try {
    const supabase = await createClient()
    
    // Find the bank transfer request
    const { data: request, error: fetchError } = await supabase
      .from('bank_transfer_requests')
      .select('*')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single()
    
    if (fetchError || !request) {
      console.error('Bank transfer request not found for payment intent:', paymentIntentId)
      return
    }
    
    // Update status to processing
    await supabase
      .from('bank_transfer_requests')
      .update({ status: 'processing' })
      .eq('id', request.id)
    
    console.log('Bank transfer received, processing:', request.id)
  } catch (error) {
    console.error('Error handling bank transfer received:', error)
  }
}

/**
 * Handle bank transfer completed webhook
 * Called when Stripe successfully processes the bank transfer
 */
export async function handleBankTransferCompleted(
  paymentIntentId: string
): Promise<void> {
  try {
    const supabase = await createClient()
    
    // Get the payment intent to get the amount
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
    
    // Find the bank transfer request
    const { data: request, error: fetchError } = await supabase
      .from('bank_transfer_requests')
      .select('*')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single()
    
    if (fetchError || !request) {
      console.error('Bank transfer request not found for payment intent:', paymentIntentId)
      return
    }
    
    // Add funds to user's balance
    const { error: balanceError } = await supabase.rpc('adjust_account_balance', {
      p_user_id: request.user_id,
      p_amount: paymentIntent.amount,
      p_transaction_type: 'top_up',
      p_reference_type: 'bank_transfer',
      p_reference_id: request.id,
      p_stripe_payment_intent_id: paymentIntentId,
      p_description: `Bank transfer: ${request.reference_number}`,
    })
    
    if (balanceError) {
      console.error('Failed to adjust balance for bank transfer:', balanceError)
      return
    }
    
    // Update request status
    await supabase
      .from('bank_transfer_requests')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', request.id)
    
    console.log('Bank transfer completed:', request.id)
  } catch (error) {
    console.error('Error handling bank transfer completed:', error)
  }
}

// ==========================================
// HELPERS
// ==========================================

/**
 * Extract bank transfer instructions from a payment intent
 */
function extractBankTransferInstructions(
  paymentIntent: { 
    next_action?: { 
      display_bank_transfer_instructions?: {
        financial_addresses?: Array<{
          type: string
          sort_code?: string
          account_number?: string
          iban?: string
          bic?: string
        }>
        reference?: string
        amount_remaining?: number
        currency?: string
      }
    }
    id: string
    amount: number
    currency: string
  }
): BankTransferInstructions | null {
  const instructions = paymentIntent.next_action?.display_bank_transfer_instructions
  
  if (!instructions) {
    return null
  }
  
  return {
    financialAddresses: (instructions.financial_addresses || []).map(addr => ({
      type: addr.type,
      sortCode: addr.sort_code,
      accountNumber: addr.account_number,
      iban: addr.iban,
      bic: addr.bic,
      accountHolderName: 'CentaurOS Limited',
      bankName: 'Stripe Partner Bank',
    })),
    reference: instructions.reference || paymentIntent.id,
    amountRemaining: instructions.amount_remaining || paymentIntent.amount,
    currency: instructions.currency || paymentIntent.currency,
  }
}

/**
 * Format bank transfer instructions for display
 */
export function formatBankTransferInstructions(
  instructions: BankTransferInstructions
): string[] {
  const lines: string[] = []
  
  for (const addr of instructions.financialAddresses) {
    if (addr.type === 'sort_code') {
      lines.push(`Sort Code: ${addr.sortCode}`)
      lines.push(`Account Number: ${addr.accountNumber}`)
    } else if (addr.type === 'iban') {
      lines.push(`IBAN: ${addr.iban}`)
      if (addr.bic) lines.push(`BIC/SWIFT: ${addr.bic}`)
    }
    lines.push(`Account Name: ${addr.accountHolderName}`)
    lines.push(`Bank: ${addr.bankName}`)
  }
  
  lines.push(`Reference: ${instructions.reference}`)
  
  return lines
}
