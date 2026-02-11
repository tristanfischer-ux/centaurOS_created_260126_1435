'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  GraduationCap,
  Rocket,
  BookOpen,
  ClipboardCheck,
  Award,
  CheckCircle2,
  Circle,
  MapPin,
  Calendar,
  TrendingUp,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Enrollment } from '@/types/apprenticeship'

interface JourneyTimelineProps {
  enrollment: Enrollment
  moduleProgress: {
    modules: Array<{
      id: string
      status: 'locked' | 'available' | 'in_progress' | 'completed' | 'failed'
      started_at?: string
      completed_at?: string
      module: {
        id: string
        title: string
        module_type: string
        estimated_hours: number
      }
    }>
    summary: {
      total: number
      completed: number
      inProgress: number
      available: number
      progressPercent: number
    }
  }
  otjtProgress: {
    hoursLogged: number
    hoursTarget: number
    progressPercent: number
    onTrack: boolean
  }
  upcomingReviews: Array<{
    id: string
    review_type: string
    scheduled_date: string
    reviewer?: { full_name: string }
  }>
}

interface Milestone {
  id: string
  title: string
  description: string
  icon: typeof GraduationCap
  date?: string
  status: 'completed' | 'current' | 'upcoming'
  detail?: string
}

/**
 * Visual vertical timeline of the entire apprenticeship journey.
 *
 * @description Shows the apprentice where they are in their programme,
 * with completed milestones, current position, and upcoming events.
 * Includes overall progress stats in a sidebar.
 */
export function JourneyTimeline({
  enrollment,
  moduleProgress,
  otjtProgress,
  upcomingReviews,
}: JourneyTimelineProps) {
  const now = new Date()
  const startDate = new Date(enrollment.start_date)
  const endDate = new Date(enrollment.expected_end_date)
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  const elapsedDays = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  const daysRemaining = Math.max(0, totalDays - elapsedDays)
  const timeProgress = Math.min(100, (elapsedDays / totalDays) * 100)

  // Build milestone list
  const milestones = buildMilestones(enrollment, moduleProgress, upcomingReviews, now)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Timeline */}
      <div className="lg:col-span-2 space-y-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <MapPin className="h-5 w-5 text-international-orange" />
          Your Apprenticeship Journey
        </h3>

        <div className="relative pl-8">
          {/* Vertical line */}
          <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-border" />

          {/* Milestones */}
          <div className="space-y-6">
            {milestones.map((milestone, index) => {
              const Icon = milestone.icon
              const isLast = index === milestones.length - 1

              return (
                <div key={milestone.id} className="relative">
                  {/* Dot on line */}
                  <div
                    className={cn(
                      'absolute -left-5 top-1 h-6 w-6 rounded-full flex items-center justify-center border-2',
                      milestone.status === 'completed' &&
                        'bg-status-success border-status-success text-white',
                      milestone.status === 'current' &&
                        'bg-international-orange border-international-orange text-white',
                      milestone.status === 'upcoming' &&
                        'bg-background border-muted-foreground/30 text-muted-foreground'
                    )}
                  >
                    {milestone.status === 'completed' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : milestone.status === 'current' ? (
                      <Circle className="h-3 w-3 fill-current" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                  </div>

                  {/* Content */}
                  <div
                    className={cn(
                      'p-3 rounded-lg',
                      milestone.status === 'current' && 'bg-international-orange/5 border border-international-orange/20',
                      milestone.status === 'completed' && 'bg-muted/50',
                      milestone.status === 'upcoming' && 'bg-background'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Icon
                        className={cn(
                          'h-4 w-4 mt-0.5 shrink-0',
                          milestone.status === 'completed' && 'text-status-success',
                          milestone.status === 'current' && 'text-international-orange',
                          milestone.status === 'upcoming' && 'text-muted-foreground'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p
                            className={cn(
                              'font-medium text-sm',
                              milestone.status === 'upcoming' ? 'text-muted-foreground' : 'text-foreground'
                            )}
                          >
                            {milestone.title}
                          </p>
                          {milestone.status === 'current' && (
                            <Badge variant="default" className="text-xs bg-international-orange">
                              You are here
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {milestone.description}
                        </p>
                        {milestone.date && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(milestone.date).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </p>
                        )}
                        {milestone.detail && (
                          <p className="text-xs text-muted-foreground mt-1 italic">
                            {milestone.detail}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Progress Sidebar */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Progress Overview
        </h3>

        {/* Time Progress */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                Time Elapsed
              </span>
              <span className="font-medium">{timeProgress.toFixed(0)}%</span>
            </div>
            <Progress value={timeProgress} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {daysRemaining} days remaining · Started{' '}
              {startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </CardContent>
        </Card>

        {/* OTJT Progress */}
        <Card className={otjtProgress.onTrack ? '' : 'border-l-4 border-l-status-warning'}>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <BookOpen className="h-4 w-4" />
                OTJT Hours
              </span>
              <span className="font-medium">{otjtProgress.progressPercent.toFixed(0)}%</span>
            </div>
            <Progress value={otjtProgress.progressPercent} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {otjtProgress.hoursLogged} / {otjtProgress.hoursTarget} hours
              {!otjtProgress.onTrack && (
                <span className="text-status-warning"> · Behind schedule</span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Modules Progress */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <GraduationCap className="h-4 w-4" />
                Learning Modules
              </span>
              <span className="font-medium">{moduleProgress.summary.progressPercent.toFixed(0)}%</span>
            </div>
            <Progress value={moduleProgress.summary.progressPercent} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {moduleProgress.summary.completed} completed · {moduleProgress.summary.inProgress} in progress · {moduleProgress.summary.available} available
            </p>
          </CardContent>
        </Card>

        {/* Upcoming Reviews */}
        {upcomingReviews.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                Upcoming Reviews
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingReviews.slice(0, 3).map((review) => (
                <div
                  key={review.id}
                  className="flex items-center justify-between p-2 bg-muted rounded-lg"
                >
                  <div>
                    <p className="text-xs font-medium capitalize">
                      {review.review_type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(review.scheduled_date).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Scheduled
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

/**
 * Builds an ordered list of milestones from enrollment and progress data.
 */
function buildMilestones(
  enrollment: Enrollment,
  moduleProgress: JourneyTimelineProps['moduleProgress'],
  upcomingReviews: JourneyTimelineProps['upcomingReviews'],
  now: Date
): Milestone[] {
  const milestones: Milestone[] = []
  const startDate = new Date(enrollment.start_date)
  const endDate = new Date(enrollment.expected_end_date)

  // 1. Programme Start
  milestones.push({
    id: 'start',
    title: 'Programme Start',
    description: `Enrolled in ${enrollment.programme?.title || 'apprenticeship programme'}`,
    icon: Rocket,
    date: enrollment.start_date,
    status: now >= startDate ? 'completed' : 'upcoming',
  })

  // 2. Induction (first 2 weeks)
  const inductionEnd = new Date(startDate)
  inductionEnd.setDate(inductionEnd.getDate() + 14)
  const inductionModules = moduleProgress.modules.filter(
    (m) => m.module.module_type === 'core' && m.module.estimated_hours <= 4
  )
  const inductionComplete = inductionModules.every((m) => m.status === 'completed')
  milestones.push({
    id: 'induction',
    title: 'Induction Complete',
    description: 'Welcome modules, environment setup, and initial training',
    icon: BookOpen,
    date: inductionEnd.toISOString(),
    status: inductionComplete && now > inductionEnd ? 'completed' : now > inductionEnd ? 'completed' : now >= startDate ? 'current' : 'upcoming',
    detail: inductionComplete ? 'All induction modules completed' : undefined,
  })

  // 3. Active Learning Phase
  const completedModules = moduleProgress.summary.completed
  const totalModules = moduleProgress.summary.total
  const halfwayDate = new Date(startDate.getTime() + (endDate.getTime() - startDate.getTime()) * 0.5)
  const isInLearning = now > inductionEnd && now < halfwayDate
  milestones.push({
    id: 'learning',
    title: 'Core Learning',
    description: `Complete learning modules and log OTJT hours. ${completedModules}/${totalModules} modules done.`,
    icon: BookOpen,
    status: completedModules >= totalModules * 0.5 ? 'completed' : isInLearning ? 'current' : now > halfwayDate ? 'completed' : 'upcoming',
    detail: moduleProgress.summary.inProgress > 0
      ? `${moduleProgress.summary.inProgress} module${moduleProgress.summary.inProgress > 1 ? 's' : ''} in progress`
      : undefined,
  })

  // 4. Mid-Programme Assessment
  const midAssessment = moduleProgress.modules.find(
    (m) => m.module.module_type === 'assessment' && m.module.title.toLowerCase().includes('mid')
  )
  milestones.push({
    id: 'mid-assessment',
    title: 'Mid-Programme Assessment',
    description: 'Portfolio review and skills assessment at programme midpoint',
    icon: ClipboardCheck,
    date: halfwayDate.toISOString(),
    status: midAssessment?.status === 'completed'
      ? 'completed'
      : now >= halfwayDate
        ? 'current'
        : 'upcoming',
  })

  // 5. Gateway Assessment
  const gatewayDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000) // ~3 months before end
  const gatewayModule = moduleProgress.modules.find(
    (m) => m.module.module_type === 'assessment' && m.module.title.toLowerCase().includes('gateway')
  )
  milestones.push({
    id: 'gateway',
    title: 'Gateway Assessment',
    description: 'Demonstrate readiness for End-Point Assessment',
    icon: ClipboardCheck,
    date: gatewayDate.toISOString(),
    status: gatewayModule?.status === 'completed'
      ? 'completed'
      : enrollment.status === 'gateway' || now >= gatewayDate
        ? 'current'
        : 'upcoming',
  })

  // 6. End-Point Assessment
  milestones.push({
    id: 'epa',
    title: 'End-Point Assessment',
    description: 'Independent assessment of your skills and knowledge',
    icon: Award,
    status: enrollment.status === 'epa'
      ? 'current'
      : enrollment.status === 'completed'
        ? 'completed'
        : 'upcoming',
  })

  // 7. Completion
  milestones.push({
    id: 'completion',
    title: 'Qualification Achieved',
    description: `${enrollment.programme?.title || 'Apprenticeship'} — Level ${enrollment.programme?.level || '?'}`,
    icon: GraduationCap,
    date: enrollment.expected_end_date,
    status: enrollment.status === 'completed' ? 'completed' : 'upcoming',
  })

  // Find the first "current" milestone, or set one based on position
  const hasCurrentMilestone = milestones.some((m) => m.status === 'current')
  if (!hasCurrentMilestone) {
    // Find the last completed one and mark the next as current
    const lastCompletedIdx = milestones.reduce(
      (lastIdx, m, idx) => (m.status === 'completed' ? idx : lastIdx),
      -1
    )
    if (lastCompletedIdx >= 0 && lastCompletedIdx < milestones.length - 1) {
      milestones[lastCompletedIdx + 1].status = 'current'
    }
  }

  return milestones
}
