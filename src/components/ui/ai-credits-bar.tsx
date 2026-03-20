'use client'

/**
 * @file ai-credits-bar.tsx
 *
 * @description Compact AI usage bar for the sidebar. Shows current usage
 * against subscription limit, plus bonus referral credits. Includes
 * a popover with referral invite CTA when clicked.
 */

import { useState, useEffect } from 'react'
import { Copy, Check, Gift, Users } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getMyReferralInfo, getAIUsageForCreditsBar, type ReferralInfo } from '@/actions/referrals'

/**
 * AICreditsBarLoader — Self-loading wrapper that fetches AI usage data.
 */
export function AICreditsBarLoader() {
  const [data, setData] = useState<{ currentUsage: number; limit: number; bonusCredits: number } | null>(null)

  useEffect(() => {
    getAIUsageForCreditsBar().then((result) => {
      if ('currentUsage' in result) setData(result)
    })
  }, [])

  if (!data) return null

  return <AICreditsBar currentUsage={data.currentUsage} limit={data.limit} bonusCredits={data.bonusCredits} />
}

interface AICreditsBarProps {
  currentUsage: number
  limit: number
  bonusCredits: number
}

/**
 * AICreditsBar — Compact usage indicator with referral CTA popover.
 *
 * @description Shows "AI Tasks: ████░░ 42/50 (+8 bonus)" in the sidebar.
 * Green >50%, amber 80%, red 95%. Click opens referral popover.
 */
export function AICreditsBar({ currentUsage, limit, bonusCredits }: AICreditsBarProps) {
  const percentUsed = limit > 0 ? Math.min((currentUsage / limit) * 100, 100) : 0
  const remaining = Math.max(0, limit - currentUsage)
  const isNearLimit = percentUsed >= 80
  const isAtLimit = percentUsed >= 95
  const isExhausted = currentUsage >= limit && bonusCredits === 0

  // Progress bar color
  const barColor = isAtLimit
    ? 'bg-destructive'
    : isNearLimit
      ? 'bg-warning'
      : 'bg-success'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="w-full text-left px-2 py-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
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
        />
      </PopoverContent>
    </Popover>
  )
}

function ReferralPopoverContent({
  remaining,
  bonusCredits,
  isExhausted,
}: {
  remaining: number
  bonusCredits: number
  isExhausted: boolean
}) {
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getMyReferralInfo().then((info) => {
      if ('referralLink' in info) setReferralInfo(info)
    })
  }, [])

  const handleCopy = async () => {
    if (!referralInfo) return
    try {
      await navigator.clipboard.writeText(referralInfo.referralLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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

      {referralInfo && (
        <>
          <div className="flex gap-2">
            <Input
              readOnly
              value={referralInfo.referralLink}
              className="text-xs h-8 bg-muted/50"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0 h-8">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>

          {referralInfo.referralCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>{referralInfo.referralCount} friend{referralInfo.referralCount !== 1 ? 's' : ''} referred</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
