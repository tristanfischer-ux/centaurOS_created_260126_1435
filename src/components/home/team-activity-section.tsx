'use client'

/**
 * TeamActivitySection Component
 * 
 * Shows what team members are working on:
 * - Current focus (from presence)
 * - Tasks due this week per member
 */

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import { 
  Users,
  ChevronRight,
  ChevronDown,
  Circle,
  Zap
} from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { useState } from 'react'

interface TeamMemberTask {
  id: string
  title: string
  end_date: string | null
}

interface TeamMemberActivity {
  id: string
  full_name: string | null
  avatar_url?: string | null
  role: string | null
  presence_status?: 'online' | 'away' | 'focus' | 'offline'
  current_task?: {
    id: string
    title: string
  } | null
  tasks_this_week: TeamMemberTask[]
}

interface TeamActivitySectionProps {
  teamMembers: TeamMemberActivity[]
  className?: string
}

/**
 * Presence indicator dot
 */
function PresenceDot({ status }: { status?: string }) {
  const statusColors = {
    online: 'bg-status-success',
    away: 'bg-status-warning',
    focus: 'bg-electric-blue',
    offline: 'bg-muted-foreground/50'
  }
  
  return (
    <span 
      className={cn(
        "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background",
        statusColors[status as keyof typeof statusColors] || statusColors.offline
      )}
    />
  )
}

/**
 * Single team member row
 */
function TeamMemberRow({ member }: { member: TeamMemberActivity }) {
  const [expanded, setExpanded] = useState(false)
  const hasTasksThisWeek = member.tasks_this_week.length > 0
  const hasFocus = member.current_task !== null
  
  return (
    <div className="border-b border-muted last:border-0">
      {/* Member header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
      >
        {/* Avatar with presence */}
        <div className="relative">
          <UserAvatar 
            name={member.full_name || '?'}
            role={member.role}
            avatarUrl={member.avatar_url}
            size="md"
          />
          <PresenceDot status={member.presence_status} />
        </div>
        
        {/* Name and current task */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {member.full_name || 'Unknown'}
            </span>
            {member.role && (
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                {member.role}
              </Badge>
            )}
          </div>
          {hasFocus ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Zap className="h-3 w-3 text-electric-blue" />
              <span className="truncate">{member.current_task?.title}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              {hasTasksThisWeek 
                ? `${member.tasks_this_week.length} task${member.tasks_this_week.length !== 1 ? 's' : ''} this week`
                : 'No tasks this week'
              }
            </span>
          )}
        </div>
        
        {/* Expand indicator */}
        {hasTasksThisWeek && (
          <ChevronDown 
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )} 
          />
        )}
      </button>
      
      {/* Expanded task list */}
      {expanded && hasTasksThisWeek && (
        <div className="px-3 pb-3 pl-14 space-y-1">
          {member.tasks_this_week.slice(0, 3).map((task) => (
            <Link
              key={task.id}
              href={`/tasks?taskId=${task.id}`}
              className="block p-2 rounded text-xs hover:bg-muted transition-colors"
            >
              <p className="font-medium text-foreground truncate">{task.title}</p>
              {task.end_date && (
                <p className="text-muted-foreground">
                  Due {new Date(task.end_date).toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </p>
              )}
            </Link>
          ))}
          {member.tasks_this_week.length > 3 && (
            <p className="text-xs text-muted-foreground pl-2">
              +{member.tasks_this_week.length - 3} more tasks
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Displays team activity - who's working on what
 */
export function TeamActivitySection({
  teamMembers,
  className
}: TeamActivitySectionProps) {
  // Sort: online members first, then by those with current tasks
  const sortedMembers = [...teamMembers].sort((a, b) => {
    // Online status priority
    const statusOrder = { online: 0, focus: 1, away: 2, offline: 3 }
    const aStatus = statusOrder[a.presence_status as keyof typeof statusOrder] ?? 3
    const bStatus = statusOrder[b.presence_status as keyof typeof statusOrder] ?? 3
    if (aStatus !== bStatus) return aStatus - bStatus
    
    // Then by current task
    if (a.current_task && !b.current_task) return -1
    if (!a.current_task && b.current_task) return 1
    
    // Then by task count
    return b.tasks_this_week.length - a.tasks_this_week.length
  })

  // Empty state
  if (teamMembers.length === 0) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="py-6">
          <div className="flex flex-col items-center text-center">
            <Users className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-foreground">No team members</p>
            <p className="text-xs text-muted-foreground">Invite your team to get started</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Count online members
  const onlineCount = teamMembers.filter(m => 
    m.presence_status === 'online' || m.presence_status === 'focus'
  ).length

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Team Activity</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {onlineCount > 0 && (
              <Badge variant="outline" className="text-xs border-status-success text-status-success">
                {onlineCount} online
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0 pt-0">
        <div className="max-h-[400px] overflow-y-auto">
          {sortedMembers.map((member) => (
            <TeamMemberRow key={member.id} member={member} />
          ))}
        </div>
        <Link 
          href="/team"
          className="flex items-center justify-center gap-1 p-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border-t"
        >
          View full team
          <ChevronRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  )
}
