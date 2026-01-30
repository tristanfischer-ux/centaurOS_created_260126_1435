// @ts-nocheck
'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { UserAvatar } from '@/components/ui/user-avatar'
import { EnrollmentCreateDialog } from './enrollment-create-dialog'
import { 
  Users, 
  Plus,
  GraduationCap,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Calendar,
  FileText
} from 'lucide-react'

interface EnrollmentSummary {
  id: string
  apprentice_id: string
  status: string
  start_date: string
  expected_end_date: string
  otjt_hours_logged: number
  otjt_hours_target: number
  apprentice: {
    id: string
    full_name: string
    email: string
    avatar_url: string | null
  }
  programme: {
    id: string
    title: string
    level: number
    standard_code: string
  }
  senior_mentor?: {
    id: string
    full_name: string
    avatar_url: string | null
  }
}

interface AdminDashboardProps {
  enrollments: EnrollmentSummary[]
  foundryId: string
  userRole: 'Executive' | 'Founder' | 'Operator'
}

export function AdminDashboard({ enrollments, foundryId, userRole }: AdminDashboardProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  
  // Memoize expensive statistics calculations
  const { totalEnrollments, activeCount, atRiskCount, avgProgress } = useMemo(() => {
    const total = enrollments.length
    const active = enrollments.filter(e => e.status === 'active').length
    const atRisk = enrollments.filter(e => {
      const progress = (e.otjt_hours_logged / e.otjt_hours_target) * 100
      const startDate = new Date(e.start_date).getTime()
      const endDate = new Date(e.expected_end_date).getTime()
      const expectedProgress = ((Date.now() - startDate) / (endDate - startDate)) * 100
      return progress < expectedProgress * 0.8
    }).length
    
    const avg = total > 0
      ? enrollments.reduce((sum, e) => sum + (e.otjt_hours_logged / e.otjt_hours_target) * 100, 0) / total
      : 0
    
    return { totalEnrollments: total, activeCount: active, atRiskCount: atRisk, avgProgress: avg }
  }, [enrollments])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-1 w-8 bg-international-orange rounded-full" />
          </div>
          <h1 className="text-2xl font-display font-medium text-foreground">
            Apprenticeship Management
          </h1>
          <p className="text-muted-foreground">
            Manage apprenticeship programmes and track progress
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Enroll New Apprentice
        </Button>
      </div>

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
                const progress = (enrollment.otjt_hours_logged / enrollment.otjt_hours_target) * 100
                const startDate = new Date(enrollment.start_date).getTime()
                const endDate = new Date(enrollment.expected_end_date).getTime()
                const expectedProgress = Math.min(100, ((Date.now() - startDate) / (endDate - startDate)) * 100)
                const onTrack = progress >= expectedProgress * 0.8
                const daysRemaining = Math.ceil((endDate - Date.now()) / (1000 * 60 * 60 * 24))
                
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
                            {enrollment.programme.title} • Level {enrollment.programme.level}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {daysRemaining > 0 
                              ? `${daysRemaining} days remaining` 
                              : 'Ending soon'}
                            {enrollment.senior_mentor && (
                              <>
                                <span>•</span>
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
                    
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            OTJT Progress
                          </span>
                          <span className="font-medium">
                            {enrollment.otjt_hours_logged} / {enrollment.otjt_hours_target} hrs
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
