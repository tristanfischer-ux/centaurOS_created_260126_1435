"use client"

import { useState } from "react"
import { Database } from "@/types/database.types"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, Clock, User, ChevronRight, ChevronDown } from "lucide-react"
import Link from "next/link"

// Types for joined data
type JoinedTask = Database["public"]["Tables"]["tasks"]["Row"] & {
    profiles: Database["public"]["Tables"]["profiles"]["Row"] | null
    objectives: Database["public"]["Tables"]["objectives"]["Row"] | null
}

interface TimelineListViewProps {
    tasks: JoinedTask[]
}

// Group tasks by date
function groupTasksByDate(tasks: JoinedTask[]) {
    const groups: Record<string, JoinedTask[]> = {}

    tasks.forEach(task => {
        const date = task.start_date
            ? new Date(task.start_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            : 'No Date'

        if (!groups[date]) groups[date] = []
        groups[date].push(task)
    })

    return groups
}

function getStatusColor(status: string | null) {
    switch (status) {
        case 'Accepted': return 'bg-blue-500'
        case 'Completed': return 'bg-green-500'
        case 'Rejected': return 'bg-red-500'
        case 'Amended_Pending_Approval': return 'bg-orange-500'
        default: return 'bg-gray-400'
    }
}

function getStatusBadge(status: string | null) {
    const colors: Record<string, string> = {
        'Accepted': 'bg-blue-100 text-blue-700',
        'Completed': 'bg-green-100 text-green-700',
        'Rejected': 'bg-red-100 text-red-700',
        'Amended_Pending_Approval': 'bg-orange-100 text-orange-700',
        'Pending': 'bg-gray-100 text-gray-700',
    }
    return colors[status || 'Pending'] || colors['Pending']
}

export function TimelineListView({ tasks }: TimelineListViewProps) {
    const [expandedDate, setExpandedDate] = useState<string | null>(null)

    const groupedTasks = groupTasksByDate(tasks)
    const dateKeys = Object.keys(groupedTasks).sort((a, b) => {
        if (a === 'No Date') return 1
        if (b === 'No Date') return -1
        return new Date(a).getTime() - new Date(b).getTime()
    })

    if (tasks.length === 0) {
        return (
            <div className="text-center py-12 text-slate-500">
                No tasks to display
            </div>
        )
    }

    return (
        <div className="space-y-3">
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
                                {dateTasks.map((task, idx) => (
                                    <Link
                                        key={task.id}
                                        href={`/tasks?highlight=${task.id}`}
                                        className="block"
                                    >
                                        <div className={`flex items-start gap-3 p-4 hover:bg-slate-50 transition-colors ${idx !== dateTasks.length - 1 ? 'border-b border-slate-50' : ''}`}>
                                            {/* Status Dot */}
                                            <div className="pt-1.5">
                                                <div className={`h-3 w-3 rounded-full ${getStatusColor(task.status)}`} />
                                            </div>

                                            {/* Task Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <h4 className="font-medium text-slate-900 truncate">
                                                        {task.title}
                                                    </h4>
                                                    <Badge className={`shrink-0 text-xs ${getStatusBadge(task.status)}`}>
                                                        {task.status || 'Pending'}
                                                    </Badge>
                                                </div>

                                                <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                                                    {task.profiles && (
                                                        <span className="flex items-center gap-1">
                                                            <User className="h-3 w-3" />
                                                            {task.profiles.full_name}
                                                            {task.profiles.role === 'AI_Agent' && ' 🤖'}
                                                        </span>
                                                    )}
                                                    {task.end_date && (
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            Due {new Date(task.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <ChevronRight className="h-4 w-4 text-slate-300 shrink-0 mt-1" />
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
