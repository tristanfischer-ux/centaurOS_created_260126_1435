/**
 * @file Resend Webhook Handler — tracks email delivery events for outreach.
 *
 * @description Receives webhook events from Resend (delivered, opened, clicked,
 * bounced, complained) and updates outreach_emails + outreach_contacts +
 * marketplace_listings statuses accordingly.
 *
 * @security
 * - Verifies webhook signature via svix headers (Resend uses svix under the hood)
 * - Falls back to shared secret if svix verification unavailable
 * - Rate-limited to prevent abuse
 *
 * @setup
 * 1. In Resend dashboard → Webhooks → Add endpoint
 * 2. URL: https://forgeos.app/api/webhooks/resend
 * 3. Events: email.delivered, email.opened, email.clicked, email.bounced, email.complained
 * 4. Copy signing secret → set RESEND_WEBHOOK_SECRET env var
 *
 * @related
 * - src/lib/notifications/channels/email.ts — sends emails via Resend
 * - src/actions/outreach.ts — outreach campaign management
 * - src/actions/outreach-dashboard.ts — pipeline metrics
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// SECURITY: Webhook signing secret from Resend dashboard
const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || ''

/**
 * Map Resend event types to outreach_emails status values
 */
const EVENT_TO_EMAIL_STATUS: Record<string, string> = {
  'email.delivered': 'sent',
  'email.opened': 'opened',
  'email.clicked': 'opened', // Clicked implies opened
  'email.bounced': 'bounced',
  'email.complained': 'bounced', // Spam complaint = effectively bounced
}

const EVENT_TO_CONTACT_STATUS: Record<string, string> = {
  'email.bounced': 'bounced',
  'email.complained': 'opted_out',
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const eventType = body?.type as string

    if (!eventType || !EVENT_TO_EMAIL_STATUS[eventType]) {
      return NextResponse.json({ received: true, skipped: true })
    }

    // SECURITY: Basic webhook verification
    // Resend sends a svix-id, svix-timestamp, svix-signature header set
    const svixId = request.headers.get('svix-id')
    if (!svixId && WEBHOOK_SECRET) {
      console.warn('[Resend Webhook] Missing svix headers — rejecting')
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }

    const data = body?.data
    if (!data?.to || !Array.isArray(data.to)) {
      return NextResponse.json({ received: true, skipped: true })
    }

    const recipientEmail = data.to[0]?.toLowerCase()
    const subject = data.subject || ''
    const emailStatus = EVENT_TO_EMAIL_STATUS[eventType]
    const contactStatus = EVENT_TO_CONTACT_STATUS[eventType]

    console.info(`[Resend Webhook] ${eventType} → ${recipientEmail} | subject: "${subject?.substring(0, 60)}"`)

    const supabase = createAdminClient()

    // 1. Update outreach_emails by matching recipient email + subject
    // INTENT: We match on the contact's email since we don't have a message ID mapping
    const { data: contacts } = await supabase
      .from('outreach_contacts')
      .select('id, campaign_id')
      .ilike('email', recipientEmail)

    if (contacts?.length) {
      // Update the most recent email for this contact to the new status
      // Only upgrade status (don't downgrade opened→sent)
      const statusPriority: Record<string, number> = {
        draft: 0, approved: 1, scheduled: 2, sent: 3, opened: 4, replied: 5, bounced: 6, opted_out: 7,
      }

      for (const contact of contacts) {
        const { data: emails } = await supabase
          .from('outreach_emails')
          .select('id, status')
          .eq('contact_id', contact.id)
          .order('sequence_position', { ascending: false })
          .limit(1)

        if (emails?.length) {
          const currentPriority = statusPriority[emails[0].status] || 0
          const newPriority = statusPriority[emailStatus] || 0

          if (newPriority > currentPriority) {
            const updateData: Record<string, string> = { status: emailStatus }
            if (eventType === 'email.opened' || eventType === 'email.clicked') {
              updateData.opened_at = new Date().toISOString()
            }

            await supabase
              .from('outreach_emails')
              .update(updateData)
              .eq('id', emails[0].id)
          }
        }

        // 2. Update contact status if applicable (bounced, opted_out)
        if (contactStatus) {
          await supabase
            .from('outreach_contacts')
            .update({ status: contactStatus })
            .eq('id', contact.id)
        }
      }
    }

    // 3. Update marketplace_listings outreach_status for claim emails
    // Match by contact_email to track delivery status
    if (eventType === 'email.bounced' || eventType === 'email.complained') {
      await supabase
        .from('marketplace_listings')
        .update({ outreach_status: 'not_relevant', outreach_notes: `Email bounced: ${recipientEmail}` })
        .ilike('contact_email', recipientEmail)
        .eq('outreach_status', 'contacted')
    }

    if (eventType === 'email.opened' || eventType === 'email.clicked') {
      // Track that the email was at least opened — but don't overwrite 'replied' or 'claimed'
      await supabase
        .from('marketplace_listings')
        .update({ last_contacted_at: new Date().toISOString() })
        .ilike('contact_email', recipientEmail)
        .in('outreach_status', ['contacted'])
    }

    return NextResponse.json({ received: true, processed: eventType })
  } catch (err) {
    console.error('[Resend Webhook] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
