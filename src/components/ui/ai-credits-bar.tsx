'use client'

/**
 * @file ai-credits-bar.tsx
 *
 * @description Compact account pill for the sidebar footer. Shows tier name
 * and a mini AI tasks progress bar. Click opens a popover with full detail:
 * usage stats, upgrade link, and referral invite.
 */

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Copy, Check, Gift, Users, ChevronRight } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getMyReferralInfo, getAIUsageForCreditsBar, type ReferralInfo } from '@/actions/referrals'
import { SUBSCRIPTION_PLANS, type SubscriptionTier } from '@/lib/billing/plans'

/**
 * AICreditsBarLoader — Self-loading wrapper that fetches AI usage data.
 */
export function AICreditsBarLoader() {
  const [data, setData] = useState<{ currentUsage: number; limit: number; bonusCredits: number; tier: SubscriptionTier } | null>(null)
  const [referralData, setReferralData] = useState<ReferralInfo | null>(null)

  useEffect(() => {
    const results = Promise.allSettled([
      getAIUsageForCreditsBar(),
      getMyReferralInfo(),
    ])
    results.then(([usageResult, referralResult]) => {
      if (usageResult.status === 'fulfilled' && 'currentUsage' in usageResult.value) {
        setData(usageResult.value)
      }
      if (referralResult.status === 'fulfilled' && 'referralLink' in referralResult.value) {
        setReferralData(referralResult.value)
      }
    })
  }, [])

  if (!data) return null

  return (
    <AICreditsBar
      currentUsage={data.currentUsage}
      limit={data.limit}
      bonusCredits={data.bonusCredits}
      tier={data.tier}
      referralLink={referralData?.referralLink}
      referralCount={referralData?.referralCount}
    />
  )
}

interface AICreditsBarProps {
  currentUsage: number
  limit: number
  bonusCredits: number
  tier?: SubscriptionTier
  referralLink?: string
  referralCount?: number
}

/**
 * AICreditsBar — Compact account pill with popover for full detail.
 *
 * @description Shows tier name + mini progress bar in the sidebar footer.
 * Click opens a popover with: usage stats, upgrade link, and referral invite.
 * Replaces the old multi-section inline layout.
 */
export function AICreditsBar({ currentUsage, limit, bonusCredits, tier = 'free', referralLink, referralCount }: AICreditsBarProps) {
  const percentUsed = limit > 0 ? Math.min((currentUsage / limit) * 100, 100) : 0
  const remaining = Math.max(0, limit - currentUsage)
  const isNearLimit = percentUsed >= 80
  const isAtLimit = percentUsed >= 95
  const isExhausted = currentUsage >= limit && bonusCredits === 0

  const barColor = isAtLimit
    ? 'bg-destructive'
    : isNearLimit
      ? 'bg-warning'
      : 'bg-success'

  const tierName = SUBSCRIPTION_PLANS[tier].name
  const isFree = tier === 'free'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`w-full text-left px-2 py-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer ${isNearLimit ? 'border border-warning/40 bg-warning/5' : ''}`}
          aria-label={`${tierName}: ${currentUsage} of ${limit} AI tasks used${bonusCredits > 0 ? `, ${bonusCredits} bonus` : ''}`}
        >
          {/* Row 1: Tier + usage count */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-foreground">
              {isFree ? `${tierName} — Free` : tierName}
            </span>
            <span className="text-[10px] font-semibold text-foreground flex items-center gap-1">
              {currentUsage}/{limit}
              {bonusCredits > 0 && (
                <span className="text-international-orange">(+{bonusCredits})</span>
              )}
              <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
            </span>
          </div>
          {/* Row 2: Mini progress bar */}
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${percentUsed}%` }}
            />
          </div>
          {isExhausted && (
            <p className="text-[9px] text-destructive mt-1 font-medium">
              Out of AI tasks — click for options
            </p>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-72 p-4">
        <AccountPopoverContent
          currentUsage={currentUsage}
          limit={limit}
          remaining={remaining}
          bonusCredits={bonusCredits}
          percentUsed={percentUsed}
          barColor={barColor}
          isExhausted={isExhausted}
          isFree={isFree}
          tierName={tierName}
          referralLink={referralLink}
          referralCount={referralCount}
        />
      </PopoverContent>
    </Popover>
  )
}

function AccountPopoverContent({
  currentUsage,
  limit,
  remaining,
  bonusCredits,
  percentUsed,
  barColor,
  isExhausted,
  isFree,
  tierName,
  referralLink,
  referralCount,
}: {
  currentUsage: number
  limit: number
  remaining: number
  bonusCredits: number
  percentUsed: number
  barColor: string
  isExhausted: boolean
  isFree: boolean
  tierName: string
  referralLink?: string
  referralCount?: number
}) {
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  const handleCopy = async () => {
    if (!referralLink) return
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable
    }
  }

  return (
    <div className="space-y-3">
      {/* Tier + Upgrade */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{tierName}</h4>
        {isFree && (
          <Link
            href="/settings/billing"
            className="text-xs font-medium text-international-orange hover:underline"
          >
            Upgrade
          </Link>
        )}
      </div>

      {/* Usage detail */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">AI Tasks</span>
          <span className="text-xs font-semibold text-foreground">
            {currentUsage}/{limit}
            {bonusCredits > 0 && (
              <span className="text-international-orange ml-1">(+{bonusCredits} bonus)</span>
            )}
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${percentUsed}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {remaining} remaining this month
        </p>
      </div>

      {/* Referral invite */}
      {referralLink && (
        <div className="pt-2 border-t border-border space-y-2">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-international-orange" />
            <h4 className="text-sm font-semibold text-foreground">
              {isExhausted ? 'Get more AI tasks' : 'Invite a friend'}
            </h4>
          </div>

          <p className="text-xs text-muted-foreground">
            {isExhausted
              ? 'You\'ve used all your AI tasks this month. Invite a friend and you both get 10 more.'
              : 'Share your link — you both get +10 AI tasks.'}
          </p>

          <div className="flex gap-2">
            <Input
              readOnly
              value={referralLink}
              className="text-xs h-8 bg-muted/50"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0 h-8">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>

          {referralCount != null && referralCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>{referralCount} friend{referralCount !== 1 ? 's' : ''} referred</span>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
