/**
 * @file view-cap-banner.tsx
 *
 * Banner shown above the Raise sub-nav when the user's view cap warrants
 * attention (near cap or exceeded). Reads `getInvestorViewCapStatus()` on
 * the server — renders nothing when the user's tier has no cap
 * (Professional/Enterprise/no-foundry) or when usage is comfortably low.
 *
 * The persistent "N/50 views this month" readout lives on the sub-nav
 * badge — this banner only appears when the user needs to notice it.
 *
 * States:
 *   - Cap exceeded — loud orange-bordered banner with /pricing CTA
 *   - Within 80% of cap — subtle warning with upgrade nudge
 *   - Below 80% — renders nothing
 */

import Link from 'next/link'
import { getInvestorViewCapStatus } from '@/actions/investors'
import { AlertCircle, Lock } from 'lucide-react'

const NEAR_CAP_THRESHOLD = 0.8

export async function ViewCapBanner() {
  const status = await getInvestorViewCapStatus()

  // No user / no cap / unlimited tier — render nothing.
  if (!status || status.cap === null) return null

  const { viewsUsedThisMonth, cap, viewsRemaining, librarySize } = status
  const exceeded = viewsRemaining === 0
  const nearCap = cap > 0 && viewsUsedThisMonth >= cap * NEAR_CAP_THRESHOLD

  if (exceeded) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center gap-3 rounded-md border border-international-orange/40 bg-international-orange/5 px-4 py-2.5 text-sm"
      >
        <Lock className="h-4 w-4 shrink-0 text-international-orange" aria-hidden="true" />
        <p className="flex-1 text-foreground">
          <span className="font-semibold">
            You&apos;ve hit your monthly cap of {cap} investor views.
          </span>{' '}
          {librarySize > 0 ? (
            <span className="text-muted-foreground">
              {librarySize} {librarySize === 1 ? 'profile' : 'profiles'} in your library stay accessible.{' '}
            </span>
          ) : null}
          <span className="text-muted-foreground">Upgrade to see more.</span>
        </p>
        <Link
          href="/pricing"
          className="inline-flex items-center rounded-md bg-international-orange px-3 py-1.5 text-xs font-medium text-white hover:bg-international-orange/90"
        >
          View plans
        </Link>
      </div>
    )
  }

  if (nearCap) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center gap-3 rounded-md border border-amber-400/50 bg-amber-50 px-3 py-2 text-xs text-amber-900"
      >
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          <span className="font-medium tabular-nums">
            {viewsUsedThisMonth}/{cap}
          </span>{' '}
          investor views this month — {viewsRemaining ?? 0} left before the cap.
        </span>
        <Link
          href="/pricing"
          className="font-medium underline decoration-amber-600/50 underline-offset-2 hover:text-amber-950"
        >
          Upgrade
        </Link>
      </div>
    )
  }

  return null
}
