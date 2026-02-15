'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import { toast } from 'sonner'
import {
  UserCircle,
  Play,
  Target,
  Users,
  Store,
  Flame,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { OnboardingData } from '@/actions/onboarding'

const TOTAL_ITEMS = 6

const CHECKLIST_ITEMS: Array<{
  key: keyof OnboardingData
  label: string
  href?: string
  icon: LucideIcon
  /** Video item - triggers modal instead of navigation */
  isVideo?: boolean
}> = [
  { key: 'checklist_profile_completed', label: 'Complete your profile', href: '/my-profile', icon: UserCircle },
  { key: 'checklist_video_watched', label: 'Watch the overview', icon: Play, isVideo: true },
  { key: 'checklist_objective_created', label: 'Create your first objective', href: '/new-objectives', icon: Target },
  { key: 'checklist_team_member_added', label: 'Invite a team member', href: '/team', icon: Users },
  { key: 'checklist_marketplace_explored', label: 'Explore the marketplace', href: '/marketplace', icon: Store },
  { key: 'checklist_forge_project_created', label: 'Start a Forge project', href: '/the-forge/cad-lab', icon: Flame },
]

export interface GettingStartedChecklistProps {
  /** User's role - determines which checklist items are shown */
  userRole?: string
  /** Onboarding data from the database */
  onboardingData?: OnboardingData
  /** Callback when any checklist item changes */
  onItemComplete?: (itemKey: string) => void
  /** Callback when checklist is dismissed */
  onDismiss?: () => void
  /** Callback when "Watch the overview" is clicked - opens video modal */
  onPlayVideo?: () => void
}

/**
 * GettingStartedChecklist - Persistent collapsible onboarding checklist.
 *
 * @description A sidebar footer checklist guiding new users through their first
 * actions. Collapsed by default, expandable to show items with checkboxes and
 * "Go" links. Celebrates completion with confetti when all items are done.
 *
 * @component
 */
export function GettingStartedChecklist({
  userRole,
  onboardingData = {},
  onItemComplete,
  onDismiss,
  onPlayVideo,
}: GettingStartedChecklistProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasCelebratedRef = useRef(false)

  const isDismissed = onboardingData.checklist_dismissed === true
  const completedAt = onboardingData.checklist_completed_at

  const shouldHide = useMemo(() => {
    if (isDismissed) return true
    if (!completedAt) return false
    const completedDate = new Date(completedAt)
    const now = new Date()
    const daysSinceCompleted = (now.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24)
    return daysSinceCompleted > 14
  }, [isDismissed, completedAt])

  const completedCount = useMemo(() => {
    return CHECKLIST_ITEMS.filter((item) => onboardingData[item.key] === true).length
  }, [onboardingData])

  const isFullyComplete = completedCount === TOTAL_ITEMS
  const showDismissButton = completedCount >= TOTAL_ITEMS / 2

  const handleCheckboxClick = useCallback(
    (key: string) => {
      const currentValue = onboardingData[key as keyof OnboardingData]
      if (currentValue === true) return
      onItemComplete?.(key)
    },
    [onboardingData, onItemComplete]
  )

  const handleDismiss = useCallback(() => {
    onDismiss?.()
  }, [onDismiss])

  const handlePlayVideo = useCallback(() => {
    onPlayVideo?.()
  }, [onPlayVideo])

  // Completion celebration: confetti + congratulatory message + auto-dismiss
  useEffect(() => {
    if (!isFullyComplete || hasCelebratedRef.current || !onDismiss) return

    hasCelebratedRef.current = true

    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.7 },
      colors: ['#ff4500', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'],
    })
    setTimeout(() => {
      confetti({ particleCount: 40, angle: 60, spread: 55, origin: { x: 0 } })
    }, 100)
    setTimeout(() => {
      confetti({ particleCount: 40, angle: 120, spread: 55, origin: { x: 1 } })
    }, 150)

    toast.success('You\'re all set!', {
      description: 'You\'ve completed the Getting Started checklist. Welcome to ForgeOS!',
      duration: 3000,
    })

    const timeoutId = setTimeout(() => {
      onDismiss()
    }, 2500)

    return () => clearTimeout(timeoutId)
  }, [isFullyComplete, onDismiss])

  if (shouldHide) return null

  return (
    <div className="px-2 pb-3">
      <AnimatePresence mode="wait">
        {isExpanded ? (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.05 }}
              className="rounded-xl border bg-card shadow-sm"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <ProgressRing size={32} value={completedCount} total={TOTAL_ITEMS} />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Getting Started</h3>
                    <p className="text-xs text-muted-foreground">
                      {completedCount}/{TOTAL_ITEMS} complete
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Collapse checklist"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              {/* Items */}
              <ul className="divide-y divide-border">
                {CHECKLIST_ITEMS.map((item, index) => {
                  const isComplete = onboardingData[item.key] === true
                  return (
                    <motion.li
                      key={item.key}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: 0.05 + index * 0.04 }}
                      className="flex items-center justify-between gap-2 px-4 py-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => handleCheckboxClick(item.key)}
                        className={cn(
                          'flex items-center gap-3 min-w-0 flex-1 text-left rounded-md p-1 -m-1 transition-colors',
                          'hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-international-orange focus-visible:ring-offset-1'
                        )}
                        aria-pressed={isComplete}
                      >
                        <div
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                            isComplete
                              ? 'border-international-orange bg-international-orange'
                              : 'border-muted-foreground/50 bg-transparent'
                          )}
                        >
                          {isComplete && <Check className="h-3 w-3 text-white stroke-[3]" />}
                        </div>
                        <span
                          className={cn(
                            'text-sm font-medium truncate',
                            isComplete ? 'text-muted-foreground line-through' : 'text-foreground'
                          )}
                        >
                          {item.label}
                        </span>
                      </button>
                      {!isComplete && (
                        <>
                          {item.isVideo ? (
                            <button
                              type="button"
                              onClick={handlePlayVideo}
                              className="shrink-0 text-xs font-medium text-international-orange hover:text-international-orange-hover hover:underline transition-colors px-2 py-1 rounded"
                            >
                              Watch
                            </button>
                          ) : item.href ? (
                            <Link
                              href={item.href}
                              className="shrink-0 text-xs font-medium text-international-orange hover:text-international-orange-hover hover:underline transition-colors px-2 py-1 rounded"
                            >
                              Go
                            </Link>
                          ) : null}
                        </>
                      )}
                    </motion.li>
                  )
                })}
              </ul>

              {/* Dismiss */}
              {showDismissButton && (
                <div className="px-4 py-3 border-t border-border">
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        ) : (
          <motion.button
            key="collapsed"
            type="button"
            onClick={() => setIsExpanded(true)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5',
              'text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-international-orange focus-visible:ring-offset-1'
            )}
            aria-label={`Getting Started checklist: ${completedCount} of ${TOTAL_ITEMS} complete. Click to expand.`}
          >
            <ProgressRing size={32} value={completedCount} total={TOTAL_ITEMS} />
            <span className="text-sm font-medium text-foreground">Getting Started</span>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {completedCount}/{TOTAL_ITEMS}
            </span>
            <ChevronUp className="h-4 w-4 text-muted-foreground rotate-180" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
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
  const strokeWidth = Math.max(2, size / 12)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = total > 0 ? value / total : 0
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <svg
      width={size}
      height={size}
      className="shrink-0"
      aria-hidden
    >
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted"
      />
      {/* Progress */}
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
  )
}
