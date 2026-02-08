'use client'

/**
 * @file solopreneur-nudge.tsx
 * 
 * @description Smart nudge card for solopreneurs (1-person foundries).
 * Shows contextual suggestions based on the user's current situation:
 * - Overdue tasks? Suggest hiring help
 * - No tasks? Suggest setting objectives
 * - Growing backlog? Suggest marketplace services
 * 
 * @component SolopreneurNudge
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Rocket,
  Users,
  Target,
  TrendingUp,
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'

interface SolopreneurNudgeProps {
  /** Number of overdue tasks */
  overdueCount: number
  /** Total number of tasks */
  totalTasks: number
}

/**
 * SolopreneurNudge - Contextual growth suggestions for solo founders
 * 
 * @description Displays smart nudges based on the solopreneur's current state.
 * Encourages growth actions like hiring, setting objectives, or finding services.
 */
export function SolopreneurNudge({ overdueCount, totalTasks }: SolopreneurNudgeProps) {
  // Determine the most relevant nudge based on context
  const nudge = getNudge(overdueCount, totalTasks)

  return (
    <Card className="border bg-gradient-to-br from-orange-50/50 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="w-1 h-6 bg-international-orange rounded-full" />
          {nudge.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">{nudge.description}</p>
        <Button variant="ghost" size="sm" asChild className="text-international-orange p-0 h-auto">
          <Link href={nudge.actionHref}>
            <nudge.icon className="h-3.5 w-3.5 mr-1.5" />
            {nudge.actionLabel}
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

interface NudgeConfig {
  title: string
  description: string
  actionLabel: string
  actionHref: string
  icon: React.ElementType
}

function getNudge(overdueCount: number, totalTasks: number): NudgeConfig {
  // Priority 1: Many overdue tasks - suggest hiring help
  if (overdueCount >= 5) {
    return {
      title: 'Feeling stretched?',
      description: `You have ${overdueCount} overdue tasks. It might be time to bring someone on board to share the load.`,
      actionLabel: 'Browse Guild members',
      actionHref: '/team',
      icon: Users,
    }
  }

  // Priority 2: Some overdue tasks - gentle hiring suggestion
  if (overdueCount >= 2) {
    return {
      title: 'Growing pains?',
      description: `${overdueCount} tasks are overdue. A fractional Apprentice or Executive from the Guild could help you stay on track.`,
      actionLabel: 'Find help',
      actionHref: '/marketplace?tab=people',
      icon: Users,
    }
  }

  // Priority 3: No tasks at all - suggest objectives
  if (totalTasks === 0) {
    return {
      title: 'Ready to build?',
      description: 'Start by setting your first objective. What do you want your business to achieve this quarter?',
      actionLabel: 'Set an objective',
      actionHref: '/new-objectives',
      icon: Target,
    }
  }

  // Priority 4: Few tasks - suggest growth
  if (totalTasks < 5) {
    return {
      title: 'Building momentum',
      description: 'Great start! Check out the Launch Checklist for a step-by-step guide to growing your business.',
      actionLabel: 'View Launch Checklist',
      actionHref: '/launchpad',
      icon: Rocket,
    }
  }

  // Default: General growth nudge
  return {
    title: 'Keep growing',
    description: 'You\'re making progress! Explore the marketplace for tools and services that can accelerate your business.',
    actionLabel: 'Explore marketplace',
    actionHref: '/marketplace',
    icon: TrendingUp,
  }
}
