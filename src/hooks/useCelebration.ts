/**
 * @file useCelebration.ts
 * 
 * @description Hook for triggering celebration animations throughout ForgeOS.
 * Provides a unified API for task completion animations, objective milestones,
 * and full celebration moments.
 * 
 * @example
 * const { celebrateTaskComplete, celebrateMilestone, celebrateObjectiveComplete } = useCelebration()
 * celebrateTaskComplete() // Subtle checkmark
 * celebrateMilestone(50) // "Halfway there!" toast
 * celebrateObjectiveComplete("Launch MVP") // Full confetti
 */

import { useCallback, useRef } from 'react'
import confetti from 'canvas-confetti'
import { toast } from 'sonner'

/** Milestone thresholds that trigger celebrations */
const MILESTONE_THRESHOLDS = [25, 50, 75, 100] as const

/** Messages for each milestone */
const MILESTONE_MESSAGES: Record<number, string> = {
  25: 'Great start! Quarter of the way there.',
  50: 'Halfway there! Keep the momentum going.',
  75: 'Almost done! The finish line is in sight.',
  100: 'Objective complete! Incredible work.',
}

/**
 * Emoji for each milestone level.
 * Using simple strings since ForgeOS only uses emojis when user-requested.
 */
const MILESTONE_ICONS: Record<number, string> = {
  25: 'Progress: 25%',
  50: 'Progress: 50%',
  75: 'Progress: 75%',
  100: 'Complete!',
}

export interface CelebrationOptions {
  /** Whether celebrations are enabled (respects user preference) */
  enabled?: boolean
}

/**
 * Hook providing celebration animations for task/objective completion.
 * 
 * @description Manages a layered celebration system:
 * - Task completion: Subtle toast
 * - Objective milestone (25/50/75%): Encouraging toast with progress
 * - Objective completion (100%): Confetti burst + prominent toast
 * - Strategic goal completion: Epic confetti + shareable moment
 * 
 * @param options - Configuration options
 * @returns Celebration trigger functions
 */
export function useCelebration(options: CelebrationOptions = {}) {
  const { enabled = true } = options
  const lastMilestoneRef = useRef<Record<string, number>>({})

  /**
   * Fires confetti from the center of the screen.
   */
  const fireConfetti = useCallback(() => {
    if (!enabled) return

    // Center burst
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#ff4500', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'],
    })

    // Side bursts for extra effect
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#ff4500', '#3b82f6', '#10b981'],
      })
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#ff4500', '#f59e0b', '#8b5cf6'],
      })
    }, 150)
  }, [enabled])

  /**
   * Fires epic confetti for major achievements.
   */
  const fireEpicConfetti = useCallback(() => {
    if (!enabled) return

    const duration = 3000
    const end = Date.now() + duration

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: ['#ff4500', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'],
      })
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: ['#ff4500', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'],
      })

      if (Date.now() < end) {
        requestAnimationFrame(frame)
      }
    }

    frame()
  }, [enabled])

  /**
   * Celebrates a task being completed. Subtle toast notification.
   */
  const celebrateTaskComplete = useCallback((taskTitle?: string) => {
    if (!enabled) return

    toast.success(taskTitle ? `"${taskTitle}" completed` : 'Task completed', {
      duration: 2000,
    })
  }, [enabled])

  /**
   * Checks if an objective hit a milestone and celebrates if so.
   * Tracks previous milestones to avoid duplicate celebrations.
   * 
   * @param objectiveId - Unique objective identifier
   * @param objectiveTitle - Title for display
   * @param previousProgress - Progress before the change (0-100)
   * @param newProgress - Progress after the change (0-100)
   */
  const celebrateMilestone = useCallback((
    objectiveId: string,
    objectiveTitle: string,
    previousProgress: number,
    newProgress: number
  ) => {
    if (!enabled) return

    for (const threshold of MILESTONE_THRESHOLDS) {
      // Check if we just crossed this threshold
      if (previousProgress < threshold && newProgress >= threshold) {
        const lastCelebrated = lastMilestoneRef.current[objectiveId] || 0
        if (lastCelebrated >= threshold) continue

        lastMilestoneRef.current[objectiveId] = threshold

        const message = MILESTONE_MESSAGES[threshold]

        if (threshold === 100) {
          // Full celebration for completion
          fireConfetti()
          toast.success(`"${objectiveTitle}" — ${message}`, {
            duration: 5000,
            description: 'Share this win with your team!',
          })
        } else {
          // Milestone toast
          toast(
            `"${objectiveTitle}" — ${MILESTONE_ICONS[threshold]}`,
            {
              description: message,
              duration: 3000,
            }
          )
        }
        break // Only celebrate the highest milestone crossed
      }
    }
  }, [enabled, fireConfetti])

  /**
   * Celebrates a strategic goal being completed. Epic celebration.
   * 
   * @param goalTitle - The strategic goal title
   */
  const celebrateGoalComplete = useCallback((goalTitle: string) => {
    if (!enabled) return

    fireEpicConfetti()
    toast.success(`Strategic goal achieved: "${goalTitle}"`, {
      duration: 8000,
      description: 'A major milestone for your team. Consider sharing this achievement!',
    })
  }, [enabled, fireEpicConfetti])

  /**
   * Celebrates a streak milestone.
   * 
   * @param days - Number of consecutive days with task completions
   */
  const celebrateStreak = useCallback((days: number) => {
    if (!enabled) return
    if (days < 3) return // Don't celebrate less than 3 days

    if (days >= 7) {
      fireConfetti()
      toast.success(`${days}-day streak! Your team is on fire.`, {
        duration: 4000,
      })
    } else {
      toast(`${days}-day streak! Keep it going.`, {
        duration: 3000,
      })
    }
  }, [enabled, fireConfetti])

  return {
    celebrateTaskComplete,
    celebrateMilestone,
    celebrateGoalComplete,
    celebrateStreak,
    fireConfetti,
    fireEpicConfetti,
  }
}
