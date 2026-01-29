'use client'

import { useState, useEffect, memo } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
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
          <span className="text-xs text-amber-600">
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
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
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
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center animate-pulse">
              <Zap className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="font-semibold text-emerald-700">Race Open</div>
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
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Zap className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="font-semibold text-emerald-700">Race Active</div>
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
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Lock className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-amber-700">Priority Hold</div>
              <div className="text-sm text-muted-foreground">
                {priorityHolderName || 'A supplier'} has first right of refusal
              </div>
            </div>
          </div>

          {holdTimeLeft && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Time remaining</span>
                <span className="font-medium text-amber-700">{holdTimeLeft}</span>
              </div>
              <Progress value={holdProgress} className="h-2" />
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
            <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
              <Award className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <div className="font-semibold text-violet-700">Awarded</div>
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
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <div className="font-semibold text-gray-700">Closed</div>
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
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <Ban className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <div className="font-semibold text-red-700">Cancelled</div>
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
  const config: Record<RFQStatus, { label: string; color: string; Icon: typeof Clock }> = {
    'Open': { label: 'Open', color: 'bg-blue-50 text-blue-700 border-blue-200', Icon: Clock },
    'Bidding': { label: 'Bidding', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: Zap },
    'priority_hold': { label: 'Priority Hold', color: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Lock },
    'Awarded': { label: 'Awarded', color: 'bg-violet-50 text-violet-700 border-violet-200', Icon: Award },
    'Closed': { label: 'Closed', color: 'bg-gray-50 text-gray-700 border-gray-200', Icon: CheckCircle2 },
    'cancelled': { label: 'Cancelled', color: 'bg-red-50 text-red-700 border-red-200', Icon: Ban },
  }

  const { label, color, Icon } = config[status] || config['Open']

  return (
    <Badge variant="outline" className={cn('text-xs', color, className)}>
      <Icon className="w-3 h-3 mr-1" />
      {label}
    </Badge>
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
      <div className={cn('flex items-center gap-2 text-emerald-600', className)}>
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
