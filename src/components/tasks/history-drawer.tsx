"use client"

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { UserAvatar } from "@/components/ui/user-avatar"
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
            case 'COMPLETED': return <Badge className="bg-accent border-accent text-white hover:bg-accent/90">Completed</Badge>
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
            case 'UPDATED': return <Badge variant="secondary">Updated</Badge>
            default: return <Badge variant="secondary">{item.action_type}</Badge>
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
                    return (
                        <div key={key} className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
                            <span className="font-medium text-foreground capitalize">{key.replace(/_/g, ' ')}:</span>
                            {typeof value === 'object' && value !== null ? (
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
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="md" className="max-h-[90dvh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-foreground">
                        <History className="w-5 h-5 text-muted-foreground" />
                        History: {taskTitle}
                    </DialogTitle>
                    <DialogDescription>Audit log of all actions performed on this task.</DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1 min-h-0 px-1">
                    {loading ? (
                        <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">No history recorded yet.</div>
                    ) : (
                        <div className="relative border-l border-border ml-2 my-6 space-y-8">
                            {history.map((item) => (
                                <div key={item.id} className="relative pl-6">
                                    <div className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-muted-foreground/50 border-2 border-card" />

                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2 justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-muted-foreground">
                                                    {item.created_at && format(new Date(item.created_at), 'MMM d, HH:mm')}
                                                </span>
                                                {getActionBadges(item)}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 mt-1">
                                            <UserAvatar
                                                name={item.user?.full_name || null}
                                                role={item.user?.role || null}
                                                avatarUrl={item.user?.avatar_url || null}
                                                size="sm"
                                                className="border border-border"
                                            />
                                            <span className="text-sm font-medium text-foreground">
                                                {item.user?.full_name || 'Unknown User'}
                                            </span>
                                        </div>

                                        <div className="bg-muted/50 p-2 mt-1 border border-border text-sm">
                                            {renderChanges(item.changes)}
                                            {item.action_type === 'CREATED' && <div className="text-xs text-muted-foreground">Task created.</div>}
                                            {item.action_type === 'COMPLETED' && <div className="text-xs text-foreground font-medium">Task marked as complete.</div>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                <DialogFooter>
                    <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
