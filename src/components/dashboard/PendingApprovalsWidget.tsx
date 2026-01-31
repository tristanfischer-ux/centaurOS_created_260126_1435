'use client'

import { useState, useEffect, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Check, X, ClipboardCheck, Loader2, ArrowRight, AlertTriangle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getPendingApprovals, approveTask } from '@/actions/tasks'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { cn, getInitials } from '@/lib/utils'

interface Task {
    id: string
    title: string
    status: string | null
    risk_level: string | null
    created_at: string | null
    assignee: { full_name: string | null } | null
}

interface PendingApprovalsWidgetProps {
    userRole: string
}

export function PendingApprovalsWidget({ userRole }: PendingApprovalsWidgetProps) {
    const [tasks, setTasks] = useState<Task[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isPending, startTransition] = useTransition()
    const [approvingId, setApprovingId] = useState<string | null>(null)

    const isExecutive = userRole === 'Executive' || userRole === 'Founder'

    useEffect(() => {
        if (isExecutive) {
            loadTasks()
        } else {
            setIsLoading(false)
        }
    }, [isExecutive])

    const loadTasks = async () => {
        setIsLoading(true)
        const result = await getPendingApprovals()
        if (!result.error) {
            setTasks(result.data as Task[])
        }
        setIsLoading(false)
    }

    const handleQuickApprove = async (taskId: string) => {
        setApprovingId(taskId)
        startTransition(async () => {
            const result = await approveTask(taskId)
            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success('Task approved!')
                setTasks(prev => prev.filter(t => t.id !== taskId))
            }
            setApprovingId(null)
        })
    }

    if (!isExecutive) {
        return null // Don't show to non-executives
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            <ClipboardCheck className="h-4 w-4 text-amber-500" />
                            Pending Approvals
                        </CardTitle>
                        <CardDescription>Tasks awaiting your review</CardDescription>
                    </div>
                    {tasks.length > 0 && (
                        <Badge variant="secondary" className="bg-status-warning-light text-status-warning">
                            {tasks.length}
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : tasks.length === 0 ? (
                    <div className="text-center py-6">
                        <Check className="h-10 w-10 mx-auto text-status-success mb-2" />
                        <p className="text-sm text-muted-foreground font-medium">All caught up!</p>
                        <p className="text-xs text-muted-foreground">No tasks pending approval</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {tasks.slice(0, 3).map(task => {
                            const assignee = task.assignee as { full_name: string | null } | null
                            const isApproving = approvingId === task.id
                            
                            return (
                                <div 
                                    key={task.id} 
                                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-slate-300 bg-background transition-colors"
                                >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        {assignee && (
                                            <Avatar className="h-8 w-8 shrink-0">
                                                <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                                                    {getInitials(assignee.full_name)}
                                                </AvatarFallback>
                                            </Avatar>
                                        )}
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">
                                                {task.title}
                                            </p>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                {assignee?.full_name && (
                                                    <span>{assignee.full_name}</span>
                                                )}
                                                {task.risk_level === 'High' && (
                                                    <Badge variant="destructive" className="text-[10px] py-0">
                                                        High Risk
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleQuickApprove(task.id)}
                                                    disabled={isPending}
                                                    className="shrink-0 min-h-[44px] min-w-[44px] h-9 w-9 p-0 text-status-success hover:text-status-success-dark hover:bg-status-success-light"
                                                >
                                                    {isApproving ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Check className="h-4 w-4" />
                                                    )}
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Quick approve</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            )
                        })}
                        
                        {tasks.length > 3 && (
                            <Link 
                                href="/tasks?filter=pending_approval"
                                className="flex items-center justify-center gap-1 text-sm text-primary hover:text-primary/80 py-2"
                            >
                                View all {tasks.length} pending
                                <ArrowRight className="h-3 w-3" />
                            </Link>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
