"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { formatDistanceToNow, format } from "date-fns"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { MentionInput } from "@/components/ui/mention-input"
import { MentionText } from "@/components/ui/mention-text"
import { AttachmentList } from "@/components/tasks/attachment-list"
import { Markdown } from "@/components/ui/markdown"
import { addTaskComment, getTaskAttachments, getTaskHistory } from "@/actions/tasks"
import { uploadTaskAttachment } from "@/actions/attachments"
import { toast } from "sonner"
import { cn, getInitials } from "@/lib/utils"
import { getStatusColor } from "@/lib/status-colors"
import {
    X,
    Loader2,
    Send,
    Upload,
    Calendar,
    User,
    Paperclip,
    MessageSquare,
    History,
    ShieldAlert,
    ShieldCheck,
    Bot
} from "lucide-react"
import { Database } from "@/types/database.types"

interface Member {
    id: string
    full_name: string
    role: string
    email?: string
}

interface Assignee {
    id: string
    full_name: string | null
    role: string
    email: string
    avatar_url?: string | null
}

interface Task {
    id: string
    title: string
    description: string | null
    status: string | null
    risk_level: string | null
    start_date: string | null
    end_date: string | null
    task_number?: number
    assignee?: Assignee | null
    assignees?: Assignee[]
    task_files?: { id: string }[]
    objective?: { id: string; title: string } | null
}

interface Comment {
    id: string
    content: string
    is_system_log: boolean
    created_at: string
    user_id: string
    user?: { full_name: string; role: string }
}

type TaskHistoryItem = Database['public']['Tables']['task_history']['Row'] & {
    user: {
        full_name: string | null
        role?: string | null
        avatar_url?: string | null
    } | null
}

interface FullTaskViewProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    task: Task
    members: Member[]
    currentUserId: string
}

export function FullTaskView({ open, onOpenChange, task, members, currentUserId }: FullTaskViewProps) {
    const [comments, setComments] = useState<Comment[]>([])
    const [history, setHistory] = useState<TaskHistoryItem[]>([])
    const [attachments, setAttachments] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [newComment, setNewComment] = useState("")
    const [isSending, setIsSending] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const supabase = useMemo(() => createClient(), [])

    // Get assignees
    const assignees = task.assignees && task.assignees.length > 0
        ? task.assignees
        : (task.assignee ? [task.assignee] : [])

    // Fetch data when dialog opens
    useEffect(() => {
        if (open && task.id) {
            fetchAllData()
        }
    }, [open, task.id])

    const fetchAllData = async () => {
        setIsLoading(true)
        
        // Fetch comments (all, including system logs for full history view)
        const { data: commentsData } = await supabase
            .from('task_comments')
            .select('*, user:user_id(full_name, role)')
            .eq('task_id', task.id)
            .order('created_at', { ascending: false })
            .limit(50)

        if (commentsData) {
            setComments(commentsData as Comment[])
        }

        // Fetch attachments
        const attachmentsRes = await getTaskAttachments(task.id)
        if (attachmentsRes.data) {
            setAttachments(attachmentsRes.data)
        }

        // Fetch history
        const historyRes = await getTaskHistory(task.id)
        if (historyRes.data && Array.isArray(historyRes.data)) {
            setHistory(historyRes.data as TaskHistoryItem[])
        }

        setIsLoading(false)
    }

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newComment.trim()) return

        setIsSending(true)
        try {
            const result = await addTaskComment(task.id, newComment)
            if (result?.error) {
                toast.error(result.error)
            } else {
                setNewComment("")
                // Refresh comments
                const { data } = await supabase
                    .from('task_comments')
                    .select('*, user:user_id(full_name, role)')
                    .eq('task_id', task.id)
                    .order('created_at', { ascending: false })
                    .limit(50)
                if (data) setComments(data as Comment[])
                toast.success("Note added")
            }
        } finally {
            setIsSending(false)
        }
    }

    const handleFileUpload = async (file: File) => {
        setIsUploading(true)
        const formData = new FormData()
        formData.append('file', file)

        const result = await uploadTaskAttachment(task.id, formData)
        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success(`Uploaded ${file.name}`)
            
            // Refresh attachments
            const attachmentsRes = await getTaskAttachments(task.id)
            if (attachmentsRes.data) {
                setAttachments(attachmentsRes.data)
            }
            
            // Refresh comments (system log entry added)
            const { data } = await supabase
                .from('task_comments')
                .select('*, user:user_id(full_name, role)')
                .eq('task_id', task.id)
                .order('created_at', { ascending: false })
                .limit(50)
            if (data) setComments(data as Comment[])
        }
        setIsUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const getRiskBadge = (level: string | null) => {
        if (level === 'High') {
            return (
                <Badge variant="destructive" className="gap-1 shadow-sm font-mono tracking-tighter">
                    <ShieldAlert className="w-3 h-3" /> HIGH RISK
                </Badge>
            )
        }
        if (level === 'Medium') {
            return (
                <Badge variant="warning" className="gap-1 shadow-sm font-mono tracking-tighter">
                    <ShieldCheck className="w-3 h-3" /> MEDIUM RISK
                </Badge>
            )
        }
        return (
            <Badge variant="secondary" className="gap-1 text-muted-foreground bg-muted border font-mono tracking-tighter">
                <ShieldCheck className="w-3 h-3" /> LOW RISK
            </Badge>
        )
    }

    const getActionBadge = (actionType: string, changes: any) => {
        switch (actionType) {
            case 'CREATED': return <Badge variant="info" className="text-[10px]">Created</Badge>
            case 'COMPLETED': return <Badge className="bg-slate-900 text-white text-[10px]">Completed</Badge>
            case 'STATUS_CHANGE':
                if (changes && typeof changes === 'object' && 'new_status' in changes) {
                    const statusColor = getStatusColor(changes.new_status)
                    return <Badge className={`${statusColor.bar} text-white text-[10px]`}>{changes.new_status.replace(/_/g, ' ')}</Badge>
                }
                return <Badge variant="secondary" className="text-[10px]">Status Change</Badge>
            case 'ASSIGNED': return <Badge variant="secondary" className="text-[10px]">Assigned</Badge>
            case 'FORWARDED': return <Badge variant="warning" className="text-[10px]">Forwarded</Badge>
            case 'UPDATED': return <Badge variant="secondary" className="text-[10px]">Updated</Badge>
            default: return <Badge variant="secondary" className="text-[10px]">{actionType}</Badge>
        }
    }

    // Separate notes (human comments) from system logs
    const humanNotes = comments.filter(c => !c.is_system_log)
    const systemLogs = comments.filter(c => c.is_system_log)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[calc(100vw-300px)] w-full h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
                {/* Header */}
                <DialogHeader className="p-6 pb-4 border-b border-slate-100 shrink-0">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="text-sm font-mono text-muted-foreground">
                                    #{task.task_number ?? '...'}
                                </span>
                                <Badge className={`${getStatusColor(task.status).bar} text-white border-0`}>
                                    {(task.status || 'Pending').replace(/_/g, ' ')}
                                </Badge>
                                {getRiskBadge(task.risk_level)}
                            </div>
                            <DialogTitle className="text-2xl font-display font-semibold text-foreground tracking-tight">
                                {task.title}
                            </DialogTitle>
                            {task.objective && (
                                <p className="text-sm text-blue-600 mt-1">
                                    {task.objective.title}
                                </p>
                            )}
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="shrink-0">
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                </DialogHeader>

                {/* Main Content - Scrollable */}
                <div className="flex-1 overflow-y-auto">
                    <div className="p-6 space-y-6">
                        {/* Top Section: Description + Details */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Description */}
                            <div className="lg:col-span-2 space-y-2">
                                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4" /> Description
                                </h3>
                                <div className="bg-muted rounded-lg p-4 min-h-[100px]">
                                    {task.description ? (
                                        <Markdown content={task.description} className="text-sm text-foreground leading-relaxed" />
                                    ) : (
                                        <p className="text-sm text-muted-foreground italic">No description provided.</p>
                                    )}
                                </div>
                            </div>

                            {/* Details */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Details</h3>
                                <div className="bg-muted rounded-lg p-4 space-y-3">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">Start:</span>
                                        <span className="font-medium">
                                            {task.start_date ? format(new Date(task.start_date), "MMM d, yyyy") : "Not set"}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">Due:</span>
                                        <span className={cn(
                                            "font-medium",
                                            task.end_date && new Date(task.end_date) < new Date() && task.status !== 'Completed' && "text-red-600"
                                        )}>
                                            {task.end_date ? format(new Date(task.end_date), "MMM d, yyyy") : "Not set"}
                                        </span>
                                    </div>
                                    <Separator className="my-2" />
                                    <div className="flex items-start gap-2 text-sm">
                                        <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                                        <div>
                                            <span className="text-muted-foreground block mb-1">Assignee:</span>
                                            {assignees.length > 0 ? (
                                                <div className="space-y-1">
                                                    {assignees.map(a => (
                                                        <div key={a.id} className="flex items-center gap-2">
                                                            <Avatar className="h-6 w-6">
                                                                {a.role === "AI_Agent" ? (
                                                                    <AvatarImage src="/images/ai-agent-avatar.png" />
                                                                ) : a.avatar_url ? (
                                                                    <AvatarImage src={a.avatar_url} />
                                                                ) : null}
                                                                <AvatarFallback className={cn(
                                                                    "text-[10px] text-white",
                                                                    a.role === "AI_Agent" ? "bg-purple-600" : "bg-slate-600"
                                                                )}>
                                                                    {a.role === "AI_Agent" ? <Bot className="w-3 h-3" /> : getInitials(a.full_name)}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <span className="font-medium">{a.full_name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="font-medium text-muted-foreground italic">Unassigned</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Attachments Section */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                                <Paperclip className="h-4 w-4" /> Attachments
                                <Badge variant="secondary" className="text-xs">{attachments.length}</Badge>
                            </h3>
                            
                            {/* Upload Area */}
                            <div
                                className={cn(
                                    "border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer",
                                    isUploading ? "border-blue-300 bg-blue-50 cursor-wait" : isDragging ? "border-blue-500 bg-blue-50" : "border hover:border-slate-300",
                                    isUploading && "pointer-events-none"
                                )}
                                onClick={() => !isUploading && fileInputRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); if (!isUploading) setIsDragging(true) }}
                                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
                                onDrop={async (e) => {
                                    e.preventDefault()
                                    setIsDragging(false)
                                    if (isUploading) return
                                    const files = Array.from(e.dataTransfer.files)
                                    if (files.length > 0) await handleFileUpload(files[0])
                                }}
                            >
                                {isUploading ? (
                                    <div className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                                        <span className="text-blue-600 font-medium">Uploading...</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center gap-2">
                                        <Upload className="h-5 w-5 text-muted-foreground" />
                                        <span className="text-muted-foreground">Drop file here or click to upload</span>
                                    </div>
                                )}
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={async (e) => {
                                    const file = e.target.files?.[0]
                                    if (file && !isUploading) await handleFileUpload(file)
                                }}
                                disabled={isUploading}
                                className="hidden"
                            />

                            {/* Attachments List */}
                            {attachments.length > 0 && (
                                <div className="bg-muted rounded-lg p-4">
                                    <AttachmentList
                                        taskId={task.id}
                                        attachments={attachments}
                                        canDelete={true}
                                        onDelete={(id) => setAttachments(prev => prev.filter(f => f.id !== id))}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Add Note Section */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                                <MessageSquare className="h-4 w-4" /> Add Note
                            </h3>
                            <form onSubmit={handleSend} className="flex items-start gap-3">
                                <div className="flex-1">
                                    <MentionInput
                                        value={newComment}
                                        onChange={setNewComment}
                                        members={members.filter(m => m.full_name && m.email).map(m => ({
                                            id: m.id,
                                            full_name: m.full_name,
                                            email: m.email!
                                        }))}
                                        placeholder="Add a note... Use @ to mention someone"
                                        onSubmit={() => {
                                            if (newComment.trim()) {
                                                handleSend({ preventDefault: () => {} } as React.FormEvent)
                                            }
                                        }}
                                        className="text-sm min-h-[100px] resize-none"
                                    />
                                </div>
                                <Button type="submit" disabled={isSending || !newComment.trim()} className="shrink-0">
                                    {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                                    Send
                                </Button>
                            </form>
                        </div>

                        {/* Discussion Section */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                                <MessageSquare className="h-4 w-4" /> Discussion
                                <Badge variant="secondary" className="text-xs">{humanNotes.length} notes</Badge>
                            </h3>

                            {isLoading ? (
                                <div className="flex items-center justify-center py-8 text-muted-foreground">
                                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
                                </div>
                            ) : humanNotes.length === 0 ? (
                                <div className="bg-muted rounded-lg p-8 text-center">
                                    <MessageSquare className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                                    <p className="text-muted-foreground">No notes yet. Be the first to add one!</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {humanNotes.map((comment) => (
                                        <div key={comment.id} className="bg-background border border-slate-200 rounded-lg p-4">
                                            <div className="flex items-start gap-3">
                                                <Avatar className="h-8 w-8 shrink-0">
                                                    <AvatarFallback className="text-xs bg-blue-100 text-blue-700 font-medium">
                                                        {comment.user?.full_name?.substring(0, 2).toUpperCase() || 'U'}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-medium text-foreground">
                                                            {comment.user?.full_name || 'Unknown'}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                                                        </span>
                                                    </div>
                                                    <div className="text-sm text-foreground">
                                                        <MentionText 
                                                            content={comment.content} 
                                                            members={members.filter(m => m.full_name).map(m => ({
                                                                id: m.id,
                                                                full_name: m.full_name
                                                            }))}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Activity Log Section */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                                <History className="h-4 w-4" /> Activity Log
                                <Badge variant="secondary" className="text-xs">{history.length + systemLogs.length}</Badge>
                            </h3>

                            {isLoading ? (
                                <div className="flex items-center justify-center py-8 text-muted-foreground">
                                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
                                </div>
                            ) : (history.length === 0 && systemLogs.length === 0) ? (
                                <div className="bg-muted rounded-lg p-8 text-center">
                                    <History className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                                    <p className="text-muted-foreground">No activity logged yet.</p>
                                </div>
                            ) : (
                                <div className="bg-muted rounded-lg p-4">
                                    <div className="relative border-l-2 border ml-2 space-y-3">
                                        {/* Combine and sort history and system logs by date */}
                                        {[
                                            ...history.map(h => ({ type: 'history' as const, item: h, date: new Date(h.created_at || 0) })),
                                            ...systemLogs.map(s => ({ type: 'log' as const, item: s, date: new Date(s.created_at) }))
                                        ]
                                            .sort((a, b) => b.date.getTime() - a.date.getTime())
                                            .slice(0, 20)
                                            .map((entry, i) => (
                                                <div key={`${entry.type}-${entry.type === 'history' ? entry.item.id : entry.item.id}`} className="relative pl-6">
                                                    <div className={cn(
                                                        "absolute -left-[5px] top-1.5 h-2 w-2 rounded-full",
                                                        entry.type === 'history' ? "bg-slate-400" : "bg-blue-400"
                                                    )} />
                                                    {entry.type === 'history' ? (
                                                        <div className="flex items-center gap-2 flex-wrap text-sm">
                                                            <span className="text-xs font-mono text-muted-foreground">
                                                                {format(entry.date, 'MMM d, HH:mm')}
                                                            </span>
                                                            {getActionBadge((entry.item as TaskHistoryItem).action_type, (entry.item as TaskHistoryItem).changes)}
                                                            <span className="text-xs text-muted-foreground">
                                                                by {(entry.item as TaskHistoryItem).user?.full_name || 'Unknown'}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm">
                                                            <div className="flex items-center gap-2 mb-0.5">
                                                                <span className="text-xs font-mono text-muted-foreground">
                                                                    {format(entry.date, 'MMM d, HH:mm')}
                                                                </span>
                                                                <Badge variant="secondary" className="text-[10px] bg-muted">System</Badge>
                                                            </div>
                                                            <p className="text-xs text-muted-foreground">
                                                                {(entry.item as Comment).content}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
