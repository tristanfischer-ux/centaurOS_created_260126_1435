'use client'

/**
 * @file ai-credits-bar.tsx
 *
 * @description Compact AI usage bar for the sidebar. Shows current usage
 * against subscription limit, plus bonus referral credits. Includes
 * a popover with referral invite CTA when clicked.
 */

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Copy, Check, Gift, Users } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getMyReferralInfo, getAIUsageForCreditsBar, type ReferralInfo } from '@/actions/referrals'
import { FoundingMemberBadge } from '@/components/ui/founding-member-badge'
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
      isFoundingMember={referralData?.isFoundingMember}
      foundingMemberNumber={referralData?.foundingMemberNumber}
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
  isFoundingMember?: boolean
  foundingMemberNumber?: number | null
}

/**
 * AICreditsBar — Compact usage indicator with referral CTA popover.
 *
 * @description Shows "AI Tasks: ████░░ 42/50 (+8 bonus)" in the sidebar.
 * Green >50%, amber 80%, red 95%. Click opens referral popover.
 */
export function AICreditsBar({ currentUsage, limit, bonusCredits, tier = 'free', referralLink, referralCount, isFoundingMember, foundingMemberNumber }: AICreditsBarProps) {
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const percentUsed = limit > 0 ? Math.min((currentUsage / limit) * 100, 100) : 0
  const remaining = Math.max(0, limit - currentUsage)
  const isNearLimit = percentUsed >= 80
  const isAtLimit = percentUsed >= 95
  const isExhausted = currentUsage >= limit && bonusCredits === 0
  const hasReferralLink = !!referralLink

  // Progress bar color
  const barColor = isAtLimit
    ? 'bg-destructive'
    : isNearLimit
      ? 'bg-warning'
      : 'bg-success'

  // Cleanup copy timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  const handleCopyLink = async () => {
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

  const tierName = SUBSCRIPTION_PLANS[tier].name
  const isFree = tier === 'free'

  return (
    <div className={`w-full text-left px-2 py-2 rounded-md ${isNearLimit ? 'border border-warning/40 bg-warning/5' : ''}`}>
      {/* Tier indicator */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold text-foreground">
          {isFree ? `${tierName} — Free` : tierName}
        </span>
        {isFree && (
          <Link
            href="/settings/billing"
            className="text-[10px] font-medium text-international-orange hover:underline"
          >
            Upgrade
          </Link>
        )}
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="w-full text-left hover:bg-muted/50 rounded-md transition-colors cursor-pointer"
            aria-label={`AI tasks: ${currentUsage} of ${limit} used${bonusCredits > 0 ? `, ${bonusCredits} bonus` : ''}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                AI Tasks
              </span>
              <span className="text-[10px] font-semibold text-foreground">
                {currentUsage}/{limit}
                {bonusCredits > 0 && (
                  <span className="text-international-orange ml-1">(+{bonusCredits} bonus)</span>
                )}
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${percentUsed}%` }}
              />
            </div>
            {isExhausted && (
              <p className="text-[9px] text-destructive mt-1 font-medium">
                Out of AI tasks — invite a friend to get 10 more
              </p>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" side="right" className="w-72 p-4">
          <ReferralPopoverContent
            remaining={remaining}
            bonusCredits={bonusCredits}
            isExhausted={isExhausted}
            referralLink={referralLink}
            referralCount={referralCount}
            isFoundingMember={isFoundingMember}
            foundingMemberNumber={foundingMemberNumber}
          />
        </PopoverContent>
      </Popover>

      {/* Always-visible referral CTA — outside PopoverTrigger to avoid nested buttons */}
      {hasReferralLink && (
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-1.5">
            <Gift className="h-3 w-3 text-international-orange" />
            <span className="text-[10px] font-semibold text-foreground">Give 10, Get 10</span>
          </div>
          <button
            type="button"
            onClick={handleCopyLink}
            className="p-0.5 rounded hover:bg-muted transition-colors"
            aria-label="Copy referral link"
          >
            {copied ? (
              <Check className="h-3 w-3 text-success" />
            ) : (
              <Copy className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        </div>
      )}

      {/* Referral count */}
      {referralCount != null && referralCount > 0 && (
        <p className="text-[9px] text-muted-foreground mt-0.5">
          {referralCount} referred
        </p>
      )}

      {/* Founding member badge */}
      {isFoundingMember && foundingMemberNumber != null && (
        <div className="mt-1">
          <FoundingMemberBadge compact memberNumber={foundingMemberNumber} />
        </div>
      )}
    </div>
  )
}

function ReferralPopoverContent({
  remaining,
  bonusCredits,
  isExhausted,
  referralLink,
  referralCount,
  isFoundingMember,
  foundingMemberNumber,
}: {
  remaining: number
  bonusCredits: number
  isExhausted: boolean
  referralLink?: string
  referralCount?: number
  isFoundingMember?: boolean
  foundingMemberNumber?: number | null
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
      // Clipboard API unavailable (e.g. non-HTTPS context)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Gift className="h-4 w-4 text-international-orange" />
        <h4 className="text-sm font-semibold text-foreground">
          {isExhausted ? 'Get more AI tasks' : 'Invite a friend'}
        </h4>
      </div>

      <p className="text-xs text-muted-foreground">
        {isExhausted
          ? 'You\'ve used all your AI tasks this month. Invite a friend and you both get 10 more.'
          : `You have ${remaining} tasks remaining${bonusCredits > 0 ? ` + ${bonusCredits} bonus` : ''}. Invite a friend — you both get +10 AI tasks.`}
      </p>

      {referralLink && (
        <>
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

          {isFoundingMember && foundingMemberNumber != null && (
            <div className="mt-1">
              <FoundingMemberBadge compact memberNumber={foundingMemberNumber} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
