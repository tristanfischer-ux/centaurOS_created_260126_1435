'use client'

/**
 * @file tier-lock-section.tsx
 *
 * V2 tier-gated section wrapper. If the user's tier meets the required level,
 * children render as-is. Otherwise a blurred placeholder is shown with an
 * upgrade-to-tier overlay that deep-links to /pricing with the target plan.
 *
 * Rebuilt fresh (not imported from /investors/components/LockedSection) so the
 * markup follows money/raise V2 tokens and can evolve independently.
 */

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// INTENT: Accept both the canonical SubscriptionTier slugs AND the
// shorthand aliases ("pro") used in the product copy. The codebase's
// SubscriptionTier type uses `professional`, but Tristan's brief uses
// `pro` — accept both so the wiring site can pick whichever reads best.
export type TierLockRequirement =
  | 'seed'
  | 'starter'
  | 'pro'
  | 'professional'
  | 'enterprise'

const TIER_RANK: Record<string, number> = {
  free: 0,
  explorer: 0,
  seed: 1,
  starter: 2,
  pro: 3,
  professional: 3,
  enterprise: 4,
}

const TIER_COPY: Record<string, { name: string; price: string; planSlug: string }> = {
  seed: { name: 'Seed', price: '£19/mo', planSlug: 'seed' },
  starter: { name: 'Startup Team', price: '£49/mo', planSlug: 'starter' },
  pro: { name: 'Professional', price: '£149/mo', planSlug: 'professional' },
  professional: { name: 'Professional', price: '£149/mo', planSlug: 'professional' },
  enterprise: { name: 'Enterprise', price: '£499/mo', planSlug: 'enterprise' },
}

interface TierLockSectionProps {
  /** Plan that unlocks this section (e.g. "starter", "pro"). */
  requiredTier: TierLockRequirement
  /** Section heading — visible in both locked and unlocked states. */
  title: string
  /** Short sentence explaining what this section gives you. Shown in the overlay. */
  teaser: string
  /** User's current tier slug (from getInvestorTierAccess / getFoundryTier). */
  currentTier: string | null | undefined
  /** Optional className applied to the outer wrapper for layout tweaks. */
  className?: string
  children: ReactNode
}

/**
 * Gate a section by subscription tier. When `currentTier >= requiredTier`,
 * children render unchanged. Otherwise they render blurred with an upgrade
 * overlay linking to /pricing?plan=<slug>.
 */
export function TierLockSection({
  requiredTier,
  title,
  teaser,
  currentTier,
  className,
  children,
}: TierLockSectionProps) {
  const currentRank = TIER_RANK[currentTier ?? 'free'] ?? 0
  const requiredRank = TIER_RANK[requiredTier] ?? 2
  const unlocked = currentRank >= requiredRank

  if (unlocked) {
    return <div className={className}>{children}</div>
  }

  const copy = TIER_COPY[requiredTier] ?? TIER_COPY.starter

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="p-0">
        <div className="relative">
          {/* Blurred preview of the gated content */}
          <div
            aria-hidden="true"
            className="pointer-events-none select-none blur-[6px] opacity-70"
          >
            {children}
          </div>

          {/* Upgrade overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 p-4">
            <div className="max-w-sm rounded-lg border border-border bg-card px-6 py-5 text-center shadow-sm">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-international-orange/10">
                <Lock className="h-5 w-5 text-international-orange" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                Upgrade to {copy.name} to unlock {title}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">{teaser}</p>
              <Button
                asChild
                size="sm"
                className="mt-4 bg-international-orange hover:bg-international-orange/90"
              >
                <Link href={`/pricing?plan=${copy.planSlug}`}>
                  View {copy.name} — {copy.price}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
