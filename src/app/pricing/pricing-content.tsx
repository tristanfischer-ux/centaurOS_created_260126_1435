/**
 * @file Pricing Content Component
 *
 * @description Client component for the public pricing page. Mirrors the
 * homepage tier framing (Free / £20 Starter / £10 add-on / £149 Pro) so
 * the public catalogue is consistent across surfaces. Reuses the shared
 * <PricingComparisonTable /> from the homepage. Legacy Explorer / Seed /
 * Startup Team / Professional tiers are hidden from the public catalogue
 * (existing subscribers stay on those tiers until they upgrade or churn).
 *
 * @component
 *
 * @example
 * <PricingContent />
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Zap,
  ChevronDown,
} from 'lucide-react'
import { MarketingNav } from '@/components/marketing/marketing-nav'
import { MarketingFooter } from '@/components/marketing/marketing-footer'
import { PricingComparisonTable } from '@/components/marketing/pricing-comparison-table'
import { cn } from '@/lib/utils'

/** FAQ items addressing common pricing objections */
const FAQ_ITEMS = [
  {
    question: 'Can I cancel anytime?',
    answer:
      "Yes, absolutely. You can cancel your subscription at any time from your account settings. No contracts, no cancellation fees. Your access continues until the end of your current billing period.",
  },
  {
    question: 'Do I need a credit card to start?',
    answer:
      "No. The Free tier is free forever — five brainstorming sessions a month, five saved investor searches over the life of the account, and unlimited supplier search across 18,000 UK and European manufacturers. No credit card required. Upgrade when you need more.",
  },
  {
    question: 'How does the £10 investor lead add-on work?',
    answer:
      "Inside the Investors page, when you have used your monthly Starter allowance, you can buy another 100 leads for £10 in one click. Each lead arrives with a why-fit paragraph, a how-to-pitch line, a drafted opening email, and full source citations — exactly the same depth as your monthly leads.",
  },
  {
    question: 'Can I upgrade or downgrade later?',
    answer:
      "Yes, you can switch tiers at any time. Upgrades take effect immediately, and downgrades apply at the end of your current billing period. Any unused credit is prorated.",
  },
  {
    question: 'What are the marketplace fees?',
    answer:
      "Every new account gets 0% marketplace fees on their first 3 orders — so you can try the full supplier matching experience risk-free. After that, paid tiers run at 5%. The fee covers payment processing, escrow, dispute resolution, and platform maintenance.",
  },
  {
    question: 'What if I am on a legacy tier (Explorer, Seed, Startup Team, Professional)?',
    answer:
      "You stay on the tier you signed up to. Existing subscribers keep their plan exactly as it is — no forced migration, no price change. The four-tier catalogue above is for new accounts.",
  },
]

/** Social proof stats — real platform data */
const SOCIAL_PROOF_STATS = [
  { value: '18,000+', label: 'UK & European Manufacturers' },
  { value: '7,800', label: 'Investors Indexed' },
  { value: '49,000', label: 'Partner Contacts' },
  { value: '< 20 min', label: 'First-Pass Engineering Package' },
]

/**
 * Public pricing tiers — must mirror the homepage teaser exactly.
 * Source of truth lives next to the homepage data; duplicated here so the
 * page can be read end-to-end without cross-file imports for tier cards.
 */
const PRICING_TIERS = [
  {
    name: 'Free',
    price: 'Free',
    cadence: '',
    detail:
      '5 brainstorming sessions a month. 5 saved investor searches over the life of the account. Unlimited supplier search across 18,000 UK and European manufacturers.',
    cta: 'Get Started Free',
    ctaSubtext: 'Free forever · No credit card required',
    emphasised: false,
  },
  {
    name: 'Starter',
    price: '£20',
    cadence: '/month',
    detail:
      '100 investor leads a month — each with a why-fit paragraph, a how-to-pitch line, and a drafted opening email. 10 brainstorming sessions a month. Unlimited saved searches. 0% marketplace fees on your first 3 orders.',
    cta: 'Start with Starter',
    ctaSubtext: 'Cancel anytime · Pay-as-you-go beyond limits',
    emphasised: true,
  },
  {
    name: 'Add-on',
    price: '£10',
    cadence: ' / 100 leads',
    detail:
      'Need more investor leads after your Starter allowance? £10 buys another 100 leads, one click from inside the Investors page. Same depth as your monthly leads.',
    cta: 'Available inside Starter',
    ctaSubtext: 'Bought from inside the Investors page',
    emphasised: false,
  },
  {
    name: 'Pro',
    price: '£149',
    cadence: '/month',
    detail:
      'Unlimited investor leads. Unlimited brainstorming. Deep Council — multi-specialist deep dives on a single question. Dual-side data: investor and manufacturer signals together.',
    cta: 'Upgrade to Pro',
    ctaSubtext: 'Cancel anytime · Best for active fundraisers',
    emphasised: false,
  },
] as const

/**
 * PricingContent - Public pricing page.
 *
 * @description Mirrors the homepage tier framing so the public-facing
 * catalogue is consistent across surfaces. Reuses the homepage's
 * <PricingComparisonTable /> for the row-by-row comparison.
 */
interface PricingContentProps {
  /** When true, the user is logged in — CTA buttons should route to
   *  /settings/billing for upgrade rather than /signup. */
  isAuthed?: boolean
}

export function PricingContent({ isAuthed = false }: PricingContentProps = {}) {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)
  const upgradeHref = isAuthed ? '/settings/billing' : '/signup'

  /**
   * Toggles a FAQ item open/closed.
   * @param index - The index of the FAQ item to toggle
   */
  function handleFaqToggle(index: number): void {
    setExpandedFaq(expandedFaq === index ? null : index)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNav />

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          {/* Breadcrumb back to home */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-international-orange transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
          {/* Header — Tristan 2026-04-28 (design audit cross-cutting fix #3):
              applied the canonical red-bar + bold-title + subtitle pattern.
              Previously a centred grey-uppercase eyebrow ("BUILT FOR HARDWARE
              FOUNDERS") + centred H1 + centred subtitle, which the audit
              flagged as drifting from My Profile's canonical pattern. Kept
              the centred alignment because /pricing is a marketing page, but
              now leads with the red-bar + H1 stack and drops the eyebrow. */}
          <div className="text-center space-y-4 mb-8">
            <div className="inline-flex items-center gap-3 mb-1">
              <div className="h-10 w-1.5 bg-international-orange rounded-full shadow-[0_0_10px_rgba(255,69,0,0.5)] hidden sm:block" />
              <h1 className="text-4xl sm:text-5xl font-display font-bold text-foreground tracking-tight">
                Start free. Scale when ready.
              </h1>
            </div>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Five free brainstorming sessions a month, five free saved investor searches, and unlimited supplier search across 18,000 UK and European manufacturers. Upgrade when you want more leads or deeper Council sessions.
            </p>
          </div>

          {/* Marketplace fee transparency banner */}
          <div className="max-w-3xl mx-auto mb-12 bg-muted/50 border border-muted rounded-xl p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <div className="h-10 w-10 rounded-lg bg-international-orange/10 flex items-center justify-center shrink-0">
                <Zap className="h-5 w-5 text-international-orange" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Transparent marketplace fees — 0% on your first 3 orders
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Every new account gets 0% marketplace fees on their first 3 orders. After that, paid tiers run at 5%. The fee covers payment processing, escrow, and dispute resolution.
                </p>
              </div>
            </div>
          </div>

          {/* Pricing tier cards — mirror homepage */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {PRICING_TIERS.map((tier) => (
              <Card
                key={tier.name}
                className={cn(
                  'relative flex flex-col',
                  tier.emphasised && 'border-international-orange border-2 shadow-lg'
                )}
              >
                {tier.emphasised && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-international-orange text-white text-[10px] font-mono uppercase tracking-widest">
                      Recommended
                    </span>
                  </div>
                )}
                <CardHeader className="pt-8 flex-1">
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  <div className="pt-4">
                    <span className="text-4xl font-bold text-foreground">
                      {tier.price}
                    </span>
                    {tier.cadence && (
                      <span className="text-muted-foreground text-sm">
                        {tier.cadence}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {tier.detail}
                  </p>

                  {/* CTA */}
                  <div className="space-y-2">
                    <Button
                      asChild
                      className={cn(
                        'w-full',
                        tier.emphasised
                          ? 'bg-international-orange hover:bg-international-orange-hover'
                          : ''
                      )}
                      variant={tier.emphasised ? 'default' : 'outline'}
                      disabled={tier.name === 'Add-on'}
                    >
                      <Link href={tier.name === 'Add-on' ? '/pricing' : upgradeHref}>
                        {tier.cta}
                        {tier.name !== 'Add-on' && (
                          <ArrowRight className="h-4 w-4 ml-2" />
                        )}
                      </Link>
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      {tier.ctaSubtext}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Comparison table — shared with homepage */}
          <div className="mb-8">
            <PricingComparisonTable />
          </div>

          {/* Enterprise section */}
          <Card className="mb-8 bg-muted/30">
            <CardContent className="py-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-xl bg-international-orange/10 flex items-center justify-center">
                    <Zap className="h-7 w-7 text-international-orange" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">Enterprise</h3>
                    <p className="text-muted-foreground">
                      Volume investor leads, dual-side data, dedicated account manager, and custom onboarding for foundries running multiple product programmes.
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="lg" asChild>
                  <a href="/contact">Contact Us</a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Social proof — real platform data */}
          <div className="mb-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {SOCIAL_PROOF_STATS.map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">
                    {stat.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ section */}
          <div className="mb-8 max-w-3xl mx-auto">
            <h2 className="text-2xl font-display font-semibold text-foreground text-center mb-8">
              Frequently Asked Questions
            </h2>
            <div className="space-y-2">
              {FAQ_ITEMS.map((faq, index) => {
                const isExpanded = expandedFaq === index
                return (
                  <div key={index} className="border border-muted rounded-lg">
                    <button
                      onClick={() => handleFaqToggle(index)}
                      className="w-full flex items-center justify-between px-5 py-4 text-left min-h-[44px]"
                      aria-expanded={isExpanded}
                    >
                      <span className="text-sm font-medium text-foreground pr-4">
                        {faq.question}
                      </span>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200',
                          isExpanded && 'rotate-180'
                        )}
                      />
                    </button>
                    {isExpanded && (
                      <div className="px-5 pb-4">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {faq.answer}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Closing CTA + reassurance */}
          <div className="text-center pb-12 space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link
                href={isAuthed ? '/welcome' : '/signup'}
                className="inline-flex items-center justify-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-3.5 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[48px]"
              >
                {isAuthed ? 'Open Welcome' : 'Get Started Free'} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm font-mono tracking-wider uppercase transition-colors min-h-[48px]"
              >
                Talk to us <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">
              0% marketplace fees on your first 3 orders. 5% after that on paid tiers. No hidden fees. Cancel anytime.
            </p>
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
              Free to try, no credit card required.
            </p>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  )
}
