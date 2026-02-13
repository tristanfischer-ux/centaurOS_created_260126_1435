/**
 * TodayView — Personalized daily landing page.
 *
 * @description Combines morning briefing intelligence with daily pulse
 * data to create the first screen a user sees each day. Shows greeting,
 * focus items, at-risk objectives, yesterday's wins, and smart nudges.
 *
 * @component
 */

"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
    Sun,
    Moon,
    CloudSun,
    Target,
    AlertTriangle,
    CheckCircle2,
    Clock,
    ArrowRight,
    Flame,
    Loader2,
    BarChart3,
    Sparkles,
    ListChecks,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getMorningBriefing, type MorningBriefing } from "@/actions/nudges"
import { getMyDailyPulse, type DailyPulseResult } from "@/actions/reports"
import { typography } from "@/lib/design-system"

import type { FormattedReport, DailyPulseData } from "@/lib/reports/types"

// ─── Time-of-day helpers ─────────────────────────────────────────

function getTimeIcon(): React.ReactElement {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return <Sun className="h-5 w-5 text-amber-500" />
    if (hour >= 12 && hour < 17) return <CloudSun className="h-5 w-5 text-amber-500" />
    return <Moon className="h-5 w-5 text-indigo-400" />
}

// ─── Component ────────────────────────────────────────────────────

export function TodayView(): React.ReactElement {
    const [briefing, setBriefing] = useState<MorningBriefing | null>(null)
    const [pulse, setPulse] = useState<FormattedReport | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        async function loadData(): Promise<void> {
            const [briefingResult, pulseResult] = await Promise.all([
                getMorningBriefing(),
                getMyDailyPulse(),
            ])

            if (briefingResult.data) setBriefing(briefingResult.data)
            if (pulseResult.success && pulseResult.data) setPulse(pulseResult.data)

            setIsLoading(false)
        }

        loadData()
    }, [])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-international-orange" />
                    <p className="text-sm text-muted-foreground">Preparing your day...</p>
                </div>
            </div>
        )
    }

    const pulseData = pulse?.data as DailyPulseData | undefined

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            {/* Page Header */}
            <div>
                <div className={typography.pageHeader}>
                    <div className={typography.pageHeaderAccent} />
                    <h1 className={typography.h1}>Today</h1>
                </div>
            </div>

            {/* Greeting Card */}
            {briefing && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                    <Card className="border bg-gradient-to-br from-background to-international-orange/[0.03] overflow-hidden">
                        <CardContent className="pt-6 pb-5">
                            {/* Greeting + Streak */}
                            <div className="flex items-start gap-3 mb-5">
                                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50 shrink-0">
                                    {getTimeIcon()}
                                </div>
                                <div>
                                    <p className="text-lg font-semibold text-foreground leading-tight">
                                        {briefing.greeting}
                                    </p>
                                    {briefing.streak >= 2 && (
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <Flame className={cn(
                                                "h-3.5 w-3.5",
                                                briefing.streak >= 7 ? "text-international-orange" : "text-amber-500"
                                            )} />
                                            <span className="text-sm text-muted-foreground">
                                                {briefing.streak}-day completion streak
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Quick Stats */}
                            {pulseData && (
                                <div className="flex flex-wrap gap-4 mb-5">
                                    <QuickStat
                                        label="Completed today"
                                        value={pulseData.personal.tasks_completed_count}
                                        color="text-status-success"
                                    />
                                    <QuickStat
                                        label="Due today"
                                        value={pulseData.personal.tasks_due_today}
                                        color="text-electric-blue"
                                    />
                                    {pulseData.personal.tasks_overdue > 0 && (
                                        <QuickStat
                                            label="Overdue"
                                            value={pulseData.personal.tasks_overdue}
                                            color="text-destructive"
                                        />
                                    )}
                                    {pulseData.team.total_completed > 0 && (
                                        <QuickStat
                                            label="Team completed"
                                            value={pulseData.team.total_completed}
                                            color="text-muted-foreground"
                                        />
                                    )}
                                </div>
                            )}

                            {/* AI Summary (from Daily Pulse) */}
                            {pulse?.summary && (
                                <div className="bg-muted/30 rounded-lg p-4 mb-4">
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                        <Sparkles className="h-3.5 w-3.5 text-international-orange" />
                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                            Daily Brief
                                        </span>
                                    </div>
                                    <p className="text-sm text-foreground leading-relaxed">
                                        {pulse.summary}
                                    </p>
                                </div>
                            )}

                            {/* Smart Nudges */}
                            {briefing.nudges.length > 0 && (
                                <div className="space-y-1.5">
                                    {briefing.nudges.map((nudge, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center gap-2 text-xs"
                                        >
                                            <div className={cn(
                                                "w-1 h-4 rounded-full shrink-0",
                                                nudge.type === "overdue" && "bg-destructive",
                                                nudge.type === "at_risk" && "bg-status-warning",
                                                nudge.type === "momentum" && "bg-status-success",
                                                nudge.type === "stale" && "bg-muted-foreground",
                                            )} />
                                            <span className="text-muted-foreground flex-1">
                                                {nudge.message}
                                            </span>
                                            {nudge.actionHref && (
                                                <Link
                                                    href={nudge.actionHref}
                                                    className="text-international-orange hover:underline shrink-0 flex items-center gap-0.5"
                                                >
                                                    {nudge.actionLabel}
                                                    <ArrowRight className="h-3 w-3" />
                                                </Link>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
            )}

            {/* Focus Tasks */}
            {briefing && briefing.topTasks.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                >
                    <SectionHeader icon={ListChecks} label="Focus Today" color="text-international-orange" />
                    <div className="space-y-2">
                        {briefing.topTasks.map((task) => (
                            <Link
                                key={task.id}
                                href="/new-tasks"
                                className="flex items-center gap-3 p-3 rounded-xl border bg-background hover:shadow-md hover:-translate-y-0.5 transition-all group"
                            >
                                {task.isOverdue ? (
                                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                                ) : (
                                    <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className={cn(
                                        "text-sm font-medium text-foreground group-hover:text-international-orange transition-colors truncate",
                                        task.isOverdue && "text-destructive"
                                    )}>
                                        {task.title}
                                    </p>
                                    {task.objectiveTitle && (
                                        <p className="text-xs text-muted-foreground truncate">
                                            {task.objectiveTitle}
                                        </p>
                                    )}
                                </div>
                                {task.dueDate && (
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "text-xs shrink-0",
                                            task.isOverdue && "text-destructive border-destructive/30"
                                        )}
                                    >
                                        <Clock className="h-3 w-3 mr-1" />
                                        {task.isOverdue
                                            ? "Overdue"
                                            : new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                    </Badge>
                                )}
                            </Link>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* At-Risk Objectives */}
            {briefing && briefing.atRiskObjectives.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                    <SectionHeader icon={Target} label="At Risk" color="text-status-warning" />
                    <div className="space-y-2">
                        {briefing.atRiskObjectives.map((obj) => (
                            <Link
                                key={obj.id}
                                href="/new-objectives"
                                className="flex items-center gap-3 p-3 rounded-xl border bg-background hover:shadow-md hover:-translate-y-0.5 transition-all group"
                            >
                                <div className="relative shrink-0">
                                    <Target className="h-4 w-4 text-status-warning" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground group-hover:text-international-orange transition-colors truncate">
                                        {obj.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {obj.reason}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-sm font-semibold text-foreground">{obj.progress}%</p>
                                    {obj.daysUntilDeadline !== null && (
                                        <p className="text-xs text-muted-foreground">
                                            {obj.daysUntilDeadline < 0
                                                ? `${Math.abs(obj.daysUntilDeadline)}d overdue`
                                                : `${obj.daysUntilDeadline}d left`}
                                        </p>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* Insights from Daily Pulse */}
            {pulse && pulse.insights.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                    <SectionHeader icon={BarChart3} label="Insights" color="text-electric-blue" />
                    <div className="space-y-2">
                        {pulse.insights.slice(0, 4).map((insight) => (
                            <div
                                key={insight.id}
                                className={cn(
                                    "flex items-start gap-3 p-3 rounded-xl border",
                                    insight.type === "celebration" && "bg-status-success-light/30",
                                    insight.type === "warning" && "bg-status-warning-light/30",
                                    insight.type === "suggestion" && "bg-status-info-light/30",
                                )}
                            >
                                <div className="shrink-0 mt-0.5">
                                    {insight.type === "celebration" && <CheckCircle2 className="h-4 w-4 text-status-success" />}
                                    {insight.type === "warning" && <AlertTriangle className="h-4 w-4 text-status-warning" />}
                                    {insight.type === "suggestion" && <Sparkles className="h-4 w-4 text-status-info" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground">{insight.title}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
                                </div>
                                {insight.action && (
                                    <Link
                                        href={insight.action.href}
                                        className="text-xs text-international-orange hover:underline shrink-0 flex items-center gap-0.5"
                                    >
                                        {insight.action.label}
                                        <ArrowRight className="h-3 w-3" />
                                    </Link>
                                )}
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* Quick Actions */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-wrap gap-3 pb-8"
            >
                <Button variant="outline" size="sm" asChild>
                    <Link href="/new-tasks" className="gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        View all tasks
                    </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                    <Link href="/new-objectives" className="gap-1.5">
                        <Target className="h-3.5 w-3.5" />
                        View objectives
                    </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                    <Link href="/plan" className="gap-1.5">
                        <Sparkles className="h-3.5 w-3.5" />
                        Plan something new
                    </Link>
                </Button>
            </motion.div>
        </div>
    )
}

// ─── Sub-Components ───────────────────────────────────────────────

function QuickStat({ label, value, color }: { label: string; value: number; color: string }): React.ReactElement {
    return (
        <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">{label}:</span>
            <span className={cn("font-bold", color)}>{value}</span>
        </div>
    )
}

function SectionHeader({
    icon: Icon,
    label,
    color,
}: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    color: string
}): React.ReactElement {
    return (
        <div className="flex items-center gap-2 mb-3">
            <div className={cn("w-1 h-5 rounded-full", color.replace("text-", "bg-"))} />
            <Icon className={cn("h-4 w-4", color)} />
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                {label}
            </p>
        </div>
    )
}
