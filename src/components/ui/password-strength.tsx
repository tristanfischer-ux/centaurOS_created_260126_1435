'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'

interface PasswordStrengthProps {
  password: string
}

const CHECKS = [
  { label: '8+ characters', test: (p: string) => p.length >= 8 },
  { label: 'Uppercase', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Lowercase', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Number', test: (p: string) => /\d/.test(p) },
] as const

const STRENGTH_LABELS = ['Weak', 'Fair', 'Good', 'Strong'] as const
const STRENGTH_COLORS = [
  'bg-destructive',
  'bg-status-warning',
  'bg-status-info',
  'bg-success',
] as const

/**
 * PasswordStrength — Visual 4-segment strength bar.
 *
 * @description Shows how many of the 4 password criteria are met:
 * length >= 8, uppercase, lowercase, and a number. Renders a labeled
 * progress bar with semantic color tokens.
 */
export function PasswordStrength({ password }: PasswordStrengthProps) {
  const passedCount = useMemo(
    () => CHECKS.filter((c) => c.test(password)).length,
    [password],
  )

  if (!password) return null

  const label = STRENGTH_LABELS[passedCount - 1] ?? 'Weak'
  const colorClass = STRENGTH_COLORS[passedCount - 1] ?? STRENGTH_COLORS[0]

  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              i < passedCount ? colorClass : 'bg-muted',
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
