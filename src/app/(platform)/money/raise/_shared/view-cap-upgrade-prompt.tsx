/**
 * @file view-cap-upgrade-prompt.tsx
 *
 * Full-page upgrade prompt shown when a user has hit their monthly
 * investor view cap and tries to open a new investor detail page.
 *
 * Lives inside /money/raise/investor/[id] (not _shared) because it is
 * specific to the hard-block flow on this route.
 */

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { InvestorViewCapResult } from '@/actions/investors'
import type { SubscriptionTier } from '@/lib/billing/plans'
import { ArrowLeft, Clock, Eye, MapPin } from 'lucide-react'

interface ViewCapUpgradePromptProps {
  firmName: string
  firmType: string | null
  hqCity: string | null
  tier: SubscriptionTier
  viewCap: InvestorViewCapResult
}

const UPGRADE_CTA: Record<
  string,
  { label: string; description: string; price: string; planSlug: string }
> = {
  free: {
    label: 'Upgrade to Seed',
    description: '50 investor profiles per month',
    price: '£19/mo',
    planSlug: 'seed',
  },
  seed: {
    label: 'Upgrade to Startup Team',
    description: '150 investor profiles per month',
    price: '£49/mo',
    planSlug: 'starter',
  },
  starter: {
    label: 'Upgrade to Professional',
    description: 'Unlimited investor profiles',
    price: '£149/mo',
    planSlug: 'professional',
  },
}

export function ViewCapUpgradePrompt({
  firmName,
  firmType,
  hqCity,
  tier,
  viewCap,
}: ViewCapUpgradePromptProps) {
  const cta = UPGRADE_CTA[tier] ?? UPGRADE_CTA.free

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/money/raise">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to pipeline
          </Link>
        </Button>
      </div>

      {/* Teaser header — enough to confirm which firm they were trying to open */}
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-foreground">{firmName}</h1>
        <div className="flex flex-wrap items-center gap-2">
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

      <div className="flex items-center justify-center py-16">
        <Card className="max-w-md text-center border-international-orange/30">
          <CardContent className="py-10 px-8 space-y-4">
            <div className="h-12 w-12 rounded-full bg-international-orange/10 flex items-center justify-center mx-auto">
              <Eye className="h-6 w-6 text-international-orange" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              Monthly cap reached — {viewCap.viewsUsedThisMonth} of{' '}
              {viewCap.cap ?? '∞'} investor views used
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {viewCap.librarySize > 0 ? (
                <>
                  Your library has{' '}
                  <span className="font-medium text-foreground">
                    {viewCap.librarySize} investor{' '}
                    {viewCap.librarySize === 1 ? 'profile' : 'profiles'}
                  </span>{' '}
                  &mdash; revisit them anytime for free.
                </>
              ) : (
                <>Upgrade for more investor profiles this month.</>
              )}
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                asChild
                className="bg-international-orange hover:bg-international-orange/90"
              >
                <Link href={`/pricing?plan=${cta.planSlug}`}>
                  {cta.label} &mdash; {cta.price}
                </Link>
              </Button>
              <p className="text-xs text-muted-foreground">
                {cta.description}. No contracts, cancel anytime.
              </p>
            </div>

            <Separator />

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
