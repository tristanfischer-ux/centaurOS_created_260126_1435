'use client'

/**
 * Usage Tracker Component
 *
 * @description Displays current usage against subscription plan limits.
 * Shows progress bars for orders/month, team members, and active retainers.
 * Prompts upgrade when usage approaches or exceeds limits.
 *
 * @example
 * <UsageTracker />
 */

import { useState, useEffect } from 'react'
import {
  ShoppingCart,
  Users,
  FileText,
  Loader2,
  ArrowUpRight,
  Infinity,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { getUsageMetrics } from '@/actions/usage'
import { getMySubscription } from '@/actions/subscriptions'
import { SUBSCRIPTION_PLANS } from '@/lib/billing/plans'
import type { SubscriptionTier } from '@/lib/billing/plans'
import type { UsageData } from '@/actions/usage'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface UsageTrackerProps {
  className?: string
}

export function UsageTracker({ className }: UsageTrackerProps) {
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>('free')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async (): Promise<void> => {
    setIsLoading(true)
    const [usageResult, subResult] = await Promise.all([
      getUsageMetrics(),
      getMySubscription(),
    ])

    if (usageResult.usage) {
      setUsage(usageResult.usage)
    }
    setCurrentTier(subResult.subscription?.tier || 'free')
    setIsLoading(false)
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (!usage) {
    return null
  }

  const plan = SUBSCRIPTION_PLANS[currentTier]
  const limits = plan.limits

  const usageItems: UsageItemData[] = [
    {
      label: 'Orders this month',
      icon: ShoppingCart,
      current: usage.ordersThisMonth,
      limit: limits.maxOrders,
    },
    {
      label: 'Team members',
      icon: Users,
      current: usage.teamMembers,
      limit: limits.maxTeamMembers,
    },
    {
      label: 'Active retainers',
      icon: FileText,
      current: usage.activeRetainers,
      limit: limits.maxRetainers,
    },
  ]

  const hasAnyLimitApproaching = usageItems.some(
    (item) => item.limit !== undefined && item.current >= item.limit * 0.8
  )

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-lg font-semibold">Usage</CardTitle>
          <CardDescription>
            Your current usage on the {plan.name} plan
          </CardDescription>
        </div>
        {hasAnyLimitApproaching && (
          <Button size="sm" variant="outline" asChild>
            <Link href="/settings/billing/plans">
              <ArrowUpRight className="h-4 w-4 mr-2" />
              Upgrade
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {usageItems.map((item) => (
          <UsageItem key={item.label} {...item} />
        ))}
      </CardContent>
    </Card>
  )
}

// ==========================================
// USAGE ITEM
// ==========================================

interface UsageItemData {
  label: string
  icon: React.ElementType
  current: number
  limit?: number
}

function UsageItem({ label, icon: Icon, current, limit }: UsageItemData) {
  const isUnlimited = limit === undefined
  const percentage = isUnlimited ? 0 : limit === 0 ? 0 : Math.min((current / limit) * 100, 100)
  const isApproaching = !isUnlimited && limit > 0 && current >= limit * 0.8
  const isAtLimit = !isUnlimited && limit !== undefined && current >= limit

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'font-medium',
            isAtLimit && 'text-destructive',
            isApproaching && !isAtLimit && 'text-status-warning'
          )}>
            {current}
          </span>
          <span className="text-muted-foreground">/</span>
          {isUnlimited ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Infinity className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span className="text-muted-foreground">
              {limit === 0 ? 'N/A' : limit}
            </span>
          )}
          {isAtLimit && (
            <Badge variant="destructive" className="text-xs ml-1">Limit</Badge>
          )}
          {isApproaching && !isAtLimit && (
            <Badge variant="warning" className="text-xs ml-1">Near Limit</Badge>
          )}
        </div>
      </div>

      {!isUnlimited && limit !== undefined && limit > 0 && (
        <Progress
          value={percentage}
          className={cn(
            'h-2',
            isAtLimit && '[&>div]:bg-destructive',
            isApproaching && !isAtLimit && '[&>div]:bg-status-warning'
          )}
        />
      )}

      {isUnlimited && (
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full w-full bg-status-success/20 rounded-full" />
        </div>
      )}
    </div>
  )
}
