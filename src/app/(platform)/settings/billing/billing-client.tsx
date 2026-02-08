'use client'

/**
 * Billing Page Client Component
 *
 * @description Assembles all existing billing components into a cohesive
 * billing management page. Shows subscription status, payment methods,
 * account balance, and payout preferences (for providers).
 *
 * @param {string} userId - The authenticated user's ID
 * @param {boolean} isProvider - Whether the user is a marketplace provider
 */

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Crown,
  Loader2,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Calendar,
  ArrowUpRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
  SavedPaymentMethods,
  AccountBalanceCard,
  FailedPaymentsAlert,
  PayoutPreferencesForm,
  CurrencySelector,
  UsageTracker,
} from '@/components/billing'
import { SUBSCRIPTION_PLANS } from '@/lib/billing/plans'
import type { UserSubscription, SubscriptionTier } from '@/lib/billing/plans'
import {
  getMySubscription,
  openBillingPortal,
  cancelMySubscription,
  resumeMySubscription,
} from '@/actions/subscriptions'
import { formatAmount } from '@/types/billing'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface BillingPageClientProps {
  userId: string
  isProvider: boolean
}

export function BillingPageClient({ isProvider }: BillingPageClientProps) {
  const searchParams = useSearchParams()
  const [subscription, setSubscription] = useState<UserSubscription | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isActionLoading, setIsActionLoading] = useState(false)

  // Show success/cancel toast from Stripe redirect
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast.success('Subscription activated', {
        description: 'Your subscription is now active. Welcome aboard!',
      })
    }
    if (searchParams.get('canceled') === 'true') {
      toast.info('Checkout cancelled', {
        description: 'No changes were made to your subscription.',
      })
    }
  }, [searchParams])

  useEffect(() => {
    loadSubscription()
  }, [])

  const loadSubscription = async (): Promise<void> => {
    setIsLoading(true)
    const { subscription: sub } = await getMySubscription()
    setSubscription(sub)
    setIsLoading(false)
  }

  const handleManageBilling = async (): Promise<void> => {
    setIsActionLoading(true)
    const { url, error } = await openBillingPortal()
    if (error || !url) {
      toast.error('Error', { description: error || 'Failed to open billing portal' })
      setIsActionLoading(false)
      return
    }
    window.location.href = url
  }

  const handleCancelSubscription = async (): Promise<void> => {
    setIsActionLoading(true)
    const { success, error } = await cancelMySubscription()
    if (success) {
      toast.success('Subscription cancelled', {
        description: 'Your plan will remain active until the end of the billing period.',
      })
      await loadSubscription()
    } else {
      toast.error('Error', { description: error || 'Failed to cancel subscription' })
    }
    setIsActionLoading(false)
  }

  const handleResumeSubscription = async (): Promise<void> => {
    setIsActionLoading(true)
    const { success, error } = await resumeMySubscription()
    if (success) {
      toast.success('Subscription resumed', {
        description: 'Your subscription will continue as normal.',
      })
      await loadSubscription()
    } else {
      toast.error('Error', { description: error || 'Failed to resume subscription' })
    }
    setIsActionLoading(false)
  }

  const currentTier: SubscriptionTier = subscription?.tier || 'free'
  const currentPlan = SUBSCRIPTION_PLANS[currentTier]

  return (
    <div className="space-y-8">
      {/* Failed Payments Alert (shows at top if any) */}
      <FailedPaymentsAlert />

      {/* Subscription Status */}
      <SubscriptionStatusCard
        subscription={subscription}
        currentPlan={currentPlan}
        currentTier={currentTier}
        isLoading={isLoading}
        isActionLoading={isActionLoading}
        onManageBilling={handleManageBilling}
        onCancel={handleCancelSubscription}
        onResume={handleResumeSubscription}
      />

      {/* Usage Tracking */}
      <UsageTracker />

      {/* Payment Methods and Balance side-by-side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SavedPaymentMethods />
        <AccountBalanceCard />
      </div>

      {/* Currency Preference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Display Currency</CardTitle>
          <CardDescription>
            Choose which currency to display prices in across the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CurrencySelector />
        </CardContent>
      </Card>

      {/* Payout Preferences (only for providers) */}
      {isProvider && (
        <>
          <Separator />
          <div>
            <h2 className="text-xl font-semibold mb-1">Provider Earnings</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Configure how and when you receive your marketplace earnings
            </p>
            <PayoutPreferencesForm />
          </div>
        </>
      )}
    </div>
  )
}

// ==========================================
// SUBSCRIPTION STATUS CARD
// ==========================================

interface SubscriptionStatusCardProps {
  subscription: UserSubscription | null
  currentPlan: (typeof SUBSCRIPTION_PLANS)[SubscriptionTier]
  currentTier: SubscriptionTier
  isLoading: boolean
  isActionLoading: boolean
  onManageBilling: () => void
  onCancel: () => void
  onResume: () => void
}

function SubscriptionStatusCard({
  subscription,
  currentPlan,
  currentTier,
  isLoading,
  isActionLoading,
  onManageBilling,
  onCancel,
  onResume,
}: SubscriptionStatusCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const isFreePlan = currentTier === 'free'
  const isCancelling = subscription?.cancelAtPeriodEnd === true
  const isTrialing = subscription?.status === 'trialing'
  const isPastDue = subscription?.status === 'past_due'

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-international-orange" />
            Your Plan
          </CardTitle>
          <CardDescription>
            Manage your subscription and billing
          </CardDescription>
        </div>
        {!isFreePlan && (
          <Button
            variant="outline"
            size="sm"
            onClick={onManageBilling}
            disabled={isActionLoading}
          >
            {isActionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ExternalLink className="h-4 w-4 mr-2" />
            )}
            Manage in Stripe
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Past due warning */}
        {isPastDue && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Payment Past Due</AlertTitle>
            <AlertDescription>
              Your last payment failed. Please update your payment method to keep your subscription active.
            </AlertDescription>
          </Alert>
        )}

        {/* Cancellation notice */}
        {isCancelling && subscription && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Subscription Ending</AlertTitle>
            <AlertDescription>
              Your plan will be downgraded to Free on{' '}
              {format(new Date(subscription.currentPeriodEnd), 'MMMM d, yyyy')}.
              <Button
                variant="link"
                className="px-1 h-auto text-primary"
                onClick={onResume}
                disabled={isActionLoading}
              >
                Resume subscription
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Plan details */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-2xl font-bold">{currentPlan.name}</h3>
              <SubscriptionStatusBadge
                status={subscription?.status}
                isFreePlan={isFreePlan}
                isCancelling={isCancelling}
              />
            </div>
            <p className="text-muted-foreground mt-1">{currentPlan.description}</p>
          </div>

          <div className="text-right">
            {isFreePlan ? (
              <p className="text-2xl font-bold">Free</p>
            ) : (
              <p className="text-2xl font-bold">
                {formatAmount(currentPlan.priceMonthlyGBP, 'GBP')}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
            )}
          </div>
        </div>

        {/* Features list */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {currentPlan.features.map((feature) => (
            <div key={feature} className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-status-success flex-shrink-0" />
              <span>{feature}</span>
            </div>
          ))}
        </div>

        {/* Billing period */}
        {subscription && !isFreePlan && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t">
            <Calendar className="h-4 w-4" />
            <span>
              {isTrialing ? 'Trial ends' : 'Current period ends'}{' '}
              {format(new Date(isTrialing && subscription.trialEnd ? subscription.trialEnd : subscription.currentPeriodEnd), 'MMMM d, yyyy')}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          {isFreePlan && (
            <Button asChild>
              <a href="/settings/billing/plans">
                <ArrowUpRight className="h-4 w-4 mr-2" />
                Upgrade Plan
              </a>
            </Button>
          )}
          {!isFreePlan && !isCancelling && (
            <>
              <Button variant="outline" asChild>
                <a href="/settings/billing/plans">
                  Change Plan
                </a>
              </Button>
              <Button
                variant="ghost"
                className="text-muted-foreground"
                onClick={onCancel}
                disabled={isActionLoading}
              >
                Cancel Subscription
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ==========================================
// HELPERS
// ==========================================

function SubscriptionStatusBadge({
  status,
  isFreePlan,
  isCancelling,
}: {
  status?: string
  isFreePlan: boolean
  isCancelling: boolean
}) {
  if (isFreePlan) {
    return <Badge variant="secondary">Free</Badge>
  }

  if (isCancelling) {
    return <Badge variant="warning">Cancelling</Badge>
  }

  switch (status) {
    case 'active':
      return <Badge variant="success">Active</Badge>
    case 'trialing':
      return <Badge variant="info">Trial</Badge>
    case 'past_due':
      return <Badge variant="destructive">Past Due</Badge>
    case 'canceled':
      return <Badge variant="destructive">Cancelled</Badge>
    case 'unpaid':
      return <Badge variant="destructive">Unpaid</Badge>
    default:
      return <Badge variant="secondary">{status || 'Free'}</Badge>
  }
}
