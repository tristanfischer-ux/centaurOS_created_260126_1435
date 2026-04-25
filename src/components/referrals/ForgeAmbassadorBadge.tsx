'use client'

/**
 * @file ForgeAmbassadorBadge.tsx
 *
 * @description Visual badge and milestone toast for the Forge Ambassador lane.
 *
 * Forge Ambassador: a founder with 10 or more active paid referrals earns
 * unlimited investor searches as long as those referrals stay paid.
 *
 * This file exports two things:
 *   1. ForgeAmbassadorBadge  — a small inline badge to place beside the tier
 *      label in billing settings and the sidebar footer.
 *   2. ForgeAmbassadorMilestoneToast — a one-time client-side toast shown on
 *      the first sign-in after the threshold is crossed. Reads
 *      forge_ambassador_since from props (fetched server-side) and compares
 *      against sessionStorage so it fires only once per browser session.
 *
 * @design International Orange accent, no icons that imply AI (per CLAUDE.md
 *   no-AI-emphasis rule). Copy is British-English, no em dashes, no acronyms.
 *
 * Tier 5 step 23 — RED-TEAM-PIVOT-PLAN.md
 */

import React, { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// ForgeAmbassadorBadge
// ---------------------------------------------------------------------------

interface ForgeAmbassadorBadgeProps {
  /** Additional Tailwind classes */
  className?: string
}

/**
 * Small inline badge shown beside the plan label when a founder has earned
 * Forge Ambassador status (10+ active paid referrals).
 *
 * Uses International Orange to match the existing brand accent system.
 * Aria-label spells out the full meaning for screen readers.
 */
export function ForgeAmbassadorBadge({ className }: ForgeAmbassadorBadgeProps) {
  return (
    <span
      aria-label="Forge Ambassador — unlimited investor searches while you have 10 or more paying friends on Starter"
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
        'bg-international-orange text-white',
        className
      )}
    >
      Forge Ambassador
    </span>
  )
}

// ---------------------------------------------------------------------------
// ForgeAmbassadorMilestoneToast
// ---------------------------------------------------------------------------

const MILESTONE_TOAST_KEY = 'forgeos_ambassador_milestone_shown'

interface ForgeAmbassadorMilestoneToastProps {
  /**
   * ISO timestamp when the user first crossed the 10-referral threshold,
   * or null if they have not yet earned ambassador status.
   * Fetched server-side from profiles.forge_ambassador_since.
   */
  since: string | null
}

/**
 * Fires a one-time Sonner toast when a founder first earns Forge Ambassador
 * status. Uses sessionStorage to guarantee it only shows once per browser
 * session — even if the component re-renders.
 *
 * The toast is dismissable and does not auto-dismiss (the user should read it).
 * Duration is set to 12 seconds to give them time to read without blocking.
 */
export function ForgeAmbassadorMilestoneToast({ since }: ForgeAmbassadorMilestoneToastProps) {
  const fired = useRef(false)

  useEffect(() => {
    if (!since) return
    if (fired.current) return

    // Only show once per session
    try {
      if (sessionStorage.getItem(MILESTONE_TOAST_KEY) === since) return
    } catch {
      // sessionStorage unavailable (private browsing restriction) — skip
      return
    }

    fired.current = true

    // Delay slightly so the page settles before the toast appears
    const timer = setTimeout(() => {
      toast.success('You\'ve earned Forge Ambassador status', {
        description:
          'While you have 10 or more paying friends on Starter, your investor searches are unlimited. Thank you for telling other founders about ForgeOS.',
        duration: 12000,
        closeButton: true,
      })

      try {
        sessionStorage.setItem(MILESTONE_TOAST_KEY, since)
      } catch {
        // Non-critical
      }
    }, 1800)

    return () => clearTimeout(timer)
  }, [since])

  // Renders nothing — side-effect only
  return null
}
