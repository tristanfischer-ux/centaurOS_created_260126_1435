'use client'

/**
 * @file ForgeAmbassadorBadge.tsx
 *
 * @description Visual badge, progress chip, and milestone toast for the
 * Forge Ambassador lane.
 *
 * Forge Ambassador: a founder with 10 or more active paid referrals earns
 * unlimited investor searches as long as those referrals stay paid.
 *
 * This file exports three things:
 *   1. ForgeAmbassadorBadge  — rendered when activePaidCount >= 10.
 *      Full "Forge Ambassador" badge in International Orange.
 *
 *   2. ForgeAmbassadorProgressChip  — rendered when 0 < activePaidCount < 10.
 *      Dimmer progress bar showing "X / 10 paying friends" toward the threshold.
 *      Sits beside a second chip for free signups (early-access mechanic).
 *
 *   3. ForgeAmbassadorMilestoneToast — one-time client-side toast shown on
 *      the first sign-in after the threshold is crossed. Reads
 *      forge_ambassador_since from props and compares against sessionStorage.
 *
 * Rendering contract (called from billing settings and sidebar footer):
 *   - activePaidCount >= 10  → ForgeAmbassadorBadge
 *   - 0 < activePaidCount < 10  → ForgeAmbassadorProgressChip
 *   - activePaidCount === 0 AND freeSignupsThisMonth === 0  → nothing
 *   - freeSignupsThisMonth > 0 (any paid count)  → free-signups chip
 *
 * @design International Orange accent, no icons that imply AI (per CLAUDE.md
 *   no-AI-emphasis rule). Copy is British English, no em dashes, no acronyms.
 *
 * 2026-04-25 — Early-access update adds freeSignupsThisMonth chip.
 */

import React, { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// ForgeAmbassadorBadge (full, >= 10 paying friends)
// ---------------------------------------------------------------------------

interface ForgeAmbassadorBadgeProps {
  /** Additional Tailwind classes */
  className?: string
}

/**
 * Small inline badge shown beside the plan label when a founder has earned
 * Forge Ambassador status (10 or more active paid referrals).
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
// ForgeAmbassadorProgressChip (in-progress, 0 < activePaidCount < 10)
// ---------------------------------------------------------------------------

interface ForgeAmbassadorProgressChipProps {
  /**
   * Number of active paid referrals the founder currently has.
   * Must be >= 1 for this chip to render (callers guard on > 0).
   */
  activePaidCount: number
  /**
   * Number of referral signups (any status, signed_up through converted)
   * this calendar month. Includes free-signup loop in early-access.
   * When > 0, renders a second "free friends" chip beside the progress chip.
   */
  freeSignupsThisMonth: number
  /** Additional Tailwind classes for the wrapper */
  className?: string
}

/**
 * Progress chip shown when a founder has between 1 and 9 active paid referrals.
 * Dimmer than the full badge; shows a thin progress bar toward the 10-referral
 * threshold that unlocks unlimited investor searches.
 *
 * Optionally shows a second chip for free-signup signups this month when the
 * early-access mechanic is active.
 */
export function ForgeAmbassadorProgressChip({
  activePaidCount,
  freeSignupsThisMonth,
  className,
}: ForgeAmbassadorProgressChipProps) {
  const pct = Math.min(100, (activePaidCount / 10) * 100)

  return (
    <div className={cn('inline-flex items-center gap-2 flex-wrap', className)}>
      {/* Paying friends progress chip */}
      <span
        aria-label={`${activePaidCount} of 10 paying friends toward Forge Ambassador status`}
        className="inline-flex flex-col gap-0.5 px-2 py-1 rounded-lg border border-international-orange/30 bg-international-orange/[0.06]"
      >
        <span className="text-[10px] font-semibold text-international-orange/80 uppercase tracking-wider whitespace-nowrap">
          {activePaidCount} / 10 paying friends
        </span>
        {/* Thin progress bar */}
        <span
          role="progressbar"
          aria-valuenow={activePaidCount}
          aria-valuemin={0}
          aria-valuemax={10}
          className="block h-0.5 w-full rounded-full bg-international-orange/20 overflow-hidden"
        >
          <span
            className="block h-full bg-international-orange/60 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </span>
      </span>

      {/* Free-signups chip (early-access mechanic) */}
      {freeSignupsThisMonth > 0 && (
        <span
          aria-label={`${freeSignupsThisMonth} friends who joined for free this month via your invite link`}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border border-border bg-card text-muted-foreground whitespace-nowrap"
        >
          {freeSignupsThisMonth} free {freeSignupsThisMonth === 1 ? 'friend' : 'friends'} joined this month
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ForgeAmbassadorChips — top-level resolver component
// ---------------------------------------------------------------------------

interface ForgeAmbassadorChipsProps {
  /** Number of active paid referrals */
  activePaidCount: number
  /** Number of free signups this calendar month (early-access loop) */
  freeSignupsThisMonth: number
  /** Additional Tailwind classes for the wrapper */
  className?: string
}

/**
 * Top-level resolver: picks the correct badge / chip set based on counts.
 *
 * Rendering rules:
 *   activePaidCount >= 10              → ForgeAmbassadorBadge (full)
 *   0 < activePaidCount < 10           → ForgeAmbassadorProgressChip
 *   activePaidCount === 0              → nothing (unless freeSignupsThisMonth > 0)
 *   freeSignupsThisMonth > 0 (any)    → free-signups chip alongside
 *   both counts === 0                  → renders nothing
 *
 * Import this component at call sites rather than importing the sub-components
 * directly, so the switching logic stays in one place.
 */
export function ForgeAmbassadorChips({
  activePaidCount,
  freeSignupsThisMonth,
  className,
}: ForgeAmbassadorChipsProps) {
  // Nothing to show if both counts are zero
  if (activePaidCount === 0 && freeSignupsThisMonth === 0) {
    return null
  }

  // Full ambassador badge — no progress chip needed
  if (activePaidCount >= 10) {
    return (
      <div className={cn('inline-flex items-center gap-2 flex-wrap', className)}>
        <ForgeAmbassadorBadge />
        {freeSignupsThisMonth > 0 && (
          <span
            aria-label={`${freeSignupsThisMonth} friends who joined for free this month via your invite link`}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border border-border bg-card text-muted-foreground whitespace-nowrap"
          >
            {freeSignupsThisMonth} free {freeSignupsThisMonth === 1 ? 'friend' : 'friends'} joined this month
          </span>
        )}
      </div>
    )
  }

  // In-progress (1-9 paid referrals) or free-signups-only
  // ForgeAmbassadorProgressChip handles freeSignupsThisMonth internally
  return (
    <ForgeAmbassadorProgressChip
      activePaidCount={activePaidCount}
      freeSignupsThisMonth={freeSignupsThisMonth}
      className={className}
    />
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
      toast.success("You have earned Forge Ambassador status", {
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
