'use client'

import { useState, useEffect } from 'react'
import {
  Clock,
  Save,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
import { cn } from '@/lib/utils'
import {
  TimesheetEntry,
  TimesheetStatus,
  RetainerWithDetails,
} from '@/types/retainers'
import {
  logTimesheetHours,
  submitTimesheetForApproval,
} from '@/actions/timesheets'
import { format, startOfWeek, addDays } from 'date-fns'

// ==========================================
// STATUS CONFIG
// ==========================================

const STATUS_CONFIG: Record<TimesheetStatus, {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  description: string
}> = {
  draft: { label: 'Draft', variant: 'secondary', description: 'Ready to edit' },
  submitted: { label: 'Submitted', variant: 'default', description: 'Awaiting approval' },
  approved: { label: 'Approved', variant: 'default', description: 'Ready for payment' },
  disputed: { label: 'Disputed', variant: 'destructive', description: 'Needs resolution' },
  paid: { label: 'Paid', variant: 'default', description: 'Payment processed' },
}

// ==========================================
// PROPS
// ==========================================

interface TimesheetFormProps {
  retainer: RetainerWithDetails
  timesheet: TimesheetEntry | null
  role: 'buyer' | 'seller'
  onUpdate?: () => void
}

// ==========================================
// COMPONENT
// ==========================================

export function TimesheetForm({
  retainer,
  timesheet,
  role,
  onUpdate,
}: TimesheetFormProps) {
  const [hours, setHours] = useState(timesheet?.hours_logged?.toString() || '0')
  const [description, setDescription] = useState(timesheet?.description || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showSubmitDialog, setShowSubmitDialog] = useState(false)

  // Update state when timesheet changes
  useEffect(() => {
    if (timesheet) {
      setHours(timesheet.hours_logged?.toString() || '0')
      setDescription(timesheet.description || '')
    }
  }, [timesheet])

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekEnd = addDays(weekStart, 4) // Friday

  const status = timesheet?.status as TimesheetStatus | undefined
  const statusConfig = status ? STATUS_CONFIG[status] : null

  // Calculate progress
  const hoursLogged = parseFloat(hours) || 0
  const maxHours = retainer.weekly_hours
  const progress = Math.min(100, (hoursLogged / maxHours) * 100)

  // Check if editable (only draft status and seller role)
  const isEditable = role === 'seller' && (!status || status === 'draft')

  // Handle save
  const handleSave = async () => {
    if (!timesheet) return

    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const hoursNum = parseFloat(hours)
      if (isNaN(hoursNum) || hoursNum < 0) {
        setError('Please enter a valid number of hours')
        return
      }

      if (hoursNum > maxHours * 1.5) {
        setError(`Hours cannot exceed ${maxHours * 1.5} (150% of commitment)`)
        return
      }

      const { error } = await logTimesheetHours(
        timesheet.id,
        hoursNum,
        description
      )

      if (error) {
        setError(error)
        return
      }

      setSuccess('Timesheet saved')
      onUpdate?.()
    } catch {
      setError('Failed to save timesheet')
    } finally {
      setIsSaving(false)
    }
  }

  // Handle submit
  const handleSubmit = async () => {
    if (!timesheet) return

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      // Save first if there are unsaved changes
      const hoursNum = parseFloat(hours)
      if (hoursNum !== timesheet.hours_logged || description !== timesheet.description) {
        const saveResult = await logTimesheetHours(
          timesheet.id,
          hoursNum,
          description
        )
        if (saveResult.error) {
          setError(saveResult.error)
          setShowSubmitDialog(false)
          return
        }
      }

      const { error } = await submitTimesheetForApproval(timesheet.id)

      if (error) {
        setError(error)
        setShowSubmitDialog(false)
        return
      }

      setSuccess('Timesheet submitted for approval')
      setShowSubmitDialog(false)
      onUpdate?.()
    } catch {
      setError('Failed to submit timesheet')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Weekly Timesheet
              </CardTitle>
              <CardDescription>
                Week of {format(weekStart, 'dd MMM')} - {format(weekEnd, 'dd MMM yyyy')}
              </CardDescription>
            </div>
            {statusConfig && (
              <Badge variant={statusConfig.variant}>
                {statusConfig.label}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Hours Progress</span>
              <span className="font-medium">
                {hoursLogged} / {maxHours} hours
              </span>
            </div>
            <Progress
              value={progress}
              className={cn(
                'h-3',
                progress > 100 && '[&>div]:bg-amber-500'
              )}
            />
            {hoursLogged > maxHours && (
              <p className="text-xs text-amber-600">
                {hoursLogged - maxHours} hours over commitment
              </p>
            )}
          </div>

          {/* Hours Input */}
          <div className="space-y-2">
            <Label htmlFor="hours">Hours Logged</Label>
            <div className="flex items-center gap-2">
              <Input
                id="hours"
                type="number"
                min="0"
                max={maxHours * 1.5}
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                disabled={!isEditable}
                className="w-32"
              />
              <span className="text-muted-foreground">hours</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum: {maxHours * 1.5} hours (150% of weekly commitment)
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Work Description</Label>
            <Textarea
              id="description"
              placeholder="Describe the work completed this week..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!isEditable}
              rows={4}
            />
          </div>

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
          {status === 'submitted' && role === 'seller' && (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertTitle>Awaiting Approval</AlertTitle>
              <AlertDescription>
                Your timesheet has been submitted and is waiting for the buyer to approve.
              </AlertDescription>
            </Alert>
          )}

          {status === 'disputed' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Disputed</AlertTitle>
              <AlertDescription>
                This timesheet has been disputed. Please contact the buyer to resolve.
              </AlertDescription>
            </Alert>
          )}

          {status === 'approved' && (
            <Alert className="border-emerald-200 bg-emerald-50">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <AlertTitle className="text-emerald-800">Approved</AlertTitle>
              <AlertDescription className="text-emerald-700">
                This timesheet has been approved and will be processed for payment.
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          {isEditable && (
            <div className="flex items-center justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={isSaving || isSubmitting}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Draft
                  </>
                )}
              </Button>
              <Button
                onClick={() => setShowSubmitDialog(true)}
                disabled={isSaving || isSubmitting || parseFloat(hours) === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Submit for Approval
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Submitted by info */}
          {timesheet?.submitted_at && (
            <div className="text-sm text-muted-foreground pt-2 border-t">
              Submitted on {format(new Date(timesheet.submitted_at), 'dd MMM yyyy HH:mm')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit Confirmation */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Timesheet?</AlertDialogTitle>
            <AlertDialogDescription>
              You are submitting {hours} hours for the week of{' '}
              {format(weekStart, 'dd MMM')} - {format(weekEnd, 'dd MMM yyyy')}.
              <br /><br />
              Once submitted, the buyer will need to approve before payment is processed.
              You can still make changes if the timesheet is rejected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit} disabled={isSubmitting}>
              Submit Timesheet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default TimesheetForm
