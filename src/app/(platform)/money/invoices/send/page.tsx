/**
 * @file money/invoices/send/page.tsx — /money/invoices/send
 *
 * @description Money · Send invoice — mockup-faithful port of
 * MONEY-MOCKUP-SEND-INVOICE.html. Server component loads the signed-in
 * foundry's name (for the preview "From" block) and checks whether Xero
 * is connected (drives the "When you send" checklist), then hands a
 * typed props bundle to SendInvoiceView.
 *
 * Data contract (V1 preview — nothing is actually sent):
 *   - senderOrgName ← foundries.name (falls back to null; view renders
 *     "Your business").
 *   - nextInvoiceReference ← null for now. Invoice numbering will flow
 *     from `finance_standalone_invoices` once the send mutation lands;
 *     the view renders "Invoice —" until then.
 *   - xeroConnected ← true iff a xero_connection row exists for this
 *     foundry with sync_state = 'healthy'. Shared table landed in
 *     earlier migration so this lookup is safe today.
 *   - stripeConnected ← false for now. No Stripe connection table in
 *     production yet; the view handles the disabled state gracefully.
 *   - outstandingInvoices ← null. No invoice-history action exists yet,
 *     so the right rail renders the honest "wires up with the Xero +
 *     Stripe integration" empty state. When a listOutstandingForCustomer
 *     action lands, swap the body of safeOutstandingInvoices — do NOT
 *     fake rows here.
 *
 * Empty-state policy (per feedback_only_real_supabase_data.md):
 *   No fake outstanding invoices, no fake invoice numbers, no fake
 *   customers. Founder sees what they've typed in the preview, or
 *   honest empty-state copy where DB data doesn't exist yet.
 *
 * @related
 *   - View:   ./send-invoice-view.tsx
 *   - Styles: ./send-invoice-v2.css (scoped .inv2 — do NOT modify)
 *   - Mockup: MONEY-MOCKUP-SEND-INVOICE.html
 */

import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import { SendInvoiceView, type OutstandingInvoice } from "./send-invoice-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Send invoice · Money",
    description:
        "Quick-send a branded invoice with an optional one-click payment link. Logs to Xero as a sales invoice when connected.",
}

export default async function MoneySendInvoicePage(): Promise<React.ReactNode> {
    const senderOrgName = await safeSenderOrgName()
    const xeroConnected = await safeXeroConnected()
    const outstandingInvoices = await safeOutstandingInvoices()

    return (
        <SendInvoiceView
            senderOrgName={senderOrgName}
            nextInvoiceReference={null}
            xeroConnected={xeroConnected}
            stripeConnected={false}
            outstandingInvoices={outstandingInvoices}
        />
    )
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Loads the signed-in foundry's trading name for the preview "From"
 * block. Returns null when the user is signed out or the lookup fails
 * — the view then falls back to "Your business".
 */
async function safeSenderOrgName(): Promise<string | null> {
    try {
        const foundryId = await getFoundryIdCached()
        if (!foundryId) return null

        const supabase = await createClient()
        const { data, error } = await supabase
            .from("foundries")
            .select("name")
            .eq("id", foundryId)
            .maybeSingle()
        if (error || !data) return null

        const name = typeof data.name === "string" ? data.name.trim() : ""
        return name.length > 0 ? name : null
    } catch (err) {
        console.error("[SEND-INVOICE-PAGE] sender org name load failed:", err)
        return null
    }
}

/**
 * Returns true iff a healthy Xero connection exists for this foundry.
 * Drives the "When you send" checklist copy — when false the view shows
 * "Xero push · connect Xero to enable" instead of pretending it will run.
 */
async function safeXeroConnected(): Promise<boolean> {
    try {
        const foundryId = await getFoundryIdCached()
        if (!foundryId) return false

        const supabase = await createClient()
        const { data, error } = await supabase
            .from("xero_connection")
            .select("sync_state")
            .eq("foundry_id", foundryId)
            .maybeSingle()
        if (error || !data) return false

        // Any non-error state (healthy/syncing) counts as "connected" for
        // UI purposes; the cockpit page is the source of truth for sync
        // health detail.
        return data.sync_state !== "error"
    } catch (err) {
        console.error("[SEND-INVOICE-PAGE] xero connection check failed:", err)
        return false
    }
}

/**
 * Loads outstanding invoices for the typed customer.
 *
 * Contract: no listOutstandingForCustomer action exists yet — the
 * invoice-send mutation lands with the Xero + Stripe integration next
 * round. Returning `null` here tells the view to render the honest
 * "wires up with the Xero + Stripe integration" empty-state copy.
 *
 * Once the action lands, swap the body of this function — do NOT fake
 * rows here. Return `[]` (empty array) means "lookup ran, nothing found".
 * Return `null` means "lookup is not wired yet".
 */
async function safeOutstandingInvoices(): Promise<OutstandingInvoice[] | null> {
    return null
}
