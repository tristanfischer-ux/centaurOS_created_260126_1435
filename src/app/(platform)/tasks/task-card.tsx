"use client"

import { useState, memo, useEffect } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { UserAvatar, UserAvatarStack, getRoleColors } from "@/components/ui/user-avatar"
import { Markdown } from "@/components/ui/markdown"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Check, Bot, ChevronDown, ChevronUp, Eye, EyeOff, Paperclip, Plus, CheckCircle2, Clock, MessageSquare, Trash2, Lock } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
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
import { cn } from "@/lib/utils"
import { Database } from "@/types/database.types"
import { InlineThread } from "@/components/tasks/inline-thread"
import { InlineHistory } from "@/components/tasks/inline-history"
import { EditTaskDialog } from "@/components/tasks/edit-task-dialog"
import { FullTaskView } from "@/components/tasks/full-task-view"
import { TaskActionButtons } from "@/components/tasks/task-action-buttons"
import { Checkbox } from "@/components/ui/checkbox"
import { getStatusColor } from "@/lib/status-colors"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useTaskCardState } from "@/hooks/useTaskCardState"
import { useTaskActions } from "@/hooks/useTaskActions"
import { deleteTasks } from "@/actions/tasks"
import { toast } from "sonner"

type Task = Database["public"]["Tables"]["tasks"]["Row"] & {
    assignee?: { id: string, full_name: string | null, role: string, email: string, avatar_url?: string | null } | null
    assignees?: { id: string, full_name: string | null, role: string, email: string, avatar_url?: string | null }[]
    task_number?: number
    task_files?: { id: string }[]
    objective?: { id: string, title: string } | null
    message_count?: number
}

type Member = {
    id: string
    full_name: string
    role: string
    email: string
}

interface TaskCardProps {
    task: Task
    currentUserId: string
    userRole?: string
    members: Member[]
    expanded: boolean
    onToggle: () => void
    isSelectionMode?: boolean
    isSelected?: boolean
    onToggleSelection?: () => void
    /** When true, shows completion/rejection date prominently (for history view) */
    isHistoryView?: boolean
}

export const TaskCard = memo(function TaskCard(props: TaskCardProps) {
    const { task, currentUserId, userRole, members, isHistoryView } = props
    const isAssignee = task.assignees?.some(a => a.id === currentUserId) || task.assignee_id === currentUserId
    const isCreator = currentUserId === task.creator_id
    const isAITask = task.assignees?.some(a => a.role === 'AI_Agent') || task.assignee?.role === 'AI_Agent'
    const isOverdue = task.end_date ? new Date(task.end_date) < new Date() : false
    const isExecutive = userRole === 'Executive' || userRole === 'Founder'

    // Check if task is due soon (within 24 hours)
    const isDueSoon = task.end_date && !isOverdue && task.status !== 'Completed' ? (() => {
        const endDate = new Date(task.end_date)
        const now = new Date()
        const hoursUntilDue = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60)
        return hoursUntilDue <= 24 && hoursUntilDue > 0
    })() : false

    // Externally controlled expansion state
    const {
        expanded,
        onToggle,
        isSelectionMode,
        isSelected,
        onToggleSelection
    } = props

    // Use custom hook for state management
    const {
        isLoading,
        setIsLoading,
        aiRunning,
        setAiRunning,
        forwardOpen,
        setForwardOpen,
        showThread,
        setShowThread,
        editOpen,
        setEditOpen,
        showHistory,
        setShowHistory,
        fullViewOpen,
        setFullViewOpen,
        assigneePopoverOpen,
        setAssigneePopoverOpen,
        assigneePopoverOpen2,
        setAssigneePopoverOpen2,
        forwardAttachments,
        forwardAttachmentsLoading,
        forwardUploading,
        forwardFileInputRef,
        handleForwardFileUpload,
        handleRemoveAttachment,
    } = useTaskCardState({ taskId: task.id, expanded })


    // Normalize assignees list (handle backward compatibility or fallback)
    const initialAssignees = task.assignees && task.assignees.length > 0
        ? task.assignees
        : (task.assignee ? [task.assignee] : [])
    
    // Local state for optimistic updates
    const [optimisticAssignees, setOptimisticAssignees] = useState(initialAssignees)
    
    // Sync with props when task changes
    useEffect(() => {
        const newAssignees = task.assignees && task.assignees.length > 0
            ? task.assignees
            : (task.assignee ? [task.assignee] : [])
        setOptimisticAssignees(newAssignees)
    }, [task.assignees, task.assignee])
    
    const currentAssignees = optimisticAssignees

    // Use custom hook for action handlers
    const {
        handleForward,
        handleComplete,
        handleDuplicate,
        handleRunAI,
        handleDateUpdate,
        handleAssigneeToggle,
    } = useTaskActions({
        taskId: task.id,
        taskStartDate: task.start_date,
        taskEndDate: task.end_date,
        currentAssignees,
        members,
        setIsLoading,
        setAiRunning,
        setForwardOpen,
        setOptimisticAssignees,
    })

    // Delete task state and handler
    const [isDeleting, setIsDeleting] = useState(false)
    
    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            const result = await deleteTasks([task.id])
            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success('Task deleted')
            }
        } catch (error) {
            toast.error('Failed to delete task')
        } finally {
            setIsDeleting(false)
        }
    }

    // Helper Functions
    const formatFullDate = (dateStr: string | null) => {
        if (!dateStr) return "Not set"
        return format(new Date(dateStr), "MMM d, yyyy")
    }


    const getRiskBadge = (level: string | null) => {
        const riskInfo = {
            High: {
                badge: <Badge variant="destructive" className="gap-1 shadow-sm font-mono tracking-tighter cursor-help">HIGH RISK</Badge>,
                tooltip: "Financial or legal impact. Handle with extra care."
            },
            Medium: {
                badge: <Badge variant="warning" className="gap-1 shadow-sm font-mono tracking-tighter cursor-help">MEDIUM RISK</Badge>,
                tooltip: "Important but manageable impact."
            },
            Low: {
                badge: <Badge variant="secondary" className="gap-1 text-muted-foreground bg-muted border font-mono tracking-tighter cursor-help">LOW RISK</Badge>,
                tooltip: "Routine task with minimal risk."
            }
        }
        
        const info = riskInfo[level as keyof typeof riskInfo]
        if (!info) return null
        
        return (
            <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                    {info.badge}
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs">
                    <p>{info.tooltip}</p>
                </TooltipContent>
            </Tooltip>
        )
    }

    const sortedMembers = [...members].sort((a, b) => a.full_name.localeCompare(b.full_name))

    const handleCardClick = (e: React.MouseEvent) => {
        if (isSelectionMode && onToggleSelection) {
            e.stopPropagation()
            e.preventDefault()
            onToggleSelection()
        } else {
            onToggle()
        }
    }

    return (
        <Card
            className={cn(
                "bg-background flex flex-col h-full group/card relative border shadow-sm cursor-pointer",
                "transition-all duration-200 ease-out",
                "hover:border-muted-foreground/20 hover:shadow-lg",
                isSelected && isSelectionMode 
                    ? "ring-2 ring-international-orange/50 bg-international-orange/5 border-international-orange/30" 
                    : ""
            )}
            onClick={isSelectionMode ? handleCardClick : undefined}
        >
            {isSelectionMode && (
                <div
                    className="absolute top-4 left-4 z-50 pointer-events-auto"
                    onClick={(e) => {
                        e.stopPropagation()
                        if (onToggleSelection) onToggleSelection()
                    }}
                >
                    <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => {
                            if (onToggleSelection) onToggleSelection()
                        }}
                        aria-label={`Select task ${task.title}`}
                    />
                </div>
            )}
            <CardHeader className="p-4 pb-2 space-y-3 cursor-pointer" onClick={!isSelectionMode ? handleCardClick : undefined}>
                <div className="flex justify-between items-start gap-2">
                    <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-muted-foreground">
                                #{task.task_number ?? '...'}
                            </span>
                            <Badge className={`${getStatusColor(task.status).bar} text-white hover:${getStatusColor(task.status).bar} border-0`}>
                                {(task.status || 'Pending').replace(/_/g, ' ')}
                            </Badge>
                            {getRiskBadge(task.risk_level)}
                            {isOverdue && task.status !== 'Completed' && (
                                <Badge variant="destructive" className="ml-2">
                                    ⚠️ Overdue
                                </Badge>
                            )}
                            {isDueSoon && !isOverdue && (
                                <Badge variant="warning" className="ml-2">
                                    ⏰ Due Soon
                                </Badge>
                            )}
                            {/* Completion date for history view */}
                            {isHistoryView && task.updated_at && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
                                    <Clock className="w-3 h-3" />
                                    {task.status === 'Completed' ? 'Completed' : 'Closed'} {format(new Date(task.updated_at), "MMM d, yyyy")}
                                </span>
                            )}
                        </div>
                        {task.objective && (
                            <div className="text-[10px] font-semibold text-electric-blue uppercase tracking-wide truncate max-w-[200px] mb-1" title={task.objective.title}>
                                {task.objective.title}
                            </div>
                        )}
                        <h3 className="font-display font-semibold text-lg text-foreground leading-tight group-hover/card:text-electric-blue transition-colors duration-200 tracking-tight flex items-center gap-2">
                            {task.is_private && (
                                <span title="Private task"><Lock className="h-4 w-4 text-status-warning shrink-0" /></span>
                            )}
                            {task.title}
                            {task.is_demo && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground bg-muted rounded px-1.5 py-0 shrink-0 font-medium">
                                Demo
                              </span>
                            )}
                        </h3>

                        {/* Summary Metadata */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                            {task.start_date && (
                                <span className="flex items-center gap-1" title="Start Date">
                                    <CalendarIcon className="w-3 h-3" />
                                    Start: {format(new Date(task.start_date), "MMM d")}
                                </span>
                            )}
                            <button 
                                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" 
                                title="View attachments"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setShowThread(true)
                                    setShowHistory(false)
                                }}
                            >
                                <Paperclip className="w-3 h-3" />
                                {task.task_files?.length || 0}
                            </button>
                            {task.message_count !== undefined && task.message_count > 0 && (
                                <button 
                                    className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" 
                                    title="View messages"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setShowThread(true)
                                        setShowHistory(false)
                                    }}
                                >
                                    <MessageSquare className="w-3 h-3" />
                                    {task.message_count}
                                </button>
                            )}
                        </div>
                    </div>


                    <div className="flex items-center gap-2">
                        {/* Visibility Indicator */}
                        <div title={task.client_visible ? "Visible to Client" : "Hidden from Client"}>
                            {task.client_visible ? (
                                <Eye className="w-4 h-4 text-status-success" />
                            ) : (
                                <EyeOff className="w-4 h-4 text-muted-foreground" />
                            )}
                        </div>

                        {/* Assignee Avatar & Picker */}
                        <div className="relative">
                            <Popover open={assigneePopoverOpen} onOpenChange={setAssigneePopoverOpen}>
                                <PopoverTrigger asChild>
                                    <div
                                        className="cursor-pointer hover:opacity-80 active:opacity-70 transition-opacity touch-manipulation"
                                        title={currentAssignees.map(a => a.full_name).join(', ') || "Click to assign"}
                                        onClick={(e) => e.stopPropagation()}
                                        aria-expanded={assigneePopoverOpen}
                                        aria-haspopup="dialog"
                                        aria-label="Select assignee"
                                    >
                                        <div className="flex -space-x-2">
                                            {currentAssignees.length === 1 ? (
                                                // Single assignee - show with role-colored border (matches Team page)
                                                <UserAvatar 
                                                    name={currentAssignees[0].full_name}
                                                    role={currentAssignees[0].role}
                                                    size="md"
                                                    className={getRoleColors(currentAssignees[0].role).bg}
                                                />
                                            ) : currentAssignees.length > 1 ? (
                                                // Multiple assignees - use stack with overlap
                                                <UserAvatarStack
                                                    users={currentAssignees.map(a => ({
                                                        id: a.id,
                                                        name: a.full_name,
                                                        role: a.role,
                                                    }))}
                                                    size="md"
                                                    max={4}
                                                />
                                            ) : (
                                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                                                    <Plus className="w-4 h-4" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </PopoverTrigger>
                                <PopoverContent className="z-[200] w-[calc(100vw-2rem)] max-w-[240px] sm:w-[240px] overflow-y-auto max-h-[60vh] p-0 bg-background border shadow-lg" align="end" sideOffset={8} collisionPadding={16} onClick={(e) => e.stopPropagation()} onOpenAutoFocus={(e) => e.preventDefault()}>
                                    <Command>
                                        <CommandInput placeholder="Assign to member..." />
                                        <CommandList>
                                            <CommandEmpty>No members found.</CommandEmpty>
                                            <CommandGroup>
                                                {sortedMembers.map((member) => {
                                                    const isSelected = currentAssignees.some(a => a.id === member.id)
                                                    return (
                                                        <CommandItem
                                                            key={member.id}
                                                            value={member.full_name || ''}
                                                            onSelect={(e) => {
                                                                handleAssigneeToggle(member.id)
                                                                // Keep popover open for multi-select
                                                            }}
                                                            className="cursor-pointer"
                                                        >
                                                            <div className="flex items-center gap-2 w-full">
                                                                <div className={cn(
                                                                    "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                                                                    isSelected ? "bg-electric-blue border-electric-blue" : "border-muted"
                                                                )}>
                                                                    {isSelected && <Check className="h-3 w-3 text-white" />}
                                                                </div>
                                                                <UserAvatar 
                                                                    name={member.full_name} 
                                                                    role={member.role} 
                                                                    size="sm" 
                                                                    className="shadow-sm"
                                                                />
                                                                <span className="truncate flex-1">{member.full_name}</span>
                                                            </div>
                                                        </CommandItem>
                                                    )
                                                })}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                    <div className="border-t p-2">
                                        <Button 
                                            size="sm" 
                                            variant="ghost" 
                                            className="w-full text-xs"
                                            onClick={() => setAssigneePopoverOpen(false)}
                                        >
                                            Done
                                        </Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                    <Popover open={assigneePopoverOpen2} onOpenChange={setAssigneePopoverOpen2}>
                        <PopoverTrigger asChild>
                            <div className="flex items-center gap-1 cursor-pointer hover:text-electric-blue active:text-electric-blue transition-colors duration-200 group/assignee touch-manipulation" onClick={(e) => e.stopPropagation()}>
                                {currentAssignees.some(a => a.role === 'AI_Agent') ? <Bot className="w-3 h-3" /> : <div className="w-3" />}
                                <span className="truncate max-w-[120px] border-b border-transparent group-hover/assignee:border">
                                    {currentAssignees.length > 0 
                                        ? currentAssignees.length === 1 
                                            ? currentAssignees[0].full_name 
                                            : `${currentAssignees.length} assignees`
                                        : "Unassigned"}
                                </span>
                            </div>
                        </PopoverTrigger>
                        <PopoverContent className="z-[200] w-[calc(100vw-2rem)] max-w-[240px] sm:w-[240px] overflow-y-auto max-h-[60vh] p-0 bg-background border shadow-lg" align="start" sideOffset={8} collisionPadding={16} onClick={(e) => e.stopPropagation()} onOpenAutoFocus={(e) => e.preventDefault()}>
                            <Command>
                                <CommandInput placeholder="Assign to member..." />
                                <CommandList>
                                    <CommandEmpty>No members found.</CommandEmpty>
                                    <CommandGroup>
                                        {sortedMembers.map((member) => {
                                            const isSelected = currentAssignees.some(a => a.id === member.id)
                                            return (
                                                <CommandItem
                                                    key={member.id}
                                                    value={member.full_name || ''}
                                                    onSelect={() => {
                                                        handleAssigneeToggle(member.id)
                                                        // Keep popover open for multi-select
                                                    }}
                                                    className="cursor-pointer"
                                                >
                                                    <div className="flex items-center gap-2 w-full">
                                                        <div className={cn(
                                                            "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                                                            isSelected ? "bg-electric-blue border-electric-blue" : "border-muted"
                                                        )}>
                                                            {isSelected && <Check className="h-3 w-3 text-white" />}
                                                        </div>
                                                        <UserAvatar 
                                                            name={member.full_name} 
                                                            role={member.role} 
                                                            size="sm" 
                                                            className="shadow-sm"
                                                        />
                                                        <span className="truncate flex-1">{member.full_name}</span>
                                                    </div>
                                                </CommandItem>
                                            )
                                        })}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                            <div className="border-t p-2">
                                <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    className="w-full text-xs"
                                    onClick={() => setAssigneePopoverOpen2(false)}
                                >
                                    Done
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>

                    <div className="flex items-center gap-1">
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                </div>

                {!expanded && (
                    <div className="space-y-2 pb-2">
                        {task.description && (
                            <div className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                <Markdown content={task.description} className="text-xs" />
                            </div>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                                <CalendarIcon className="w-3 h-3" />
                                <span>Due: {task.end_date ? format(new Date(task.end_date), "MMM d") : "-"}</span>
                            </div>
                            
                            {/* Quick Actions - always visible */}
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                {isAssignee && task.status === 'Accepted' && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={handleComplete}
                                        disabled={isLoading}
                                        className="h-7 px-2 text-status-success hover:bg-status-success-light"
                                        title="Mark this task as completed"
                                    >
                                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                        Mark Complete
                                    </Button>
                                )}
                                {(isCreator || isExecutive) && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={handleDelete}
                                        disabled={isLoading || isDeleting}
                                        className="h-7 px-2 text-destructive hover:bg-status-error-light"
                                        title="Delete this task"
                                    >
                                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                                        Delete
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </CardHeader>

            {expanded && (
                <>
                    <CardContent className="bg-muted/30 pt-4 pb-4 flex-1">
                        <div className="space-y-4">
                            {/* Full Description */}
                            <div className="space-y-1">
                                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Description</h4>
                                {task.description ? (
                                    <div className="text-foreground text-sm leading-relaxed">
                                        <Markdown content={task.description} className="text-sm" />
                                    </div>
                                ) : (
                                    <p className="text-foreground text-sm leading-relaxed">No specific details provided.</p>
                                )}
                            </div>

                            {/* Detailed Dates - Now Interactive */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                {/* Start Date Picker */}
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <div className={cn(
                                            "bg-background p-2.5 rounded-lg border cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors duration-150 group",
                                            !isAssignee && !isCreator && !isExecutive && "pointer-events-none" // Allow edits for assignee, creator, or executive
                                        )}>
                                            <span className="text-[10px] text-muted-foreground block mb-1 group-hover:text-international-orange transition-colors duration-150">Start Date</span>
                                            <div className="flex items-center gap-2">
                                                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-international-orange transition-colors duration-150" />
                                                <span className="text-sm font-medium text-foreground">
                                                    {formatFullDate(task.start_date)}
                                                </span>
                                            </div>
                                        </div>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={task.start_date ? new Date(task.start_date) : undefined}
                                            onSelect={(date) => handleDateUpdate('start', date)}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>

                                {/* Deadline Picker */}
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <div className={cn(
                                            "bg-background p-2.5 rounded-lg border cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors duration-150 group",
                                            !isAssignee && !isCreator && !isExecutive && "pointer-events-none" // Allow edits for assignee, creator, or executive
                                        )}>
                                            <span className="text-[10px] text-muted-foreground block mb-1 group-hover:text-international-orange transition-colors duration-150">Deadline</span>
                                            <div className="flex items-center gap-2">
                                                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-international-orange transition-colors duration-150" />
                                                <span className={cn(
                                                    "text-sm font-medium",
                                                    isOverdue ? "text-destructive" : "text-foreground"
                                                )}>
                                                    {formatFullDate(task.end_date)}
                                                </span>
                                            </div>
                                        </div>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={task.end_date ? new Date(task.end_date) : undefined}
                                            onSelect={(date) => handleDateUpdate('end', date)}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>

                        {task.status === 'Amended_Pending_Approval' && (
                            <div className="mt-4 bg-status-warning-light border border-status-warning p-3 rounded-md text-sm text-status-warning-dark">
                                <strong>Amendment Proposed:</strong>
                                <p className="mt-1 opacity-90">{task.amendment_notes}</p>
                            </div>
                        )}
                    </CardContent>

                    <Separator className="bg-muted" />

                    <TaskActionButtons
                        task={{
                            id: task.id,
                            status: task.status ?? '',
                            client_visible: task.client_visible ?? false,
                            last_nudge_at: task.last_nudge_at,
                        }}
                        isAssignee={isAssignee}
                        isCreator={isCreator}
                        isExecutive={isExecutive}
                        isAITask={isAITask}
                        userRole={userRole}
                        isLoading={isLoading}
                        aiRunning={aiRunning}
                        editOpen={editOpen}
                        setEditOpen={setEditOpen}
                        forwardOpen={forwardOpen}
                        setForwardOpen={setForwardOpen}
                        showHistory={showHistory}
                        setShowHistory={setShowHistory}
                        showThread={showThread}
                        setShowThread={setShowThread}
                        fullViewOpen={fullViewOpen}
                        setFullViewOpen={setFullViewOpen}
                        handleComplete={handleComplete}
                        handleDuplicate={handleDuplicate}
                        handleRunAI={handleRunAI}
                        handleForward={handleForward}
                        handleDelete={handleDelete}
                        isDeleting={isDeleting}
                        sortedMembers={sortedMembers}
                        forwardAttachments={forwardAttachments}
                        forwardAttachmentsLoading={forwardAttachmentsLoading}
                        forwardUploading={forwardUploading}
                        forwardFileInputRef={forwardFileInputRef}
                        handleForwardFileUpload={handleForwardFileUpload}
                        handleRemoveAttachment={handleRemoveAttachment}
                    />

                    {/* Inline panels */}
                    <InlineHistory
                        taskId={task.id}
                        isOpen={showHistory}
                        onClose={() => setShowHistory(false)}
                    />
                    <InlineThread
                        taskId={task.id}
                        isOpen={showThread}
                        onClose={() => setShowThread(false)}
                        members={members}
                    />

                    <EditTaskDialog
                        open={editOpen}
                        onOpenChange={setEditOpen}
                        task={task}
                        members={members}
                    />
                    <FullTaskView
                        open={fullViewOpen}
                        onOpenChange={setFullViewOpen}
                        task={task}
                        members={members}
                        currentUserId={currentUserId}
                    />
                </>
            )}
        </Card>
    )
})
