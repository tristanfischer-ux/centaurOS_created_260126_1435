/**
 * @file warm-intros.ts
 *
 * @description Server action for users to request a warm introduction to an
 * investor firm that has no direct contact email on file. Fractional Forge
 * reviews the request and reaches out if we find a credible path.
 *
 * @security Foundry-scoped. withAuth wrapper enforces auth + foundry context.
 * Zod validates input. Insert is RLS-protected; fire-and-forget admin email
 * uses server-side admin address from env.
 */

'use server'

import { z } from 'zod'
import { withAuth } from '@/lib/server-action-utils'
import { sendEmail } from '@/lib/notifications/channels/email'

const requestSchema = z.object({
  listingId: z.string().uuid(),
  message: z.string().min(20).max(2000),
})

type WarmIntroResult = { success: true; requestId: string } | { error: string }

export async function requestWarmIntro(input: unknown): Promise<WarmIntroResult> {
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Please write 20–2000 characters about why this is a fit.' }
  }

  return withAuth<WarmIntroResult>(async ({ supabase, user, foundryId }) => {
    const { data: listing } = await supabase
      .from('marketplace_listings')
      .select('title')
      .eq('id', parsed.data.listingId)
      .single()

    if (!listing) {
      return { error: 'Investor not found' }
    }

    const { data, error } = await supabase
      .from('warm_intro_requests')
      .insert({
        requested_by: user.id,
        foundry_id: foundryId,
        listing_id: parsed.data.listingId,
        firm_name: listing.title,
        message: parsed.data.message,
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error('[requestWarmIntro] insert failed:', error)
      return { error: 'Failed to submit — please try again' }
    }

    const adminEmail = process.env.WARM_INTRO_ADMIN_EMAIL
    if (adminEmail) {
      sendEmail({
        to: adminEmail,
        subject: `Warm intro request: ${listing.title}`,
        body: `User ${user.email} (foundry ${foundryId}) has requested a warm intro to ${listing.title}.\n\nMessage:\n${parsed.data.message}\n\nView: ${process.env.NEXT_PUBLIC_APP_URL ?? ''}/admin/warm-intros/${data.id}`,
      }).catch(err => console.error('[requestWarmIntro] email failed:', err))
    }

    return { success: true, requestId: data.id }
  })
}
