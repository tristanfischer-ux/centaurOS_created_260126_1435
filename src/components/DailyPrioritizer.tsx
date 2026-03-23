'use client'

import { useState, useTransition } from 'react'
import { differenceInDays } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Target, Clock, AlertTriangle, RefreshCw, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FullTaskView } from '@/components/tasks/full-task-view'
import { completeTask } from '@/actions/tasks'
import { toast } from 'sonner'

interface Task {
    id: string
    title: string
    description: string | null
    status: string | null
    start_date: string | null
    end_date: string | null
    created_at: string
    updated_at: string
    risk_level: string | null
    task_number?: number
    assignee?: {
        id: string
        full_name: string | null
        role: string | null
        email: string
        avatar_url?: string | null
    } | null
    assignees?: { id: string; full_name: string | null; role: string | null; email: string; avatar_url?: string | null }[]
    task_files?: { id: string }[]
    objective?: {
        id: string
        title: string
    } | null
}

interface Member {
    id: string
    full_name: string
    role: string
    email: string
}

interface PrioritizedTask extends Task {
    score: number
    reasons: string[]
}

/**
 * Calculates a deterministic priority score for a task.
 * Higher score = higher priority.
 * 
 * Scoring breakdown:
 * - Deadline urgency: 0-40 points
 * - Blocking status: 0-30 points
 * - Staleness: 0-10 points
 * 
 * Total max: 80 points
 */
function calculateTaskPriority(task: Task): { score: number; reasons: string[] } {
    let score = 0
    const reasons: string[] = []
    const now = new Date()

    // Deadline urgency (0-40 points)
    if (task.end_date) {
        const daysUntilDue = differenceInDays(new Date(task.end_date), now)
        
        if (daysUntilDue < 0) {
            score += 40
            const daysOverdue = Math.abs(daysUntilDue)
            reasons.push(`OVERDUE by ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''}`)
        } else if (daysUntilDue === 0) {
            score += 38
            reasons.push('Due today')
        } else if (daysUntilDue === 1) {
            score += 35
            reasons.push('Due tomorrow')
        } else if (daysUntilDue <= 3) {
            score += 25
            reasons.push(`Due in ${daysUntilDue} days`)
        } else if (daysUntilDue <= 7) {
            score += 15
            reasons.push('Due this week')
        }
    }

    // Blocking others status (0-30 points)
    if (task.status === 'Pending_Executive_Approval') {
        score += 30
        reasons.push('Awaiting approval')
    } else if (task.status === 'Amended_Pending_Approval') {
        score += 25
        reasons.push('Amendment pending')
    } else if (task.status === 'Pending_Peer_Review') {
        score += 20
        reasons.push('In peer review')
    }

    // Staleness - no updates (0-10 points)
    if (task.updated_at) {
        const daysSinceUpdate = differenceInDays(now, new Date(task.updated_at))
        
        if (daysSinceUpdate > 7) {
            score += 10
            reasons.push(`No activity for ${daysSinceUpdate} days`)
        } else if (daysSinceUpdate > 3) {
            score += 5
            reasons.push('Stale - needs attention')
        }
    }

    return { score, reasons }
}

/**
 * Sorts tasks by priority score and returns top N.
 */
function prioritizeTasks(tasks: Task[], maxTasks: number): PrioritizedTask[] {
    const scored = tasks.map(task => {
        const { score, reasons } = calculateTaskPriority(task)
        return { ...task, score, reasons }
    })

    // Sort by score descending, then by end_date ascending (earlier deadlines first)
    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        // Secondary sort: tasks with deadlines come before those without
        if (a.end_date && !b.end_date) return -1
        if (!a.end_date && b.end_date) return 1
        if (a.end_date && b.end_date) {
            return new Date(a.end_date).getTime() - new Date(b.end_date).getTime()
        }
        return 0
    })

    return scored.slice(0, maxTasks)
}

interface DailyPrioritizerProps {
    tasks: Task[]
    maxTasks?: number
    compact?: boolean
    members: Member[]
    currentUserId: string
    /** Callback when a task is completed - parent should refresh data */
    onTaskCompleted?: () => void
}

export function DailyPrioritizer({ tasks, maxTasks = 5, compact = false, members, currentUserId, onTaskCompleted }: DailyPrioritizerProps) {
    const prioritizedTasks = prioritizeTasks(tasks, maxTasks)
    const [selectedTask, setSelectedTask] = useState<Task | null>(null)
    const [completingTaskId, setCompletingTaskId] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    /**
     * Quick-complete a task directly from the prioritizer
     * Handles medium/high risk tasks that go to review
     */
    const handleQuickComplete = async (e: React.MouseEvent, taskId: string) => {
        // Prevent opening the task detail modal
        e.stopPropagation()
        
        setCompletingTaskId(taskId)
        startTransition(async () => {
            const result = await completeTask(taskId)
            
            if (result.error) {
                toast.error(result.error)
            } else {
                // Show appropriate message based on what happened
                const task = prioritizedTasks.find(t => t.id === taskId)
                if (task?.risk_level === 'Medium') {
                    toast.success('Task sent for peer review')
                } else if (task?.risk_level === 'High') {
                    toast.success('Task sent for executive approval')
                } else {
                    toast.success('Task completed!')
                }
                onTaskCompleted?.()
            }
            setCompletingTaskId(null)
        })
    }

    if (prioritizedTasks.length === 0) {
        return (
            <div className="text-center py-6">
                <p className="text-muted-foreground text-sm">No tasks to prioritize</p>
            </div>
        )
    }

    return (
        <>
            <div className={cn("space-y-3", compact && "space-y-2")}>
                {prioritizedTasks.map((task, index) => (
                    <button
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className="block w-full text-left"
                    >
                        <div className={cn(
                        "rounded-lg border transition-all group hover:shadow-sm",
                        compact ? "p-2" : "p-3",
                        index === 0 
                            ? "bg-international-orange/5 border-international-orange/30 hover:border-international-orange/50" 
                            : "bg-foundry-50/50 border hover:border-foundry-300"
                    )}>
                        {/* Priority rank indicator */}
                        <div className={cn("flex items-start w-full", compact ? "gap-2" : "gap-3")}>
                            <div className={cn(
                                "flex-shrink-0 rounded-full flex items-center justify-center font-bold",
                                compact ? "w-5 h-5 text-[10px]" : "w-6 h-6 text-xs",
                                index === 0 
                                    ? "bg-international-orange text-white" 
                                    : index === 1 
                                        ? "bg-foundry-300 text-foundry-700"
                                        : "bg-foundry-200 text-foundry-600"
                            )}>
                                {index + 1}
                            </div>
                            
                            <div className="flex-1 min-w-0 overflow-hidden">
                                {/* Task title */}
                                <p 
                                  className={cn(
                                    "font-medium group-hover:underline decoration-foundry-300 underline-offset-2 break-words",
                                    compact ? "text-xs truncate" : "text-sm line-clamp-2",
                                    index === 0 ? "text-international-orange-dark" : "text-foreground"
                                  )}
                                  title={task.title}
                                >
                                    {task.title}
                                </p>

                                {/* Objective - hide in compact mode */}
                                {!compact && task.objective?.title && (
                                    <p className="text-xs text-muted-foreground mt-1 flex items-center">
                                        <Target className="h-3 w-3 mr-1 text-foundry-400" />
                                        {task.objective.title}
                                    </p>
                                )}

                                {/* Priority reasons */}
                                {task.reasons.length > 0 && (
                                    <div className={cn("flex flex-wrap gap-1", compact ? "mt-1" : "gap-1.5 mt-2")}>
                                        {task.reasons.slice(0, compact ? 1 : undefined).map((reason, i) => {
                                            const isOverdue = reason.startsWith('OVERDUE')
                                            const isDueToday = reason === 'Due today'
                                            const isDueTomorrow = reason === 'Due tomorrow'
                                            const isStale = reason.includes('activity') || reason.includes('Stale')
                                            const isApproval = reason.includes('approval') || reason.includes('review')

                                            return (
                                                <Badge 
                                                    key={i}
                                                    variant="secondary"
                                                    className={cn(
                                                        "font-medium py-0",
                                                        compact ? "text-[9px] px-1" : "text-[10px] px-1.5",
                                                        isOverdue 
                                                            ? "bg-status-error-light text-destructive border-destructive" 
                                                            : isDueToday
                                                                ? "bg-status-warning-light text-status-warning-dark border-status-warning"
                                                                : isDueTomorrow
                                                                    ? "bg-status-warning-light/80 text-status-warning-dark border-status-warning"
                                                                    : isStale
                                                                        ? "bg-status-info-light text-status-info-dark border-status-info"
                                                                        : isApproval
                                                                            ? "bg-status-info-light text-status-info-dark border-status-info"
                                                                            : "bg-foundry-100 text-foundry-600 border"
                                                    )}
                                                >
                                                    {!compact && isOverdue && <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />}
                                                    {!compact && (isDueToday || isDueTomorrow) && <Clock className="h-2.5 w-2.5 mr-0.5" />}
                                                    {!compact && isStale && <RefreshCw className="h-2.5 w-2.5 mr-0.5" />}
                                                    {reason}
                                                </Badge>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Quick complete button - only for completable tasks */}
                            {!compact && task.status !== 'Pending_Executive_Approval' && task.status !== 'Pending_Peer_Review' && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn(
                                        "flex-shrink-0 h-8 w-8 p-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity",
                                        "hover:bg-status-success-light hover:text-status-success"
                                    )}
                                    onClick={(e) => handleQuickComplete(e, task.id)}
                                    disabled={isPending && completingTaskId === task.id}
                                    aria-label="Mark task complete"
                                >
                                    {isPending && completingTaskId === task.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Check className="h-4 w-4" />
                                    )}
                                </Button>
                            )}
                        </div>
                    </div>
                </button>
            ))}

            {/* Show more hint if there are more tasks */}
            {tasks.length > maxTasks && (
                <p className={cn(
                    "text-center text-foundry-400",
                    compact ? "text-[10px] py-1" : "text-xs py-2"
                )}>
                    +{tasks.length - maxTasks} more tasks
                </p>
            )}
        </div>

        {/* Full Task View Modal */}
        {selectedTask && (
            <FullTaskView
                open={!!selectedTask}
                onOpenChange={(open) => !open && setSelectedTask(null)}
                task={selectedTask}
                members={members}
                currentUserId={currentUserId}
            />
        )}
    </>
    )
}
