"use client"

import { useState } from "react"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import { Calendar as CalendarIcon, Check, X, ArrowRight, Bot, MessageSquare, ChevronDown, ChevronUp, AlertCircle, Copy, Pencil, History as HistoryIcon, ShieldAlert, Eye, EyeOff, ShieldCheck, Paperclip, Plus } from "lucide-react"
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
import { cn, getInitials } from "@/lib/utils"
import { Database } from "@/types/database.types"
import { ThreadDrawer } from "./thread-drawer"
import { EditTaskDialog } from "@/components/tasks/edit-task-dialog"
import { toast } from "sonner"
import { HistoryDrawer } from "@/components/tasks/history-drawer"
import { RubberStampModal } from "@/components/smart-airlock/RubberStampModal"
import { ClientNudgeButton } from "@/components/smart-airlock/ClientNudgeButton"
import { Checkbox } from "@/components/ui/checkbox"

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

export function TaskCard(props: TaskCardProps) {
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

    const [isLoading, setIsLoading] = useState(false)
    const [aiRunning, setAiRunning] = useState(false)

    // Dialog States
    const [rejectOpen, setRejectOpen] = useState(false)
    const [forwardOpen, setForwardOpen] = useState(false)

    const [threadOpen, setThreadOpen] = useState(false)
    const [editOpen, setEditOpen] = useState(false)
    const [historyOpen, setHistoryOpen] = useState(false)
    const [rubberStampOpen, setRubberStampOpen] = useState(false)
    const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false)
    const [assigneeNamePopoverOpen, setAssigneeNamePopoverOpen] = useState(false)

    // Normalize assignees list (handle backward compatibility or fallback)
    const currentAssignees = task.assignees && task.assignees.length > 0
        ? task.assignees
        : (task.assignee ? [task.assignee] : [])

    // Helper Functions
    const formatFullDate = (dateStr: string | null) => {
        if (!dateStr) return "Not set"
        return format(new Date(dateStr), "MMM d, yyyy")
    }

    const getStatusColor = (status: string | null) => {
        switch (status) {
            case 'Accepted': return 'bg-green-600'
            case 'Completed': return 'bg-slate-800'
            case 'Rejected': return 'bg-red-600'
            case 'Amended_Pending_Approval': return 'bg-orange-500'
            case 'Pending_Executive_Approval': return 'bg-purple-600'
            case 'Pending_Peer_Review': return 'bg-blue-500'
            default: return 'bg-slate-500'
        }
    }

    const getRiskBadge = (level: string | null) => {
        switch (level) {
            case 'High': return <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 gap-1"><ShieldAlert className="w-3 h-3" /> High Risk</Badge>
            case 'Medium': return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 gap-1"><ShieldCheck className="w-3 h-3" /> Medium Risk</Badge>
            default: return null // Low risk doesn't need a badge to reduce noise? Or maybe text-green-600?
        }
    }

    // Handlers (keep existing ones...)
    const handleAccept = async () => {
        setIsLoading(true)
        const res = await acceptTask(task.id)
        setIsLoading(false)
        if (res.error) toast.error(res.error)
        else toast.success("Task accepted")
    }

    const handleReject = async (formData: FormData) => {
        setIsLoading(true)
        const reason = formData.get('reason') as string
        const res = await rejectTask(task.id, reason)
        setIsLoading(false)
        setRejectOpen(false)
        if (res.error) toast.error(res.error)
        else toast.success("Task rejected")
    }

    const handleForward = async (formData: FormData) => {
        setIsLoading(true)
        const newAssigneeId = formData.get('new_assignee_id') as string
        const reason = formData.get('reason') as string
        const res = await forwardTask(task.id, newAssigneeId, reason)
        setIsLoading(false)
        setForwardOpen(false)
        if (res.error) toast.error(res.error)
        else toast.success("Task forwarded")
    }



    const handleComplete = async () => {
        setIsLoading(true)
        const res = await completeTask(task.id)
        setIsLoading(false)
        if (res.error) toast.error(res.error)
        else {
            if (res.newStatus === 'Completed') {
                toast.success("Task completed")
            } else {
                toast.info(`Task moved to ${res.newStatus?.replace(/_/g, ' ')}`)
            }
        }
    }

    const handleDuplicate = async () => {
        setIsLoading(true)
        const res = await duplicateTask(task.id)
        setIsLoading(false)
        if (res.error) toast.error(res.error)
        else toast.success("Task duplicated")
    }

    const handleRunAI = async () => {
        setAiRunning(true)
        const res = await triggerAIWorker(task.id)
        setAiRunning(false)
        if (res.error) toast.error(res.error)
        else toast.success("AI Agent triggered")
    }

    // Date Update Handler
    const handleDateUpdate = async (type: 'start' | 'end', date: Date | undefined) => {
        if (!date) return
        const newDateStr = date.toISOString()
        const currentStart = task.start_date || new Date().toISOString()
        const currentEnd = task.end_date || new Date().toISOString()
        setIsLoading(true)
        if (type === 'start') {
            await updateTaskDates(task.id, newDateStr, currentEnd)
        } else {
            await updateTaskDates(task.id, currentStart, newDateStr)
        }
        setIsLoading(false)
        toast.success("Date updated")
    }

    const sortedMembers = [...members].sort((a, b) => a.full_name.localeCompare(b.full_name))

    const handleAssigneeToggle = async (memberId: string) => {
        const currentIds = currentAssignees.map(a => a.id)
        let newIds: string[]

        if (currentIds.includes(memberId)) {
            // Remove
            newIds = currentIds.filter(id => id !== memberId)
            if (newIds.length === 0) {
                toast.error("Task must have at least one assignee")
                return
            }
        } else {
            // Add
            newIds = [...currentIds, memberId]
        }

        const result = await updateTaskAssignees(task.id, newIds)
        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success("Assignees updated")
        }
    }

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
                "bg-white border-slate-200 transition-all flex flex-col h-full group/card relative",
                isSelectionMode ? "cursor-pointer" : "hover:border-slate-300 hover:shadow-md active:border-slate-400 active:shadow-lg transition-all",
                isSelected && isSelectionMode ? "ring-2 ring-slate-500 border-slate-500 bg-slate-50/10" : ""
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
                        onCheckedChange={(checked) => {
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
                            <span className="text-xs font-mono text-slate-400">
                                #{task.task_number ?? '...'}
                            </span>
                            <Badge className={`${getStatusColor(task.status)} text-white hover:${getStatusColor(task.status)} border-0`}>
                                {(task.status || 'Pending').replace(/_/g, ' ')}
                            </Badge>
                            {getRiskBadge(task.risk_level)}
                            {isOverdue && task.status !== 'Completed' && (
                                <Badge variant="destructive" className="ml-2">
                                    ⚠️ Overdue
                                </Badge>
                            )}
                            {isDueSoon && !isOverdue && (
                                <Badge variant="outline" className="ml-2 bg-yellow-500 text-white border-yellow-600">
                                    ⏰ Due Soon
                                </Badge>
                            )}
                        </div>
                        {task.objective && (
                            <div className="text-[10px] font-semibold text-blue-600/80 uppercase tracking-wide truncate max-w-[200px] mb-1" title={task.objective.title}>
                                {task.objective.title}
                            </div>
                        )}
                        <h3 className="font-semibold text-slate-900 leading-tight group-hover/card:text-blue-700 transition-colors">
                            {task.title}
                        </h3>

                        {/* Summary Metadata */}
                        <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
                            {task.start_date && (
                                <span className="flex items-center gap-1" title="Start Date">
                                    <CalendarIcon className="w-3 h-3" />
                                    Start: {format(new Date(task.start_date), "MMM d")}
                                </span>
                            )}
                            <span className="flex items-center gap-1" title="Documents">
                                <Paperclip className="w-3 h-3" />
                                {task.task_files?.length || 0}
                            </span>
                        </div>
                    </div>


                    <div className="flex items-center gap-2">
                        {/* Visibility Indicator */}
                        <div title={task.client_visible ? "Visible to Client" : "Hidden from Client"}>
                            {task.client_visible ? (
                                <Eye className="w-4 h-4 text-green-500/50" />
                            ) : (
                                <EyeOff className="w-4 h-4 text-slate-300" />
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
                                                currentAssignees.map((assignee, i) => (
                                                    <Avatar key={assignee.id} className="h-8 w-8 border-2 border-white ring-1 ring-slate-100" style={{ zIndex: 10 - i }}>
                                                        {assignee.avatar_url ? (
                                                            <AvatarImage src={assignee.avatar_url} />
                                                        ) : null}
                                                        <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-[10px] text-white font-medium">
                                                            {getInitials(assignee.full_name)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                ))
                                            ) : (
                                                <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 border-dashed flex items-center justify-center text-slate-400">
                                                    <Plus className="w-4 h-4" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </PopoverTrigger>
                                <PopoverContent className="w-[calc(100vw-2rem)] max-w-[240px] sm:w-[240px] overflow-y-auto max-h-[60vh] p-0" align="end" onClick={(e) => e.stopPropagation()}>
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
                                                            onSelect={() => handleAssigneeToggle(member.id)}
                                                        >
                                                            <div className="flex items-center gap-2 w-full">
                                                                <Avatar className="h-6 w-6 relative border border-slate-200 shrink-0">
                                                                    <AvatarFallback className="text-[10px] bg-indigo-50 text-indigo-700 font-medium flex items-center justify-center">
                                                                        {getInitials(member.full_name)}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                <span className="truncate flex-1">{member.full_name}</span>
                                                                {isSelected && (
                                                                    <Check className="ml-auto h-4 w-4 opacity-100 text-blue-600" />
                                                                )}
                                                            </div>
                                                        </CommandItem>
                                                    )
                                                })}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                    <Popover>
                        <PopoverTrigger asChild>
                            <div className="flex items-center gap-1 cursor-pointer hover:text-blue-600 active:text-blue-700 transition-colors group/assignee touch-manipulation" onClick={(e) => e.stopPropagation()}>
                                {task.assignee?.role === 'AI_Agent' ? <Bot className="w-3 h-3" /> : <div className="w-3" />}
                                <span className="truncate max-w-[100px] border-b border-transparent group-hover/assignee:border-blue-200">
                                    {task.assignee?.full_name || "Unassigned"}
                                </span>
                            </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-[calc(100vw-2rem)] max-w-[240px] sm:w-[240px] overflow-y-auto max-h-[60vh] p-0" align="start" onClick={(e) => e.stopPropagation()}>
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
                                                    onSelect={() => handleAssigneeToggle(member.id)}
                                                >
                                                    <div className="flex items-center gap-2 w-full">
                                                        <Avatar className="h-6 w-6 relative border border-slate-200 shrink-0">
                                                            <AvatarFallback className="text-[10px] bg-indigo-50 text-indigo-700 font-medium flex items-center justify-center">
                                                                {getInitials(member.full_name)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <span className="truncate flex-1">{member.full_name}</span>
                                                        {isSelected && (
                                                            <Check className="ml-auto h-4 w-4 opacity-100 text-blue-600" />
                                                        )}
                                                    </div>
                                                </CommandItem>
                                            )
                                        })}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>

                    <div className="flex items-center gap-1">
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                </div>

                {!expanded && (
                    <div className="space-y-2 pb-2">
                        {task.description && (
                            <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                                {task.description}
                            </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-slate-400">
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
                    <CardContent className="bg-slate-50/50 pt-4 pb-4">
                        <div className="space-y-4">
                            {/* Full Description */}
                            <div className="space-y-1">
                                <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Description</h4>
                                <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                                    {task.description || "No specific details provided."}
                                </p>
                            </div>

                            {/* Detailed Dates - Now Interactive */}
                            <div className="grid grid-cols-2 gap-4 pt-2">
                                {/* Start Date Picker */}
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <div className={cn(
                                            "bg-white p-2.5 rounded border border-slate-100 cursor-pointer hover:border-slate-300 active:border-slate-400 hover:bg-slate-50 active:bg-slate-100 transition-colors group",
                                            !isAssignee && !isCreator && "pointer-events-none" // Only allow edits if assignee/creator
                                        )}>
                                            <span className="text-[10px] text-slate-400 block mb-1 group-hover:text-amber-600 transition-colors">Start Date</span>
                                            <div className="flex items-center gap-2">
                                                <CalendarIcon className="h-3.5 w-3.5 text-slate-400 group-hover:text-amber-600" />
                                                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
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
                                            "bg-white p-2.5 rounded border border-slate-100 cursor-pointer hover:border-slate-300 active:border-slate-400 hover:bg-slate-50 active:bg-slate-100 transition-colors group",
                                            !isAssignee && !isCreator && "pointer-events-none"
                                        )}>
                                            <span className="text-[10px] text-slate-400 block mb-1 group-hover:text-amber-600 transition-colors">Deadline</span>
                                            <div className="flex items-center gap-2">
                                                <CalendarIcon className="h-3.5 w-3.5 text-slate-400 group-hover:text-amber-600" />
                                                <span className={cn(
                                                    "text-sm font-medium transition-colors group-hover:text-slate-900",
                                                    isOverdue ? "text-red-600" : "text-slate-700"
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
                            <div className="mt-4 bg-orange-50 border border-orange-200 p-3 rounded-md text-sm text-orange-800">
                                <strong>Amendment Proposed:</strong>
                                <p className="mt-1 opacity-90">{task.amendment_notes}</p>
                            </div>
                        )}

                        {/* Executive Airlock Warning */}
                        {task.status === 'Pending_Executive_Approval' && (
                            <div className="mt-4 bg-purple-50 border border-purple-200 p-3 rounded-md text-sm text-purple-800 flex items-start gap-2">
                                <ShieldAlert className="w-5 h-5 shrink-0" />
                                <div>
                                    <strong className="block uppercase text-xs tracking-wide mb-1">Airlock Active</strong>
                                    Task completed but held for Executive Certification.
                                </div>
                            </div>
                        )}
                    </CardContent>

                    <Separator className="bg-slate-200" />

                    <CardFooter className="bg-slate-50 p-4 flex flex-col gap-4">
                        {/* Primary Workflow Actions */}
                        {(isAssignee || userRole === 'Executive' || isCreator) && (
                            <div className="flex gap-3 w-full">
                                {task.status === 'Pending' && isAssignee && (
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
                                                    variant="outline"
                                                    disabled={isLoading}
                                                    className="flex-1 border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300 shadow-sm font-medium"
                                                >
                                                    <X className="h-4 w-4" /> Reject
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="bg-white border-slate-200 text-slate-900">
                                                <DialogHeader><DialogTitle>Reject Task</DialogTitle></DialogHeader>
                                                <form action={handleReject} className="space-y-4">
                                                    <Textarea name="reason" placeholder="Reason for rejection..." required className="bg-slate-50 border-slate-200" />
                                                    <Button type="submit" variant="destructive" className="w-full">Confirm Rejection</Button>
                                                </form>
                                            </DialogContent>
                                        </Dialog>
                                    </>
                                )}

                                {task.status === 'Accepted' && (
                                    <Button
                                        onClick={handleComplete}
                                        disabled={isLoading}
                                        className="w-full bg-slate-900 hover:bg-slate-800 text-white shadow-sm font-medium"
                                    >
                                        <Check className="h-4 w-4" /> Mark Complete
                                    </Button>
                                )}

                                {task.status === 'Pending_Executive_Approval' && isExecutive && (
                                    <Button
                                        onClick={() => setRubberStampOpen(true)}
                                        variant="certified"
                                        disabled={isLoading}
                                        className="w-full shadow-sm font-medium"
                                    >
                                        <ShieldCheck className="h-4 w-4" /> Certify Release
                                    </Button>
                                )}
                            </div>
                        )}

                        <Separator className="bg-slate-200/60" />

                        {/* Secondary & Meta Actions */}
                        <div className="flex items-center justify-between w-full">
                            {/* Tools Area */}
                            <div className="flex items-center gap-1">
                                {(isAssignee || isCreator || userRole === 'Executive') && (
                                    <>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setEditOpen(true)}
                                            disabled={isLoading}
                                            className="text-slate-600 hover:text-blue-600 hover:bg-blue-50 active:text-blue-700 active:bg-blue-100 active:scale-[0.98] transition-all px-2"
                                            title="Edit Details"
                                        >
                                            <Pencil className="h-4 w-4" /> Edit
                                        </Button>

                                        <Dialog open={forwardOpen} onOpenChange={setForwardOpen}>
                                            <DialogTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={isLoading}
                                                    className="text-slate-600 hover:text-amber-600 hover:bg-amber-50 active:text-amber-700 active:bg-amber-100 active:scale-[0.98] transition-all px-2"
                                                    title="Forward or Reassign"
                                                >
                                                    <ArrowRight className="h-4 w-4" /> Forward
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="bg-white border-slate-200 text-slate-900">
                                                <DialogHeader><DialogTitle>Forward Task</DialogTitle></DialogHeader>
                                                <form action={handleForward} className="space-y-4">
                                                    <div className="grid gap-2">
                                                        <label className="text-sm font-medium">New Assignee</label>
                                                        <Select name="new_assignee_id" required>
                                                            <SelectTrigger className="bg-white border-slate-200">
                                                                <SelectValue placeholder="Select person..." />
                                                            </SelectTrigger>
                                                            <SelectContent className="bg-white border-slate-200 z-50">
                                                                {sortedMembers.map(member => (
                                                                    <SelectItem key={member.id} value={member.id}>
                                                                        <div className="flex items-center gap-2">
                                                                            <Avatar className="h-5 w-5 border border-slate-200 shrink-0">
                                                                                <AvatarFallback className="text-[9px] bg-indigo-50 text-indigo-700 font-medium flex items-center justify-center">
                                                                                    {getInitials(member.full_name)}
                                                                                </AvatarFallback>
                                                                            </Avatar>
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
                                                    <Textarea name="reason" placeholder="Handover notes..." required className="bg-slate-50 border-slate-200" />
                                                    <Button type="submit" variant="warning" className="w-full">Forward Task</Button>
                                                </form>
                                            </DialogContent>
                                        </Dialog>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleDuplicate}
                                            disabled={isLoading}
                                            className="text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 active:text-indigo-700 active:bg-indigo-100 active:scale-[0.98] transition-all px-2"
                                            title="Duplicate Task"
                                        >
                                            <Copy className="h-4 w-4" /> Copy
                                        </Button>
                                    </>
                                )}
                            </div>

                            {/* Meta Area */}
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slate-400 hover:text-slate-600 active:text-slate-700 active:scale-[0.98] transition-all"
                                    onClick={() => setHistoryOpen(true)}
                                    title="View View History"
                                >
                                    <HistoryIcon className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slate-400 hover:text-slate-600 active:text-slate-700 active:scale-[0.98] transition-all"
                                    onClick={() => setThreadOpen(true)}
                                    title="View Thread"
                                >
                                    <MessageSquare className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Special Actions Block */}
                        {(isAITask || (!task.client_visible && task.status !== 'Completed')) && (
                            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                                {isAITask && (task.status === 'Pending' || task.status === 'Accepted') && (
                                    <Button
                                        onClick={handleRunAI}
                                        disabled={aiRunning}
                                        size="sm"
                                        variant="secondary"
                                        className="w-full bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200"
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

                    <EditTaskDialog
                        open={editOpen}
                        onOpenChange={setEditOpen}
                        task={task}
                        members={members}
                    />
                    <HistoryDrawer
                        open={historyOpen}
                        onOpenChange={setHistoryOpen}
                        taskId={task.id}
                        taskTitle={task.title}
                    />
                    <ThreadDrawer
                        open={threadOpen}
                        onOpenChange={setThreadOpen}
                        taskId={task.id}
                        taskTitle={task.title}
                        taskStatus={task.status || 'Pending'}
                        taskDescription={task.description || undefined}
                        assigneeName={task.assignee?.full_name || undefined}
                        assigneeId={task.assignee_id || undefined}
                        assigneeRole={task.assignee?.role || undefined}
                        isAssignee={isAssignee}
                        isCreator={isCreator}
                        members={members}
                    />
                    <RubberStampModal
                        isOpen={rubberStampOpen}
                        onClose={() => setRubberStampOpen(false)}
                        taskId={task.id}
                    />
                </>
            )}
        </Card>
    )
}
