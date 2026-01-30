'use client'

import { differenceInDays } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Target, Clock, AlertTriangle, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface Task {
    id: string
    title: string
    status: string
    end_date: string | null
    created_at: string
    updated_at: string
    risk_level?: string | null
    objective?: {
        id: string
        title: string
    } | null
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
}

export function DailyPrioritizer({ tasks, maxTasks = 5 }: DailyPrioritizerProps) {
    const prioritizedTasks = prioritizeTasks(tasks, maxTasks)

    if (prioritizedTasks.length === 0) {
        return (
            <div className="text-center py-6">
                <p className="text-foundry-500 text-sm">No tasks to prioritize</p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {prioritizedTasks.map((task, index) => (
                <Link key={task.id} href="/tasks" className="block">
                    <div className={cn(
                        "p-3 rounded-lg border transition-all group hover:shadow-sm",
                        index === 0 
                            ? "bg-international-orange/5 border-international-orange/30 hover:border-international-orange/50" 
                            : "bg-foundry-50/50 border-foundry-200 hover:border-foundry-300"
                    )}>
                        {/* Priority rank indicator */}
                        <div className="flex items-start gap-3">
                            <div className={cn(
                                "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                                index === 0 
                                    ? "bg-international-orange text-white" 
                                    : index === 1 
                                        ? "bg-foundry-300 text-foundry-700"
                                        : "bg-foundry-200 text-foundry-600"
                            )}>
                                {index + 1}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                {/* Task title */}
                                <p className={cn(
                                    "text-sm font-medium line-clamp-2 group-hover:underline decoration-foundry-300 underline-offset-2",
                                    index === 0 ? "text-international-orange-dark" : "text-foundry-900"
                                )}>
                                    {task.title}
                                </p>

                                {/* Objective */}
                                {task.objective?.title && (
                                    <p className="text-xs text-foundry-500 mt-1 flex items-center">
                                        <Target className="h-3 w-3 mr-1 text-foundry-400" />
                                        {task.objective.title}
                                    </p>
                                )}

                                {/* Priority reasons */}
                                {task.reasons.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {task.reasons.map((reason, i) => {
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
                                                        "text-[10px] font-medium px-1.5 py-0",
                                                        isOverdue 
                                                            ? "bg-red-100 text-red-700 border-red-200" 
                                                            : isDueToday
                                                                ? "bg-amber-100 text-amber-700 border-amber-200"
                                                                : isDueTomorrow
                                                                    ? "bg-orange-100 text-orange-700 border-orange-200"
                                                                    : isStale
                                                                        ? "bg-purple-100 text-purple-700 border-purple-200"
                                                                        : isApproval
                                                                            ? "bg-blue-100 text-blue-700 border-blue-200"
                                                                            : "bg-foundry-100 text-foundry-600 border-foundry-200"
                                                    )}
                                                >
                                                    {isOverdue && <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />}
                                                    {(isDueToday || isDueTomorrow) && <Clock className="h-2.5 w-2.5 mr-0.5" />}
                                                    {isStale && <RefreshCw className="h-2.5 w-2.5 mr-0.5" />}
                                                    {reason}
                                                </Badge>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </Link>
            ))}

            {/* Show more hint if there are more tasks */}
            {tasks.length > maxTasks && (
                <Link href="/tasks" className="block">
                    <p className="text-xs text-center text-foundry-400 hover:text-foundry-600 py-2">
                        +{tasks.length - maxTasks} more tasks
                    </p>
                </Link>
            )}
        </div>
    )
}
