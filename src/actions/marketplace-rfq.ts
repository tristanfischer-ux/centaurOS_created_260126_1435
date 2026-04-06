"use server"

/**
 * @file marketplace-rfq.ts
 *
 * @description Server actions for sending quote requests from the marketplace.
 * Since 0 suppliers have ForgeOS accounts, all engagement is via email
 * using the supplier's contact_email from marketplace_listings.
 *
 * @security Rate limited to 10 requests per hour per user.
 * Requires authenticated user with foundry membership.
 */

import { createClient } from "@/lib/supabase/server"
import { Resend } from "resend"
import { escapeHtml } from "@/lib/security/sanitize"

const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null

const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || "Tristan @ Fractional Forge <tristan@fractionalforge.app>"

export interface QuoteRequestParams {
    listingId: string
    subject: string
    message: string
    quantity?: string
    deadline?: string // ISO date string
}

export interface QuoteRequestResult {
    success: boolean
    quoteRequestId?: string
    error?: string
}

/**
 * Sends a quote request email to a supplier and records it in quote_requests.
 *
 * @security Rate limited, requires auth, validates listing exists.
 */
export async function sendSupplierQuoteRequest(
    params: QuoteRequestParams
): Promise<QuoteRequestResult> {
    const supabase = await createClient()

    // AUTH
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Please sign in" }

    // Get user profile for foundry_id and name
    const { data: profile } = await supabase
        .from("profiles")
        .select("foundry_id, full_name, email")
        .eq("id", user.id)
        .single()

    if (!profile?.foundry_id) return { success: false, error: "Company profile required" }

    // Get foundry name
    const { data: foundry } = await supabase
        .from("foundries")
        .select("name")
        .eq("id", profile.foundry_id)
        .single()

    // VALIDATION
    if (!params.subject?.trim()) return { success: false, error: "Subject is required" }
    if (!params.message?.trim()) return { success: false, error: "Message is required" }
    if (params.subject.length > 500) return { success: false, error: "Subject too long (max 500 chars)" }
    if (params.message.length > 5000) return { success: false, error: "Message too long (max 5000 chars)" }

    // Rate limiting: check recent requests
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: recentCount } = await supabase
        .from("quote_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", oneHourAgo)

    if ((recentCount ?? 0) >= 10) {
        return { success: false, error: "Rate limit reached. You can send up to 10 quote requests per hour." }
    }

    // Fetch the listing
    const { data: listing } = await supabase
        .from("marketplace_listings")
        .select("id, title, contact_email, description, subcategory")
        .eq("id", params.listingId)
        .single()

    if (!listing) return { success: false, error: "Supplier not found" }
    if (!listing.contact_email) return { success: false, error: "This supplier has no contact email on file" }

    // Insert quote request record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: quoteRequest, error: insertError } = await (supabase as any)
        .from("quote_requests")
        .insert({
            user_id: user.id,
            foundry_id: profile.foundry_id,
            listing_id: listing.id,
            supplier_name: listing.title,
            supplier_email: listing.contact_email,
            subject: params.subject.trim(),
            message: params.message.trim(),
            quantity: params.quantity?.trim() || null,
            deadline: params.deadline || null,
            status: "sent",
        })
        .select("id")
        .single()

    if (insertError || !quoteRequest) {
        console.error("[MarketplaceRFQ] Failed to create quote request:", insertError)
        return { success: false, error: "Failed to create quote request" }
    }

    // Send email via Resend
    if (resend) {
        try {
            const senderName = profile.full_name || "A ForgeOS user"
            const companyName = foundry?.name || "a company on ForgeOS"

            const emailResult = await resend.emails.send({
                from: FROM_ADDRESS,
                to: listing.contact_email,
                replyTo: profile.email,
                subject: `Quote Request: ${escapeHtml(params.subject.trim())}`,
                html: buildQuoteEmailHtml({
                    senderName,
                    companyName,
                    supplierName: listing.title,
                    subject: params.subject.trim(),
                    message: params.message.trim(),
                    quantity: params.quantity?.trim(),
                    deadline: params.deadline,
                    replyToEmail: profile.email,
                }),
            })

            // Update record with email metadata
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
                .from("quote_requests")
                .update({
                    email_sent_at: new Date().toISOString(),
                    email_message_id: emailResult.data?.id || null,
                })
                .eq("id", quoteRequest.id)

        } catch (emailErr) {
            console.error("[MarketplaceRFQ] Email send failed:", emailErr)
            // Record still exists with status 'sent' — email failed silently
            // Don't fail the whole operation — the record is useful for tracking
        }
    } else {
        console.warn("[MarketplaceRFQ] RESEND_API_KEY not configured — email not sent")
    }

    return { success: true, quoteRequestId: quoteRequest.id }
}

/**
 * Sends the same quote request to multiple suppliers.
 * Returns per-supplier results.
 */
export async function sendBulkQuoteRequests(
    listingIds: string[],
    params: Omit<QuoteRequestParams, "listingId">
): Promise<{ results: (QuoteRequestResult & { listingId: string })[], sentCount: number, failedCount: number }> {
    const results: (QuoteRequestResult & { listingId: string })[] = []
    let sentCount = 0
    let failedCount = 0

    // Send sequentially to respect rate limits and avoid spam
    for (const listingId of listingIds.slice(0, 10)) { // Hard cap at 10
        const result = await sendSupplierQuoteRequest({ ...params, listingId })
        results.push({ ...result, listingId })
        if (result.success) sentCount++
        else failedCount++
    }

    return { results, sentCount, failedCount }
}

/**
 * Fetches the user's quote request history.
 */
export async function getMyQuoteRequests(): Promise<{
    id: string
    created_at: string
    supplier_name: string
    subject: string
    status: string
    quantity: string | null
    deadline: string | null
    email_sent_at: string | null
}[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data } = await supabase
        .from("quote_requests")
        .select("id, created_at, supplier_name, subject, status, quantity, deadline, email_sent_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50)

    return (data ?? []) as typeof data & NonNullable<typeof data>
}

// ─── Email Template ─────────────────────────────────────────────────────────

function buildQuoteEmailHtml(params: {
    senderName: string
    companyName: string
    supplierName: string
    subject: string
    message: string
    quantity?: string
    deadline?: string
    replyToEmail: string
}): string {
    const deadlineStr = params.deadline
        ? new Date(params.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
        : null

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a;">
    <div style="border-bottom: 3px solid #ff4500; padding-bottom: 16px; margin-bottom: 24px;">
        <h1 style="font-size: 20px; margin: 0; color: #1a1a1a;">Quote Request</h1>
        <p style="font-size: 14px; color: #666; margin: 4px 0 0 0;">from ${escapeHtml(params.senderName)} at ${escapeHtml(params.companyName)}</p>
    </div>

    <p style="font-size: 14px; line-height: 1.6;">Dear ${escapeHtml(params.supplierName)},</p>

    <p style="font-size: 14px; line-height: 1.6;">${escapeHtml(params.message).replace(/\n/g, "<br>")}</p>

    ${params.quantity ? `<p style="font-size: 14px;"><strong>Quantity:</strong> ${escapeHtml(params.quantity)}</p>` : ""}
    ${deadlineStr ? `<p style="font-size: 14px;"><strong>Required by:</strong> ${escapeHtml(deadlineStr)}</p>` : ""}

    <div style="margin-top: 24px; padding: 16px; background: #f8f8f8; border-radius: 8px;">
        <p style="font-size: 13px; color: #666; margin: 0;">
            To respond, reply directly to this email — it will go to
            <a href="mailto:${escapeHtml(params.replyToEmail)}" style="color: #ff4500;">${escapeHtml(params.replyToEmail)}</a>
        </p>
    </div>

    <p style="font-size: 12px; color: #999; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
        Sent via <a href="https://fractionalforge.app" style="color: #ff4500;">Fractional Forge</a> —
        the operating system for hardware startups.
    </p>
</body>
</html>`
}
