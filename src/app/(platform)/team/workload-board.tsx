"use client"

import { useState, useMemo } from "react"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight, AlertCircle, Flag, Target } from "lucide-react"
import { cn } from "@/lib/utils"
import { isPast, isThisWeek, addWeeks, isWithinInterval, startOfWeek, endOfWeek } from "date-fns"

// ─── Types ───────────────────────────────────────

interface ExtendedTask {
    id: string
    title: string
    status: string
    assignee_id: string | null
    end_date: string | null
    start_date: string | null
    created_at: string
    objective_id: string | null
    objective_title: string | null
    progress: number | null
    risk_level: string | null
}

interface WorkloadMember {
    id: string
    full_name: string
    role: string
    avatar_url: string | null
    activeTasks: number
    pendingTasks: number
}

interface WorkloadBoardProps {
    members: WorkloadMember[]
    allTasks: ExtendedTask[]
    onMemberClick?: (memberId: string) => void
    onTaskClick?: (taskId: string) => void
}

// ─── Time Bucket Logic ───────────────────────────

type TimeBucket = 'overdue' | 'this_week' | 'next_week' | 'later' | 'no_date'

const BUCKET_LABELS: Record<TimeBucket, string> = {
    overdue: 'Overdue',
    this_week: 'This Week',
    next_week: 'Next Week',
    later: 'Later',
    no_date: 'No Date',
}

const BUCKET_ORDER: TimeBucket[] = ['overdue', 'this_week', 'next_week', 'later', 'no_date']

function getTimeBucket(task: ExtendedTask): TimeBucket {
    if (!task.end_date) return 'no_date'
    const dueDate = new Date(task.end_date)
    const now = new Date()

    if (isPast(dueDate) && task.status !== 'Completed') return 'overdue'

    const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 })
    if (dueDate <= thisWeekEnd) return 'this_week'

    const nextWeekStart = addWeeks(startOfWeek(now, { weekStartsOn: 1 }), 1)
    const nextWeekEnd = endOfWeek(nextWeekStart, { weekStartsOn: 1 })
    if (isWithinInterval(dueDate, { start: nextWeekStart, end: nextWeekEnd })) return 'next_week'

    return 'later'
}

// ─── Status Colors ───────────────────────────────

const statusColors: Record<string, string> = {
    Accepted: 'bg-electric-blue',
    Pending: 'bg-amber-400',
    Completed: 'bg-emerald-500',
    Rejected: 'bg-red-500',
}

const riskColors: Record<string, string> = {
    high: 'text-red-500',
    medium: 'text-amber-500',
    low: 'text-emerald-500',
}

// ─── Task Card ───────────────────────────────────

function TaskCard({ task, onTaskClick }: { task: ExtendedTask; onTaskClick?: (id: string) => void }) {
    return (
        <button
            onClick={() => onTaskClick?.(task.id)}
            className={cn(
                "w-full text-left px-3 py-2.5 rounded-lg border border-muted bg-card",
                "hover:shadow-md hover:-translate-y-0.5 transition-all",
                "active:translate-y-0 active:shadow-sm",
                "group/task"
            )}
        >
            <div className="flex items-start gap-2">
                {/* Status dot */}
                <div className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", statusColors[task.status] || 'bg-muted-foreground')} />
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate group-hover/task:text-electric-blue transition-colors">
                        {task.title}
                    </p>
                    {task.objective_title && (
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                            <Target className="h-2.5 w-2.5 shrink-0" />
                            {task.objective_title}
                        </p>
                    )}
                </div>
                {task.risk_level && task.risk_level !== 'low' && (
                    <Flag className={cn("h-3 w-3 shrink-0 mt-0.5", riskColors[task.risk_level] || 'text-muted-foreground')} />
                )}
            </div>
            {task.progress !== null && task.progress > 0 && (
                <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full bg-electric-blue rounded-full transition-all"
                        style={{ width: `${Math.min(100, task.progress)}%` }}
                    />
                </div>
            )}
        </button>
    )
}

// ─── Capacity Bar ────────────────────────────────

function CapacityBar({ active, pending }: { active: number; pending: number }) {
    const score = Math.min(100, (active * 20) + (pending * 10))
    const color = score <= 40
        ? 'bg-emerald-500'
        : score <= 70
            ? 'bg-amber-400'
            : 'bg-red-500'
    const bgColor = score <= 40
        ? 'bg-status-success-light'
        : score <= 70
            ? 'bg-status-warning-light'
            : 'bg-status-error-light'

    return (
        <div className="flex items-center gap-2 min-w-[120px]">
            <div className={cn("h-2 flex-1 rounded-full overflow-hidden", bgColor)}>
                <div
                    className={cn("h-full rounded-full transition-all duration-500", color)}
                    style={{ width: `${score}%` }}
                />
            </div>
            <span className="text-[10px] text-muted-foreground font-medium tabular-nums w-7 text-right">{score}%</span>
        </div>
    )
}

// ─── Person Row ──────────────────────────────────

function PersonRow({
    member,
    tasksByBucket,
    isExpanded,
    onToggle,
    onMemberClick,
    onTaskClick,
}: {
    member: WorkloadMember
    tasksByBucket: Record<TimeBucket, ExtendedTask[]>
    isExpanded: boolean
    onToggle: () => void
    onMemberClick?: (id: string) => void
    onTaskClick?: (id: string) => void
}) {
    const totalTasks = Object.values(tasksByBucket).reduce((sum, tasks) => sum + tasks.length, 0)
    const hasOverdue = tasksByBucket.overdue.length > 0
    const isIdle = totalTasks === 0

    return (
        <div className={cn(
            "border-b border-muted last:border-0",
            isIdle && "bg-status-info-light/50",
            hasOverdue && !isIdle && "bg-status-error-light/30"
        )}>
            {/* Person Header */}
            <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={onToggle}
            >
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0 text-muted-foreground">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>

                <button
                    onClick={(e) => { e.stopPropagation(); onMemberClick?.(member.id) }}
                    className="flex items-center gap-2.5 min-w-[160px] hover:opacity-80 transition-opacity"
                >
                    <UserAvatar
                        name={member.full_name}
                        role={member.role}
                        size="sm"
                        className="border border-muted"
                    />
                    <div className="text-left">
                        <p className="text-sm font-medium text-foreground">{member.full_name}</p>
                        <p className="text-[10px] text-muted-foreground">{totalTasks} task{totalTasks !== 1 ? 's' : ''}</p>
                    </div>
                </button>

                <CapacityBar active={member.activeTasks} pending={member.pendingTasks} />

                {/* Bucket summary badges */}
                <div className="hidden sm:flex items-center gap-1.5 ml-auto">
                    {hasOverdue && (
                        <Badge variant="secondary" className="bg-status-error-light text-status-error-dark text-[10px] px-1.5 h-5 gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {tasksByBucket.overdue.length}
                        </Badge>
                    )}
                    {isIdle && (
                        <Badge variant="secondary" className="bg-status-info-light text-status-info-dark text-[10px] px-1.5 h-5">
                            Idle
                        </Badge>
                    )}
                </div>
            </div>

            {/* Expanded: Task Grid */}
            {isExpanded && (
                <div className="overflow-x-auto border-t border-muted">
                <div className="grid grid-cols-5 gap-px bg-muted/30 min-w-[500px]">
                    {BUCKET_ORDER.map(bucket => (
                        <div
                            key={bucket}
                            className={cn(
                                "p-2 min-h-[60px] bg-background",
                                bucket === 'overdue' && tasksByBucket.overdue.length > 0 && "bg-status-error-light/50"
                            )}
                        >
                            {tasksByBucket[bucket].length === 0 ? (
                                <div className="h-full flex items-center justify-center">
                                    <span className="text-[10px] text-muted-foreground/40">--</span>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    {tasksByBucket[bucket].map(task => (
                                        <TaskCard key={task.id} task={task} onTaskClick={onTaskClick} />
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                </div>
            )}
        </div>
    )
}

// ─── Main Component ──────────────────────────────

export function WorkloadBoard({ members, allTasks, onMemberClick, onTaskClick }: WorkloadBoardProps) {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

    const toggleExpanded = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const expandAll = () => {
        setExpandedIds(new Set(members.map(m => m.id)))
    }

    const collapseAll = () => {
        setExpandedIds(new Set())
    }

    // Active/Pending tasks grouped by member and time bucket
    const memberBuckets = useMemo(() => {
        const map = new Map<string, Record<TimeBucket, ExtendedTask[]>>()

        for (const member of members) {
            const buckets: Record<TimeBucket, ExtendedTask[]> = {
                overdue: [],
                this_week: [],
                next_week: [],
                later: [],
                no_date: [],
            }

            const memberTasks = allTasks.filter(t =>
                t.assignee_id === member.id &&
                (t.status === 'Accepted' || t.status === 'Pending')
            )

            for (const task of memberTasks) {
                const bucket = getTimeBucket(task)
                buckets[bucket].push(task)
            }

            map.set(member.id, buckets)
        }

        return map
    }, [members, allTasks])

    // Sort: overloaded first, then by active task count desc, idle last
    const sortedMembers = useMemo(() => {
        return [...members]
            .filter(m => m.role !== 'AI_Agent')
            .sort((a, b) => {
                const aOverdue = (memberBuckets.get(a.id)?.overdue.length || 0)
                const bOverdue = (memberBuckets.get(b.id)?.overdue.length || 0)
                if (aOverdue !== bOverdue) return bOverdue - aOverdue
                const aTotal = a.activeTasks + a.pendingTasks
                const bTotal = b.activeTasks + b.pendingTasks
                return bTotal - aTotal
            })
    }, [members, memberBuckets])

    if (sortedMembers.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No team members to display.</p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {/* Controls */}
            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                    {sortedMembers.length} team member{sortedMembers.length !== 1 ? 's' : ''}
                </p>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={expandAll}>
                        Expand All
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={collapseAll}>
                        Collapse All
                    </Button>
                </div>
            </div>

            {/* Board */}
            <div className="border border-muted rounded-xl overflow-x-auto">
                <div className="min-w-[500px]">
                {/* Column Headers */}
                <div className="grid grid-cols-5 gap-px bg-muted/50 border-b border-muted">
                    {BUCKET_ORDER.map(bucket => (
                        <div
                            key={bucket}
                            className={cn(
                                "px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center",
                                bucket === 'overdue' && "text-destructive"
                            )}
                        >
                            {BUCKET_LABELS[bucket]}
                        </div>
                    ))}
                </div>

                {/* Person Rows */}
                {sortedMembers.map(member => (
                    <PersonRow
                        key={member.id}
                        member={member}
                        tasksByBucket={memberBuckets.get(member.id) || { overdue: [], this_week: [], next_week: [], later: [], no_date: [] }}
                        isExpanded={expandedIds.has(member.id)}
                        onToggle={() => toggleExpanded(member.id)}
                        onMemberClick={onMemberClick}
                        onTaskClick={onTaskClick}
                    />
                ))}
                </div>
            </div>
        </div>
    )
}
