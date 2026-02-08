'use client'

/**
 * Public Pricing Page
 *
 * @description Marketing-facing pricing page showing subscription plans,
 * feature comparison matrix, FAQ section, and CTAs to signup.
 * Accessible without authentication.
 */

import { useState } from 'react'
import Link from 'next/link'
import {
  Check,
  X,
  Zap,
  Rocket,
  Building2,
  Crown,
  HelpCircle,
  ArrowRight,
  Infinity,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { SUBSCRIPTION_PLANS } from '@/lib/billing/plans'
import type { SubscriptionTier } from '@/lib/billing/plans'
import { formatAmount } from '@/types/billing'
import { cn } from '@/lib/utils'

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'https://forgeos.io'

const PLAN_ORDER: SubscriptionTier[] = ['free', 'starter', 'professional', 'enterprise']

const PLAN_ICONS: Record<SubscriptionTier, React.ElementType> = {
  free: Zap,
  starter: Rocket,
  professional: Building2,
  enterprise: Crown,
}

const PLAN_CTA_TEXT: Record<SubscriptionTier, string> = {
  free: 'Get Started Free',
  starter: 'Start Free Trial',
  professional: 'Start Free Trial',
  enterprise: 'Contact Sales',
}

const PLAN_CTA_HREF: Record<SubscriptionTier, string> = {
  free: '/signup',
  starter: '/signup?plan=starter',
  professional: '/signup?plan=professional',
  enterprise: 'mailto:sales@forgeos.ai?subject=Enterprise%20Plan%20Inquiry',
}

/** Feature matrix rows for the comparison table */
const FEATURE_MATRIX = [
  {
    category: 'Marketplace',
    features: [
      { name: 'Orders per month', free: '5', starter: '25', professional: 'Unlimited', enterprise: 'Unlimited' },
      { name: 'Marketplace access', free: 'Basic', starter: 'Full', professional: 'Full', enterprise: 'Full + Priority' },
      { name: 'Platform fee', free: '10%', starter: '10%', professional: '10%', enterprise: 'Custom' },
    ],
  },
  {
    category: 'Team',
    features: [
      { name: 'Team members', free: '1', starter: '3', professional: '10', enterprise: 'Unlimited' },
      { name: 'Active retainers', free: '--', starter: '1', professional: 'Unlimited', enterprise: 'Unlimited' },
      { name: 'Role-based access', free: false, starter: true, professional: true, enterprise: true },
    ],
  },
  {
    category: 'AI & Automation',
    features: [
      { name: 'AI task delegation', free: true, starter: true, professional: true, enterprise: true },
      { name: 'Org Blueprint analysis', free: true, starter: true, professional: true, enterprise: true },
      { name: 'API access', free: false, starter: false, professional: true, enterprise: true },
      { name: 'Custom AI integrations', free: false, starter: false, professional: false, enterprise: true },
    ],
  },
  {
    category: 'Support',
    features: [
      { name: 'Email support', free: true, starter: true, professional: true, enterprise: true },
      { name: 'Priority support', free: false, starter: false, professional: true, enterprise: true },
      { name: 'Dedicated account manager', free: false, starter: false, professional: false, enterprise: true },
      { name: 'SLA guarantees', free: false, starter: false, professional: false, enterprise: true },
      { name: 'SSO/SAML', free: false, starter: false, professional: false, enterprise: true },
    ],
  },
]

const FAQ_ITEMS = [
  {
    question: 'Can I change plans at any time?',
    answer: 'Yes. You can upgrade or downgrade your plan at any time from your billing settings. When upgrading, you\'ll be prorated for the remainder of your billing period. When downgrading, the change takes effect at the end of your current billing period.',
  },
  {
    question: 'What happens when I hit my order limit?',
    answer: 'When you reach your monthly order limit, you\'ll see a prompt to upgrade your plan. Existing orders in progress are not affected. The limit resets at the beginning of each billing period.',
  },
  {
    question: 'Is there a free trial?',
    answer: 'Yes! All paid plans include a 14-day free trial. You won\'t be charged until the trial ends, and you can cancel anytime during the trial period.',
  },
  {
    question: 'What is the platform fee?',
    answer: 'We charge a 10% platform fee on marketplace transactions. This covers payment processing, escrow protection, dispute resolution, and ongoing platform maintenance. Apprentice-role providers enjoy a discounted 8% rate.',
  },
  {
    question: 'Can I cancel my subscription?',
    answer: 'Absolutely. You can cancel your subscription at any time from the billing settings. Your plan will remain active until the end of your current billing period, and you won\'t be charged again.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit and debit cards (Visa, Mastercard, American Express) through Stripe. You can also maintain an account balance for faster checkout.',
  },
  {
    question: 'Do you offer annual discounts?',
    answer: 'Yes! Annual billing saves you approximately 20% compared to monthly billing. The annual amount is charged upfront.',
  },
  {
    question: 'What about Enterprise pricing?',
    answer: 'Enterprise plans are custom-priced based on your organization\'s needs. Contact our sales team for a personalized quote. Enterprise includes unlimited everything, SSO/SAML, SLA guarantees, and a dedicated account manager.',
  },
]

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="bg-background border-b" aria-label="Main navigation">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight">
            FRACTIONAL FORGE
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
            >
              Home
            </Link>
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <Button size="sm" asChild>
              <Link href="/signup">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6">
        {/* Hero */}
        <section className="text-center py-16 sm:py-24">
          <Badge variant="secondary" className="mb-4">Simple, transparent pricing</Badge>
          <h1 className="text-4xl sm:text-5xl font-display font-bold tracking-tight text-foreground">
            Plans that grow with your team
          </h1>
          <p className="text-lg text-muted-foreground mt-4 max-w-2xl mx-auto">
            Start free and upgrade as you scale. Every plan includes AI-powered task management,
            marketplace access, and Org Blueprint analysis.
          </p>

          {/* Billing toggle */}
          <div className="flex items-center justify-center gap-3 mt-8">
            <Label
              htmlFor="pricing-toggle"
              className={cn(
                'text-sm font-medium cursor-pointer',
                !isAnnual ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              Monthly
            </Label>
            <Switch
              id="pricing-toggle"
              checked={isAnnual}
              onCheckedChange={setIsAnnual}
            />
            <Label
              htmlFor="pricing-toggle"
              className={cn(
                'text-sm font-medium cursor-pointer',
                isAnnual ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              Annual
            </Label>
            {isAnnual && (
              <Badge variant="success" className="ml-1">Save ~20%</Badge>
            )}
          </div>
        </section>

        {/* Plan Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 pb-16">
          {PLAN_ORDER.map((tier) => {
            const plan = SUBSCRIPTION_PLANS[tier]
            const Icon = PLAN_ICONS[tier]
            const isPopular = tier === 'professional'

            return (
              <Card
                key={tier}
                className={cn(
                  'relative flex flex-col',
                  isPopular && 'border-international-orange shadow-lg scale-[1.02]'
                )}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-international-orange text-white border-0">
                      Most Popular
                    </Badge>
                  </div>
                )}

                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn(
                      'p-2 rounded-lg',
                      isPopular ? 'bg-international-orange/10' : 'bg-muted'
                    )}>
                      <Icon className={cn(
                        'h-5 w-5',
                        isPopular ? 'text-international-orange' : 'text-muted-foreground'
                      )} />
                    </div>
                  </div>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>

                  <div className="pt-4">
                    {tier === 'free' ? (
                      <p className="text-4xl font-bold">Free</p>
                    ) : tier === 'enterprise' ? (
                      <p className="text-4xl font-bold">Custom</p>
                    ) : (
                      <div>
                        <p className="text-4xl font-bold">
                          {isAnnual
                            ? formatAmount(Math.round(plan.priceAnnualGBP / 12), 'GBP')
                            : formatAmount(plan.priceMonthlyGBP, 'GBP')
                          }
                          <span className="text-base font-normal text-muted-foreground">/mo</span>
                        </p>
                        {isAnnual && plan.priceAnnualGBP > 0 && (
                          <p className="text-sm text-status-success mt-1">
                            Billed {formatAmount(plan.priceAnnualGBP, 'GBP')}/year
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col">
                  <ul className="space-y-3 flex-1">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-status-success flex-shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6">
                    <Button
                      className={cn(
                        'w-full',
                        isPopular && 'bg-international-orange hover:bg-international-orange-hover'
                      )}
                      variant={tier === 'free' ? 'outline' : 'default'}
                      asChild
                    >
                      <Link href={PLAN_CTA_HREF[tier]}>
                        {PLAN_CTA_TEXT[tier]}
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                    {tier !== 'free' && tier !== 'enterprise' && (
                      <p className="text-xs text-muted-foreground text-center mt-2">
                        14-day free trial included
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </section>

        {/* Feature Comparison Table */}
        <section className="py-16 border-t">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-display font-bold text-foreground">
              Compare all features
            </h2>
            <p className="text-muted-foreground mt-2">
              A detailed breakdown of what you get with each plan
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-4 pr-4 font-medium text-muted-foreground w-1/3">
                    Feature
                  </th>
                  {PLAN_ORDER.map((tier) => (
                    <th
                      key={tier}
                      className={cn(
                        'text-center py-4 px-2 font-semibold',
                        tier === 'professional' && 'text-international-orange'
                      )}
                    >
                      {SUBSCRIPTION_PLANS[tier].name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_MATRIX.map((category) => (
                  <>
                    <tr key={category.category}>
                      <td
                        colSpan={5}
                        className="pt-6 pb-2 text-sm font-semibold text-foreground uppercase tracking-wider"
                      >
                        {category.category}
                      </td>
                    </tr>
                    {category.features.map((feature) => (
                      <tr key={feature.name} className="border-b border-muted">
                        <td className="py-3 pr-4 text-sm text-muted-foreground">
                          {feature.name}
                        </td>
                        {PLAN_ORDER.map((tier) => {
                          const value = feature[tier as keyof typeof feature]
                          return (
                            <td key={tier} className="py-3 px-2 text-center text-sm">
                              <FeatureValue value={value} />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 border-t">
          <div className="text-center mb-12">
            <HelpCircle className="h-8 w-8 text-international-orange mx-auto mb-4" />
            <h2 className="text-3xl font-display font-bold text-foreground">
              Frequently asked questions
            </h2>
            <p className="text-muted-foreground mt-2">
              Everything you need to know about pricing and billing
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-2">
            {FAQ_ITEMS.map((item, index) => (
              <div
                key={index}
                className="border rounded-lg"
              >
                <button
                  className="flex items-center justify-between w-full px-6 py-4 text-left"
                  onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                  aria-expanded={expandedFaq === index}
                >
                  <span className="font-medium text-foreground">{item.question}</span>
                  <ChevronDown
                    className={cn(
                      'h-5 w-5 text-muted-foreground transition-transform',
                      expandedFaq === index && 'rotate-180'
                    )}
                  />
                </button>
                {expandedFaq === index && (
                  <div className="px-6 pb-4">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 border-t text-center">
          <h2 className="text-3xl font-display font-bold text-foreground">
            Ready to get started?
          </h2>
          <p className="text-muted-foreground mt-3 max-w-lg mx-auto">
            Join thousands of businesses using Fractional Forge to delegate, collaborate,
            and grow with AI-powered support.
          </p>
          <div className="flex items-center justify-center gap-4 mt-8">
            <Button size="lg" asChild>
              <Link href="/signup">
                Start Free
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="mailto:sales@forgeos.ai">
                Talk to Sales
              </Link>
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Fractional Forge. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="mailto:support@forgeos.ai" className="hover:text-foreground transition-colors">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

/**
 * Renders a feature value in the comparison table
 * - true -> green check
 * - false -> dash
 * - string -> text value
 */
function FeatureValue({ value }: { value: boolean | string }) {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className="h-4 w-4 text-status-success mx-auto" />
    ) : (
      <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
    )
  }

  if (value === 'Unlimited') {
    return (
      <span className="flex items-center justify-center gap-1 font-medium">
        <Infinity className="h-3.5 w-3.5" />
      </span>
    )
  }

  if (value === '--') {
    return <span className="text-muted-foreground/40">--</span>
  }

  return <span className="font-medium">{value}</span>
}
