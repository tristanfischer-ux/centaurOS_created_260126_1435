"use client"

import { useState, useMemo } from "react"
import { Gantt, Task as GanttTask, ViewMode } from "gantt-task-react"
import "gantt-task-react/dist/index.css"
import { Database } from "@/types/database.types"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

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

export function GanttView({ tasks, objectives, profiles }: GanttViewProps) {
    const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day)
    const [filterObjective, setFilterObjective] = useState<string>("all")
    const [filterAssignee, setFilterAssignee] = useState<string>("all")

    // Filter Logic
    const filteredTasks = tasks.filter(task => {
        if (filterObjective !== "all" && task.objective_id !== filterObjective) return false
        if (filterAssignee !== "all" && task.assignee_id !== filterAssignee) return false
        return true
    })

    // Transform to Gantt Library Format
    // Memoize transformation and limit to 100 tasks for performance (Virtualization fallback)
    const ganttTasks: GanttTask[] = useMemo(() => {
        return filteredTasks
            .slice(0, 50) // Optimization: Only render top 50 matches to prevent DOM freeze
            .map(task => {
                const startDate = task.start_date ? new Date(task.start_date) : new Date()
                const endDate = task.end_date ? new Date(task.end_date) : new Date(startDate.getTime() + 86400000 * 2)

                if (endDate <= startDate) {
                    endDate.setDate(startDate.getDate() + 1)
                }

                let color = "#6b7280"
                if (task.status === "Accepted") color = "#2563eb"
                if (task.status === "Rejected") color = "#dc2626"
                if (task.status === "Amended" || task.status === "Amended_Pending_Approval") color = "#ea580c"

                return {
                    start: startDate,
                    end: endDate,
                    name: task.title || "Untitled Task",
                    id: task.id,
                    type: "task",
                    progress: task.status === "Accepted" ? 50 : 0,
                    isDisabled: true,
                    styles: { progressColor: color, progressSelectedColor: color }
                }
            })
    }, [filteredTasks])

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
                Displaying top {ganttTasks.length} most recent filtered tasks (Optimized)
            </div>
            {/* Control Bar */}
            <Card className="p-4 bg-white border-slate-200 flex flex-wrap gap-4 items-center justify-between shadow-sm">
                <div className="flex gap-4">
                    <Select value={filterObjective} onValueChange={setFilterObjective}>
                        <SelectTrigger className="w-[200px] bg-slate-50 border-slate-200 text-slate-900">
                            <SelectValue placeholder="Filter by Objective" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-slate-200 text-slate-900">
                            <SelectItem value="all">All Objectives</SelectItem>
                            {objectives.map(obj => (
                                <SelectItem key={obj.id} value={obj.id}>{obj.title}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                        <SelectTrigger className="w-[200px] bg-slate-50 border-slate-200 text-slate-900">
                            <SelectValue placeholder="Filter by Member" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-slate-200 text-slate-900">
                            <SelectItem value="all">All Members</SelectItem>
                            {profiles.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
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
                </div>
            </Card>

            {/* Gantt Chart Wrapper */}
            <div className="bg-white rounded-lg overflow-hidden border border-foundry-800 text-black">
                {/* Library renders light mode by default, easier to wrap in white container or heavily override CSS. 
                    For MVP, putting it in a contrast container is safest to ensure legibility of text/grid.
                    If dark mode is strictly required, global CSS overrides for ._3eZ... classes are needed.
                */}
                <Gantt
                    tasks={ganttTasks}
                    viewMode={viewMode}
                    listCellWidth="155px"
                    columnWidth={65}
                    barFill={50}
                />
            </div>
        </div>
    )
}
