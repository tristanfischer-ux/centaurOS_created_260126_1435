'use client'

/**
 * @file founding-member-badge.tsx
 *
 * @description Small badge showing "Founding Member #42" with a sparkle icon.
 * Used on marketplace profiles, team lists, and account popover.
 */

import { Sparkles } from 'lucide-react'

interface FoundingMemberBadgeProps {
  memberNumber: number
  /** Compact variant for inline use (smaller text, no border) */
  compact?: boolean
}

/**
 * FoundingMemberBadge — Visual indicator of early adopter status.
 *
 * @param memberNumber - The user's founding member number (1-100)
 * @param compact - If true, renders a smaller inline version
 */
export function FoundingMemberBadge({ memberNumber, compact }: FoundingMemberBadgeProps) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-international-orange">
        <Sparkles className="h-3 w-3" />
        Founding Member #{memberNumber}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-international-orange/10 border border-international-orange/20 text-xs font-semibold text-international-orange">
      <Sparkles className="h-3.5 w-3.5" />
      Founding Member #{memberNumber}
    </span>
  )
}
