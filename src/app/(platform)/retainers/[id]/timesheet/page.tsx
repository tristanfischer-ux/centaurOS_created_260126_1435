import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { TimesheetForm, TimesheetHistory, WeeklyBillingSummary } from '@/components/retainers'
import { TimesheetApprovalCard } from './timesheet-approval-card'
import { createClient } from '@/lib/supabase/server'
import { getRetainerDetail } from '@/actions/retainers'
import { getCurrentTimesheet, getTimesheetHistoryAction } from '@/actions/timesheets'
import { TimesheetStatus } from '@/types/retainers'
import { format, startOfWeek, addDays } from 'date-fns'

// ==========================================
// METADATA
// ==========================================

export const metadata: Metadata = {
  title: 'Timesheet | CentaurOS',
  description: 'Manage weekly timesheet',
}

// ==========================================
// PAGE PROPS
// ==========================================

interface TimesheetPageProps {
  params: Promise<{
    id: string
  }>
}

// ==========================================
// PAGE COMPONENT
// ==========================================

export default async function TimesheetPage({ params }: TimesheetPageProps) {
  const { id } = await params

  // Get current user
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    notFound()
  }

  // Get retainer details
  const { data: retainer, error } = await getRetainerDetail(id)

  if (error || !retainer) {
    notFound()
  }

  // Determine user's role
  const isBuyer = retainer.buyer_id === user.id
  const role = isBuyer ? 'buyer' : 'seller'

  // Get timesheet data
  const [timesheetResult, historyResult] = await Promise.all([
    getCurrentTimesheet(id),
    getTimesheetHistoryAction(id, 10),
  ])

  const currentTimesheet = timesheetResult.data
  const timesheetHistory = historyResult.data

  // Week dates
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekEnd = addDays(weekStart, 4)

  // Status info
  const getStatusInfo = (status?: TimesheetStatus) => {
    switch (status) {
      case 'draft':
        return { icon: Clock, text: 'Draft - Not yet submitted', variant: 'secondary' as const }
      case 'submitted':
        return { icon: Clock, text: 'Submitted - Awaiting approval', variant: 'default' as const }
      case 'approved':
        return { icon: CheckCircle, text: 'Approved - Payment pending', variant: 'default' as const }
      case 'disputed':
        return { icon: AlertCircle, text: 'Disputed - Needs resolution', variant: 'destructive' as const }
      case 'paid':
        return { icon: CheckCircle, text: 'Paid', variant: 'default' as const }
      default:
        return { icon: Clock, text: 'No timesheet', variant: 'secondary' as const }
    }
  }

  const statusInfo = getStatusInfo(currentTimesheet?.status as TimesheetStatus)
  const StatusIcon = statusInfo.icon

  return (
    <div className="container max-w-4xl py-8">
      {/* Back Button */}
      <Button variant="ghost" className="mb-6" asChild>
        <Link href={`/retainers/${id}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Retainer
        </Link>
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Weekly Timesheet</h1>
          <p className="text-muted-foreground mt-1">
            Week of {format(weekStart, 'dd MMM')} - {format(weekEnd, 'dd MMM yyyy')}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <StatusIcon className="h-4 w-4" />
            <Badge variant={statusInfo.variant}>{statusInfo.text}</Badge>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Commitment</p>
          <p className="text-xl font-bold">{retainer.weekly_hours} hrs/week</p>
          <p className="text-sm text-muted-foreground">
            @ {retainer.currency} {retainer.hourly_rate.toFixed(2)}/hr
          </p>
        </div>
      </div>

      {/* Retainer Not Active Warning */}
      {retainer.status !== 'active' && (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Retainer Not Active</AlertTitle>
          <AlertDescription>
            This retainer is currently {retainer.status}. 
            {retainer.status === 'pending' && ' It needs to be accepted before timesheets can be submitted.'}
            {retainer.status === 'paused' && ' Resume the retainer to continue logging hours.'}
            {retainer.status === 'cancelled' && ' No new timesheets can be created.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Timesheet Form or Approval */}
        <div className="lg:col-span-2 space-y-6">
          {role === 'seller' ? (
            // Provider view - Edit timesheet
            <TimesheetForm
              retainer={retainer}
              timesheet={currentTimesheet}
              role="seller"
            />
          ) : (
            // Buyer view - Approve timesheet
            currentTimesheet ? (
              <TimesheetApprovalCard
                timesheet={currentTimesheet}
                retainer={retainer}
              />
            ) : (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No timesheet submitted for this week yet</p>
                    <p className="text-sm mt-2">
                      The provider hasn&apos;t submitted their hours for approval
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          )}

          {/* History */}
          {timesheetHistory.length > 0 && (
            <TimesheetHistory
              timesheets={timesheetHistory}
              hourlyRate={retainer.hourly_rate}
              currency={retainer.currency}
            />
          )}
        </div>

        {/* Right Column - Billing */}
        <div className="space-y-6">
          {currentTimesheet && (
            <WeeklyBillingSummary timesheetId={currentTimesheet.id} />
          )}

          {/* Help Card */}
          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle className="text-sm">How Timesheet Billing Works</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>1. Provider logs hours throughout the week</p>
              <p>2. Provider submits timesheet for approval</p>
              <p>3. Buyer reviews and approves or disputes</p>
              <p>4. Approved timesheets are billed weekly</p>
              <p>5. Payment is processed automatically</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
