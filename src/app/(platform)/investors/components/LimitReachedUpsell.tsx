/**
 * @file LimitReachedUpsell.tsx
 *
 * @description Two-CTA upsell card shown when a free-tier user hits the
 * investor-search limit (saved-search lifetime cap or monthly investor leads
 * cap). Renders side-by-side:
 *   1. "Upgrade to Starter" — direct upgrade path to /pricing
 *   2. "Invite a friend who pays" — copy-link / mail-to share for the
 *      referral mechanic. Inviter URL pattern is
 *      `${APP_DOMAIN}/signup?ref=<user_id>`. The conversion engine that
 *      reads the `?ref` parameter and credits +100 free searches lives in
 *      Tier 5 step 22 (separate scope) — this component only produces the
 *      structured URL so it is ready when the engine lands.
 *
 * Voice rules (per the pivot plan):
 * - Lead with the option, not the failure ("Two ways to keep going")
 * - "Cancel anytime, no contract" reassurance line
 * - No em dashes, no emojis, British spelling
 * - Semantic design tokens only
 *
 * Copy is intentionally aligned with the post-pivot pricing of £20/month
 * for Starter (100 investor leads) and £10 per 100 extra leads add-on.
 */

'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Copy, Mail, ArrowRight, Check } from 'lucide-react'
import { APP_DOMAIN } from '@/lib/domains'
import { SUBSCRIPTION_PLANS } from '@/lib/billing/plans'

export type LimitKind = 'saved_searches' | 'monthly_searches'

interface LimitReachedUpsellProps {
  /**
   * Current authenticated user id, used to build the referral URL.
   * When undefined (e.g. anonymous render path) the invite CTA is hidden;
   * the upgrade CTA still renders so anonymous flows keep a clear next step.
   */
  userId?: string
  /** Which limit was reached, drives the headline copy. */
  limit: LimitKind
  /** How many of the cap the user has actually consumed. */
  currentCount?: number
  /** The cap value itself (e.g. 5 for free saved searches, 15 for free leads). */
  limitMax?: number
  /**
   * When true, the user is within their early-access free month.
   * Switches the primary CTA from "Upgrade to Starter" to "Copy invite link"
   * and reframes the copy around the generous free mechanic.
   * 2026-04-25 early-access addition.
   */
  isEarlyAccess?: boolean
}

/**
 * Resolve the price + lead-count copy from the live plan data when present.
 * Falls back to the pivot-plan numbers (£20 / 100 leads) so the component is
 * safe to render even if the plans module fails to import cleanly.
 */
function getStarterCopy(): { priceLine: string; leadsLine: string } {
  const starterV2 = SUBSCRIPTION_PLANS['starter_v2']
  if (starterV2) {
    const pounds = (starterV2.priceMonthlyGBP / 100).toFixed(0).replace(/\.0$/, '')
    const leads = starterV2.limits.investorLeadsPerMonth ?? 100
    return {
      priceLine: `Start Starter, £${pounds}/month`,
      leadsLine: `£${pounds}/month, ${leads} investor leads with full why-fit and a drafted email`,
    }
  }
  return {
    priceLine: 'Start Starter, £20/month',
    leadsLine: '£20/month, 100 investor leads with full why-fit and a drafted email',
  }
}

const REFERRAL_BONUS_LABEL = '+100 searches free this month'
const REFERRAL_INVITER_CAP_LABEL = 'Inviter cap: +500 searches per month'

/**
 * Build the referral signup URL. Centralised so the same `?ref=` shape lands
 * in every surface that uses this CTA (investors empty-out, post-meeting
 * upsell, future sidebar footer).
 */
function buildReferralUrl(userId: string): string {
  return `${APP_DOMAIN}/signup?ref=${userId}`
}

export function LimitReachedUpsell({
  userId,
  limit,
  currentCount,
  limitMax,
  isEarlyAccess = false,
}: LimitReachedUpsellProps) {
  const [copied, setCopied] = useState(false)
  const starter = getStarterCopy()
  const referralUrl = userId ? buildReferralUrl(userId) : null

  const handleCopy = useCallback(async () => {
    if (!referralUrl) return
    try {
      await navigator.clipboard.writeText(referralUrl)
      setCopied(true)
      toast.success('Invite link copied. Paste it anywhere.')
      setTimeout(() => setCopied(false), 2400)
    } catch {
      toast.error('Could not copy link. Long-press the link to copy manually.')
    }
  }, [referralUrl])

  const handleEmailShare = useCallback(() => {
    if (!referralUrl) return
    const subject = encodeURIComponent('ForgeOS, the investor matcher I\'ve been using')
    const body = encodeURIComponent(
      [
        'Hey,',
        '',
        'I\'ve been using ForgeOS to find UK investors who match what I\'m building. Sharing my invite link below in case it\'s useful.',
        '',
        referralUrl,
        '',
        'Tristan',
      ].join('\n'),
    )
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }, [referralUrl])

  // -----------------------------------------------------------------------
  // Early-access variant: generous framing, invite link as primary CTA
  // -----------------------------------------------------------------------
  if (isEarlyAccess) {
    return (
      <Card className="border-international-orange/30 bg-international-orange/[0.03]">
        <CardContent className="p-6 space-y-5">
          <div>
            <p className="text-base font-semibold text-foreground">
              Free for your first month
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-1">
              Invite a friend to extend your free time and get them a free month too.
              Both of you get +50 searches for each friend who joins.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Primary CTA: Copy invite link */}
            <div className="rounded-lg border border-international-orange/30 bg-card p-5 space-y-3 flex flex-col">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  Invite a friend
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  They get a free month. You both get +50 investor searches the moment they sign up.
                </p>
              </div>
              <div className="flex-1" />
              <div className="space-y-2">
                {referralUrl ? (
                  <>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleCopy}
                        className="flex-1 justify-center gap-2"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            Copy invite link
                          </>
                        )}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={handleEmailShare}
                        className="flex-1 justify-center gap-2"
                      >
                        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                        Email
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Up to +500 searches per month from invites.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground text-center">
                    Sign in to share your invite link.
                  </p>
                )}
              </div>
            </div>

            {/* Secondary CTA: Starter after your free month */}
            <div className="rounded-lg shadow-sm bg-card p-5 space-y-3 flex flex-col">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  After your free month
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Starter gives you 100 investor leads per month with full why-fit and a drafted email.
                </p>
              </div>
              <div className="flex-1" />
              <div className="space-y-2">
                <Button asChild variant="secondary" className="w-full justify-center gap-2">
                  <Link href="/pricing?plan=starter_v2">
                    Read about Starter, £20 per month
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Cancel anytime, no contract.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // -----------------------------------------------------------------------
  // Standard variant (non-early-access users)
  // -----------------------------------------------------------------------

  const headline = 'Two ways to keep going'

  const subline =
    limit === 'saved_searches'
      ? `Free includes ${limitMax ?? 5} saved searches across the lifetime of your account. Pick one of the routes below to keep building your investor list.`
      : `Free includes ${limitMax ?? 15} investor profile views a month. Pick one of the routes below to keep building your investor list.`

  return (
    <Card className="border-international-orange/30 bg-international-orange/[0.03]">
      <CardContent className="p-6 space-y-5">
        <div>
          <p className="text-base font-semibold text-foreground">{headline}</p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-1">
            {subline}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Option 1: Upgrade to Starter */}
          <div className="rounded-lg shadow-sm bg-card p-5 space-y-3 flex flex-col">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Upgrade to Starter
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {starter.leadsLine}.
              </p>
            </div>
            <div className="flex-1" />
            <div className="space-y-2">
              <Button asChild className="w-full justify-center gap-2">
                <Link href="/pricing?plan=starter_v2">
                  {starter.priceLine}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Cancel anytime, no contract.
              </p>
            </div>
          </div>

          {/* Option 2: Invite a friend */}
          <div className="rounded-lg shadow-sm bg-card p-5 space-y-3 flex flex-col">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Invite a friend who pays for Starter
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You get {REFERRAL_BONUS_LABEL} the moment they subscribe.
              </p>
            </div>
            <div className="flex-1" />
            <div className="space-y-2">
              {referralUrl ? (
                <>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={handleCopy}
                      className="flex-1 justify-center gap-2"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          Copy invite link
                        </>
                      )}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleEmailShare}
                      className="flex-1 justify-center gap-2"
                    >
                      <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                      Send via email
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    {REFERRAL_INVITER_CAP_LABEL}.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground text-center">
                  Sign in to share your invite link.
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Lightweight banner shown above the search box when the free user is
 * approaching (>= 80%) but not yet at their limit. Distinct from
 * `LimitReachedUpsell` so the soft state never feels like a wall.
 */
interface ApproachingLimitBannerProps {
  limit: LimitKind
  currentCount: number
  limitMax: number
  /** When true, shows early-access copy (invite CTA instead of upgrade CTA). */
  isEarlyAccess?: boolean
  /** Referral URL for the invite link CTA (only used when isEarlyAccess is true). */
  referralUrl?: string
}

export function ApproachingLimitBanner({
  limit,
  currentCount,
  limitMax,
  isEarlyAccess = false,
  referralUrl,
}: ApproachingLimitBannerProps) {
  const remaining = Math.max(0, limitMax - currentCount)
  const label =
    limit === 'saved_searches'
      ? `${currentCount} of ${limitMax} lifetime saved searches used`
      : `${currentCount} of ${limitMax} investor profile views used this month`

  if (isEarlyAccess) {
    return (
      <div
        role="status"
        className="rounded-lg border border-international-orange/30 bg-international-orange/[0.06] px-4 py-3 text-sm leading-relaxed text-foreground"
      >
        <span className="font-semibold">{label}.</span>{' '}
        <span className="text-muted-foreground">
          {remaining > 0 ? `${remaining} remaining. ` : ''}
          Invite a friend to get both of you +50 more searches.
        </span>{' '}
        {referralUrl && (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(referralUrl)
              } catch {
                // Silent fallback — full upsell panel handles the error case
              }
            }}
            className="text-international-orange hover:underline font-medium cursor-pointer"
          >
            Copy invite link
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      role="status"
      className="rounded-lg border border-international-orange/30 bg-international-orange/[0.06] px-4 py-3 text-sm leading-relaxed text-foreground"
    >
      <span className="font-semibold">{label}.</span>{' '}
      <span className="text-muted-foreground">
        {remaining > 0
          ? `${remaining} remaining. `
          : ''}
        Upgrade to Starter for 100 investor leads a month, or invite a friend who pays for Starter to get +100 free searches this month.
      </span>{' '}
      <Link
        href="/pricing?plan=starter_v2"
        className="text-international-orange hover:underline font-medium"
      >
        See Starter
      </Link>
    </div>
  )
}
