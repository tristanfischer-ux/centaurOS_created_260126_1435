"use client"

import { useState, useMemo } from "react"
import { Database } from "@/types/database.types"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, ChevronRight, ChevronDown, Target } from "lucide-react"
import Link from "next/link"

// Types for joined data
type JoinedTask = Database["public"]["Tables"]["tasks"]["Row"] & {
    profiles: Database["public"]["Tables"]["profiles"]["Row"] | null
    objectives: Database["public"]["Tables"]["objectives"]["Row"] | null
}

interface TimelineListViewProps {
    tasks: JoinedTask[]
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
    const sizeClasses = size === "sm" ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-xs"

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



function getStatusBarColor(status: string | null) {
    switch (status) {
        case 'Accepted': return 'bg-blue-500'
        case 'Completed': return 'bg-green-500'
        case 'Rejected': return 'bg-red-500'
        case 'Amended_Pending_Approval': return 'bg-orange-500'
        case 'Amended': return 'bg-orange-500'
        default: return 'bg-gray-400'
    }
}

function getStatusBadge(status: string | null) {
    const colors: Record<string, string> = {
        'Accepted': 'bg-blue-100 text-blue-700',
        'Completed': 'bg-green-100 text-green-700',
        'Rejected': 'bg-red-100 text-red-700',
        'Amended_Pending_Approval': 'bg-orange-100 text-orange-700',
        'Amended': 'bg-orange-100 text-orange-700',
        'Pending': 'bg-gray-100 text-gray-700',
    }
    return colors[status || 'Pending'] || colors['Pending']
}

// Mini timeline bar component with avatar
function MiniTimelineBar({ task, windowStart, windowEnd }: {
    task: JoinedTask
    windowStart: Date
    windowEnd: Date
}) {
    const windowDuration = windowEnd.getTime() - windowStart.getTime()

    const taskStart = task.start_date ? new Date(task.start_date) : new Date()
    const taskEnd = task.end_date ? new Date(task.end_date) : new Date(taskStart.getTime() + 86400000 * 2)

    // Calculate positions as percentages
    const startPercent = Math.max(0, Math.min(100,
        ((taskStart.getTime() - windowStart.getTime()) / windowDuration) * 100
    ))
    const endPercent = Math.max(0, Math.min(100,
        ((taskEnd.getTime() - windowStart.getTime()) / windowDuration) * 100
    ))
    const widthPercent = Math.max(8, endPercent - startPercent) // Minimum 8% width for avatar visibility

    // Calculate progress through the task
    const now = new Date()
    let progressPercent = 0
    if (task.status === 'Completed') {
        progressPercent = 100
    } else if (now > taskEnd) {
        progressPercent = 100 // Overdue
    } else if (now > taskStart) {
        progressPercent = ((now.getTime() - taskStart.getTime()) / (taskEnd.getTime() - taskStart.getTime())) * 100
    }

    // Today marker position
    const todayPercent = Math.max(0, Math.min(100,
        ((now.getTime() - windowStart.getTime()) / windowDuration) * 100
    ))

    const isAI = task.profiles?.role === 'AI_Agent'

    return (
        <div className="relative w-full h-7 bg-slate-100 rounded-md overflow-hidden">
            {/* Today marker */}
            <div
                className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                style={{ left: `${todayPercent}%` }}
            />

            {/* Task bar background */}
            <div
                className={`absolute top-0.5 bottom-0.5 rounded-full ${getStatusBarColor(task.status)} opacity-30`}
                style={{
                    left: `${startPercent}%`,
                    width: `${widthPercent}%`,
                }}
            />

            {/* Task bar progress fill */}
            <div
                className={`absolute top-0.5 bottom-0.5 rounded-full ${getStatusBarColor(task.status)}`}
                style={{
                    left: `${startPercent}%`,
                    width: `${(widthPercent * progressPercent) / 100}%`,
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

export function TimelineListView({ tasks }: TimelineListViewProps) {
    const [expandedDate, setExpandedDate] = useState<string | null>(null)
    const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set())

    // Toggle individual task collapse/expand
    const toggleTaskCollapse = (taskId: string, e: React.MouseEvent) => {
        e.preventDefault() // Prevent navigation
        e.stopPropagation()
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

    const groupedTasks = groupTasksByDueDate(tasks)
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

    // Calculate timeline window (today - 3 days to today + 11 days = 2 week window)
    const now = new Date()
    const windowStart = new Date(now)
    windowStart.setDate(windowStart.getDate() - 3)
    windowStart.setHours(0, 0, 0, 0)

    const windowEnd = new Date(now)
    windowEnd.setDate(windowEnd.getDate() + 11)
    windowEnd.setHours(23, 59, 59, 999)

    // Generate date markers for the timeline header
    const dateMarkers = useMemo(() => {
        const markers: { label: string; isToday: boolean }[] = []
        const current = new Date(windowStart)
        while (current <= windowEnd) {
            const isToday = current.toDateString() === now.toDateString()
            markers.push({
                label: current.toLocaleDateString('en-US', { day: 'numeric' }),
                isToday
            })
            current.setDate(current.getDate() + 1)
        }
        return markers
    }, [])

    if (tasks.length === 0) {
        return (
            <div className="text-center py-12 text-slate-500">
                No tasks to display
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {/* Timeline Header */}
            <div className="bg-white rounded-xl border border-slate-200 p-3">
                <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-medium text-slate-600">2 Week Timeline</span>
                </div>
                <div className="relative h-6 bg-slate-100 rounded-md flex">
                    {dateMarkers.map((marker, idx) => (
                        <div
                            key={idx}
                            className={`flex-1 text-center text-xs ${marker.isToday
                                ? 'text-amber-600 font-bold'
                                : 'text-slate-400'
                                }`}
                        >
                            {idx % 2 === 0 && marker.label}
                        </div>
                    ))}
                </div>
            </div>

            {dateKeys.map(dateKey => {
                const dateTasks = groupedTasks[dateKey]
                const isExpanded = expandedDate === dateKey || expandedDate === null
                const completedCount = dateTasks.filter(t => t.status === 'Completed').length

                return (
                    <div key={dateKey} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        {/* Date Header */}
                        <button
                            onClick={() => setExpandedDate(expandedDate === dateKey ? null : dateKey)}
                            className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                                    <Calendar className="h-5 w-5 text-amber-600" />
                                </div>
                                <div className="text-left">
                                    <div className="font-semibold text-slate-900">{dateKey}</div>
                                    <div className="text-sm text-slate-500">
                                        {dateTasks.length} task{dateTasks.length !== 1 ? 's' : ''}
                                        {completedCount > 0 && ` • ${completedCount} done`}
                                    </div>
                                </div>
                            </div>
                            {isExpanded ? (
                                <ChevronDown className="h-5 w-5 text-slate-400" />
                            ) : (
                                <ChevronRight className="h-5 w-5 text-slate-400" />
                            )}
                        </button>

                        {/* Task List */}
                        {isExpanded && (
                            <div className="border-t border-slate-100">
                                {dateTasks.map((task, idx) => {
                                    const isTaskCollapsed = collapsedTasks.has(task.id)
                                    return (
                                        <div
                                            key={task.id}
                                            className={`${idx !== dateTasks.length - 1 ? 'border-b border-slate-50' : ''}`}
                                        >
                                            {/* Task Header - Always Visible, Clickable to Collapse */}
                                            <div
                                                className="p-4 hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-3"
                                                onClick={(e) => toggleTaskCollapse(task.id, e)}
                                            >
                                                {/* Avatar */}
                                                <InitialsAvatar
                                                    name={task.profiles?.full_name}
                                                    size="md"
                                                    isAI={task.profiles?.role === 'AI_Agent'}
                                                />

                                                {/* Task Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <h4 className="font-medium text-slate-900 truncate">
                                                            <span className="text-slate-400 font-mono text-xs mr-2">#{task.task_number}</span>
                                                            {task.title}
                                                        </h4>
                                                        <Badge className={`shrink-0 text-xs ${getStatusBadge(task.status)}`}>
                                                            {task.status || 'Pending'}
                                                        </Badge>
                                                    </div>

                                                    {/* Compact info when collapsed */}
                                                    <div className="flex items-center gap-3 mt-1 text-sm text-slate-500 flex-wrap">
                                                        {task.profiles && (
                                                            <span className="flex items-center gap-1">
                                                                {task.profiles.full_name}
                                                                {task.profiles.role === 'AI_Agent' && ' 🤖'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Collapse Chevron */}
                                                <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 mt-1 transition-transform ${isTaskCollapsed ? '-rotate-90' : ''}`} />
                                            </div>

                                            {/* Expandable Details */}
                                            {!isTaskCollapsed && (
                                                <div className="px-4 pb-4 -mt-2">
                                                    {/* Extra info */}
                                                    <div className="ml-9 mb-2 text-sm text-slate-500 flex flex-wrap gap-3">
                                                        {task.objectives && (
                                                            <span className="flex items-center gap-1">
                                                                <Target className="h-3 w-3 text-amber-500" />
                                                                <span className="truncate max-w-[140px]">{task.objectives.title}</span>
                                                            </span>
                                                        )}
                                                        {task.end_date && (
                                                            <span className="flex items-center gap-1">
                                                                <Clock className="h-3 w-3" />
                                                                Due {new Date(task.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Mini Timeline Bar */}
                                                    <div className="ml-9">
                                                        <MiniTimelineBar
                                                            task={task}
                                                            windowStart={windowStart}
                                                            windowEnd={windowEnd}
                                                        />
                                                    </div>

                                                    {/* View Details Link */}
                                                    <Link
                                                        href={`/tasks?highlight=${task.id}`}
                                                        className="ml-9 mt-2 inline-flex items-center text-xs text-amber-600 hover:text-amber-700"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        View Details <ChevronRight className="h-3 w-3 ml-1" />
                                                    </Link>
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
        </div>
    )
}
