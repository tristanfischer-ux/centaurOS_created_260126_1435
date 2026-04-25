'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'

interface PasswordStrengthProps {
  password: string
}

/**
 * Length-based strength tiers.
 *
 * @description Mirrors the modern password guidance the signup action enforces
 * (length is the only requirement, no character-class rules). The bar fills
 * up as the password gets longer, so users see the gain from picking a
 * passphrase rather than a short complex string. 8 chars is the floor —
 * accepted, but flagged "Weak" so people know longer is better.
 */
const STRENGTH_TIERS: Array<{ minLength: number; label: string; color: string }> = [
  { minLength: 8, label: 'Weak', color: 'bg-destructive' },
  { minLength: 12, label: 'Fair', color: 'bg-status-warning' },
  { minLength: 16, label: 'Good', color: 'bg-status-info' },
  { minLength: 20, label: 'Strong', color: 'bg-success' },
]

/**
 * PasswordStrength — Visual 4-segment strength bar driven by length only.
 *
 * @description Shows a 4-segment progress bar that fills as the password
 * grows past 8, 12, 16, and 20 characters. No character-class checks — that
 * matches the modern length-only validation in the signup action.
 */
export function PasswordStrength({ password }: PasswordStrengthProps) {
  const filledSegments = useMemo(() => {
    return STRENGTH_TIERS.reduce(
      (count, tier) => (password.length >= tier.minLength ? count + 1 : count),
      0,
    )
  }, [password])

  if (!password) return null

  const tierIndex = Math.max(0, filledSegments - 1)
  const label = STRENGTH_TIERS[tierIndex]?.label ?? 'Weak'
  const colorClass = STRENGTH_TIERS[tierIndex]?.color ?? 'bg-destructive'

  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              i < filledSegments ? colorClass : 'bg-muted',
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Strength: <span className="font-medium text-foreground">{label}</span>
      </p>
    </div>
  )
}
