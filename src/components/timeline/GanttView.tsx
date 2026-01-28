"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { Gantt, Task as GanttTask, ViewMode } from "gantt-task-react"
import "gantt-task-react/dist/index.css"
import { Database } from "@/types/database.types"
import { MultiSelect } from "@/components/ui/multi-select"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChevronLeft, ChevronRight, CalendarDays, ArrowUpDown } from "lucide-react"
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

// Types for joined data
export type JoinedTask = Database["public"]["Tables"]["tasks"]["Row"] & {
    profiles: Database["public"]["Tables"]["profiles"]["Row"] | null
    objectives: Database["public"]["Tables"]["objectives"]["Row"] | null
}



export type GanttViewProps = {
    tasks: JoinedTask[]
    objectives: Database["public"]["Tables"]["objectives"]["Row"][]
    profiles: Database["public"]["Tables"]["profiles"]["Row"][]
}

// Extended GanttTask with task number and assignee for avatars
interface ExtendedGanttTask extends GanttTask {
    taskNumber?: number
    assigneeName?: string | null
    assigneeRole?: string | null
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
    const bgColor = isAI ? "bg-amber-500" : getAvatarColor(name)
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
            className="flex items-center bg-slate-100 text-xs font-medium text-slate-600"
            style={{ height: headerHeight }}
        >
            <div className="w-10 px-2 text-center">#</div>
            <div className="flex-1 px-2 min-w-[120px]">Name</div>
            <div className="w-20 px-2 text-center">From</div>
            <div className="w-20 px-2 text-center">To</div>
        </div>
    )
}

// Custom Table Row Component
function CustomTaskListTable({
    tasks,
    rowHeight,
    onExpanderClick
}: {
    tasks: ExtendedGanttTask[]
    rowHeight: number
    onExpanderClick: (task: GanttTask) => void
}) {
    return (
        <div>
            {tasks.map(task => {
                // Extract task number from name if present (e.g., "Task 19: Review" -> 19)
                const taskNumMatch = task.name.match(/^Task (\d+):/i)
                const taskNum = task.taskNumber || (taskNumMatch ? taskNumMatch[1] : '-')
                const displayName = task.name.replace(/^Task \d+:\s*/i, '')

                return (
                    <div
                        key={task.id}
                        className="flex items-center hover:bg-slate-100 text-sm cursor-pointer"
                        style={{ height: rowHeight }}
                        onClick={() => onExpanderClick(task)}
                    >
                        <div className="w-10 px-2 text-center text-slate-400 text-xs font-mono">{taskNum}</div>
                        <div className="flex-1 px-2 min-w-[120px] flex items-center gap-2">
                            <InitialsAvatar
                                name={task.assigneeName}
                                size="xs"
                                isAI={task.assigneeRole === 'AI_Agent'}
                            />
                            <span className="text-slate-900 truncate">{displayName}</span>
                        </div>
                        <div className="w-20 px-2 text-center text-slate-500 text-xs">
                            {format(task.start, 'd MMM')}
                        </div>
                        <div className="w-20 px-2 text-center text-slate-500 text-xs">
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
    const startDate = task.start
    const endDate = task.end
    // Calculate duration in days (inclusive)
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

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
            <div className="text-slate-500 mb-1">
                {format(startDate, 'MMM d')} - {format(endDate, 'MMM d, yyyy')}
            </div>
            <div className="text-amber-600 text-xs font-semibold">
                Duration: {diffDays} day{diffDays !== 1 ? 's' : ''}
            </div>
        </div>
    )
}

export function GanttView({ tasks, objectives, profiles }: GanttViewProps) {
    const router = useRouter()
    const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day)
    const [selectedObjectives, setSelectedObjectives] = useState<string[]>([])
    const [selectedMembers, setSelectedMembers] = useState<string[]>([])
    const [sortBy, setSortBy] = useState<'start_date' | 'end_date'>('end_date')

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
    // SORTED BY DEADLINE (end_date) - tasks due sooner appear first
    // Transform to Gantt Library Format (with optimistic overrides and assignee info)
    // SORTED BY DEADLINE (end_date) - tasks due sooner appear first
    const ganttTasks: ExtendedGanttTask[] = useMemo(() => {
        return filteredTasks
            .slice(0, 50)
            .sort((a, b) => {
                if (sortBy === 'start_date') {
                    const aStart = a.start_date ? new Date(a.start_date).getTime() : Infinity
                    const bStart = b.start_date ? new Date(b.start_date).getTime() : Infinity
                    return aStart - bStart
                }
                // Default: Sort by deadline (end_date) - soonest first
                const aEnd = a.end_date ? new Date(a.end_date).getTime() : Infinity
                const bEnd = b.end_date ? new Date(b.end_date).getTime() : Infinity
                return aEnd - bEnd
            })
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

                return {
                    start: startDate,
                    end: endDate,
                    name: task.title || "Untitled Task",
                    id: task.id,
                    type: "task" as const,
                    progress: progress,
                    isDisabled: false, // ENABLED for drag-drop (dates)
                    styles: {
                        progressColor: color,
                        progressSelectedColor: color,
                        backgroundColor: color,
                    },
                    // Assignee info for avatar
                    assigneeName: task.profiles?.full_name,
                    assigneeRole: task.profiles?.role,
                    taskNumber: task.task_number
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
                // Clear the override after successful server update and refresh
                router.refresh()
                // Keep override until refresh completes, then clear after a short delay
                if (dateChangeTimeoutRef.current) {
                    clearTimeout(dateChangeTimeoutRef.current)
                }
                dateChangeTimeoutRef.current = setTimeout(() => {
                    setLocalDateOverrides(prev => {
                        const next = { ...prev }
                        delete next[task.id]
                        return next
                    })
                }, 500)
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

    // Handler: Double-click opens task detail
    const handleDoubleClick = (task: GanttTask) => {
        router.push(`/tasks?highlight=${task.id}`)
    }

    // Handler: Click shows task info
    const handleClick = () => {
        // Optional: Keep standard click behavior or remove if it conflicts
        // toast.info(`${task.name} • ${task.start.toLocaleDateString()} → ${task.end.toLocaleDateString()}`)
    }



    return (
        <div className="space-y-4">
            <div className="text-xs text-slate-500 text-right px-1 flex justify-end gap-4">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400"></span> Drag bar to reschedule</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400"></span> Drag edges to resize duration</span>

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
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'start_date' | 'end_date')}>
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                            <ArrowUpDown className="w-3 h-3 mr-2 text-muted-foreground" />
                            <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="end_date">Deadline</SelectItem>
                            <SelectItem value="start_date">Start Date</SelectItem>
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
                                        variant="outline"
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
                                        variant="outline"
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
                                        variant="outline"
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
                        TaskListTable={CustomTaskListTable}
                        TooltipContent={CustomTooltip}
                    />
                </div>
            )}
        </div>
    )
}
