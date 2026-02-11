'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Clock,
  BookOpen,
  Calendar,
  FileText,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Target,
  MessageSquare,
} from 'lucide-react'
import type { Enrollment, WeeklySummary } from '@/types/apprenticeship'

interface WeeklyFocusProps {
  enrollment: Enrollment
  otjtWeeklySummary: WeeklySummary
  otjtProgress: {
    hoursLogged: number
    hoursTarget: number
    hoursRemaining: number
    progressPercent: number
    weeklyTarget: number
    aheadBehindHours: number
    onTrack: boolean
    pendingApprovals: number
    expectedProgressPercent: number
  }
  moduleProgress: {
    modules: Array<{
      id: string
      status: 'locked' | 'available' | 'in_progress' | 'completed' | 'failed'
      module: {
        id: string
        title: string
        description?: string
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
  upcomingReviews: Array<{
    id: string
    review_type: string
    scheduled_date: string
    reviewer?: { full_name: string }
  }>
  onLogOTJT: () => void
  onOpenDocuments: () => void
}

/**
 * "What to do THIS week" focused view for apprentices.
 *
 * @description Prioritises the most important actions an apprentice should take
 * this week — OTJT hours to log, modules to continue, reviews to prepare for,
 * and documents to sign. Includes a daily OTJT breakdown chart.
 */
export function WeeklyFocus({
  enrollment,
  otjtWeeklySummary,
  otjtProgress,
  moduleProgress,
  upcomingReviews,
  onLogOTJT,
  onOpenDocuments,
}: WeeklyFocusProps) {
  const documentsComplete =
    enrollment.agreement_signed_at && enrollment.commitment_statement_signed_at
  const currentModule = moduleProgress.modules.find((m) => m.status === 'in_progress')
  const nextAvailable = moduleProgress.modules.find((m) => m.status === 'available')
  const hoursNeeded = Math.max(
    0,
    otjtWeeklySummary.targetWeeklyHours - otjtWeeklySummary.totalHours
  )

  // Upcoming reviews this week
  const now = new Date()
  const weekEnd = new Date(now)
  weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()))
  const reviewsThisWeek = upcomingReviews.filter(
    (r) => new Date(r.scheduled_date) <= weekEnd
  )

  // Build prioritised action list
  const actions: Array<{
    id: string
    priority: 'high' | 'medium' | 'low'
    icon: typeof Clock
    title: string
    description: string
    action?: { label: string; onClick: () => void }
  }> = []

  // 1. Unsigned documents (highest priority)
  if (!documentsComplete) {
    actions.push({
      id: 'documents',
      priority: 'high',
      icon: FileText,
      title: 'Sign required documents',
      description: [
        !enrollment.agreement_signed_at && 'Apprenticeship Agreement',
        !enrollment.commitment_statement_signed_at && 'Commitment Statement',
      ]
        .filter(Boolean)
        .join(' and ') + ' pending signature.',
      action: { label: 'View Documents', onClick: onOpenDocuments },
    })
  }

  // 2. OTJT hours behind
  if (hoursNeeded > 0) {
    actions.push({
      id: 'otjt',
      priority: hoursNeeded > otjtWeeklySummary.targetWeeklyHours * 0.5 ? 'high' : 'medium',
      icon: Clock,
      title: `Log ${hoursNeeded.toFixed(1)} more OTJT hours`,
      description: `You've logged ${otjtWeeklySummary.totalHours} of ${otjtWeeklySummary.targetWeeklyHours} hours this week.`,
      action: { label: 'Log Hours', onClick: onLogOTJT },
    })
  }

  // 3. Current module
  if (currentModule) {
    actions.push({
      id: 'module-current',
      priority: 'medium',
      icon: BookOpen,
      title: `Continue: ${currentModule.module.title}`,
      description: `${currentModule.module.estimated_hours} hours estimated. Module type: ${currentModule.module.module_type.replace(/_/g, ' ')}.`,
    })
  } else if (nextAvailable) {
    actions.push({
      id: 'module-next',
      priority: 'medium',
      icon: BookOpen,
      title: `Start next module: ${nextAvailable.module.title}`,
      description: `${nextAvailable.module.estimated_hours} hours estimated. Ready to begin.`,
    })
  }

  // 4. Upcoming reviews
  for (const review of reviewsThisWeek) {
    actions.push({
      id: `review-${review.id}`,
      priority: 'medium',
      icon: Calendar,
      title: `Prepare for ${review.review_type.replace(/_/g, ' ')} review`,
      description: `Scheduled for ${new Date(review.scheduled_date).toLocaleDateString()}${review.reviewer ? ` with ${review.reviewer.full_name}` : ''}.`,
    })
  }

  // 5. All good!
  if (actions.length === 0) {
    actions.push({
      id: 'all-good',
      priority: 'low',
      icon: CheckCircle2,
      title: 'You\'re on track this week!',
      description: 'All weekly targets met. Keep up the great work.',
    })
  }

  // Daily breakdown from weekly summary logs
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const dailyHours = getDailyBreakdown(otjtWeeklySummary)
  const maxHours = Math.max(
    otjtWeeklySummary.targetWeeklyHours / 5,
    ...dailyHours
  )

  return (
    <div className="space-y-6">
      {/* Weekly Status Banner */}
      <Card className={otjtWeeklySummary.onTrack ? 'border-l-4 border-l-status-success' : 'border-l-4 border-l-status-warning'}>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              {otjtWeeklySummary.onTrack ? (
                <CheckCircle2 className="h-6 w-6 text-status-success" />
              ) : (
                <AlertCircle className="h-6 w-6 text-status-warning" />
              )}
              <div>
                <p className="font-semibold text-foreground">
                  {otjtWeeklySummary.onTrack
                    ? 'On track this week'
                    : `${hoursNeeded.toFixed(1)} hours to go this week`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {otjtWeeklySummary.totalHours} / {otjtWeeklySummary.targetWeeklyHours} hours logged
                  {otjtWeeklySummary.pendingHours > 0 &&
                    ` (${otjtWeeklySummary.pendingHours} pending approval)`}
                </p>
              </div>
            </div>
            <Button size="sm" onClick={onLogOTJT}>
              <Clock className="h-4 w-4 mr-2" />
              Log Hours
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Priority Actions */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Target className="h-5 w-5 text-international-orange" />
            This Week&apos;s Focus
          </h3>
          <div className="space-y-3">
            {actions.map((action) => {
              const Icon = action.icon
              return (
                <Card key={action.id} className="border">
                  <CardContent className="py-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                          action.priority === 'high'
                            ? 'bg-status-warning-light'
                            : action.priority === 'medium'
                              ? 'bg-muted'
                              : 'bg-status-success-light'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 ${
                            action.priority === 'high'
                              ? 'text-status-warning'
                              : action.priority === 'medium'
                                ? 'text-muted-foreground'
                                : 'text-status-success'
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground">{action.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {action.description}
                        </p>
                      </div>
                      {action.action && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={action.action.onClick}
                          className="shrink-0"
                        >
                          {action.action.label}
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        {/* Daily OTJT Breakdown */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Daily Breakdown
          </h3>
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {dayLabels.map((day, i) => {
                  const hours = dailyHours[i]
                  const target = otjtWeeklySummary.targetWeeklyHours / 5
                  const percent = maxHours > 0 ? (hours / maxHours) * 100 : 0
                  const isToday = new Date().getDay() === i + 1

                  return (
                    <div key={day} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span
                          className={`font-medium ${isToday ? 'text-international-orange' : 'text-muted-foreground'}`}
                        >
                          {day} {isToday && '(today)'}
                        </span>
                        <span className="text-muted-foreground">
                          {hours > 0 ? `${hours.toFixed(1)}h` : '—'}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            hours >= target
                              ? 'bg-status-success'
                              : hours > 0
                                ? 'bg-international-orange'
                                : 'bg-transparent'
                          }`}
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Daily target: {(otjtWeeklySummary.targetWeeklyHours / 5).toFixed(1)}h
              </p>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={onLogOTJT}>
                <Clock className="h-4 w-4 mr-2" />
                Log OTJT Hours
              </Button>
              {enrollment.senior_mentor && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a href={`/messages?user=${enrollment.senior_mentor.id}`}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Message Mentor
                  </a>
                </Button>
              )}
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={onOpenDocuments}>
                <FileText className="h-4 w-4 mr-2" />
                View Documents
              </Button>
            </CardContent>
          </Card>

          {/* Overall Progress Mini */}
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Overall OTJT</span>
                <span className="font-medium">{otjtProgress.progressPercent.toFixed(0)}%</span>
              </div>
              <Progress value={otjtProgress.progressPercent} className="h-2" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Modules</span>
                <span className="font-medium">
                  {moduleProgress.summary.completed}/{moduleProgress.summary.total}
                </span>
              </div>
              <Progress value={moduleProgress.summary.progressPercent} className="h-2" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

/**
 * Extracts daily hour totals from the weekly summary logs.
 * Returns an array of 5 numbers (Mon–Fri).
 */
function getDailyBreakdown(summary: WeeklySummary): number[] {
  const days = [0, 0, 0, 0, 0] // Mon-Fri
  for (const log of summary.logs) {
    const date = new Date(log.log_date)
    const dayOfWeek = date.getDay() // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      days[dayOfWeek - 1] += Number(log.hours)
    }
  }
  return days
}
