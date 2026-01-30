'use client'

import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { 
  type PresenceStatus, 
  type UserPresence,
  getPresenceColor, 
  getPresenceLabel, 
  formatLastSeen 
} from '@/hooks/usePresence'
import { Clock, Target, MapPin } from 'lucide-react'

// Re-export for convenience
export { getPresenceColor, getPresenceLabel, formatLastSeen }
export type { PresenceStatus, UserPresence }

interface PresenceIndicatorProps {
  status: PresenceStatus
  size?: 'sm' | 'md' | 'lg'
  showTooltip?: boolean
  presence?: UserPresence | null
  taskTitle?: string
  className?: string
}

const sizeClasses = {
  sm: 'h-2 w-2',
  md: 'h-3 w-3',
  lg: 'h-4 w-4'
}

const positionClasses = {
  sm: '-bottom-0 -right-0',
  md: '-bottom-0.5 -right-0.5',
  lg: '-bottom-1 -right-1'
}

export function PresenceIndicator({
  status,
  size = 'md',
  showTooltip = true,
  presence,
  taskTitle,
  className
}: PresenceIndicatorProps) {
  const indicator = (
    <span
      className={cn(
        'absolute rounded-full ring-2 ring-white',
        sizeClasses[size],
        positionClasses[size],
        getPresenceColor(status),
        status === 'focus' && 'animate-pulse',
        className
      )}
      aria-label={getPresenceLabel(status)}
    />
  )

  if (!showTooltip) {
    return indicator
  }

  // Format timezone for display
  const formatTimezone = (tz: string | null) => {
    if (!tz) return null
    try {
      const now = new Date()
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
      return formatter.format(now)
    } catch {
      return null
    }
  }

  const localTime = presence?.timezone ? formatTimezone(presence.timezone) : null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {indicator}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full', getPresenceColor(status))} />
            <span className="font-medium">{getPresenceLabel(status)}</span>
          </div>
          
          {presence?.status_message && (
            <p className="text-xs text-muted-foreground italic">
              "{presence.status_message}"
            </p>
          )}
          
          {taskTitle && status !== 'offline' && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Target className="h-3 w-3" />
              <span className="truncate">Working on: {taskTitle}</span>
            </div>
          )}
          
          {localTime && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Local time: {localTime}</span>
            </div>
          )}
          
          {presence?.timezone && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{presence.timezone.replace(/_/g, ' ')}</span>
            </div>
          )}
          
          {presence?.last_seen && status !== 'online' && (
            <p className="text-xs text-muted-foreground">
              Last seen: {formatLastSeen(presence.last_seen)}
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

// Avatar wrapper that includes presence indicator
interface AvatarWithPresenceProps {
  children: React.ReactNode
  status?: PresenceStatus
  presence?: UserPresence | null
  taskTitle?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function AvatarWithPresence({
  children,
  status = 'offline',
  presence,
  taskTitle,
  size = 'md',
  className
}: AvatarWithPresenceProps) {
  return (
    <div className={cn('relative inline-block', className)}>
      {children}
      <PresenceIndicator 
        status={status} 
        size={size}
        presence={presence}
        taskTitle={taskTitle}
      />
    </div>
  )
}

// Compact presence list for dashboard
interface PresenceListProps {
  presences: (UserPresence & { full_name?: string; taskTitle?: string })[]
  onUserClick?: (userId: string) => void
}

export function PresenceList({ presences, onUserClick }: PresenceListProps) {
  const grouped = {
    online: presences.filter(p => p.status === 'online'),
    focus: presences.filter(p => p.status === 'focus'),
    away: presences.filter(p => p.status === 'away'),
    offline: presences.filter(p => p.status === 'offline')
  }

  const renderGroup = (
    status: PresenceStatus, 
    items: (UserPresence & { full_name?: string; taskTitle?: string })[]
  ) => {
    if (items.length === 0) return null

    return (
      <div key={status} className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn('h-2 w-2 rounded-full', getPresenceColor(status))} />
          <span>{getPresenceLabel(status)} ({items.length})</span>
        </div>
        <div className="pl-4 space-y-1">
          {items.map(presence => (
            <button
              key={presence.user_id}
              onClick={() => onUserClick?.(presence.user_id)}
              className="flex items-center gap-2 text-sm hover:bg-muted rounded px-2 py-1 w-full text-left transition-colors"
            >
              <span className="font-medium truncate">
                {presence.full_name || 'Unknown'}
              </span>
              {presence.taskTitle && status !== 'offline' && (
                <span className="text-xs text-muted-foreground truncate">
                  • {presence.taskTitle}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {renderGroup('online', grouped.online)}
      {renderGroup('focus', grouped.focus)}
      {renderGroup('away', grouped.away)}
      {renderGroup('offline', grouped.offline)}
    </div>
  )
}
