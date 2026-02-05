"use client"

import Image from "next/image"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useAutoRefresh } from "@/hooks/useAutoRefresh"
import { useDebounce } from "@/hooks/useDebounce"
import { RefreshButton } from "@/components/RefreshButton"
import { SearchInput } from "@/components/ui/search-input"
import { TaskCard } from "./task-card"
import { Button } from "@/components/ui/button"
import { LayoutGrid, List, X, Trash2, CheckSquare, Loader2, Check, UserPlus, Filter, ChevronDown, ChevronRight, CalendarDays, Inbox, History } from "lucide-react"
import { UserAvatar, UserAvatarStack } from "@/components/ui/user-avatar"
import { deleteTasks, acceptTask, completeTask, updateTaskAssignees } from "@/actions/tasks"
import { deleteObjectives } from "@/actions/objectives"
import { toast } from "sonner"
import { CreateTaskDialog } from "./create-task-dialog"
import { QuickAddTask } from "@/components/ui/quick-add-task"
import { FeatureTip } from "@/components/onboarding"
import { Database } from "@/types/database.types"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { format, isThisWeek } from "date-fns"
import { FullTaskView } from "@/components/tasks/full-task-view"
import { cn } from "@/lib/utils"
import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
} from "@/components/ui/tabs"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Progress } from "@/components/ui/progress"
import { getStatusBadgeClass } from "@/lib/status-colors"
import { GanttView, JoinedTask } from "@/components/timeline/GanttView"
import { TasksAnalytics } from "@/components/tasks/tasks-analytics"

// Task type - extended from database type with joined relations
// Must match TaskCard's Task type for compatibility
type Task = Database["public"]["Tables"]["tasks"]["Row"] & {
    assignee?: { id: string, full_name: string | null, role: string, email: string, avatar_url?: string | null } | null
    assignees?: { id: string, full_name: string | null, role: string, email: string, avatar_url?: string | null }[]
    task_number?: number
    task_files?: { id: string }[]
    objective?: { id: string, title: string } | null
    message_count?: number
}

type Objective = {
    id: string
    title: string
}

type Member = {
    id: string
    full_name: string
    role: string
    email: string
}

interface TasksViewProps {
    tasks: Task[]
    objectives: Objective[]
    members: Member[]
    currentUserId: string
    currentUserRole?: string
    teams: { id: string, name: string }[]
    initialTaskId?: string
}

// ...
export function TasksView({ tasks, objectives, members, currentUserId, currentUserRole, teams, initialTaskId }: TasksViewProps) {
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'timeline'>('grid')
    const [selectedTask, setSelectedTask] = useState<Task | null>(null)
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
    const [selectedObjectiveIds, setSelectedObjectiveIds] = useState<Set<string>>(new Set())
    const [isBulkDeleting, setIsBulkDeleting] = useState(false)
    const [isBulkOperating, setIsBulkOperating] = useState(false)
    const [assignDialogOpen, setAssignDialogOpen] = useState(false)
    const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("")
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    // Filter & Sort State
    const [statusFilter, setStatusFilter] = useState<string[]>([])
    const [assigneeFilter, setAssigneeFilter] = useState<string | 'unassigned' | 'all'>('all')
    const [sortBy, setSortBy] = useState<'due_date_asc' | 'due_date_desc' | 'created_desc'>('due_date_asc')
    
    // Search state
    const [searchQuery, setSearchQuery] = useState('')
    const debouncedQuery = useDebounce(searchQuery, 300)

    // Tab State for Active/History/All
    const [activeTab, setActiveTab] = useState<'active' | 'history' | 'all'>('active')

    // Status categories for tabs
    const ACTIVE_STATUSES = ['Pending', 'Accepted', 'Pending_Peer_Review', 'Pending_Executive_Approval', 'Amended', 'Amended_Pending_Approval']
    const HISTORY_STATUSES = ['Completed', 'Rejected']

    // Filter Presets State
    const [activePreset, setActivePreset] = useState<string | null>(null)

    // Auto-open task from notification link (if initialTaskId is provided)
    useEffect(() => {
        if (initialTaskId && tasks.length > 0) {
            const task = tasks.find(t => t.id === initialTaskId)
            if (task) {
                setSelectedTask(task)
            }
        }
    }, [initialTaskId, tasks])

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
            id: 'all-tasks',
            label: 'All Tasks',
            filter: (task: Task) => true // Show all tasks
        },
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

    // Search filtering flag
    const isSearching = debouncedQuery.trim() !== ''
    
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
        
        // Search Filter
        if (debouncedQuery.trim()) {
            const query = debouncedQuery.toLowerCase().trim()
            const numQuery = query.replace(/^#/, '') // Handle "#123" format
            
            const matchesTitle = task.title?.toLowerCase().includes(query)
            const matchesDescription = task.description?.toLowerCase().includes(query)
            const matchesTaskNumber = task.task_number?.toString() === numQuery
            const matchesObjective = task.objective?.title?.toLowerCase().includes(query)
            const matchesAssignee = task.assignee?.full_name?.toLowerCase().includes(query)
            
            if (!matchesTitle && !matchesDescription && !matchesTaskNumber && !matchesObjective && !matchesAssignee) {
                return false
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

    // Separate tasks by tab (active vs history)
    const activeTasks = sortedTasks.filter(task => ACTIVE_STATUSES.includes(task.status || 'Pending'))
    const historyTasks = sortedTasks.filter(task => HISTORY_STATUSES.includes(task.status || ''))
    
    // Sort history tasks by completion date (most recent first)
    const sortedHistoryTasks = [...historyTasks].sort((a, b) => {
        return new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime()
    })

    // Get tasks for current tab
    const tabTasks = activeTab === 'active' ? activeTasks : activeTab === 'history' ? sortedHistoryTasks : sortedTasks

    // Tab counts (from all tasks, not filtered)
    const activeCount = tasks.filter(task => ACTIVE_STATUSES.includes(task.status || 'Pending')).length
    const historyCount = tasks.filter(task => HISTORY_STATUSES.includes(task.status || '')).length

    // Timeline view uses the same filtered tasks as grid/list views for consistency
    // (Removed separate timelineTasks variable - timeline now respects all filters)

    // Group tasks by objective (using tab-filtered tasks)
    const tasksByObjective: Record<string, Task[]> = {}
    const orphanedTasks: Task[] = []

    tabTasks.forEach(task => {
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

    // Single card expansion state - only one card can be expanded at a time for cleaner UX
    const [expandedCardId, setExpandedCardId] = useState<string | null>(null)

    const toggleCardExpanded = useCallback((taskId: string) => {
        setExpandedCardId(prev => prev === taskId ? null : taskId)
    }, [])

    const collapseAll = () => {
        setExpandedCardId(null)
    }

    const hasExpandedCard = expandedCardId !== null

    // Objective expansion state for list view - all objectives expanded by default
    const [expandedObjectives, setExpandedObjectives] = useState<Set<string>>(
        new Set([...objectives.map(o => o.id), 'orphaned'])
    )

    // Inline assignee picker state for list view
    const [assigneePickerTaskId, setAssigneePickerTaskId] = useState<string | null>(null)
    const [isUpdatingAssignees, setIsUpdatingAssignees] = useState(false)

    const toggleObjectiveExpanded = useCallback((objectiveId: string) => {
        setExpandedObjectives(prev => {
            const newSet = new Set(prev)
            if (newSet.has(objectiveId)) {
                newSet.delete(objectiveId)
            } else {
                newSet.add(objectiveId)
            }
            return newSet
        })
    }, [])

    // Selection Handlers
    const toggleSelectionMode = () => {
        setIsSelectionMode(prev => !prev)
        setSelectedTaskIds(new Set())
        setSelectedObjectiveIds(new Set())
    }

    const toggleObjectiveSelection = useCallback((objectiveId: string) => {
        setSelectedObjectiveIds(prev => {
            const newSet = new Set(prev)
            if (newSet.has(objectiveId)) {
                newSet.delete(objectiveId)
            } else {
                newSet.add(objectiveId)
            }
            return newSet
        })
    }, [])

    const toggleTaskSelection = useCallback((taskId: string) => {
        setSelectedTaskIds(prev => {
            const newSet = new Set(prev)
            if (newSet.has(taskId)) newSet.delete(taskId)
            else newSet.add(taskId)
            return newSet
        })
    }, [])

    const handleBulkDeleteClick = () => {
        if (selectedTaskIds.size === 0 && selectedObjectiveIds.size === 0) return
        setShowDeleteConfirm(true)
    }

    const handleBulkDeleteConfirm = async () => {
        setShowDeleteConfirm(false)
        setIsBulkDeleting(true)
        try {
            let tasksDeleted = 0
            let objectivesDeleted = 0

            // Delete selected tasks
            if (selectedTaskIds.size > 0) {
                const taskResult = await deleteTasks(Array.from(selectedTaskIds))
                if (taskResult?.error) {
                    toast.error(`Tasks: ${taskResult.error}`)
                } else {
                    tasksDeleted = selectedTaskIds.size
                }
            }

            // Delete selected objectives
            if (selectedObjectiveIds.size > 0) {
                const objectiveResult = await deleteObjectives(Array.from(selectedObjectiveIds))
                if (objectiveResult?.error) {
                    toast.error(`Objectives: ${objectiveResult.error}`)
                } else {
                    objectivesDeleted = selectedObjectiveIds.size
                }
            }

            // Show success message
            const messages: string[] = []
            if (tasksDeleted > 0) messages.push(`${tasksDeleted} task${tasksDeleted > 1 ? 's' : ''}`)
            if (objectivesDeleted > 0) messages.push(`${objectivesDeleted} objective${objectivesDeleted > 1 ? 's' : ''}`)
            if (messages.length > 0) {
                toast.success(`Deleted ${messages.join(' and ')}`)
            }

            setIsSelectionMode(false)
            setSelectedTaskIds(new Set())
            setSelectedObjectiveIds(new Set())
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

    // Handle inline assignee update for list view
    const handleInlineAssigneeUpdate = async (taskId: string, assigneeIds: string[]) => {
        setIsUpdatingAssignees(true)
        try {
            const result = await updateTaskAssignees(taskId, assigneeIds)
            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success('Assignees updated')
            }
        } finally {
            setIsUpdatingAssignees(false)
            setAssigneePickerTaskId(null)
        }
    }

    return (
        <>
            <div className="space-y-8">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
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
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Tab Switcher - Desktop */}
                            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'active' | 'history' | 'all')} className="hidden sm:block">
                                <TabsList className="h-9">
                                    <TabsTrigger value="active" className="text-xs px-3">
                                        Active
                                        <span className="ml-1.5 text-muted-foreground">({activeCount})</span>
                                    </TabsTrigger>
                                    <TabsTrigger value="history" className="text-xs px-3">
                                        History
                                        <span className="ml-1.5 text-muted-foreground">({historyCount})</span>
                                    </TabsTrigger>
                                    <TabsTrigger value="all" className="text-xs px-3">
                                        All
                                        <span className="ml-1.5 text-muted-foreground">({tasks.length})</span>
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                            
                            {/* Tab Switcher - Mobile */}
                            <Select value={activeTab} onValueChange={(val) => setActiveTab(val as 'active' | 'history' | 'all')}>
                                <SelectTrigger className="h-9 w-[130px] sm:hidden">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active ({activeCount})</SelectItem>
                                    <SelectItem value="history">History ({historyCount})</SelectItem>
                                    <SelectItem value="all">All ({tasks.length})</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {isSelectionMode ? (
                                <div className="flex items-center gap-2">
                                    <Button variant="destructive" size="sm" onClick={handleBulkDeleteClick} disabled={selectedTaskIds.size === 0 || isBulkDeleting}>
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
                                    {/* Search Input */}
                                    <SearchInput
                                        value={searchQuery}
                                        onChange={setSearchQuery}
                                        placeholder="Search tasks..."
                                        aria-label="Search tasks"
                                        className="w-[180px] sm:w-[220px]"
                                    />
                                    
                                    {/* Preset Dropdown */}
                                    <Select 
                                        value={activePreset || 'all-tasks'} 
                                        onValueChange={(val) => setActivePreset(val === 'all-tasks' ? null : val)}
                                    >
                                        <SelectTrigger className="h-9 w-[160px] sm:w-[180px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {filterPresets.map(preset => {
                                                const count = tasks.filter(preset.filter).length
                                                return (
                                                    <SelectItem key={preset.id} value={preset.id}>
                                                        {preset.label} ({count})
                                                    </SelectItem>
                                                )
                                            })}
                                        </SelectContent>
                                    </Select>

                                    {/* Filters Popover */}
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="secondary" size="sm" className="h-9">
                                                <Filter className="h-4 w-4 mr-2" />
                                                Filters
                                                {(() => {
                                                    const activeFilterCount = statusFilter.length + (assigneeFilter !== 'all' ? 1 : 0)
                                                    return activeFilterCount > 0 ? (
                                                        <Badge className="ml-2 bg-international-orange text-white">{activeFilterCount}</Badge>
                                                    ) : null
                                                })()}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[320px] sm:w-[400px]" align="end">
                                            <div className="space-y-4">
                                                <div>
                                                    <Label className="text-sm font-medium mb-2 block">Status</Label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {['Pending', 'Accepted', 'Completed', 'Rejected'].map(status => (
                                                            <Badge
                                                                key={status}
                                                                variant={statusFilter.includes(status) ? 'default' : 'secondary'}
                                                                className={cn(
                                                                    "cursor-pointer hover:opacity-80 active:opacity-70 transition-all duration-200",
                                                                    statusFilter.includes(status)
                                                                        ? getStatusBadgeClass(status)
                                                                        : "text-muted-foreground bg-background hover:bg-muted active:bg-muted"
                                                                )}
                                                                onClick={() => toggleStatusFilter(status)}
                                                            >
                                                                {status}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div>
                                                    <Label className="text-sm font-medium mb-2 block">Assignee</Label>
                                                    <Select
                                                        value={assigneeFilter}
                                                        onValueChange={(val) => setAssigneeFilter(val as string)}
                                                    >
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue placeholder="All Assignees" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="all">All Assignees</SelectItem>
                                                            <SelectItem value="unassigned">Unassigned</SelectItem>
                                                            {members.map(m => (
                                                                <SelectItem key={m.id} value={m.id}>
                                                                    <div className="flex items-center gap-2">
                                                                        <UserAvatar 
                                                                            name={m.full_name} 
                                                                            role={m.role} 
                                                                            size="xs" 
                                                                        />
                                                                        <span>{m.full_name}</span>
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                <div>
                                                    <Label className="text-sm font-medium mb-2 block">Sort By</Label>
                                                    <Select
                                                        value={sortBy}
                                                        onValueChange={(val) => setSortBy(val as 'due_date_asc' | 'due_date_desc' | 'created_desc')}
                                                    >
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue placeholder="Sort by" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="due_date_asc">Due Date (Earliest)</SelectItem>
                                                            <SelectItem value="due_date_desc">Due Date (Latest)</SelectItem>
                                                            <SelectItem value="created_desc">Newest Created</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                {(statusFilter.length > 0 || assigneeFilter !== 'all') && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            setStatusFilter([])
                                                            setAssigneeFilter('all')
                                                            setSortBy('due_date_asc')
                                                        }}
                                                        className="w-full"
                                                    >
                                                        <X className="w-4 h-4 mr-2" /> Clear Filters
                                                    </Button>
                                                )}
                                            </div>
                                        </PopoverContent>
                                    </Popover>

                                    {/* View Mode Switcher */}
                                    <div className="bg-muted/50 p-1 rounded-xl flex items-center border border-muted">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setViewMode('grid')}
                                            className={cn(
                                                "h-8 w-8 p-0 rounded-md transition-all duration-200",
                                                viewMode === 'grid' 
                                                    ? 'bg-international-orange/10 text-international-orange shadow-sm' 
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                            )}
                                            aria-label="Grid view"
                                        >
                                            <LayoutGrid className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setViewMode('list')}
                                            className={cn(
                                                "h-8 w-8 p-0 rounded-md transition-all duration-200",
                                                viewMode === 'list' 
                                                    ? 'bg-international-orange/10 text-international-orange shadow-sm' 
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                            )}
                                            aria-label="List view"
                                        >
                                            <List className="h-4 w-4" />
                                        </Button>
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setViewMode('timeline')}
                                                        className={cn(
                                                            "h-8 w-8 p-0 rounded-md transition-all duration-200",
                                                            viewMode === 'timeline' 
                                                                ? 'bg-international-orange/10 text-international-orange shadow-sm' 
                                                                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                                        )}
                                                        aria-label="Timeline view"
                                                    >
                                                        <CalendarDays className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Timeline (Gantt chart view)</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>

                                    {/* Collapse All (for grid view) */}
                                    {viewMode === 'grid' && hasExpandedCard && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={collapseAll}
                                            className="text-xs text-muted-foreground hover:text-foreground"
                                        >
                                            Collapse
                                        </Button>
                                    )}

                                    {/* Active Filter Indicator */}
                                    {(activePreset || statusFilter.length > 0 || assigneeFilter !== 'all' || isSearching) && (
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-international-orange/5 border border-international-orange/20 rounded-xl">
                                            <Filter className="h-3.5 w-3.5 text-international-orange" />
                                            <span className="text-xs font-medium text-international-orange">
                                                Showing {sortedTasks.length} of {tasks.length}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    setActivePreset(null)
                                                    setStatusFilter([])
                                                    setAssigneeFilter('all')
                                                    setSearchQuery('')
                                                }}
                                                className="text-international-orange hover:text-international-orange-hover transition-colors"
                                                aria-label="Clear all filters"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    )}

                                    {/* Refresh and Select */}
                                    <RefreshButton />
                                    <Button variant="secondary" size="sm" onClick={toggleSelectionMode}>
                                        <CheckSquare className="w-4 h-4 mr-2 text-muted-foreground" />
                                        Select
                                    </Button>

                                    {/* Create Task */}
                                    <FeatureTip
                                        id="tasks-create"
                                        title="Create Tasks"
                                        description="Break down objectives into actionable tasks. Assign them to team members or AI agents, set deadlines, and track completion."
                                        align="right"
                                    >
                                        <CreateTaskDialog
                                            objectives={objectives}
                                            members={members}
                                            teams={teams}
                                            currentUserId={currentUserId}
                                        />
                                    </FeatureTip>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Task Analytics */}
                <TasksAnalytics tasks={tasks} />

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

                {viewMode === 'timeline' ? (
                    <GanttView
                        tasks={tabTasks.map(task => ({
                            ...task,
                            profiles: task.assignee ? {
                                id: task.assignee.id,
                                full_name: task.assignee.full_name || null,
                                role: task.assignee.role || null,
                                email: null,
                                foundry_id: null,
                                created_at: '',
                                updated_at: '',
                                executive_setup_completed: false
                            } as unknown as Database["public"]["Tables"]["profiles"]["Row"] : null,
                            objectives: task.objective_id ? (objectives.find(obj => obj.id === task.objective_id) || null) : null
                        })) as JoinedTask[]}
                        objectives={objectives as Database["public"]["Tables"]["objectives"]["Row"][]}
                        profiles={members.map(m => ({
                            id: m.id,
                            full_name: m.full_name || null,
                            role: m.role || null,
                            email: null,
                            foundry_id: null,
                            created_at: '',
                            updated_at: '',
                            executive_setup_completed: false
                        } as unknown as Database["public"]["Tables"]["profiles"]["Row"]))}
                        members={members}
                        currentUserId={currentUserId}
                    />
                ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {tabTasks.map((task) => (
                            <div key={task.id} className="h-full">
                                <TaskCard
                                    task={task}
                                    currentUserId={currentUserId}
                                    userRole={currentUserRole}
                                    members={members}
                                    expanded={expandedCardId === task.id}
                                    onToggle={() => toggleCardExpanded(task.id)}
                                    isSelectionMode={isSelectionMode}
                                    isSelected={selectedTaskIds.has(task.id)}
                                    onToggleSelection={() => toggleTaskSelection(task.id)}
                                    isHistoryView={activeTab === 'history'}
                                />
                            </div>
                        ))}
                        {tabTasks.length === 0 && (
                            <>
                                {tasks.length === 0 ? (
                                    <div className="col-span-full rounded-xl bg-muted/30 border border-muted p-12 flex flex-col items-center justify-center text-center relative overflow-hidden group min-h-[500px]">
                                        {/* Blueprint Background Pattern */}
                                        <div className="absolute inset-0 opacity-10 pointer-events-none bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
                                        <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,#fb551a08,transparent)] pointer-events-none"></div>

                                        <div className="relative z-10 w-64 h-64 mb-8 opacity-80 transition-all duration-500 ease-out group-hover:opacity-100 group-hover:scale-105">
                                            <Image
                                                src="/images/tasks-empty-state.png"
                                                alt="No tasks blueprint"
                                                fill
                                                className="object-contain drop-shadow-2xl"
                                                priority
                                            />
                                        </div>
                                        <h3 className="text-2xl font-display font-medium text-foreground mb-3 relative z-10 tracking-tight">System Idle</h3>
                                        <p className="text-muted-foreground max-w-sm mb-8 relative z-10 font-mono text-xs tracking-wide leading-relaxed">
                                            NO PROCESSING TASKS IN QUEUE.<br />
                                            INITIALIZE NEW DIRECTIVES TO BEGIN OPERATIONS.
                                        </p>
                                        <div className="relative z-10">
                                            {/* We can reproduce the button trigger here if needed, or guide user to the quick add */}
                                        </div>
                                    </div>
                                ) : activeTab === 'history' && historyCount === 0 ? (
                                    <div className="col-span-full">
                                        <EmptyState
                                            icon={<History className="h-10 w-10" />}
                                            title="No task history yet"
                                            description="Completed and rejected tasks will appear here as a record of what your team has accomplished."
                                            action={
                                                <Button
                                                    variant="link"
                                                    onClick={() => setActiveTab('active')}
                                                    className="text-international-orange"
                                                >
                                                    View Active Tasks
                                                </Button>
                                            }
                                            className="py-12 bg-muted/30 rounded-xl"
                                        />
                                    </div>
                                ) : (
                                    <div className="col-span-full">
                                        <EmptyState
                                            icon={<Inbox className="h-10 w-10" />}
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
                                                    className="text-international-orange"
                                                >
                                                    Reset Filters
                                                </Button>
                                            }
                                            className="py-12 bg-muted/30 rounded-xl"
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
                            const isExpanded = expandedObjectives.has(objective.id)
                            const completedCount = objectiveTasks.filter(t => t.status === 'Completed').length
                            const progressPercent = objectiveTasks.length > 0 ? Math.round((completedCount / objectiveTasks.length) * 100) : 0

                            return (
                                <div key={objective.id} className={cn(
                                "rounded-xl border shadow-sm overflow-hidden bg-background transition-all duration-200",
                                isSelectionMode && selectedObjectiveIds.has(objective.id) && "ring-2 ring-international-orange/50"
                            )}>
                                    <div 
                                        className="bg-muted/50 px-4 py-3 border-b flex justify-between items-center cursor-pointer hover:bg-muted transition-colors duration-150"
                                        onClick={() => toggleObjectiveExpanded(objective.id)}
                                    >
                                        <h3 className="font-semibold text-foreground flex items-center gap-3">
                                            {isSelectionMode && (
                                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                    {/* Objective selection checkbox */}
                                                    <Checkbox
                                                        checked={selectedObjectiveIds.has(objective.id)}
                                                        onCheckedChange={() => toggleObjectiveSelection(objective.id)}
                                                        className="border-international-orange data-[state=checked]:bg-international-orange data-[state=checked]:border-international-orange"
                                                        aria-label={`Select objective ${objective.title}`}
                                                    />
                                                    {/* Tasks selection checkbox */}
                                                    <Checkbox
                                                        checked={objectiveTasks.every(t => selectedTaskIds.has(t.id)) && objectiveTasks.length > 0}
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
                                                </div>
                                            )}
                                            {isExpanded ? (
                                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                            ) : (
                                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                            )}
                                            <div className={cn(
                                                "w-1 h-5 rounded-full",
                                                selectedObjectiveIds.has(objective.id) ? "bg-international-orange" : "bg-electric-blue"
                                            )} />
                                            {objective.title}
                                            <Badge variant="secondary" className="ml-2 bg-background text-muted-foreground font-normal">
                                                {objectiveTasks.length} Tasks
                                            </Badge>
                                        </h3>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm text-muted-foreground">
                                                {completedCount}/{objectiveTasks.length} completed
                                            </span>
                                            <Progress value={progressPercent} className="w-24 h-2" />
                                            <span className="text-sm font-medium text-muted-foreground w-10 text-right">
                                                {progressPercent}%
                                            </span>
                                        </div>
                                    </div>
                                    {isExpanded && (
                                        <div>
                                            {objectiveTasks.map(task => (
                                            <div
                                                key={task.id}
                                                className={cn(
                                                    "pl-5 pr-7 py-4 border-b last:border-0 hover:bg-muted/50 active:bg-muted flex items-center justify-between group gap-4 relative cursor-pointer transition-colors duration-150",
                                                    isSelectionMode && selectedTaskIds.has(task.id) && "bg-international-orange/5 hover:bg-international-orange/10"
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
                                                    "absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-electric-blue transition-colors duration-200",
                                                    isSelectionMode && selectedTaskIds.has(task.id) && "bg-electric-blue"
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
                                                    <Popover 
                                                        open={assigneePickerTaskId === task.id} 
                                                        onOpenChange={(open) => {
                                                            if (!open) setAssigneePickerTaskId(null)
                                                        }}
                                                    >
                                                        <PopoverTrigger asChild>
                                                            <button
                                                                className="flex items-center gap-1 text-muted-foreground w-36 hover:bg-muted rounded-md px-2 py-1 -mx-2 transition-colors"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    setAssigneePickerTaskId(task.id)
                                                                }}
                                                                disabled={isSelectionMode}
                                                            >
                                                                {(task.assignees && task.assignees.length > 0) ? (
                                                                    <>
                                                                        <UserAvatarStack
                                                                            users={task.assignees.map(a => ({
                                                                                id: a.id,
                                                                                name: a.full_name,
                                                                                role: a.role
                                                                            }))}
                                                                            size="xs"
                                                                            max={3}
                                                                        />
                                                                        {task.assignees.length === 1 && (
                                                                            <span className={cn("truncate ml-1", task.assignees[0].role === "AI_Agent" && "text-accent font-medium")}>
                                                                                {task.assignees[0].full_name}
                                                                            </span>
                                                                        )}
                                                                    </>
                                                                ) : task.assignee ? (
                                                                    <>
                                                                        <UserAvatar
                                                                            name={task.assignee.full_name}
                                                                            role={task.assignee.role}
                                                                            size="xs"
                                                                            className="border border-white"
                                                                        />
                                                                        <span className={cn("truncate", task.assignee.role === "AI_Agent" && "text-accent font-medium")}>{task.assignee.full_name}</span>
                                                                    </>
                                                                ) : (
                                                                    <span className="text-muted-foreground italic">Unassigned</span>
                                                                )}
                                                            </button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-[280px] p-0" align="start" onClick={(e) => e.stopPropagation()}>
                                                            <InlineAssigneePicker
                                                                task={task}
                                                                members={members}
                                                                onUpdate={(assigneeIds) => handleInlineAssigneeUpdate(task.id, assigneeIds)}
                                                                isUpdating={isUpdatingAssignees}
                                                            />
                                                        </PopoverContent>
                                                    </Popover>
                                                    <div className="text-muted-foreground w-24 text-right">
                                                        {task.end_date ? format(new Date(task.end_date), 'MMM d') : '-'}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })}

                        {orphanedTasks.length > 0 && (
                            <div className="rounded-xl border shadow-sm overflow-hidden bg-background">
                                <div 
                                    className="bg-muted/50 px-4 py-3 border-b cursor-pointer hover:bg-muted transition-colors duration-150"
                                    onClick={() => toggleObjectiveExpanded('orphaned')}
                                >
                                    <h3 className="font-semibold text-muted-foreground flex items-center gap-3">
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
                                                onClick={(e) => e.stopPropagation()}
                                                aria-label="Select all general tasks"
                                            />
                                        )}
                                        {expandedObjectives.has('orphaned') ? (
                                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                        )}
                                        <div className="w-1 h-5 bg-slate-400 rounded-full" />
                                        General Tasks (No Objective)
                                    </h3>
                                </div>
                                {expandedObjectives.has('orphaned') && (
                                    <div>
                                    {orphanedTasks.map(task => (
                                        <div
                                            key={task.id}
                                            className={cn(
                                                "px-5 py-4 border-b last:border-0 hover:bg-muted/50 active:bg-muted flex items-center justify-between group gap-4 cursor-pointer transition-colors duration-150",
                                                isSelectionMode && selectedTaskIds.has(task.id) && "bg-international-orange/5 hover:bg-international-orange/10"
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
                                                <Popover 
                                                    open={assigneePickerTaskId === task.id} 
                                                    onOpenChange={(open) => {
                                                        if (!open) setAssigneePickerTaskId(null)
                                                    }}
                                                >
                                                    <PopoverTrigger asChild>
                                                        <button
                                                            className="flex items-center gap-1 text-muted-foreground w-36 hover:bg-muted rounded-md px-2 py-1 -mx-2 transition-colors"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                setAssigneePickerTaskId(task.id)
                                                            }}
                                                            disabled={isSelectionMode}
                                                        >
                                                            {(task.assignees && task.assignees.length > 0) ? (
                                                                <>
                                                                    <UserAvatarStack
                                                                        users={task.assignees.map(a => ({
                                                                            id: a.id,
                                                                            name: a.full_name,
                                                                            role: a.role
                                                                        }))}
                                                                        size="xs"
                                                                        max={3}
                                                                    />
                                                                    {task.assignees.length === 1 && (
                                                                        <span className={cn("truncate ml-1", task.assignees[0].role === "AI_Agent" && "text-accent font-medium")}>
                                                                            {task.assignees[0].full_name}
                                                                        </span>
                                                                    )}
                                                                </>
                                                            ) : task.assignee ? (
                                                                <>
                                                                    <UserAvatar
                                                                        name={task.assignee.full_name}
                                                                        role={task.assignee.role}
                                                                        size="xs"
                                                                        className="border border-white"
                                                                    />
                                                                    <span className={cn("truncate", task.assignee.role === "AI_Agent" && "text-accent font-medium")}>{task.assignee.full_name}</span>
                                                                </>
                                                            ) : (
                                                                <span className="text-muted-foreground italic">Unassigned</span>
                                                            )}
                                                        </button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-[280px] p-0" align="start" onClick={(e) => e.stopPropagation()}>
                                                        <InlineAssigneePicker
                                                            task={task}
                                                            members={members}
                                                            onUpdate={(assigneeIds) => handleInlineAssigneeUpdate(task.id, assigneeIds)}
                                                            isUpdating={isUpdatingAssignees}
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                                <div className="text-muted-foreground w-24 text-right">
                                                    {task.end_date ? format(new Date(task.end_date), 'MMM d') : '-'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Bulk Action Toolbar */}
            {
                (selectedTaskIds.size > 0 || selectedObjectiveIds.size > 0) && (
                    <div className="fixed bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 bg-foreground text-background rounded-lg shadow-lg p-4 flex items-center gap-3 z-50">
                        <div className="text-sm font-medium flex items-center gap-2">
                            {selectedTaskIds.size > 0 && (
                                <span className="bg-electric-blue text-white px-2 py-0.5 rounded text-xs">
                                    {selectedTaskIds.size} task{selectedTaskIds.size > 1 ? 's' : ''}
                                </span>
                            )}
                            {selectedObjectiveIds.size > 0 && (
                                <span className="bg-international-orange text-white px-2 py-0.5 rounded text-xs">
                                    {selectedObjectiveIds.size} objective{selectedObjectiveIds.size > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                        {/* Task-only actions - hide when only objectives selected */}
                        {selectedTaskIds.size > 0 && (
                            <>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={handleBulkAccept}
                                    disabled={isBulkOperating}
                                    className="bg-background text-foreground hover:bg-muted"
                                >
                                    <Check className="w-4 h-4 mr-1" />
                                    Accept
                                </Button>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={handleBulkComplete}
                                    disabled={isBulkOperating}
                                    className="bg-background text-foreground hover:bg-muted"
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
                                            className="bg-background text-foreground hover:bg-muted"
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
                            </>
                        )}
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={handleBulkDeleteClick}
                            disabled={isBulkDeleting || isBulkOperating}
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
                                setSelectedObjectiveIds(new Set())
                            }}
                            disabled={isBulkOperating || isBulkDeleting}
                            className="text-background hover:bg-foreground/90"
                        >
                            Cancel
                        </Button>
                    </div>
                )
            }

            {/* Full Task View */}
            {selectedTask && (
                <FullTaskView
                    open={!!selectedTask}
                    onOpenChange={(open) => !open && setSelectedTask(null)}
                    task={selectedTask}
                    members={members}
                    currentUserId={currentUserId}
                />
            )}

            {/* Bulk Delete Confirmation Dialog */}
            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete {(() => {
                                const parts: string[] = []
                                if (selectedTaskIds.size > 0) parts.push(`${selectedTaskIds.size} task${selectedTaskIds.size > 1 ? 's' : ''}`)
                                if (selectedObjectiveIds.size > 0) parts.push(`${selectedObjectiveIds.size} objective${selectedObjectiveIds.size > 1 ? 's' : ''}`)
                                return parts.join(' and ')
                            })()}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone.
                            {selectedTaskIds.size > 0 && (
                                <span className="block mt-1">
                                    • {selectedTaskIds.size} task{selectedTaskIds.size > 1 ? 's' : ''} will be permanently deleted.
                                </span>
                            )}
                            {selectedObjectiveIds.size > 0 && (
                                <span className="block mt-1">
                                    • {selectedObjectiveIds.size} objective{selectedObjectiveIds.size > 1 ? 's' : ''} and all their associated tasks will be permanently deleted.
                                </span>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleBulkDeleteConfirm}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

/**
 * InlineAssigneePicker - Multi-select assignee picker for list view
 * 
 * @description Allows selecting multiple assignees for a task inline.
 * Uses checkboxes for multi-select with search functionality.
 */
function InlineAssigneePicker({ 
    task, 
    members, 
    onUpdate, 
    isUpdating 
}: { 
    task: Task
    members: Member[]
    onUpdate: (assigneeIds: string[]) => void
    isUpdating: boolean
}) {
    // Get current assignee IDs from task
    const currentAssigneeIds = useMemo(() => {
        if (task.assignees && task.assignees.length > 0) {
            return task.assignees.map(a => a.id)
        }
        if (task.assignee_id) {
            return [task.assignee_id]
        }
        return []
    }, [task.assignees, task.assignee_id])

    const [selectedIds, setSelectedIds] = useState<string[]>(currentAssigneeIds)
    const [searchQuery, setSearchQuery] = useState('')

    const filteredMembers = useMemo(() => {
        if (!searchQuery) return members
        const query = searchQuery.toLowerCase()
        return members.filter(m => 
            m.full_name?.toLowerCase().includes(query) ||
            m.email?.toLowerCase().includes(query)
        )
    }, [members, searchQuery])

    const toggleMember = (memberId: string) => {
        setSelectedIds(prev => 
            prev.includes(memberId)
                ? prev.filter(id => id !== memberId)
                : [...prev, memberId]
        )
    }

    const hasChanges = useMemo(() => {
        if (selectedIds.length !== currentAssigneeIds.length) return true
        return !selectedIds.every(id => currentAssigneeIds.includes(id))
    }, [selectedIds, currentAssigneeIds])

    return (
        <div className="flex flex-col">
            <div className="p-2 border-b">
                <input
                    type="text"
                    placeholder="Search members..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
            </div>
            <div className="max-h-[250px] overflow-y-auto p-2 space-y-1">
                {filteredMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No members found</p>
                ) : (
                    filteredMembers.map((member) => (
                        <div
                            key={member.id}
                            className={cn(
                                "flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-muted transition-colors",
                                selectedIds.includes(member.id) && "bg-muted"
                            )}
                            onClick={() => toggleMember(member.id)}
                        >
                            <Checkbox
                                checked={selectedIds.includes(member.id)}
                                onCheckedChange={() => toggleMember(member.id)}
                                aria-label={`Select ${member.full_name}`}
                            />
                            <UserAvatar
                                name={member.full_name}
                                role={member.role}
                                size="xs"
                            />
                            <div className="flex-1 min-w-0">
                                <span className={cn(
                                    "text-sm truncate block",
                                    member.role === "AI_Agent" && "text-accent font-medium"
                                )}>
                                    {member.full_name}
                                </span>
                                {member.role && (
                                    <span className="text-xs text-muted-foreground">{member.role}</span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
            <div className="p-2 border-t flex justify-between items-center">
                <span className="text-xs text-muted-foreground">
                    {selectedIds.length} selected
                </span>
                <Button
                    size="sm"
                    onClick={() => onUpdate(selectedIds)}
                    disabled={!hasChanges || isUpdating}
                >
                    {isUpdating ? (
                        <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        'Save'
                    )}
                </Button>
            </div>
        </div>
    )
}

function StatusBadge({ status }: { status: string | null }) {
    return (
        <span className={cn('px-2 py-1 rounded-full text-xs font-medium', getStatusBadgeClass(status))}>
            {(status || 'Pending').replace(/_/g, ' ')}
        </span>
    )
}
