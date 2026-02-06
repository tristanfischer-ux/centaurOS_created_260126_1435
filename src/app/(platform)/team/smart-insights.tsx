"use client"

import { AlertTriangle, Clock, UserX, UserCheck, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface InsightMember {
    id: string
    name: string
}

interface Insights {
    overloadedMembers: InsightMember[]
    idleMembers: InsightMember[]
    overdueTaskCount: number
    unassignedTaskCount: number
    totalActiveTasks: number
    totalPendingTasks: number
}

interface SmartInsightsProps {
    insights: Insights
    onMemberClick?: (memberId: string) => void
    onQuickAssignClick?: () => void
}

interface InsightCard {
    id: string
    icon: React.ReactNode
    label: string
    value: string
    severity: 'critical' | 'warning' | 'info' | 'success'
    onClick?: () => void
    visible: boolean
}

const severityStyles = {
    critical: "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800/40 dark:text-red-300",
    warning: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800/40 dark:text-amber-300",
    info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-800/40 dark:text-blue-300",
    success: "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800/40 dark:text-emerald-300",
}

const iconStyles = {
    critical: "text-red-600 dark:text-red-400",
    warning: "text-amber-600 dark:text-amber-400",
    info: "text-blue-600 dark:text-blue-400",
    success: "text-emerald-600 dark:text-emerald-400",
}

export function SmartInsights({ insights, onMemberClick, onQuickAssignClick }: SmartInsightsProps) {
    const cards: InsightCard[] = [
        {
            id: 'overloaded',
            icon: <AlertTriangle className="h-4 w-4" />,
            label: insights.overloadedMembers.length === 1
                ? `${insights.overloadedMembers[0].name} is overloaded`
                : `${insights.overloadedMembers.length} members overloaded`,
            value: `${insights.overloadedMembers.length}`,
            severity: 'critical',
            onClick: insights.overloadedMembers.length === 1
                ? () => onMemberClick?.(insights.overloadedMembers[0].id)
                : undefined,
            visible: insights.overloadedMembers.length > 0,
        },
        {
            id: 'overdue',
            icon: <Clock className="h-4 w-4" />,
            label: `${insights.overdueTaskCount} task${insights.overdueTaskCount !== 1 ? 's' : ''} overdue`,
            value: `${insights.overdueTaskCount}`,
            severity: 'critical',
            visible: insights.overdueTaskCount > 0,
        },
        {
            id: 'unassigned',
            icon: <UserX className="h-4 w-4" />,
            label: `${insights.unassignedTaskCount} unassigned task${insights.unassignedTaskCount !== 1 ? 's' : ''}`,
            value: `${insights.unassignedTaskCount}`,
            severity: 'warning',
            onClick: onQuickAssignClick,
            visible: insights.unassignedTaskCount > 0,
        },
        {
            id: 'idle',
            icon: <UserCheck className="h-4 w-4" />,
            label: insights.idleMembers.length === 1
                ? `${insights.idleMembers[0].name} has no tasks`
                : `${insights.idleMembers.length} members idle`,
            value: `${insights.idleMembers.length}`,
            severity: 'info',
            onClick: insights.idleMembers.length === 1
                ? () => onMemberClick?.(insights.idleMembers[0].id)
                : undefined,
            visible: insights.idleMembers.length > 0,
        },
        {
            id: 'active-summary',
            icon: <TrendingUp className="h-4 w-4" />,
            label: `${insights.totalActiveTasks} active, ${insights.totalPendingTasks} pending`,
            value: `${insights.totalActiveTasks + insights.totalPendingTasks}`,
            severity: 'success',
            visible: true,
        },
    ]

    const visibleCards = cards.filter(c => c.visible)

    if (visibleCards.length === 0) return null

    return (
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
            {visibleCards.map(card => (
                <button
                    key={card.id}
                    onClick={card.onClick}
                    disabled={!card.onClick}
                    className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-xl border transition-all shrink-0",
                        "min-w-[180px]",
                        severityStyles[card.severity],
                        card.onClick && "cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:translate-y-0",
                        !card.onClick && "cursor-default"
                    )}
                >
                    <div className={cn("shrink-0", iconStyles[card.severity])}>
                        {card.icon}
                    </div>
                    <span className="text-sm font-medium whitespace-nowrap">{card.label}</span>
                </button>
            ))}
        </div>
    )
}
