/**
 * @file ViewCapOverlay.tsx
 *
 * @description Teaser overlay shown when a user has hit their investor
 * detail view cap. Displays the firm name, type, and location (already
 * available from card data) plus a tier-appropriate upgrade CTA.
 *
 * Free users: "Upgrade to Seed — £19.99/mo, 50 profiles/month"
 * Seed users: "Upgrade to Startup Team — £49/mo, 150 profiles/month"
 * Starter users: "Upgrade to Professional — unlimited profiles"
 */

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { InvestorViewCapResult } from '@/actions/investors'
import type { SubscriptionTier } from '@/lib/billing/plans'
import { ArrowLeft, Clock, Eye, MapPin, Share2 } from 'lucide-react'

interface ViewCapOverlayProps {
  firmName: string
  firmType?: string
  hqCity?: string
  tier: SubscriptionTier
  viewCap: InvestorViewCapResult
}

const UPGRADE_CTA: Record<string, { label: string; description: string; price: string }> = {
  free: {
    label: 'Upgrade to Seed',
    description: '50 investor profiles per month',
    price: '£19.99/mo',
  },
  seed: {
    label: 'Upgrade to Startup Team',
    description: '150 investor profiles per month',
    price: '£49/mo',
  },
  starter: {
    label: 'Upgrade to Professional',
    description: 'Unlimited investor profiles',
    price: '£149/mo',
  },
}

export function ViewCapOverlay({
  firmName,
  firmType,
  hqCity,
  tier,
  viewCap,
}: ViewCapOverlayProps) {
  const cta = UPGRADE_CTA[tier] ?? UPGRADE_CTA.free

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/investors">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to directory
          </Link>
        </Button>
      </div>

      {/* Teaser header — shows enough to confirm this is the right investor */}
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-foreground">{firmName}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {firmType && <Badge variant="secondary">{firmType}</Badge>}
          {hqCity && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {hqCity}
            </span>
          )}
        </div>
      </div>

      <Separator />

      {/* View cap CTA — not a blank lock, but a clear explanation + upgrade path */}
      <div className="flex items-center justify-center py-16">
        <Card className="max-w-md text-center border-international-orange/30">
          <CardContent className="py-10 px-8 space-y-4">
            <div className="h-12 w-12 rounded-full bg-international-orange/10 flex items-center justify-center mx-auto">
              <Eye className="h-6 w-6 text-international-orange" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              You&apos;ve explored {viewCap.viewsUsedThisMonth} of 7,800+ investors this month
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your library has{' '}
              <span className="font-medium text-foreground">
                {viewCap.librarySize} investor {viewCap.librarySize === 1 ? 'profile' : 'profiles'}
              </span>
              {' '}&mdash; revisit them anytime.
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <Button asChild className="bg-international-orange hover:bg-international-orange-hover">
                <Link href="/pricing">
                  {cta.label} — {cta.price}
                </Link>
              </Button>
              <p className="text-xs text-muted-foreground">
                {cta.description}. No contracts, cancel anytime.
              </p>
            </div>

            <Separator />

            {/* Secondary CTA: referral */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Share2 className="h-3.5 w-3.5" />
              <span>
                <Link href="/settings/referrals" className="text-international-orange hover:underline">
                  Invite a friend
                </Link>{' '}
                for +5 profiles/month
              </span>
            </div>

            {/* Reset timer hint */}
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Views reset on the 1st of each month</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
