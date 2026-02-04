"use client"

import { useState } from "react"
import { Database } from "@/types/database.types"
import { addTaskComment } from "@/actions/tasks"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Loader2, Send, Inbox } from "lucide-react"

type Comment = Database["public"]["Tables"]["task_comments"]["Row"]

/**
 * Strip sync marker metadata from comment content for display.
 * Removes the "_[Synced from conversation - Message ID: xyz]_" suffix.
 */
function stripSyncMarker(content: string): string {
    return content.replace(/\n\n_\[Synced from conversation.*?\]_$/s, '')
}

/**
 * Check if a comment was synced from the inbox/messaging system.
 */
function isFromInbox(content: string): boolean {
    return content.includes('[Synced from conversation')
}

export function TaskFeed({ taskId, comments, currentUserId }: { taskId: string, comments: Comment[], currentUserId: string }) {
    const [content, setContent] = useState("")
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!content.trim()) return

        setLoading(true)
        await addTaskComment(taskId, content)
        setContent("")
        setLoading(false)
    }

    return (
        <div className="flex flex-col h-full bg-background border-l border">
            <div className="p-4 border-b border">
                <h3 className="font-semibold text-foreground">Activity Log</h3>
            </div>

            <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                    {comments.map((comment) => {
                        const isSystem = comment.is_system_log
                        const isMe = comment.user_id === currentUserId
                        const fromInbox = isFromInbox(comment.content)
                        const displayContent = stripSyncMarker(comment.content)

                        if (isSystem) {
                            return (
                                <div key={comment.id} className="flex justify-center my-2">
                                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded-full uppercase tracking-wider">
                                        {displayContent}
                                    </span>
                                </div>
                            )
                        }

                        return (
                            <div key={comment.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                                <UserAvatar 
                                    name={isMe ? "ME" : "User"}
                                    role={undefined}
                                    size="md"
                                />
                                <div className={`flex flex-col max-w-[80%] ${isMe ? 'items-end' : 'items-start'}`}>
                                    {fromInbox && (
                                        <Badge variant="secondary" className="text-xs mb-1 gap-1">
                                            <Inbox className="h-3 w-3" />
                                            From Inbox
                                        </Badge>
                                    )}
                                    <div className={`p-3 rounded-lg text-sm ${isMe ? 'bg-accent text-accent-foreground' : 'bg-muted text-foreground'}`}>
                                        {displayContent}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground mt-1">
                                        {new Date(comment.created_at!).toLocaleTimeString()}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                    {comments.length === 0 && (
                        <div className="text-center text-muted-foreground text-sm py-4">No activity yet.</div>
                    )}
                </div>
            </ScrollArea>

            <form onSubmit={handleSubmit} className="p-4 border-t border flex gap-2">
                <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Type a message..."
                    className="bg-card border min-h-[40px] max-h-[100px]"
                />
                <Button size="icon" type="submit" disabled={loading || !content.trim()} className="h-auto">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
            </form>
        </div>
    )
}
