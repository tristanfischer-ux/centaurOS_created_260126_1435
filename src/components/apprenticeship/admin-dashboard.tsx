'use client'

import { useState, useMemo, useCallback } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { UserAvatar } from '@/components/ui/user-avatar'
import { EnrollmentCreateDialog } from './enrollment-create-dialog'
import { ProgrammeCatalog } from './programme-catalog'
import { ComplianceTracker } from './compliance-tracker'
import {
  Users,
  Plus,
  GraduationCap,
  Clock,
  AlertCircle,
  TrendingUp,
  Calendar,
  ShieldCheck,
  BookOpen,
} from 'lucide-react'
import { SpecialistInsightCard } from '@/components/specialists/specialist-insight-card'
import { usePageInsights } from '@/hooks/use-page-insights'
import { useAdvisorPanel } from '@/contexts/advisor-panel-context'
import { generateApprenticeshipInsights } from '@/actions/specialist-page-insights'
import type { AgentInsight } from '@/actions/agent-insights'
import type { Enrollment } from '@/types/apprenticeship'
import type { Programme } from './programme-detail-card'

/** Report shape from `generateComplianceReport` server action */
export interface ComplianceReport {
  summary: {
    totalApprentices: number
    onTrack: number
    atRisk: number
    documentsPending: number
    totalOTJTHours: number
    averageProgress: number
  }
  apprentices: Array<{
    name: string
    email: string
    programme: string
    level: number
    standardCode: string
    startDate: string
    expectedEndDate: string
    status: string | null
    otjt: {
      logged: number | null
      target: number
      progress: number
      expectedProgress: number
      hoursInPeriod: number
      onTrack: boolean
    }
    documents: {
      agreementSigned: boolean
      commitmentSigned: boolean
      trainingPlanApproved: boolean
    }
    reviewsInPeriod: number
  }>
}

// INTENT: Static coaching insight when no apprentices enrolled yet — no API call needed
const EMPTY_STATE_INSIGHT: AgentInsight = {
  id: 'harper-apprenticeship-empty',
  foundry_id: '',
  specialist_id: 'hiring-team',
  insight_type: 'recommendation',
  urgency: 'informational',
  title: 'Track apprenticeship progress',
  body: "Track apprenticeship progress, OTJT hours, and skills development. I'll help you stay on track with your programme goals.",
  domain_data: {},
  suggested_actions: [],
  is_read: false,
  is_dismissed: false,
  acted_on: false,
  acted_on_at: null,
  created_at: new Date().toISOString(),
  expires_at: null,
}

interface AdminDashboardProps {
  enrollments: Enrollment[]
  foundryId: string
  userRole: 'Executive' | 'Founder' | 'Operator'
  programmes?: Programme[]
  complianceReport?: ComplianceReport | null
}

/**
 * Tabbed admin dashboard with Overview, Programmes, and Compliance views.
 *
 * @description Extends the previous admin dashboard with a programme catalog
 * for browsing available programmes and a compliance tracker for ESFA
 * regulatory requirements.
 */
export function AdminDashboard({
  enrollments,
  foundryId,
  userRole,
  programmes = [],
  complianceReport,
}: AdminDashboardProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const { totalEnrollments, activeCount, atRiskCount, avgProgress } = useMemo(() => {
    const total = enrollments.length
    const active = enrollments.filter((e) => e.status === 'active').length
    const atRisk = enrollments.filter((e) => {
      const progress =
        e.otjt_hours_target > 0 ? (e.otjt_hours_logged / e.otjt_hours_target) * 100 : 0
      const startDate = new Date(e.start_date).getTime()
      const endDate = new Date(e.expected_end_date).getTime()
      const timeSpan = endDate - startDate
      const expectedProgress =
        timeSpan > 0 ? ((Date.now() - startDate) / timeSpan) * 100 : 0
      return progress < expectedProgress * 0.8
    }).length

    const avg =
      total > 0
        ? enrollments.reduce(
            (sum, e) =>
              sum +
              (e.otjt_hours_target > 0
                ? (e.otjt_hours_logged / e.otjt_hours_target) * 100
                : 0),
            0
          ) / total
        : 0

    return {
      totalEnrollments: total,
      activeCount: active,
      atRiskCount: atRisk,
      avgProgress: avg,
    }
  }, [enrollments])

  // Harper's proactive insights
  const { openPanel } = useAdvisorPanel()
  const handleDiscuss = useCallback((specialistId: string, context: string) => {
    openPanel(specialistId, { handoffContext: context, contextLabel: 'Apprenticeship' })
  }, [openPanel])
  const { insights, dismissInsight } = usePageInsights(
    (fast) => generateApprenticeshipInsights({
      enrollmentCount: totalEnrollments,
      avgProgress: avgProgress,
      onTrackCount: totalEnrollments - atRiskCount,
      atRiskCount: atRiskCount,
    }, fast),
    totalEnrollments > 0,
    { cacheKey: 'harper-apprenticeship', emptyInsight: EMPTY_STATE_INSIGHT },
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-8 w-1 bg-international-orange rounded-full" />
            <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">
              Apprenticeship Management
            </h1>
          </div>
          <p className="text-muted-foreground text-sm font-medium pl-4">
            Manage apprenticeship programmes and track progress
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Enroll New Apprentice
        </Button>
      </div>

      {/* Harper's proactive insights */}
      {insights.length > 0 && (
        <div className="space-y-3">
          {insights.map((insight) => (
            <SpecialistInsightCard
              key={insight.id}
              insight={insight}
              onDismiss={() => dismissInsight(insight.id)}
              onDiscuss={handleDiscuss}
              compact
            />
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">
            <Users className="h-4 w-4 mr-1.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="programmes">
            <BookOpen className="h-4 w-4 mr-1.5" />
            Programmes
          </TabsTrigger>
          <TabsTrigger value="compliance">
            <ShieldCheck className="h-4 w-4 mr-1.5" />
            Compliance
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{totalEnrollments}</p>
                      <p className="text-sm text-muted-foreground">Total Apprentices</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-status-success-light rounded-lg">
                      <TrendingUp className="h-6 w-6 text-status-success" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{activeCount}</p>
                      <p className="text-sm text-muted-foreground">Active Programmes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-status-warning-light rounded-lg">
                      <AlertCircle className="h-6 w-6 text-status-warning" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{atRiskCount}</p>
                      <p className="text-sm text-muted-foreground">At Risk</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-electric-blue-light rounded-lg">
                      <GraduationCap className="h-6 w-6 text-electric-blue" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{avgProgress.toFixed(0)}%</p>
                      <p className="text-sm text-muted-foreground">Avg Progress</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Enrollments List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  All Apprenticeships
                </CardTitle>
              </CardHeader>
              <CardContent>
                {enrollments.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Apprenticeships Yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Get started by enrolling your first apprentice.
                    </p>
                    <Button onClick={() => setCreateDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Enroll New Apprentice
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {enrollments.map((enrollment) => {
                      if (!enrollment.apprentice || !enrollment.programme) return null

                      const progress =
                        enrollment.otjt_hours_target > 0
                          ? (enrollment.otjt_hours_logged / enrollment.otjt_hours_target) * 100
                          : 0
                      const startDate = new Date(enrollment.start_date).getTime()
                      const endDate = new Date(enrollment.expected_end_date).getTime()
                      const timeSpan = endDate - startDate
                      const expectedProgress =
                        timeSpan > 0
                          ? Math.min(100, ((Date.now() - startDate) / timeSpan) * 100)
                          : 0
                      const onTrack = progress >= expectedProgress * 0.8
                      const daysRemaining = Math.ceil(
                        (endDate - Date.now()) / (1000 * 60 * 60 * 24)
                      )

                      return (
                        <div
                          key={enrollment.id}
                          className={`p-4 rounded-lg border ${!onTrack ? 'border-l-4 border-l-status-warning' : ''} bg-card`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-4">
                              <UserAvatar
                                name={enrollment.apprentice.full_name}
                                avatarUrl={enrollment.apprentice.avatar_url}
                                role="Apprentice"
                                size="lg"
                              />
                              <div>
                                <h4 className="font-medium text-foreground">
                                  {enrollment.apprentice.full_name}
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  {enrollment.programme.title} · Level{' '}
                                  {enrollment.programme.level}
                                </p>
                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  {daysRemaining > 0
                                    ? `${daysRemaining} days remaining`
                                    : 'Ending soon'}
                                  {enrollment.senior_mentor && (
                                    <>
                                      <span>·</span>
                                      Mentor: {enrollment.senior_mentor.full_name}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Badge variant={getStatusVariant(enrollment.status)}>
                                {getStatusLabel(enrollment.status)}
                              </Badge>
                              <Badge variant={onTrack ? 'success' : 'warning'}>
                                {onTrack ? 'On Track' : 'At Risk'}
                              </Badge>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <div className="flex items-center justify-between text-sm mb-1">
                                <span className="text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  OTJT Progress
                                </span>
                                <span className="font-medium">
                                  {enrollment.otjt_hours_logged} /{' '}
                                  {enrollment.otjt_hours_target} hrs
                                </span>
                              </div>
                              <Progress value={progress} className="h-2" />
                            </div>

                            <div>
                              <div className="flex items-center justify-between text-sm mb-1">
                                <span className="text-muted-foreground flex items-center gap-1">
                                  <TrendingUp className="h-3 w-3" />
                                  Expected by now
                                </span>
                                <span className="font-medium">
                                  {expectedProgress.toFixed(0)}%
                                </span>
                              </div>
                              <Progress value={expectedProgress} className="h-2" />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Programmes Tab */}
        <TabsContent value="programmes">
          {programmes.length > 0 ? (
            <ProgrammeCatalog
              programmes={programmes}
              canEnroll
              onEnroll={() => setCreateDialogOpen(true)}
            />
          ) : (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No programmes available.</p>
            </div>
          )}
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance">
          {complianceReport ? (
            <ComplianceTracker report={complianceReport} />
          ) : (
            <div className="text-center py-12">
              <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Compliance Data</h3>
              <p className="text-muted-foreground">
                Enroll apprentices to start tracking compliance.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Enrollment Dialog */}
      <EnrollmentCreateDialog
        foundryId={foundryId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  )
}

function getStatusVariant(status: string) {
  switch (status) {
    case 'enrolled':
      return 'secondary' as const
    case 'active':
      return 'success' as const
    case 'on_break':
      return 'warning' as const
    case 'gateway':
    case 'epa':
      return 'info' as const
    case 'completed':
      return 'success' as const
    case 'withdrawn':
      return 'destructive' as const
    default:
      return 'secondary' as const
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'enrolled':
      return 'Enrolled'
    case 'active':
      return 'Active'
    case 'on_break':
      return 'On Break'
    case 'gateway':
      return 'Gateway'
    case 'epa':
      return 'EPA'
    case 'completed':
      return 'Completed'
    case 'withdrawn':
      return 'Withdrawn'
    default:
      return status
  }
}
