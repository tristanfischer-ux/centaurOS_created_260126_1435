'use client'

/**
 * @file getting-started-hero.tsx
 *
 * @description Full-width hero version of the Getting Started checklist,
 * shown as the first card on the Today page for new users. Displays a
 * large progress ring and all 6 checklist items in a 2-column grid.
 */

import { useMemo, useCallback, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Check,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { updateOnboardingData } from '@/actions/onboarding'
import { CHECKLIST_ITEMS, CHECKLIST_TOTAL_ITEMS } from '@/components/onboarding/GettingStartedChecklist'
import type { OnboardingData } from '@/actions/onboarding'

interface GettingStartedHeroProps {
  onboardingData: OnboardingData
  userRole?: string
}

/**
 * GettingStartedHero — Full-width checklist card for the Today page.
 *
 * @description Replaces the collapsed sidebar checklist as the primary
 * first-run experience. Shows when < 3 checklist items are completed
 * and the user hasn't dismissed it.
 */
export function GettingStartedHero({ onboardingData, userRole }: GettingStartedHeroProps) {
  const completedCount = useMemo(
    () => CHECKLIST_ITEMS.filter((item) => onboardingData[item.key] === true).length,
    [onboardingData],
  )

  const [localDismissed, setLocalDismissed] = useState(false)
  const isDismissed = localDismissed || onboardingData.checklist_dismissed === true

  // Sort: for Executives/Apprentices, profile first; otherwise keep original order
  const sortedItems = useMemo(() => {
    if (userRole === 'Executive' || userRole === 'Apprentice') {
      const profile = CHECKLIST_ITEMS.find((i) => i.key === 'checklist_profile_completed')
      const rest = CHECKLIST_ITEMS.filter((i) => i.key !== 'checklist_profile_completed')
      return profile ? [profile, ...rest] : CHECKLIST_ITEMS
    }
    return CHECKLIST_ITEMS
  }, [userRole])

  const handleDismiss = useCallback(() => {
    setLocalDismissed(true)
    updateOnboardingData({ checklist_dismissed: true }).catch(() => {
      // Best-effort — hero is already hidden via local state
    })
  }, [])

  // Hide if dismissed or 3+ items complete
  if (isDismissed || completedCount >= 3) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="rounded-xl border shadow-sm overflow-hidden">
        <CardContent className="pt-6 pb-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <ProgressRing size={56} value={completedCount} total={CHECKLIST_TOTAL_ITEMS} />
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  Get the most from ForgeOS
                </h2>
                <p className="text-sm text-muted-foreground">
                  {completedCount}/{CHECKLIST_TOTAL_ITEMS} complete
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="text-muted-foreground shrink-0 h-8 w-8 p-0"
              aria-label="Dismiss checklist"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sortedItems.map((item, index) => {
              const isComplete = onboardingData[item.key] === true
              const Icon = item.icon
              return (
                <motion.div
                  key={item.key}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: 0.05 + index * 0.04 }}
                >
                  {isComplete ? (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10">
                        <Check className="h-4 w-4 text-success" />
                      </div>
                      <span className="text-sm text-muted-foreground line-through">
                        {item.label}
                      </span>
                    </div>
                  ) : item.href ? (
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg',
                        'hover:bg-muted/50 transition-colors group',
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-international-orange/10">
                          <Icon className="h-4 w-4 text-international-orange" />
                        </div>
                        <span className="text-sm font-medium text-foreground">
                          {item.label}
                        </span>
                      </div>
                      <span className="text-xs font-medium text-international-orange sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                        Go
                      </span>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-international-orange/10">
                        <Icon className="h-4 w-4 text-international-orange" />
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {item.label}
                      </span>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function ProgressRing({
  size,
  value,
  total,
}: {
  size: number
  value: number
  total: number
}) {
  const strokeWidth = Math.max(3, size / 10)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = total > 0 ? value / total : 0
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="text-international-orange transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-foreground tabular-nums">{value}/{total}</span>
      </div>
    </div>
  )
}
