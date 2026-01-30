"use client"

import { useState, useMemo, useEffect } from "react"
import { Database } from "@/types/database.types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, Clock, ChevronRight, ChevronDown, Target, Check, Plus, Calendar as CalendarIcon, Maximize2 } from "lucide-react"
import Link from "next/link"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { FullTaskView } from "@/components/tasks/full-task-view"
import { updateTaskAssignees, updateTaskDates } from "@/actions/tasks"
import { toast } from "sonner"
import { format } from "date-fns"
import { getStatusBarClass, getStatusBadgeClass } from "@/lib/status-colors"

// Types for joined data
type JoinedTask = Database["public"]["Tables"]["tasks"]["Row"] & {
    profiles: Database["public"]["Tables"]["profiles"]["Row"] | null
    objectives: Database["public"]["Tables"]["objectives"]["Row"] | null
    // Assignees support
    assignees?: { id: string, full_name: string | null, role: string, email: string, avatar_url?: string | null }[]
    assignee?: { id: string, full_name: string | null, role: string, email: string, avatar_url?: string | null } | null
}

interface TimelineListViewProps {
    tasks: JoinedTask[]
    members: { id: string, full_name: string, role: string, email?: string }[]
    currentUserId: string
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
    if (!name) return "bg-slate-400"
    const colors = [
        "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-pink-500",
        "bg-indigo-500", "bg-teal-500", "bg-orange-500", "bg-cyan-500"
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
}

// Initials Avatar Component
function InitialsAvatar({
    name,
    size = "md",
    isAI = false
}: {
    name: string | null | undefined
    size?: "sm" | "md"
    isAI?: boolean
}) {
    const initials = getInitials(name)
    const bgColor = isAI ? "bg-amber-500" : getAvatarColor(name)
    const sizeClasses = size === "sm" ? "h-5 w-5 text-[10px]" : "h-8 w-8 text-xs"

    return (
        <div className={`${sizeClasses} ${bgColor} rounded-full flex items-center justify-center text-white font-semibold shrink-0`}>
            {isAI ? "🤖" : initials}
        </div>
    )
}

// Group tasks by DUE DATE (end_date)
// Tasks with due dates before today are grouped as "Overdue"
function groupTasksByDueDate(tasks: JoinedTask[]) {
    const groups: Record<string, JoinedTask[]> = {}
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    tasks.forEach(task => {
        let groupKey: string

        if (!task.end_date) {
            groupKey = 'No Due Date'
        } else {
            const dueDate = new Date(task.end_date)
            dueDate.setHours(0, 0, 0, 0)

            if (dueDate < today && task.status !== 'Completed') {
                // Overdue: due date before today AND not completed
                groupKey = '⚠️ Overdue'
            } else {
                // Normal: show the due date
                groupKey = new Date(task.end_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            }
        }

        if (!groups[groupKey]) groups[groupKey] = []
        groups[groupKey].push(task)
    })

    return groups
}




// Mini timeline bar component with avatar
// Uses stable timestamp to avoid SSR/hydration mismatch
function MiniTimelineBar({ task, windowStart, windowEnd, stableNow }: {
    task: JoinedTask
    windowStart: Date
    windowEnd: Date
    stableNow: number // Timestamp passed from parent to ensure consistency
}) {
    const windowDuration = windowEnd.getTime() - windowStart.getTime()

    const taskStart = task.start_date ? new Date(task.start_date) : new Date(stableNow)
    const taskEnd = task.end_date ? new Date(task.end_date) : new Date(taskStart.getTime() + 86400000 * 2)

    // Calculate positions as percentages (rounded to avoid floating point precision issues)
    const startPercent = Math.round(Math.max(0, Math.min(100,
        ((taskStart.getTime() - windowStart.getTime()) / windowDuration) * 100
    )) * 100) / 100
    const endPercent = Math.round(Math.max(0, Math.min(100,
        ((taskEnd.getTime() - windowStart.getTime()) / windowDuration) * 100
    )) * 100) / 100
    const widthPercent = Math.round(Math.max(8, endPercent - startPercent) * 100) / 100 // Minimum 8% width for avatar visibility

    // Calculate progress through the task
    let progressPercent = 0
    if (task.status === 'Completed') {
        progressPercent = 100
    } else if (stableNow > taskEnd.getTime()) {
        progressPercent = 100 // Overdue
    } else if (stableNow > taskStart.getTime()) {
        progressPercent = Math.round(((stableNow - taskStart.getTime()) / (taskEnd.getTime() - taskStart.getTime())) * 10000) / 100
    }

    // Today marker position (rounded)
    const todayPercent = Math.round(Math.max(0, Math.min(100,
        ((stableNow - windowStart.getTime()) / windowDuration) * 100
    )) * 100) / 100

    const isAI = task.profiles?.role === 'AI_Agent'

    return (
        <div className="relative w-full h-7 bg-muted rounded-md overflow-hidden">
            {/* Today marker */}
            <div
                className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                style={{ left: `${todayPercent}%` }}
            />

            {/* Task bar background */}
            <div
                className={`absolute top-0.5 bottom-0.5 rounded-full ${getStatusBarClass(task.status)} opacity-30`}
                style={{
                    left: `${startPercent}%`,
                    width: `${widthPercent}%`,
                }}
            />

            {/* Task bar progress fill */}
            <div
                className={`absolute top-0.5 bottom-0.5 rounded-full ${getStatusBarClass(task.status)}`}
                style={{
                    left: `${startPercent}%`,
                    width: `${Math.round((widthPercent * progressPercent) / 100 * 100) / 100}%`,
                }}
            />

            {/* Avatar at start of task bar */}
            <div
                className="absolute top-0 flex items-center h-full z-20"
                style={{ left: `calc(${startPercent}% + 2px)` }}
            >
                <InitialsAvatar
                    name={task.profiles?.full_name}
                    size="sm"
                    isAI={isAI}
                />
            </div>
        </div>
    )
}

export function TimelineListView({ tasks, members, currentUserId }: TimelineListViewProps) {
    const [expandedDate, setExpandedDate] = useState<string | null>(null)
    const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set())
    const [selectedTask, setSelectedTask] = useState<JoinedTask | null>(null)
    const [taskModalOpen, setTaskModalOpen] = useState(false)
    
    // Use stable timestamp to avoid hydration mismatch - starts as noon today for SSR consistency
    const [stableNow, setStableNow] = useState<number>(() => {
        const d = new Date()
        d.setHours(12, 0, 0, 0) // Use noon as stable initial value
        return d.getTime()
    })

    // Update to real "now" after hydration completes
    useEffect(() => {
        setStableNow(Date.now())
    }, [])

    // Sorted members for picker
    const sortedMembers = useMemo(() =>
        [...members].sort((a, b) => a.full_name.localeCompare(b.full_name)),
        [members])

    // Toggle individual task collapse/expand
    const toggleTaskCollapse = (taskId: string, e: React.MouseEvent) => {
        // Only toggle if clicking the container or chevron, not interactive elements
        // This is handled by stopPropagation on interactive elements
        e.preventDefault()
        setCollapsedTasks(prev => {
            const newSet = new Set(prev)
            if (newSet.has(taskId)) {
                newSet.delete(taskId)
            } else {
                newSet.add(taskId)
            }
            return newSet
        })
    }
    
    // Open task modal
    const openTaskModal = (task: JoinedTask, e: React.MouseEvent) => {
        e.stopPropagation()
        setSelectedTask(task)
        setTaskModalOpen(true)
    }

    const groupedTasks = useMemo(() => groupTasksByDueDate(tasks), [tasks])
    const dateKeys = Object.keys(groupedTasks).sort((a, b) => {
        // Overdue always first (most urgent)
        if (a === '⚠️ Overdue') return -1
        if (b === '⚠️ Overdue') return 1
        // No Due Date always last
        if (a === 'No Due Date') return 1
        if (b === 'No Due Date') return -1
        // Rest sorted chronologically
        return new Date(a).getTime() - new Date(b).getTime()
    })

    // Calculate timeline window using stable timestamp
    const windowStart = useMemo(() => {
        const d = new Date(stableNow)
        d.setDate(d.getDate() - 3)
        d.setHours(0, 0, 0, 0)
        return d
    }, [stableNow])

    const windowEnd = useMemo(() => {
        const d = new Date(stableNow)
        d.setDate(d.getDate() + 11)
        d.setHours(23, 59, 59, 999)
        return d
    }, [stableNow])

    // Generate date markers for the timeline header
    const dateMarkers = useMemo(() => {
        const markers: { label: string; isToday: boolean }[] = []
        const current = new Date(windowStart)
        const todayStr = new Date(stableNow).toDateString()
        while (current <= windowEnd) {
            const isToday = current.toDateString() === todayStr
            markers.push({
                label: current.toLocaleDateString('en-US', { day: 'numeric' }),
                isToday
            })
            current.setDate(current.getDate() + 1)
        }
        return markers
    }, [windowStart, windowEnd, stableNow])

    // Handlers
    const handleAssigneeToggle = async (taskId: string, currentAssignees: { id: string }[], memberId: string) => {
        const currentIds = currentAssignees.map(a => a.id)
        let newIds: string[]

        if (currentIds.includes(memberId)) {
            // Remove
            newIds = currentIds.filter(id => id !== memberId)
            if (newIds.length === 0) {
                toast.error("Task must have at least one assignee")
                return
            }
        } else {
            // Add
            newIds = [...currentIds, memberId]
        }

        const result = await updateTaskAssignees(taskId, newIds)
        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success("Assignees updated")
        }
    }

    const handleDateUpdate = async (taskId: string, currentStart: string | null, currentEnd: string | null, type: 'start' | 'end', date: Date | undefined) => {
        if (!date) return
        const newDateStr = date.toISOString()
        const start = currentStart || new Date().toISOString()
        const end = currentEnd || new Date().toISOString()

        if (type === 'start') {
            await updateTaskDates(taskId, newDateStr, end)
        } else {
            await updateTaskDates(taskId, start, newDateStr)
        }
        toast.success("Date updated")
    }


    if (tasks.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                No tasks to display
            </div>
        )
    }

    return (
        <div className="space-y-3 pb-20"> {/* Add padding bottom for safe mobile scrolling */}
            {/* Timeline Header */}
            <div className="bg-card rounded-xl p-3 sticky top-0 z-30 shadow-md">
                <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-medium text-muted-foreground">2 Week Timeline</span>
                </div>
                <div className="relative h-6 bg-muted rounded-md flex">
                    {dateMarkers.map((marker, idx) => {
                        // Create stable key using index since labels (day numbers) can repeat across months
                        const markerKey = `day-${idx}`
                        return (
                            <div
                                key={markerKey}
                                className={`flex-1 text-center text-xs ${marker.isToday
                                    ? 'text-amber-600 font-bold'
                                    : 'text-muted-foreground'
                                    }`}
                            >
                                {idx % 2 === 0 && marker.label}
                            </div>
                        )
                    })}
                </div>
            </div>

            {dateKeys.map(dateKey => {
                const dateTasks = groupedTasks[dateKey]
                const isExpanded = expandedDate === dateKey || expandedDate === null
                const completedCount = dateTasks.filter(t => t.status === 'Completed').length

                return (
                    <div key={dateKey} className="bg-card rounded-xl shadow-md overflow-hidden">
                        {/* Date Header */}
                        <button
                            onClick={() => setExpandedDate(expandedDate === dateKey ? null : dateKey)}
                            className="w-full flex items-center justify-between p-4 hover:bg-muted transition-colors duration-200"
                        >
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                                    <Calendar className="h-5 w-5 text-amber-600" />
                                </div>
                                <div className="text-left">
                                <div className="font-semibold text-foreground">{dateKey}</div>
                                <div className="text-sm text-muted-foreground">
                                        {dateTasks.length} task{dateTasks.length !== 1 ? 's' : ''}
                                        {completedCount > 0 && ` • ${completedCount} done`}
                                    </div>
                                </div>
                            </div>
                            {isExpanded ? (
                                <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            ) : (
                                <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            )}
                        </button>

                        {/* Task List */}
                        {isExpanded && (
                            <div className="bg-muted/30">
                                {dateTasks.map((task, idx) => {
                                    const isTaskCollapsed = collapsedTasks.has(task.id)
                                    // Normalize assignees
                                    const currentAssignees = task.assignees && task.assignees.length > 0
                                        ? task.assignees
                                        : (task.assignee ? [task.assignee] : [])

                                    const isAssignee = currentAssignees.some(a => a.id === currentUserId)
                                    const isCreator = task.creator_id === currentUserId

                                    return (
                                        <div
                                            key={task.id}
                                            className={`${idx !== dateTasks.length - 1 ? 'mb-px' : ''}`}
                                        >
                                            {/* Task Header - Always Visible */}
                                            <div
                                                className="p-4 hover:bg-muted transition-colors cursor-pointer flex items-start gap-4"
                                                onClick={(e) => toggleTaskCollapse(task.id, e)}
                                            >
                                                {/* Interactive Avatar Picker (Stop Propagation) */}
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <div className="relative group cursor-pointer">
                                                                <div className="flex -space-x-2">
                                                                    {currentAssignees.length > 0 ? (
                                                                        currentAssignees.slice(0, 3).map((assignee, i) => (
                                                                            <div key={assignee.id} className="relative" style={{ zIndex: 10 - i }}>
                                                                                <InitialsAvatar
                                                                                    name={assignee.full_name}
                                                                                    size="md"
                                                                                    isAI={assignee.role === 'AI_Agent'}
                                                                                />
                                                                            </div>
                                                                        ))
                                                                    ) : (
                                                                        <div className="h-8 w-8 rounded-full bg-muted/70 flex items-center justify-center text-muted-foreground">
                                                                            <Plus className="w-4 h-4" />
                                                                        </div>
                                                                    )}
                                                                    {currentAssignees.length > 3 && (
                                                                        <div className="h-8 w-8 rounded-full bg-muted shadow-sm flex items-center justify-center text-xs text-muted-foreground font-medium z-0">
                                                                            +{currentAssignees.length - 3}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-[200px] p-0" align="start">
                                                            <Command>
                                                                <CommandInput placeholder="Assign..." className="h-9" />
                                                                <CommandList>
                                                                    <CommandEmpty>No members.</CommandEmpty>
                                                                    <CommandGroup>
                                                                        {sortedMembers.map((member) => {
                                                                            const isSelected = currentAssignees.some(a => a.id === member.id)
                                                                            return (
                                                                                <CommandItem
                                                                                    key={member.id}
                                                                                    value={member.full_name}
                                                                                    onSelect={() => handleAssigneeToggle(task.id, currentAssignees, member.id)}
                                                                                >
                                                                                    <div className="flex items-center gap-2 w-full">
                                                                                        <InitialsAvatar name={member.full_name} size="sm" isAI={member.role === 'AI_Agent'} />
                                                                                        <span className="truncate flex-1">{member.full_name}</span>
                                                                                        {isSelected && <Check className="ml-auto h-4 w-4 text-blue-600" />}
                                                                                    </div>
                                                                                </CommandItem>
                                                                            )
                                                                        })}
                                                                    </CommandGroup>
                                                                </CommandList>
                                                            </Command>
                                                        </PopoverContent>
                                                    </Popover>
                                                </div>

                                                {/* Task Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <h4 className="font-medium text-slate-900 truncate">
                                                            <span className="text-slate-400 font-mono text-xs mr-2">#{task.task_number}</span>
                                                            {task.title}
                                                        </h4>
                                                        <Badge className={`shrink-0 text-xs ${getStatusBadgeClass(task.status)}`}>
                                                            {(task.status || 'Pending').replace(/_/g, ' ')}
                                                        </Badge>
                                                    </div>

                                                    {/* Compact info when collapsed */}
                                                    <div className="flex items-center gap-4 mt-1 text-sm text-slate-500 flex-wrap">
                                                        {/* Interactive Date (End Date) - Stop Propagation */}
                                                        <div onClick={(e) => e.stopPropagation()}>
                                                            <Popover>
                                                                <PopoverTrigger asChild>
                                                                    <div className={`flex items-center gap-1 cursor-pointer hover:text-amber-600 transition-colors duration-200 ${!task.end_date ? 'text-muted-foreground' : ''}`}>
                                                                        <Clock className="h-3 w-3" />
                                                                        {task.end_date
                                                                            ? <span>Due {format(new Date(task.end_date), "MMM d")}</span>
                                                                            : <span>No Due Date</span>
                                                                        }
                                                                    </div>
                                                                </PopoverTrigger>
                                                                <PopoverContent className="w-auto p-0" align="start">
                                                                    <CalendarComponent
                                                                        mode="single"
                                                                        selected={task.end_date ? new Date(task.end_date) : undefined}
                                                                        onSelect={(date) => handleDateUpdate(task.id, task.start_date, task.end_date, 'end', date)}
                                                                        initialFocus
                                                                    />
                                                                </PopoverContent>
                                                            </Popover>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Collapse Chevron */}
                                                <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform duration-200 ${isTaskCollapsed ? '-rotate-90' : ''}`} />
                                            </div>

                                            {/* Expandable Details */}
                                            {!isTaskCollapsed && (
                                                <div className="px-4 pb-4 -mt-2">
                                                    {/* Extra info */}
                                                    <div className="ml-11 mb-2 text-sm text-muted-foreground flex flex-wrap gap-4">
                                                        {task.objectives && (
                                                            <span className="flex items-center gap-1">
                                                                <Target className="h-3 w-3 text-amber-500" />
                                                                <span className="truncate max-w-[140px]">{task.objectives.title}</span>
                                                            </span>
                                                        )}

                                                        {/* Start Date Picker */}
                                                        <div onClick={(e) => e.stopPropagation()}>
                                                            <Popover>
                                                                <PopoverTrigger asChild>
                                                                    <div className="flex items-center gap-1 cursor-pointer hover:text-amber-600 transition-colors duration-200">
                                                                        <CalendarIcon className="h-3 w-3" />
                                                                        {task.start_date
                                                                            ? <span>Start: {format(new Date(task.start_date), "MMM d")}</span>
                                                                            : <span className="text-muted-foreground">Set Start Date</span>
                                                                        }
                                                                    </div>
                                                                </PopoverTrigger>
                                                                <PopoverContent className="w-auto p-0" align="start">
                                                                    <CalendarComponent
                                                                        mode="single"
                                                                        selected={task.start_date ? new Date(task.start_date) : undefined}
                                                                        onSelect={(date) => handleDateUpdate(task.id, task.start_date, task.end_date, 'start', date)}
                                                                        initialFocus
                                                                    />
                                                                </PopoverContent>
                                                            </Popover>
                                                        </div>
                                                    </div>

                                                    {/* Mini Timeline Bar */}
                                                    <div className="ml-11">
                                                        <MiniTimelineBar
                                                            task={task}
                                                            windowStart={windowStart}
                                                            windowEnd={windowEnd}
                                                            stableNow={stableNow}
                                                        />
                                                    </div>

                                                    {/* View Details Button */}
                                                    <Button
                                                        onClick={(e) => openTaskModal(task, e)}
                                                        variant="ghost"
                                                        size="sm"
                                                        className="ml-11 mt-3 text-xs font-semibold text-international-orange hover:text-international-orange-hover hover:bg-orange-50 gap-1"
                                                    >
                                                        <Maximize2 className="h-3 w-3" />
                                                        Open Full Task
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )
            })}
            
            {/* Task Modal */}
            {selectedTask && (
                <FullTaskView
                    open={taskModalOpen}
                    onOpenChange={setTaskModalOpen}
                    task={{
                        id: selectedTask.id,
                        title: selectedTask.title || '',
                        description: selectedTask.description,
                        status: selectedTask.status || 'Pending',
                        risk_level: selectedTask.risk_level,
                        start_date: selectedTask.start_date,
                        end_date: selectedTask.end_date,
                        task_number: selectedTask.task_number,
                        assignee: selectedTask.profiles ? {
                            id: selectedTask.profiles.id,
                            full_name: selectedTask.profiles.full_name,
                            role: selectedTask.profiles.role || 'Unknown',
                            email: selectedTask.profiles.email || '',
                            avatar_url: selectedTask.profiles.avatar_url
                        } : null,
                        assignees: selectedTask.assignees,
                        objective: selectedTask.objectives ? {
                            id: selectedTask.objectives.id,
                            title: selectedTask.objectives.title || 'Untitled'
                        } : null
                    }}
                    members={members.map(m => ({
                        ...m,
                        email: m.email || ''
                    }))}
                    currentUserId={currentUserId}
                />
            )}
        </div>
    )
}
