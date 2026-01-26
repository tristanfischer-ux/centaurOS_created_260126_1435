"use client"

import { useState } from "react"
import { Database } from "@/types/database.types"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Check, X, ArrowRight, Edit, MessageSquare, Clock, ChevronDown, Bot } from "lucide-react"
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
import { formatDistanceToNow, differenceInDays, format } from "date-fns"

type Task = Database["public"]["Tables"]["tasks"]["Row"]

interface TaskCardProps {
    task: Task
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
    // @ts-expect-error joined data
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
            default: return 'bg-gray-500'
        }
    }

    const sortedMembers = [...(members || [])].sort((a, b) => {
        if (a.role === 'AI_Agent') return -1
        return a.full_name?.localeCompare(b.full_name || '')
    })

    const dueInfo = formatDate(task.end_date)

    return (
        <Card className="bg-white border-slate-200 hover:border-slate-300 hover:shadow-md transition-all">
            {/* Clickable Header - Always Visible */}
            <CardHeader
                className="pb-3 cursor-pointer"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg text-slate-900 font-medium truncate">{task.title || "Untitled Task"}</CardTitle>
                        <CardDescription className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                            {/* @ts-expect-error joined data */}
                            {task.assignee && (
                                <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full text-slate-600">
                                    {/* @ts-expect-error joined data */}
                                    {task.assignee.role === "AI_Agent" ? "🤖" : "👤"} {task.assignee.full_name}
                                </span>
                            )}
                            {dueInfo && (
                                <span className={`flex items-center gap-1 ${dueInfo.includes('overdue') ? 'text-red-500' : 'text-slate-500'}`}>
                                    <Clock className="h-3 w-3" /> {dueInfo}
                                </span>
                            )}
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Badge className={`${getStatusColor(task.status)} text-white border-0 shadow-sm`}>{task.status}</Badge>
                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </div>
                </div>
            </CardHeader>

            {/* Expandable Content */}
            {expanded && (
                <>
                    <CardContent>
                        <p className="text-slate-600 text-sm mb-3 line-clamp-2">{task.description || "No description."}</p>

                        {/* Progress Bar - Clickable */}
                        <div className="mb-3">
                            <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
                                <span>Progress</span>
                                <span>{displayProgress}%</span>
                            </div>
                            <div
                                className="h-3 bg-slate-100 rounded-full overflow-hidden cursor-pointer hover:ring-2 hover:ring-amber-300 transition-all"
                                onClick={handleProgressClick}
                                title="Click to set progress"
                            >
                                <div
                                    className={`h-full ${progressColor} transition-all duration-300`}
                                    style={{ width: `${displayProgress}%` }}
                                />
                            </div>
                        </div>

                        {task.status === 'Amended_Pending_Approval' && (
                            <div className="bg-orange-50 border border-orange-200 p-3 rounded-md mb-4 text-sm text-orange-800">
                                <strong>Amendment Proposed:</strong>
                                <p className="mt-1 opacity-90">{task.amendment_notes}</p>
                            </div>
                        )}
                    </CardContent>
                    <Separator className="bg-slate-100" />
                    <CardFooter className="pt-3 flex flex-wrap gap-2 items-center">
                        {/* Action Buttons: Visible to Assignee OR Executives (Managers) */}
                        {(isAssignee || userRole === 'Executive') && (
                            <div className="flex flex-wrap gap-2 flex-1 min-w-0">
                                {/* Pending Actions */}
                                {task.status === 'Pending' && (
                                    <>
                                        <Button size="sm" onClick={handleAccept} disabled={loading} className="bg-green-600 hover:bg-green-700 flex-1 text-white shadow-sm">
                                            <Check className="h-4 w-4 mr-1" /> Accept
                                        </Button>

                                        {/* Reject Dialog */}
                                        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                                            <DialogTrigger asChild>
                                                <Button size="sm" variant="destructive" disabled={loading} className="flex-1 shadow-sm">
                                                    <X className="h-4 w-4 mr-1" /> Reject
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
                                    </>
                                )}

                                {/* Accepted Actions */}
                                {task.status === 'Accepted' && (
                                    <Button size="sm" onClick={handleComplete} disabled={loading} className="bg-slate-900 hover:bg-slate-800 flex-1 text-white shadow-sm">
                                        <Check className="h-4 w-4 mr-1" /> Complete Task
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
                                        <Bot className="h-4 w-4 mr-1" /> {aiRunning ? 'AI Working...' : 'Run AI'}
                                    </Button>
                                )}

                                {/* Forward Dialog (Always available if owned/exec) */}
                                <Dialog open={forwardOpen} onOpenChange={setForwardOpen}>
                                    <DialogTrigger asChild>
                                        <Button size="sm" variant="outline" disabled={loading} className="border-slate-200 text-slate-600 hover:bg-slate-50 flex-1">
                                            <ArrowRight className="h-4 w-4 mr-1" /> Fwd
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
                                            <Button type="submit" className="bg-amber-500 text-white hover:bg-amber-600">Forward</Button>
                                        </form>
                                    </DialogContent>
                                </Dialog>

                                {/* Amend Dialog */}
                                <Dialog open={amendOpen} onOpenChange={setAmendOpen}>
                                    <DialogTrigger asChild>
                                        <Button size="sm" variant="outline" disabled={loading} className="border-slate-200 text-slate-600 hover:bg-slate-50 flex-1">
                                            <Edit className="h-4 w-4 mr-1" /> Amend
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
                            className="text-slate-500 hover:text-amber-600 shrink-0"
                            onClick={() => setThreadOpen(true)}
                        >
                            <MessageSquare className="h-4 w-4 mr-1" /> Thread
                        </Button>
                    </CardFooter>

                    <ThreadDrawer
                        open={threadOpen}
                        onOpenChange={setThreadOpen}
                        taskId={task.id}
                        taskTitle={task.title}
                        taskStatus={task.status || 'Pending'}
                        taskDescription={task.description || undefined}
                        /* @ts-expect-error joined data */
                        assigneeName={task.assignee?.full_name}
                        isAssignee={isAssignee}
                        isCreator={isCreator}
                    />
                </>
            )}
        </Card>
    )
}
