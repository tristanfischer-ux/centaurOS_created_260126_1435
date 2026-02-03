'use client'

/**
 * TasksDueSection Component
 * 
 * Displays tasks due today and this week in a compact format
 */

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { 
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronRight
} from 'lucide-react'
import { cn, getInitials, formatStatus } from '@/lib/utils'
import { format, isToday, isThisWeek, isTomorrow } from 'date-fns'

interface TaskDue {
  id: string
  title: string
  status: string
  end_date: string
  task_number?: number
  assignee?: {
    id: string
    full_name: string | null
    avatar_url?: string | null
  } | null
  objective?: {
    id: string
    title: string
  } | null
}

interface TasksDueSectionProps {
  tasksDueToday: TaskDue[]
  tasksDueThisWeek: TaskDue[]
  onTaskClick?: (taskId: string) => void
  className?: string
}

/**
 * Compact task item for the summary panel
 */
function TaskItem({ task, onTaskClick }: { task: TaskDue; onTaskClick?: (taskId: string) => void }) {
  const dueDate = new Date(task.end_date)
  
  return (
    <div 
      onClick={() => onTaskClick?.(task.id)}
      className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors group cursor-pointer"
    >
      {/* Assignee avatar */}
      <Avatar className="h-6 w-6 flex-shrink-0">
        {task.assignee?.avatar_url && (
          <AvatarImage src={task.assignee.avatar_url} />
        )}
        <AvatarFallback className="text-[10px] bg-muted">
          {getInitials(task.assignee?.full_name || '?')}
        </AvatarFallback>
      </Avatar>
      
      {/* Task details */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate group-hover:text-international-orange transition-colors">
          {task.title}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {task.objective && (
            <span className="truncate max-w-[120px]">{task.objective.title}</span>
          )}
          {task.objective && task.assignee?.full_name && <span>•</span>}
          {task.assignee?.full_name && (
            <span className="truncate">{task.assignee.full_name}</span>
          )}
        </div>
      </div>
      
      {/* Status badge */}
      <Badge 
        variant="outline" 
        className={cn(
          "text-[10px] flex-shrink-0",
          task.status === 'Completed' && "border-status-success text-status-success",
          task.status === 'Pending' && "border-status-warning text-status-warning",
          task.status === 'Accepted' && "border-status-info text-status-info"
        )}
      >
        {formatStatus(task.status)}
      </Badge>
    </div>
  )
}

/**
 * Displays tasks due today and this week
 */
export function TasksDueSection({
  tasksDueToday,
  tasksDueThisWeek,
  onTaskClick,
  className
}: TasksDueSectionProps) {
  const hasNoTasks = tasksDueToday.length === 0 && tasksDueThisWeek.length === 0

  // Empty state
  if (hasNoTasks) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="py-6">
          <div className="flex flex-col items-center text-center">
            <CheckCircle2 className="h-8 w-8 text-status-success mb-2" />
            <p className="text-sm font-medium text-foreground">All caught up!</p>
            <p className="text-xs text-muted-foreground">No tasks due this week</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Due Today */}
      {tasksDueToday.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-international-orange" />
                <CardTitle className="text-sm font-semibold">Due Today</CardTitle>
              </div>
              <Badge className="bg-international-orange/10 text-international-orange border-0 text-xs">
                {tasksDueToday.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-2 pt-0">
            <div className="space-y-1">
              {tasksDueToday.slice(0, 5).map((task) => (
                <TaskItem key={task.id} task={task} onTaskClick={onTaskClick} />
              ))}
              {tasksDueToday.length > 5 && (
                <Link 
                  href="/tasks?filter=due-today"
                  className="flex items-center justify-center gap-1 p-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  View all {tasksDueToday.length} tasks
                  <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Due This Week */}
      {tasksDueThisWeek.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-electric-blue" />
                <CardTitle className="text-sm font-semibold">Due This Week</CardTitle>
              </div>
              <Badge className="bg-electric-blue/10 text-electric-blue border-0 text-xs">
                {tasksDueThisWeek.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-2 pt-0">
            <div className="space-y-1">
              {tasksDueThisWeek.slice(0, 5).map((task) => (
                <TaskItem key={task.id} task={task} onTaskClick={onTaskClick} />
              ))}
              {tasksDueThisWeek.length > 5 && (
                <Link 
                  href="/tasks?filter=this-week"
                  className="flex items-center justify-center gap-1 p-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  View all {tasksDueThisWeek.length} tasks
                  <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
