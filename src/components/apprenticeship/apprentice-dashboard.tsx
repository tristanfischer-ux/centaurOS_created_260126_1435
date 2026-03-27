'use client'

import { useState, useCallback } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Clock,
  GraduationCap,
  Target,
  BookOpen,
  TrendingUp,
  MapPin,
  FileText,
} from 'lucide-react'
import { OTJTLoggerDialog } from './otjt-logger-dialog'
import { DocumentSigningPanel } from './document-signing-panel'
import { WeeklyFocus } from './weekly-focus'
import { JourneyTimeline } from './journey-timeline'
import { ModuleProgressList } from './module-progress-list'
import { SkillsGapChart } from './skills-gap-chart'
import { SpecialistInsightCard } from '@/components/specialists/specialist-insight-card'
import { InsightCardSkeleton } from '@/components/specialists/insight-card-skeleton'
import { usePageInsights } from '@/hooks/use-page-insights'
import { useAdvisorPanel } from '@/contexts/advisor-panel-context'
import { generateApprenticeshipInsights } from '@/actions/specialist-page-insights'
import type { AgentInsight } from '@/actions/agent-insights'
import type { Enrollment, WeeklySummary } from '@/types/apprenticeship'

const EMPTY_STATE_INSIGHT: AgentInsight = {
  id: 'harper-apprentice-empty',
  foundry_id: '',
  specialist_id: 'hiring-team',
  insight_type: 'recommendation',
  urgency: 'informational',
  title: 'Welcome to your apprenticeship',
  body: "I'm Harper, your HR lead. Start by logging your first OTJT hours and reviewing your module plan. I'll track your progress and flag when you're falling behind.",
  domain_data: {},
  suggested_actions: [],
  is_read: false,
  is_dismissed: false,
  acted_on: false,
  acted_on_at: null,
  created_at: new Date().toISOString(),
  expires_at: null,
}

interface ApprenticeDashboardProps {
  enrollment: Enrollment
  otjtWeeklySummary: WeeklySummary
  otjtProgress: {
    hoursLogged: number
    hoursTarget: number
    hoursRemaining: number
    progressPercent: number
    expectedProgressPercent: number
    onTrack: boolean
    pendingApprovals: number
    weeklyTarget: number
    aheadBehindHours: number
  }
  skillsGap: {
    gaps: Array<{ skill: string; category: string; current: number; target: number; gap: number }>
    totalSkills: number
    skillsAtTarget: number
    overallProgress: number
  }
  moduleProgress: {
    modules: Array<{
      id: string
      status: 'locked' | 'available' | 'in_progress' | 'completed' | 'failed'
      started_at?: string
      completed_at?: string
      hours_logged?: number
      module: {
        id: string
        title: string
        description?: string
        module_type: string
        estimated_hours: number
        content_type?: string
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
}

/**
 * Tabbed apprentice dashboard with four views: This Week, My Journey, Learning, Documents.
 *
 * @description Replaces the previous single-scroll dashboard. "This Week" answers
 * "what should I do right now?", "My Journey" shows the full timeline, "Learning"
 * contains modules and skills, and "Documents" surfaces the signing panel.
 */
export function ApprenticeDashboard({
  enrollment,
  otjtWeeklySummary,
  otjtProgress,
  skillsGap,
  moduleProgress,
  upcomingReviews,
}: ApprenticeDashboardProps) {
  const [otjtLoggerOpen, setOtjtLoggerOpen] = useState(false)
  const [documentsOpen, setDocumentsOpen] = useState(false)

  // Harper's coaching insights
  const { openPanel } = useAdvisorPanel()
  const handleDiscuss = useCallback((specialistId: string, context: string) => {
    openPanel(specialistId, { handoffContext: context, contextLabel: 'Apprenticeship' })
  }, [openPanel])
  const completedModules = moduleProgress.modules.filter(m => m.status === 'completed').length
  const { insights, dismissInsight, isLoading: insightsLoading } = usePageInsights(
    (fast) => generateApprenticeshipInsights({
      enrollmentCount: 1,
      avgProgress: otjtProgress.progressPercent,
      onTrackCount: otjtProgress.onTrack ? 1 : 0,
      atRiskCount: otjtProgress.onTrack ? 0 : 1,
    }, fast),
    completedModules > 0 || otjtProgress.hoursLogged > 0,
    { cacheKey: 'harper-apprentice-self', emptyInsight: EMPTY_STATE_INSIGHT },
  )

  const daysRemaining = Math.ceil(
    (new Date(enrollment.expected_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-8 w-1 bg-international-orange rounded-full" />
            <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">
              Your Apprenticeship
            </h1>
          </div>
          <div className="flex items-center gap-2 mt-2 pl-4">
            <Badge variant="secondary" className="text-xs">
              <GraduationCap className="h-3 w-3 mr-1" />
              {enrollment.programme?.title} · Level {enrollment.programme?.level}
            </Badge>
            {enrollment.programme?.standard_code && (
              <Badge variant="outline" className="text-xs">
                {enrollment.programme.standard_code}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 pl-4">
            {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Programme ending soon'} ·
            Started {new Date(enrollment.start_date).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setOtjtLoggerOpen(true)}>
            <Clock className="h-4 w-4 mr-2" />
            Log OTJT Hours
          </Button>
        </div>
      </div>

      {/* Harper's coaching insights */}
      {insightsLoading && <InsightCardSkeleton />}
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

      {/* Tabbed Content */}
      <Tabs defaultValue="this-week">
        <TabsList>
          <TabsTrigger value="this-week">
            <Target className="h-4 w-4 mr-1.5" />
            This Week
          </TabsTrigger>
          <TabsTrigger value="journey">
            <MapPin className="h-4 w-4 mr-1.5" />
            My Journey
          </TabsTrigger>
          <TabsTrigger value="learning">
            <BookOpen className="h-4 w-4 mr-1.5" />
            Learning
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="h-4 w-4 mr-1.5" />
            Documents
          </TabsTrigger>
        </TabsList>

        {/* This Week Tab */}
        <TabsContent value="this-week">
          <WeeklyFocus
            enrollment={enrollment}
            otjtWeeklySummary={otjtWeeklySummary}
            otjtProgress={otjtProgress}
            moduleProgress={moduleProgress}
            upcomingReviews={upcomingReviews}
            onLogOTJT={() => setOtjtLoggerOpen(true)}
            onOpenDocuments={() => setDocumentsOpen(true)}
          />
        </TabsContent>

        {/* My Journey Tab */}
        <TabsContent value="journey">
          <JourneyTimeline
            enrollment={enrollment}
            moduleProgress={moduleProgress}
            otjtProgress={otjtProgress}
            upcomingReviews={upcomingReviews}
          />
        </TabsContent>

        {/* Learning Tab */}
        <TabsContent value="learning">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Learning Modules
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ModuleProgressList
                    modules={moduleProgress.modules}
                    enrollmentId={enrollment.id}
                  />
                </CardContent>
              </Card>

              {skillsGap.gaps.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Skills to Develop
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SkillsGapChart gaps={skillsGap.gaps.slice(0, 6)} />
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar: Mentors & Reviews */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Overall OTJT
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {otjtProgress.hoursLogged} / {otjtProgress.hoursTarget}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {otjtProgress.progressPercent.toFixed(0)}% complete · {otjtProgress.hoursRemaining} hours remaining
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Skills Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {skillsGap.skillsAtTarget} / {skillsGap.totalSkills}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {skillsGap.overallProgress.toFixed(0)}% overall · {skillsGap.gaps.length} need development
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <Card>
            <CardContent className="py-8 text-center space-y-4">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
              <div>
                <h3 className="text-lg font-semibold text-foreground">Legal Documents</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  View, sign, and manage your apprenticeship documents — Apprenticeship Agreement,
                  Commitment Statement, Training Plan, and more.
                </p>
              </div>
              <Button onClick={() => setDocumentsOpen(true)}>
                <FileText className="h-4 w-4 mr-2" />
                Open Documents
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* OTJT Logger Dialog */}
      <OTJTLoggerDialog
        enrollmentId={enrollment.id}
        open={otjtLoggerOpen}
        onOpenChange={setOtjtLoggerOpen}
      />

      {/* Documents Dialog (for quick actions) */}
      <DocumentSigningPanel
        enrollmentId={enrollment.id}
        open={documentsOpen}
        onOpenChange={setDocumentsOpen}
        userRole="apprentice"
      />
    </div>
  )
}
