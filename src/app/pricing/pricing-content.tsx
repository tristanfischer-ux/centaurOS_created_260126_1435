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
import { cn } from '@/lib/utils'
import { SUBSCRIPTION_PLANS } from '@/lib/billing/plans'

type BillingPeriod = 'monthly' | 'annual'

/** Tooltip explanations for complex/jargon features */
const FEATURE_TOOLTIPS: Record<string, string> = {
  'Centaur Matcher': 'AI-powered matching that pairs you with the best human experts for your specific needs — like a talent scout that never sleeps.',
  'Ghost Agent automation': 'Background AI agents that handle repetitive tasks automatically while you focus on strategy.',
  'AI comparison assistant': 'An AI helper that analyses and compares marketplace providers side-by-side so you can choose with confidence.',
  'Voice-to-task': 'Speak your tasks out loud and our AI converts them into structured action items instantly.',
  'AI marketplace search': 'Natural language search across the entire marketplace — just describe what you need.',
  'API access': 'Programmatic access to the ForgeOS platform for custom integrations and automations.',
  'Active retainers': 'Ongoing service agreements with marketplace providers at discounted rates.',
}

/** FAQ items addressing common pricing objections */
const FAQ_ITEMS = [
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes, absolutely. You can cancel your subscription at any time from your account settings. No contracts, no cancellation fees. Your access continues until the end of your current billing period.',
  },
  {
    question: 'Do I need a credit card to start?',
    answer: 'No. The Explorer plan is completely free — no credit card required. You only need payment details when you decide to upgrade.',
  },
  {
    question: 'Can I upgrade or downgrade later?',
    answer: 'Yes, you can switch plans at any time. Upgrades take effect immediately, and downgrades apply at the end of your current billing period. Any unused credit is prorated.',
  },
  {
    question: 'What\'s the 10% platform fee?',
    answer: 'When you purchase services through the ForgeOS marketplace, a 10% platform fee is applied to the transaction. This covers payment processing, escrow, dispute resolution, and platform maintenance. There are no other hidden fees.',
  },
  {
    question: 'Is there a discount for annual billing?',
    answer: 'Yes! When you choose annual billing, you save 20% compared to monthly billing. That\'s effectively getting over 2 months free every year.',
  },
]

/** Social proof logos (placeholder brand names) */
const SOCIAL_PROOF_LOGOS = [
  'Epicurious',
  'CloudWatch',
  'Acme Corp',
  'Polymath',
  'Nexus AI',
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
      <div className="min-h-screen bg-background">
        {/* Navigation bar */}
        <nav className="sticky top-0 z-40 border-b border-muted bg-background py-3 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
                aria-label="Back to home"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Home</span>
              </Link>
              <span className="text-muted-foreground/30">|</span>
              <Link href="/" className="text-lg font-display font-semibold text-foreground">
                ForgeOS
              </Link>
            </div>
            <div className="flex items-center gap-3 sm:gap-6">
              <span className="text-sm font-medium text-international-orange">
                Pricing
              </span>
              <Link
                href="/login"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:inline"
              >
                Sign In
              </Link>
              <Button asChild size="sm" className="bg-international-orange hover:bg-international-orange-hover">
                <Link href="/join">Join the Waitlist</Link>
              </Button>
            </div>
          </div>
        </nav>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          {/* Header */}
          <div className="text-center space-y-4 mb-12">
            <h1 className="text-4xl sm:text-5xl font-display font-bold text-foreground tracking-tight">
              Flexible Plans for Every Stage
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Start free. Upgrade as your team grows. No hidden fees, no contracts.
            </p>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
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
                          : `£${(monthlyPrice / 100).toFixed(0)}`
                        }
                      </span>
                      {monthlyPrice > 0 && (
                        <span className="text-muted-foreground text-sm">/month</span>
                      )}
                      {billingPeriod === 'annual' && monthlyPrice > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          £{(plan.priceAnnualGBP / 100).toFixed(0)} billed annually
                        </p>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Key limits */}
                    <div className="space-y-3">
                      <LimitRow
                        icon={Bot}
                        label="Smart assists/month"
                        value={plan.limits.maxAiTasksPerMonth >= 10000
                          ? 'Unlimited'
                          : plan.limits.maxAiTasksPerMonth.toLocaleString()
                        }
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
                        <Link href="/join">Join the Waitlist
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Link>
                      </Button>
                      {/* CTA subtext to reduce commitment anxiety */}
                      <p className="text-xs text-muted-foreground text-center">
                        {plan.priceMonthlyGBP === 0
                          ? 'No credit card required'
                          : 'Switch plans or cancel anytime'
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
                      Unlimited everything. SSO, dedicated support, custom integrations, SLA guarantees.
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="lg">
                  Contact Sales
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Social proof section */}
          <div className="mb-16 text-center space-y-6">
            <p className="text-sm font-medium text-muted-foreground">
              Join 1,300+ teams using our product.
            </p>
            <div className="flex items-center justify-center gap-8 sm:gap-12 flex-wrap">
              {SOCIAL_PROOF_LOGOS.map((name) => (
                <span
                  key={name}
                  className="text-sm font-semibold text-muted-foreground/60 tracking-wide"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>

          {/* Feature comparison table */}
          <div className="mb-16">
            <h2 className="text-2xl font-display font-semibold text-foreground text-center mb-8">
              Compare Plans
            </h2>
            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                {/* Header row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-muted">
                  <div className="text-sm font-medium text-muted-foreground">Feature</div>
                  <div className="text-sm font-medium text-center">Explorer</div>
                  <div className="text-sm font-medium text-center">Startup Team</div>
                  <div className="text-sm font-medium text-center text-international-orange">Professional</div>
                </div>

                {COMPARISON_FEATURES.map((feature) => (
                  <div
                    key={feature.name}
                    className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-b border-muted/50"
                  >
                    <div className="text-sm text-foreground flex items-center gap-1.5">
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
                    <ComparisonCell value={feature.starter} />
                    <ComparisonCell value={feature.professional} />
                  </div>
                ))}
              </div>
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
              All plans include a standard 10% platform fee on marketplace transactions.
              No hidden fees. Cancel anytime.
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-muted py-6 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} Fractional Forge Ltd. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            </div>
          </div>
        </footer>
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
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
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

/** Feature comparison data */
const COMPARISON_FEATURES = [
  { name: 'Smart assists per month', free: '50', starter: '100', professional: '500' },
  { name: 'Team members', free: '1', starter: '3', professional: '10' },
  { name: 'Orders per month', free: '5', starter: '25', professional: 'Unlimited' },
  { name: 'Active retainers', free: false as boolean | string, starter: '1', professional: 'Unlimited' },
  { name: 'Voice-to-task', free: true, starter: true, professional: true },
  { name: 'AI marketplace search', free: true, starter: true, professional: true },
  { name: 'Centaur Matcher', free: false, starter: true, professional: true },
  { name: 'AI comparison assistant', free: false, starter: true, professional: true },
  { name: 'Ghost Agent automation', free: false, starter: true, professional: true },
  { name: 'Investor directory browse', free: true, starter: true, professional: true },
  { name: 'Investor detail pages', free: false, starter: true, professional: true },
  { name: 'Partner contacts & LinkedIn', free: false, starter: true, professional: true },
  { name: 'Portfolio intelligence', free: false, starter: true, professional: true },
  { name: 'Verified emails & deep profiles', free: false, starter: false, professional: true },
  { name: 'Fund performance & hardware fit', free: false, starter: false, professional: true },
  { name: 'API access', free: false, starter: false, professional: true },
  { name: 'Priority support', free: false, starter: false, professional: true },
  { name: 'Platform fee', free: '10%', starter: '10%', professional: '10%' },
]
