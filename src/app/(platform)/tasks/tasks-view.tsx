"use client"

import { useState, useEffect } from "react"
import { TaskCard } from "./task-card"
import { Button } from "@/components/ui/button"
import { LayoutGrid, List, X, Trash2, CheckSquare } from "lucide-react"
import { deleteTasks } from "@/actions/tasks"
import { CreateTaskDialog } from "./create-task-dialog"
import { Database } from "@/types/database.types"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { ThreadDrawer } from "./thread-drawer"
import { cn } from "@/lib/utils"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

// Task type update
type Task = Database["public"]["Tables"]["tasks"]["Row"] & {
    assignee?: { id: string, full_name: string | null, role: string, email: string }
    task_number?: number
    task_files?: { id: string }[]
}

type Objective = {
    id: string
    title: string
}

type Member = {
    id: string
    full_name: string
    role: string
}

interface TasksViewProps {
    tasks: Task[]
    objectives: Objective[]
    members: Member[]
    currentUserId: string
    currentUserRole?: string
}


// ...
export function TasksView({ tasks, objectives, members, currentUserId, currentUserRole }: TasksViewProps) {
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [selectedTask, setSelectedTask] = useState<Task | null>(null)
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())

    // Filter & Sort State
    const [statusFilter, setStatusFilter] = useState<string[]>([])
    const [assigneeFilter, setAssigneeFilter] = useState<string | 'unassigned' | 'all'>('all')
    const [sortBy, setSortBy] = useState<'due_date_asc' | 'due_date_desc' | 'created_desc'>('due_date_asc')

    // Filter Logic
    const filteredTasks = tasks.filter(task => {
        // Status Filter
        if (statusFilter.length > 0) {
            const taskStatus = task.status || 'Pending'
            if (!statusFilter.includes(taskStatus)) return false
        }

        // Assignee Filter
        if (assigneeFilter !== 'all') {
            if (assigneeFilter === 'unassigned') {
                if (task.assignee_id) return false
            } else {
                if (task.assignee_id !== assigneeFilter) return false
            }
        }

        return true
    })

    // Sort Logic
    const sortedTasks = [...filteredTasks].sort((a, b) => {
        if (sortBy === 'created_desc') {
            return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
        }
        if (sortBy === 'due_date_asc') {
            if (!a.end_date) return 1
            if (!b.end_date) return -1
            return new Date(a.end_date).getTime() - new Date(b.end_date).getTime()
        }
        if (sortBy === 'due_date_desc') {
            if (!a.end_date) return 1
            if (!b.end_date) return -1
            return new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
        }
        return 0
    })

    // Group tasks by objective (using sorted tasks)
    const tasksByObjective: Record<string, Task[]> = {}
    const orphanedTasks: Task[] = []

    sortedTasks.forEach(task => {
        if (task.objective_id) {
            if (!tasksByObjective[task.objective_id]) {
                tasksByObjective[task.objective_id] = []
            }
            tasksByObjective[task.objective_id].push(task)
        } else {
            orphanedTasks.push(task)
        }
    })

    // Helper for toggle
    const toggleStatusFilter = (status: string) => {
        setStatusFilter(prev =>
            prev.includes(status)
                ? prev.filter(s => s !== status)
                : [...prev, status]
        )
    }

    // Row Expansion Logic
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
    const [columns, setColumns] = useState(1) // Default to 1 (mobile-first safe)

    // Handle Window Resize for Columns
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                setColumns(3) // lg:grid-cols-3
            } else if (window.innerWidth >= 768) {
                setColumns(2) // md:grid-cols-2
            } else {
                setColumns(1) // grid-cols-1
            }
        }

        // Initial check
        handleResize()

        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const toggleRow = (rowIndex: number) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev)
            if (newSet.has(rowIndex)) {
                newSet.delete(rowIndex)
            } else {
                newSet.add(rowIndex)
            }
            return newSet
        })
    }

    // Selection Handlers
    const toggleSelectionMode = () => {
        setIsSelectionMode(prev => !prev)
        setSelectedTaskIds(new Set())
    }

    const toggleTaskSelection = (taskId: string) => {
        setSelectedTaskIds(prev => {
            const newSet = new Set(prev)
            if (newSet.has(taskId)) newSet.delete(taskId)
            else newSet.add(taskId)
            return newSet
        })
    }

    const handleBulkDelete = async () => {
        if (selectedTaskIds.size === 0) return
        if (!confirm(`Are you sure you want to delete ${selectedTaskIds.size} tasks?`)) return

        await deleteTasks(Array.from(selectedTaskIds))
        setIsSelectionMode(false)
        setSelectedTaskIds(new Set())
    }

    return (
        <>
            <div className="space-y-6">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2 flex items-center gap-3">
                                Tasks
                                <span className="text-slate-400 font-medium text-2xl">{tasks.length}</span>
                            </h1>
                            <p className="text-slate-500">Democratic workflow management.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {isSelectionMode ? (
                                <div className="flex items-center gap-2 mr-2">
                                    <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={selectedTaskIds.size === 0}>
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete ({selectedTaskIds.size})
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={toggleSelectionMode}>
                                        Cancel
                                    </Button>
                                </div>
                            ) : (
                                <Button variant="outline" size="sm" onClick={toggleSelectionMode} className="mr-2">
                                    <CheckSquare className="w-4 h-4 mr-2 text-slate-500" />
                                    Select
                                </Button>
                            )}
                            <div className="bg-slate-100 p-1 rounded-lg flex items-center mr-2">
                                <Button
                                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => setViewMode('grid')}
                                    className={viewMode === 'grid' ? 'shadow-sm' : ''}
                                >
                                    <LayoutGrid className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => setViewMode('list')}
                                    className={viewMode === 'list' ? 'shadow-sm' : ''}
                                >
                                    <List className="h-4 w-4" />
                                </Button>
                            </div>
                            <CreateTaskDialog
                                objectives={objectives}
                                members={members}
                                currentUserId={currentUserId}
                            />
                        </div>
                    </div>

                    {/* Filter Bar */}
                    <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-2 pr-4 border-r border-slate-100">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filter:</span>
                            {['Pending', 'Accepted', 'Completed', 'Rejected'].map(status => (
                                <Badge
                                    key={status}
                                    variant={statusFilter.includes(status) ? 'default' : 'outline'}
                                    className={cn(
                                        "cursor-pointer hover:opacity-80 transition-all",
                                        statusFilter.includes(status)
                                            ? status === 'Accepted' ? 'bg-green-600 hover:bg-green-700'
                                                : status === 'Completed' ? 'bg-slate-800 hover:bg-slate-900'
                                                    : status === 'Rejected' ? 'bg-red-600 hover:bg-red-700'
                                                        : 'bg-slate-500 hover:bg-slate-600'
                                            : "text-slate-500 bg-white hover:bg-slate-50"
                                    )}
                                    onClick={() => toggleStatusFilter(status)}
                                >
                                    {status}
                                </Badge>
                            ))}
                        </div>

                        <div className="flex items-center gap-2">
                            <Select
                                value={assigneeFilter}
                                onValueChange={(val) => setAssigneeFilter(val as string)}
                            >
                                <SelectTrigger className="h-8 w-[180px] text-xs bg-slate-50 border-slate-200">
                                    <SelectValue placeholder="All Assignees" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Assignees</SelectItem>
                                    <SelectItem value="unassigned">Unassigned</SelectItem>
                                    {members.map(m => (
                                        <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select
                                value={sortBy}
                                onValueChange={(val) => setSortBy(val as any)}
                            >
                                <SelectTrigger className="h-8 w-[160px] text-xs bg-slate-50 border-slate-200">
                                    <SelectValue placeholder="Sort by" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="due_date_asc">Due Date (Earliest)</SelectItem>
                                    <SelectItem value="due_date_desc">Due Date (Latest)</SelectItem>
                                    <SelectItem value="created_desc">Newest Created</SelectItem>
                                </SelectContent>
                            </Select>

                            {(statusFilter.length > 0 || assigneeFilter !== 'all') && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setStatusFilter([])
                                        setAssigneeFilter('all')
                                        setSortBy('due_date_asc')
                                    }}
                                    className="text-slate-400 hover:text-red-500 h-8 ml-2"
                                >
                                    <X className="w-3 h-3 mr-1" /> Clear
                                </Button>
                            )}
                        </div>
                        <div className="ml-auto text-xs text-slate-400">
                            Showing {sortedTasks.length} tasks
                        </div>
                    </div>
                </div>

                {viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {sortedTasks.map((task, index) => {
                            const rowIndex = Math.floor(index / columns)
                            return (
                                <div key={task.id} className="h-full">
                                    <TaskCard
                                        task={task}
                                        currentUserId={currentUserId}
                                        userRole={currentUserRole}
                                        members={members}
                                        expanded={expandedRows.has(rowIndex)}
                                        onToggle={() => toggleRow(rowIndex)}
                                        isSelectionMode={isSelectionMode}
                                        isSelected={selectedTaskIds.has(task.id)}
                                        onToggleSelection={() => toggleTaskSelection(task.id)}
                                    />
                                </div>
                            )
                        })}
                        {sortedTasks.length === 0 && (
                            <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                                <div className="text-slate-400 mb-2">No tasks match your filters</div>
                                <Button
                                    variant="link"
                                    onClick={() => {
                                        setStatusFilter([])
                                        setAssigneeFilter('all')
                                    }}
                                    className="text-blue-600"
                                >
                                    Reset Filters
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {objectives.map(objective => {
                            const objectiveTasks = tasksByObjective[objective.id] || []
                            if (objectiveTasks.length === 0) return null

                            return (
                                <div key={objective.id} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                                        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                                            <div className="bg-blue-600 w-2 h-2 rounded-full" />
                                            {objective.title}
                                            <Badge variant="outline" className="ml-2 bg-white text-slate-600 font-normal">
                                                {objectiveTasks.length} Tasks
                                            </Badge>
                                        </h3>
                                    </div>
                                    <div>
                                        {objectiveTasks.map(task => (
                                            <div
                                                key={task.id}
                                                className="pl-12 pr-6 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 flex items-center justify-between group gap-4 relative cursor-pointer"
                                                onClick={() => setSelectedTask(task)}
                                            >
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-blue-500 transition-colors" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-medium text-slate-900 truncate">{task.title}</span>
                                                        <StatusBadge status={task.status} />
                                                    </div>
                                                    <div className="flex items-center gap-4 text-xs text-slate-500">
                                                        <span className="truncate">{task.description}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6 flex-shrink-0 text-sm">
                                                    <div className="flex items-center gap-1 text-slate-600 w-32">
                                                        {task.assignee ? (
                                                            <>
                                                                {task.assignee.role === "AI_Agent" ? "🤖" : "👤"}
                                                                <span className="truncate">{task.assignee.full_name}</span>
                                                            </>
                                                        ) : (
                                                            <span className="text-slate-400 italic">Unassigned</span>
                                                        )}
                                                    </div>
                                                    <div className="text-slate-500 w-24 text-right">
                                                        {task.end_date ? format(new Date(task.end_date), 'MMM d') : '-'}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}

                        {orphanedTasks.length > 0 && (
                            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                                    <h3 className="font-semibold text-slate-600 flex items-center gap-2">
                                        <div className="bg-slate-400 w-2 h-2 rounded-full" />
                                        General Tasks (No Objective)
                                    </h3>
                                </div>
                                <div>
                                    {orphanedTasks.map(task => (
                                        <div
                                            key={task.id}
                                            className="px-6 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 flex items-center justify-between group gap-4 cursor-pointer"
                                            onClick={() => setSelectedTask(task)}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium text-slate-900 truncate">{task.title}</span>
                                                    <StatusBadge status={task.status} />
                                                </div>
                                                <div className="flex items-center gap-4 text-xs text-slate-500">
                                                    <span className="truncate">{task.description}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-6 flex-shrink-0 text-sm">
                                                <div className="flex items-center gap-1 text-slate-600 w-32">
                                                    {task.assignee ? (
                                                        <>
                                                            {task.assignee.role === "AI_Agent" ? "🤖" : "👤"}
                                                            <span className="truncate">{task.assignee.full_name}</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-slate-400 italic">Unassigned</span>
                                                    )}
                                                </div>
                                                <div className="text-slate-500 w-24 text-right">
                                                    {task.end_date ? format(new Date(task.end_date), 'MMM d') : '-'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Task Detail Drawer */}
            <ThreadDrawer
                open={!!selectedTask}
                onOpenChange={(open) => !open && setSelectedTask(null)}
                taskId={selectedTask?.id || ''}
                taskTitle={selectedTask?.title || ''}
                taskStatus={selectedTask?.status || 'Pending'}
                taskDescription={selectedTask?.description || undefined}
                assigneeName={selectedTask?.assignee?.full_name || undefined}
                assigneeId={selectedTask?.assignee_id || undefined}
                assigneeRole={selectedTask?.assignee?.role}
                isAssignee={selectedTask?.assignee_id === currentUserId}
                isCreator={selectedTask?.creator_id === currentUserId}
                members={members}
            />
        </>
    )
}

function StatusBadge({ status }: { status: string | null }) {
    let color = 'bg-gray-500'
    if (status === 'Accepted') color = 'bg-green-600'
    if (status === 'Completed') color = 'bg-slate-800'
    if (status === 'Rejected') color = 'bg-red-600'

    return (
        <span className={`${color} text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium inline-block`}>
            {status || 'Pending'}
        </span>
    )
}
