"use client"

import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
    SheetClose,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { useEffect, useState } from "react"
import { getTaskHistory } from "@/actions/tasks"
import { Loader2, History } from "lucide-react"
import { Database } from "@/types/database.types"
import { getStatusColor } from "@/lib/status-colors"

interface HistoryDrawerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    taskId: string
    taskTitle: string
}

type TaskHistoryItem = Database['public']['Tables']['task_history']['Row'] & {
    user: {
        full_name: string | null
        email: string
        role?: string | null
        avatar_url?: string | null
    } | null
}

function isTaskHistoryItemArray(data: unknown): data is TaskHistoryItem[] {
    if (!Array.isArray(data)) return false
    return data.every(item => 
        typeof item === 'object' && 
        item !== null &&
        'id' in item &&
        'task_id' in item &&
        'action_type' in item
    )
}

export function HistoryDrawer({ open, onOpenChange, taskId, taskTitle }: HistoryDrawerProps) {
    const [history, setHistory] = useState<TaskHistoryItem[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        let mounted = true
        if (open) {
            // Delay setting loading to avoid synchronous update warning
            const timer = setTimeout(() => {
                if (mounted) setLoading(true)
            }, 0)

            getTaskHistory(taskId).then((res) => {
                if (mounted) {
                    if (res.data && isTaskHistoryItemArray(res.data)) {
                        setHistory(res.data)
                    }
                    setLoading(false)
                }
            })
            return () => {
                mounted = false
                clearTimeout(timer)
            }
        }
    }, [open, taskId])

    const getActionBadges = (item: TaskHistoryItem) => {
        switch (item.action_type) {
            case 'CREATED': return <Badge variant="info">Created</Badge>
            case 'COMPLETED': return <Badge className="bg-slate-900 border-slate-900 text-white hover:bg-slate-800">Completed</Badge>
            case 'STATUS_CHANGE':
                if (item.changes && typeof item.changes === 'object' && 'new_status' in item.changes) {
                    const changes = item.changes as { new_status?: string }
                    if (changes.new_status) {
                        const statusColor = getStatusColor(changes.new_status)
                        return <Badge className={`${statusColor.bar} hover:opacity-90 border-0 text-white`}>{changes.new_status.replace(/_/g, ' ')}</Badge>
                    }
                }
                return <Badge variant="secondary">Status Change</Badge>
            case 'ASSIGNED': return <Badge variant="secondary">Assigned</Badge>
            case 'FORWARDED': return <Badge variant="warning">Forwarded</Badge>
            case 'UPDATED': return <Badge variant="outline">Updated</Badge>
            default: return <Badge variant="outline">{item.action_type}</Badge>
        }
    }

    const renderChanges = (changes: unknown) => {
        if (!changes || typeof changes !== 'object' || Object.keys(changes).length === 0) return null

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const changeObj = changes as Record<string, any>

        return (
            <div className="mt-2 space-y-1">
                {Object.entries(changeObj).map(([key, value]) => {
                    if (key === 'initial_status' || key === 'source') return null
                    // Skip some fields if too verbose
                    return (
                        <div key={key} className="text-xs text-slate-500 flex flex-wrap items-center gap-1">
                            <span className="font-medium text-slate-700 capitalize">{key.replace(/_/g, ' ')}:</span>
                            {typeof value === 'object' && value !== null ? (
                                // Handle nested objects like dates
                                <span>{JSON.stringify(value)}</span>
                            ) : (
                                <span>{String(value)}</span>
                            )}
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-0">
                <SheetHeader className="p-6 border-b">
                    <SheetTitle className="flex items-center gap-2">
                        <History className="w-5 h-5 text-slate-500" />
                        History: {taskTitle}
                    </SheetTitle>
                    <SheetDescription>Audit log of all actions performed on this task.</SheetDescription>
                </SheetHeader>

                <ScrollArea className="flex-1 px-6">
                    {loading ? (
                        <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6 text-slate-400" /></div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 text-sm">No history recorded yet.</div>
                    ) : (
                        <div className="relative border-l border-slate-200 ml-2 my-6 space-y-8">
                            {history.map((item) => (
                                <div key={item.id} className="relative pl-6">
                                    {/* Dot on timeline */}
                                    <div className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-300 border-2 border-white ring-1 ring-slate-100" />

                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2 justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-slate-400">
                                                    {item.created_at && format(new Date(item.created_at), 'MMM d, HH:mm')}
                                                </span>
                                                {getActionBadges(item)}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 mt-1">
                                            <Avatar className="h-5 w-5 border border-slate-100">
                                                <AvatarImage src={`https://avatar.vercel.sh/${item.user?.email || 'user'}`} />
                                                <AvatarFallback className="text-[9px]">{item.user?.full_name?.substring(0, 2) || "??"}</AvatarFallback>
                                            </Avatar>
                                            <span className="text-sm font-medium text-slate-900">
                                                {item.user?.full_name || 'Unknown User'}
                                            </span>
                                        </div>

                                        <div className="bg-slate-50 rounded-md p-2 mt-1 border border-slate-100 text-sm">
                                            {renderChanges(item.changes)}
                                            {/* Handle specifics for better readability */}
                                            {item.action_type === 'CREATED' && <div className="text-xs text-slate-500">Task created.</div>}
                                            {item.action_type === 'COMPLETED' && <div className="text-xs text-slate-700 font-medium">Task marked as complete.</div>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                <SheetFooter className="p-6 border-t mt-auto">
                    <SheetClose asChild>
                        <Button variant="outline">Close</Button>
                    </SheetClose>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    )
}
