"use client"

import { useState, memo, useEffect } from "react"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { UserAvatar, UserAvatarStack } from "@/components/ui/user-avatar"
import { Markdown } from "@/components/ui/markdown"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Check, X, ArrowRight, Bot, MessageSquare, ChevronDown, ChevronUp, Copy, Pencil, History as HistoryIcon, ShieldAlert, Eye, EyeOff, ShieldCheck, Paperclip, Plus, Upload, Loader2, Maximize2 } from "lucide-react"
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
import { acceptTask, rejectTask, forwardTask, completeTask, triggerAIWorker, updateTaskDates, duplicateTask, updateTaskAssignees } from "@/actions/tasks"
import { AttachmentList } from "@/components/tasks/attachment-list"
import { cn } from "@/lib/utils"
import { Database } from "@/types/database.types"
import { InlineThread } from "@/components/tasks/inline-thread"
import { InlineHistory } from "@/components/tasks/inline-history"
import { EditTaskDialog } from "@/components/tasks/edit-task-dialog"
import { FullTaskView } from "@/components/tasks/full-task-view"
import { toast } from "sonner"
import { RubberStampModal } from "@/components/smart-airlock/RubberStampModal"
import { ClientNudgeButton } from "@/components/smart-airlock/ClientNudgeButton"
import { Checkbox } from "@/components/ui/checkbox"
import { getStatusColor } from "@/lib/status-colors"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useTaskCardState } from "@/hooks/useTaskCardState"
import { useTaskActions } from "@/hooks/useTaskActions"

type Task = Database["public"]["Tables"]["tasks"]["Row"] & {
    assignee?: { id: string, full_name: string | null, role: string, email: string, avatar_url?: string | null } | null
    assignees?: { id: string, full_name: string | null, role: string, email: string, avatar_url?: string | null }[]
    task_number?: number
    task_files?: { id: string }[]
    objective?: { id: string, title: string } | null
}

type Member = {
    id: string
    full_name: string
    role: string
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
}

export const TaskCard = memo(function TaskCard(props: TaskCardProps) {
    const { task, currentUserId, userRole, members } = props
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
        rejectOpen,
        setRejectOpen,
        forwardOpen,
        setForwardOpen,
        showThread,
        setShowThread,
        editOpen,
        setEditOpen,
        showHistory,
        setShowHistory,
        rubberStampOpen,
        setRubberStampOpen,
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
        handleAccept,
        handleReject,
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
        setRejectOpen,
        setForwardOpen,
        setOptimisticAssignees,
    })

    // Helper Functions
    const formatFullDate = (dateStr: string | null) => {
        if (!dateStr) return "Not set"
        return format(new Date(dateStr), "MMM d, yyyy")
    }


    const getRiskBadge = (level: string | null) => {
        const riskInfo = {
            High: {
                badge: <Badge variant="destructive" className="gap-1 shadow-sm font-mono tracking-tighter cursor-help"><ShieldAlert className="w-3 h-3" /> HIGH RISK</Badge>,
                tooltip: "Financial or legal impact. Requires executive approval before release to client."
            },
            Medium: {
                badge: <Badge variant="warning" className="gap-1 shadow-sm font-mono tracking-tighter cursor-help"><ShieldCheck className="w-3 h-3" /> MEDIUM RISK</Badge>,
                tooltip: "Requires peer review before completion. Important but manageable impact."
            },
            Low: {
                badge: <Badge variant="secondary" className="gap-1 text-muted-foreground bg-muted border font-mono tracking-tighter cursor-help"><ShieldCheck className="w-3 h-3" /> LOW RISK</Badge>,
                tooltip: "Routine task. Can be completed without additional approvals."
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
                "bg-background transition-all duration-300 flex flex-col h-full group/card relative border",
                isSelectionMode ? "cursor-pointer" : "hover:border-muted hover:shadow-md hover:-translate-y-[2px] active:translate-y-0 active:shadow-sm",
                isSelected && isSelectionMode ? "ring-2 ring-electric-blue bg-electric-blue-light/10 border-electric-blue" : ""
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
                        </div>
                        {task.objective && (
                            <div className="text-[10px] font-semibold text-electric-blue uppercase tracking-wide truncate max-w-[200px] mb-1" title={task.objective.title}>
                                {task.objective.title}
                            </div>
                        )}
                        <h3 className="font-display font-semibold text-lg text-foreground leading-tight group-hover/card:text-electric-blue transition-colors duration-200 tracking-tight">
                            {task.title}
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
                                            {currentAssignees.length > 0 ? (
                                                <UserAvatarStack
                                                    users={currentAssignees.map(a => ({
                                                        id: a.id,
                                                        name: a.full_name,
                                                        role: a.role,
                                                        avatarUrl: a.avatar_url,
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
                                <PopoverContent className="z-[100] w-[calc(100vw-2rem)] max-w-[240px] sm:w-[240px] overflow-y-auto max-h-[60vh] p-0 bg-background border shadow-lg" align="end" sideOffset={8} collisionPadding={16} onClick={(e) => e.stopPropagation()} onOpenAutoFocus={(e) => e.preventDefault()}>
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
                        <PopoverContent className="z-[100] w-[calc(100vw-2rem)] max-w-[240px] sm:w-[240px] overflow-y-auto max-h-[60vh] p-0 bg-background border shadow-lg" align="start" sideOffset={8} collisionPadding={16} onClick={(e) => e.stopPropagation()} onOpenAutoFocus={(e) => e.preventDefault()}>
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
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                                <CalendarIcon className="w-3 h-3" />
                                <span>Due: {task.end_date ? format(new Date(task.end_date), "MMM d") : "-"}</span>
                            </div>
                        </div>
                    </div>
                )}
            </CardHeader>

            {expanded && (
                <>
                    <CardContent className="bg-muted/50 pt-4 pb-4 flex-1">
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
                            <div className="grid grid-cols-2 gap-4 pt-2">
                                {/* Start Date Picker */}
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <div className={cn(
                                            "bg-muted p-2.5 rounded shadow-sm cursor-pointer hover:bg-muted active:bg-muted transition-colors duration-200 group",
                                            !isAssignee && !isCreator && "pointer-events-none" // Only allow edits if assignee/creator
                                        )}>
                                            <span className="text-[10px] text-muted-foreground block mb-1 group-hover:text-status-warning transition-colors duration-200">Start Date</span>
                                            <div className="flex items-center gap-2">
                                                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-status-warning" />
                                                <span className="text-sm font-medium text-foreground group-hover:text-foreground">
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
                                            "bg-muted p-2.5 rounded shadow-sm cursor-pointer hover:bg-muted active:bg-muted transition-colors duration-200 group",
                                            !isAssignee && !isCreator && "pointer-events-none"
                                        )}>
                                            <span className="text-[10px] text-muted-foreground block mb-1 group-hover:text-status-warning transition-colors duration-200">Deadline</span>
                                            <div className="flex items-center gap-2">
                                                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-status-warning" />
                                                <span className={cn(
                                                    "text-sm font-medium transition-colors duration-200 group-hover:text-foreground",
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

                        {/* Executive Airlock Warning */}
                        {task.status === 'Pending_Executive_Approval' && (
                            <div className="mt-4 bg-status-info-light border border-status-info p-3 rounded-md text-sm text-status-info-dark flex items-start gap-2">
                                <ShieldAlert className="w-5 h-5 shrink-0" />
                                <div>
                                    <strong className="block uppercase text-xs tracking-wide mb-1">Airlock Active</strong>
                                    Task completed but held for Executive Certification.
                                </div>
                            </div>
                        )}
                    </CardContent>

                    <Separator className="bg-muted" />

                    <CardFooter className="bg-muted p-4 flex flex-col gap-4 mt-auto">
                        {/* Primary Workflow Actions - Only render section if actions are available */}
                        {(() => {
                            const showAcceptReject = task.status === 'Pending' && isAssignee
                            const showMarkComplete = task.status === 'Accepted' && (isAssignee || userRole === 'Executive' || isCreator)
                            const showCertify = task.status === 'Pending_Executive_Approval' && isExecutive
                            const hasPrimaryActions = showAcceptReject || showMarkComplete || showCertify

                            if (!hasPrimaryActions) return null

                            return (
                                <>
                                    <div className="flex gap-4 w-full">
                                        {showAcceptReject && (
                                            <>
                                                <Button
                                                    onClick={handleAccept}
                                                    variant="success"
                                                    disabled={isLoading}
                                                    className="flex-1 shadow-sm font-medium"
                                                >
                                                    <Check className="h-4 w-4" /> Accept
                                                </Button>

                                                <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                                                    <DialogTrigger asChild>
                                                        <Button
                                                            variant="secondary"
                                                            disabled={isLoading}
                                                            className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50 shadow-sm font-medium"
                                                        >
                                                            <X className="h-4 w-4" /> Reject
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent className="bg-background shadow-xl text-foreground">
                                                        <DialogHeader><DialogTitle>Reject Task</DialogTitle></DialogHeader>
                                                        <form action={handleReject} className="space-y-4">
                                                            <Textarea name="reason" placeholder="Reason for rejection..." required className="bg-muted" />
                                                            <Button type="submit" variant="destructive" className="w-full">Confirm Rejection</Button>
                                                        </form>
                                                    </DialogContent>
                                                </Dialog>
                                            </>
                                        )}

                                        {showMarkComplete && (
                                            <Button
                                                onClick={handleComplete}
                                                disabled={isLoading}
                                                className="w-full bg-foreground hover:bg-foreground/90 text-background shadow-sm font-medium"
                                            >
                                                <Check className="h-4 w-4" /> Mark Complete
                                            </Button>
                                        )}

                                        {showCertify && (
                                            <Button
                                                onClick={() => setRubberStampOpen(true)}
                                                variant="success"
                                                disabled={isLoading}
                                                className="w-full shadow-sm font-medium"
                                            >
                                                <ShieldCheck className="h-4 w-4" /> Certify Release
                                            </Button>
                                        )}
                                    </div>
                                    <Separator className="bg-muted/60" />
                                </>
                            )
                        })()}

                        {/* Secondary & Meta Actions - Always show consistent layout */}
                        <div className="flex items-center justify-between w-full gap-2 flex-wrap">
                            {/* Tools Area - Always visible for consistent layout */}
                            <div className="flex items-center gap-1 flex-wrap">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setEditOpen(true)}
                                            disabled={isLoading}
                                            className="text-muted-foreground hover:text-electric-blue hover:bg-electric-blue-light active:text-electric-blue active:bg-electric-blue-light/80 active:scale-[0.98] transition-all duration-200 px-2 shrink-0"
                                        >
                                            <Pencil className="h-4 w-4" /> <span className="hidden xs:inline">Edit</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Edit task details</TooltipContent>
                                </Tooltip>

                                <Dialog open={forwardOpen} onOpenChange={setForwardOpen}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <DialogTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={isLoading}
                                                    className="text-muted-foreground hover:text-status-warning hover:bg-status-warning-light active:text-status-warning-dark active:bg-status-warning-light/80 active:scale-[0.98] transition-all duration-200 px-2 shrink-0"
                                                >
                                                    <ArrowRight className="h-4 w-4" /> <span className="hidden xs:inline">Forward</span>
                                                </Button>
                                            </DialogTrigger>
                                        </TooltipTrigger>
                                        <TooltipContent>Forward or reassign task</TooltipContent>
                                    </Tooltip>
                                    <DialogContent className="bg-background shadow-xl text-foreground max-w-lg">
                                        <DialogHeader>
                                            <DialogTitle>Forward Task</DialogTitle>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                Reassign this task and provide context for the new assignee
                                            </p>
                                        </DialogHeader>
                                        <form action={handleForward} className="space-y-4">
                                            <div className="grid gap-2">
                                                <label className="text-sm font-medium text-foreground">New Assignee</label>
                                                <Select name="new_assignee_id" required>
                                                    <SelectTrigger className="bg-background">
                                                        <SelectValue placeholder="Select person..." />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-background shadow-lg z-50">
                                                        {sortedMembers.map(member => (
                                                            <SelectItem key={member.id} value={member.id}>
                                                                <div className="flex items-center gap-3">
                                                                    <UserAvatar 
                                                                        name={member.full_name} 
                                                                        role={member.role} 
                                                                        size="md" 
                                                                        showBorder
                                                                    />
                                                                    <span>
                                                                        {member.full_name}
                                                                        {member.role === 'AI_Agent' && ' 🤖'}
                                                                    </span>
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="grid gap-2">
                                                <label className="text-sm font-medium text-foreground">Handover Information</label>
                                                <p className="text-xs text-muted-foreground">
                                                    Provide context, instructions, or any important details for the new assignee
                                                </p>
                                                <Textarea 
                                                    name="reason" 
                                                    placeholder="e.g., 'Please review the attached documents and coordinate with the legal team. The deadline is urgent - client needs this by end of week.'"
                                                    required 
                                                    className="bg-muted min-h-[120px] resize-y" 
                                                />
                                            </div>
                                            
                                            {/* Attachments Section */}
                                            <div className="grid gap-2">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-sm font-medium text-foreground flex items-center gap-2">
                                                        <Paperclip className="h-4 w-4" />
                                                        Attachments
                                                    </label>
                                                    <div>
                                                        <input
                                                            type="file"
                                                            ref={forwardFileInputRef}
                                                            onChange={handleForwardFileUpload}
                                                            className="hidden"
                                                            accept="*/*"
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => forwardFileInputRef.current?.click()}
                                                            disabled={forwardUploading}
                                                            className="gap-2"
                                                        >
                                                            {forwardUploading ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <Upload className="h-4 w-4" />
                                                            )}
                                                            Add File
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="bg-muted rounded-lg p-3 max-h-[200px] overflow-y-auto">
                                                    {forwardAttachmentsLoading ? (
                                                        <div className="flex items-center justify-center py-4 text-muted-foreground">
                                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                            Loading attachments...
                                                        </div>
                                                    ) : (
                                                        <AttachmentList 
                                                            taskId={task.id} 
                                                            attachments={forwardAttachments}
                                                            canDelete={true}
                                                            onDelete={handleRemoveAttachment}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <div className="flex gap-2 pt-2">
                                                <Button type="button" variant="secondary" onClick={() => setForwardOpen(false)} className="flex-1">
                                                    Cancel
                                                </Button>
                                                <Button type="submit" variant="default" className="flex-1 bg-status-warning hover:bg-status-warning-dark">
                                                    Forward Task
                                                </Button>
                                            </div>
                                        </form>
                                    </DialogContent>
                                </Dialog>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleDuplicate}
                                            disabled={isLoading}
                                            className="text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 active:text-indigo-700 active:bg-indigo-100 active:scale-[0.98] transition-all duration-200 px-2 shrink-0"
                                        >
                                            <Copy className="h-4 w-4" /> <span className="hidden xs:inline">Copy</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Duplicate this task</TooltipContent>
                                </Tooltip>
                            </div>

                            {/* Meta Area - History & Notes */}
                            <div className="flex items-center gap-1 flex-wrap">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={cn(
                                                "h-8 px-2 gap-1.5 text-xs transition-all duration-200 shrink-0",
                                                showHistory ? "text-electric-blue bg-electric-blue-light" : "text-muted-foreground hover:text-foreground"
                                            )}
                                            onClick={() => { setShowHistory(!showHistory); setShowThread(false) }}
                                        >
                                            <HistoryIcon className="h-3.5 w-3.5" />
                                            <span className="hidden xs:inline">Audit Log</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>View task history</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={cn(
                                                "h-8 px-2 gap-1.5 text-xs transition-all duration-200 shrink-0",
                                                showThread ? "text-electric-blue bg-electric-blue-light" : "text-muted-foreground hover:text-foreground"
                                            )}
                                            onClick={() => { setShowThread(!showThread); setShowHistory(false) }}
                                        >
                                            <MessageSquare className="h-3.5 w-3.5" />
                                            <span className="hidden xs:inline">Notes</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Add notes and attachments</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 px-2 gap-1.5 text-xs transition-all duration-200 shrink-0 text-muted-foreground hover:text-international-orange hover:bg-accent/10"
                                            onClick={() => setFullViewOpen(true)}
                                        >
                                            <Maximize2 className="h-3.5 w-3.5" />
                                            <span className="hidden xs:inline">Expand</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Open full view</TooltipContent>
                                </Tooltip>
                            </div>
                        </div>

                        {/* Special Actions Block */}
                        {(isAITask || (!task.client_visible && task.status !== 'Completed')) && (
                            <div className="flex flex-col gap-2 pt-2 mt-2 bg-muted/50 -mx-4 px-4 pb-2">
                                {isAITask && (task.status === 'Pending' || task.status === 'Accepted') && (
                                    <Button
                                        onClick={handleRunAI}
                                        disabled={aiRunning}
                                        size="sm"
                                        variant="secondary"
                                        className="w-full bg-status-info-light text-status-info-dark hover:bg-status-info-light/80 border border-status-info"
                                    >
                                        <Bot className="h-4 w-4" /> {aiRunning ? 'AI Working...' : 'Trigger AI Agent'}
                                    </Button>
                                )}

                                {!task.client_visible && task.status !== 'Completed' && (
                                    <div className="w-full flex justify-center">
                                        <ClientNudgeButton
                                            taskId={task.id}
                                            lastNudge={task.last_nudge_at}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </CardFooter>

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
                    <RubberStampModal
                        isOpen={rubberStampOpen}
                        onClose={() => setRubberStampOpen(false)}
                        taskId={task.id}
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
