'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import { 
  Clock, 
  GraduationCap, 
  Target, 
  Users, 
  FileText,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  Calendar
} from 'lucide-react'
import { OTJTLoggerDialog } from './otjt-logger-dialog'
import { ModuleProgressList } from './module-progress-list'
import { SkillsGapChart } from './skills-gap-chart'
import { DocumentSigningPanel } from './document-signing-panel'
import Link from 'next/link'
import type { Enrollment, WeeklySummary } from '@/types/apprenticeship'

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

export function ApprenticeDashboard({ 
  enrollment, 
  otjtWeeklySummary,
  otjtProgress,
  skillsGap,
  moduleProgress,
  upcomingReviews
}: ApprenticeDashboardProps) {
  const [otjtLoggerOpen, setOtjtLoggerOpen] = useState(false)
  const [documentsOpen, setDocumentsOpen] = useState(false)
  
  const daysRemaining = Math.ceil(
    (new Date(enrollment.expected_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  
  const documentsComplete = enrollment.agreement_signed_at && enrollment.commitment_statement_signed_at
  
  return (
    <div className="space-y-8">
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
              {enrollment.programme?.title} • Level {enrollment.programme?.level}
            </Badge>
            {enrollment.programme?.standard_code && (
              <Badge variant="outline" className="text-xs">
                {enrollment.programme.standard_code}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Programme ending soon'} • 
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
      
      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Overall OTJT Progress */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              OTJT Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {otjtProgress.hoursLogged} / {otjtProgress.hoursTarget}
            </div>
            <Progress value={otjtProgress.progressPercent} className="mt-2 h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {otjtProgress.progressPercent.toFixed(0)}% complete • 
              {otjtProgress.hoursRemaining} hours remaining
            </p>
            {otjtProgress.aheadBehindHours !== 0 && (
              <p className={`text-xs mt-1 ${otjtProgress.aheadBehindHours > 0 ? 'text-status-success' : 'text-status-warning'}`}>
                {otjtProgress.aheadBehindHours > 0 ? '+' : ''}{otjtProgress.aheadBehindHours} hours {otjtProgress.aheadBehindHours > 0 ? 'ahead' : 'behind'}
              </p>
            )}
          </CardContent>
        </Card>
        
        {/* This Week */}
        <Card className={otjtWeeklySummary.onTrack ? 'border-l-4 border-l-status-success' : 'border-l-4 border-l-status-warning'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              {otjtWeeklySummary.totalHours} / {otjtWeeklySummary.targetWeeklyHours} hrs
              {otjtWeeklySummary.onTrack ? (
                <CheckCircle2 className="h-5 w-5 text-status-success" />
              ) : (
                <AlertCircle className="h-5 w-5 text-status-warning" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {otjtWeeklySummary.approvedHours} approved
              {otjtWeeklySummary.pendingHours > 0 && ` • ${otjtWeeklySummary.pendingHours} pending`}
            </p>
            {!otjtWeeklySummary.onTrack && (
              <p className="text-xs text-status-warning mt-1">
                Need {otjtWeeklySummary.shortfall} more hours this week
              </p>
            )}
          </CardContent>
        </Card>
        
        {/* Learning Progress */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Learning Modules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {moduleProgress.summary.completed} / {moduleProgress.summary.total}
            </div>
            <Progress value={moduleProgress.summary.progressPercent} className="mt-2 h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {moduleProgress.summary.inProgress} in progress • {moduleProgress.summary.available} available
            </p>
          </CardContent>
        </Card>
        
        {/* Skills Progress */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Skills Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {skillsGap.skillsAtTarget} / {skillsGap.totalSkills}
            </div>
            <Progress value={skillsGap.overallProgress} className="mt-2 h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {skillsGap.gaps.length} skills need development
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Document Alert */}
      {!documentsComplete && (
        <Card className="border-status-warning bg-status-warning-light">
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <AlertCircle className="h-5 w-5 text-status-warning" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Legal Documents Required</p>
                <p className="text-sm text-muted-foreground">
                  {!enrollment.agreement_signed_at && 'Apprenticeship Agreement pending. '}
                  {!enrollment.commitment_statement_signed_at && 'Commitment Statement pending.'}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setDocumentsOpen(true)}>
                <FileText className="h-4 w-4 mr-2" />
                View Documents
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Modules & Skills */}
        <div className="lg:col-span-2 space-y-6">
          {/* Learning Modules */}
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
          
          {/* Skills Gap */}
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
        
        {/* Right Column: Reviews & Mentors */}
        <div className="space-y-6">
          {/* Upcoming Reviews */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Upcoming Reviews
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingReviews.length > 0 ? (
                <div className="space-y-3">
                  {upcomingReviews.map((review) => (
                    <div 
                      key={review.id} 
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-sm capitalize">
                          {review.review_type.replace('_', ' ')} Review
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(review.scheduled_date).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        Scheduled
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No upcoming reviews scheduled
                </p>
              )}
            </CardContent>
          </Card>
          
          {/* Mentors Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Your Mentors
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {enrollment.senior_mentor ? (
                <div className="flex items-center gap-3">
                  <UserAvatar 
                    name={enrollment.senior_mentor.full_name} 
                    avatarUrl={enrollment.senior_mentor.avatar_url}
                    role="Executive" 
                    size="md" 
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{enrollment.senior_mentor.full_name}</p>
                    <p className="text-xs text-muted-foreground">Senior Mentor</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No senior mentor assigned yet</p>
              )}
              
              {enrollment.workplace_buddy ? (
                <div className="flex items-center gap-3">
                  <UserAvatar 
                    name={enrollment.workplace_buddy.full_name}
                    avatarUrl={enrollment.workplace_buddy.avatar_url}
                    role="Apprentice" 
                    size="md" 
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{enrollment.workplace_buddy.full_name}</p>
                    <p className="text-xs text-muted-foreground">Workplace Buddy</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No workplace buddy assigned yet</p>
              )}
            </CardContent>
          </Card>
          
          {/* Quick Links */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href="/guild">
                  <BookOpen className="h-4 w-4 mr-2" />
                  Guild Community
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => setDocumentsOpen(true)}>
                <FileText className="h-4 w-4 mr-2" />
                View Documents
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* OTJT Logger Dialog */}
      <OTJTLoggerDialog 
        enrollmentId={enrollment.id}
        open={otjtLoggerOpen}
        onOpenChange={setOtjtLoggerOpen}
      />
      
      {/* Documents Panel */}
      <DocumentSigningPanel
        enrollmentId={enrollment.id}
        open={documentsOpen}
        onOpenChange={setDocumentsOpen}
        userRole="apprentice"
      />
    </div>
  )
}
