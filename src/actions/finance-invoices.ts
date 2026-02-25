'use server'

/**
 * @file finance-invoices.ts — Server actions for standalone invoicing and payment links
 *
 * @description CRUD for standalone invoices (independent of marketplace orders),
 * payment link generation with short codes, and recurring invoice management.
 *
 * @security All queries filter by user_id via auth + foundry_id via getFoundryIdCached().
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { revalidatePath } from 'next/cache'
import { nanoid } from 'nanoid'
import type {
  FinanceActionResult,
  StandaloneInvoice,
  PaymentLink,
  CreateInvoiceInput,
  CreatePaymentLinkInput,
  InvoiceLineItem,
} from '@/types/finance'

const DEFAULT_VAT_RATE = 0.20

// ============================================================
// Payment Links
// ============================================================

/**
 * Create a shareable payment link with a unique short code.
 */
export async function createPaymentLink(
  input: CreatePaymentLinkInput
): Promise<FinanceActionResult<PaymentLink>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (input.amount < 100) return { data: null, error: 'Minimum amount is £1.00' }

    const shortCode = nanoid(10)

    const { data, error } = await supabase
      .from('finance_payment_links')
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        short_code: shortCode,
        amount: input.amount,
        currency: input.currency ?? 'GBP',
        description: input.description,
        expires_at: input.expiresAt ?? null,
        invoice_id: input.invoiceId ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[Finance] Failed to create payment link:', error)
      return { data: null, error: 'Failed to create payment link' }
    }

    revalidatePath('/finance')
    return { data: mapPaymentLink(data), error: null }
  } catch (err) {
    console.error('[Finance] Failed to create payment link:', err)
    return { data: null, error: 'Failed to create payment link' }
  }
}

/**
 * Get all payment links for the current user.
 */
export async function getPaymentLinks(): Promise<FinanceActionResult<PaymentLink[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('finance_payment_links')
      .select('*')
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Finance] Failed to fetch payment links:', error)
      return { data: null, error: 'Failed to load payment links' }
    }

    return { data: (data ?? []).map(mapPaymentLink), error: null }
  } catch (err) {
    console.error('[Finance] Failed to fetch payment links:', err)
    return { data: null, error: 'Failed to load payment links' }
  }
}

/**
 * Get a payment link by its short code (public — no auth required).
 */
export async function getPaymentLinkByCode(
  shortCode: string
): Promise<FinanceActionResult<PaymentLink>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('finance_payment_links')
      .select('*')
      .eq('short_code', shortCode)
      .eq('status', 'active')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { data: null, error: 'Payment link not found or has expired' }
      }
      console.error('[Finance] Failed to fetch payment link by code:', error)
      return { data: null, error: 'Failed to load payment link' }
    }

    // Check expiration
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return { data: null, error: 'This payment link has expired' }
    }

    return { data: mapPaymentLink(data), error: null }
  } catch (err) {
    console.error('[Finance] Failed to fetch payment link by code:', err)
    return { data: null, error: 'Failed to load payment link' }
  }
}

/**
 * Cancel an active payment link.
 */
export async function cancelPaymentLink(
  linkId: string
): Promise<FinanceActionResult<null>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { error } = await supabase
      .from('finance_payment_links')
      .update({ status: 'cancelled' })
      .eq('id', linkId)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)

    if (error) {
      console.error('[Finance] Failed to cancel payment link:', error)
      return { data: null, error: 'Failed to cancel payment link' }
    }

    revalidatePath('/finance')
    return { data: null, error: null }
  } catch (err) {
    console.error('[Finance] Failed to cancel payment link:', err)
    return { data: null, error: 'Failed to cancel payment link' }
  }
}

// ============================================================
// Standalone Invoices
// ============================================================

/**
 * Create a standalone invoice with optional payment link generation.
 */
export async function createStandaloneInvoice(
  input: CreateInvoiceInput
): Promise<FinanceActionResult<StandaloneInvoice>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!input.lineItems.length) return { data: null, error: 'At least one line item is required' }

    // Calculate totals
    const subtotal = input.lineItems.reduce((sum, item) => sum + item.amount, 0)
    const vatAmount = Math.round(subtotal * DEFAULT_VAT_RATE)
    const total = subtotal + vatAmount

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(supabase, foundryId)

    // Compute next recurrence date
    let nextRecurrenceDate: string | null = null
    if (input.isRecurring && input.recurrenceInterval) {
      nextRecurrenceDate = computeNextRecurrence(input.dueDate, input.recurrenceInterval)
    }

    const { data, error } = await supabase
      .from('finance_standalone_invoices')
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        invoice_number: invoiceNumber,
        recipient_name: input.recipientName,
        recipient_email: input.recipientEmail,
        line_items: JSON.parse(JSON.stringify(input.lineItems)),
        subtotal,
        vat_amount: vatAmount,
        total,
        currency: input.currency ?? 'GBP',
        due_date: input.dueDate,
        notes: input.notes ?? null,
        is_recurring: input.isRecurring ?? false,
        recurrence_interval: input.recurrenceInterval ?? null,
        next_recurrence_date: nextRecurrenceDate,
      })
      .select()
      .single()

    if (error) {
      console.error('[Finance] Failed to create invoice:', error)
      return { data: null, error: 'Failed to create invoice' }
    }

    let invoice = mapStandaloneInvoice(data)

    // Auto-generate payment link if requested
    if (input.generatePaymentLink) {
      const linkResult = await createPaymentLink({
        amount: total,
        currency: input.currency ?? 'GBP',
        description: `Invoice ${invoiceNumber} — ${input.recipientName}`,
        invoiceId: invoice.id,
      })

      if (linkResult.data) {
        // Update invoice with payment link ID
        await supabase
          .from('finance_standalone_invoices')
          .update({ payment_link_id: linkResult.data.id })
          .eq('id', invoice.id)

        invoice = { ...invoice, paymentLinkId: linkResult.data.id }
      }
    }

    revalidatePath('/finance')
    revalidatePath('/finance/invoices')
    return { data: invoice, error: null }
  } catch (err) {
    console.error('[Finance] Failed to create invoice:', err)
    return { data: null, error: 'Failed to create invoice' }
  }
}

/**
 * Get all standalone invoices for the current user.
 */
export async function getStandaloneInvoices(): Promise<FinanceActionResult<StandaloneInvoice[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('finance_standalone_invoices')
      .select('*')
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Finance] Failed to fetch invoices:', error)
      return { data: null, error: 'Failed to load invoices' }
    }

    return { data: (data ?? []).map(mapStandaloneInvoice), error: null }
  } catch (err) {
    console.error('[Finance] Failed to fetch invoices:', err)
    return { data: null, error: 'Failed to load invoices' }
  }
}

/**
 * Get a single standalone invoice by ID.
 */
export async function getStandaloneInvoice(
  invoiceId: string
): Promise<FinanceActionResult<StandaloneInvoice>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('finance_standalone_invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)
      .single()

    if (error) {
      console.error('[Finance] Failed to fetch invoice:', error)
      return { data: null, error: 'Failed to load invoice' }
    }

    return { data: mapStandaloneInvoice(data), error: null }
  } catch (err) {
    console.error('[Finance] Failed to fetch invoice:', err)
    return { data: null, error: 'Failed to load invoice' }
  }
}

/**
 * Update invoice status (e.g. mark as sent, cancelled).
 */
export async function updateInvoiceStatus(
  invoiceId: string,
  status: 'sent' | 'paid' | 'cancelled'
): Promise<FinanceActionResult<StandaloneInvoice>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('finance_standalone_invoices')
      .update({ status })
      .eq('id', invoiceId)
      .eq('foundry_id', foundryId)
      .eq('created_by', user.id)
      .select()
      .single()

    if (error) {
      console.error('[Finance] Failed to update invoice status:', error)
      return { data: null, error: 'Failed to update invoice' }
    }

    revalidatePath('/finance/invoices')
    return { data: mapStandaloneInvoice(data), error: null }
  } catch (err) {
    console.error('[Finance] Failed to update invoice status:', err)
    return { data: null, error: 'Failed to update invoice' }
  }
}

// ============================================================
// Helpers
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPaymentLink(row: any): PaymentLink {
  return {
    id: row.id,
    foundryId: row.foundry_id,
    createdBy: row.created_by,
    shortCode: row.short_code,
    amount: row.amount,
    currency: row.currency,
    description: row.description,
    status: row.status,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    invoiceId: row.invoice_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStandaloneInvoice(row: any): StandaloneInvoice {
  return {
    id: row.id,
    foundryId: row.foundry_id,
    createdBy: row.created_by,
    invoiceNumber: row.invoice_number,
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    lineItems: (() => {
      const raw = row.line_items
      if (Array.isArray(raw)) return raw as InvoiceLineItem[]
      if (typeof raw === 'string') { try { return JSON.parse(raw) as InvoiceLineItem[] } catch { return [] } }
      return []
    })(),
    subtotal: row.subtotal,
    vatAmount: row.vat_amount,
    total: row.total,
    currency: row.currency,
    status: row.status,
    dueDate: row.due_date,
    paymentLinkId: row.payment_link_id,
    isRecurring: row.is_recurring,
    recurrenceInterval: row.recurrence_interval,
    nextRecurrenceDate: row.next_recurrence_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateInvoiceNumber(supabase: any, foundryId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`

  const { count } = await supabase
    .from('finance_standalone_invoices')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', foundryId)
    .like('invoice_number', `${prefix}%`)

  const nextNumber = (count ?? 0) + 1
  return `${prefix}${String(nextNumber).padStart(5, '0')}`
}

function computeNextRecurrence(currentDueDate: string, interval: string): string {
  const date = new Date(currentDueDate)

  switch (interval) {
    case 'weekly':
      date.setDate(date.getDate() + 7)
      break
    case 'fortnightly':
      date.setDate(date.getDate() + 14)
      break
    case 'monthly':
      date.setMonth(date.getMonth() + 1)
      break
    case 'quarterly':
      date.setMonth(date.getMonth() + 3)
      break
    case 'annual':
      date.setFullYear(date.getFullYear() + 1)
      break
  }

  return date.toISOString().split('T')[0]
}
