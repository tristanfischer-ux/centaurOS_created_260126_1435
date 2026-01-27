"use client"

import { useEffect, useState, useRef, useMemo } from "react"
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { EmptyState } from "@/components/ui/empty-state"
import { MessageSquare } from "lucide-react"

function getInitials(name: string | null) {
    if (!name) return '??'
    return name
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
}

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
    const [isLoading, setIsLoading] = useState(true)
    const [newComment, setNewComment] = useState("")
    const [isSending, setIsSending] = useState(false)
    const [isActionLoading, setIsActionLoading] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [showForward, setShowForward] = useState(false)
    const [forwardToId, setForwardToId] = useState<string>("")
    const [forwardReason, setForwardReason] = useState("")
    const [commentError, setCommentError] = useState<string | null>(null)
    const [forwardError, setForwardError] = useState<string | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const supabase = useMemo(() => createClient(), [])

    // Check if assignee is AI
    const isAIAssignee = assigneeRole === 'AI_Agent'

    useEffect(() => {
        const fetchComments = async () => {
            setIsLoading(true)
            const { data, error } = await supabase
                .from('task_comments')
                .select('*, user:user_id(full_name, role)')
                .eq('task_id', taskId)
                .order('created_at', { ascending: true })

            if (!error && data) {
                setComments(data as Comment[])
            }
            setIsLoading(false)
        }

        if (open && taskId) {
            fetchComments()
        }
    }, [open, taskId, supabase])

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newComment.trim()) {
            setCommentError("Comment cannot be empty")
            return
        }

        setCommentError(null)
        setIsSending(true)
        try {
            const result = await addTaskComment(taskId, newComment)
            if (result?.error) {
                setCommentError(result.error)
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
        } finally {
            setIsSending(false)
        }
    }

    const handleAccept = async () => {
        setActionError(null)
        setIsActionLoading(true)
        try {
            const result = await acceptTask(taskId)
            if (result?.error) {
                setActionError(result.error)
                toast.error(result.error)
            } else {
                toast.success("Task accepted")
                router.refresh()
                onOpenChange(false)
            }
        } finally {
            setIsActionLoading(false)
        }
    }

    const handleReject = async () => {
        const reason = prompt("Reason for rejection:")
        if (!reason) return

        setIsActionLoading(true)
        const result = await rejectTask(taskId, reason)
        if (result?.error) {
            toast.error(result.error)
        } else {
            toast.success("Task rejected")
            router.refresh()
            onOpenChange(false)
        }
        setIsActionLoading(false)
    }

    const handleComplete = async () => {
        setIsActionLoading(true)
        const result = await completeTask(taskId)
        if (result?.error) {
            toast.error(result.error)
        } else {
            toast.success("Task completed!")
            router.refresh()
            onOpenChange(false)
        }
        setIsActionLoading(false)
    }

    const handleForward = async () => {
        if (!forwardToId) {
            toast.error("Please select someone to forward to")
            return
        }
        setIsActionLoading(true)
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
        setIsActionLoading(false)
    }

    const handleTriggerAI = async () => {
        setIsActionLoading(true)
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
        setIsActionLoading(false)
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)
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
        setIsUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:w-[400px] md:w-[540px] flex flex-col h-full bg-white">
                <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-300 md:hidden" />
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
                    {actionError && (
                        <div className="text-sm text-red-600 bg-red-50 p-2 rounded" role="alert">
                            {actionError}
                        </div>
                    )}
                    {/* Status-based actions */}
                    <div className="flex flex-wrap gap-2">
                        {/* Assignee can Accept/Reject if Pending */}
                        {isAssignee && taskStatus === 'Pending' && (
                            <>
                                <Button
                                    size="sm"
                                    onClick={handleAccept}
                                    disabled={isActionLoading}
                                    className="bg-green-500 hover:bg-green-600 text-white"
                                >
                                    <Check className="h-4 w-4 mr-1" /> Accept
                                </Button>
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={handleReject}
                                    disabled={isActionLoading}
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
                                disabled={isActionLoading}
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
                                disabled={isActionLoading}
                            >
                                <Forward className="h-4 w-4 mr-1" /> Reassign
                            </Button>

                            {/* Trigger AI Worker button - only show for AI assignees */}
                            {isAIAssignee && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleTriggerAI}
                                    disabled={isActionLoading}
                                    className="border-purple-200 text-purple-700 hover:bg-purple-50"
                                >
                                    <Bot className="h-4 w-4 mr-1" /> Trigger AI
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="pt-2 border-t border-slate-200 space-y-2">
                            <p className="text-xs text-slate-500">Forward this task to:</p>
                            <Select 
                                value={forwardToId} 
                                onValueChange={(value) => {
                                    setForwardToId(value)
                                    setForwardError(null)
                                }}
                            >
                                <SelectTrigger 
                                    className={`w-full ${forwardError ? 'border-red-500' : ''}`}
                                    aria-describedby={forwardError ? "forward-error" : undefined}
                                    aria-invalid={!!forwardError}
                                >
                                    <SelectValue placeholder="Select team member..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {members
                                        .filter(m => m.id !== assigneeId) // Exclude current assignee
                                        .map(member => (
                                            <SelectItem key={member.id} value={member.id}>
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-5 w-5 border border-slate-200 shrink-0">
                                                        <AvatarFallback className="text-[9px] bg-indigo-50 text-indigo-700 font-medium flex items-center justify-center">
                                                            {getInitials(member.full_name)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <span>
                                                        {member.full_name || 'Unknown'}
                                                        {member.role === 'AI_Agent' && ' 🤖'}
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                            <Input
                                placeholder="Reason (optional)"
                                value={forwardReason}
                                onChange={(e) => setForwardReason(e.target.value)}
                            />
                            {forwardError && (
                                <p id="forward-error" className="text-sm text-red-600 mt-1" role="alert">
                                    {forwardError}
                                </p>
                            )}
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    onClick={handleForward}
                                    disabled={isActionLoading || !forwardToId}
                                >
                                    {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Forward className="h-4 w-4 mr-1" />}
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
                    {isLoading ? (
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
                            disabled={isUploading}
                            onClick={() => fileInputRef.current?.click()}
                            className="shrink-0 border-slate-200"
                        >
                            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                        </Button>
                        <div className="flex-1">
                            <Input
                                value={newComment}
                                onChange={(e) => {
                                    setNewComment(e.target.value)
                                    setCommentError(null)
                                }}
                                placeholder="Type a note..."
                                disabled={isSending}
                                className={`bg-white border-slate-200 ${commentError ? 'border-red-500' : ''}`}
                                aria-describedby={commentError ? "comment-error" : undefined}
                                aria-invalid={!!commentError}
                            />
                            {commentError && (
                                <p id="comment-error" className="text-sm text-red-600 mt-1" role="alert">
                                    {commentError}
                                </p>
                            )}
                        </div>
                        <Button type="submit" size="icon" disabled={isSending || !newComment.trim()}>
                            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                    </form>
                </div>
            </SheetContent>
        </Sheet>
    )
}
