"use client"

import { useEffect, useState, useRef } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { createClient } from "@/lib/supabase/client"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatDistanceToNow } from "date-fns"
import { Loader2, Send, Check, X, Forward, Paperclip, Bot } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { addTaskComment, acceptTask, rejectTask, completeTask, forwardTask, triggerAIWorker } from "@/actions/tasks"
import { uploadTaskAttachment } from "@/actions/attachments"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface Member {
    id: string
    full_name: string | null
    role: string | null
}

interface ThreadDrawerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    taskId: string
    taskTitle: string
    taskStatus?: string
    taskDescription?: string
    assigneeName?: string
    assigneeId?: string
    isAssignee?: boolean
    isCreator?: boolean
    members?: Member[]
    assigneeRole?: string
}

interface Comment {
    id: string
    content: string
    is_system_log: boolean
    created_at: string
    user_id: string
    user?: { full_name: string; role: string }
}

const statusColors: Record<string, string> = {
    'Pending': 'bg-gray-100 text-gray-700',
    'Accepted': 'bg-blue-100 text-blue-700',
    'Rejected': 'bg-red-100 text-red-700',
    'Completed': 'bg-green-100 text-green-700',
    'Amended_Pending_Approval': 'bg-orange-100 text-orange-700',
}

export function ThreadDrawer({
    open,
    onOpenChange,
    taskId,
    taskTitle,
    taskStatus = 'Pending',
    taskDescription,
    assigneeName,
    assigneeId,
    isAssignee = false,
    isCreator = false,
    members = [],
    assigneeRole,
}: ThreadDrawerProps) {
    const router = useRouter()
    const [comments, setComments] = useState<Comment[]>([])
    const [loading, setLoading] = useState(true)
    const [newComment, setNewComment] = useState("")
    const [sending, setSending] = useState(false)
    const [actionLoading, setActionLoading] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [showForward, setShowForward] = useState(false)
    const [forwardToId, setForwardToId] = useState<string>("")
    const [forwardReason, setForwardReason] = useState("")
    const fileInputRef = useRef<HTMLInputElement>(null)
    const supabase = createClient()

    // Check if assignee is AI
    const isAIAssignee = assigneeRole === 'AI_Agent'

    useEffect(() => {
        const fetchComments = async () => {
            setLoading(true)
            const { data, error } = await supabase
                .from('task_comments')
                .select('*, user:user_id(full_name, role)')
                .eq('task_id', taskId)
                .order('created_at', { ascending: true })

            if (!error && data) {
                setComments(data as Comment[])
            }
            setLoading(false)
        }

        if (open && taskId) {
            fetchComments()
        }
    }, [open, taskId, supabase])

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newComment.trim()) return

        setSending(true)
        const result = await addTaskComment(taskId, newComment)
        if (result?.error) {
            toast.error(result.error)
        } else {
            setNewComment("")
            const { data } = await supabase
                .from('task_comments')
                .select('*, user:user_id(full_name, role)')
                .eq('task_id', taskId)
                .order('created_at', { ascending: true })
            if (data) setComments(data as Comment[])
        }
        setSending(false)
    }

    const handleAccept = async () => {
        setActionLoading(true)
        const result = await acceptTask(taskId)
        if (result?.error) {
            toast.error(result.error)
        } else {
            toast.success("Task accepted")
            router.refresh()
            onOpenChange(false)
        }
        setActionLoading(false)
    }

    const handleReject = async () => {
        const reason = prompt("Reason for rejection:")
        if (!reason) return

        setActionLoading(true)
        const result = await rejectTask(taskId, reason)
        if (result?.error) {
            toast.error(result.error)
        } else {
            toast.success("Task rejected")
            router.refresh()
            onOpenChange(false)
        }
        setActionLoading(false)
    }

    const handleComplete = async () => {
        setActionLoading(true)
        const result = await completeTask(taskId)
        if (result?.error) {
            toast.error(result.error)
        } else {
            toast.success("Task completed!")
            router.refresh()
            onOpenChange(false)
        }
        setActionLoading(false)
    }

    const handleForward = async () => {
        if (!forwardToId) {
            toast.error("Please select someone to forward to")
            return
        }
        setActionLoading(true)
        const result = await forwardTask(taskId, forwardToId, forwardReason || "Reassigned via thread drawer")
        if (result?.error) {
            toast.error(result.error)
        } else {
            toast.success("Task forwarded!")
            router.refresh()
            setShowForward(false)
            setForwardToId("")
            setForwardReason("")
            onOpenChange(false)
        }
        setActionLoading(false)
    }

    const handleTriggerAI = async () => {
        setActionLoading(true)
        const result = await triggerAIWorker(taskId)
        if (result?.error) {
            toast.error(result.error)
        } else {
            toast.success("AI Worker triggered!")
            // Refresh comments to show new activity
            const { data } = await supabase
                .from('task_comments')
                .select('*, user:user_id(full_name, role)')
                .eq('task_id', taskId)
                .order('created_at', { ascending: true })
            setComments((data || []) as Comment[])
        }
        setActionLoading(false)
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        const formData = new FormData()
        formData.append('file', file)

        const result = await uploadTaskAttachment(taskId, formData)
        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success(`Uploaded ${file.name}`)
            // Refresh comments to show the attachment log
            const { data } = await supabase
                .from('task_comments')
                .select('*, user:user_id(full_name, role)')
                .eq('task_id', taskId)
                .order('created_at', { ascending: true })
            setComments((data || []) as Comment[])
        }
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-[400px] sm:w-[540px] flex flex-col h-full bg-white">
                <SheetHeader>
                    <SheetTitle className="text-slate-900">{taskTitle}</SheetTitle>
                    <SheetDescription className="flex items-center gap-2">
                        <Badge className={statusColors[taskStatus] || statusColors['Pending']}>
                            {taskStatus?.replace(/_/g, ' ')}
                        </Badge>
                        {assigneeName && (
                            <span className="text-slate-500">• {assigneeName}</span>
                        )}
                    </SheetDescription>
                </SheetHeader>

                {/* Task Actions */}
                <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-3">
                    {/* Status-based actions */}
                    <div className="flex flex-wrap gap-2">
                        {/* Assignee can Accept/Reject if Pending */}
                        {isAssignee && taskStatus === 'Pending' && (
                            <>
                                <Button
                                    size="sm"
                                    onClick={handleAccept}
                                    disabled={actionLoading}
                                    className="bg-green-500 hover:bg-green-600 text-white"
                                >
                                    <Check className="h-4 w-4 mr-1" /> Accept
                                </Button>
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={handleReject}
                                    disabled={actionLoading}
                                >
                                    <X className="h-4 w-4 mr-1" /> Reject
                                </Button>
                            </>
                        )}

                        {/* Assignee can Complete if Accepted */}
                        {isAssignee && taskStatus === 'Accepted' && (
                            <Button
                                size="sm"
                                onClick={handleComplete}
                                disabled={actionLoading}
                                className="bg-green-500 hover:bg-green-600 text-white"
                            >
                                <Check className="h-4 w-4 mr-1" /> Mark Complete
                            </Button>
                        )}

                        {/* Show status indicator if no actions available */}
                        {taskStatus === 'Completed' && (
                            <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                                <Check className="h-4 w-4" /> Task Completed
                            </div>
                        )}
                        {taskStatus === 'Rejected' && (
                            <div className="flex items-center gap-2 text-red-600 text-sm font-medium">
                                <X className="h-4 w-4" /> Task Rejected
                            </div>
                        )}
                    </div>

                    {/* Forward/Reassign Section */}
                    {!showForward ? (
                        <div className="flex gap-2 pt-2 border-t border-slate-200">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowForward(true)}
                                disabled={actionLoading}
                            >
                                <Forward className="h-4 w-4 mr-1" /> Reassign
                            </Button>

                            {/* Trigger AI Worker button - only show for AI assignees */}
                            {isAIAssignee && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleTriggerAI}
                                    disabled={actionLoading}
                                    className="border-purple-200 text-purple-700 hover:bg-purple-50"
                                >
                                    <Bot className="h-4 w-4 mr-1" /> Trigger AI
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="pt-2 border-t border-slate-200 space-y-2">
                            <p className="text-xs text-slate-500">Forward this task to:</p>
                            <Select value={forwardToId} onValueChange={setForwardToId}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select team member..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {members
                                        .filter(m => m.id !== assigneeId) // Exclude current assignee
                                        .map(member => (
                                            <SelectItem key={member.id} value={member.id}>
                                                {member.full_name || 'Unknown'} {member.role === 'AI_Agent' ? '🤖' : ''}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                            <Input
                                placeholder="Reason (optional)"
                                value={forwardReason}
                                onChange={(e) => setForwardReason(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    onClick={handleForward}
                                    disabled={actionLoading || !forwardToId}
                                >
                                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Forward className="h-4 w-4 mr-1" />}
                                    Forward
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        setShowForward(false)
                                        setForwardToId("")
                                        setForwardReason("")
                                    }}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Description */}
                {taskDescription && (
                    <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <p className="text-sm text-slate-600 whitespace-pre-wrap">{taskDescription}</p>
                    </div>
                )}

                {/* Comments Thread */}
                <div className="flex-1 overflow-hidden mt-4 relative">
                    <h4 className="text-sm font-medium text-slate-500 mb-3">Activity Log</h4>
                    {loading ? (
                        <div className="flex items-center justify-center h-full text-slate-400">
                            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading history...
                        </div>
                    ) : (
                        <ScrollArea className="h-[calc(100vh-400px)] pr-4">
                            <div className="space-y-4">
                                {comments.length === 0 && (
                                    <p className="text-center text-slate-400 py-8 text-sm">No history yet.</p>
                                )}
                                {comments.map((comment) => (
                                    <div key={comment.id} className={`flex gap-3 ${comment.is_system_log ? 'opacity-75' : ''}`}>
                                        <div className={`
                                            h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                                            ${comment.is_system_log ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-700'}
                                        `}>
                                            {comment.is_system_log ? 'SYS' : comment.user?.full_name?.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div className="bg-slate-50 p-3 rounded-lg text-sm w-full">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-medium text-slate-900">
                                                    {comment.is_system_log ? 'System' : comment.user?.full_name}
                                                </span>
                                                <span className="text-xs text-slate-400">
                                                    {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                                                </span>
                                            </div>
                                            <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                                                {comment.content}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </div>

                {/* Comment Input */}
                <div className="pt-4 border-t border-slate-100 mt-auto">
                    <form onSubmit={handleSend} className="flex gap-2">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                        <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            disabled={uploading}
                            onClick={() => fileInputRef.current?.click()}
                            className="shrink-0 border-slate-200"
                        >
                            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                        </Button>
                        <Input
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Type a note..."
                            disabled={sending}
                            className="bg-white border-slate-200"
                        />
                        <Button type="submit" size="icon" disabled={sending || !newComment.trim()}>
                            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                    </form>
                </div>
            </SheetContent>
        </Sheet>
    )
}
