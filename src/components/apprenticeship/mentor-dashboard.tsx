// @ts-nocheck
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { UserAvatar } from '@/components/ui/user-avatar'
import { OTJTApprovalPanel } from './otjt-approval-panel'
import { 
  Users, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  MessageSquare,
  Calendar,
  TrendingUp,
  FileCheck
} from 'lucide-react'
import Link from 'next/link'

interface MenteeEnrollment {
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
  pendingApprovals: number
  upcomingReview: {
    type: string
    date: string
  } | null
}

interface MentorDashboardProps {
  mentees: MenteeEnrollment[]
}

export function MentorDashboard({ mentees }: MentorDashboardProps) {
  const [approvalPanelOpen, setApprovalPanelOpen] = useState(false)
  
  const totalPendingApprovals = mentees.reduce((sum, m) => sum + m.pendingApprovals, 0)
  const atRiskCount = mentees.filter(m => {
    const progress = (m.otjt_hours_logged / m.otjt_hours_target) * 100
    const startDate = new Date(m.start_date).getTime()
    const endDate = new Date(m.expected_end_date).getTime()
    const expectedProgress = ((Date.now() - startDate) / (endDate - startDate)) * 100
    return progress < expectedProgress * 0.9
  }).length
  
  return (
    <>
    <OTJTApprovalPanel open={approvalPanelOpen} onOpenChange={setApprovalPanelOpen} />
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-1 w-8 bg-international-orange rounded-full" />
          </div>
          <h1 className="text-2xl font-display font-medium text-foreground">
            Mentor Dashboard
          </h1>
          <p className="text-muted-foreground">
            {mentees.length} apprentice{mentees.length !== 1 ? 's' : ''} under your guidance
          </p>
        </div>
        <div className="flex gap-2">
          {totalPendingApprovals > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              className="border-status-warning text-status-warning hover:bg-status-warning-light"
              onClick={() => setApprovalPanelOpen(true)}
            >
              <Clock className="h-4 w-4 mr-1" />
              {totalPendingApprovals} OTJT logs pending
            </Button>
          )}
          {atRiskCount > 0 && (
            <Badge variant="destructive" className="text-sm py-1.5 px-3">
              <AlertCircle className="h-4 w-4 mr-1" />
              {atRiskCount} at risk
            </Badge>
          )}
        </div>
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
                <p className="text-2xl font-bold">{mentees.length}</p>
                <p className="text-sm text-muted-foreground">Apprentices</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-status-warning-light rounded-lg">
                <Clock className="h-6 w-6 text-status-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalPendingApprovals}</p>
                <p className="text-sm text-muted-foreground">Pending Approvals</p>
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
                <p className="text-2xl font-bold">{mentees.length - atRiskCount}</p>
                <p className="text-sm text-muted-foreground">On Track</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-status-error-light rounded-lg">
                <AlertCircle className="h-6 w-6 text-status-error" />
              </div>
              <div>
                <p className="text-2xl font-bold">{atRiskCount}</p>
                <p className="text-sm text-muted-foreground">At Risk</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Mentee Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {mentees.map((mentee) => {
          const otjtProgress = (mentee.otjt_hours_logged / mentee.otjt_hours_target) * 100
          const startDate = new Date(mentee.start_date).getTime()
          const endDate = new Date(mentee.expected_end_date).getTime()
          const expectedProgress = Math.min(100, ((Date.now() - startDate) / (endDate - startDate)) * 100)
          const onTrack = otjtProgress >= expectedProgress * 0.9
          const daysRemaining = Math.ceil((endDate - Date.now()) / (1000 * 60 * 60 * 24))
          
          return (
            <Card key={mentee.id} className={`border ${!onTrack ? 'border-l-4 border-l-status-warning' : ''}`}>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <UserAvatar
                      name={mentee.apprentice.full_name}
                      avatarUrl={mentee.apprentice.avatar_url}
                      role="Apprentice"
                      size="xl"
                      showBorder
                    />
                    <div>
                      <CardTitle className="text-lg">{mentee.apprentice.full_name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {mentee.programme.title} • Level {mentee.programme.level}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Programme ending'}
                      </p>
                    </div>
                  </div>
                  <Badge variant={onTrack ? 'success' : 'warning'}>
                    {onTrack ? 'On Track' : 'At Risk'}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* OTJT Progress */}
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">OTJT Progress</span>
                    <span className="font-medium">
                      {mentee.otjt_hours_logged} / {mentee.otjt_hours_target} hrs ({otjtProgress.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="relative">
                    <Progress value={otjtProgress} className="h-2" />
                    {/* Expected progress marker */}
                    <div 
                      className="absolute top-0 w-0.5 h-2 bg-foreground/50"
                      style={{ left: `${Math.min(expectedProgress, 100)}%` }}
                      title={`Expected: ${expectedProgress.toFixed(0)}%`}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Expected: {expectedProgress.toFixed(0)}% by now
                  </p>
                </div>
                
                {/* Alerts */}
                <div className="flex flex-wrap gap-2">
                  {mentee.pendingApprovals > 0 && (
                    <Badge variant="warning" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {mentee.pendingApprovals} hours pending approval
                    </Badge>
                  )}
                  {mentee.upcomingReview && (
                    <Badge variant="info" className="text-xs">
                      <Calendar className="h-3 w-3 mr-1" />
                      {mentee.upcomingReview.type.replace('_', ' ')} on {new Date(mentee.upcomingReview.date).toLocaleDateString()}
                    </Badge>
                  )}
                </div>
                
                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" className="flex-1" asChild>
                    <Link href={`/messages?user=${mentee.apprentice.id}`}>
                      <MessageSquare className="h-4 w-4 mr-1" />
                      Message
                    </Link>
                  </Button>
                  {mentee.pendingApprovals > 0 && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => setApprovalPanelOpen(true)}
                    >
                      <FileCheck className="h-4 w-4 mr-1" />
                      Review Hours
                    </Button>
                  )}
                  <Button size="sm" className="flex-1">
                    <Calendar className="h-4 w-4 mr-1" />
                    Schedule 1:1
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      
      {mentees.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Apprentices Assigned</h3>
            <p className="text-muted-foreground">
              You don't have any apprentices assigned to you yet.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
    </>
  )
}
