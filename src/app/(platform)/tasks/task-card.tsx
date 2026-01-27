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
import { Calendar as CalendarIcon, Check, X, ArrowRight, Edit, Bot, MessageSquare, ChevronDown, ChevronUp, Clock, AlertCircle } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { acceptTask, rejectTask, forwardTask, amendTask, completeTask, triggerAIWorker, updateTaskProgress, updateTaskDates } from "@/actions/tasks"
import { cn } from "@/lib/utils"
import { Database } from "@/types/database.types"
import { ThreadDrawer } from "./thread-drawer"
import { toast } from "sonner"

type Task = Database["public"]["Tables"]["tasks"]["Row"] & {
    assignee?: { id: string, full_name: string | null, role: string, email: string } | null
    task_number?: number
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
}

export function TaskCard({ task, currentUserId, userRole, members }: TaskCardProps) {
    const isAssignee = currentUserId === task.assignee_id
    const isCreator = currentUserId === task.creator_id
    const isAITask = task.assignee?.role === 'AI_Agent'
    const isOverdue = task.end_date ? new Date(task.end_date) < new Date() : false

    const [expanded, setExpanded] = useState(false)
    const [loading, setLoading] = useState(false)
    const [aiRunning, setAiRunning] = useState(false)

    // Dialog States
    const [rejectOpen, setRejectOpen] = useState(false)
    const [forwardOpen, setForwardOpen] = useState(false)
    const [amendOpen, setAmendOpen] = useState(false)
    const [threadOpen, setThreadOpen] = useState(false)

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
            default: return 'bg-slate-500'
        }
    }

    // Handlers
    const handleAccept = async () => {
        setLoading(true)
        const res = await acceptTask(task.id)
        setLoading(false)
        if (res.error) toast.error(res.error)
        else toast.success("Task accepted")
    }

    const handleReject = async (formData: FormData) => {
        setLoading(true)
        const reason = formData.get('reason') as string
        const res = await rejectTask(task.id, reason)
        setLoading(false)
        setRejectOpen(false)
        if (res.error) toast.error(res.error)
        else toast.success("Task rejected")
    }

    const handleForward = async (formData: FormData) => {
        setLoading(true)
        const newAssigneeId = formData.get('new_assignee_id') as string
        const reason = formData.get('reason') as string
        const res = await forwardTask(task.id, newAssigneeId, reason)
        setLoading(false)
        setForwardOpen(false)
        if (res.error) toast.error(res.error)
        else toast.success("Task forwarded")
    }

    const handleAmend = async (formData: FormData) => {
        setLoading(true)
        const notes = formData.get('amendment_notes') as string
        const res = await amendTask(task.id, { amendment_notes: notes })
        setLoading(false)
        setAmendOpen(false)
        if (res.error) toast.error(res.error)
        else toast.success("Amendment proposed")
    }

    const handleComplete = async () => {
        setLoading(true)
        const res = await completeTask(task.id)
        setLoading(false)
        if (res.error) toast.error(res.error)
        else toast.success("Task completed")
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

        setLoading(true)
        if (type === 'start') {
            await updateTaskDates(task.id, newDateStr, currentEnd)
        } else {
            await updateTaskDates(task.id, currentStart, newDateStr)
        }
        setLoading(false)
        toast.success("Date updated")
    }

    const sortedMembers = [...members].sort((a, b) => a.full_name.localeCompare(b.full_name))

    return (
        <Card className="bg-white border-slate-200 hover:border-slate-300 hover:shadow-md transition-all flex flex-col h-full group/card">
            <CardHeader className="p-4 pb-2 space-y-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
                <div className="flex justify-between items-start gap-2">
                    <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-slate-400">
                                #{task.task_number ?? '...'}
                            </span>
                            <Badge className={`${getStatusColor(task.status)} text-white hover:${getStatusColor(task.status)} border-0`}>
                                {task.status || 'Pending'}
                            </Badge>
                            {isOverdue && task.status !== 'Completed' && (
                                <span className="text-red-600 flex items-center text-[10px] font-medium">
                                    <AlertCircle className="w-3 h-3 mr-1" /> Overdue
                                </span>
                            )}
                        </div>
                        <h3 className="font-semibold text-slate-900 leading-tight group-hover/card:text-blue-700 transition-colors">
                            {task.title}
                        </h3>
                    </div>
                    <div title={task.assignee ? `Assignee: ${task.assignee.full_name}` : "Unassigned"}>
                        <Avatar className="h-8 w-8 border border-slate-200">
                            <AvatarImage src={`https://avatar.vercel.sh/${task.assignee?.email || 'unassigned'}`} />
                            <AvatarFallback>{task.assignee?.full_name?.substring(0, 2) || "??"}</AvatarFallback>
                        </Avatar>
                    </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                            {task.assignee?.role === 'AI_Agent' ? <Bot className="w-3 h-3" /> : <div className="w-3" />}
                            <span className="truncate max-w-[100px]">{task.assignee?.full_name || "Unassigned"}</span>
                        </div>
                    </div>

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
                                <span>{task.end_date ? format(new Date(task.end_date), "MMM d") : "-"}</span>
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
                                            "bg-white p-2.5 rounded border border-slate-100 cursor-pointer hover:border-slate-300 transition-colors group",
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
                                            "bg-white p-2.5 rounded border border-slate-100 cursor-pointer hover:border-slate-300 transition-colors group",
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
                    </CardContent>

                    <Separator className="bg-slate-200" />

                    <CardFooter className="bg-slate-50 p-4 flex flex-wrap gap-2 items-center">
                        {(isAssignee || userRole === 'Executive' || isCreator) && (
                            <div className="flex flex-wrap gap-2 flex-1 min-w-0">
                                {/* Actions based on status */}
                                {task.status === 'Pending' && (
                                    <>
                                        {isAssignee && (
                                            <Button size="sm" onClick={handleAccept} disabled={loading} className="bg-green-600 hover:bg-green-700 flex-1 text-white shadow-sm">
                                                <Check className="h-4 w-4 mr-2" /> Accept
                                            </Button>
                                        )}
                                        {isAssignee && (
                                            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                                                <DialogTrigger asChild>
                                                    <Button size="sm" variant="destructive" disabled={loading} className="flex-1 shadow-sm">
                                                        <X className="h-4 w-4 mr-2" /> Reject
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className="bg-white border-slate-200 text-slate-900">
                                                    <DialogHeader><DialogTitle>Reject Task</DialogTitle></DialogHeader>
                                                    <form action={handleReject} className="space-y-4">
                                                        <Textarea name="reason" placeholder="Reason for rejection..." required className="bg-slate-50 border-slate-200" />
                                                        <Button type="submit" variant="destructive">Confirm Rejection</Button>
                                                    </form>
                                                </DialogContent>
                                            </Dialog>
                                        )}
                                    </>
                                )}

                                {task.status === 'Accepted' && (
                                    <Button size="sm" onClick={handleComplete} disabled={loading} className="bg-slate-900 hover:bg-slate-800 flex-1 text-white shadow-sm">
                                        <Check className="h-4 w-4 mr-2" /> Complete
                                    </Button>
                                )}

                                {isAITask && (task.status === 'Pending' || task.status === 'Accepted') && (
                                    <Button
                                        size="sm"
                                        onClick={handleRunAI}
                                        disabled={aiRunning}
                                        className="bg-purple-600 hover:bg-purple-700 flex-1 text-white shadow-sm"
                                    >
                                        <Bot className="h-4 w-4 mr-2" /> {aiRunning ? 'AI Working...' : 'Trigger AI Agent'}
                                    </Button>
                                )}

                                <Dialog open={forwardOpen} onOpenChange={setForwardOpen}>
                                    <DialogTrigger asChild>
                                        <Button size="sm" variant="outline" disabled={loading} className="border-slate-200 text-slate-600 hover:bg-slate-50 flex-1">
                                            <ArrowRight className="h-4 w-4 mr-2" /> Forward
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
                                                                {member.full_name}
                                                                {member.role === 'AI_Agent' && ' 🤖'}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <Textarea name="reason" placeholder="Handover notes..." required className="bg-slate-50 border-slate-200" />
                                            <Button type="submit" className="bg-amber-500 text-white hover:bg-amber-600">Forward Task</Button>
                                        </form>
                                    </DialogContent>
                                </Dialog>

                                <Dialog open={amendOpen} onOpenChange={setAmendOpen}>
                                    <DialogTrigger asChild>
                                        <Button size="sm" variant="outline" disabled={loading} className="border-slate-200 text-slate-600 hover:bg-slate-50 flex-1">
                                            <Edit className="h-4 w-4 mr-2" /> Amend
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="bg-white border-slate-200 text-slate-900">
                                        <DialogHeader><DialogTitle>Amend Task</DialogTitle></DialogHeader>
                                        <form action={handleAmend} className="space-y-4">
                                            <Textarea name="amendment_notes" placeholder="New terms/scope..." required className="bg-slate-50 border-slate-200" />
                                            <Button type="submit" className="bg-orange-600 text-white hover:bg-orange-700">Propose Amendment</Button>
                                        </form>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        )}

                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-500 hover:text-amber-600 shrink-0 ml-auto"
                            onClick={() => setThreadOpen(true)}
                        >
                            <MessageSquare className="h-4 w-4 mr-2" /> Thread
                        </Button>
                    </CardFooter>

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
                </>
            )}
        </Card>
    )
}
