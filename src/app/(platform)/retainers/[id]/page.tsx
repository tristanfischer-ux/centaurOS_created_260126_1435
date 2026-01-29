import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Clock,
  Calendar,
  DollarSign,
  TrendingUp,
  User,
  Settings,
  Pause,
  Play,
  XCircle,
  MessageSquare,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { TimesheetHistory, WeeklyBillingSummary } from '@/components/retainers'
import { createClient } from '@/lib/supabase/server'
import {
  getRetainerDetail,
  getRetainerStatistics,
} from '@/actions/retainers'
import { getCurrentTimesheet, getTimesheetHistoryAction } from '@/actions/timesheets'
import { RetainerStatus, CANCELLATION_NOTICE_DAYS } from '@/types/retainers'
import { format } from 'date-fns'

// ==========================================
// METADATA
// ==========================================

export const metadata: Metadata = {
  title: 'Retainer Details | CentaurOS',
  description: 'View retainer agreement details',
}

// ==========================================
// STATUS CONFIG
// ==========================================

const STATUS_CONFIG: Record<RetainerStatus, {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  color: string
}> = {
  pending: { label: 'Pending Approval', variant: 'secondary', color: 'bg-amber-500' },
  active: { label: 'Active', variant: 'default', color: 'bg-emerald-500' },
  paused: { label: 'Paused', variant: 'secondary', color: 'bg-gray-400' },
  cancelled: { label: 'Cancelled', variant: 'destructive', color: 'bg-red-500' },
}

// ==========================================
// PAGE PROPS
// ==========================================

interface RetainerDetailPageProps {
  params: Promise<{
    id: string
  }>
}

// ==========================================
// PAGE COMPONENT
// ==========================================

export default async function RetainerDetailPage({ params }: RetainerDetailPageProps) {
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

  // Get other party info
  const otherParty = isBuyer
    ? {
        name: retainer.seller?.profile?.full_name || 'Provider',
        avatar: retainer.seller?.profile?.avatar_url,
        label: 'Provider',
      }
    : {
        name: retainer.buyer?.full_name || 'Client',
        avatar: retainer.buyer?.avatar_url,
        label: 'Client',
      }

  // Get stats and timesheet data
  const [statsResult, timesheetResult, historyResult] = await Promise.all([
    getRetainerStatistics(id),
    getCurrentTimesheet(id),
    getTimesheetHistoryAction(id, 5),
  ])

  const stats = statsResult.data
  const currentTimesheet = timesheetResult.data
  const timesheetHistory = historyResult.data

  const statusConfig = STATUS_CONFIG[retainer.status as RetainerStatus]

  return (
    <div className="container max-w-4xl py-8">
      {/* Back Button */}
      <Button variant="ghost" className="mb-6" asChild>
        <Link href="/retainers">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Retainers
        </Link>
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={otherParty.avatar} alt={otherParty.name} />
            <AvatarFallback>
              <User className="h-8 w-8" />
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">{otherParty.name}</h1>
            <p className="text-muted-foreground">{otherParty.label}</p>
            <div className="flex items-center gap-2 mt-2">
              <div className={`h-2 w-2 rounded-full ${statusConfig.color}`} />
              <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" asChild>
            <Link href={`/retainers/${id}/timesheet`}>
              <Clock className="h-4 w-4 mr-2" />
              Timesheet
            </Link>
          </Button>
          <Button variant="secondary" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-sm">This Week</span>
              </div>
              <p className="text-2xl font-bold">
                {stats.totalHoursThisWeek} / {stats.weeklyCommitment}
              </p>
              <p className="text-xs text-muted-foreground">hours logged</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Calendar className="h-4 w-4" />
                <span className="text-sm">This Month</span>
              </div>
              <p className="text-2xl font-bold">{stats.totalHoursThisMonth}</p>
              <p className="text-xs text-muted-foreground">hours logged</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                <span className="text-sm">{isBuyer ? 'Total Spend' : 'Total Earned'}</span>
              </div>
              <p className="text-2xl font-bold">
                {stats.currency} {(isBuyer ? stats.totalSpend : stats.totalEarnings).toFixed(0)}
              </p>
              <p className="text-xs text-muted-foreground">all time</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm">Avg Hours</span>
              </div>
              <p className="text-2xl font-bold">
                {stats.averageHoursPerWeek.toFixed(1)}
              </p>
              <p className="text-xs text-muted-foreground">per week</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Agreement Details */}
          <Card>
            <CardHeader>
              <CardTitle>Agreement Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Weekly Hours</p>
                  <p className="font-semibold">{retainer.weekly_hours} hours</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Hourly Rate</p>
                  <p className="font-semibold">
                    {retainer.currency} {retainer.hourly_rate.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Weekly Value</p>
                  <p className="font-semibold">
                    {retainer.currency}{' '}
                    {(retainer.weekly_hours * retainer.hourly_rate).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Start Date</p>
                  <p className="font-semibold">
                    {retainer.started_at
                      ? format(new Date(retainer.started_at), 'dd MMM yyyy')
                      : 'Not started'}
                  </p>
                </div>
              </div>

              {retainer.status === 'cancelled' && retainer.cancellation_effective && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Cancelled</AlertTitle>
                  <AlertDescription>
                    This retainer ends on{' '}
                    {format(new Date(retainer.cancellation_effective), 'dd MMM yyyy')}
                  </AlertDescription>
                </Alert>
              )}

              {stats && retainer.status === 'active' && (
                <div className="pt-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Weekly Progress</span>
                    <span>
                      {stats.totalHoursThisWeek} / {stats.weeklyCommitment} hours
                    </span>
                  </div>
                  <Progress
                    value={Math.min(100, (stats.totalHoursThisWeek / stats.weeklyCommitment) * 100)}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timesheet History */}
          {timesheetHistory.length > 0 && (
            <TimesheetHistory
              timesheets={timesheetHistory}
              hourlyRate={retainer.hourly_rate}
              currency={retainer.currency}
            />
          )}
        </div>

        {/* Right Column - Current Timesheet & Billing */}
        <div className="space-y-6">
          {/* Current Week's Billing */}
          {currentTimesheet && (
            <WeeklyBillingSummary timesheetId={currentTimesheet.id} />
          )}

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full justify-start" variant="secondary" asChild>
                <Link href={`/retainers/${id}/timesheet`}>
                  <Clock className="h-4 w-4 mr-2" />
                  {role === 'seller' ? 'Log Hours' : 'View Timesheet'}
                </Link>
              </Button>
              <Button className="w-full justify-start" variant="secondary">
                <MessageSquare className="h-4 w-4 mr-2" />
                Message
              </Button>
              <Separator className="my-4" />
              {retainer.status === 'active' && (
                <Button className="w-full justify-start" variant="secondary">
                  <Pause className="h-4 w-4 mr-2" />
                  Pause Retainer
                </Button>
              )}
              {retainer.status === 'paused' && (
                <Button className="w-full justify-start" variant="secondary">
                  <Play className="h-4 w-4 mr-2" />
                  Resume Retainer
                </Button>
              )}
              {['active', 'paused'].includes(retainer.status) && (
                <Button className="w-full justify-start text-destructive" variant="secondary">
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel Retainer
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Terms Reminder */}
          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                <strong>Remember:</strong> Retainer agreements require{' '}
                {CANCELLATION_NOTICE_DAYS} days notice for cancellation.
                Billing is weekly in arrears.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
