"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    ChevronDown, ChevronUp, MoreHorizontal, Pencil, Trash2,
    UserPlus, Clock, CheckCircle, AlertCircle, Target
} from "lucide-react"
import { cn } from "@/lib/utils"
import { isPast } from "date-fns"

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

interface TeamMember {
    id: string
    full_name: string | null
    role: string | null
    email?: string | null
}

interface MemberMetrics {
    id: string
    activeTasks: number
    pendingTasks: number
}

interface Team {
    id: string
    name: string
    is_auto_generated: boolean | null
    created_at: string | null
    members: TeamMember[]
}

interface TeamDetailCardProps {
    team: Team
    allTasks: ExtendedTask[]
    memberMetrics: MemberMetrics[]
    onRename?: (team: { id: string; name: string }) => void
    onDelete?: (teamId: string) => void
    onMemberClick?: (memberId: string) => void
    onTaskClick?: (taskId: string) => void
    onDragOver?: (e: React.DragEvent) => void
    onDragLeave?: () => void
    onDrop?: (e: React.DragEvent) => void
    isDropTarget?: boolean
}

// ─── Capacity Bar ────────────────────────────────

function MiniCapacityBar({ active, pending, name }: { active: number; pending: number; name: string | null }) {
    const score = Math.min(100, (active * 20) + (pending * 10))
    const color = score <= 40
        ? 'bg-status-success'
        : score <= 70
            ? 'bg-status-warning'
            : 'bg-status-error'

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-foreground truncate flex-1 min-w-0">{name}</span>
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                <div className={cn("h-full rounded-full", color)} style={{ width: `${score}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums w-5 text-right">{active}</span>
        </div>
    )
}

// ─── Main Component ──────────────────────────────

export function TeamDetailCard({
    team,
    allTasks,
    memberMetrics,
    onRename,
    onDelete,
    onMemberClick,
    onTaskClick,
    onDragOver,
    onDragLeave,
    onDrop,
    isDropTarget,
}: TeamDetailCardProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    // Compute team aggregate metrics
    const teamStats = useMemo(() => {
        const memberIds = new Set(team.members.map(m => m.id))
        const teamTasks = allTasks.filter(t => t.assignee_id && memberIds.has(t.assignee_id))

        const active = teamTasks.filter(t => t.status === 'Accepted').length
        const pending = teamTasks.filter(t => t.status === 'Pending').length
        const completed = teamTasks.filter(t => t.status === 'Completed').length
        const overdue = teamTasks.filter(t =>
            t.end_date &&
            t.status !== 'Completed' &&
            t.status !== 'Rejected' &&
            isPast(new Date(t.end_date))
        ).length

        // Next 3 upcoming deadlines
        const upcomingDeadlines = teamTasks
            .filter(t =>
                t.end_date &&
                t.status !== 'Completed' &&
                t.status !== 'Rejected' &&
                !isPast(new Date(t.end_date))
            )
            .sort((a, b) => new Date(a.end_date!).getTime() - new Date(b.end_date!).getTime())
            .slice(0, 3)

        return { active, pending, completed, overdue, upcomingDeadlines }
    }, [team.members, allTasks])

    // Member capacity details
    const memberDetails = useMemo(() => {
        return team.members.map(m => {
            const metrics = memberMetrics.find(mm => mm.id === m.id)
            return {
                ...m,
                activeTasks: metrics?.activeTasks || 0,
                pendingTasks: metrics?.pendingTasks || 0,
            }
        }).sort((a, b) => (b.activeTasks + b.pendingTasks) - (a.activeTasks + a.pendingTasks))
    }, [team.members, memberMetrics])

    return (
        <Card
            className={cn(
                "bg-card border shadow-sm transition-all group/team hover:shadow-md relative overflow-hidden",
                isDropTarget && "ring-2 ring-status-success border-status-success bg-status-success-light",
                isExpanded && "shadow-md"
            )}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            {/* Top accent line */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-international-orange/60 via-electric-blue/40 to-transparent" />

            {isDropTarget && (
                <div className="absolute inset-0 flex items-center justify-center bg-status-success/10 rounded-lg z-10">
                    <div className="bg-status-success text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                        <UserPlus className="h-3 w-3" />
                        Add to Team
                    </div>
                </div>
            )}

            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                        <CardTitle className="text-base font-display font-semibold text-foreground truncate">
                            {team.name}
                        </CardTitle>
                        {team.is_auto_generated && (
                            <Badge variant="secondary" className="text-[10px] text-muted-foreground shrink-0">Auto</Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            aria-label={isExpanded ? "Collapse" : "Expand"}
                        >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-7 w-7 p-0 text-muted-foreground opacity-0 group-hover/team:opacity-100 transition-opacity shrink-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" sideOffset={8}>
                                <DropdownMenuItem onClick={() => onRename?.({ id: team.id, name: team.name })}>
                                    <Pencil className="mr-2 h-4 w-4" /> Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onDelete?.(team.id)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-0 space-y-3">
                {/* Avatars + Summary */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                            {team.members.slice(0, 5).map(member => (
                                <button key={member.id} onClick={() => onMemberClick?.(member.id)}>
                                    <UserAvatar
                                        name={member.full_name}
                                        role={member.role || undefined}
                                        size="sm"
                                        className="border-2 border-background hover:ring-2 hover:ring-international-orange/30 transition-all"
                                    />
                                </button>
                            ))}
                            {team.members.length > 5 && (
                                <div className="h-7 w-7 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                                    +{team.members.length - 5}
                                </div>
                            )}
                        </div>
                        <span className="text-xs text-muted-foreground">{team.members.length} members</span>
                    </div>
                </div>

                {/* Quick stats - always visible */}
                <div className="flex items-center gap-3 text-xs flex-wrap">
                    <span className="flex items-center gap-1 text-electric-blue font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-electric-blue" />
                        {teamStats.active} active
                    </span>
                    <span className="flex items-center gap-1 text-status-warning font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-status-warning" />
                        {teamStats.pending} pending
                    </span>
                    <span className="flex items-center gap-1 text-status-success font-medium">
                        <CheckCircle className="h-3 w-3" />
                        {teamStats.completed} done
                    </span>
                    {teamStats.overdue > 0 && (
                        <span className="flex items-center gap-1 text-status-error font-medium">
                            <AlertCircle className="h-3 w-3" />
                            {teamStats.overdue} overdue
                        </span>
                    )}
                </div>

                {/* Expanded Section */}
                {isExpanded && (
                    <div className="space-y-4 pt-2 border-t border-muted animate-in slide-in-from-top-2 duration-200">
                        {/* Member Capacity */}
                        <div className="space-y-2">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Member Load</p>
                            <div className="space-y-1.5">
                                {memberDetails.map(m => (
                                    <button
                                        key={m.id}
                                        onClick={() => onMemberClick?.(m.id)}
                                        className="w-full hover:bg-muted/50 rounded-md px-1 py-0.5 transition-colors"
                                    >
                                        <MiniCapacityBar
                                            active={m.activeTasks}
                                            pending={m.pendingTasks}
                                            name={m.full_name}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Upcoming Deadlines */}
                        {teamStats.upcomingDeadlines.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Next Deadlines</p>
                                <div className="space-y-1.5">
                                    {teamStats.upcomingDeadlines.map(task => (
                                        <button
                                            key={task.id}
                                            onClick={() => onTaskClick?.(task.id)}
                                            className="w-full flex items-center gap-2 text-left text-xs hover:bg-muted/50 rounded-md px-1 py-1 transition-colors"
                                        >
                                            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                                            <span className="truncate flex-1 text-foreground">{task.title}</span>
                                            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                                                {new Date(task.end_date!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
