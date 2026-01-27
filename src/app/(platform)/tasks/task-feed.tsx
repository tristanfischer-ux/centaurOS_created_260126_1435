"use client"

import { useState } from "react"
import { Database } from "@/types/database.types"
import { addTaskComment } from "@/actions/tasks"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Loader2, Send } from "lucide-react"

type Comment = Database["public"]["Tables"]["task_comments"]["Row"]

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
        <div className="flex flex-col h-full bg-foundry-900 border-l border-foundry-800">
            <div className="p-4 border-b border-foundry-800">
                <h3 className="font-semibold text-white">Activity Log</h3>
            </div>

            <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                    {comments.map((comment) => {
                        const isSystem = comment.is_system_log
                        const isMe = comment.user_id === currentUserId

                        if (isSystem) {
                            return (
                                <div key={comment.id} className="flex justify-center my-2">
                                    <span className="text-[10px] text-gray-500 bg-foundry-800 px-2 py-1 rounded-full uppercase tracking-wider">
                                        {comment.content}
                                    </span>
                                </div>
                            )
                        }

                        return (
                            <div key={comment.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                                <Avatar className="h-8 w-8">
                                    <AvatarFallback className="text-xs bg-foundry-700 text-gray-300">
                                        {isMe ? "ME" : "U"}
                                    </AvatarFallback>
                                </Avatar>
                                <div className={`flex flex-col max-w-[80%] ${isMe ? 'items-end' : 'items-start'}`}>
                                    <div className={`p-3 rounded-lg text-sm ${isMe ? 'bg-accent text-foundry-950' : 'bg-foundry-800 text-gray-200'}`}>
                                        {comment.content}
                                    </div>
                                    <span className="text-[10px] text-gray-600 mt-1">
                                        {new Date(comment.created_at!).toLocaleTimeString()}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                    {comments.length === 0 && (
                        <div className="text-center text-gray-500 text-sm py-4">No activity yet.</div>
                    )}
                </div>
            </ScrollArea>

            <form onSubmit={handleSubmit} className="p-4 border-t border-foundry-800 flex gap-2">
                <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Type a message..."
                    className="bg-foundry-950 border-foundry-800 min-h-[40px] max-h-[100px]"
                />
                <Button size="icon" type="submit" disabled={loading || !content.trim()} className="h-auto">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
            </form>
        </div>
    )
}
