"use client"

import { useState, useMemo } from "react"
import { Database } from "@/types/database.types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { UserAvatarStack } from "@/components/ui/user-avatar"
import { getStatusBadgeClass } from "@/lib/status-colors"
import { cn } from "@/lib/utils"
import { Search, Calendar, MessageSquare } from "lucide-react"
import { format, isPast } from "date-fns"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

type Task = Database["public"]["Tables"]["tasks"]["Row"] & {
  assignee?: { 
    id: string
    full_name: string | null
    role: string
    email: string
    avatar_url?: string | null
  } | null
  assignees?: Array<{
    id: string
    full_name: string | null
    role: string
    email: string
    avatar_url?: string | null
  }>
  objective?: Objective
  task_number?: number
  unread_message_count?: number
}

type Objective = {
  id: string
  title: string
}

interface TasksListProps {
  tasks: Array<Task>
  objectives: Objective[]
  currentUserId: string
  taskFilter: 'my_tasks' | 'all_tasks'
  onTaskFilterChange: (filter: 'my_tasks' | 'all_tasks') => void
  selectedTaskId?: string
  onSelectTask: (taskId: string) => void
}

export function TasksList({
  tasks,
  objectives,
  currentUserId,
  taskFilter,
  onTaskFilterChange,
  selectedTaskId,
  onSelectTask,
}: TasksListProps) {
  const [searchQuery, setSearchQuery] = useState("")

  // Filter tasks based on taskFilter and search query
  const filteredTasks = useMemo(() => {
    let result = tasks

    // Apply task filter
    if (taskFilter === 'my_tasks') {
      result = result.filter(task => {
        const assignees = task.assignees && task.assignees.length > 0 
          ? task.assignees 
          : (task.assignee ? [task.assignee] : [])
        return assignees.some(a => a.id === currentUserId)
      })
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(task => 
        task.title?.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        task.task_number?.toString().includes(query) ||
        task.objective?.title.toLowerCase().includes(query)
      )
    }

    return result
  }, [tasks, taskFilter, currentUserId, searchQuery])

  // Group tasks by objective
  const tasksByObjective = useMemo(() => {
    const grouped: Record<string, Task[]> = {}
    const orphanedTasks: Task[] = []

    filteredTasks.forEach(task => {
      if (task.objective_id && task.objective) {
        if (!grouped[task.objective_id]) {
          grouped[task.objective_id] = []
        }
        grouped[task.objective_id].push(task)
      } else {
        orphanedTasks.push(task)
      }
    })

    return { grouped, orphanedTasks }
  }, [filteredTasks])

  // Calculate progress for an objective
  const calculateProgress = (tasks: Task[]) => {
    if (tasks.length === 0) return 0
    const completed = tasks.filter(t => t.status === 'Completed').length
    return Math.round((completed / tasks.length) * 100)
  }

  // Get assignees for a task
  const getTaskAssignees = (task: Task) => {
    if (task.assignees && task.assignees.length > 0) {
      return task.assignees
    }
    if (task.assignee) {
      return [task.assignee]
    }
    return []
  }

  // Check if task is overdue
  const isOverdue = (task: Task) => {
    return task.end_date && isPast(new Date(task.end_date)) && task.status !== 'Completed'
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Filter Toggle */}
      <div className="flex items-center justify-between gap-3 p-4 border-b">
        <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
          <Button
            variant={taskFilter === 'my_tasks' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onTaskFilterChange('my_tasks')}
            className={cn(
              "text-xs font-medium",
              taskFilter === 'my_tasks' && 'shadow-sm'
            )}
          >
            My Tasks
          </Button>
          <Button
            variant={taskFilter === 'all_tasks' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onTaskFilterChange('all_tasks')}
            className={cn(
              "text-xs font-medium",
              taskFilter === 'all_tasks' && 'shadow-sm'
            )}
          >
            All Tasks
          </Button>
        </div>

        {/* Task count */}
        <div className="text-xs text-muted-foreground font-medium">
          {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Tasks List */}
      <div className="flex-1 overflow-y-auto">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="text-muted-foreground mb-2">No tasks found</div>
            <p className="text-xs text-muted-foreground">
              {searchQuery ? 'Try adjusting your search' : 'No tasks match your current filter'}
            </p>
          </div>
        ) : (
          <Accordion type="multiple" className="w-full" defaultValue={Object.keys(tasksByObjective.grouped)}>
            {/* Objectives with tasks */}
            {objectives
              .filter(obj => tasksByObjective.grouped[obj.id])
              .map(objective => {
                const objectiveTasks = tasksByObjective.grouped[objective.id]
                const progress = calculateProgress(objectiveTasks)

                return (
                  <AccordionItem key={objective.id} value={objective.id} className="border-b">
                    <AccordionTrigger className="px-4 py-3 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="h-2 w-2 rounded-full bg-electric-blue shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-sm text-foreground truncate">
                                {objective.title}
                              </h3>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {objectiveTasks.length}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Progress value={progress} className="h-1.5 flex-1 max-w-[120px]" />
                              <span className="text-[10px] text-muted-foreground font-medium">
                                {progress}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-0 py-0">
                      {objectiveTasks.map(task => {
                        const assignees = getTaskAssignees(task)
                        const taskIsOverdue = isOverdue(task)

                        return (
                          <div
                            key={task.id}
                            onClick={() => onSelectTask(task.id)}
                            className={cn(
                              "px-4 py-3 border-b last:border-0 cursor-pointer transition-colors hover:bg-muted/50 active:bg-muted",
                              selectedTaskId === task.id && "bg-electric-blue-light/10 border-l-2 border-l-electric-blue"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              {/* Left: Task info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-[10px] font-mono text-muted-foreground">
                                    #{task.task_number ?? '...'}
                                  </span>
                                  <Badge 
                                    className={cn(
                                      "text-[10px] px-1.5 py-0",
                                      getStatusBadgeClass(task.status)
                                    )}
                                  >
                                    {(task.status || 'Pending').replace(/_/g, ' ')}
                                  </Badge>
                                  {taskIsOverdue && (
                                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                      Overdue
                                    </Badge>
                                  )}
                                </div>
                                <h4 className="text-sm font-medium text-foreground mb-1 line-clamp-1">
                                  {task.title}
                                </h4>
                                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                  {/* Assignees */}
                                  {assignees.length > 0 && (
                                    <div className="flex items-center gap-1">
                                      <UserAvatarStack
                                        users={assignees.map(a => ({
                                          id: a.id,
                                          name: a.full_name,
                                          role: a.role,
                                          avatarUrl: a.avatar_url,
                                        }))}
                                        size="xs"
                                        max={3}
                                      />
                                    </div>
                                  )}
                                  {/* Due date */}
                                  {task.end_date && (
                                    <div className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      <span className={cn(
                                        taskIsOverdue && "text-destructive font-medium"
                                      )}>
                                        {format(new Date(task.end_date), 'MMM d')}
                                      </span>
                                    </div>
                                  )}
                                  {/* Unread count */}
                                  {task.unread_message_count && task.unread_message_count > 0 && (
                                    <div className="flex items-center gap-1">
                                      <MessageSquare className="h-3 w-3" />
                                      <Badge 
                                        variant="destructive" 
                                        className="h-4 min-w-[16px] px-1 text-[9px] rounded-full"
                                      >
                                        {task.unread_message_count}
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </AccordionContent>
                  </AccordionItem>
                )
              })}

            {/* Orphaned tasks (no objective) */}
            {tasksByObjective.orphanedTasks.length > 0 && (
              <AccordionItem value="no-objective" className="border-b">
                <AccordionTrigger className="px-4 py-3 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-2 w-2 rounded-full bg-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm text-muted-foreground">
                            General Tasks
                          </h3>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {tasksByObjective.orphanedTasks.length}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-0 py-0">
                  {tasksByObjective.orphanedTasks.map(task => {
                    const assignees = getTaskAssignees(task)
                    const taskIsOverdue = isOverdue(task)

                    return (
                      <div
                        key={task.id}
                        onClick={() => onSelectTask(task.id)}
                        className={cn(
                          "px-4 py-3 border-b last:border-0 cursor-pointer transition-colors hover:bg-muted/50 active:bg-muted",
                          selectedTaskId === task.id && "bg-electric-blue-light/10 border-l-2 border-l-electric-blue"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          {/* Left: Task info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-[10px] font-mono text-muted-foreground">
                                #{task.task_number ?? '...'}
                              </span>
                              <Badge 
                                className={cn(
                                  "text-[10px] px-1.5 py-0",
                                  getStatusBadgeClass(task.status)
                                )}
                              >
                                {(task.status || 'Pending').replace(/_/g, ' ')}
                              </Badge>
                              {taskIsOverdue && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                  Overdue
                                </Badge>
                              )}
                            </div>
                            <h4 className="text-sm font-medium text-foreground mb-1 line-clamp-1">
                              {task.title}
                            </h4>
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                              {/* Assignees */}
                              {assignees.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <UserAvatarStack
                                    users={assignees.map(a => ({
                                      id: a.id,
                                      name: a.full_name,
                                      role: a.role,
                                      avatarUrl: a.avatar_url,
                                    }))}
                                    size="xs"
                                    max={3}
                                  />
                                </div>
                              )}
                              {/* Due date */}
                              {task.end_date && (
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  <span className={cn(
                                    taskIsOverdue && "text-destructive font-medium"
                                  )}>
                                    {format(new Date(task.end_date), 'MMM d')}
                                  </span>
                                </div>
                              )}
                              {/* Unread count */}
                              {task.unread_message_count && task.unread_message_count > 0 && (
                                <div className="flex items-center gap-1">
                                  <MessageSquare className="h-3 w-3" />
                                  <Badge 
                                    variant="destructive" 
                                    className="h-4 min-w-[16px] px-1 text-[9px] rounded-full"
                                  >
                                    {task.unread_message_count}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        )}
      </div>
    </div>
  )
}
