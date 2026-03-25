'use client'

/**
 * @file referral-nudge-banner.tsx
 *
 * @description Always-visible referral card on /today. Shows "Give AI Credits,
 * Get AI Credits" in normal state; switches to urgent orange styling when
 * usage >= 80%. Dismissable per session (reappears on refresh).
 */

import { useState, useEffect, useRef } from 'react'
import { X, Copy, Check, Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getMyReferralInfo, getAIUsageForCreditsBar, type ReferralInfo } from '@/actions/referrals'
import { FoundingMemberBadge } from '@/components/ui/founding-member-badge'

/**
 * ReferralNudgeBanner — Always-visible referral card for /today.
 *
 * @description Normal state: soft muted card. Urgent state (>= 80%): orange.
 * Dismissable for the session — reappears on refresh (intentional).
 */
export function ReferralNudgeBanner() {
  const [dismissed, setDismissed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [isUrgent, setIsUrgent] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    const results = Promise.allSettled([
      getAIUsageForCreditsBar(),
      getMyReferralInfo(),
    ])
    results.then(([usageResult, referralResult]) => {
      // Only show banner if we successfully got usage data
      if (usageResult.status !== 'fulfilled' || !('currentUsage' in usageResult.value)) return

      const { currentUsage, limit } = usageResult.value
      const percentUsed = limit > 0 ? (currentUsage / limit) * 100 : 0
      setRemaining(Math.max(0, limit - currentUsage))
      setIsUrgent(percentUsed >= 80)

      if (referralResult.status === 'fulfilled' && 'referralLink' in referralResult.value) {
        setReferralInfo(referralResult.value)
      }
      setLoaded(true)
    })
  }, [])

  // Cleanup copy timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  const handleCopy = async () => {
    if (!referralInfo?.referralLink) return
    try {
      await navigator.clipboard.writeText(referralInfo.referralLink)
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable
    }
  }

  if (dismissed || !loaded) return null

  const hasReferralLink = !!referralInfo?.referralLink

  return (
    <div
      className={`relative p-4 rounded-lg flex items-center gap-4 ${
        isUrgent
          ? 'bg-international-orange/5 border border-international-orange/20'
          : 'bg-muted/30 border border-border'
      }`}
    >
      <Gift className="h-5 w-5 shrink-0 text-international-orange" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">
            {isUrgent
              ? `${remaining} AI task${remaining !== 1 ? 's' : ''} left`
              : 'Give AI Credits, Get AI Credits'}
          </p>
          {referralInfo?.isFoundingMember && referralInfo.foundingMemberNumber != null && (
            <FoundingMemberBadge compact memberNumber={referralInfo.foundingMemberNumber} />
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isUrgent ? (
            <>Invite a friend — you both get <span className="font-semibold text-international-orange">10 more</span>.</>
          ) : (
            'Invite a friend — you both get 10 tasks.'
          )}
        </p>
        {referralInfo != null && referralInfo.referralCount > 0 && (
          <p className="text-[10px] text-muted-foreground mt-1">
            {referralInfo.referralCount} friend{referralInfo.referralCount !== 1 ? 's' : ''} referred
          </p>
        )}
      </div>
      {hasReferralLink && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className={`shrink-0 ${
            isUrgent
              ? 'border-international-orange/30 text-international-orange hover:bg-international-orange/10'
              : ''
          }`}
        >
          {copied ? (
            <><Check className="h-3.5 w-3.5 mr-1.5" /> Copied</>
          ) : (
            <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy invite link</>
          )}
        </Button>
      )}
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
