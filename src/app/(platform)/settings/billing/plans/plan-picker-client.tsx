'use client'

/**
 * Plan Picker Client Component
 *
 * @description Card-based plan selector showing all available subscription tiers
 * with feature comparison, monthly/annual toggle, and checkout integration.
 *
 * @param {SubscriptionTier} currentTier - The user's current subscription tier
 * @param {string} currentStatus - The user's current subscription status
 */

import { useState } from 'react'
import {
  Check,
  Loader2,
  Zap,
  Building2,
  Rocket,
  Crown,
  ArrowLeft,
  Infinity,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { SUBSCRIPTION_PLANS } from '@/lib/billing/plans'
import type { SubscriptionTier } from '@/lib/billing/plans'
import { startSubscriptionCheckout } from '@/actions/subscriptions'
import { formatAmount } from '@/types/billing'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface PlanPickerClientProps {
  currentTier: SubscriptionTier
  currentStatus?: string
}

const PLAN_ICONS: Record<SubscriptionTier, React.ElementType> = {
  free: Zap,
  starter: Rocket,
  professional: Building2,
  enterprise: Crown,
}

const PLAN_ORDER: SubscriptionTier[] = ['free', 'starter', 'professional', 'enterprise']

export function PlanPickerClient({ currentTier, currentStatus }: PlanPickerClientProps) {
  const [isAnnual, setIsAnnual] = useState(false)
  const [loadingTier, setLoadingTier] = useState<SubscriptionTier | null>(null)

  const handleSelectPlan = async (tier: SubscriptionTier): Promise<void> => {
    if (tier === currentTier) return
    if (tier === 'free') {
      // Downgrading to free happens via cancel in billing portal
      toast.info('To downgrade to Free, cancel your current subscription from the billing page.')
      return
    }
    if (tier === 'enterprise') {
      // Enterprise requires contacting sales
      window.location.href = 'mailto:sales@forgeos.ai?subject=Enterprise%20Plan%20Inquiry'
      return
    }

    setLoadingTier(tier)
    const { url, error } = await startSubscriptionCheckout(
      tier,
      isAnnual ? 'annual' : 'monthly'
    )

    if (error || !url) {
      toast.error('Error', { description: error || 'Failed to start checkout' })
      setLoadingTier(null)
      return
    }

    // Redirect to Stripe Checkout
    window.location.href = url
  }

  const getAnnualSavings = (tier: SubscriptionTier): number => {
    const plan = SUBSCRIPTION_PLANS[tier]
    if (plan.priceMonthlyGBP === 0) return 0
    const monthlyTotal = plan.priceMonthlyGBP * 12
    const annualTotal = plan.priceAnnualGBP
    return Math.round(((monthlyTotal - annualTotal) / monthlyTotal) * 100)
  }

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href="/settings/billing"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Billing
      </Link>

      {/* Header */}
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-3xl font-display font-bold text-foreground">
          Choose the right plan for your team
        </h1>
        <p className="text-muted-foreground mt-3 text-lg">
          Start free, upgrade when you need more. All paid plans include a 14-day free trial.
        </p>
      </div>

      {/* Annual/Monthly Toggle */}
      <div className="flex items-center justify-center gap-3">
        <Label
          htmlFor="billing-toggle"
          className={cn(
            'text-sm font-medium cursor-pointer',
            !isAnnual ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          Monthly
        </Label>
        <Switch
          id="billing-toggle"
          checked={isAnnual}
          onCheckedChange={setIsAnnual}
        />
        <Label
          htmlFor="billing-toggle"
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

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {PLAN_ORDER.map((tier) => {
          const plan = SUBSCRIPTION_PLANS[tier]
          const Icon = PLAN_ICONS[tier]
          const isCurrent = tier === currentTier
          const isPopular = tier === 'professional'
          const savings = getAnnualSavings(tier)
          const price = isAnnual ? plan.priceAnnualGBP : plan.priceMonthlyGBP
          const isUpgrade = PLAN_ORDER.indexOf(tier) > PLAN_ORDER.indexOf(currentTier)
          const isDowngrade = PLAN_ORDER.indexOf(tier) < PLAN_ORDER.indexOf(currentTier)

          return (
            <Card
              key={tier}
              className={cn(
                'relative flex flex-col',
                isPopular && 'border-international-orange shadow-lg',
                isCurrent && 'border-primary'
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
                    isCurrent ? 'bg-primary/10' : 'bg-muted'
                  )}>
                    <Icon className={cn(
                      'h-5 w-5',
                      isCurrent ? 'text-primary' : 'text-muted-foreground'
                    )} />
                  </div>
                  {isCurrent && (
                    <Badge variant="secondary">Current Plan</Badge>
                  )}
                </div>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{plan.description}</p>

                {/* Price */}
                <div className="pt-3">
                  {tier === 'free' ? (
                    <p className="text-3xl font-bold">Free</p>
                  ) : tier === 'enterprise' ? (
                    <p className="text-3xl font-bold">Custom</p>
                  ) : (
                    <div>
                      <p className="text-3xl font-bold">
                        {isAnnual
                          ? formatAmount(Math.round(plan.priceAnnualGBP / 12), 'GBP')
                          : formatAmount(plan.priceMonthlyGBP, 'GBP')
                        }
                        <span className="text-sm font-normal text-muted-foreground">/mo</span>
                      </p>
                      {isAnnual && savings > 0 && (
                        <p className="text-sm text-status-success mt-1">
                          {formatAmount(plan.priceAnnualGBP, 'GBP')}/year (save {savings}%)
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col">
                {/* Features */}
                <ul className="space-y-3 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-status-success flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* Limits summary */}
                <div className="mt-4 pt-4 border-t space-y-2">
                  <LimitRow
                    label="Orders/month"
                    value={plan.limits.maxOrders}
                  />
                  <LimitRow
                    label="Team members"
                    value={plan.limits.maxTeamMembers}
                  />
                  <LimitRow
                    label="Active retainers"
                    value={plan.limits.maxRetainers}
                  />
                </div>

                {/* CTA */}
                <div className="mt-6">
                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : tier === 'enterprise' ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => handleSelectPlan(tier)}
                    >
                      Contact Sales
                    </Button>
                  ) : isDowngrade ? (
                    <Button
                      variant="ghost"
                      className="w-full text-muted-foreground"
                      onClick={() => handleSelectPlan(tier)}
                      disabled={loadingTier !== null}
                    >
                      Downgrade
                    </Button>
                  ) : (
                    <Button
                      className={cn(
                        'w-full',
                        isPopular && 'bg-international-orange hover:bg-international-orange-hover'
                      )}
                      onClick={() => handleSelectPlan(tier)}
                      disabled={loadingTier !== null}
                    >
                      {loadingTier === tier ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Redirecting...
                        </>
                      ) : (
                        isUpgrade ? 'Upgrade' : 'Get Started'
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* FAQ note */}
      <div className="text-center text-sm text-muted-foreground max-w-lg mx-auto">
        <p>
          All paid plans include a 14-day free trial. Cancel anytime.
          Need help choosing? Contact us at{' '}
          <a href="mailto:support@forgeos.ai" className="text-primary hover:underline">
            support@forgeos.ai
          </a>
        </p>
      </div>
    </div>
  )
}

/**
 * Displays a plan limit row (e.g., "Orders/month: 25" or "Unlimited")
 */
function LimitRow({ label, value }: { label: string; value?: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">
        {value === undefined ? (
          <span className="flex items-center gap-1">
            <Infinity className="h-3.5 w-3.5" />
            Unlimited
          </span>
        ) : value === 0 ? (
          <span className="text-muted-foreground">--</span>
        ) : (
          value
        )}
      </span>
    </div>
  )
}
