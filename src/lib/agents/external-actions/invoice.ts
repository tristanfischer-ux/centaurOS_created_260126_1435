/**
 * @file invoice.ts — Invoice draft creation external action handler.
 *
 * @description Creates an invoice draft record in the finance_standalone_invoices
 * table from specialist-proposed data. Called from external-integrations.ts
 * after founder approval.
 *
 * @security Requires founder approval. Never auto-executed.
 * All records scoped to foundry_id.
 */

import { createAdminClient } from "@/lib/supabase/admin"

export interface InvoicePayload {
    recipientName: string
    recipientEmail?: string
    items: Array<{ description: string; quantity: number; unitPrice: number }>
    currency?: string
    dueDate?: string
    notes?: string
}

/**
 * Create an invoice draft in the database.
 *
 * @param payload - Invoice details from the specialist proposal
 * @param foundryId - The foundry ID for tenant isolation
 * @returns Invoice ID or error
 */
export async function createInvoiceDraft(
    payload: InvoicePayload,
    foundryId: string,
): Promise<{ invoiceId: string | null; error: string | null }> {
    const supabase = createAdminClient()

    const total = payload.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    const currency = payload.currency ?? "USD"

    // Generate invoice number
    const { count } = await supabase
        .from("finance_standalone_invoices")
        .select("id", { count: "exact", head: true })
        .eq("foundry_id", foundryId)

    const invoiceNumber = `INV-${String((count ?? 0) + 1).padStart(4, "0")}`

    const { data, error } = await supabase
        .from("finance_standalone_invoices")
        .insert({
            foundry_id: foundryId,
            invoice_number: invoiceNumber,
            recipient_name: payload.recipientName,
            recipient_email: payload.recipientEmail ?? null,
            total,
            currency,
            status: "draft",
            due_date: payload.dueDate ?? null,
            notes: payload.notes ?? null,
            line_items: payload.items,
        })
        .select("id")
        .single()

    if (error) {
        return { invoiceId: null, error: error.message }
    }

    return { invoiceId: data.id, error: null }
}
