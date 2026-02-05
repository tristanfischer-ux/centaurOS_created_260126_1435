'use client'

import Link from 'next/link'
import { Clock, AlertCircle, Flame, ChevronRight } from 'lucide-react'
import { format, isPast, isToday, differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface Task {
  id: string
  title: string
  status: string
  end_date: string | null
  task_number?: number
}

interface PriorityQueueProps {
  myTasks: Task[]
  overdueTasks: Task[]
  tasksDueToday: Task[]
  userId: string
}

/**
 * Smart Priority Queue - AI-suggested next tasks with urgency indicators
 */
export function PriorityQueue({
  myTasks,
  overdueTasks,
  tasksDueToday,
  userId
}: PriorityQueueProps) {
  // Calculate priority scores and sort
  const prioritizedTasks = myTasks
    .map(task => ({
      ...task,
      priorityScore: calculatePriorityScore(task, overdueTasks, tasksDueToday),
      urgency: getUrgencyLevel(task, overdueTasks, tasksDueToday)
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 8) // Show top 8
  
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-orange-50/50 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-international-orange/10 rounded-lg">
              <Flame className="w-5 h-5 text-international-orange" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Smart Priority Queue</h2>
              <p className="text-sm text-muted-foreground">Your most important tasks right now</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Task List */}
      <div className="divide-y divide-slate-100">
        {prioritizedTasks.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Clock className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-sm text-muted-foreground">
              All caught up! No urgent tasks at the moment.
            </p>
          </div>
        ) : (
          prioritizedTasks.map((task, index) => (
            <Link
              key={task.id}
              href={`/tasks/${task.id}`}
              className="block p-4 hover:bg-slate-50 transition-colors group"
            >
              <div className="flex items-start gap-3">
                {/* Priority Badge */}
                <div className={cn(
                  "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm",
                  index === 0 ? "bg-red-100 text-red-700" :
                  index === 1 ? "bg-orange-100 text-orange-700" :
                  index === 2 ? "bg-amber-100 text-amber-700" :
                  "bg-slate-100 text-slate-600"
                )}>
                  {index + 1}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground group-hover:text-international-orange transition-colors line-clamp-2">
                        {task.title}
                      </p>
                      {task.task_number && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          #{task.task_number}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-international-orange transition-colors flex-shrink-0" />
                  </div>
                  
                  <div className="flex items-center gap-2 mt-2">
                    <UrgencyBadge urgency={task.urgency} />
                    {task.end_date && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDueDate(task.end_date)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
      
      {/* Footer */}
      {prioritizedTasks.length > 0 && (
        <div className="p-4 bg-slate-50 border-t border-slate-100">
          <Link
            href="/tasks"
            className="text-sm text-international-orange hover:text-orange-700 font-medium flex items-center gap-1 group w-fit"
          >
            View all tasks
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      )}
    </div>
  )
}

function UrgencyBadge({ urgency }: { urgency: 'critical' | 'high' | 'medium' | 'low' }) {
  const styles = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-slate-100 text-slate-600 border-slate-200'
  }
  
  const labels = {
    critical: '🔥 Critical',
    high: '⚡ High',
    medium: '📋 Medium',
    low: '✓ Low'
  }
  
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border",
      styles[urgency]
    )}>
      {labels[urgency]}
    </span>
  )
}

function calculatePriorityScore(
  task: Task,
  overdueTasks: Task[],
  tasksDueToday: Task[]
): number {
  let score = 0
  
  // Overdue tasks get highest priority
  if (overdueTasks.some(t => t.id === task.id)) {
    score += 100
    if (task.end_date) {
      const daysOverdue = Math.abs(differenceInDays(new Date(task.end_date), new Date()))
      score += daysOverdue * 10
    }
  }
  
  // Tasks due today get high priority
  if (tasksDueToday.some(t => t.id === task.id)) {
    score += 50
  }
  
  // Tasks due soon
  if (task.end_date) {
    const daysUntilDue = differenceInDays(new Date(task.end_date), new Date())
    if (daysUntilDue >= 0 && daysUntilDue <= 7) {
      score += (7 - daysUntilDue) * 5
    }
  }
  
  // Status-based priority
  if (task.status === 'Pending_Executive_Approval') score += 30
  if (task.status === 'Amended_Pending_Approval') score += 25
  if (task.status === 'In_Progress') score += 20
  
  return score
}

function getUrgencyLevel(
  task: Task,
  overdueTasks: Task[],
  tasksDueToday: Task[]
): 'critical' | 'high' | 'medium' | 'low' {
  if (overdueTasks.some(t => t.id === task.id)) return 'critical'
  if (tasksDueToday.some(t => t.id === task.id)) return 'high'
  
  if (task.end_date) {
    const daysUntilDue = differenceInDays(new Date(task.end_date), new Date())
    if (daysUntilDue <= 3) return 'high'
    if (daysUntilDue <= 7) return 'medium'
  }
  
  return 'low'
}

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr)
  
  if (isPast(date) && !isToday(date)) {
    return `Overdue by ${Math.abs(differenceInDays(date, new Date()))}d`
  }
  
  if (isToday(date)) {
    return 'Due today'
  }
  
  const days = differenceInDays(date, new Date())
  if (days === 1) return 'Due tomorrow'
  if (days <= 7) return `Due in ${days} days`
  
  return format(date, 'MMM d')
}
