/**
 * @file Upgrade Prompt Component
 *
 * @description Reusable "use client" component for upgrade touchpoints.
 * Shown when a user hits a usage limit (AI tasks, compute, investor views, etc.)
 * to nudge them toward the next tier. Includes optional referral link as a
 * secondary action.
 *
 * @component
 *
 * @example
 * <UpgradePrompt
 *   currentTier="free"
 *   limitType="ai_tasks"
 *   contextMessage="You've used all 50 AI tasks this month"
 *   referralCode="abc123"
 * />
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowRight, Copy, Check, Users } from 'lucide-react'
import type { SubscriptionTier } from '@/lib/billing/plans'

/** Maps current tier to the next tier name and price */
const TIER_PROGRESSION: Record<
  SubscriptionTier,
  { nextTierName: string; price: string; href: string }
> = {
  free: {
    nextTierName: 'Seed',
    price: '£19.99/mo',
    href: '/settings/billing',
  },
  seed: {
    nextTierName: 'Startup Team',
    price: '£49/mo',
    href: '/settings/billing',
  },
  starter: {
    nextTierName: 'Professional',
    price: '£149/mo',
    href: '/settings/billing',
  },
  professional: {
    nextTierName: 'Enterprise',
    price: '',
    href: '/contact',
  },
  enterprise: {
    nextTierName: 'Enterprise',
    price: '',
    href: '/contact',
  },
}

interface UpgradePromptProps {
  /** The user's current subscription tier */
  currentTier: SubscriptionTier
  /** Which limit was hit */
  limitType: 'ai_tasks' | 'compute' | 'investor_views' | 'specialist' | 'general'
  /** Context-specific message shown as the heading (e.g., "You've used all 50 AI tasks this month") */
  contextMessage: string
  /** Referral code for the secondary "invite a friend" action. If null, the referral CTA is hidden. */
  referralCode: string | null
}

/**
 * UpgradePrompt — compact upgrade nudge for overlays and sidebars.
 *
 * @description Shows a context message about what limit was hit,
 * a primary CTA to upgrade to the next tier, and an optional
 * secondary referral link.
 */
export function UpgradePrompt({
  currentTier,
  limitType: _limitType,
  contextMessage,
  referralCode,
}: UpgradePromptProps) {
  const [copied, setCopied] = useState(false)
  const progression = TIER_PROGRESSION[currentTier]
  const isEnterprise = currentTier === 'professional' || currentTier === 'enterprise'

  function handleCopyReferral() {
    if (!referralCode) return
    const referralUrl = `${window.location.origin}/join?ref=${referralCode}`
    navigator.clipboard.writeText(referralUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Card className="border-international-orange/20">
      <CardContent className="pt-6 space-y-4">
        {/* Context message */}
        <p className="text-sm font-semibold text-foreground leading-snug">
          {contextMessage}
        </p>

        {/* Primary CTA */}
        <Button
          asChild
          className="w-full bg-international-orange hover:bg-international-orange-hover"
        >
          <Link href={progression.href}>
            {isEnterprise
              ? 'Contact Sales'
              : `Upgrade to ${progression.nextTierName}`}
            {progression.price && (
              <span className="ml-1 text-xs opacity-80">
                ({progression.price})
              </span>
            )}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
        </Button>

        {/* Secondary: Referral link */}
        {referralCode && (
          <div className="flex items-center justify-center gap-2 pt-1">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              onClick={handleCopyReferral}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              or invite a friend
              {copied ? (
                <Check className="h-3 w-3 text-status-success" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
