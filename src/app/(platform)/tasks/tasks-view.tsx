"use client"

import { useState, useEffect, useCallback } from "react"
import { useAutoRefresh } from "@/hooks/useAutoRefresh"
import { RefreshButton } from "@/components/RefreshButton"
import { TaskCard } from "./task-card"
import { Button } from "@/components/ui/button"
import { LayoutGrid, List, X, Trash2, CheckSquare, Loader2, Check, UserPlus, Filter, ChevronDown } from "lucide-react"
import { deleteTasks, acceptTask, completeTask, updateTaskAssignees } from "@/actions/tasks"
import { toast } from "sonner"
import { CreateTaskDialog } from "./create-task-dialog"
import { QuickAddTask } from "@/components/ui/quick-add-task"
import { Database } from "@/types/database.types"
import { Badge } from "@/components/ui/badge"
import { format, isThisWeek } from "date-fns"
import { ThreadDrawer } from "./thread-drawer"
import { cn } from "@/lib/utils"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
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
import { EmptyState } from "@/components/ui/empty-state"
import { Inbox } from "lucide-react"
import { getStatusBadgeClass } from "@/lib/status-colors"

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
    teams: { id: string, name: string }[]
}

// ...
export function TasksView({ tasks, objectives, members, currentUserId, currentUserRole, teams }: TasksViewProps) {
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [selectedTask, setSelectedTask] = useState<Task | null>(null)
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
    const [isBulkDeleting, setIsBulkDeleting] = useState(false)
    const [isBulkOperating, setIsBulkOperating] = useState(false)
    const [assignDialogOpen, setAssignDialogOpen] = useState(false)
    const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("")

    // Filter & Sort State
    const [statusFilter, setStatusFilter] = useState<string[]>([])
    const [assigneeFilter, setAssigneeFilter] = useState<string | 'unassigned' | 'all'>('all')
    const [sortBy, setSortBy] = useState<'due_date_asc' | 'due_date_desc' | 'created_desc'>('due_date_asc')
    const [filtersOpen, setFiltersOpen] = useState(false)
    
    // Filter Presets State
    const [activePreset, setActivePreset] = useState<string | null>(null)
    
    // Load active preset from localStorage on mount
    useEffect(() => {
        const savedPreset = localStorage.getItem('tasks-active-preset')
        if (savedPreset) {
            setActivePreset(savedPreset)
        }
    }, [])
    
    // Save active preset to localStorage when it changes
    useEffect(() => {
        if (activePreset) {
            localStorage.setItem('tasks-active-preset', activePreset)
        } else {
            localStorage.removeItem('tasks-active-preset')
        }
    }, [activePreset])

    // Auto-refresh using Supabase Realtime
    useAutoRefresh({ tables: ['tasks', 'task_comments', 'task_files'] })

    // Keyboard shortcut for quick add (N key)
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                // Check if not in input/textarea/contenteditable
                const activeElement = document.activeElement
                const tagName = activeElement?.tagName
                const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA'
                const isContentEditable = activeElement?.getAttribute('contenteditable') === 'true'
                
                if (!isInput && !isContentEditable) {
                    e.preventDefault()
                    // Trigger quick add expansion
                    const quickAddButton = document.querySelector('[data-quick-add-trigger]') as HTMLButtonElement
                    if (quickAddButton) {
                        quickAddButton.click()
                    }
                }
            }
        }
        document.addEventListener('keydown', handleKeyPress)
        return () => document.removeEventListener('keydown', handleKeyPress)
    }, [])

    // Filter Presets
    const filterPresets = [
        { 
            id: 'my-tasks', 
            label: 'My Tasks', 
            filter: (task: Task) => task.assignee_id === currentUserId 
        },
        { 
            id: 'overdue', 
            label: 'Overdue', 
            filter: (task: Task) => task.end_date && new Date(task.end_date) < new Date() && task.status !== 'Completed' 
        },
        { 
            id: 'this-week', 
            label: 'This Week', 
            filter: (task: Task) => task.end_date && isThisWeek(new Date(task.end_date)) 
        },
        { 
            id: 'needs-action', 
            label: 'Needs Action', 
            filter: (task: Task) => ['Pending', 'Accepted'].includes(task.status || '') 
        },
    ]

    // Filter Logic
    const filteredTasks = tasks.filter(task => {
        // Apply preset filter first if active
        if (activePreset) {
            const preset = filterPresets.find(p => p.id === activePreset)
            if (preset && !preset.filter(task)) return false
        }

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

    const toggleTaskSelection = useCallback((taskId: string) => {
        setSelectedTaskIds(prev => {
            const newSet = new Set(prev)
            if (newSet.has(taskId)) newSet.delete(taskId)
            else newSet.add(taskId)
            return newSet
        })
    }, [])

    const handleBulkDelete = async () => {
        if (selectedTaskIds.size === 0) return
        if (!confirm(`Are you sure you want to delete ${selectedTaskIds.size} tasks?`)) return

        setIsBulkDeleting(true)
        try {
            const result = await deleteTasks(Array.from(selectedTaskIds))
            if (result?.error) {
                toast.error(result.error)
                return
            }
            toast.success(`${selectedTaskIds.size} tasks deleted`)
            setIsSelectionMode(false)
            setSelectedTaskIds(new Set())
        } finally {
            setIsBulkDeleting(false)
        }
    }

    const handleBulkAccept = async () => {
        if (selectedTaskIds.size === 0) return
        setIsBulkOperating(true)
        try {
            const taskIdsArray = Array.from(selectedTaskIds)
            let successCount = 0
            let errorCount = 0

            for (const taskId of taskIdsArray) {
                const result = await acceptTask(taskId)
                if (result?.error) {
                    errorCount++
                } else {
                    successCount++
                }
            }

            if (successCount > 0) {
                toast.success(`${successCount} task${successCount > 1 ? 's' : ''} accepted`)
            }
            if (errorCount > 0) {
                toast.error(`${errorCount} task${errorCount > 1 ? 's' : ''} failed to accept`)
            }
            setIsSelectionMode(false)
            setSelectedTaskIds(new Set())
        } finally {
            setIsBulkOperating(false)
        }
    }

    const handleBulkComplete = async () => {
        if (selectedTaskIds.size === 0) return
        setIsBulkOperating(true)
        try {
            const taskIdsArray = Array.from(selectedTaskIds)
            let successCount = 0
            let errorCount = 0

            for (const taskId of taskIdsArray) {
                const result = await completeTask(taskId)
                if (result?.error) {
                    errorCount++
                } else {
                    successCount++
                }
            }

            if (successCount > 0) {
                toast.success(`${successCount} task${successCount > 1 ? 's' : ''} completed`)
            }
            if (errorCount > 0) {
                toast.error(`${errorCount} task${errorCount > 1 ? 's' : ''} failed to complete`)
            }
            setIsSelectionMode(false)
            setSelectedTaskIds(new Set())
        } finally {
            setIsBulkOperating(false)
        }
    }

    const handleBulkAssign = async (assigneeId?: string) => {
        const targetAssigneeId = assigneeId || selectedAssigneeId
        if (selectedTaskIds.size === 0 || !targetAssigneeId) return
        setIsBulkOperating(true)
        try {
            const taskIdsArray = Array.from(selectedTaskIds)
            let successCount = 0
            let errorCount = 0

            for (const taskId of taskIdsArray) {
                const result = await updateTaskAssignees(taskId, [targetAssigneeId])
                if (result?.error) {
                    errorCount++
                } else {
                    successCount++
                }
            }

            if (successCount > 0) {
                toast.success(`${successCount} task${successCount > 1 ? 's' : ''} assigned`)
            }
            if (errorCount > 0) {
                toast.error(`${errorCount} task${errorCount > 1 ? 's' : ''} failed to assign`)
            }
            setIsSelectionMode(false)
            setSelectedTaskIds(new Set())
            setAssignDialogOpen(false)
            setSelectedAssigneeId("")
        } finally {
            setIsBulkOperating(false)
        }
    }

    return (
        <>
            <div className="space-y-6">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2 flex items-center gap-3">
                                Tasks
                                <span className="text-muted-foreground font-medium text-2xl">{tasks.length}</span>
                            </h1>
                            <p className="text-muted-foreground">Democratic workflow management.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {isSelectionMode ? (
                                <div className="flex items-center gap-2 mr-2">
                                    <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={selectedTaskIds.size === 0 || isBulkDeleting}>
                                        {isBulkDeleting ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Deleting...
                                            </>
                                        ) : (
                                            <>
                                                <Trash2 className="w-4 h-4 mr-2" />
                                                Delete ({selectedTaskIds.size})
                                            </>
                                        )}
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={toggleSelectionMode} disabled={isBulkDeleting}>
                                        Cancel
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    <RefreshButton />
                                    <Button variant="outline" size="sm" onClick={toggleSelectionMode} className="mr-2">
                                        <CheckSquare className="w-4 h-4 mr-2 text-muted-foreground" />
                                        Select
                                    </Button>
                                </>
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
                                teams={teams}
                                currentUserId={currentUserId}
                            />
                        </div>
                    </div>

                    {/* Filter Presets */}
                    <div className="flex gap-2 mb-4">
                        {filterPresets.map(preset => (
                            <button
                                key={preset.id}
                                onClick={() => setActivePreset(activePreset === preset.id ? null : preset.id)}
                                className={cn(
                                    "px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
                                    activePreset === preset.id
                                        ? "bg-slate-900 text-white"
                                        : "bg-slate-100 text-muted-foreground hover:bg-slate-200"
                                )}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    {/* Collapsible Filter Bar */}
                    <div className="mb-4">
                        {(() => {
                            const activeFilterCount = statusFilter.length + (assigneeFilter !== 'all' ? 1 : 0)
                            return (
                                <>
                                    <Button 
                                        variant="outline" 
                                        onClick={() => setFiltersOpen(!filtersOpen)}
                                        className="mb-2"
                                    >
                                        <Filter className="w-4 h-4 mr-2" />
                                        Filters
                                        {activeFilterCount > 0 && (
                                            <Badge className="ml-2 bg-amber-600 text-white">{activeFilterCount}</Badge>
                                        )}
                                        <ChevronDown className={cn("w-4 h-4 ml-2 transition-transform", filtersOpen && "rotate-180")} />
                                    </Button>
                                    
                                    {filtersOpen && (
                                        <div className="p-4 border rounded-lg bg-slate-50 space-y-4">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <div className="flex items-center gap-2 pr-4 border-r border-slate-200">
                                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status:</span>
                                                    {['Pending', 'Accepted', 'Completed', 'Rejected'].map(status => (
                                                        <Badge
                                                            key={status}
                                                            variant={statusFilter.includes(status) ? 'default' : 'outline'}
                                                            className={cn(
                                                                "cursor-pointer hover:opacity-80 active:opacity-70 transition-all duration-200",
                                                                statusFilter.includes(status)
                                                                    ? getStatusBadgeClass(status)
                                                                    : "text-muted-foreground bg-white hover:bg-slate-50 active:bg-slate-100"
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
                                                        <SelectTrigger className="h-8 w-[180px] text-xs bg-white border-slate-200">
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
                                                        onValueChange={(val) => setSortBy(val as 'due_date_asc' | 'due_date_desc' | 'created_desc')}
                                                    >
                                                        <SelectTrigger className="h-8 w-[160px] text-xs bg-white border-slate-200">
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
                                                            className="text-muted-foreground hover:text-red-500 active:text-red-600 h-8 ml-2 transition-colors duration-200"
                                                        >
                                                            <X className="w-3 h-3 mr-1" /> Clear
                                                        </Button>
                                                    )}
                                                </div>
                                                <div className="ml-auto text-xs text-muted-foreground">
                                                    Showing {sortedTasks.length} tasks
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )
                        })()}
                    </div>
                </div>

                {/* Quick Add Task */}
                <div className="mb-4">
                    <QuickAddTask
                        objectives={objectives}
                        members={members}
                        currentUserId={currentUserId}
                        teams={teams}
                        onTaskCreated={() => {
                            // Auto-refresh will handle the update via useAutoRefresh hook
                        }}
                    />
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
                            <div className="col-span-full border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                                {tasks.length === 0 ? (
                                    <EmptyState
                                        icon={<Inbox className="h-12 w-12" />}
                                        title="No tasks yet"
                                        description="Create your first task to get started with task management."
                                    />
                                ) : (
                                    <EmptyState
                                        icon={<Inbox className="h-8 w-8" />}
                                        title="No tasks match your filters"
                                        description="Try adjusting your filters to see more tasks."
                                        action={
                                            <Button
                                                variant="link"
                                                onClick={() => {
                                                    setStatusFilter([])
                                                    setAssigneeFilter('all')
                                                    setActivePreset(null)
                                                }}
                                                className="text-blue-600"
                                            >
                                                Reset Filters
                                            </Button>
                                        }
                                    />
                                )}
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
                                                className="pl-12 pr-6 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 active:bg-slate-100 flex items-center justify-between group gap-4 relative cursor-pointer transition-colors duration-200"
                                                onClick={() => setSelectedTask(task)}
                                            >
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-blue-500 transition-colors duration-200" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-medium text-foreground truncate">{task.title}</span>
                                                        <StatusBadge status={task.status} />
                                                    </div>
                                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                        <span className="truncate">{task.description}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6 flex-shrink-0 text-sm">
                                                    <div className="flex items-center gap-1 text-muted-foreground w-32">
                                                        {task.assignee ? (
                                                            <>
                                                                {task.assignee.role === "AI_Agent" ? "🤖" : "👤"}
                                                                <span className="truncate">{task.assignee.full_name}</span>
                                                            </>
                                                        ) : (
                                                            <span className="text-muted-foreground italic">Unassigned</span>
                                                        )}
                                                    </div>
                                                    <div className="text-muted-foreground w-24 text-right">
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
                                    <h3 className="font-semibold text-muted-foreground flex items-center gap-2">
                                        <div className="bg-slate-400 w-2 h-2 rounded-full" />
                                        General Tasks (No Objective)
                                    </h3>
                                </div>
                                <div>
                                    {orphanedTasks.map(task => (
                                        <div
                                            key={task.id}
                                            className="px-6 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 active:bg-slate-100 flex items-center justify-between group gap-4 cursor-pointer transition-colors duration-200"
                                            onClick={() => setSelectedTask(task)}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium text-foreground truncate">{task.title}</span>
                                                    <StatusBadge status={task.status} />
                                                </div>
                                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                    <span className="truncate">{task.description}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-6 flex-shrink-0 text-sm">
                                                <div className="flex items-center gap-1 text-muted-foreground w-32">
                                                    {task.assignee ? (
                                                        <>
                                                            {task.assignee.role === "AI_Agent" ? "🤖" : "👤"}
                                                            <span className="truncate">{task.assignee.full_name}</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-muted-foreground italic">Unassigned</span>
                                                    )}
                                                </div>
                                                <div className="text-muted-foreground w-24 text-right">
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

            {/* Bulk Action Toolbar */}
            {selectedTaskIds.size > 0 && (
                <div className="fixed bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white rounded-lg shadow-lg p-4 flex items-center gap-3 z-50">
                    <span className="text-sm font-medium">{selectedTaskIds.size} selected</span>
                    <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleBulkAccept}
                        disabled={isBulkOperating}
                        className="bg-white text-slate-900 hover:bg-slate-100"
                    >
                        <Check className="w-4 h-4 mr-1" />
                        Accept
                    </Button>
                    <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleBulkComplete}
                        disabled={isBulkOperating}
                        className="bg-white text-slate-900 hover:bg-slate-100"
                    >
                        <CheckSquare className="w-4 h-4 mr-1" />
                        Complete
                    </Button>
                    <Popover open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
                        <PopoverTrigger asChild>
                            <Button 
                                size="sm" 
                                variant="outline"
                                disabled={isBulkOperating}
                                className="bg-white text-slate-900 hover:bg-slate-100"
                            >
                                <UserPlus className="w-4 h-4 mr-1" />
                                Assign
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[240px] p-0" align="end">
                            <Command>
                                <CommandInput placeholder="Search members..." />
                                <CommandList>
                                    <CommandEmpty>No members found.</CommandEmpty>
                                    <CommandGroup>
                                        {members.map((member) => (
                                            <CommandItem
                                                key={member.id}
                                                value={member.full_name || ''}
                                                onSelect={() => {
                                                    setAssignDialogOpen(false)
                                                    handleBulkAssign(member.id)
                                                }}
                                            >
                                                {member.full_name} {member.role === 'AI_Agent' ? '🤖' : ''}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                    <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={handleBulkDelete}
                        disabled={isBulkDeleting || isBulkOperating}
                        className="bg-red-600 hover:bg-red-700"
                    >
                        {isBulkDeleting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                Deleting...
                            </>
                        ) : (
                            <>
                                <Trash2 className="w-4 h-4 mr-1" />
                                Delete
                            </>
                        )}
                    </Button>
                    <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => {
                            setIsSelectionMode(false)
                            setSelectedTaskIds(new Set())
                        }}
                        disabled={isBulkOperating || isBulkDeleting}
                        className="text-white hover:bg-slate-800"
                    >
                        Cancel
                    </Button>
                </div>
            )}

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
    return (
        <span className={cn('px-2 py-1 rounded-full text-xs font-medium', getStatusBadgeClass(status))}>
            {(status || 'Pending').replace(/_/g, ' ')}
        </span>
    )
}
