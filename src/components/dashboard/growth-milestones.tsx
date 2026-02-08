'use client'

/**
 * @file growth-milestones.tsx
 * 
 * @description Celebrates business milestones and signals growth to solopreneurs.
 * Shows achievements like first revenue, first hire, and feature unlocks
 * as the business grows from 1 person to a real team.
 * 
 * @component GrowthMilestones
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Trophy,
  Target,
  DollarSign,
  Users,
  TrendingUp,
  Rocket,
  CheckCircle2,
  Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface GrowthMilestonesProps {
  /** Number of completed tasks */
  completedTasks: number
  /** Number of objectives set */
  objectiveCount: number
  /** Number of team members */
  memberCount: number
  /** Whether Money Map has revenue entries */
  hasRevenue: boolean
  /** Whether purpose/canvas has been defined */
  hasPurpose: boolean
  /** CSS class */
  className?: string
}

interface Milestone {
  id: string
  title: string
  description: string
  icon: React.ElementType
  check: (ctx: GrowthMilestonesProps) => boolean
  unlocks?: string
}

const MILESTONES: Milestone[] = [
  {
    id: 'first_objective',
    title: 'Vision Set',
    description: 'You set your first objective',
    icon: Target,
    check: (ctx) => ctx.objectiveCount > 0,
  },
  {
    id: 'canvas_complete',
    title: 'Business Defined',
    description: 'You filled out your Business Canvas',
    icon: Rocket,
    check: (ctx) => ctx.hasPurpose,
  },
  {
    id: 'first_5_tasks',
    title: 'Getting Things Done',
    description: 'You completed 5 tasks',
    icon: CheckCircle2,
    check: (ctx) => ctx.completedTasks >= 5,
  },
  {
    id: 'first_revenue',
    title: 'Revenue!',
    description: 'You logged your first revenue',
    icon: DollarSign,
    check: (ctx) => ctx.hasRevenue,
    unlocks: 'Full Money Map with cost allocation',
  },
  {
    id: 'first_hire',
    title: 'Team of Two',
    description: 'You hired your first team member',
    icon: Users,
    check: (ctx) => ctx.memberCount >= 2,
    unlocks: 'Team Pulse, Workload Board, Org Blueprint',
  },
  {
    id: 'momentum',
    title: 'Momentum Builder',
    description: 'You completed 25 tasks',
    icon: TrendingUp,
    check: (ctx) => ctx.completedTasks >= 25,
    unlocks: 'Strategic Planner with AI timeline',
  },
]

/**
 * GrowthMilestones - Celebrates achievements and shows growth path
 * 
 * @description Shows completed and upcoming milestones with feature unlocks.
 * Designed to motivate solopreneurs by making progress visible.
 */
export function GrowthMilestones(props: GrowthMilestonesProps) {
  const { className } = props

  const achieved = MILESTONES.filter(m => m.check(props))
  const upcoming = MILESTONES.filter(m => !m.check(props))

  // Don't render if all milestones are achieved
  if (upcoming.length === 0 && achieved.length === MILESTONES.length) {
    return null
  }

  return (
    <Card className={cn('border', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="w-1 h-6 bg-international-orange rounded-full" />
          <Trophy className="h-4 w-4 text-international-orange" />
          Milestones
          <StatusBadge status="info" size="sm" className="ml-auto">
            {achieved.length}/{MILESTONES.length}
          </StatusBadge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Show next 2 upcoming milestones */}
          {upcoming.slice(0, 2).map((milestone) => {
            const Icon = milestone.icon
            return (
              <div key={milestone.id} className="flex items-start gap-3 py-1">
                <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-muted text-muted-foreground flex-shrink-0 mt-0.5">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{milestone.title}</p>
                  <p className="text-xs text-muted-foreground">{milestone.description}</p>
                  {milestone.unlocks && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      <span>Unlocks: {milestone.unlocks}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Show recently achieved milestones */}
          {achieved.length > 0 && (
            <>
              <div className="border-t pt-2 mt-2" />
              <p className="text-xs text-muted-foreground font-medium">Achieved</p>
              {achieved.slice(-3).map((milestone) => {
                const Icon = milestone.icon
                return (
                  <div key={milestone.id} className="flex items-center gap-3 py-1">
                    <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-status-success-light text-status-success flex-shrink-0">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-muted-foreground">{milestone.title}</p>
                    </div>
                    <CheckCircle2 className="h-4 w-4 text-status-success flex-shrink-0" />
                  </div>
                )
              })}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
