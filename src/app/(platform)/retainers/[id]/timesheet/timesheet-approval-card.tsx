'use client'

import { useState } from 'react'
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { TimesheetEntry, TimesheetStatus, RetainerWithDetails } from '@/types/retainers'
import {
  approveTimesheetSubmission,
  disputeTimesheetSubmission,
} from '@/actions/timesheets'
import { format, parseISO, addDays } from 'date-fns'
import { useRouter } from 'next/navigation'

// ==========================================
// STATUS CONFIG
// ==========================================

const STATUS_CONFIG: Record<TimesheetStatus, {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  icon: typeof Clock
}> = {
  draft: { label: 'Draft', variant: 'secondary', icon: Clock },
  submitted: { label: 'Pending Approval', variant: 'default', icon: Clock },
  approved: { label: 'Approved', variant: 'default', icon: CheckCircle },
  disputed: { label: 'Disputed', variant: 'destructive', icon: AlertCircle },
  paid: { label: 'Paid', variant: 'default', icon: CheckCircle },
}

// ==========================================
// PROPS
// ==========================================

interface TimesheetApprovalCardProps {
  timesheet: TimesheetEntry
  retainer: RetainerWithDetails
}

// ==========================================
// COMPONENT
// ==========================================

export function TimesheetApprovalCard({
  timesheet,
  retainer,
}: TimesheetApprovalCardProps) {
  const router = useRouter()
  const [isApproving, setIsApproving] = useState(false)
  const [isDisputing, setIsDisputing] = useState(false)
  const [showDisputeDialog, setShowDisputeDialog] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const status = timesheet.status as TimesheetStatus
  const statusConfig = STATUS_CONFIG[status]
  const StatusIcon = statusConfig.icon

  const weekStartDate = parseISO(timesheet.week_start)
  const weekEndDate = addDays(weekStartDate, 4)

  // Calculate amounts
  const hoursLogged = timesheet.hours_logged || 0
  const hourlyRate = retainer.hourly_rate
  const amount = hoursLogged * hourlyRate
  const progress = (hoursLogged / retainer.weekly_hours) * 100

  // Handle approve
  const handleApprove = async () => {
    setIsApproving(true)
    setError(null)
    setSuccess(null)

    try {
      const { error } = await approveTimesheetSubmission(timesheet.id)

      if (error) {
        setError(error)
        return
      }

      setSuccess('Timesheet approved successfully')
      router.refresh()
    } catch {
      setError('Failed to approve timesheet')
    } finally {
      setIsApproving(false)
    }
  }

  // Handle dispute
  const handleDispute = async () => {
    if (!disputeReason.trim()) {
      setError('Please provide a reason for the dispute')
      return
    }

    setIsDisputing(true)
    setError(null)
    setSuccess(null)

    try {
      const { error } = await disputeTimesheetSubmission(
        timesheet.id,
        disputeReason
      )

      if (error) {
        setError(error)
        setShowDisputeDialog(false)
        return
      }

      setSuccess('Timesheet disputed')
      setShowDisputeDialog(false)
      router.refresh()
    } catch {
      setError('Failed to dispute timesheet')
    } finally {
      setIsDisputing(false)
    }
  }

  const canTakeAction = status === 'submitted'

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Timesheet Review
              </CardTitle>
              <CardDescription>
                {format(weekStartDate, 'dd MMM')} - {format(weekEndDate, 'dd MMM yyyy')}
              </CardDescription>
            </div>
            <Badge variant={statusConfig.variant} className="gap-1">
              <StatusIcon className="h-3 w-3" />
              {statusConfig.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Hours Summary */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Hours Logged</span>
              <span className="font-medium">
                {hoursLogged} / {retainer.weekly_hours} hours
              </span>
            </div>
            <Progress
              value={Math.min(100, progress)}
              className={cn(
                'h-3',
                progress > 100 && '[&>div]:bg-amber-500'
              )}
            />
            {hoursLogged > retainer.weekly_hours && (
              <p className="text-xs text-amber-600">
                {hoursLogged - retainer.weekly_hours} hours over commitment
              </p>
            )}
          </div>

          {/* Billing Preview */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Hourly Rate</span>
              <span>{retainer.currency} {hourlyRate.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold text-lg">
              <span>Total Amount</span>
              <span>
                {retainer.currency} {amount.toLocaleString('en-GB', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Plus platform fee and VAT
            </p>
          </div>

          {/* Work Description */}
          {timesheet.description && (
            <div>
              <p className="text-sm font-medium mb-2">Work Description</p>
              <div className="p-3 bg-muted/30 rounded-lg text-sm whitespace-pre-wrap">
                {timesheet.description}
              </div>
            </div>
          )}

          {/* Submitted At */}
          {timesheet.submitted_at && (
            <p className="text-sm text-muted-foreground">
              Submitted on {format(new Date(timesheet.submitted_at), 'dd MMM yyyy HH:mm')}
            </p>
          )}

          {/* Error/Success Messages */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-emerald-200 bg-emerald-50">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <AlertTitle className="text-emerald-800">Success</AlertTitle>
              <AlertDescription className="text-emerald-700">{success}</AlertDescription>
            </Alert>
          )}

          {/* Status Messages */}
          {status === 'approved' && (
            <Alert className="border-emerald-200 bg-emerald-50">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <AlertTitle className="text-emerald-800">Approved</AlertTitle>
              <AlertDescription className="text-emerald-700">
                This timesheet has been approved and will be processed for payment.
              </AlertDescription>
            </Alert>
          )}

          {status === 'disputed' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Disputed</AlertTitle>
              <AlertDescription>
                This timesheet is under dispute. Please contact the provider to resolve.
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          {canTakeAction && (
            <div className="flex items-center justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setShowDisputeDialog(true)}
                disabled={isApproving || isDisputing}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Dispute
              </Button>
              <Button
                onClick={handleApprove}
                disabled={isApproving || isDisputing}
              >
                {isApproving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Approving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve Timesheet
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dispute Dialog */}
      <AlertDialog open={showDisputeDialog} onOpenChange={setShowDisputeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dispute Timesheet</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for disputing this timesheet. The provider
              will be notified and can revise their submission.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="dispute-reason">Reason for Dispute</Label>
            <Textarea
              id="dispute-reason"
              placeholder="Explain why you're disputing this timesheet..."
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              rows={4}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDispute}
              disabled={isDisputing || !disputeReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDisputing ? 'Submitting...' : 'Submit Dispute'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
