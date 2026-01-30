"use client"

import Image from "next/image"

import { useState, useEffect, useCallback } from "react"
import { useAutoRefresh } from "@/hooks/useAutoRefresh"
import { RefreshButton } from "@/components/RefreshButton"
import { TaskCard } from "./task-card"
import { Button } from "@/components/ui/button"
import { LayoutGrid, List, X, Trash2, CheckSquare, Loader2, Check, UserPlus, Filter, ChevronDown, Bot } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getInitials } from "@/lib/utils"
import { deleteTasks, acceptTask, completeTask, updateTaskAssignees } from "@/actions/tasks"
import { toast } from "sonner"
import { CreateTaskDialog } from "./create-task-dialog"
import { QuickAddTask } from "@/components/ui/quick-add-task"
import { FeatureTip } from "@/components/onboarding"
import { Database } from "@/types/database.types"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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

    // Global expansion state - all cards expand/collapse together
    const [allExpanded, setAllExpanded] = useState(false)

    const toggleAllExpanded = () => {
        setAllExpanded(prev => !prev)
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
            <div className="space-y-8">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-blue-200">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3 mb-1">
                                <div className="h-8 w-1 bg-orange-600 rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                                <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight flex items-center gap-3">
                                    Tasks
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-50 text-orange-700 text-sm font-medium rounded-full">
                                        <span className="font-semibold">{tasks.length}</span>
                                        <span className="text-xs uppercase tracking-wider">total</span>
                                    </span>
                                </h1>
                            </div>
                            <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">Create and delegate tasks</p>
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
                                    <Button variant="secondary" size="sm" onClick={toggleSelectionMode} className="mr-2">
                                        <CheckSquare className="w-4 h-4 mr-2 text-muted-foreground" />
                                        Select
                                    </Button>
                                </>
                            )}
                            {viewMode === 'grid' && sortedTasks.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={toggleAllExpanded}
                                    className="text-xs text-muted-foreground hover:text-foreground mr-2"
                                >
                                    {allExpanded ? 'Collapse All' : 'Expand All'}
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
                            <FeatureTip
                                id="tasks-create"
                                title="Create Tasks"
                                description="Break down objectives into actionable tasks. Assign them to team members or AI agents, set deadlines, and track completion."
                            >
                                <CreateTaskDialog
                                    objectives={objectives}
                                    members={members}
                                    teams={teams}
                                    currentUserId={currentUserId}
                                />
                            </FeatureTip>
                        </div>
                    </div>

                    {/* Filter Presets */}
                    <div className="flex gap-3 mb-4">
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
                                        variant="secondary"
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
                                                            variant={statusFilter.includes(status) ? 'default' : 'secondary'}
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                        {sortedTasks.map((task) => (
                            <div key={task.id} className="h-full">
                                <TaskCard
                                    task={task}
                                    currentUserId={currentUserId}
                                    userRole={currentUserRole}
                                    members={members}
                                    expanded={allExpanded}
                                    onToggle={toggleAllExpanded}
                                    isSelectionMode={isSelectionMode}
                                    isSelected={selectedTaskIds.has(task.id)}
                                    onToggleSelection={() => toggleTaskSelection(task.id)}
                                />
                            </div>
                        ))}
                        {sortedTasks.length === 0 && (
                            <>
                                {tasks.length === 0 ? (
                                    <div className="col-span-full border border-slate-800 rounded-xl bg-slate-950 p-12 flex flex-col items-center justify-center text-center relative overflow-hidden group min-h-[500px]">
                                        {/* Blueprint Background Pattern */}
                                        <div className="absolute inset-0 opacity-20 pointer-events-none bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
                                        <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,#1e293b,transparent)] opacity-40 pointer-events-none"></div>

                                        <div className="relative z-10 w-64 h-64 mb-8 opacity-80 transition-all duration-700 group-hover:opacity-100 group-hover:scale-105 group-hover:rotate-1">
                                            <Image
                                                src="/images/tasks-empty-state.png"
                                                alt="No tasks blueprint"
                                                fill
                                                className="object-contain drop-shadow-2xl"
                                                priority
                                            />
                                        </div>
                                        <h3 className="text-2xl font-display font-medium text-slate-100 mb-3 relative z-10 tracking-tight">System Idle</h3>
                                        <p className="text-slate-400 max-w-sm mb-8 relative z-10 font-mono text-xs tracking-wide leading-relaxed">
                                            NO PROCESSING TASKS IN QUEUE.<br />
                                            INITIALIZE NEW DIRECTIVES TO BEGIN OPERATIONS.
                                        </p>
                                        <div className="relative z-10">
                                            {/* We can reproduce the button trigger here if needed, or guide user to the quick add */}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="col-span-full border-2 border-dashed border-blue-200 rounded-lg bg-slate-50/50">
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
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : (
                    <div className="space-y-8">
                        {objectives.map(objective => {
                            const objectiveTasks = tasksByObjective[objective.id] || []
                            if (objectiveTasks.length === 0) return null

                            return (
                                <div key={objective.id} className="border border-blue-200 rounded-lg overflow-hidden bg-white">
                                    <div className="bg-slate-50 px-4 py-3 border-b border-blue-200 flex justify-between items-center">
                                        <h3 className="font-semibold text-foreground flex items-center gap-2">
                                            {isSelectionMode && (
                                                <Checkbox
                                                    checked={objectiveTasks.every(t => selectedTaskIds.has(t.id))}
                                                    onCheckedChange={(checked) => {
                                                        const newSelection = new Set(selectedTaskIds)
                                                        if (checked) {
                                                            objectiveTasks.forEach(t => newSelection.add(t.id))
                                                        } else {
                                                            objectiveTasks.forEach(t => newSelection.delete(t.id))
                                                        }
                                                        setSelectedTaskIds(newSelection)
                                                    }}
                                                    aria-label={`Select all tasks in ${objective.title}`}
                                                />
                                            )}
                                            <div className="bg-blue-600 w-2 h-2 rounded-full" />
                                            {objective.title}
                                            <Badge variant="secondary" className="ml-2 bg-white text-slate-600 font-normal">
                                                {objectiveTasks.length} Tasks
                                            </Badge>
                                        </h3>
                                    </div>
                                    <div>
                                        {objectiveTasks.map(task => (
                                            <div
                                                key={task.id}
                                                className={cn(
                                                    "pl-5 pr-7 py-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 active:bg-slate-100 flex items-center justify-between group gap-4 relative cursor-pointer transition-colors duration-200",
                                                    isSelectionMode && selectedTaskIds.has(task.id) && "bg-blue-50 hover:bg-blue-100"
                                                )}
                                                onClick={() => {
                                                    if (isSelectionMode) {
                                                        toggleTaskSelection(task.id)
                                                    } else {
                                                        setSelectedTask(task)
                                                    }
                                                }}
                                            >
                                                {isSelectionMode && (
                                                    <div
                                                        className="flex-shrink-0"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            toggleTaskSelection(task.id)
                                                        }}
                                                    >
                                                        <Checkbox
                                                            checked={selectedTaskIds.has(task.id)}
                                                            onCheckedChange={() => toggleTaskSelection(task.id)}
                                                            aria-label={`Select task ${task.title}`}
                                                        />
                                                    </div>
                                                )}
                                                <div className={cn(
                                                    "absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-blue-500 transition-colors duration-200",
                                                    isSelectionMode && selectedTaskIds.has(task.id) && "bg-blue-500"
                                                )} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-display font-medium text-foreground truncate text-base tracking-tight">{task.title}</span>
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
                                                                <Avatar className="h-5 w-5 border border-white bg-slate-100">
                                                                    {task.assignee.role === "AI_Agent" ? (
                                                                        <AvatarImage src="/images/ai-agent-avatar.png" className="object-cover" />
                                                                    ) : null}
                                                                    <AvatarFallback className={cn(
                                                                        "text-[8px] text-white",
                                                                        task.assignee.role === "AI_Agent" ? "bg-purple-600" : "bg-slate-600"
                                                                    )}>
                                                                        {task.assignee.role === "AI_Agent" ? <Bot className="w-3 h-3" /> : getInitials(task.assignee.full_name)}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                <span className={cn("truncate", task.assignee.role === "AI_Agent" && "text-purple-700 font-medium")}>{task.assignee.full_name}</span>
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
                            <div className="border border-blue-200 rounded-lg overflow-hidden bg-white">
                                <div className="bg-slate-50 px-4 py-3 border-b border-blue-200">
                                    <h3 className="font-semibold text-muted-foreground flex items-center gap-2">
                                        {isSelectionMode && (
                                            <Checkbox
                                                checked={orphanedTasks.every(t => selectedTaskIds.has(t.id))}
                                                onCheckedChange={(checked) => {
                                                    const newSelection = new Set(selectedTaskIds)
                                                    if (checked) {
                                                        orphanedTasks.forEach(t => newSelection.add(t.id))
                                                    } else {
                                                        orphanedTasks.forEach(t => newSelection.delete(t.id))
                                                    }
                                                    setSelectedTaskIds(newSelection)
                                                }}
                                                aria-label="Select all general tasks"
                                            />
                                        )}
                                        <div className="bg-slate-400 w-2 h-2 rounded-full" />
                                        General Tasks (No Objective)
                                    </h3>
                                </div>
                                <div>
                                    {orphanedTasks.map(task => (
                                        <div
                                            key={task.id}
                                            className={cn(
                                                "px-5 py-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 active:bg-slate-100 flex items-center justify-between group gap-4 cursor-pointer transition-colors duration-200",
                                                isSelectionMode && selectedTaskIds.has(task.id) && "bg-blue-50 hover:bg-blue-100"
                                            )}
                                            onClick={() => {
                                                if (isSelectionMode) {
                                                    toggleTaskSelection(task.id)
                                                } else {
                                                    setSelectedTask(task)
                                                }
                                            }}
                                        >
                                            {isSelectionMode && (
                                                <div
                                                    className="flex-shrink-0"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        toggleTaskSelection(task.id)
                                                    }}
                                                >
                                                    <Checkbox
                                                        checked={selectedTaskIds.has(task.id)}
                                                        onCheckedChange={() => toggleTaskSelection(task.id)}
                                                        aria-label={`Select task ${task.title}`}
                                                    />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-display font-medium text-foreground truncate text-base tracking-tight">{task.title}</span>
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
                                                            <Avatar className="h-5 w-5 border border-white bg-slate-100">
                                                                {task.assignee.role === "AI_Agent" ? (
                                                                    <AvatarImage src="/images/ai-agent-avatar.png" className="object-cover" />
                                                                ) : null}
                                                                <AvatarFallback className={cn(
                                                                    "text-[8px] text-white",
                                                                    task.assignee.role === "AI_Agent" ? "bg-purple-600" : "bg-slate-600"
                                                                )}>
                                                                    {task.assignee.role === "AI_Agent" ? <Bot className="w-3 h-3" /> : getInitials(task.assignee.full_name)}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <span className={cn("truncate", task.assignee.role === "AI_Agent" && "text-purple-700 font-medium")}>{task.assignee.full_name}</span>
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
            {
                selectedTaskIds.size > 0 && (
                    <div className="fixed bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white rounded-lg shadow-lg p-4 flex items-center gap-3 z-50">
                        <span className="text-sm font-medium">{selectedTaskIds.size} selected</span>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleBulkAccept}
                            disabled={isBulkOperating}
                            className="bg-white text-slate-900 hover:bg-slate-100"
                        >
                            <Check className="w-4 h-4 mr-1" />
                            Accept
                        </Button>
                        <Button
                            size="sm"
                            variant="secondary"
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
                                    variant="secondary"
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
                )
            }

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
