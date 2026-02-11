/**
 * @file Billing Content Component
 *
 * @description Client component for billing page interactions.
 * Handles checkout creation, billing portal redirect, and
 * renders the current tier, usage stats, and upgrade options.
 *
 * @component
 */

'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  CreditCard,
  Zap,
  TrendingUp,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  AlertCircle,
  Loader2,
  FlaskConical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SUBSCRIPTION_PLANS } from '@/lib/billing/plans'
import type { SubscriptionTier, SubscriptionPlan } from '@/lib/billing/plans'
import type { MonthlyUsage } from '@/lib/ai/usage-tracking'

interface BillingContentProps {
  userId: string
  currentTier: SubscriptionTier
  currentPlan: SubscriptionPlan
  subscription: {
    status: string
    current_period_end: string
    cancel_at_period_end: boolean
  } | null
  aiUsage: MonthlyUsage
  hasStripeCustomer: boolean
  /** When true, upgrade buttons use test-activate instead of Stripe checkout */
  isTestMode?: boolean
}

/**
 * BillingContent - Client-side billing settings UI.
 *
 * @description Renders current plan card, AI usage progress bar,
 * tier comparison cards, and Stripe billing portal link.
 */
export function BillingContent({
  userId,
  currentTier,
  currentPlan,
  subscription,
  aiUsage,
  hasStripeCustomer,
  isTestMode = false,
}: BillingContentProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const searchParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : null
  const isSuccess = searchParams?.get('success') === 'true'
  const isCanceled = searchParams?.get('canceled') === 'true'

  const aiLimit = currentPlan.limits.maxAiTasksPerMonth
  const aiUsagePercent = Math.min(100, Math.round((aiUsage.totalAiTasks / aiLimit) * 100))
  const isNearLimit = aiUsagePercent >= 80

  /**
   * Upgrades the subscription. Uses test-activate in test mode,
   * or Stripe checkout when real prices are configured.
   */
  async function handleUpgrade(tier: SubscriptionTier): Promise<void> {
    setIsLoading(tier)
    setError(null)

    try {
      if (isTestMode) {
        // Test mode: directly activate subscription without Stripe
        const response = await fetch('/api/billing/test-activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier }),
        })

        const data = await response.json()

        if (data.success) {
          window.location.href = '/settings/billing?success=true'
        } else {
          setError(data.error || 'Failed to activate test subscription')
        }
      } else {
        // Production: redirect to Stripe Checkout
        const response = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier, billingPeriod: 'monthly' }),
        })

        const data = await response.json()

        if (data.url) {
          window.location.href = data.url
        } else {
          setError(data.error || 'Failed to create checkout session')
        }
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(null)
    }
  }

  /**
   * Opens the Stripe billing portal for managing subscription/payment methods.
   */
  async function handleManageBilling(): Promise<void> {
    setIsLoading('manage')
    setError(null)

    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
      })

      const data = await response.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error || 'Failed to open billing portal')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(null)
    }
  }

  const tiers = Object.values(SUBSCRIPTION_PLANS).filter(p => p.tier !== 'enterprise')

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Success / Canceled alerts */}
      {isSuccess && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Subscription activated successfully. Welcome to {currentPlan.name}!
          </AlertDescription>
        </Alert>
      )}
      {isCanceled && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Checkout was canceled. No changes were made to your subscription.
          </AlertDescription>
        </Alert>
      )}

      {/* Test mode banner */}
      {isTestMode && (
        <Alert>
          <FlaskConical className="h-4 w-4" />
          <AlertDescription>
            <span className="font-medium">Test Mode</span> — Stripe is not configured.
            Upgrades are simulated locally. Connect Stripe to enable real payments.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-international-orange/10 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-international-orange" />
              </div>
              <div>
                <CardTitle className="text-lg">Current Plan</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {subscription?.cancel_at_period_end
                    ? 'Cancels at end of period'
                    : currentTier === 'free'
                      ? 'Free tier — upgrade for more AI tasks and features'
                      : `Renews ${subscription?.current_period_end
                          ? new Date(subscription.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                          : 'monthly'
                        }`
                  }
                </p>
              </div>
            </div>
            <Badge
              variant={currentTier === 'free' ? 'secondary' : 'default'}
              className={cn(
                currentTier !== 'free' && 'bg-international-orange text-white'
              )}
            >
              {currentPlan.name}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {currentPlan.priceMonthlyGBP === 0
                ? 'Free'
                : `£${(currentPlan.priceMonthlyGBP / 100).toFixed(0)}/month`
              }
            </span>
            {hasStripeCustomer && currentTier !== 'free' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleManageBilling}
                disabled={isLoading === 'manage'}
              >
                {isLoading === 'manage' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ExternalLink className="h-4 w-4 mr-2" />
                )}
                Manage Billing
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI Usage Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-electric-blue/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-electric-blue" />
            </div>
            <div>
              <CardTitle className="text-lg">AI Usage This Month</CardTitle>
              <p className="text-sm text-muted-foreground">
                {aiUsage.totalAiTasks} of {aiLimit} AI tasks used
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {aiUsage.totalAiTasks.toLocaleString()} tasks
              </span>
              <span className="text-muted-foreground">
                {aiLimit.toLocaleString()} limit
              </span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  isNearLimit ? 'bg-status-warning' : 'bg-electric-blue'
                )}
                style={{ width: `${aiUsagePercent}%` }}
              />
            </div>
            {isNearLimit && (
              <p className="text-sm text-status-warning flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                {aiUsagePercent >= 100
                  ? 'Limit reached — upgrade for more AI tasks'
                  : 'Approaching limit — consider upgrading'
                }
              </p>
            )}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-4 pt-2">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-semibold text-foreground">
                {aiUsage.totalAiTasks}
              </p>
              <p className="text-xs text-muted-foreground mt-1">AI Tasks</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-semibold text-foreground">
                {(aiUsage.totalTokens / 1000).toFixed(0)}k
              </p>
              <p className="text-xs text-muted-foreground mt-1">Tokens Used</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-semibold text-foreground">
                {aiLimit - aiUsage.totalAiTasks}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Remaining</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tier Comparison */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.map((plan) => {
            const isCurrent = plan.tier === currentTier
            const isUpgrade = getPlanOrder(plan.tier) > getPlanOrder(currentTier)

            return (
              <Card
                key={plan.tier}
                className={cn(
                  'relative',
                  isCurrent && 'border-international-orange border-2'
                )}
              >
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-international-orange text-white">
                      Current Plan
                    </Badge>
                  </div>
                )}
                <CardHeader className="pt-6">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                  <div className="pt-2">
                    <span className="text-3xl font-bold text-foreground">
                      {plan.priceMonthlyGBP === 0
                        ? 'Free'
                        : `£${(plan.priceMonthlyGBP / 100).toFixed(0)}`
                      }
                    </span>
                    {plan.priceMonthlyGBP > 0 && (
                      <span className="text-muted-foreground text-sm">/month</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-status-success mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {isUpgrade && (
                    <Button
                      className="w-full bg-international-orange hover:bg-international-orange-hover"
                      onClick={() => handleUpgrade(plan.tier)}
                      disabled={isLoading === plan.tier}
                    >
                      {isLoading === plan.tier ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <TrendingUp className="h-4 w-4 mr-2" />
                          Upgrade to {plan.name}
                        </>
                      )}
                    </Button>
                  )}

                  {isCurrent && (
                    <Button variant="secondary" className="w-full" disabled>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Current Plan
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Enterprise CTA */}
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-international-orange/10 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-international-orange" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Enterprise</p>
                  <p className="text-sm text-muted-foreground">
                    Unlimited AI tasks, SSO, dedicated support, custom integrations
                  </p>
                </div>
              </div>
              <Button variant="outline">
                Contact Sales
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/**
 * Get numeric order of a tier for comparison.
 */
function getPlanOrder(tier: SubscriptionTier): number {
  const order: Record<SubscriptionTier, number> = {
    free: 0,
    starter: 1,
    professional: 2,
    enterprise: 3,
  }
  return order[tier]
}
