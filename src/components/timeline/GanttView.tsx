"use client"

import { useState, useMemo } from "react"
import { Gantt, Task as GanttTask, ViewMode } from "gantt-task-react"
import "gantt-task-react/dist/index.css"
import { Database } from "@/types/database.types"
import { MultiSelect } from "@/components/ui/multi-select"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { updateTaskDates } from "@/actions/tasks"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { format } from "date-fns"

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

// Extended GanttTask with task number for sorting
interface ExtendedGanttTask extends GanttTask {
    taskNumber?: number
}

// Custom Header Component
function CustomTaskListHeader({ headerHeight }: { headerHeight: number }) {
    return (
        <div
            className="flex items-center border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600"
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
                        className="flex items-center border-b border-slate-100 hover:bg-slate-50 text-sm"
                        style={{ height: rowHeight }}
                        onClick={() => onExpanderClick(task)}
                    >
                        <div className="w-10 px-2 text-center text-slate-400 text-xs font-mono">{taskNum}</div>
                        <div className="flex-1 px-2 min-w-[120px] text-slate-900 truncate">{displayName}</div>
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

export function GanttView({ tasks, objectives, profiles }: GanttViewProps) {
    const router = useRouter()
    const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day)
    const [selectedObjectives, setSelectedObjectives] = useState<string[]>([])
    const [selectedMembers, setSelectedMembers] = useState<string[]>([])

    // Optimistic local state for task dates (prevents "bounce back")
    const [localDateOverrides, setLocalDateOverrides] = useState<Record<string, { start: Date, end: Date }>>({})

    // Transform options for multi-select
    const objectiveOptions = objectives.map(obj => ({
        value: obj.id,
        label: obj.title || 'Untitled'
    }))

    const memberOptions = profiles.map(p => ({
        value: p.id,
        label: p.full_name || 'Unknown',
        icon: p.role === 'AI_Agent' ? '🤖' : '👤'
    }))

    // Filter Logic (empty selection = show all)
    const filteredTasks = tasks.filter(task => {
        if (selectedObjectives.length > 0 && !selectedObjectives.includes(task.objective_id || '')) return false
        if (selectedMembers.length > 0 && !selectedMembers.includes(task.assignee_id || '')) return false
        return true
    })

    // Transform to Gantt Library Format (with optimistic overrides)
    const ganttTasks: GanttTask[] = useMemo(() => {
        return filteredTasks
            .slice(0, 50)
            .map(task => {
                // Check for optimistic override first
                const override = localDateOverrides[task.id]
                const startDate = override?.start ?? (task.start_date ? new Date(task.start_date) : new Date())
                const endDate = override?.end ?? (task.end_date ? new Date(task.end_date) : new Date(startDate.getTime() + 86400000 * 2))

                if (endDate <= startDate) {
                    endDate.setDate(startDate.getDate() + 1)
                }

                let color = "#6b7280" // Pending - gray
                let progress = 0
                if (task.status === "Accepted") { color = "#2563eb"; progress = 50 }
                if (task.status === "Completed") { color = "#16a34a"; progress = 100 }
                if (task.status === "Rejected") { color = "#dc2626"; progress = 0 }
                if (task.status === "Amended" || task.status === "Amended_Pending_Approval") { color = "#ea580c"; progress = 25 }

                return {
                    start: startDate,
                    end: endDate,
                    name: task.title || "Untitled Task",
                    id: task.id,
                    type: "task" as const,
                    progress,
                    isDisabled: false, // ENABLED for drag-drop!
                    styles: {
                        progressColor: color,
                        progressSelectedColor: color,
                        backgroundColor: color + "40", // 25% opacity background
                    }
                }
            })
    }, [filteredTasks, localDateOverrides])

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
                setTimeout(() => {
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
    const handleClick = (task: GanttTask) => {
        toast.info(`${task.name} • ${task.start.toLocaleDateString()} → ${task.end.toLocaleDateString()}`)
    }

    if (ganttTasks.length === 0) {
        return (
            <div className="text-center py-20 text-gray-500 border border-dashed border-foundry-800 rounded-lg">
                No tasks match current filters.
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="text-xs text-slate-400 text-right px-1">
                Drag to reschedule • Resize to change duration • Double-click to view
            </div>
            {/* Control Bar */}
            <Card className="p-4 bg-white border-slate-200 flex flex-wrap gap-4 items-center justify-between shadow-sm">
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

                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <Button
                        variant={viewMode === ViewMode.Day ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setViewMode(ViewMode.Day)}
                        className={viewMode === ViewMode.Day ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}
                    >
                        Day
                    </Button>
                    <Button
                        variant={viewMode === ViewMode.Week ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setViewMode(ViewMode.Week)}
                        className={viewMode === ViewMode.Week ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}
                    >
                        Week
                    </Button>
                    <Button
                        variant={viewMode === ViewMode.Month ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setViewMode(ViewMode.Month)}
                        className={viewMode === ViewMode.Month ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}
                    >
                        Month
                    </Button>
                </div>
            </Card>

            {/* Gantt Chart Wrapper */}
            <div className="bg-white rounded-lg overflow-hidden border border-slate-200 text-black shadow-sm">
                <Gantt
                    tasks={ganttTasks}
                    viewMode={viewMode}
                    listCellWidth="260px"
                    columnWidth={viewMode === ViewMode.Month ? 300 : viewMode === ViewMode.Week ? 150 : 65}
                    barFill={60}
                    onDateChange={handleDateChange}
                    onDoubleClick={handleDoubleClick}
                    onClick={handleClick}
                    TaskListHeader={CustomTaskListHeader}
                    TaskListTable={CustomTaskListTable}
                />
            </div>
        </div>
    )
}
