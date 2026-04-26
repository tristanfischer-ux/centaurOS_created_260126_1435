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
import { PricingContent } from './pricing-content'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Free / £20 Starter / £10 per 100 investor leads / £149 Pro. Simple public pricing for the smart-product wave. Start free, upgrade when you need more.',
}

export default function PricingPage() {
  return <PricingContent />
}
