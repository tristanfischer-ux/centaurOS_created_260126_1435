/**
 * @file Public Pricing Page
 *
 * @description Public-facing pricing comparison page showing all subscription
 * tiers with feature comparison, AI usage limits, and CTA buttons.
 * Accessible without authentication.
 *
 * @component
 */

import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { PricingContent } from './pricing-content'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Free / £20 Starter / £10 per 100 investor leads / £149 Pro. Simple public pricing for the smart-product wave. Start free, upgrade when you need more.',
}

export default async function PricingPage() {
  // Server-detect auth so the CTA buttons can route authed users to
  // /settings/billing instead of /signup. Tristan 2026-04-27 red-team
  // P1: Sarah was sent back to /signup when clicking 'Start with Starter'
  // even though she was logged in.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return <PricingContent isAuthed={!!user} />
}
