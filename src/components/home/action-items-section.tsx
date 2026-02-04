'use client'

/**
 * ActionItemsSection Component
 * 
 * Displays urgent action items that need attention:
 * - Overdue tasks
 * - Pending decisions (executives/founders only)
 * - Blockers from standups (executives/founders only)
 */

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import { 
  AlertCircle, 
  Clock, 
  Inbox,
  AlertTriangle,
  ChevronRight,
  ShieldCheck
} from 'lucide-react'
import { cn, getInitials, formatStatus } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface ActionTask {
  id: string
  title: string
  status: string
  end_date: string | null
  created_at: string
  assignee?: {
    id: string
    full_name: string | null
    role: string | null
  } | null
  creator?: {
    id: string
    full_name: string | null
  } | null
}

interface BlockerStandup {
  id: string
  blockers: string
  blocker_severity: string | null
  needs_help: boolean
  user: {
    id: string
    full_name: string | null
    role: string | null
  }
}

interface ActionItemsSectionProps {
  overdueTasks: ActionTask[]
  pendingDecisions: ActionTask[]
  blockers: BlockerStandup[]
  isExecutiveOrFounder: boolean
  className?: string
}

/**
 * Displays action items in a compact, scrollable format for the summary panel
 */
export function ActionItemsSection({
  overdueTasks,
  pendingDecisions,
  blockers,
  isExecutiveOrFounder,
  className
}: ActionItemsSectionProps) {
  const totalCount = overdueTasks.length + 
    (isExecutiveOrFounder ? pendingDecisions.length + blockers.length : 0)

  // All clear state
  if (totalCount === 0) {
    return (
      <Card className={cn("border-status-success bg-status-success-light/50", className)}>
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-status-success-dark">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-sm font-medium">All clear - nothing urgent</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("border-destructive/50", className)}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <CardTitle className="text-sm font-semibold">Needs Attention</CardTitle>
          </div>
          <Badge variant="destructive" className="text-xs">
            {totalCount}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-3">
        {/* Overdue Tasks */}
        {overdueTasks.length > 0 && (
          <div className="space-y-2">
            <Link 
              href="/tasks?filter=overdue"
              className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors group"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium">Overdue tasks</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="border-destructive text-destructive text-xs">
                  {overdueTasks.length}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
            
            {/* Show first 3 overdue tasks */}
            <div className="pl-6 space-y-1">
              {overdueTasks.slice(0, 3).map((task) => (
                <Link 
                  key={task.id} 
                  href={`/tasks?taskId=${task.id}`}
                  className="block p-2 rounded text-xs hover:bg-muted/50 transition-colors"
                >
                  <p className="font-medium text-foreground truncate">{task.title}</p>
                  <p className="text-destructive">
                    Due {formatDistanceToNow(new Date(task.end_date!), { addSuffix: true })}
                  </p>
                </Link>
              ))}
              {overdueTasks.length > 3 && (
                <p className="text-xs text-muted-foreground pl-2">
                  +{overdueTasks.length - 3} more
                </p>
              )}
            </div>
          </div>
        )}

        {/* Pending Decisions (executives/founders only) */}
        {isExecutiveOrFounder && pendingDecisions.length > 0 && (
          <div className="space-y-2">
            <Link 
              href="/tasks?filter=pending-approval"
              className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors group"
            >
              <div className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-status-warning" />
                <span className="text-sm font-medium">Awaiting approval</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="border-status-warning text-status-warning text-xs">
                  {pendingDecisions.length}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
            
            {/* Show first 2 pending decisions */}
            <div className="pl-6 space-y-1">
              {pendingDecisions.slice(0, 2).map((task) => (
                <Link 
                  key={task.id} 
                  href={`/tasks?taskId=${task.id}`}
                  className="block p-2 rounded text-xs hover:bg-muted/50 transition-colors"
                >
                  <p className="font-medium text-foreground truncate">{task.title}</p>
                  {task.assignee?.full_name && (
                    <p className="text-muted-foreground">
                      From {task.assignee.full_name}
                    </p>
                  )}
                </Link>
              ))}
              {pendingDecisions.length > 2 && (
                <p className="text-xs text-muted-foreground pl-2">
                  +{pendingDecisions.length - 2} more
                </p>
              )}
            </div>
          </div>
        )}

        {/* Blockers (executives/founders only) */}
        {isExecutiveOrFounder && blockers.length > 0 && (
          <div className="space-y-2">
            <Link 
              href="/team?tab=standups"
              className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors group"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium">Blockers reported</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="border-destructive text-destructive text-xs">
                  {blockers.length}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
            
            {/* Show first 2 blockers */}
            <div className="pl-6 space-y-2">
              {blockers.slice(0, 2).map((standup) => (
                <div 
                  key={standup.id} 
                  className="p-2 rounded text-xs bg-destructive/5 border border-destructive/20"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <UserAvatar 
                      name={standup.user.full_name || 'U'}
                      role={standup.user.role}
                      size="xs"
                    />
                    <span className="font-medium text-foreground">
                      {standup.user.full_name}
                    </span>
                    {standup.needs_help && (
                      <Badge variant="destructive" className="text-[10px] px-1 py-0">
                        Help needed
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground line-clamp-2">{standup.blockers}</p>
                </div>
              ))}
              {blockers.length > 2 && (
                <p className="text-xs text-muted-foreground pl-2">
                  +{blockers.length - 2} more
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
