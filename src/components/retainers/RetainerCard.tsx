'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Clock,
  Calendar,
  User,
  Play,
  Pause,
  XCircle,
  MoreHorizontal,
  ArrowRight,
  CheckCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import {
  RetainerWithDetails,
  RetainerStatus,
  RetainerStats,
} from '@/types/retainers'
import {
  pauseRetainerAgreement,
  resumeRetainerAgreement,
  acceptRetainerAgreement,
} from '@/actions/retainers'
import { format } from 'date-fns'

// ==========================================
// STATUS CONFIG
// ==========================================

const STATUS_CONFIG: Record<RetainerStatus, {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  icon: typeof Clock
}> = {
  pending: { label: 'Pending', variant: 'secondary', icon: Clock },
  active: { label: 'Active', variant: 'default', icon: CheckCircle },
  paused: { label: 'Paused', variant: 'secondary', icon: Pause },
  cancelled: { label: 'Cancelled', variant: 'destructive', icon: XCircle },
}

// ==========================================
// PROPS
// ==========================================

interface RetainerCardProps {
  retainer: RetainerWithDetails
  stats?: RetainerStats | null
  role: 'buyer' | 'seller'
  compact?: boolean
  onStatusChange?: () => void
}

// ==========================================
// COMPONENT
// ==========================================

export function RetainerCard({
  retainer,
  stats,
  role,
  compact = false,
  onStatusChange,
}: RetainerCardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'pause' | 'resume' | 'accept' | null>(null)

  const statusConfig = STATUS_CONFIG[retainer.status as RetainerStatus]
  const StatusIcon = statusConfig.icon

  // Get the other party's info based on role
  const otherParty = role === 'buyer'
    ? {
        name: retainer.seller?.profile?.full_name || 'Provider',
        avatar: retainer.seller?.profile?.avatar_url,
      }
    : {
        name: retainer.buyer?.full_name || 'Client',
        avatar: retainer.buyer?.avatar_url,
      }

  // Calculate hours progress
  const hoursProgress = stats
    ? Math.min(100, (stats.totalHoursThisWeek / stats.weeklyCommitment) * 100)
    : 0

  // Handle actions
  const handleAction = async (action: 'pause' | 'resume' | 'accept') => {
    setIsLoading(true)
    try {
      let result
      switch (action) {
        case 'pause':
          result = await pauseRetainerAgreement(retainer.id)
          break
        case 'resume':
          result = await resumeRetainerAgreement(retainer.id)
          break
        case 'accept':
          result = await acceptRetainerAgreement(retainer.id)
          break
      }

      if (result.success && onStatusChange) {
        onStatusChange()
      }
    } finally {
      setIsLoading(false)
      setConfirmAction(null)
    }
  }

  // Compact view
  if (compact) {
    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={otherParty.avatar} alt={otherParty.name} />
                <AvatarFallback>
                  <User className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{otherParty.name}</p>
                <p className="text-sm text-muted-foreground">
                  {retainer.weekly_hours} hrs/week @ {retainer.currency} {retainer.hourly_rate}/hr
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={statusConfig.variant}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusConfig.label}
              </Badge>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/retainers/${retainer.id}`}>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={otherParty.avatar} alt={otherParty.name} />
                <AvatarFallback>
                  <User className="h-6 w-6" />
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-lg">{otherParty.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {role === 'buyer' ? 'Provider' : 'Client'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={statusConfig.variant}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusConfig.label}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/retainers/${retainer.id}`}>
                      View Details
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/retainers/${retainer.id}/timesheet`}>
                      View Timesheet
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {retainer.status === 'pending' && role === 'seller' && (
                    <DropdownMenuItem onClick={() => setConfirmAction('accept')}>
                      <Play className="h-4 w-4 mr-2" />
                      Accept Retainer
                    </DropdownMenuItem>
                  )}
                  {retainer.status === 'active' && (
                    <DropdownMenuItem onClick={() => setConfirmAction('pause')}>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause Retainer
                    </DropdownMenuItem>
                  )}
                  {retainer.status === 'paused' && (
                    <DropdownMenuItem onClick={() => setConfirmAction('resume')}>
                      <Play className="h-4 w-4 mr-2" />
                      Resume Retainer
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Rate Info */}
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
          </div>

          {/* Hours Progress */}
          {stats && retainer.status === 'active' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">This Week</span>
                <span className="font-medium">
                  {stats.totalHoursThisWeek} / {stats.weeklyCommitment} hrs
                </span>
              </div>
              <Progress value={hoursProgress} className="h-2" />
              {stats.hoursRemaining > 0 && (
                <p className="text-xs text-muted-foreground">
                  {stats.hoursRemaining} hours remaining this week
                </p>
              )}
            </div>
          )}

          {/* Dates */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>
                Started{' '}
                {retainer.started_at
                  ? format(new Date(retainer.started_at), 'dd MMM yyyy')
                  : 'Not started'}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/retainers/${retainer.id}/timesheet`}>
                <Clock className="h-4 w-4 mr-2" />
                Timesheet
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href={`/retainers/${retainer.id}`}>
                View Details
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialogs */}
      <AlertDialog open={confirmAction !== null} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'pause' && 'Pause Retainer?'}
              {confirmAction === 'resume' && 'Resume Retainer?'}
              {confirmAction === 'accept' && 'Accept Retainer?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'pause' &&
                'Pausing will stop new work from being logged. You can resume at any time.'}
              {confirmAction === 'resume' &&
                'Resuming will allow work to be logged again.'}
              {confirmAction === 'accept' &&
                'Accepting will activate this retainer agreement and allow you to start logging hours.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && handleAction(confirmAction)}
              disabled={isLoading}
            >
              {isLoading ? 'Processing...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default RetainerCard
