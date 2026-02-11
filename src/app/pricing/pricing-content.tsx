/**
 * @file Pricing Content Component
 *
 * @description Client component for the public pricing page.
 * Shows tier comparison cards with monthly/annual toggle,
 * feature comparison table, and FAQ section.
 *
 * @component
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Zap,
  Users,
  ShoppingBag,
  Bot,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SUBSCRIPTION_PLANS } from '@/lib/billing/plans'

type BillingPeriod = 'monthly' | 'annual'

/**
 * PricingContent - Public pricing page with tier comparison.
 */
export function PricingContent() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly')

  const plans = [
    SUBSCRIPTION_PLANS.free,
    SUBSCRIPTION_PLANS.starter,
    SUBSCRIPTION_PLANS.professional,
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation bar */}
      <nav className="border-b border-muted py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-display font-semibold text-foreground">
            ForgeOS
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <Button asChild size="sm" className="bg-international-orange hover:bg-international-orange-hover">
              <Link href="/join">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        {/* Header */}
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-4xl sm:text-5xl font-display font-bold text-foreground tracking-tight">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start free. Upgrade when you need more AI tasks, team members, and marketplace features.
            All plans include a 10% platform fee on transactions.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <button
            onClick={() => setBillingPeriod('monthly')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
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
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              billingPeriod === 'annual'
                ? 'bg-international-orange text-white'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            Annual
            <Badge variant="secondary" className="ml-2 text-xs">
              Save 20%
            </Badge>
          </button>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {plans.map((plan, index) => {
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
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
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
                      label="AI tasks/month"
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

                  {/* Features list */}
                  <ul className="space-y-2.5 border-t border-muted pt-4">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-status-success mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
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
                    <Link href={plan.priceMonthlyGBP === 0 ? '/join' : '/join'}>
                      {plan.priceMonthlyGBP === 0 ? 'Get Started Free' : `Start with ${plan.name}`}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
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

        {/* Feature comparison table */}
        <div className="mb-16">
          <h2 className="text-2xl font-display font-semibold text-foreground text-center mb-8">
            Compare Plans
          </h2>
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Header row */}
              <div className="grid grid-cols-4 gap-4 pb-4 border-b border-muted">
                <div className="text-sm font-medium text-muted-foreground">Feature</div>
                <div className="text-sm font-medium text-center">Free</div>
                <div className="text-sm font-medium text-center">Starter</div>
                <div className="text-sm font-medium text-center text-international-orange">Professional</div>
              </div>

              {COMPARISON_FEATURES.map((feature) => (
                <div
                  key={feature.name}
                  className="grid grid-cols-4 gap-4 py-3 border-b border-muted/50"
                >
                  <div className="text-sm text-foreground">{feature.name}</div>
                  <ComparisonCell value={feature.free} />
                  <ComparisonCell value={feature.starter} />
                  <ComparisonCell value={feature.professional} />
                </div>
              ))}
            </div>
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
    </div>
  )
}

/**
 * Displays a key limit with icon.
 */
function LimitRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
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
  { name: 'AI tasks per month', free: '20', starter: '100', professional: '500' },
  { name: 'Team members', free: '1', starter: '3', professional: '10' },
  { name: 'Orders per month', free: '5', starter: '25', professional: 'Unlimited' },
  { name: 'Active retainers', free: false as boolean | string, starter: '1', professional: 'Unlimited' },
  { name: 'Voice-to-task', free: true, starter: true, professional: true },
  { name: 'AI marketplace search', free: true, starter: true, professional: true },
  { name: 'Centaur Matcher', free: false, starter: true, professional: true },
  { name: 'AI comparison assistant', free: false, starter: true, professional: true },
  { name: 'Ghost Agent automation', free: false, starter: true, professional: true },
  { name: 'API access', free: false, starter: false, professional: true },
  { name: 'Priority support', free: false, starter: false, professional: true },
  { name: 'Platform fee', free: '10%', starter: '10%', professional: '10%' },
]
