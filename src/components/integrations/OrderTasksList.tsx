'use client'

/**
 * OrderTasksList Component
 * Display tasks auto-created for an order
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  Circle,
  Clock,
  ListTodo,
  Loader2,
  XCircle,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getOrderRelatedTasks, initializeOrderTasks } from '@/actions/integrations'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type TaskStatus = 'Pending' | 'Accepted' | 'In_Progress' | 'Completed' | 'Cancelled' | string
type TaskType = 'onboarding' | 'check_in' | 'milestone_review' | 'completion'

interface OrderTask {
  id: string
  title: string
  status: TaskStatus
  taskType: TaskType
  dueDate: string | null
}

interface OrderTasksListProps {
  orderId: string
  showInitButton?: boolean
  maxHeight?: string
}

const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  Pending: { icon: Circle, color: 'text-slate-400', label: 'Pending' },
  Accepted: { icon: Clock, color: 'text-blue-500', label: 'Accepted' },
  In_Progress: { icon: Clock, color: 'text-amber-500', label: 'In Progress' },
  Completed: { icon: CheckCircle2, color: 'text-green-500', label: 'Completed' },
  Cancelled: { icon: XCircle, color: 'text-slate-400', label: 'Cancelled' },
}

const taskTypeLabels: Record<TaskType, { label: string; variant: 'default' | 'secondary' | 'outline' | 'info' }> = {
  onboarding: { label: 'Onboarding', variant: 'info' },
  check_in: { label: 'Check-in', variant: 'secondary' },
  milestone_review: { label: 'Milestone', variant: 'default' },
  completion: { label: 'Completion', variant: 'outline' },
}

export function OrderTasksList({
  orderId,
  showInitButton = false,
  maxHeight = '300px',
}: OrderTasksListProps) {
  const [tasks, setTasks] = useState<OrderTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isInitializing, setIsInitializing] = useState(false)

  useEffect(() => {
    const fetchTasks = async () => {
      setIsLoading(true)
      try {
        const result = await getOrderRelatedTasks(orderId)
        if (result.data) {
          setTasks(result.data)
        }
      } catch (err) {
        console.error('Failed to load tasks:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchTasks()
  }, [orderId])

  const refreshTasks = async () => {
    setIsLoading(true)
    try {
      const result = await getOrderRelatedTasks(orderId)
      if (result.data) {
        setTasks(result.data)
      }
    } catch (err) {
      console.error('Failed to load tasks:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleInitializeTasks = async () => {
    setIsInitializing(true)
    try {
      const result = await initializeOrderTasks(orderId)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }

      if (result.tasks && result.tasks.length > 0) {
        toast.success(`Created ${result.tasks.length} tasks`)
        refreshTasks()
      } else {
        toast.info('No tasks to create')
      }
    } catch (error) {
      toast.error('Failed to initialize tasks')
    } finally {
      setIsInitializing(false)
    }
  }

  const formatDueDate = (dateString: string | null) => {
    if (!dateString) return null
    const date = new Date(dateString)
    const now = new Date()
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      return { text: `${Math.abs(diffDays)}d overdue`, isOverdue: true }
    } else if (diffDays === 0) {
      return { text: 'Due today', isOverdue: false }
    } else if (diffDays <= 7) {
      return { text: `Due in ${diffDays}d`, isOverdue: false }
    }
    return { text: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), isOverdue: false }
  }

  // Group tasks by type
  const groupedTasks = tasks.reduce((acc, task) => {
    const type = task.taskType
    if (!acc[type]) acc[type] = []
    acc[type].push(task)
    return acc
  }, {} as Record<TaskType, OrderTask[]>)

  const completedCount = tasks.filter(t => t.status === 'Completed').length
  const totalCount = tasks.length

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Related Tasks</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {totalCount > 0 && (
              <Badge variant="secondary">
                {completedCount}/{totalCount}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={refreshTasks}
              disabled={isLoading}
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>
          </div>
        </div>
        <CardDescription>
          Tasks automatically created for this order
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-6">
            <ListTodo className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              No tasks created for this order yet.
            </p>
            {showInitButton && (
              <Button
                onClick={handleInitializeTasks}
                disabled={isInitializing}
                variant="outline"
                size="sm"
              >
                {isInitializing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating tasks...
                  </>
                ) : (
                  <>
                    <ListTodo className="h-4 w-4 mr-2" />
                    Create Tasks
                  </>
                )}
              </Button>
            )}
          </div>
        ) : (
          <ScrollArea style={{ maxHeight }} className="pr-4">
            <div className="space-y-4">
              {(Object.keys(groupedTasks) as TaskType[]).map((taskType) => (
                <div key={taskType}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant={taskTypeLabels[taskType]?.variant || 'secondary'}>
                      {taskTypeLabels[taskType]?.label || taskType}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {groupedTasks[taskType].length} task{groupedTasks[taskType].length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {groupedTasks[taskType].map((task) => {
                      const status = statusConfig[task.status] || statusConfig.Pending
                      const StatusIcon = status.icon
                      const dueInfo = formatDueDate(task.dueDate)

                      return (
                        <Link
                          key={task.id}
                          href={`/tasks/${task.id}`}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-accent transition-colors group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <StatusIcon className={cn('h-4 w-4 flex-shrink-0', status.color)} />
                            <span className={cn(
                              'text-sm truncate',
                              task.status === 'Completed' && 'text-muted-foreground line-through'
                            )}>
                              {task.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {dueInfo && (
                              <span className={cn(
                                'text-xs',
                                dueInfo.isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'
                              )}>
                                {dueInfo.text}
                              </span>
                            )}
                            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
