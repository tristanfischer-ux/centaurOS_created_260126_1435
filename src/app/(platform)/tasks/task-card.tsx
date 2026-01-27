"use client"

import { useState } from "react"
import { Database } from "@/types/database.types"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Check, X, ArrowRight, Edit, MessageSquare, ChevronDown, Bot, Target, Calendar, User, PlayCircle, AlertCircle } from "lucide-react"
import { acceptTask, rejectTask, forwardTask, amendTask, completeTask, triggerAIWorker, updateTaskProgress } from "@/actions/tasks"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"

import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

import { ThreadDrawer } from "./thread-drawer"
import { differenceInDays, format } from "date-fns"

type Task = Database["public"]["Tables"]["tasks"]["Row"]

// Extended Task type to include joined data
interface TaskWithData extends Task {
    assignee?: { id: string; full_name: string | null; role: string | null; email: string | null } | null
    creator?: { id: string; full_name: string | null; role: string | null } | null
    objective?: { id: string; title: string | null } | null
}

interface TaskCardProps {
    task: TaskWithData
    currentUserId: string
    userRole?: string
    members: { id: string; full_name: string; role: string }[]
}

// Calculate progress based on status
function getProgress(status: string | null): number {
    switch (status) {
        case 'Pending': return 10
        case 'Accepted': return 50
        case 'Completed': return 100
        case 'Rejected': return 0
        case 'Amended_Pending_Approval': return 30
        default: return 0
    }
}

// Get progress bar color based on status
function getProgressColor(status: string | null): string {
    switch (status) {
        case 'Completed': return 'bg-green-500'
        case 'Accepted': return 'bg-blue-500'
        case 'Rejected': return 'bg-red-500'
        case 'Amended_Pending_Approval': return 'bg-orange-500'
        default: return 'bg-gray-400'
    }
}

export function TaskCard({ task, currentUserId, userRole, members }: TaskCardProps) {
    const isAssignee = task.assignee_id === currentUserId
    const isCreator = task.creator_id === currentUserId
    const [loading, setLoading] = useState(false)
    const [rejectOpen, setRejectOpen] = useState(false)
    const [forwardOpen, setForwardOpen] = useState(false)
    const [amendOpen, setAmendOpen] = useState(false)
    const [threadOpen, setThreadOpen] = useState(false)
    const [expanded, setExpanded] = useState(false)
    const [aiRunning, setAiRunning] = useState(false)

    // Check if task is assigned to AI
    const isAITask = task.assignee?.role === 'AI_Agent'

    const progress = getProgress(task.status)
    const progressColor = getProgressColor(task.status)
    // Use manual progress if set, otherwise use status-based
    const displayProgress = task.progress ?? progress

    const handleProgressClick = async (e: React.MouseEvent<HTMLDivElement>) => {
        const bar = e.currentTarget
        const rect = bar.getBoundingClientRect()
        const clickX = e.clientX - rect.left
        const newProgress = Math.round((clickX / rect.width) * 100)
        await updateTaskProgress(task.id, newProgress)
    }

    // Format date nicely
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return null
        const date = new Date(dateStr)
        const now = new Date()
        const daysAway = differenceInDays(date, now)

        if (daysAway < 0) return `${Math.abs(daysAway)}d overdue`
        if (daysAway === 0) return 'Due today'
        if (daysAway === 1) return 'Tomorrow'
        if (daysAway < 7) return `${daysAway}d left`
        return format(date, 'MMM d')
    }

    const formatFullDate = (dateStr: string | null) => {
        if (!dateStr) return "Not set"
        return format(new Date(dateStr), "MMMM d, yyyy")
    }

    // Handlers for actions
    const handleAccept = async () => {
        setLoading(true)
        await acceptTask(task.id)
        setLoading(false)
    }

    const handleComplete = async () => {
        setLoading(true)
        await completeTask(task.id)
        setLoading(false)
    }

    const handleReject = async (formData: FormData) => {
        setLoading(true)
        const reason = formData.get('reason') as string
        await rejectTask(task.id, reason)
        setLoading(false)
        setRejectOpen(false)
    }

    const handleForward = async (formData: FormData) => {
        setLoading(true)
        const newAssigneeId = formData.get('new_assignee_id') as string
        const reason = formData.get('reason') as string
        await forwardTask(task.id, newAssigneeId, reason)
        setLoading(false)
        setForwardOpen(false)
    }

    const handleAmend = async (formData: FormData) => {
        setLoading(true)
        const notes = formData.get('amendment_notes') as string
        await amendTask(task.id, { amendment_notes: notes })
        setLoading(false)
        setAmendOpen(false)
    }

    const handleRunAI = async () => {
        setAiRunning(true)
        await triggerAIWorker(task.id)
        setAiRunning(false)
    }

    // Status Badge Logic
    const getStatusColor = (status: string | null) => {
        switch (status) {
            case 'Accepted': return 'bg-blue-600'
            case 'Completed': return 'bg-green-600'
            case 'Rejected': return 'bg-red-600'
            case 'Amended_Pending_Approval': return 'bg-orange-500'
            default: return 'bg-slate-500'
        }
    }

    const sortedMembers = [...(members || [])].sort((a, b) => {
        if (a.role === 'AI_Agent') return -1
        return a.full_name?.localeCompare(b.full_name || '')
    })

    const dueInfo = formatDate(task.end_date)
    const isOverdue = task.end_date && new Date(task.end_date) < new Date() && task.status !== 'Completed'

    return (
        <Card className="bg-white border-slate-200 hover:border-slate-300 hover:shadow-md transition-all flex flex-col h-full">
            {/* Clickable Header - Always Visible */}
            <CardHeader
                className="pb-3 cursor-pointer select-none"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex flex-col gap-4">
                    {/* Top Row: Objective & Status */}
                    <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0 pr-4">
                            {task.objective && (
                                <div className="text-xs font-semibold text-amber-600 mb-1.5 flex items-center gap-1.5">
                                    <Target className="h-3 w-3" />
                                    <span className="truncate">{task.objective.title}</span>
                                </div>
                            )}
                            <CardTitle className="text-xl text-slate-900 font-bold leading-tight decoration-slate-900/50">
                                {task.title || "Untitled Task"}
                            </CardTitle>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <Badge className={`${getStatusColor(task.status)} text-white border-0 shadow-sm px-2.5 py-1 whitespace-nowrap`}>
                                {task.status?.replace(/_/g, " ")}
                            </Badge>
                            {isAITask && (
                                <Badge variant="outline" className="text-[10px] border-purple-200 bg-purple-50 text-purple-700 flex items-center gap-1">
                                    <Bot className="h-3 w-3" /> AI Agent
                                </Badge>
                            )}
                        </div>
                    </div>

                    {/* Description - Expanded to 3 lines */}
                    {task.description && (
                        <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed">
                            {task.description}
                        </p>
                    )}

                    <Separator className="bg-slate-100" />

                    {/* Enhanced Metadata Grid */}
                    <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs mt-1">
                        {/* Assignee */}
                        <div className="flex items-center gap-2 text-slate-600">
                            <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold ring-2 ring-white shadow-sm">
                                {task.assignee?.full_name?.charAt(0) || "?"}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Assigned To</span>
                                <span className="truncate font-medium text-slate-700" title={task.assignee?.full_name || ''}>
                                    {task.assignee?.full_name || "Unassigned"}
                                </span>
                            </div>
                        </div>

                        {/* Due Date */}
                        <div className={`flex items-center justify-end gap-2 ${isOverdue ? 'text-red-600' : 'text-slate-600'}`}>
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Due Date</span>
                                <div className="flex items-center gap-1.5 font-medium">
                                    {(isOverdue || dueInfo?.includes('overdue')) && <AlertCircle className="h-3.5 w-3.5" />}
                                    {!isOverdue && <Calendar className="h-3.5 w-3.5 opacity-70" />}
                                    <span>{dueInfo || "No Deadline"}</span>
                                </div>
                            </div>
                        </div>

                        {/* Creator (Only if expanded or distinct) - Actually let's show always for context if space allows, or in second row */}
                        <div className="flex items-center gap-2 text-slate-600">
                            <div className="h-6 w-6 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-[10px] text-slate-400">
                                <User className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Created By</span>
                                <span className="truncate font-medium text-slate-700">
                                    {task.creator?.full_name || "System"}
                                </span>
                            </div>
                        </div>

                        {/* Start Date or Status Context */}
                        <div className="flex items-center justify-end gap-2 text-slate-600">
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Start Date</span>
                                <div className="flex items-center gap-1.5 font-medium">
                                    <PlayCircle className="h-3.5 w-3.5 opacity-70" />
                                    <span>{task.start_date ? formatDate(task.start_date) : "ASAP"}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Progress Bar moved inside Header for constant visibility */}
                    <div className="pt-2">
                        <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1.5 uppercase tracking-wider font-medium">
                            <span>Progress</span>
                            <span>{displayProgress}%</span>
                        </div>
                        <div
                            className="h-2.5 bg-slate-100 rounded-full overflow-hidden cursor-pointer hover:ring-2 hover:ring-amber-300 transition-all"
                            onClick={(e) => { e.stopPropagation(); handleProgressClick(e); }}
                            title="Click to set progress"
                        >
                            <div
                                className={`h-full ${progressColor} transition-all duration-300`}
                                style={{ width: `${displayProgress}%` }}
                            />
                        </div>
                    </div>

                    {/* Expand Indicator */}
                    <div className="flex justify-center pt-1">
                        <ChevronDown className={`h-4 w-4 text-slate-300 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
                    </div>
                </div>
            </CardHeader>

            {/* Expandable Content */}
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

                            {/* Detailed Dates */}
                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="bg-white p-2.5 rounded border border-slate-100">
                                    <span className="text-[10px] text-slate-400 block mb-1">Start Date</span>
                                    <span className="text-sm font-medium text-slate-700">{formatFullDate(task.start_date)}</span>
                                </div>
                                <div className="bg-white p-2.5 rounded border border-slate-100">
                                    <span className="text-[10px] text-slate-400 block mb-1">Deadline</span>
                                    <span className={`text-sm font-medium ${isOverdue ? "text-red-600" : "text-slate-700"}`}>
                                        {formatFullDate(task.end_date)}
                                    </span>
                                </div>
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
                        {/* Action Buttons: Visible to Assignee OR Executives (Managers) */}
                        {(isAssignee || userRole === 'Executive' || isCreator) && (
                            <div className="flex flex-wrap gap-2 flex-1 min-w-0">
                                {/* Pending Actions */}
                                {task.status === 'Pending' && (
                                    <>
                                        {/* Accept Button - Only for Assignee */}
                                        {isAssignee && (
                                            <Button size="sm" onClick={handleAccept} disabled={loading} className="bg-green-600 hover:bg-green-700 flex-1 text-white shadow-sm">
                                                <Check className="h-4 w-4 mr-2" /> Accept Task
                                            </Button>
                                        )}

                                        {/* Reject Dialog - Only for Assignee */}
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

                                {/* Accepted Actions */}
                                {task.status === 'Accepted' && (
                                    <Button size="sm" onClick={handleComplete} disabled={loading} className="bg-slate-900 hover:bg-slate-800 flex-1 text-white shadow-sm">
                                        <Check className="h-4 w-4 mr-2" /> Complete Task
                                    </Button>
                                )}

                                {/* Run AI Button - for AI-assigned tasks */}
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

                                {/* Forward Dialog (Always available if owned/exec) */}
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

                                {/* Amend Dialog */}
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

                        {/* View Thread Button */}
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
