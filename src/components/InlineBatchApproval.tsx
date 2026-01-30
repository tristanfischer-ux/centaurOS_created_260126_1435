'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Check, X, AlertTriangle, Loader2, CheckCircle2, XCircle, ChevronDown, ClipboardList } from 'lucide-react'
import { getPendingApprovals, batchApproveTasks, batchRejectTasks, approveTask } from '@/actions/tasks'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { getStatusBadgeClass } from '@/lib/status-colors'

interface Task {
    id: string
    title: string
    description: string | null
    status: string | null
    risk_level: string | null
    created_at: string | null
    end_date: string | null
    assignee: { id: string; full_name: string | null; role: string } | null
    objective: { id: string; title: string } | null
    creator: { id: string; full_name: string | null } | null
}


interface InlineBatchApprovalProps {
    onApprovalComplete?: () => void
}

export function InlineBatchApproval({ onApprovalComplete }: InlineBatchApprovalProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [tasks, setTasks] = useState<Task[]>([])
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [isLoading, setIsLoading] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
    const [rejectReason, setRejectReason] = useState('')

    const loadTasks = useCallback(async () => {
        setIsLoading(true)
        const result = await getPendingApprovals()
        if (result.error) {
            toast.error(result.error)
        } else {
            setTasks(result.data as Task[])
        }
        setIsLoading(false)
    }, [])

    useEffect(() => {
        loadTasks()
    }, [loadTasks])

    useEffect(() => {
        if (isExpanded) {
            loadTasks()
        }
    }, [isExpanded, loadTasks])

    const toggleSelection = (taskId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(taskId)) {
                next.delete(taskId)
            } else {
                next.add(taskId)
            }
            return next
        })
    }

    const selectAll = () => {
        if (selectedIds.size === tasks.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(tasks.map(t => t.id)))
        }
    }

    const handleQuickApprove = async (taskId: string) => {
        startTransition(async () => {
            const result = await approveTask(taskId)
            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success('Task approved!')
                setTasks(prev => prev.filter(t => t.id !== taskId))
                selectedIds.delete(taskId)
                setSelectedIds(new Set(selectedIds))
                onApprovalComplete?.()
            }
        })
    }

    const handleBatchApprove = async () => {
        if (selectedIds.size === 0) {
            toast.error('Select at least one task')
            return
        }

        startTransition(async () => {
            const result = await batchApproveTasks(Array.from(selectedIds))
            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success(`${result.approvedCount} tasks approved!`)
                setTasks(prev => prev.filter(t => !selectedIds.has(t.id)))
                setSelectedIds(new Set())
                onApprovalComplete?.()
            }
        })
    }

    const handleBatchReject = async () => {
        if (selectedIds.size === 0 || !rejectReason.trim()) return

        startTransition(async () => {
            const result = await batchRejectTasks(Array.from(selectedIds), rejectReason)
            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success(`${result.rejectedCount} tasks sent back for revision`)
                setTasks(prev => prev.filter(t => !selectedIds.has(t.id)))
                setSelectedIds(new Set())
                setRejectDialogOpen(false)
                setRejectReason('')
                onApprovalComplete?.()
            }
        })
    }

    if (tasks.length === 0 && !isLoading) {
        return null // Don't show widget if no pending approvals
    }

    return (
        <div className="rounded-lg shadow-sm bg-white overflow-hidden">
            {/* Header - clickable to expand/collapse */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-amber-50">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                    </div>
                    <div className="text-left">
                        <h3 className="font-semibold text-foreground">Pending Approvals</h3>
                        <p className="text-sm text-muted-foreground">
                            {tasks.length} task{tasks.length !== 1 ? 's' : ''} waiting
                        </p>
                    </div>
                </div>
                <ChevronDown className={cn(
                    "h-5 w-5 text-muted-foreground transition-transform duration-200",
                    isExpanded && "rotate-180"
                )} />
            </button>

            {/* Expanded Content */}
            <div className={cn(
                "grid transition-all duration-300 ease-in-out",
                isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            )}>
                <div className="overflow-hidden">
                    <div className="border-t border-slate-100">
                        {/* Batch Actions Bar */}
                        {tasks.length > 0 && (
                            <div className="flex items-center justify-between px-4 py-2 bg-slate-50">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="select-all-inline"
                                        checked={selectedIds.size === tasks.length && tasks.length > 0}
                                        onCheckedChange={selectAll}
                                    />
                                    <label htmlFor="select-all-inline" className="text-xs text-muted-foreground cursor-pointer">
                                        {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                                    </label>
                                </div>
                                {selectedIds.size > 0 && (
                                    <div className="flex gap-1">
                                        <Button
                                            size="sm"
                                            onClick={handleBatchApprove}
                                            disabled={isPending}
                                            className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                                        >
                                            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                                            Approve
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => setRejectDialogOpen(true)}
                                            disabled={isPending}
                                            className="h-7 text-xs"
                                        >
                                            <XCircle className="h-3 w-3 mr-1" />
                                            Reject
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Task List */}
                        <div className="max-h-80 overflow-y-auto">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-20">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {tasks.map(task => {
                                        const isSelected = selectedIds.has(task.id)
                                        return (
                                            <div
                                                key={task.id}
                                                className={cn(
                                                    'p-3 transition-colors',
                                                    isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                                                )}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <Checkbox
                                                        checked={isSelected}
                                                        onCheckedChange={() => toggleSelection(task.id)}
                                                        className="mt-0.5"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <h4 className="font-medium text-sm text-foreground truncate">
                                                                {task.title}
                                                            </h4>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => handleQuickApprove(task.id)}
                                                                disabled={isPending}
                                                                className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 shrink-0"
                                                            >
                                                                <Check className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            {task.assignee && (
                                                                <div className="flex items-center gap-1">
                                                                    <UserAvatar
                                                                        name={task.assignee.full_name}
                                                                        role={task.assignee.role}
                                                                        size="xs"
                                                                    />
                                                                    <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                                                                        {task.assignee.full_name}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {task.risk_level === 'High' && (
                                                                <Badge variant="destructive" className="text-[10px] px-1 py-0">
                                                                    High Risk
                                                                </Badge>
                                                            )}
                                                            {task.created_at && (
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Batch Reject Dialog */}
            <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
                <DialogContent className="sm:max-w-[425px] bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900">Reject Tasks</DialogTitle>
                        <DialogDescription>
                            Provide a reason for rejecting {selectedIds.size} task{selectedIds.size !== 1 ? 's' : ''}.
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Enter rejection reason..."
                        className="min-h-[100px] bg-white border-slate-200"
                    />
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={handleBatchReject}
                            disabled={isPending || !rejectReason.trim()}
                        >
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                            Reject
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
