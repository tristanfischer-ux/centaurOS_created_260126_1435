'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Target, Users, CheckCircle2, Flame, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { ConfettiCelebration } from '@/components/onboarding/ConfettiCelebration'
import { recordMilestoneShown } from '@/actions/onboarding'
import type { OnboardingData } from '@/actions/onboarding'

// ─── Milestone Definitions ──────────────────────────────────────────

interface MilestoneConfig {
    id: string
    title: string
    message: string
    icon: LucideIcon
    confetti: boolean
}

const MILESTONES: MilestoneConfig[] = [
    {
        id: 'first_objective',
        title: 'First Objective Created',
        message: "You've set your direction. Objectives are the foundation of strategic execution.",
        icon: Target,
        confetti: true,
    },
    {
        id: 'first_task_complete',
        title: 'First Task Completed',
        message: "Momentum! Every completed task moves you closer to your objectives.",
        icon: CheckCircle2,
        confetti: false,
    },
    {
        id: 'first_team_invite',
        title: 'Team Growing',
        message: "Great things are built by great teams. Collaboration unlocked.",
        icon: Users,
        confetti: true,
    },
    {
        id: 'first_forge_project',
        title: 'First Forge Project',
        message: "From concept to reality. The Forge turns your ideas into engineered products.",
        icon: Flame,
        confetti: false,
    },
    {
        id: 'checklist_complete',
        title: 'Getting Started Complete',
        message: "You've mastered the basics. You're ready to build something extraordinary.",
        icon: Trophy,
        confetti: true,
    },
]

// ─── Component ──────────────────────────────────────────────────────

interface MilestoneCelebrationProps {
    /** Current onboarding data from the database */
    onboardingData?: OnboardingData
    /** Milestone ID to trigger (set by parent when event occurs) */
    milestoneId?: string
}

/**
 * MilestoneCelebration - Celebrates user achievements during onboarding.
 *
 * @description Displays a celebratory toast with optional confetti when the user
 * reaches key milestones (first objective, first task complete, etc.). Each
 * milestone is shown only once, tracked via profiles.onboarding_data.
 *
 * @param onboardingData - Current onboarding data to check which milestones have been shown
 * @param milestoneId - The milestone to trigger right now
 */
export function MilestoneCelebration({
    onboardingData,
    milestoneId,
}: MilestoneCelebrationProps): React.ReactNode {
    const [showConfetti, setShowConfetti] = useState(false)

    const triggerMilestone = useCallback(async (id: string) => {
        const alreadyShown = onboardingData?.milestones_shown?.includes(id)
        if (alreadyShown) return

        const milestone = MILESTONES.find(m => m.id === id)
        if (!milestone) return

        // Show confetti if applicable
        if (milestone.confetti) {
            setShowConfetti(true)
            setTimeout(() => setShowConfetti(false), 5000)
        }

        // Show toast celebration
        const Icon = milestone.icon
        toast.success(milestone.title, {
            description: milestone.message,
            duration: 5000,
            icon: <Icon className="h-5 w-5 text-international-orange" />,
        })

        // Record that this milestone was shown
        await recordMilestoneShown(id)
    }, [onboardingData?.milestones_shown])

    useEffect(() => {
        if (milestoneId) {
            triggerMilestone(milestoneId)
        }
    }, [milestoneId, triggerMilestone])

    return (
        <AnimatePresence>
            {showConfetti && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <ConfettiCelebration />
                </motion.div>
            )}
        </AnimatePresence>
    )
}

/**
 * Checks if a milestone should be triggered based on onboarding data changes.
 *
 * @description Helper function to detect when a milestone-worthy event occurs.
 * Call this from page components that create objectives, complete tasks, etc.
 *
 * @param event - The event type that just occurred
 * @param onboardingData - Current onboarding data
 * @returns The milestone ID to trigger, or undefined if no milestone applies
 */
export function detectMilestone(
    event: 'objective_created' | 'task_completed' | 'team_member_invited' | 'forge_project_created' | 'checklist_complete',
    onboardingData?: OnboardingData
): string | undefined {
    if (!onboardingData) return undefined

    const shown = onboardingData.milestones_shown || []

    switch (event) {
        case 'objective_created':
            return shown.includes('first_objective') ? undefined : 'first_objective'
        case 'task_completed':
            return shown.includes('first_task_complete') ? undefined : 'first_task_complete'
        case 'team_member_invited':
            return shown.includes('first_team_invite') ? undefined : 'first_team_invite'
        case 'forge_project_created':
            return shown.includes('first_forge_project') ? undefined : 'first_forge_project'
        case 'checklist_complete':
            return shown.includes('checklist_complete') ? undefined : 'checklist_complete'
        default:
            return undefined
    }
}
