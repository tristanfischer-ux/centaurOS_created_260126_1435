"use client"

import { useState, useTransition, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Check, Search, Loader2, Target, ArrowRight, Zap, Clock } from "lucide-react"
import { assignToTask } from "@/actions/team"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────

interface ExtendedTask {
    id: string
    title: string
    status: string
    assignee_id: string | null
    end_date: string | null
    start_date: string | null
    created_at: string
    objective_id: string | null
    objective_title: string | null
    progress: number | null
    risk_level: string | null
}

interface AssignableMember {
    id: string
    full_name: string
    role: string
    avatar_url: string | null
    activeTasks: number
    pendingTasks: number
}

interface QuickAssignDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    unassignedTasks: ExtendedTask[]
    members: AssignableMember[]
}

// ─── Helper: Recommend Assignees ─────────────────

function getRecommendedAssignees(members: AssignableMember[]): AssignableMember[] {
    // Sort by workload score ascending (least busy first), filter out AI agents
    return [...members]
        .filter(m => m.role !== 'AI_Agent')
        .sort((a, b) => {
            const aScore = Math.min(100, (a.activeTasks * 20) + (a.pendingTasks * 10))
            const bScore = Math.min(100, (b.activeTasks * 20) + (b.pendingTasks * 10))
            return aScore - bScore
        })
}

function getWorkloadLabel(member: AssignableMember): { label: string; className: string } {
    const score = Math.min(100, (member.activeTasks * 20) + (member.pendingTasks * 10))
    if (score === 0) return { label: 'Idle', className: 'bg-status-info-light text-status-info-dark' }
    if (score <= 40) return { label: 'Available', className: 'bg-status-success-light text-status-success-dark' }
    if (score <= 70) return { label: 'Busy', className: 'bg-status-warning-light text-status-warning-dark' }
    return { label: 'Overloaded', className: 'bg-status-error-light text-status-error-dark' }
}

// ─── Task Assignment Row ─────────────────────────

function TaskAssignmentRow({
    task,
    members,
    onAssign,
    isAssigning,
}: {
    task: ExtendedTask
    members: AssignableMember[]
    onAssign: (taskId: string, memberId: string) => void
    isAssigning: boolean
}) {
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
    const recommended = useMemo(() => getRecommendedAssignees(members), [members])
    const topRecommended = recommended[0]

    const isOverdue = task.end_date && new Date(task.end_date) < new Date()

    return (
        <div className={cn(
            "p-4 rounded-xl border border-muted bg-card space-y-3",
            isOverdue && "border-status-error bg-status-error-light/30"
        )}>
            {/* Task info */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {task.objective_title && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Target className="h-2.5 w-2.5" />
                                {task.objective_title}
                            </span>
                        )}
                        {isOverdue && (
                            <Badge variant="secondary" className="bg-status-error-light text-status-error-dark text-[10px] px-1.5 h-4 gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                Overdue
                            </Badge>
                        )}
                    </div>
                </div>
            </div>

            {/* Assignee Selection */}
            <div className="flex items-center gap-2 flex-wrap">
                {recommended.slice(0, 4).map((member, idx) => {
                    const workload = getWorkloadLabel(member)
                    const isSelected = selectedMemberId === member.id
                    const isTop = idx === 0

                    return (
                        <button
                            key={member.id}
                            onClick={() => setSelectedMemberId(isSelected ? null : member.id)}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs",
                                isSelected
                                    ? "border-international-orange bg-international-orange/10 text-international-orange"
                                    : "border-muted hover:border-muted-foreground/30 hover:bg-muted/50",
                                isTop && !isSelected && "border-status-success bg-status-success-light/50"
                            )}
                        >
                            <UserAvatar name={member.full_name} role={member.role} size="xs" />
                            <span className="font-medium">{member.full_name?.split(' ')[0]}</span>
                            <Badge variant="secondary" className={cn("text-[9px] h-4 px-1", workload.className)}>
                                {workload.label}
                            </Badge>
                            {isTop && !isSelected && (
                                <Zap className="h-3 w-3 text-emerald-500" />
                            )}
                            {isSelected && <Check className="h-3 w-3" />}
                        </button>
                    )
                })}

                {/* Assign button */}
                <Button
                    size="sm"
                    disabled={!selectedMemberId || isAssigning}
                    onClick={() => {
                        if (selectedMemberId) onAssign(task.id, selectedMemberId)
                    }}
                    className={cn(
                        "h-8 px-3 ml-auto shrink-0 transition-all",
                        selectedMemberId
                            ? "bg-international-orange hover:bg-international-orange/90 text-white"
                            : "bg-muted text-muted-foreground"
                    )}
                >
                    {isAssigning ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <>
                            Assign
                            <ArrowRight className="h-3 w-3 ml-1" />
                        </>
                    )}
                </Button>
            </div>
        </div>
    )
}

// ─── Main Dialog ─────────────────────────────────

export function QuickAssignDialog({ open, onOpenChange, unassignedTasks, members }: QuickAssignDialogProps) {
    const [searchQuery, setSearchQuery] = useState("")
    const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null)
    const [assignedTaskIds, setAssignedTaskIds] = useState<Set<string>>(new Set())
    const [isPending, startTransition] = useTransition()

    const filteredTasks = useMemo(() => {
        const remaining = unassignedTasks.filter(t => !assignedTaskIds.has(t.id))
        if (!searchQuery.trim()) return remaining
        const q = searchQuery.toLowerCase()
        return remaining.filter(t =>
            t.title.toLowerCase().includes(q) ||
            t.objective_title?.toLowerCase().includes(q)
        )
    }, [unassignedTasks, searchQuery, assignedTaskIds])

    const handleAssign = (taskId: string, memberId: string) => {
        setAssigningTaskId(taskId)
        startTransition(async () => {
            const result = await assignToTask(taskId, [memberId])
            if (result?.error) {
                toast.error(result.error)
            } else {
                const member = members.find(m => m.id === memberId)
                toast.success(`Assigned to ${member?.full_name || 'member'}`)
                setAssignedTaskIds(prev => new Set([...prev, taskId]))
            }
            setAssigningTaskId(null)
        })
    }

    const remainingCount = unassignedTasks.length - assignedTaskIds.size

    return (
        <Dialog open={open} onOpenChange={(isOpen) => {
            if (!isOpen) {
                setSearchQuery("")
                setAssignedTaskIds(new Set())
            }
            onOpenChange(isOpen)
        }}>
            <DialogContent size="md" className="max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-foreground">
                        <Zap className="h-5 w-5 text-international-orange" />
                        Quick Assign
                        {remainingCount > 0 && (
                            <Badge variant="secondary" className="text-xs ml-1">{remainingCount} remaining</Badge>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        Assign unassigned tasks to team members. Recommended assignees are sorted by availability.
                    </DialogDescription>
                </DialogHeader>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search tasks..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 bg-background border-muted text-sm"
                    />
                </div>

                {/* Task List */}
                <ScrollArea className="flex-1 -mx-6 px-6">
                    {filteredTasks.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Check className="h-8 w-8 mx-auto mb-3 text-emerald-500" />
                            <p className="text-sm font-medium">
                                {assignedTaskIds.size > 0
                                    ? "All tasks assigned!"
                                    : "No unassigned tasks"}
                            </p>
                            <p className="text-xs mt-1">
                                {assignedTaskIds.size > 0
                                    ? `You assigned ${assignedTaskIds.size} task${assignedTaskIds.size !== 1 ? 's' : ''} this session`
                                    : "All tasks have assignees"}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3 pb-4">
                            {filteredTasks.map(task => (
                                <TaskAssignmentRow
                                    key={task.id}
                                    task={task}
                                    members={members}
                                    onAssign={handleAssign}
                                    isAssigning={assigningTaskId === task.id}
                                />
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}
