"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { getTaskHistory } from "@/actions/tasks"
import { Loader2, X } from "lucide-react"
import { Database } from "@/types/database.types"
import { getStatusColor } from "@/lib/status-colors"

interface InlineHistoryProps {
    taskId: string
    isOpen: boolean
    onClose: () => void
}

type TaskHistoryItem = Database['public']['Tables']['task_history']['Row'] & {
    user: {
        full_name: string | null
        email?: string | null
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

export function InlineHistory({ taskId, isOpen, onClose }: InlineHistoryProps) {
    const [history, setHistory] = useState<TaskHistoryItem[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        let mounted = true
        if (isOpen) {
            setLoading(true)
            getTaskHistory(taskId).then((res) => {
                if (mounted) {
                    if (res.data && isTaskHistoryItemArray(res.data)) {
                        setHistory(res.data.slice(0, 5)) // Only show recent 5
                    }
                    setLoading(false)
                }
            })
            return () => { mounted = false }
        }
    }, [isOpen, taskId])

    const getActionBadge = (item: TaskHistoryItem) => {
        switch (item.action_type) {
            case 'CREATED': return <Badge variant="info" className="text-[10px]">Created</Badge>
            case 'COMPLETED': return <Badge className="bg-accent text-white text-[10px]">Completed</Badge>
            case 'STATUS_CHANGE':
                if (item.changes && typeof item.changes === 'object' && 'new_status' in item.changes) {
                    const changes = item.changes as { new_status?: string }
                    if (changes.new_status) {
                        const statusColor = getStatusColor(changes.new_status)
                        return <Badge className={`${statusColor.bar} text-white text-[10px]`}>{changes.new_status.replace(/_/g, ' ')}</Badge>
                    }
                }
                return <Badge variant="secondary" className="text-[10px]">Status Change</Badge>
            case 'ASSIGNED': return <Badge variant="secondary" className="text-[10px]">Assigned</Badge>
            case 'FORWARDED': return <Badge variant="warning" className="text-[10px]">Forwarded</Badge>
            case 'UPDATED': return <Badge variant="secondary" className="text-[10px]">Updated</Badge>
            default: return <Badge variant="secondary" className="text-[10px]">{item.action_type}</Badge>
        }
    }

    if (!isOpen) return null

    return (
        <div className="border-t border bg-white">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-muted">
                <div>
                    <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                        Audit Log
                    </h4>
                    <p className="text-[10px] text-muted-foreground">Status changes & activity</p>
                </div>
                <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Timeline */}
            <div className="max-h-48 overflow-y-auto p-3">
                {loading ? (
                    <div className="flex items-center justify-center py-4 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...
                    </div>
                ) : history.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4 text-xs">No history yet</p>
                ) : (
                    <div className="relative border-l border ml-1 space-y-3">
                        {history.map((item) => (
                            <div key={item.id} className="relative pl-4">
                                <div className="absolute -left-[3px] top-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-mono text-muted-foreground">
                                        {item.created_at && format(new Date(item.created_at), 'MMM d, HH:mm')}
                                    </span>
                                    {getActionBadge(item)}
                                    <span className="text-xs text-muted-foreground">
                                        by {item.user?.full_name || 'Unknown'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
