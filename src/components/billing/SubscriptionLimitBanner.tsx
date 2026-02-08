'use client'

/**
 * Subscription Limit Banner
 *
 * @description Displays an upgrade prompt when a user hits a plan limit.
 * Can be used inline in any feature that has subscription-gated limits.
 *
 * @example
 * // In task creation when order limit is hit
 * <SubscriptionLimitBanner
 *   feature="maxOrders"
 *   currentUsage={25}
 *   message="You've reached your monthly order limit"
 * />
 *
 * @param {string} feature - The limit feature key from subscription plans
 * @param {number} currentUsage - Current usage count
 * @param {string} message - Custom message to display
 */

import { ArrowUpRight } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import type { SubscriptionTier } from '@/lib/billing/plans'

interface SubscriptionLimitBannerProps {
  feature: string
  currentUsage?: number
  limit?: number
  currentTier?: SubscriptionTier
  message?: string
  className?: string
}

const UPGRADE_MESSAGES: Record<string, string> = {
  maxOrders: 'Upgrade your plan to place more orders each month.',
  maxTeamMembers: 'Upgrade your plan to add more team members.',
  maxRetainers: 'Upgrade your plan to create more retainer agreements.',
  apiAccess: 'API access is available on Professional and Enterprise plans.',
  prioritySupport: 'Priority support is available on Professional and Enterprise plans.',
}

export function SubscriptionLimitBanner({
  feature,
  currentUsage,
  limit,
  currentTier = 'free',
  message,
  className,
}: SubscriptionLimitBannerProps) {
  const defaultMessage = UPGRADE_MESSAGES[feature] || 'Upgrade your plan to unlock this feature.'
  const displayMessage = message || defaultMessage

  return (
    <Alert className={className}>
      <ArrowUpRight className="h-4 w-4" />
      <AlertTitle>Plan Limit Reached</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="mb-3">
          {displayMessage}
          {currentUsage !== undefined && limit !== undefined && (
            <span className="text-muted-foreground">
              {' '}({currentUsage}/{limit} used)
            </span>
          )}
        </p>
        <Button size="sm" asChild>
          <Link href="/settings/billing/plans">
            <ArrowUpRight className="h-4 w-4 mr-2" />
            View Plans
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}
