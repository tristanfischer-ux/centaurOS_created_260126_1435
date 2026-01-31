"use client"

import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { Gantt, Task as GanttTask, ViewMode } from "gantt-task-react"
import "gantt-task-react/dist/index.css"
import { Database } from "@/types/database.types"
import { MultiSelect } from "@/components/ui/multi-select"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
} from "@/components/ui/dialog"
import { ChevronLeft, ChevronRight, CalendarDays, ArrowUpDown, X } from "lucide-react"
import { updateTaskDates } from "@/actions/tasks"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from "date-fns"
import { getStatusHex } from "@/lib/status-colors"
import { TaskCard } from "@/app/(platform)/tasks/task-card"

// Profile type for assignees
type AssigneeProfile = {
    id: string
    full_name: string | null
    role: string | null
    email: string | null
}

// Types for joined data
export type JoinedTask = Database["public"]["Tables"]["tasks"]["Row"] & {
    profiles: Database["public"]["Tables"]["profiles"]["Row"] | null
    objectives: Database["public"]["Tables"]["objectives"]["Row"] | null
    task_assignees?: { profile: AssigneeProfile | null }[]
}



type Member = {
    id: string
    full_name: string
    role: string
}

export type GanttViewProps = {
    tasks: JoinedTask[]
    objectives: Database["public"]["Tables"]["objectives"]["Row"][]
    profiles: Database["public"]["Tables"]["profiles"]["Row"][]
    members?: Member[]
    currentUserId?: string
}

// Extended GanttTask with task number and assignees for avatars
interface ExtendedGanttTask extends GanttTask {
    taskNumber?: number
    assigneeName?: string | null
    assigneeRole?: string | null
    assignees?: AssigneeProfile[] // All assignees for multi-assignee display
    taskProgress?: number // Actual progress percentage from DB
    taskStatus?: string | null // Task status for legend reference
}

// Get initials from full name
function getInitials(fullName: string | null | undefined): string {
    if (!fullName) return "?"
    const parts = fullName.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// Avatar color based on name (consistent color per person)
function getAvatarColor(name: string | null | undefined): string {
    if (!name) return "bg-muted"
    const colors = [
        "bg-chart-2", "bg-chart-3", "bg-chart-5", "bg-chart-6",
        "bg-chart-4", "bg-chart-1", "bg-chart-2", "bg-chart-3"
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
}

// Calculate progress based on task status
function getProgress(status: string | null): number {
    switch (status) {
        case 'Completed': return 100
        case 'Accepted': return 50
        case 'Pending': return 0
        case 'Rejected': return 0
        default: return 0
    }
}

// Check if task is overdue
function isOverdue(endDate: Date | null | undefined): boolean {
    if (!endDate) return false
    return endDate < new Date()
}

// Check if task is due soon (within 3 days)
function isDueSoon(endDate: Date | null | undefined): boolean {
    if (!endDate) return false
    const now = new Date()
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    return endDate >= now && endDate <= threeDaysFromNow
}

// Get bar color based on urgency and status
function getBarColor(task: { status: string | null, end_date: string | null }): string {
    const endDate = task.end_date ? new Date(task.end_date) : null
    
    // Overdue tasks are red
    if (isOverdue(endDate) && task.status !== 'Completed') {
        return '#ef4444' // red-500
    }
    
    // Due soon tasks are yellow/orange
    if (isDueSoon(endDate) && task.status !== 'Completed') {
        return '#f59e0b' // amber-500
    }
    
    // Status-based colors using centralized utility
    return getStatusHex(task.status)
}

// Initials Avatar Component
function InitialsAvatar({
    name,
    size = "sm",
    isAI = false
}: {
    name: string | null | undefined
    size?: "xs" | "sm"
    isAI?: boolean
}) {
    const initials = getInitials(name)
    const bgColor = isAI ? "bg-status-warning" : getAvatarColor(name)
    const sizeClasses = size === "xs" ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]"

    return (
        <div className={`${sizeClasses} ${bgColor} rounded-full flex items-center justify-center text-white font-semibold shrink-0`}>
            {isAI ? "🤖" : initials}
        </div>
    )
}

// Custom Header Component
function CustomTaskListHeader({ headerHeight }: { headerHeight: number }) {
    return (
        <div
            className="flex items-center bg-muted text-xs font-medium text-muted-foreground"
            style={{ height: headerHeight }}
        >
            <div className="w-10 px-2 text-center">#</div>
            <div className="flex-1 px-2 min-w-[120px]">Name</div>
            <div className="w-20 px-2 text-center">From</div>
            <div className="w-20 px-2 text-center">To</div>
        </div>
    )
}

// Multi-assignee avatar stack component
function AssigneeAvatarStack({ assignees, maxDisplay = 3 }: { assignees: AssigneeProfile[], maxDisplay?: number }) {
    if (!assignees || assignees.length === 0) {
        return <InitialsAvatar name={null} size="xs" />
    }

    const displayedAssignees = assignees.slice(0, maxDisplay)
    const remainingCount = assignees.length - maxDisplay

    return (
        <div className="flex items-center -space-x-1.5">
            {displayedAssignees.map((assignee, idx) => (
                <div key={assignee.id} style={{ zIndex: maxDisplay - idx }} className="ring-1 ring-white rounded-full">
                    <InitialsAvatar
                        name={assignee.full_name}
                        size="xs"
                        isAI={assignee.role === 'AI_Agent'}
                    />
                </div>
            ))}
            {remainingCount > 0 && (
                <div className="h-5 w-5 bg-muted rounded-full flex items-center justify-center text-[8px] font-semibold text-muted-foreground ring-1 ring-white">
                    +{remainingCount}
                </div>
            )}
        </div>
    )
}

// Custom Table Row Component - receives sortedTasks from closure to maintain our sort order
function CustomTaskListTable({
    rowHeight,
    onExpanderClick,
    sortedTasks
}: {
    tasks: ExtendedGanttTask[] // Still required by Gantt library signature, but we ignore it
    rowHeight: number
    onExpanderClick: (task: GanttTask) => void
    sortedTasks: ExtendedGanttTask[] // Our properly sorted tasks from closure
}) {
    return (
        <div>
            {sortedTasks.map(task => {
                // Extract task number from name if present (e.g., "Task 19: Review" -> 19)
                const taskNumMatch = task.name.match(/^Task (\d+):/i)
                const taskNum = task.taskNumber || (taskNumMatch ? taskNumMatch[1] : '-')
                const displayName = task.name.replace(/^Task \d+:\s*/i, '')
                const progressPct = task.taskProgress ?? task.progress

                return (
                    <div
                        key={task.id}
                        className="flex items-center hover:bg-muted text-sm cursor-pointer"
                        style={{ height: rowHeight }}
                        onClick={() => onExpanderClick(task)}
                    >
                        <div className="w-10 px-2 text-center text-muted-foreground text-xs font-mono">{taskNum}</div>
                        <div className="flex-1 px-2 min-w-[120px] flex items-center gap-2">
                            {/* Show multiple assignees if available, otherwise fall back to single */}
                            {task.assignees && task.assignees.length > 0 ? (
                                <AssigneeAvatarStack assignees={task.assignees} />
                            ) : (
                                <InitialsAvatar
                                    name={task.assigneeName}
                                    size="xs"
                                    isAI={task.assigneeRole === 'AI_Agent'}
                                />
                            )}
                            <span className="text-foreground truncate">{displayName}</span>
                            {/* Progress percentage badge */}
                            {progressPct > 0 && progressPct < 100 && (
                                <span className="ml-auto shrink-0 text-[10px] font-medium text-electric-blue bg-electric-blue-light px-1.5 py-0.5 rounded">
                                    {progressPct}%
                                </span>
                            )}
                            {progressPct === 100 && (
                                <span className="ml-auto shrink-0 text-[10px] font-medium text-status-success bg-status-success-light px-1.5 py-0.5 rounded">
                                    100%
                                </span>
                            )}
                        </div>
                        <div className="w-20 px-2 text-center text-muted-foreground text-xs">
                            {format(task.start, 'd MMM')}
                        </div>
                        <div className="w-20 px-2 text-center text-muted-foreground text-xs">
                            {format(task.end, 'd MMM')}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// Custom Tooltip Component
const CustomTooltip = ({ task }: { task: GanttTask, fontSize: string, fontFamily: string }) => {
    const extendedTask = task as ExtendedGanttTask
    const startDate = task.start
    const endDate = task.end
    // Calculate duration in days (inclusive)
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    const progress = extendedTask.taskProgress ?? task.progress

    return (
        <div style={{
            backgroundColor: 'white',
            padding: '12px',
            boxShadow: '0 4px 12px -1px rgba(0, 0, 0, 0.15), 0 2px 6px -1px rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            fontSize: '12px',
            fontFamily: 'var(--font-geist-sans), sans-serif',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            // CRITICAL: Move tooltip UP to avoid blocking the task bar
            transform: 'translateY(-130%)',
            pointerEvents: 'none', // Ensure clicks pass through to the task bar below
            zIndex: 50,
            color: '#0f172a' // slate-900
        }}>
            <div className="font-bold mb-1">{task.name}</div>
            <div className="text-muted-foreground mb-1">
                {format(startDate, 'MMM d')} - {format(endDate, 'MMM d, yyyy')}
            </div>
            <div className="flex items-center gap-3 mt-2">
                <div className="text-status-warning text-xs font-semibold">
                    Duration: {diffDays} day{diffDays !== 1 ? 's' : ''}
                </div>
                <div className="text-electric-blue text-xs font-semibold">
                    Progress: {progress}%
                </div>
            </div>
            {extendedTask.assignees && extendedTask.assignees.length > 0 && (
                <div className="text-muted-foreground text-xs mt-1.5 border-t border-muted pt-1.5">
                    Assigned: {extendedTask.assignees.map(a => a.full_name || 'Unknown').join(', ')}
                </div>
            )}
        </div>
    )
}

export function GanttView({ tasks, objectives, profiles, members = [], currentUserId = '' }: GanttViewProps) {
    const router = useRouter()
    const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day)
    const [selectedObjectives, setSelectedObjectives] = useState<string[]>([])
    
    // Task detail modal state
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
    const selectedTask = useMemo(() => {
        if (!selectedTaskId) return null
        return tasks.find(t => t.id === selectedTaskId) || null
    }, [selectedTaskId, tasks])
    const [selectedMembers, setSelectedMembers] = useState<string[]>([])
    const [sortBy, setSortBy] = useState<'start_date' | 'end_date' | 'task_number' | 'alphabetical'>('end_date')

    // Optimistic local state for task dates (prevents "bounce back")
    const [localDateOverrides, setLocalDateOverrides] = useState<Record<string, { start: Date, end: Date }>>({})

    // Date navigation offset
    const [dateOffset, setDateOffset] = useState<Date>(new Date())

    // Ref to track cleanup timeout for date change
    const dateChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (dateChangeTimeoutRef.current) {
                clearTimeout(dateChangeTimeoutRef.current)
            }
        }
    }, [])

    // Clear optimistic overrides when server data matches our updates (confirming sync)
    useEffect(() => {
        if (Object.keys(localDateOverrides).length === 0) return
        
        // Helper to compare dates at day level (ignoring time precision)
        const isSameDay = (date1: Date, date2: Date) => {
            return date1.getFullYear() === date2.getFullYear() &&
                   date1.getMonth() === date2.getMonth() &&
                   date1.getDate() === date2.getDate()
        }
        
        // Check each override to see if server data now matches
        const updatedOverrides = { ...localDateOverrides }
        let hasChanges = false
        
        for (const [taskId, override] of Object.entries(localDateOverrides)) {
            const serverTask = tasks.find(t => t.id === taskId)
            if (serverTask) {
                const serverStart = serverTask.start_date ? new Date(serverTask.start_date) : null
                const serverEnd = serverTask.end_date ? new Date(serverTask.end_date) : null
                
                // If server data matches our optimistic update (comparing at day level)
                const startMatches = serverStart && isSameDay(serverStart, override.start)
                const endMatches = serverEnd && isSameDay(serverEnd, override.end)
                
                if (startMatches && endMatches) {
                    delete updatedOverrides[taskId]
                    hasChanges = true
                    // Clear the timeout since we've confirmed sync
                    if (dateChangeTimeoutRef.current) {
                        clearTimeout(dateChangeTimeoutRef.current)
                        dateChangeTimeoutRef.current = null
                    }
                }
            }
        }
        
        if (hasChanges) {
            setLocalDateOverrides(updatedOverrides)
        }
    }, [tasks, localDateOverrides])

    // Navigate dates left/right
    const navigateDate = (direction: 'prev' | 'next') => {
        setDateOffset(prev => {
            if (viewMode === ViewMode.Day) {
                return direction === 'next' ? addDays(prev, 7) : subDays(prev, 7)
            } else if (viewMode === ViewMode.Week) {
                return direction === 'next' ? addWeeks(prev, 4) : subWeeks(prev, 4)
            } else {
                return direction === 'next' ? addMonths(prev, 2) : subMonths(prev, 2)
            }
        })
    }

    const goToToday = () => setDateOffset(new Date())

    // Transform options for multi-select (shorten objective titles)
    const objectiveOptions = useMemo(() => {
        return objectives.map((obj, idx) => {
            // Remove "Strategic Objective X:" prefix if present
            const shortTitle = (obj.title || 'Untitled').replace(/^Strategic Objective \d+:\s*/i, '')
            // Truncate if still too long
            const label = shortTitle.length > 20 ? shortTitle.substring(0, 18) + '...' : shortTitle
            return {
                value: obj.id,
                label: `${idx + 1}. ${label}`
            }
        })
    }, [objectives])

    const memberOptions = useMemo(() => {
        return profiles.map(p => ({
            value: p.id,
            label: p.full_name || 'Unknown',
            icon: p.role === 'AI_Agent' ? '🤖' : '👤'
        }))
    }, [profiles])

    // Filter Logic (empty selection = show all)
    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            if (selectedObjectives.length > 0 && !selectedObjectives.includes(task.objective_id || '')) return false
            if (selectedMembers.length > 0 && !selectedMembers.includes(task.assignee_id || '')) return false
            return true
        })
    }, [tasks, selectedObjectives, selectedMembers])

    // Transform to Gantt Library Format (with optimistic overrides and assignee info)
    // Sort FIRST, then slice to limit - order matters!
    const ganttTasks: ExtendedGanttTask[] = useMemo(() => {
        // Helper to safely parse date, returns timestamp or Infinity for invalid/missing dates
        const parseDate = (dateStr: string | null | undefined): number => {
            if (!dateStr) return Infinity
            const parsed = new Date(dateStr)
            if (isNaN(parsed.getTime())) return Infinity
            return parsed.getTime()
        }

        const sorted = [...filteredTasks].sort((a, b) => {
            if (sortBy === 'task_number') {
                return (a.task_number || 0) - (b.task_number || 0)
            }
            if (sortBy === 'alphabetical') {
                const aTitle = (a.title || '').toLowerCase()
                const bTitle = (b.title || '').toLowerCase()
                return aTitle.localeCompare(bTitle)
            }
            if (sortBy === 'start_date') {
                const aStart = parseDate(a.start_date)
                const bStart = parseDate(b.start_date)
                // Secondary sort by task number for same dates
                if (aStart === bStart) {
                    return (a.task_number || 0) - (b.task_number || 0)
                }
                return aStart - bStart
            }
            // Default: Sort by deadline (end_date) - soonest first
            const aEnd = parseDate(a.end_date)
            const bEnd = parseDate(b.end_date)
            // Secondary sort by task number for same dates
            if (aEnd === bEnd) {
                return (a.task_number || 0) - (b.task_number || 0)
            }
            return aEnd - bEnd
        })
        
        return sorted.slice(0, 50)
            .map(task => {
                // Check for optimistic override first
                const override = localDateOverrides[task.id]
                const startDate = override?.start ?? (task.start_date ? new Date(task.start_date) : new Date())
                // Ensure date is valid, fallback to now if missing
                if (isNaN(startDate.getTime())) {
                    // Should technically not happen if filtered correctly or defaulted, but adding safety
                }

                // If end date is missing or invalid, default to start + 1 day
                let endDate = override?.end ?? (task.end_date ? new Date(task.end_date) : new Date(startDate.getTime() + 86400000))

                // Ensure end > start
                if (endDate <= startDate) {
                    endDate = new Date(startDate.getTime() + 86400000)
                }

                // Get color based on urgency and status
                const color = getBarColor({ status: task.status, end_date: task.end_date })
                const progress = getProgress(task.status)

                // Get all assignees from task_assignees
                const allAssignees: AssigneeProfile[] = (task.task_assignees || [])
                    .map(ta => ta.profile)
                    .filter((p): p is AssigneeProfile => p !== null)

                // Use actual progress from DB if available, otherwise derive from status
                const actualProgress = typeof task.progress === 'number' ? task.progress : progress

                return {
                    start: startDate,
                    end: endDate,
                    name: task.title || "Untitled Task",
                    id: task.id,
                    type: "task" as const,
                    progress: actualProgress,
                    isDisabled: false, // ENABLED for drag-drop (dates)
                    styles: {
                        progressColor: color,
                        progressSelectedColor: color,
                        backgroundColor: color,
                    },
                    // Assignee info for avatar (primary)
                    assigneeName: task.profiles?.full_name,
                    assigneeRole: task.profiles?.role,
                    taskNumber: task.task_number,
                    // All assignees for multi-display
                    assignees: allAssignees.length > 0 ? allAssignees : (task.profiles ? [{
                        id: task.profiles.id,
                        full_name: task.profiles.full_name,
                        role: task.profiles.role,
                        email: task.profiles.email
                    }] : []),
                    taskProgress: actualProgress,
                    taskStatus: task.status
                }
            })

    }, [filteredTasks, localDateOverrides, sortBy])


    // Handler: When task bar is dragged or resized
    const handleDateChange = async (task: GanttTask) => {
        // Apply optimistic update FIRST (prevents bounce-back)
        setLocalDateOverrides(prev => ({
            ...prev,
            [task.id]: { start: task.start, end: task.end }
        }))

        try {
            const result = await updateTaskDates(
                task.id,
                task.start.toISOString(),
                task.end.toISOString()
            )
            if (result.error) {
                // Revert optimistic update on error
                setLocalDateOverrides(prev => {
                    const next = { ...prev }
                    delete next[task.id]
                    return next
                })
                toast.error(result.error)
            } else {
                toast.success(`Rescheduled: ${task.name}`)
                // Trigger server refresh to get updated data
                router.refresh()
                // The optimistic override will be cleared by the useEffect when server data matches
                // Use a fallback timeout of 10 seconds in case server refresh is delayed
                if (dateChangeTimeoutRef.current) {
                    clearTimeout(dateChangeTimeoutRef.current)
                }
                dateChangeTimeoutRef.current = setTimeout(() => {
                    setLocalDateOverrides(prev => {
                        const next = { ...prev }
                        delete next[task.id]
                        return next
                    })
                }, 10000)
            }
        } catch {
            // Revert optimistic update on error
            setLocalDateOverrides(prev => {
                const next = { ...prev }
                delete next[task.id]
                return next
            })
            toast.error("Failed to update task dates")
        }
    }

    // Handler: Double-click opens task detail modal
    const handleDoubleClick = (task: GanttTask) => {
        setSelectedTaskId(task.id)
    }

    // Handler: Click shows task info
    const handleClick = () => {
        // Optional: Keep standard click behavior or remove if it conflicts
        // toast.info(`${task.name} • ${task.start.toLocaleDateString()} → ${task.end.toLocaleDateString()}`)
    }

    // Memoized TaskListTable wrapper to pass sorted tasks and prevent unnecessary re-renders
    const TaskListTableWithSortedTasks = useCallback(
        (props: { tasks: ExtendedGanttTask[]; rowHeight: number; onExpanderClick: (task: GanttTask) => void }) => (
            <CustomTaskListTable
                {...props}
                sortedTasks={ganttTasks}
            />
        ),
        [ganttTasks]
    )



    return (
        <div className="space-y-4">
            {/* Color Legend */}
            <div className="flex flex-wrap items-center justify-between gap-4 px-1">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-muted-foreground font-medium">Status:</span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#9ca3af' }}></span>
                        <span className="text-muted-foreground">Pending</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#3b82f6' }}></span>
                        <span className="text-muted-foreground">Accepted</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#22c55e' }}></span>
                        <span className="text-muted-foreground">Completed</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#f59e0b' }}></span>
                        <span className="text-muted-foreground">Due Soon</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#ef4444' }}></span>
                        <span className="text-muted-foreground">Overdue</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#a855f7' }}></span>
                        <span className="text-muted-foreground">Pending Approval</span>
                    </span>
                </div>
                <div className="text-xs text-muted-foreground flex gap-4">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted"></span> Drag bar to reschedule</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted"></span> Drag edges to resize duration</span>
                </div>
            </div>
            {/* Control Bar */}
            <Card className="p-4 flex flex-wrap gap-4 items-center justify-between shadow-sm">
                <div className="flex gap-4 flex-wrap">
                    <MultiSelect
                        options={objectiveOptions}
                        selected={selectedObjectives}
                        onChange={setSelectedObjectives}
                        placeholder="All Objectives"
                        emptyMessage="No objectives found"
                    />

                    <MultiSelect
                        options={memberOptions}
                        selected={selectedMembers}
                        onChange={setSelectedMembers}
                        placeholder="All Members"
                        emptyMessage="No members found"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'start_date' | 'end_date' | 'task_number' | 'alphabetical')}>
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                            <ArrowUpDown className="w-3 h-3 mr-2 text-muted-foreground" />
                            <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="end_date">Deadline</SelectItem>
                            <SelectItem value="start_date">Start Date</SelectItem>
                            <SelectItem value="task_number">Task #</SelectItem>
                            <SelectItem value="alphabetical">A-Z</SelectItem>
                        </SelectContent>
                    </Select>

                    <div className="flex gap-1 bg-muted p-1 rounded-lg shadow-sm">
                        <Button
                            variant={viewMode === ViewMode.Day ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setViewMode(ViewMode.Day)}
                            className={viewMode === ViewMode.Day ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}
                        >
                            Day
                        </Button>
                        <Button
                            variant={viewMode === ViewMode.Week ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setViewMode(ViewMode.Week)}
                            className={viewMode === ViewMode.Week ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}
                        >
                            Week
                        </Button>
                        <Button
                            variant={viewMode === ViewMode.Month ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setViewMode(ViewMode.Month)}
                            className={viewMode === ViewMode.Month ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}
                        >
                            Month
                        </Button>
                    </div>

                    {/* Date Navigation */}
                    <div className="flex items-center gap-2">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => navigateDate('prev')}
                                        className="min-h-[44px] min-w-[44px] h-9 w-9 p-0"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Previous</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={goToToday}
                                        className="h-9 px-3 text-xs"
                                    >
                                        <CalendarDays className="h-3 w-3 mr-1" />
                                        Today
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Today</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => navigateDate('next')}
                                        className="min-h-[44px] min-w-[44px] h-9 w-9 p-0"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Next</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>
            </Card>

            {/* Gantt Chart or Empty State */}
            {ganttTasks.length === 0 ? (
                <div className="bg-card rounded-lg shadow-md text-center py-16 text-muted-foreground">
                    No tasks match current filters.
                </div>
            ) : (
                <div className="bg-card rounded-lg overflow-hidden shadow-md">
                    <Gantt
                        key={`gantt-${sortBy}-${dateOffset.getTime()}`} // Force re-render when sort or date changes
                        tasks={ganttTasks}
                        viewMode={viewMode}
                        viewDate={dateOffset}
                        listCellWidth="300px"
                        columnWidth={viewMode === ViewMode.Month ? 300 : viewMode === ViewMode.Week ? 150 : 65}
                        barFill={80} // Thicker bars for easier grabbing
                        onDateChange={handleDateChange}
                        onDoubleClick={handleDoubleClick}
                        onClick={handleClick}
                        TaskListHeader={CustomTaskListHeader}
                        TaskListTable={TaskListTableWithSortedTasks}
                        TooltipContent={CustomTooltip}
                    />
                </div>
            )}

            {/* Task Detail Modal */}
            <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTaskId(null)}>
                <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto p-0 bg-transparent border-0 shadow-none">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-2 z-50 h-8 w-8 rounded-full bg-background/90 hover:bg-background shadow-md"
                        onClick={() => setSelectedTaskId(null)}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                    {selectedTask && (
                        <TaskCard
                            task={{
                                ...selectedTask,
                                assignee: selectedTask.profiles ? {
                                    id: selectedTask.profiles.id,
                                    full_name: selectedTask.profiles.full_name,
                                    role: selectedTask.profiles.role || 'Apprentice',
                                    email: selectedTask.profiles.email || ''
                                } : null,
                                assignees: selectedTask.task_assignees?.map(ta => ({
                                    id: ta.profile?.id || '',
                                    full_name: ta.profile?.full_name || null,
                                    role: ta.profile?.role || 'Apprentice',
                                    email: ta.profile?.email || ''
                                })).filter(a => a.id) || [],
                                objective: selectedTask.objectives ? {
                                    id: selectedTask.objectives.id,
                                    title: selectedTask.objectives.title || 'Untitled'
                                } : null
                            }}
                            currentUserId={currentUserId}
                            members={members}
                            expanded={true}
                            onToggle={() => {}}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
