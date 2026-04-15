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
import { SUBSCRIPTION_PLANS } from '@/lib/billing/plans'

type BillingPeriod = 'monthly' | 'annual'

/** Tooltip explanation for what an "Assist" / "AI task" is */
const AI_TASK_TOOLTIP =
  'Each message to an AI specialist counts as 1 assist. Generating a CAD Lab engineering package uses 3–5 assists depending on complexity. Marketplace searches and browsing are free.'

/** Tooltip explanations for complex/jargon features */
const FEATURE_TOOLTIPS: Record<string, string> = {
  'Comparison assistant': 'Analyses and compares marketplace providers side-by-side so you can choose with confidence.',
  'Voice-to-task': 'Speak your tasks out loud and they are converted into structured action items instantly.',
  'Supplier matching': '6-factor matching that scores UK suppliers on capability, process, material, quality, and relevance.',
  'Assists': AI_TASK_TOOLTIP,
  'AI tasks': AI_TASK_TOOLTIP,
  'Assists per month': AI_TASK_TOOLTIP,
}

/** FAQ items addressing common pricing objections */
const FAQ_ITEMS = [
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes, absolutely. You can cancel your subscription at any time from your account settings. No contracts, no cancellation fees. Your access continues until the end of your current billing period.',
  },
  {
    question: 'Do I need a credit card to start?',
    answer: 'No. The Explorer plan is free forever — 50 AI tasks per month with all 13 specialists. No credit card required. Upgrade anytime for more capacity.',
  },
  {
    question: 'Can I upgrade or downgrade later?',
    answer: 'Yes, you can switch plans at any time. Upgrades take effect immediately, and downgrades apply at the end of your current billing period. Any unused credit is prorated.',
  },
  {
    question: 'What are the marketplace fees?',
    answer: 'Every new account gets 0% marketplace fees on their first 3 orders — so you can try the full supplier matching experience risk-free. After that, Explorer and Startup plans have a 10% platform fee, and Professional plans pay just 5%. This covers payment processing, escrow, dispute resolution, and platform maintenance.',
  },
  {
    question: 'Is there a discount for annual billing?',
    answer: 'Yes! When you choose annual billing, you save 20% compared to monthly billing. That\'s effectively getting over 2 months free every year.',
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

  const plans = [
    SUBSCRIPTION_PLANS.free,
    SUBSCRIPTION_PLANS.seed,
    SUBSCRIPTION_PLANS.starter,
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          {/* Header */}
          <div className="text-center space-y-4 mb-8">
            <p className="text-xs font-mono uppercase tracking-widest text-international-orange">
              The Operating System for Hardware Companies
            </p>
            <h1 className="text-4xl sm:text-5xl font-display font-bold text-foreground tracking-tight">
              From Idea to First Prototype, Faster
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Start free with all 13 specialists. Upgrade when you need more. No hidden fees, no contracts.
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
                  Every new account gets 0% marketplace fees on their first 3 orders. After that, Explorer and Startup Team plans pay 10%, Professional plans pay 5%. This covers payment processing, escrow, and dispute resolution.
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

          {/* Pricing cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {plans.map((plan) => {
              const isProfessional = plan.tier === 'professional'
              const monthlyPrice = billingPeriod === 'monthly'
                ? plan.priceMonthlyGBP
                : Math.round(plan.priceAnnualGBP / 12)

              return (
                <Card
                  key={plan.tier}
                  className={cn(
                    'relative flex flex-col',
                    isProfessional && 'border-international-orange border-2 shadow-lg'
                  )}
                >
                  {isProfessional && (
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
                    {/* Key limits */}
                    <div className="space-y-3">
                      <LimitRow
                        icon={Bot}
                        label="Assists/month"
                        value={plan.limits.maxAiTasksPerMonth >= 10000
                          ? 'Unlimited'
                          : plan.limits.maxAiTasksPerMonth.toLocaleString()
                        }
                        tooltip={AI_TASK_TOOLTIP}
                      />
                      <LimitRow
                        icon={ShoppingBag}
                        label="Orders/month"
                        value={plan.limits.maxOrders
                          ? plan.limits.maxOrders.toLocaleString()
                          : 'Unlimited'
                        }
                      />
                      <LimitRow
                        icon={Users}
                        label="Team members"
                        value={plan.limits.maxTeamMembers
                          ? plan.limits.maxTeamMembers.toLocaleString()
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
                          isProfessional
                            ? 'bg-international-orange hover:bg-international-orange-hover'
                            : ''
                        )}
                        variant={isProfessional ? 'default' : 'outline'}
                      >
                        <Link href="/join">
                          {plan.tier === 'free'
                            ? 'Get Started Free'
                            : plan.tier === 'seed'
                              ? 'Start with Seed'
                              : `Upgrade to ${plan.name}`}
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Link>
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        {plan.tier === 'free'
                          ? 'Free forever · No credit card required'
                          : 'Cancel anytime · Pay-as-you-go beyond limits'
                        }
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Enterprise section */}
          <Card className="mb-16 bg-muted/30">
            <CardContent className="py-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-xl bg-international-orange/10 flex items-center justify-center">
                    <Zap className="h-7 w-7 text-international-orange" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">Enterprise</h3>
                    <p className="text-muted-foreground">
                      Unlimited assists and team members. Dedicated account manager, custom onboarding, and priority support.
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
                <div className="min-w-[600px]">
                {/* Header row */}
                <div className="grid grid-cols-6 gap-2 sm:gap-4 pb-4 border-b border-muted">
                  <div className="text-xs sm:text-sm font-medium text-muted-foreground">Feature</div>
                  <div className="text-xs sm:text-sm font-medium text-center">Explorer</div>
                  <div className="text-xs sm:text-sm font-medium text-center">Seed</div>
                  <div className="text-xs sm:text-sm font-medium text-center">Startup Team</div>
                  <div className="text-xs sm:text-sm font-medium text-center text-international-orange">Professional</div>
                  <div className="text-xs sm:text-sm font-medium text-center">Enterprise</div>
                </div>

                {COMPARISON_FEATURES.map((feature) => (
                  <div
                    key={feature.name}
                    className="grid grid-cols-6 gap-2 sm:gap-4 py-3 border-b border-muted/50"
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
                    <ComparisonCell value={feature.seed} />
                    <ComparisonCell value={feature.starter} />
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
              After that: Explorer &amp; Startup at 10%, Professional at 5%.
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

/** Feature comparison data — only features that are actually implemented */
const COMPARISON_FEATURES: Array<{
  name: string
  free: boolean | string
  seed: boolean | string
  starter: boolean | string
  professional: boolean | string
  enterprise: boolean | string
}> = [
  { name: 'Assists per month', free: '50', seed: '250', starter: '750', professional: '2,500', enterprise: 'Unlimited' },
  { name: 'AI specialists', free: '13', seed: '13', starter: '13', professional: '13', enterprise: '13' },
  { name: 'Investor profiles/month', free: '15', seed: '50', starter: '150', professional: 'Unlimited', enterprise: 'Unlimited' },
  { name: 'Partner names & LinkedIn', free: true, seed: true, starter: true, professional: true, enterprise: true },
  { name: 'Verified investor emails', free: false, seed: true, starter: true, professional: true, enterprise: true },
  { name: 'Fund performance & hardware fit', free: true, seed: true, starter: true, professional: true, enterprise: true },
  { name: 'Marketplace orders', free: 'Unlimited', seed: 'Unlimited', starter: 'Unlimited', professional: 'Unlimited', enterprise: 'Unlimited' },
  { name: 'Marketplace + supplier matching', free: true, seed: true, starter: true, professional: true, enterprise: true },
  { name: 'Voice-to-task', free: true, seed: true, starter: true, professional: true, enterprise: true },
  { name: 'Engineering reports', free: true, seed: true, starter: true, professional: true, enterprise: true },
  { name: 'Pay-as-you-go overage', free: false, seed: true, starter: true, professional: true, enterprise: true },
  { name: 'API access', free: false, seed: false, starter: false, professional: true, enterprise: true },
  { name: 'Priority support', free: false, seed: false, starter: false, professional: true, enterprise: true },
  { name: 'Dedicated account manager', free: false, seed: false, starter: false, professional: false, enterprise: true },
  { name: 'Platform fee', free: '10%', seed: '10%', starter: '10% (0% first 3 orders)', professional: '5%', enterprise: '5%' },
]
