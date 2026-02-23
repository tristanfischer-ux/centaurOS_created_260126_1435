/**
 * @file route.ts — Cron job for auto-generating recurring invoices
 *
 * @description Runs periodically to check for standalone invoices
 * with is_recurring=true and next_recurrence_date <= today.
 * Creates a new invoice copy and updates the next recurrence date.
 *
 * @security Authenticated via CRON_SECRET Bearer token. Uses admin client
 * (service role) to bypass RLS for cross-user queries.
 */

import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/security/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { nanoid } from 'nanoid'

export const dynamic = 'force-dynamic'

interface CronSummary {
  created: number
  failed: number
  skipped: number
}

export async function GET(req: Request) {
  const authFailure = verifyCronSecret(req)
  if (authFailure) return authFailure

  const summary: CronSummary = { created: 0, failed: 0, skipped: 0 }

  try {
    const supabase = createAdminClient()
    const today = new Date().toISOString().split('T')[0]

    // Find all recurring invoices due for regeneration
    const { data: dueInvoices, error: fetchError } = await supabase
      .from('finance_standalone_invoices')
      .select('*')
      .eq('is_recurring', true)
      .lte('next_recurrence_date', today)
      .in('status', ['sent', 'paid'])

    if (fetchError) {
      console.error('[Recurring Invoices] Failed to fetch due invoices:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
    }

    if (!dueInvoices || dueInvoices.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No recurring invoices due',
        ...summary,
        timestamp: new Date().toISOString(),
      })
    }

    for (const invoice of dueInvoices) {
      try {
        // Generate new invoice number
        const year = new Date().getFullYear()
        const prefix = `INV-${year}-`
        const { count } = await supabase
          .from('finance_standalone_invoices')
          .select('*', { count: 'exact', head: true })
          .eq('foundry_id', invoice.foundry_id)
          .like('invoice_number', `${prefix}%`)

        const invoiceNumber = `${prefix}${String((count ?? 0) + 1).padStart(5, '0')}`

        // Compute new due date based on recurrence interval
        const newDueDate = computeNextDate(invoice.next_recurrence_date, invoice.recurrence_interval)
        const nextRecurrence = computeNextDate(newDueDate, invoice.recurrence_interval)

        // Create new invoice
        const { error: insertError } = await supabase
          .from('finance_standalone_invoices')
          .insert({
            foundry_id: invoice.foundry_id,
            created_by: invoice.created_by,
            invoice_number: invoiceNumber,
            recipient_name: invoice.recipient_name,
            recipient_email: invoice.recipient_email,
            line_items: invoice.line_items,
            subtotal: invoice.subtotal,
            vat_amount: invoice.vat_amount,
            total: invoice.total,
            currency: invoice.currency,
            status: 'draft',
            due_date: newDueDate,
            is_recurring: true,
            recurrence_interval: invoice.recurrence_interval,
            next_recurrence_date: nextRecurrence,
            notes: invoice.notes,
          })

        if (insertError) {
          console.error(`[Recurring Invoices] Failed to create invoice for ${invoice.id}:`, insertError)
          summary.failed++
          continue
        }

        // Also generate a payment link for the new invoice
        const shortCode = nanoid(10)
        await supabase
          .from('finance_payment_links')
          .insert({
            foundry_id: invoice.foundry_id,
            created_by: invoice.created_by,
            short_code: shortCode,
            amount: invoice.total,
            currency: invoice.currency,
            description: `Invoice ${invoiceNumber} — ${invoice.recipient_name}`,
          })

        // Update original invoice's next_recurrence_date
        await supabase
          .from('finance_standalone_invoices')
          .update({ next_recurrence_date: nextRecurrence })
          .eq('id', invoice.id)

        summary.created++
      } catch (err) {
        console.error(`[Recurring Invoices] Error processing invoice ${invoice.id}:`, err)
        summary.failed++
      }
    }

    return NextResponse.json({
      success: true,
      ...summary,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[Recurring Invoices] Cron job failed:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export { GET as POST }

function computeNextDate(fromDate: string, interval: string): string {
  const date = new Date(fromDate)

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
