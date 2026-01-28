'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Check, X, AlertTriangle, Loader2, CheckCircle2, XCircle, ClipboardList } from 'lucide-react'
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

function getInitials(name: string | null) {
    if (!name) return '??'
    return name
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
}

interface BatchApprovalSheetProps {
    onApprovalComplete?: () => void
    trigger?: React.ReactNode
}

export function BatchApprovalSheet({ onApprovalComplete, trigger }: BatchApprovalSheetProps) {
    const [open, setOpen] = useState(false)
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
        if (open) {
            loadTasks()
        }
    }, [open, loadTasks])

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
        if (selectedIds.size === 0) {
            toast.error('Select at least one task')
            return
        }

        if (!rejectReason.trim()) {
            toast.error('Please provide a rejection reason')
            return
        }

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

    const pendingCount = tasks.length

    return (
        <>
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                    {trigger || (
                        <Button variant="outline" size="sm" className="relative">
                            <ClipboardList className="h-4 w-4 mr-2" />
                            Approvals
                            {pendingCount > 0 && (
                                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs font-medium rounded-full h-5 w-5 flex items-center justify-center">
                                    {pendingCount > 9 ? '9+' : pendingCount}
                                </span>
                            )}
                        </Button>
                    )}
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:w-[500px] md:w-[600px] flex flex-col bg-white">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2 text-slate-900">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Pending Approvals
                        </SheetTitle>
                        <SheetDescription>
                            {tasks.length} task{tasks.length !== 1 ? 's' : ''} waiting for your approval
                        </SheetDescription>
                    </SheetHeader>

                    {/* Batch Actions Bar */}
                    {tasks.length > 0 && (
                        <div className="flex items-center justify-between py-3 border-b border-slate-200">
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="select-all"
                                    checked={selectedIds.size === tasks.length && tasks.length > 0}
                                    onCheckedChange={selectAll}
                                />
                                <label htmlFor="select-all" className="text-sm text-slate-600 cursor-pointer">
                                    {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                                </label>
                            </div>
                            {selectedIds.size > 0 && (
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        onClick={handleBatchApprove}
                                        disabled={isPending}
                                        className="bg-green-600 hover:bg-green-700 text-white"
                                    >
                                        {isPending ? (
                                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                        ) : (
                                            <CheckCircle2 className="h-4 w-4 mr-1" />
                                        )}
                                        Approve ({selectedIds.size})
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => setRejectDialogOpen(true)}
                                        disabled={isPending}
                                    >
                                        <XCircle className="h-4 w-4 mr-1" />
                                        Reject
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Task List */}
                    <ScrollArea className="flex-1 -mx-6 px-6">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-40">
                                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                            </div>
                        ) : tasks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-center">
                                <CheckCircle2 className="h-12 w-12 text-green-500 mb-2" />
                                <p className="text-slate-600 font-medium">All caught up!</p>
                                <p className="text-slate-400 text-sm">No tasks pending approval</p>
                            </div>
                        ) : (
                            <div className="space-y-3 py-4">
                                {tasks.map(task => {
                                    const isSelected = selectedIds.has(task.id)
                                    const assignee = task.assignee
                                    const objective = task.objective

                                    return (
                                        <div
                                            key={task.id}
                                            className={cn(
                                                'p-4 rounded-lg border transition-all',
                                                isSelected
                                                    ? 'border-blue-500 bg-blue-50/50'
                                                    : 'border-slate-200 hover:border-slate-300 bg-white'
                                            )}
                                        >
                                            <div className="flex items-start gap-3">
                                                <Checkbox
                                                    checked={isSelected}
                                                    onCheckedChange={() => toggleSelection(task.id)}
                                                    className="mt-1"
                                                />
                                                
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="font-medium text-slate-900 truncate">
                                                                {task.title}
                                                            </h4>
                                                            {objective && (
                                                                <p className="text-xs text-slate-500 truncate mt-0.5">
                                                                    Objective: {objective.title}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <Badge className={getStatusBadgeClass(task.status || '')}>
                                                            {task.status?.replace(/_/g, ' ')}
                                                        </Badge>
                                                    </div>

                                                    {task.description && (
                                                        <p className="text-sm text-slate-600 mt-2 line-clamp-2">
                                                            {task.description}
                                                        </p>
                                                    )}

                                                    <div className="flex items-center justify-between mt-3">
                                                        <div className="flex items-center gap-2">
                                                            {assignee && (
                                                                <div className="flex items-center gap-1.5">
                                                                    <Avatar className="h-8 w-8">
                                                                        <AvatarFallback className="text-xs bg-slate-100 text-slate-600">
                                                                            {getInitials(assignee.full_name)}
                                                                        </AvatarFallback>
                                                                    </Avatar>
                                                                    <span className="text-xs text-slate-500">
                                                                        {assignee.full_name}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {task.risk_level === 'High' && (
                                                                <Badge variant="destructive" className="text-xs">
                                                                    High Risk
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        
                                                        <div className="flex items-center gap-2">
                                                            {task.created_at && (
                                                                <span className="text-xs text-slate-400">
                                                                    {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                                                                </span>
                                                            )}
                                                            
                                                            {/* Quick Approve Button */}
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => handleQuickApprove(task.id)}
                                                                disabled={isPending}
                                                                className="h-8 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                                            >
                                                                <Check className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </ScrollArea>

                    {/* Footer */}
                    {tasks.length > 0 && (
                        <div className="pt-4 border-t border-slate-200 mt-auto">
                            <div className="flex items-center justify-between text-sm text-slate-500">
                                <span>
                                    {selectedIds.size > 0 
                                        ? `${selectedIds.size} of ${tasks.length} selected`
                                        : `${tasks.length} task${tasks.length !== 1 ? 's' : ''} pending`
                                    }
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={loadTasks}
                                    disabled={isLoading}
                                >
                                    Refresh
                                </Button>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            {/* Batch Reject Dialog */}
            <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
                <DialogContent className="sm:max-w-[425px] bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900">Reject Tasks</DialogTitle>
                        <DialogDescription>
                            Provide a reason for rejecting {selectedIds.size} task{selectedIds.size !== 1 ? 's' : ''}.
                            They will be sent back for revision.
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Enter rejection reason..."
                        className="min-h-[100px] bg-white border-slate-200"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleBatchReject}
                            disabled={isPending || !rejectReason.trim()}
                        >
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                            Reject {selectedIds.size} Task{selectedIds.size !== 1 ? 's' : ''}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

// Compact version for the header/navbar
export function PendingApprovalsButton() {
    const [count, setCount] = useState(0)

    useEffect(() => {
        const loadCount = async () => {
            const result = await getPendingApprovals()
            if (!result.error) {
                setCount(result.data.length)
            }
        }
        loadCount()
        
        // Refresh every 30 seconds
        const interval = setInterval(loadCount, 30000)
        return () => clearInterval(interval)
    }, [])

    return (
        <BatchApprovalSheet
            trigger={
                <button className="relative p-2 rounded-full hover:bg-slate-100 transition-colors">
                    <ClipboardList className="h-5 w-5 text-slate-600" />
                    {count > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 bg-amber-500 text-white text-xs font-medium rounded-full h-5 w-5 flex items-center justify-center">
                            {count > 9 ? '9+' : count}
                        </span>
                    )}
                </button>
            }
        />
    )
}
