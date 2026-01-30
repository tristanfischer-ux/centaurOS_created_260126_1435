"use client"

import { useEffect, useState, useRef, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { formatDistanceToNow } from "date-fns"
import { Loader2, Send, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MentionInput } from "@/components/ui/mention-input"
import { MentionText } from "@/components/ui/mention-text"
import { AttachmentList } from "@/components/tasks/attachment-list"
import { addTaskComment, getTaskAttachments } from "@/actions/tasks"
import { uploadTaskAttachment } from "@/actions/attachments"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface Member {
    id: string
    full_name: string | null
    role: string | null
    email?: string
}

interface Comment {
    id: string
    content: string
    is_system_log: boolean
    created_at: string
    user_id: string
    user?: { full_name: string; role: string }
}

interface InlineThreadProps {
    taskId: string
    isOpen: boolean
    onClose: () => void
    members: Member[]
}

export function InlineThread({ taskId, isOpen, onClose, members }: InlineThreadProps) {
    const [comments, setComments] = useState<Comment[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [newComment, setNewComment] = useState("")
    const [isSending, setIsSending] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [attachments, setAttachments] = useState<any[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)
    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true)
            
            // Fetch comments (only human notes, not system logs)
            const { data, error } = await supabase
                .from('task_comments')
                .select('*, user:user_id(full_name, role)')
                .eq('task_id', taskId)
                .eq('is_system_log', false)
                .order('created_at', { ascending: false })
                .limit(10)

            if (!error && data) {
                setComments(data as Comment[])
            }

            // Fetch attachments
            const attachmentsRes = await getTaskAttachments(taskId)
            if (attachmentsRes.data) {
                setAttachments(attachmentsRes.data)
            }
            
            setIsLoading(false)
        }

        if (isOpen && taskId) {
            fetchData()
        }
    }, [isOpen, taskId, supabase])

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newComment.trim()) return

        setIsSending(true)
        try {
            const result = await addTaskComment(taskId, newComment)
            if (result?.error) {
                toast.error(result.error)
            } else {
                setNewComment("")
                const { data } = await supabase
                    .from('task_comments')
                    .select('*, user:user_id(full_name, role)')
                    .eq('task_id', taskId)
                    .eq('is_system_log', false)
                    .order('created_at', { ascending: false })
                    .limit(10)
                if (data) setComments(data as Comment[])
            }
        } finally {
            setIsSending(false)
        }
    }

    const handleFileUpload = async (file: File) => {
        setIsUploading(true)
        const formData = new FormData()
        formData.append('file', file)

        const result = await uploadTaskAttachment(taskId, formData)
        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success(`Uploaded ${file.name}`)
            
            // Refresh both comments and attachments
            const { data } = await supabase
                .from('task_comments')
                .select('*, user:user_id(full_name, role)')
                .eq('task_id', taskId)
                .eq('is_system_log', false)
                .order('created_at', { ascending: false })
                .limit(10)
            setComments((data || []) as Comment[])
            
            const attachmentsRes = await getTaskAttachments(taskId)
            if (attachmentsRes.data) {
                setAttachments(attachmentsRes.data)
            }
        }
        setIsUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    if (!isOpen) return null

    return (
        <div className="border-t border bg-white">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-muted">
                <div>
                    <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                        Notes
                    </h4>
                    <p className="text-[10px] text-muted-foreground">{comments.length} {comments.length === 1 ? 'note' : 'notes'}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Comments and Attachments */}
            <div className="max-h-48 overflow-y-auto p-3 space-y-3">
                {isLoading ? (
                    <div className="flex items-center justify-center py-4 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...
                    </div>
                ) : (
                    <>
                        {/* Attachments Section */}
                        {attachments.length > 0 && (
                            <div className="pb-3 border-b border-slate-100">
                                <AttachmentList
                                    taskId={taskId}
                                    attachments={attachments}
                                    canDelete={false}
                                    onDelete={(id) => setAttachments(prev => prev.filter(f => f.id !== id))}
                                />
                            </div>
                        )}
                        
                        {/* Notes Section */}
                        {comments.length === 0 && attachments.length === 0 ? (
                            <p className="text-center text-muted-foreground py-4 text-xs">No notes yet</p>
                        ) : (
                            comments.map((comment) => (
                                <div key={comment.id} className="flex gap-2 text-xs">
                                    <div className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 bg-blue-100 text-blue-700">
                                        {comment.user?.full_name?.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="font-medium text-foreground truncate">
                                                {comment.user?.full_name}
                                            </span>
                                            <span className="text-muted-foreground whitespace-nowrap">
                                                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                                            </span>
                                        </div>
                                        <div className="text-muted-foreground">
                                            <MentionText 
                                                content={comment.content} 
                                                members={members.filter(m => m.full_name !== null).map(m => ({
                                                    id: m.id,
                                                    full_name: m.full_name!
                                                }))}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}
            </div>

            {/* Input area */}
            <div className="p-3 border-t border-slate-100 space-y-2 relative overflow-hidden">
                <div
                    className={cn(
                        "border border-dashed rounded p-2 text-center transition-colors text-xs relative",
                        isUploading ? "border-blue-300 bg-blue-50 cursor-wait" : isDragging ? "border-blue-500 bg-blue-50 cursor-pointer" : "border hover:border-slate-300 cursor-pointer",
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
                        <>
                            <Loader2 className="h-3 w-3 mx-auto text-blue-600 mb-1 animate-spin" />
                            <span className="text-blue-600 font-medium">Uploading...</span>
                        </>
                    ) : (
                        <>
                            <Upload className="h-3 w-3 mx-auto text-muted-foreground mb-1" />
                            <span className="text-muted-foreground">Drop file or click</span>
                        </>
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
                <form onSubmit={handleSend} className="flex items-start gap-2 w-full relative overflow-hidden">
                    <MentionInput
                        value={newComment}
                        onChange={setNewComment}
                        members={members.filter(m => m.full_name && m.email).map(m => ({
                            id: m.id,
                            full_name: m.full_name!,
                            email: m.email!
                        }))}
                        placeholder="Add note... @ to mention"
                        onSubmit={() => {
                            if (newComment.trim()) {
                                handleSend({ preventDefault: () => {} } as React.FormEvent)
                            }
                        }}
                        className="text-sm min-h-[60px] resize-none"
                    />
                    <Button type="submit" size="sm" disabled={isSending || !newComment.trim()} className="h-10 w-10 p-0 shrink-0">
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                </form>
            </div>
        </div>
    )
}
