/**
 * @file Pricing Content Component
 *
 * @description Client component for the public pricing page.
 * Shows tier comparison cards with monthly/annual toggle,
 * feature tooltips, social proof, FAQ section, and feature comparison table.
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
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Zap,
  Users,
  ShoppingBag,
  Bot,
  X,
  Info,
  ChevronDown,
} from 'lucide-react'
import { MarketingNav } from '@/components/marketing/marketing-nav'
import { MarketingFooter } from '@/components/marketing/marketing-footer'
import { cn } from '@/lib/utils'
import { SUBSCRIPTION_PLANS, INVESTOR_SEARCH_ADDON } from '@/lib/billing/plans'

type BillingPeriod = 'monthly' | 'annual'

/** Tooltip explanation for what an investor lead is */
const INVESTOR_LEAD_TOOLTIP =
  'Each lead bundles a verified investor profile with the why-fit reasoning, a tailored how-to-pitch, and a drafted email you can send straight from the platform.'

/** Tooltip explanation for what a brainstorming session is */
const BRAINSTORM_TOOLTIP =
  'A brainstorming session is one full pass with the Council — bring a question or a brief, get the specialists\' structured back-and-forth and a written summary you can act on.'

/** Tooltip explanation for what an "Assist" is */
const ASSIST_TOOLTIP =
  'Each message to a specialist counts as 1 assist. Generating a CAD Lab engineering package uses 3–5 assists depending on complexity. Marketplace searches and browsing are free.'

/** Tooltip explanations for complex/jargon features */
const FEATURE_TOOLTIPS: Record<string, string> = {
  'Comparison assistant': 'Analyses and compares marketplace providers side-by-side so you can choose with confidence.',
  'Voice-to-task': 'Speak your tasks out loud and they are converted into structured action items instantly.',
  'Supplier matching': '6-factor matching that scores UK suppliers on capability, process, material, quality, and relevance.',
  'Investor leads': INVESTOR_LEAD_TOOLTIP,
  'Brainstorming sessions': BRAINSTORM_TOOLTIP,
  'Deep Council': 'The full 13 specialists with extended thinking turned on — used for deep-dive sessions where you want every angle pressure-tested.',
  'Strategy Council': 'The Strategy Council adds custom specialists tuned for your company plus retrieval over your own foundry data — board-room depth, not just general reasoning.',
  'Assists': ASSIST_TOOLTIP,
  'Assists per month': ASSIST_TOOLTIP,
}

/** FAQ items addressing common pricing objections */
const FAQ_ITEMS = [
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes, absolutely. You can cancel your subscription at any time from your account settings. No contracts, no cancellation fees. Your access continues until the end of your current billing period.',
  },
  {
    question: 'Do I need a credit card to start?',
    answer: 'No. The Free plan lets you try ForgeOS without a credit card — 1 brainstorming session a month and a lifetime cap of 5 saved investor searches. Upgrade to Starter at £20/month when you want full investor leads with why-fit and drafted email.',
  },
  {
    question: 'What happens when I run out of investor leads on Starter?',
    answer: 'You get 100 leads bundled into Starter every month. If you need more, the £10-per-100 Investor Search Add-On is a one-click top-up from inside the Investors section — no resubscription, no admin.',
  },
  {
    question: 'Can I upgrade or downgrade later?',
    answer: 'Yes, you can switch plans at any time. Upgrades take effect immediately, and downgrades apply at the end of your current billing period. Any unused credit is prorated.',
  },
  {
    question: 'What are the marketplace fees?',
    answer: 'Every new account gets 0% marketplace fees on their first 3 orders — so you can try the full supplier matching experience risk-free. After that, Free and Starter plans have a 10% platform fee, and Pro plans pay just 5%. This covers payment processing, escrow, dispute resolution, and platform maintenance.',
  },
  {
    question: 'Is there a discount for annual billing?',
    answer: 'Yes. When you choose annual billing, you save 20% compared to monthly billing — effectively getting over 2 months free every year.',
  },
]

/** Social proof stats — real data beats fake logos */
const SOCIAL_PROOF_STATS = [
  { value: '9,900+', label: 'UK Manufacturers' },
  { value: '220+', label: 'ISO/DIN/BS Standards' },
  { value: '13', label: 'Specialists' },
  { value: '< 2 hrs', label: 'Avg. Engineering Package' },
]

/**
 * PricingContent - Public pricing page with tier comparison.
 *
 * @description Implements best practices from pricing UX research:
 * - Persona-based plan names with "Best for" descriptions
 * - Monthly/Annual toggle with prominent savings badge
 * - Info tooltips on complex features to reduce confusion
 * - CTA subtext to reduce commitment anxiety
 * - Social proof section for trust building
 * - FAQ section to address common objections
 */
export function PricingContent() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly')
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  // 2026-04-25 pricing restructure: public catalogue is Free / Starter / Pro,
  // with Enterprise on the contact-sales row below and the Investor Search
  // Add-On on its own card. Legacy Seed (£19) and Startup Team (£49) are
  // hidden — existing subscribers continue to be honoured at their existing
  // limits but the public surface only shows the new tiers.
  const plans = [
    SUBSCRIPTION_PLANS.free,
    SUBSCRIPTION_PLANS.starter_v2,
    SUBSCRIPTION_PLANS.professional,
  ]

  /**
   * Toggles a FAQ item open/closed.
   * @param index - The index of the FAQ item to toggle
   */
  function handleFaqToggle(index: number): void {
    setExpandedFaq(expandedFaq === index ? null : index)
  }

  return (
    <TooltipProvider delayDuration={300}>
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
          {/* Header */}
          <div className="text-center space-y-4 mb-8">
            <p className="text-xs font-mono uppercase tracking-widest text-international-orange">
              The Operating System for Hardware Companies
            </p>
            <h1 className="text-4xl sm:text-5xl font-display font-bold text-foreground tracking-tight">
              Investor leads, brainstorms, and the marketplace — one subscription
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Starter is £20 a month for 100 investor leads with full why-fit + how-to-pitch + drafted email. Need more? £10 per 100 extra, one click. Free still works.
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
                  Every new account gets 0% marketplace fees on their first 3 orders. After that, Free and Starter plans pay 10%, Pro plans pay 5%. This covers payment processing, escrow, and dispute resolution.
                </p>
              </div>
            </div>
          </div>

          {/* Billing toggle */}
          <div className="flex items-center justify-center gap-3 mb-12">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px]',
                billingPeriod === 'monthly'
                  ? 'bg-international-orange text-white'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('annual')}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] flex items-center gap-2',
                billingPeriod === 'annual'
                  ? 'bg-international-orange text-white'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              Yearly
              <Badge
                className={cn(
                  'text-xs font-semibold',
                  billingPeriod === 'annual'
                    ? 'bg-white/20 text-white border-white/30'
                    : 'bg-status-success-light text-status-success-dark border-status-success/20'
                )}
              >
                Save 20%
              </Badge>
            </button>
          </div>

          {/* Pricing cards — 3 columns: Free, Starter (highlighted), Pro */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {plans.map((plan) => {
              const isHighlighted = plan.tier === 'starter_v2'
              const monthlyPrice = billingPeriod === 'monthly'
                ? plan.priceMonthlyGBP
                : Math.round(plan.priceAnnualGBP / 12)

              const investorLeads = plan.limits.investorLeadsPerMonth
              const brainstorms = plan.limits.brainstormSessionsPerMonth

              return (
                <Card
                  key={plan.tier}
                  className={cn(
                    'relative flex flex-col',
                    isHighlighted && 'border-international-orange border-2 shadow-lg'
                  )}
                >
                  {isHighlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-international-orange text-white px-4">
                        Most Popular
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pt-8 flex-1">
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    {/* Persona-based "Best for" subtitle */}
                    <p className="text-sm text-muted-foreground">{plan.bestFor}</p>
                    <div className="pt-4">
                      <span className="text-4xl font-bold text-foreground">
                        {monthlyPrice === 0
                          ? 'Free'
                          : `£${monthlyPrice % 100 === 0
                              ? (monthlyPrice / 100).toFixed(0)
                              : (monthlyPrice / 100).toFixed(2)
                            }`
                        }
                      </span>
                      {monthlyPrice > 0 && (
                        <span className="text-muted-foreground text-sm">/month</span>
                      )}
                      {billingPeriod === 'annual' && monthlyPrice > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          £{plan.priceAnnualGBP % 100 === 0
                            ? (plan.priceAnnualGBP / 100).toFixed(0)
                            : (plan.priceAnnualGBP / 100).toFixed(2)
                          } billed annually
                        </p>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Key limits — investor leads, brainstorms, orders */}
                    <div className="space-y-3">
                      <LimitRow
                        icon={Users}
                        label="Investor leads/month"
                        value={
                          investorLeads === null
                            ? 'Unlimited'
                            : investorLeads === 0
                              ? 'Browse only'
                              : investorLeads.toLocaleString()
                        }
                        tooltip={INVESTOR_LEAD_TOOLTIP}
                      />
                      <LimitRow
                        icon={Bot}
                        label="Brainstorms/month"
                        value={
                          brainstorms === null
                            ? 'Unlimited'
                            : brainstorms.toLocaleString()
                        }
                        tooltip={BRAINSTORM_TOOLTIP}
                      />
                      <LimitRow
                        icon={ShoppingBag}
                        label="Marketplace orders"
                        value={plan.limits.maxOrders
                          ? plan.limits.maxOrders.toLocaleString()
                          : 'Unlimited'
                        }
                      />
                    </div>

                    {/* Features list with info tooltips */}
                    <ul className="space-y-2.5 border-t border-muted pt-4">
                      {plan.features.map((feature) => (
                        <FeatureItem key={feature} feature={feature} />
                      ))}
                    </ul>

                    {/* CTA */}
                    <div className="space-y-2">
                      <Button
                        asChild
                        className={cn(
                          'w-full',
                          isHighlighted
                            ? 'bg-international-orange hover:bg-international-orange-hover'
                            : ''
                        )}
                        variant={isHighlighted ? 'default' : 'outline'}
                      >
                        <Link href="/join">
                          {plan.tier === 'free'
                            ? 'Stay on Free'
                            : plan.tier === 'starter_v2'
                              ? 'Start Starter — £20/mo'
                              : `Upgrade to ${plan.name}`}
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Link>
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        {plan.tier === 'free'
                          ? 'Free forever · No credit card required'
                          : plan.tier === 'starter_v2'
                            ? 'Cancel anytime · £10 per 100 extra leads'
                            : 'Cancel anytime · Pay-as-you-go beyond limits'
                        }
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Investor Search Add-On — one-click upsell card */}
          <div className="mb-16">
            <Card className="border-dashed border-2 border-international-orange/40 bg-international-orange/5">
              <CardContent className="py-6 px-6 sm:py-8 sm:px-8">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="h-12 w-12 rounded-xl bg-international-orange/15 flex items-center justify-center shrink-0">
                      <Users className="h-6 w-6 text-international-orange" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h3 className="text-lg font-semibold text-foreground">
                          {INVESTOR_SEARCH_ADDON.label}
                        </h3>
                        <span className="text-sm text-muted-foreground">
                          One-click top-up from inside Investors
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Burned through your Starter allowance this month? Add another 100 investor leads — full why-fit, how-to-pitch, and drafted email — for £10. No resubscription, no admin.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-start md:items-end shrink-0">
                    <span className="text-3xl font-bold text-foreground">£{(INVESTOR_SEARCH_ADDON.priceGBP / 100).toFixed(0)}</span>
                    <span className="text-sm text-muted-foreground">per {INVESTOR_SEARCH_ADDON.searchesPerPurchase} extra leads</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Enterprise section — Strategy Council tier */}
          <Card className="mb-16 bg-muted/30">
            <CardContent className="py-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-xl bg-international-orange/10 flex items-center justify-center">
                    <Zap className="h-7 w-7 text-international-orange" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">Enterprise — Strategy Council</h3>
                    <p className="text-muted-foreground">
                      Custom specialists tuned for your company, retrieval over your foundry data, audit log, SSO, and SLA. Unlimited brainstorms and dedicated account manager.
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="lg" asChild>
                  <a href="/contact">Contact Sales</a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Social proof section — real data, not fake logos */}
          <div className="mb-16">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {SOCIAL_PROOF_STATS.map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Feature comparison table */}
          <div className="mb-16">
            <h2 className="text-2xl font-display font-semibold text-foreground text-center mb-8">
              Compare Plans
            </h2>
            <p className="text-xs text-muted-foreground text-center sm:hidden mb-2">
              ← Swipe to compare all plans →
            </p>
            <div className="relative">
              <div className="overflow-x-auto">
                <div className="min-w-[560px]">
                {/* Header row — Free / Starter (highlighted) / Pro / Enterprise */}
                <div className="grid grid-cols-5 gap-2 sm:gap-4 pb-4 border-b border-muted">
                  <div className="text-xs sm:text-sm font-medium text-muted-foreground">Feature</div>
                  <div className="text-xs sm:text-sm font-medium text-center">Free</div>
                  <div className="text-xs sm:text-sm font-medium text-center text-international-orange">Starter</div>
                  <div className="text-xs sm:text-sm font-medium text-center">Pro</div>
                  <div className="text-xs sm:text-sm font-medium text-center">Enterprise</div>
                </div>

                {COMPARISON_FEATURES.map((feature) => (
                  <div
                    key={feature.name}
                    className="grid grid-cols-5 gap-2 sm:gap-4 py-3 border-b border-muted/50"
                  >
                    <div className="text-xs sm:text-sm text-foreground flex items-center gap-1.5">
                      {feature.name}
                      {FEATURE_TOOLTIPS[feature.name] && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[240px]">
                            <p>{FEATURE_TOOLTIPS[feature.name]}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <ComparisonCell value={feature.free} />
                    <ComparisonCell value={feature.starter_v2} />
                    <ComparisonCell value={feature.professional} />
                    <ComparisonCell value={feature.enterprise} />
                  </div>
                ))}
              </div>
            </div>
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none sm:hidden" />
              <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent pointer-events-none sm:hidden" />
            </div>
          </div>

          {/* FAQ section */}
          <div className="mb-16 max-w-3xl mx-auto">
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

          {/* Platform fee note */}
          <div className="text-center pb-12">
            <p className="text-sm text-muted-foreground">
              All new accounts get 0% marketplace fees on their first 3 orders.
              After that: Free &amp; Starter at 10%, Pro at 5%.
              No hidden fees. Cancel anytime.
            </p>
          </div>
        </div>

        </main>

        <MarketingFooter />
      </div>
    </TooltipProvider>
  )
}

/**
 * Displays a single feature with a checkmark and optional info tooltip.
 *
 * @description Renders a feature line item. If the feature name matches
 * a known complex term in FEATURE_TOOLTIPS, an info icon is shown with
 * a tooltip explanation so users don't have to guess.
 *
 * @param props.feature - The feature text to display
 */
function FeatureItem({ feature }: { feature: string }) {
  const tooltipKey = Object.keys(FEATURE_TOOLTIPS).find((key) =>
    feature.toLowerCase().includes(key.toLowerCase())
  )

  return (
    <li className="flex items-start gap-2 text-sm">
      <CheckCircle2 className="h-4 w-4 text-status-success mt-0.5 shrink-0" />
      <span className="text-muted-foreground flex items-center gap-1.5">
        {feature}
        {tooltipKey && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px]">
              <p>{FEATURE_TOOLTIPS[tooltipKey]}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </span>
    </li>
  )
}

/**
 * Displays a key limit with icon.
 *
 * @param props.icon - Lucide icon component
 * @param props.label - Label text for the limit
 * @param props.value - Display value for the limit
 */
function LimitRow({
  icon: Icon,
  label,
  value,
  tooltip,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  /** Optional tooltip text shown via info icon next to the label */
  tooltip?: string
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px]">
              <p>{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

/**
 * Displays a comparison cell with check, X, or text value.
 *
 * @param props.value - Boolean for check/X, or string for text display
 */
function ComparisonCell({ value }: { value: boolean | string }) {
  if (typeof value === 'boolean') {
    return (
      <div className="flex justify-center">
        {value ? (
          <CheckCircle2 className="h-4 w-4 text-status-success" />
        ) : (
          <X className="h-4 w-4 text-muted-foreground/40" />
        )}
      </div>
    )
  }
  return <div className="text-sm text-center text-foreground">{value}</div>
}

/**
 * Feature comparison data — Free / Starter (the new £20 tier) / Pro / Enterprise.
 *
 * 2026-04-25: legacy Seed (£19) and legacy Startup Team (£49) are intentionally
 * not in the comparison grid. Existing subscribers continue to be honoured at
 * their current limits but don't get advertised on the public surface.
 */
const COMPARISON_FEATURES: Array<{
  name: string
  free: boolean | string
  starter_v2: boolean | string
  professional: boolean | string
  enterprise: boolean | string
}> = [
  { name: 'Investor leads/month', free: 'Browse only', starter_v2: '100', professional: 'Unlimited', enterprise: 'Unlimited' },
  { name: 'Why-fit + how-to-pitch + drafted email', free: false, starter_v2: true, professional: true, enterprise: true },
  { name: 'Investor Search Add-On (£10 / 100 extra)', free: false, starter_v2: true, professional: true, enterprise: true },
  { name: 'Brainstorming sessions', free: '1/month', starter_v2: '10/month', professional: 'Unlimited', enterprise: 'Unlimited' },
  { name: 'Saved investor searches', free: '5 lifetime', starter_v2: 'Unlimited', professional: 'Unlimited', enterprise: 'Unlimited' },
  { name: 'All 13 specialists', free: 'Read-only sandbox', starter_v2: true, professional: true, enterprise: true },
  { name: 'Deep Council', free: false, starter_v2: false, professional: true, enterprise: true },
  { name: 'Strategy Council', free: false, starter_v2: false, professional: false, enterprise: true },
  { name: 'Verified investor emails', free: false, starter_v2: true, professional: true, enterprise: true },
  { name: 'Fund performance & hardware fit', free: false, starter_v2: true, professional: true, enterprise: true },
  { name: 'Marketplace orders', free: 'Unlimited', starter_v2: 'Unlimited', professional: 'Unlimited', enterprise: 'Unlimited' },
  { name: 'Supplier matching', free: true, starter_v2: true, professional: true, enterprise: true },
  { name: 'Voice-to-task', free: false, starter_v2: false, professional: true, enterprise: true },
  { name: 'Engineering reports', free: false, starter_v2: true, professional: true, enterprise: true },
  { name: 'API access', free: false, starter_v2: false, professional: true, enterprise: true },
  { name: 'Dedicated account manager', free: false, starter_v2: false, professional: false, enterprise: true },
  { name: 'Platform fee', free: '10% (0% first 3 orders)', starter_v2: '10% (0% first 3 orders)', professional: '5%', enterprise: '5%' },
]
