/**
 * @file view-cap-badge.tsx
 *
 * Server component — small "N/50 this month" badge rendered inside the
 * Raise sub-nav. Shown when the user's tier has a cap and they are
 * approaching or past it. Below the near-cap threshold it renders
 * nothing so the sub-nav stays clean for paying users with headroom.
 */

import { getInvestorViewCapStatus } from '@/actions/investors'
import { Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

const NEAR_CAP_THRESHOLD = 0.5

export async function ViewCapBadge() {
  const status = await getInvestorViewCapStatus()
  if (!status || status.cap === null) return null

  const { viewsUsedThisMonth, cap, viewsRemaining } = status
  const show = cap > 0 && viewsUsedThisMonth >= cap * NEAR_CAP_THRESHOLD
  if (!show) return null

  const exceeded = viewsRemaining === 0
  const nearCap = !exceeded && cap > 0 && viewsUsedThisMonth >= cap * 0.8

  return (
    <span
      title={`${viewsUsedThisMonth} of ${cap} investor views used this month`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums',
        exceeded
          ? 'border-international-orange/40 bg-international-orange/10 text-international-orange'
          : nearCap
            ? 'border-amber-400/50 bg-amber-50 text-amber-800'
            : 'border-border bg-muted/50 text-muted-foreground',
      )}
    >
      <Eye className="h-3 w-3" aria-hidden="true" />
      <span>
        {viewsUsedThisMonth}/{cap}
      </span>
      <span className="hidden sm:inline text-[10px] opacity-80">this month</span>
    </span>
  )
}
