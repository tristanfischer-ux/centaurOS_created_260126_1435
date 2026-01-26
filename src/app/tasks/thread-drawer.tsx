"use client"

import { useEffect, useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { createClient } from "@/lib/supabase/client"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatDistanceToNow } from "date-fns"
import { Loader2, Send } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { addTaskComment } from "@/actions/tasks"
import { toast } from "sonner"

interface ThreadDrawerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    taskId: string
    taskTitle: string
}

interface Comment {
    id: string
    content: string
    is_system_log: boolean
    created_at: string
    user_id: string
    user?: { full_name: string; role: string }
}

export function ThreadDrawer({ open, onOpenChange, taskId, taskTitle }: ThreadDrawerProps) {
    const [comments, setComments] = useState<Comment[]>([])
    const [loading, setLoading] = useState(true)
    const [newComment, setNewComment] = useState("")
    const [sending, setSending] = useState(false)
    const supabase = createClient()

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

        if (open) {
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
            // We need to re-fetch here. Since fetchComments is inside useEffect, we can't call it. 
            // Better to trigger a re-fetch via a dependency or just duplicate the simple fetch logic here for responsiveness.
            // Actually, let's just cheat and flip a "refresh" trigger or refactor. 
            // Refactoring to keep it clean:
            const { data } = await supabase
                .from('task_comments')
                .select('*, user:user_id(full_name, role)')
                .eq('task_id', taskId)
                .order('created_at', { ascending: true })
            if (data) setComments(data as Comment[])
        }
        setSending(false)
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-[400px] sm:w-[540px] flex flex-col h-full">
                <SheetHeader>
                    <SheetTitle>Task Thread</SheetTitle>
                    <SheetDescription>History for &quot;{taskTitle}&quot;</SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-hidden mt-6 relative">
                    {loading ? (
                        <div className="flex items-center justify-center h-full text-slate-400">
                            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading history...
                        </div>
                    ) : (
                        <ScrollArea className="h-[calc(100vh-200px)] pr-4">
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

                <div className="pt-4 border-t border-slate-100 mt-auto">
                    <form onSubmit={handleSend} className="flex gap-2">
                        <Input
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Type a note..."
                            disabled={sending}
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
