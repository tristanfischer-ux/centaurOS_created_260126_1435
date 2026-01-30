'use client'

import { useState, useEffect, memo } from 'react'
import { cn } from '@/lib/utils'
import { StatusBadge as StatusBadgeComponent } from '@/components/ui/status-badge'
import { Progress } from '@/components/ui/progress'
import {
  Clock,
  Zap,
  Award,
  Lock,
  Ban,
  CheckCircle2,
} from 'lucide-react'
import { RFQStatus } from '@/types/rfq'
import { formatDuration, getTimeUntilRaceOpens } from '@/lib/rfq/timezone-scheduling'

interface RaceStatusIndicatorProps {
  status: RFQStatus
  raceOpensAt: string | null
  priorityHolderName?: string | null
  priorityHoldExpiresAt?: string | null
  winnerName?: string | null
  responseCount?: number
  className?: string
  compact?: boolean
}

export const RaceStatusIndicator = memo(function RaceStatusIndicator({
  status,
  raceOpensAt,
  priorityHolderName,
  priorityHoldExpiresAt,
  winnerName,
  responseCount = 0,
  className,
  compact = false,
}: RaceStatusIndicatorProps) {
  const [timeUntilOpen, setTimeUntilOpen] = useState<string | null>(null)
  const [holdTimeLeft, setHoldTimeLeft] = useState<string | null>(null)
  const [holdProgress, setHoldProgress] = useState(100)

  // Update countdown timers
  useEffect(() => {
    const updateTimers = () => {
      // Race open countdown
      if (raceOpensAt) {
        const { isOpen, formattedTime } = getTimeUntilRaceOpens(raceOpensAt)
        setTimeUntilOpen(isOpen ? null : formattedTime)
      }

      // Priority hold countdown
      if (priorityHoldExpiresAt) {
        const expiresAt = new Date(priorityHoldExpiresAt)
        const now = new Date()
        const diff = expiresAt.getTime() - now.getTime()

        if (diff > 0) {
          setHoldTimeLeft(formatDuration(diff))
          // Assuming 2 hour hold (7200000ms)
          const totalHoldTime = 2 * 60 * 60 * 1000
          setHoldProgress((diff / totalHoldTime) * 100)
        } else {
          setHoldTimeLeft(null)
          setHoldProgress(0)
        }
      }
    }

    updateTimers()
    const interval = setInterval(updateTimers, 1000)
    return () => clearInterval(interval)
  }, [raceOpensAt, priorityHoldExpiresAt])

  // Compact version for cards
  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <StatusBadge status={status} />
        {timeUntilOpen && status === 'Open' && (
          <span className="text-xs text-muted-foreground">
            Opens in {timeUntilOpen}
          </span>
        )}
        {holdTimeLeft && status === 'priority_hold' && (
          <span className="text-xs text-status-warning">
            {holdTimeLeft} left
          </span>
        )}
      </div>
    )
  }

  // Full version with details
  return (
    <div className={cn('p-4 rounded-lg border', className)}>
      {/* Scheduled - Race not yet open */}
      {status === 'Open' && timeUntilOpen && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-status-info-light flex items-center justify-center">
              <Clock className="w-5 h-5 text-status-info" />
            </div>
            <div>
              <div className="font-semibold">Race Scheduled</div>
              <div className="text-sm text-muted-foreground">
                Opens in {timeUntilOpen}
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Suppliers will be notified at 9am in their local timezone.
          </p>
        </div>
      )}

      {/* Open - Race is live */}
      {status === 'Open' && !timeUntilOpen && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-status-success-light flex items-center justify-center animate-pulse">
              <Zap className="w-5 h-5 text-status-success" />
            </div>
            <div>
              <div className="font-semibold text-status-success">Race Open</div>
              <div className="text-sm text-muted-foreground">
                Suppliers can now respond
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bidding - Active responses */}
      {status === 'Bidding' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-status-success-light flex items-center justify-center">
              <Zap className="w-5 h-5 text-status-success" />
            </div>
            <div>
              <div className="font-semibold text-status-success">Race Active</div>
              <div className="text-sm text-muted-foreground">
                {responseCount} {responseCount === 1 ? 'response' : 'responses'} received
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Priority Hold */}
      {status === 'priority_hold' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-status-warning-light flex items-center justify-center">
              <Lock className="w-5 h-5 text-status-warning" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-status-warning">Priority Hold</div>
              <div className="text-sm text-muted-foreground">
                {priorityHolderName || 'A supplier'} has first right of refusal
              </div>
            </div>
          </div>

          {holdTimeLeft && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Time remaining</span>
                <span className="font-medium text-status-warning">{holdTimeLeft}</span>
              </div>
              <Progress value={holdProgress} className="h-2 [&>div]:bg-status-warning" />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            The buyer will confirm or release this hold. Other suppliers can still place bids.
          </p>
        </div>
      )}

      {/* Awarded */}
      {status === 'Awarded' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-status-success-light flex items-center justify-center">
              <Award className="w-5 h-5 text-status-success" />
            </div>
            <div>
              <div className="font-semibold text-status-success">Awarded</div>
              <div className="text-sm text-muted-foreground">
                {winnerName ? `Awarded to ${winnerName}` : 'This RFQ has been awarded'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Closed */}
      {status === 'Closed' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <div className="font-semibold text-muted-foreground">Closed</div>
              <div className="text-sm text-muted-foreground">
                No longer accepting responses
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancelled */}
      {status === 'cancelled' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-status-error-light flex items-center justify-center">
              <Ban className="w-5 h-5 text-status-error" />
            </div>
            <div>
              <div className="font-semibold text-status-error">Cancelled</div>
              <div className="text-sm text-muted-foreground">
                This RFQ has been cancelled
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

// Status badge sub-component
interface StatusBadgeProps {
  status: RFQStatus
  className?: string
}

function StatusBadge({ status, className }: StatusBadgeProps) {
  const config: Record<RFQStatus, { label: string; status: 'info' | 'success' | 'warning' | 'error' | 'default'; Icon: typeof Clock }> = {
    'Open': { label: 'Open', status: 'info', Icon: Clock },
    'Bidding': { label: 'Bidding', status: 'success', Icon: Zap },
    'priority_hold': { label: 'Priority Hold', status: 'warning', Icon: Lock },
    'Awarded': { label: 'Awarded', status: 'success', Icon: Award },
    'Closed': { label: 'Closed', status: 'default', Icon: CheckCircle2 },
    'cancelled': { label: 'Cancelled', status: 'error', Icon: Ban },
  }

  const { label, status: badgeStatus, Icon } = config[status] || config['Open']

  return (
    <StatusBadgeComponent status={badgeStatus} size="sm" className={className}>
      <Icon className="w-3 h-3 mr-1" />
      {label}
    </StatusBadgeComponent>
  )
}

// Countdown component for race opening
interface RaceCountdownProps {
  raceOpensAt: string
  className?: string
}

export function RaceCountdown({ raceOpensAt, className }: RaceCountdownProps) {
  const [countdown, setCountdown] = useState<string | null>(null)

  useEffect(() => {
    const updateCountdown = () => {
      const { isOpen, formattedTime } = getTimeUntilRaceOpens(raceOpensAt)
      setCountdown(isOpen ? null : formattedTime)
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [raceOpensAt])

  if (!countdown) {
    return (
      <div className={cn('flex items-center gap-2 text-status-success', className)}>
        <Zap className="w-4 h-4" />
        <span className="font-medium">Race is open!</span>
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Clock className="w-4 h-4 text-muted-foreground" />
      <span className="text-muted-foreground">
        Race opens in <span className="font-medium text-foreground">{countdown}</span>
      </span>
    </div>
  )
}
