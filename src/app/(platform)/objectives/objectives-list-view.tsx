"use client"

import { useState } from "react"
import { useAutoRefresh } from "@/hooks/useAutoRefresh"
import { RefreshButton } from "@/components/RefreshButton"
import { ChevronDown, ChevronRight, Target, CheckCircle2, Clock, AlertCircle, ArrowRight, Trash, MessageSquare, Paperclip, Loader2, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Markdown } from "@/components/ui/markdown"
import Link from "next/link"
import { deleteObjective } from "@/actions/objectives"
import { toast } from "sonner"
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
import { CreateTaskDialog } from "@/app/(platform)/tasks/create-task-dialog"
import { getStatusBadgeClass } from "@/lib/status-colors"



interface Task {
    id: string
    title: string
    status: string | null
    assignee_id: string | null
    end_date: string | null
    notesCount?: number
    attachmentCount?: number
    assignee?: {
        full_name: string | null
        role: string | null
    } | null
}

interface Objective {
    id: string
    title: string
    description: string | null
    created_at: string | null
    tasks: Task[]
}

interface ObjectivesListViewProps {
    objectives: Objective[]
    objectivesForDialog: { id: string; title: string }[]
    members: { id: string; full_name: string; role: string }[]
    teams?: { id: string; name: string }[]
    currentUserId: string
}

function getStatusConfig(status: string | null) {
    // Map status to icon (keeping existing icon logic)
    let icon = Clock
    if (status === 'Completed') icon = CheckCircle2
    if (status === 'In_Progress' || status === 'Accepted') icon = ArrowRight
    if (status === 'Rejected') icon = AlertCircle
    
    return { 
        color: getStatusBadgeClass(status), 
        icon 
    }
}

export function ObjectivesListView({ objectives, objectivesForDialog, members, teams = [], currentUserId }: ObjectivesListViewProps) {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [objectiveToDelete, setObjectiveToDelete] = useState<string | null>(null)
    const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false)
    const [isDeletingSingle, setIsDeletingSingle] = useState(false)
    const [isDeletingBulk, setIsDeletingBulk] = useState(false)

    // Auto-refresh using Supabase Realtime
    useAutoRefresh({ tables: ['objectives', 'tasks'] })

    // Handle single deletion
    const handleDeleteSingle = async () => {
        if (!objectiveToDelete) return

        setIsDeletingSingle(true)
        try {
            const result = await deleteObjective(objectiveToDelete)

            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success("Objective deleted")
                setObjectiveToDelete(null)
                // Remove from selection if it was there
                const newSelected = new Set(selectedIds)
                newSelected.delete(objectiveToDelete)
                setSelectedIds(newSelected)
            }
        } finally {
            setIsDeletingSingle(false)
        }
    }

    // Handle bulk deletion
    const handleDeleteBulk = async () => {
        if (selectedIds.size === 0) return

        setIsDeletingBulk(true)
        try {
            const idsToDelete = Array.from(selectedIds)
            // Dynamically import to avoid circular dependencies if they exist, or just use the imported action
            const { deleteObjectives } = await import("@/actions/objectives")
            const result = await deleteObjectives(idsToDelete)

            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success(`${idsToDelete.length} objectives deleted`)
                setSelectedIds(new Set())
                setShowBulkDeleteDialog(false)
            }
        } finally {
            setIsDeletingBulk(false)
        }
    }

    const toggleExpand = (id: string) => {
        const newSet = new Set(expandedIds)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else {
            newSet.add(id)
        }
        setExpandedIds(newSet)
    }

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else {
            newSet.add(id)
        }
        setSelectedIds(newSet)
    }

    const toggleSelectAll = () => {
        if (selectedIds.size === objectives.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(objectives.map(o => o.id)))
        }
    }

    const expandAll = () => {
        setExpandedIds(new Set(objectives.map(o => o.id)))
    }

    const collapseAll = () => {
        setExpandedIds(new Set())
    }

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex items-center justify-between">
                <div className="flex gap-2">
                    <RefreshButton />
                    <Button variant="secondary" size="sm" onClick={expandAll}>
                        Expand All
                    </Button>
                    <Button variant="secondary" size="sm" onClick={collapseAll}>
                        Collapse All
                    </Button>
                </div>

                {selectedIds.size > 0 && (
                    <div className="flex gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setShowBulkDeleteDialog(true)}
                        >
                            Delete Selected ({selectedIds.size})
                        </Button>
                    </div>
                )}
            </div>

            {/* Hoisted Delete Dialog (Single) */}
            <AlertDialog open={!!objectiveToDelete} onOpenChange={(open) => !open && setObjectiveToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Objective?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this objective and all associated tasks.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeletingSingle}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive hover:bg-destructive/90 focus:ring-destructive"
                            onClick={handleDeleteSingle}
                            disabled={isDeletingSingle}
                        >
                            {isDeletingSingle ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                "Delete"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Hoisted Delete Dialog (Bulk) */}
            <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {selectedIds.size} Objectives?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the selected objectives and ALL their associated tasks.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeletingBulk}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive hover:bg-destructive/90 focus:ring-destructive"
                            onClick={handleDeleteBulk}
                            disabled={isDeletingBulk}
                        >
                            {isDeletingBulk ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                `Delete ${selectedIds.size} Items`
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Objectives List */}
            <div className="space-y-4">
                {/* Select All Header (Optional, but good for bulk actions) */}
                {objectives.length > 0 && (
                    <div className="flex items-center px-4 py-2 bg-muted/50 rounded-md">
                        <div className="flex items-center h-5 w-5 mr-4">
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded bg-muted text-foreground focus:ring-ring cursor-pointer"
                                checked={selectedIds.size === objectives.length && objectives.length > 0}
                                onChange={toggleSelectAll}
                                aria-label="Select all objectives"
                            />
                        </div>
                        <span className="text-sm font-medium text-muted-foreground">Select All</span>
                    </div>
                )}

                {objectives.map(objective => {
                    const isExpanded = expandedIds.has(objective.id)
                    const isSelected = selectedIds.has(objective.id)
                    const taskCount = objective.tasks.length
                    const completedCount = objective.tasks.filter(t => t.status === 'Completed').length
                    const progress = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0
                    
                    // Calculate attention indicators
                    const hasOverdueTasks = objective.tasks.some(t => 
                        t.end_date && new Date(t.end_date) < new Date() && t.status !== 'Completed'
                    )
                    
                    // Check if stalled (no progress in 7 days)
                    const now = new Date()
                    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                    const isStalled = objective.created_at && new Date(objective.created_at) < sevenDaysAgo && 
                        progress === 0 && taskCount > 0

                    return (
                        <div
                            key={objective.id}
                            className={`bg-card rounded-lg shadow-md overflow-hidden transition-all duration-200 ${
                                isSelected ? 'ring-2 ring-ring' : ''
                            } ${
                                hasOverdueTasks ? 'ring-2 ring-orange-500' : isStalled ? 'ring-2 ring-yellow-500' : ''
                            }`}
                        >
                            {/* Objective Header */}
                            <div
                                className="flex items-center gap-4 p-5 cursor-pointer hover:bg-accent/50 active:bg-accent transition-colors"
                                onClick={() => toggleExpand(objective.id)}
                            >
                                {/* Checkbox */}
                                <div
                                    className="shrink-0 flex items-center justify-center p-1"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        toggleSelection(objective.id)
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded bg-muted text-foreground focus:ring-ring cursor-pointer"
                                        checked={isSelected}
                                        onChange={() => { }} // Handled by div click
                                        aria-label={`Select objective ${objective.title}`}
                                    />
                                </div>

                                <button
                                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                                    aria-label={isExpanded ? "Collapse objective" : "Expand objective"}
                                    aria-expanded={isExpanded}
                                >
                                    {isExpanded ? (
                                        <ChevronDown className="h-5 w-5" />
                                    ) : (
                                        <ChevronRight className="h-5 w-5" />
                                    )}
                                </button>

                                <div className="h-10 w-10 rounded-lg bg-status-warning-light flex items-center justify-center shrink-0">
                                    <Target className="h-5 w-5 text-status-warning" />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Link href={`/objectives/${objective.id}`} className="font-semibold text-foreground hover:text-status-warning transition-colors" onClick={(e) => e.stopPropagation()}>
                                            {objective.title}
                                        </Link>
                                        {hasOverdueTasks && (
                                            <Badge variant="destructive" className="ml-2">
                                                ⚠️ Overdue Tasks
                                            </Badge>
                                        )}
                                        {isStalled && !hasOverdueTasks && (
                                            <Badge variant="warning" className="ml-2">
                                                ⏸️ Stalled
                                            </Badge>
                                        )}
                                    </div>
                                    {objective.description && (
                                        <div className="text-sm text-muted-foreground truncate">
                                            <Markdown content={objective.description} className="text-sm text-muted-foreground" />
                                        </div>
                                    )}
                                </div>

                                {/* Task stats */}
                                <div className="flex items-center gap-4 shrink-0">
                                    <div className="text-right">
                                        <span className="text-sm font-medium text-foreground">{completedCount}/{taskCount}</span>
                                        <span className="text-xs text-muted-foreground ml-1">completed</span>
                                    </div>
                                    <Progress value={progress} className="w-24 h-2" />
                                    <Badge variant="secondary" className="text-xs">
                                        {progress}%
                                    </Badge>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-[0.98] transition-all"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setObjectiveToDelete(objective.id)
                                        }}
                                    >
                                        <Trash className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Tasks List (expanded) */}
                            {isExpanded && (
                                <div className="bg-muted/30">
                                    {taskCount === 0 ? (
                                        <div className="p-4 text-center text-sm text-muted-foreground">
                                            No tasks assigned to this objective yet.
                                        </div>
                                    ) : (
                                        <div className="space-y-px">
                                            {objective.tasks.map(task => {
                                                const statusConfig = getStatusConfig(task.status)
                                                const StatusIcon = statusConfig.icon

                                                return (
                                                    <div key={task.id} className="flex items-center gap-2 sm:gap-4 p-4 pl-9 sm:pl-16 hover:bg-card transition-colors">
                                                        <StatusIcon className={`h-4 w-4 shrink-0 ${statusConfig.color.split(' ')[1]}`} />

                                                        <Link href={`/tasks?task=${task.id}`} className="flex-1 min-w-0 text-sm text-foreground hover:text-status-warning truncate">
                                                            {task.title}
                                                        </Link>

                                                        <Badge className={`${statusConfig.color} border-0 text-xs shrink-0 hidden sm:inline-flex`}>
                                                            {task.status?.replace('_', ' ') || 'Pending'}
                                                        </Badge>

                                                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                                                            {task.assignee?.full_name && (
                                                                <span className="text-xs text-muted-foreground max-w-[80px] sm:max-w-[120px] truncate hidden sm:inline">
                                                                    {task.assignee.full_name}
                                                                </span>
                                                            )}

                                                            {/* Meta Icons */}
                                                            <div className="flex items-center gap-1 sm:gap-2">
                                                                {(task.notesCount || 0) > 0 && (
                                                                    <div className="flex items-center text-muted-foreground" title={`${task.notesCount} notes`}>
                                                                        <MessageSquare className="h-3.5 w-3.5 mr-1" />
                                                                        <span className="text-[10px]">{task.notesCount}</span>
                                                                    </div>
                                                                )}
                                                                {(task.attachmentCount || 0) > 0 && (
                                                                    <div className="flex items-center text-muted-foreground" title={`${task.attachmentCount} attachments`}>
                                                                        <Paperclip className="h-3.5 w-3.5 mr-1" />
                                                                        <span className="text-[10px]">{task.attachmentCount}</span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {task.end_date && (
                                                                <span className="text-xs text-muted-foreground hidden md:inline">
                                                                    Due {new Date(task.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                    {/* Add Task button */}
                                    <div className="mt-4 px-4 pb-4">
                                        <CreateTaskDialog 
                                            objectives={objectivesForDialog}
                                            members={members}
                                            teams={teams}
                                            currentUserId={currentUserId}
                                            defaultObjectiveId={objective.id}
                                        >
                                            <Button variant="secondary" size="sm" className="w-full">
                                                <Plus className="h-4 w-4 mr-2" />
                                                Add Task to this Objective
                                            </Button>
                                        </CreateTaskDialog>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}

                {objectives.length === 0 && (
                    <div className="py-12 text-center bg-muted/30 rounded-lg text-muted-foreground">
                        No objectives set. Define your mission.
                    </div>
                )}
            </div>
        </div>
    )
}
