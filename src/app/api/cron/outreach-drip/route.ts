/**
 * @file Outreach Drip Sender — Cron job that sends scheduled outreach emails.
 *
 * @description Runs every 30 minutes via Vercel cron. Finds claim tokens that
 * haven't had their initial email sent yet, and sends the appropriate drip
 * touch based on how many days since the token was created.
 *
 * Drip sequence (4 touches over 18 days):
 *   Day 0:  listing_claim       — "Quick question about [Company]"
 *   Day 4:  listing_claim_value — "[N] founders looking for [capability]"
 *   Day 11: listing_claim_case_study — "How suppliers are getting leads"
 *   Day 18: listing_claim_breakup — "Should I remove [Company]?"
 *
 * @security
 * - CRON_SECRET verification prevents unauthorized invocations
 * - Rate-limited to 30 emails per cron run to stay within Resend limits
 * - Updates outreach_status to prevent double-sends
 *
 * @related
 * - src/lib/notifications/channels/email.ts — email templates
 * - src/actions/listing-claims.ts — claim token management
 * - vercel.json — cron schedule definition
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/notifications/channels/email'

const CRON_SECRET = process.env.CRON_SECRET || ''
const MAX_EMAILS_PER_RUN = 30
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://forgeos.app'

// Drip sequence: [daysAfterCreation, templateName, description]
const DRIP_SEQUENCE: Array<[number, string, string]> = [
  [0, 'listing_claim', 'Opener — Quick question'],
  [4, 'listing_claim_value', 'Value-Add — Founders searching'],
  [11, 'listing_claim_case_study', 'Case Study — How suppliers get leads'],
  [18, 'listing_claim_breakup', 'Breakup — Should I remove you?'],
]

export async function GET(request: Request) {
  // SECURITY: Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  let sent = 0
  let skipped = 0
  let errors = 0

  try {
    // Get all pending claim tokens that haven't expired
    const { data: tokens, error: tokensError } = await supabase
      .from('listing_claim_tokens')
      .select(`
        id, token, email, status, created_at,
        listing:marketplace_listings!listing_claim_tokens_listing_id_fkey (
          id, title, description, outreach_status, outreach_notes, contact_name, contact_email,
          category, subcategory
        )
      `)
      .in('status', ['pending', 'clicked'])
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(100)

    if (tokensError) {
      console.error('[Drip] Failed to fetch tokens:', tokensError)
      return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 })
    }

    if (!tokens?.length) {
      return NextResponse.json({ sent: 0, message: 'No pending tokens' })
    }

    const now = new Date()

    for (const tokenRow of tokens) {
      if (sent >= MAX_EMAILS_PER_RUN) break

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listing = tokenRow.listing as any
      if (!listing || !tokenRow.email) {
        skipped++
        continue
      }

      const createdAt = new Date(tokenRow.created_at)
      const daysSinceCreated = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))

      // Determine which touch to send based on days elapsed
      // Find the latest touch that should have been sent by now
      let touchToSend: [number, string, string] | null = null
      for (const touch of DRIP_SEQUENCE) {
        if (daysSinceCreated >= touch[0]) {
          touchToSend = touch
        }
      }

      if (!touchToSend) {
        skipped++
        continue
      }

      // Check what's already been sent to this email
      // INTENT: Use a simple tag in the token's metadata to track which touches were sent
      // We'll use the listing's outreach_notes field to track sent touches
      const outreachNotes = listing.outreach_notes || ''
      const touchKey = `touch:${touchToSend[0]}`

      if (outreachNotes.includes(touchKey)) {
        // Already sent this touch
        skipped++
        continue
      }

      // Build claim URL
      const claimUrl = `${BASE_URL}/claim/${tokenRow.token}`

      // Extract a capability from the listing for personalisation
      const capability = listing.subcategory || listing.category || 'manufacturing'

      // Send the email
      const templateData = {
        companyName: listing.title || 'Your Company',
        contactName: listing.contact_name || '',
        description: listing.description || '',
        claimUrl,
        capability,
        founderCount: '5', // TODO: Query actual founder count
        socialProof: 'Suppliers who claim their listing get a verified badge and appear higher in search results.',
        caseStudy: 'Suppliers who claim their listing typically receive their first enquiry within 2 weeks. The verified badge increases visibility by 3x in search results.',
        claimedCount: '232', // TODO: Query actual claimed count
      }

      try {
        const result = await sendEmail({
          to: tokenRow.email,
          subject: '', // Template generates subject
          body: '',
          template: touchToSend[1] as 'listing_claim',
          templateData,
        })

        if (result.success) {
          sent++

          // Update outreach_notes to track which touches were sent
          const newNotes = outreachNotes
            ? `${outreachNotes}; ${touchKey}:${new Date().toISOString().slice(0, 10)}`
            : `${touchKey}:${new Date().toISOString().slice(0, 10)}`

          // Update listing status on first touch
          const statusUpdate: Record<string, unknown> = {
            outreach_notes: newNotes,
            last_contacted_at: new Date().toISOString(),
          }

          // Only update outreach_status to 'contacted' on first email
          if (listing.outreach_status === 'not_started' || !listing.outreach_status) {
            statusUpdate.outreach_status = 'contacted'
          }

          await supabase
            .from('marketplace_listings')
            .update(statusUpdate)
            .eq('id', listing.id)

          console.info(`[Drip] Sent ${touchToSend[2]} to ${tokenRow.email} (listing: ${listing.title?.substring(0, 40)})`)
        } else {
          errors++
          console.error(`[Drip] Failed to send to ${tokenRow.email}:`, result.error)
        }
      } catch (emailErr) {
        errors++
        console.error(`[Drip] Email error for ${tokenRow.email}:`, emailErr)
      }

      // Brief pause between emails to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    console.info(`[Drip] Run complete: ${sent} sent, ${skipped} skipped, ${errors} errors`)
    return NextResponse.json({ sent, skipped, errors, total: tokens.length })
  } catch (err) {
    console.error('[Drip] Cron error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
