'use client'

/**
 * @file referral-nudge-banner.tsx
 *
 * @description Dismissable banner shown on /today when AI usage hits 80%.
 * Encourages users to invite friends for bonus credits.
 */

import { useState, useEffect } from 'react'
import { X, Copy, Check, Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getMyReferralInfo, getAIUsageForCreditsBar } from '@/actions/referrals'

/**
 * ReferralNudgeBanner — Shows when user is running low on AI tasks.
 *
 * @description Dismissable for the session. Only appears when usage >= 80%.
 */
export function ReferralNudgeBanner() {
  const [visible, setVisible] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [referralLink, setReferralLink] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getAIUsageForCreditsBar().then((result) => {
      if ('currentUsage' in result) {
        const percentUsed = result.limit > 0 ? (result.currentUsage / result.limit) * 100 : 0
        if (percentUsed >= 80) {
          setRemaining(Math.max(0, result.limit - result.currentUsage))
          setVisible(true)
        }
      }
    })
  }, [])

  useEffect(() => {
    if (visible && !referralLink) {
      getMyReferralInfo().then((info) => {
        if ('referralLink' in info) setReferralLink(info.referralLink)
      })
    }
  }, [visible, referralLink])

  const handleCopy = async () => {
    if (!referralLink) return
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS context)
    }
  }

  if (!visible) return null

  return (
    <div className="relative p-4 rounded-lg bg-international-orange/5 border border-international-orange/20 flex items-center gap-4">
      <Gift className="h-5 w-5 text-international-orange shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          {remaining} AI task{remaining !== 1 ? 's' : ''} left this month
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Invite a friend — you both get <span className="font-semibold text-international-orange">10 more</span>.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopy}
        className="shrink-0 border-international-orange/30 text-international-orange hover:bg-international-orange/10"
      >
        {copied ? (
          <><Check className="h-3.5 w-3.5 mr-1.5" /> Copied</>
        ) : (
          <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy invite link</>
        )}
      </Button>
      <button
        onClick={() => setVisible(false)}
        className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
