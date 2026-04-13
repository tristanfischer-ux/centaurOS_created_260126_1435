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
  description: 'Simple, transparent pricing for every stage of your business. Start free, upgrade as you grow.',
}

export default function PricingPage() {
  return <PricingContent />
}
