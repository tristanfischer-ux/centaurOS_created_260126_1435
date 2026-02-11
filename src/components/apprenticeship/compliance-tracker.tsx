'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { UserAvatar } from '@/components/ui/user-avatar'
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  TrendingUp,
  Calendar,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ApprenticeReport {
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
}

interface ComplianceReport {
  summary: {
    totalApprentices: number
    onTrack: number
    atRisk: number
    documentsPending: number
    totalOTJTHours: number
    averageProgress: number
  }
  apprentices: ApprenticeReport[]
}

interface ComplianceTrackerProps {
  report: ComplianceReport
}

/**
 * ESFA compliance dashboard for apprenticeship administrators.
 *
 * @description Provides a regulatory-compliance view of all apprentices,
 * showing document status, OTJT tracking, review schedules, and an
 * overall ESFA requirements checklist. Uses data from the existing
 * `generateComplianceReport` server action.
 */
export function ComplianceTracker({ report }: ComplianceTrackerProps) {
  const { summary, apprentices } = report

  // Calculate ESFA checklist items
  const allAgreementsSigned = apprentices.every((a) => a.documents.agreementSigned)
  const allCommitmentsSigned = apprentices.every((a) => a.documents.commitmentSigned)
  const allTrainingPlans = apprentices.every((a) => a.documents.trainingPlanApproved)
  const allOnTrack = apprentices.every((a) => a.otjt.onTrack)
  const allHaveReviews = apprentices.every((a) => a.reviewsInPeriod > 0)
  const fullyCompliant = apprentices.filter(
    (a) =>
      a.documents.agreementSigned &&
      a.documents.commitmentSigned &&
      a.documents.trainingPlanApproved &&
      a.otjt.onTrack
  ).length

  const checklistItems = [
    {
      label: 'All apprentices have signed Apprenticeship Agreements',
      passed: allAgreementsSigned,
    },
    {
      label: 'All apprentices have signed Commitment Statements',
      passed: allCommitmentsSigned,
    },
    {
      label: 'Training Plans approved for all active apprentices',
      passed: allTrainingPlans,
    },
    {
      label: 'Minimum 20% OTJT maintained for all apprentices',
      passed: allOnTrack,
    },
    {
      label: 'Progress reviews conducted in reporting period',
      passed: allHaveReviews,
    },
  ]

  const passedCount = checklistItems.filter((c) => c.passed).length

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-status-success-light rounded-lg">
                <ShieldCheck className="h-5 w-5 text-status-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{fullyCompliant}/{summary.totalApprentices}</p>
                <p className="text-xs text-muted-foreground">Fully Compliant</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-status-warning-light rounded-lg">
                <AlertTriangle className="h-5 w-5 text-status-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.atRisk}</p>
                <p className="text-xs text-muted-foreground">At Risk (OTJT)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-muted rounded-lg">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.documentsPending}</p>
                <p className="text-xs text-muted-foreground">Documents Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-electric-blue-light rounded-lg">
                <TrendingUp className="h-5 w-5 text-electric-blue" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.averageProgress}%</p>
                <p className="text-xs text-muted-foreground">Avg Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ESFA Requirements Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-international-orange" />
            ESFA Requirements Checklist
            <Badge variant={passedCount === checklistItems.length ? 'success' : 'warning'} className="ml-auto">
              {passedCount}/{checklistItems.length} met
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {checklistItems.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                {item.passed ? (
                  <CheckCircle2 className="h-5 w-5 text-status-success shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive shrink-0" />
                )}
                <span
                  className={cn(
                    'text-sm',
                    item.passed ? 'text-foreground' : 'text-destructive font-medium'
                  )}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Per-Apprentice Compliance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Apprentice Compliance Detail
          </CardTitle>
        </CardHeader>
        <CardContent>
          {apprentices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No active apprentices to report on.
            </p>
          ) : (
            <div className="space-y-4">
              {apprentices.map((apprentice) => {
                const docsComplete =
                  apprentice.documents.agreementSigned &&
                  apprentice.documents.commitmentSigned &&
                  apprentice.documents.trainingPlanApproved
                const isCompliant = docsComplete && apprentice.otjt.onTrack

                return (
                  <div
                    key={apprentice.email}
                    className={cn(
                      'p-4 rounded-lg border',
                      !isCompliant && 'border-l-4 border-l-status-warning'
                    )}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      {/* Name & Programme */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <UserAvatar name={apprentice.name} role="Apprentice" size="md" />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {apprentice.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {apprentice.programme} · L{apprentice.level}
                          </p>
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={apprentice.otjt.onTrack ? 'success' : 'warning'}>
                          <Clock className="h-3 w-3 mr-1" />
                          OTJT {apprentice.otjt.progress}%
                        </Badge>

                        <Badge variant={docsComplete ? 'success' : 'destructive'}>
                          <FileText className="h-3 w-3 mr-1" />
                          {docsComplete ? 'Docs OK' : 'Docs Missing'}
                        </Badge>

                        <Badge variant={apprentice.reviewsInPeriod > 0 ? 'success' : 'secondary'}>
                          <Calendar className="h-3 w-3 mr-1" />
                          {apprentice.reviewsInPeriod} review{apprentice.reviewsInPeriod !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>
                          OTJT: {apprentice.otjt.logged ?? 0}/{apprentice.otjt.target} hours
                        </span>
                        <span>Expected: {apprentice.otjt.expectedProgress}%</span>
                      </div>
                      <div className="relative">
                        <Progress value={apprentice.otjt.progress} className="h-2" />
                        <div
                          className="absolute top-0 w-0.5 h-2 bg-foreground/40"
                          style={{
                            left: `${Math.min(apprentice.otjt.expectedProgress, 100)}%`,
                          }}
                          title={`Expected: ${apprentice.otjt.expectedProgress}%`}
                        />
                      </div>
                    </div>

                    {/* Document Detail (only if incomplete) */}
                    {!docsComplete && (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {!apprentice.documents.agreementSigned && (
                          <span className="text-destructive">Agreement unsigned</span>
                        )}
                        {!apprentice.documents.commitmentSigned && (
                          <span className="text-destructive">Commitment unsigned</span>
                        )}
                        {!apprentice.documents.trainingPlanApproved && (
                          <span className="text-destructive">Training plan not approved</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
