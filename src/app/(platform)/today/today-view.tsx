/**
 * TodayView — Personalized daily briefing page.
 *
 * @description The first screen a user sees each day. Combines morning
 * briefing intelligence with daily pulse data to present a hero narrative,
 * focus tasks, blockers, pending approvals, at-risk objectives, insights,
 * and celebration moments. Designed to feel like a hand-crafted daily
 * briefing — optimistic, human-first, and actionable.
 *
 * @component
 */

"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { motion, useMotionValue, useTransform, animate } from "framer-motion"
import {
    Sun,
    Moon,
    CloudSun,
    Target,
    AlertTriangle,
    CheckCircle2,
    Clock,
    ArrowRight,
    BarChart3,
    ListChecks,
    RefreshCw,
    TrendingUp,
    TrendingDown,
    ShieldAlert,
    ClipboardCheck,
    Calendar,
    Lightbulb,
    Waypoints,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getMorningBriefing, type MorningBriefing } from "@/actions/nudges"
import { getMyDailyPulse, type DailyPulseResult } from "@/actions/reports"
import { getStrategyHealthSummary, type StrategyHealthItem } from "@/actions/canvas"
import { typography } from "@/lib/design-system"
import { StreakBadge } from "@/components/celebrations/StreakBadge"
import { useCelebration } from "@/hooks/useCelebration"

import type { FormattedReport, DailyPulseData } from "@/lib/reports/types"

// ─── Constants ────────────────────────────────────────────────────

/** Streak day counts that trigger a celebration on page load */
const STREAK_MILESTONES = [3, 7, 14, 30] as const

/** Shared easing curve for all entrance animations */
const EASE_CURVE = [0.22, 1, 0.36, 1] as const

// ─── Time-of-day helpers ─────────────────────────────────────────

/**
 * Returns the appropriate icon for the current time of day.
 *
 * @returns Sun (5–12), CloudSun (12–17), or Moon (17–5)
 */
function getTimeIcon(): React.ReactElement {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return <Sun className="h-5 w-5 text-status-warning" />
    if (hour >= 12 && hour < 17) return <CloudSun className="h-5 w-5 text-status-warning" />
    return <Moon className="h-5 w-5 text-electric-blue" />
}

/**
 * Returns a time-appropriate greeting label.
 *
 * @param name - The user's first name
 * @returns "Good morning, {name}" / "Good afternoon, {name}" / "Good evening, {name}"
 */
function getTimeGreeting(name: string): string {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return `Good morning, ${name}`
    if (hour >= 12 && hour < 17) return `Good afternoon, ${name}`
    return `Good evening, ${name}`
}

// ─── Component ────────────────────────────────────────────────────

export function TodayView(): React.ReactElement {
    const [briefing, setBriefing] = useState<MorningBriefing | null>(null)
    const [pulse, setPulse] = useState<FormattedReport | null>(null)
    const [strategyHealth, setStrategyHealth] = useState<StrategyHealthItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [briefingError, setBriefingError] = useState(false)
    const [pulseError, setPulseError] = useState(false)

    const confettiFiredRef = useRef(false)
    const streakCelebratedRef = useRef(false)
    const { fireConfetti, celebrateStreak } = useCelebration()

    const loadData = useCallback(async (): Promise<void> => {
        setIsLoading(true)
        setBriefingError(false)
        setPulseError(false)

        const [briefingResult, pulseResult, strategyResult] = await Promise.all([
            getMorningBriefing().catch(() => ({ data: null, error: "Failed" })),
            getMyDailyPulse().catch(() => ({ success: false, data: undefined, error: "Failed" }) as DailyPulseResult),
            getStrategyHealthSummary().catch(() => ({ error: "Failed" }) as { error: string }),
        ])

        if (briefingResult.data) {
            setBriefing(briefingResult.data)
        } else {
            setBriefingError(true)
        }

        if (pulseResult.success && pulseResult.data) {
            setPulse(pulseResult.data)
        } else {
            setPulseError(true)
        }

        if ('data' in strategyResult && strategyResult.data) {
            setStrategyHealth(strategyResult.data)
        }

        setIsLoading(false)
    }, [])

    useEffect(() => {
        loadData()
    }, [loadData])

    // ─── Celebration effects ──────────────────────────────────────

    useEffect(() => {
        if (!briefing || isLoading) return

        // Streak milestone celebration
        if (
            !streakCelebratedRef.current &&
            STREAK_MILESTONES.includes(briefing.streak as typeof STREAK_MILESTONES[number])
        ) {
            streakCelebratedRef.current = true
            celebrateStreak(briefing.streak)
        }

        // All-clear confetti: no focus tasks AND no overdue items
        if (
            !confettiFiredRef.current &&
            briefing.topTasks.length === 0 &&
            briefing.overdueCount === 0
        ) {
            confettiFiredRef.current = true
            fireConfetti()
        }
    }, [briefing, isLoading, celebrateStreak, fireConfetti])

    // ─── Derived data ─────────────────────────────────────────────

    const pulseData = pulse?.data as DailyPulseData | undefined
    const bothFailed = briefingError && pulseError

    // ─── Loading state ────────────────────────────────────────────

    if (isLoading) {
        return <TodayViewSkeleton />
    }

    // ─── Full error state ─────────────────────────────────────────

    if (bothFailed) {
        return (
            <div className="max-w-3xl mx-auto space-y-8">
                <PageHeader />
                <Card className="rounded-xl border shadow-sm">
                    <CardContent className="pt-6 pb-6 flex flex-col items-center gap-4 text-center">
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
                            <AlertTriangle className="h-6 w-6 text-destructive" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-base font-semibold text-foreground">
                                Unable to load your daily briefing
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Something went wrong fetching your data. Please try again.
                            </p>
                        </div>
                        <Button onClick={loadData} variant="outline" size="sm" className="gap-1.5">
                            <RefreshCw className="h-3.5 w-3.5" />
                            Retry
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // ─── Hero greeting text ───────────────────────────────────────

    const heroNarrative = briefing?.narrative || pulse?.summary || briefing?.greeting || ""
    const greetingLabel = briefing?.userName
        ? getTimeGreeting(briefing.userName)
        : briefing?.greeting ?? "Welcome back"

    // ─── Main render ──────────────────────────────────────────────

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            <PageHeader />

            {/* Hero Narrative Card */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE_CURVE }}
            >
                <Card className="rounded-xl border shadow-sm bg-gradient-to-br from-background to-international-orange/[0.03] overflow-hidden">
                    <CardContent className="pt-6 pb-5">
                        {/* Greeting + Streak */}
                        <div className="flex items-start justify-between gap-3 mb-5">
                            <div className="flex items-start gap-3 min-w-0">
                                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50 shrink-0">
                                    {getTimeIcon()}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-muted-foreground">
                                        {greetingLabel}
                                    </p>
                                    {heroNarrative && (
                                        <p className="text-base font-semibold text-foreground leading-relaxed mt-1">
                                            {heroNarrative}
                                        </p>
                                    )}
                                </div>
                            </div>
                            {briefing && <StreakBadge streak={briefing.streak} className="shrink-0" />}
                        </div>

                        {/* Quick Stats with Trends */}
                        {pulseData && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                                <AnimatedStatCard
                                    label="Completed"
                                    value={pulseData.personal.tasks_completed_count}
                                    previousValue={pulseData.trends.personal_completed_yesterday}
                                    color="text-status-success"
                                    delay={0}
                                />
                                <AnimatedStatCard
                                    label="Due today"
                                    value={pulseData.personal.tasks_due_today}
                                    color="text-electric-blue"
                                    delay={0.05}
                                />
                                {pulseData.personal.tasks_overdue > 0 && (
                                    <AnimatedStatCard
                                        label="Overdue"
                                        value={pulseData.personal.tasks_overdue}
                                        color="text-destructive"
                                        delay={0.1}
                                    />
                                )}
                                {pulseData.team.total_completed > 0 && (
                                    <AnimatedStatCard
                                        label="Team completed"
                                        value={pulseData.team.total_completed}
                                        previousValue={pulseData.trends.completed_yesterday}
                                        color="text-muted-foreground"
                                        delay={0.15}
                                    />
                                )}
                            </div>
                        )}

                        {/* Smart Nudges */}
                        {briefing && briefing.nudges.length > 0 && (
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

                        {/* Intelligence Signal — shows how long the system has been learning */}
                        {briefing && briefing.intelligenceDaysOfData > 7 && (
                            <div className="flex items-center gap-2 mt-4 pt-3 border-t text-xs text-muted-foreground">
                                <Lightbulb className="h-3.5 w-3.5 shrink-0 text-status-warning" />
                                <span className="flex-1">
                                    Based on {briefing.intelligenceDaysOfData} days of activity
                                    {briefing.bestProductivityDay && (
                                        <span className="text-foreground/70">
                                            {' · '}Best day: {briefing.bestProductivityDay}
                                        </span>
                                    )}
                                    {briefing.velocityTrend !== 0 && (
                                        <span className={cn(
                                            briefing.velocityTrend > 0 ? "text-status-success" : "text-status-warning"
                                        )}>
                                            {' · '}Velocity {briefing.velocityTrend > 0 ? '+' : ''}{briefing.velocityTrend}%
                                        </span>
                                    )}
                                </span>
                            </div>
                        )}

                        {/* Partial data warning */}
                        {pulseError && !briefingError && (
                            <div className="flex items-center gap-2 mt-4 pt-3 border-t text-xs text-muted-foreground">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                <span className="flex-1">Some data unavailable</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs gap-1"
                                    onClick={loadData}
                                >
                                    <RefreshCw className="h-3 w-3" />
                                    Retry
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </motion.div>

            {/* Focus Tasks Section */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1, ease: EASE_CURVE }}
            >
                <FocusTasksSection
                    briefing={briefing}
                    overdueCount={briefing?.overdueCount ?? 0}
                />
            </motion.div>

            {/* Blockers Section */}
            {pulseData && pulseData.blockers.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.15, ease: EASE_CURVE }}
                >
                    <BlockersSection blockers={pulseData.blockers} />
                </motion.div>
            )}

            {/* Pending Approvals Section */}
            {pulseData && pulseData.pending_approvals.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2, ease: EASE_CURVE }}
                >
                    <PendingApprovalsSection approvals={pulseData.pending_approvals} />
                </motion.div>
            )}

            {/* At-Risk Objectives Section */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.25, ease: EASE_CURVE }}
            >
                <AtRiskObjectivesSection briefing={briefing} />
            </motion.div>

            {/* Strategy Spotlight Section */}
            {strategyHealth.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.28, ease: EASE_CURVE }}
                >
                    <StrategySpotlightSection items={strategyHealth} />
                </motion.div>
            )}

            {/* Insights Section */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3, ease: EASE_CURVE }}
            >
                <InsightsSection pulse={pulse} />
            </motion.div>

            {/* Quick Actions */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.35, ease: EASE_CURVE }}
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
                    <Link href="/strategy" className="gap-1.5">
                        <Waypoints className="h-3.5 w-3.5" />
                        View strategy
                    </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                    <Link href="/plan" className="gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        Plan something new
                    </Link>
                </Button>
            </motion.div>
        </div>
    )
}

// ─── Page Header ──────────────────────────────────────────────────

/**
 * Renders the standardized "Today" page header with orange accent bar.
 */
function PageHeader(): React.ReactElement {
    return (
        <div>
            <div className={typography.pageHeader}>
                <div className={typography.pageHeaderAccent} />
                <h1 className={typography.h1}>Today</h1>
            </div>
        </div>
    )
}

// ─── Skeleton Loading State ───────────────────────────────────────

/**
 * Full-page skeleton displayed while briefing + pulse data load.
 *
 * @description Mimics the layout of the loaded page: greeting card with
 * narrative text and stat blocks, three task card placeholders, and
 * two objective card placeholders.
 */
function TodayViewSkeleton(): React.ReactElement {
    return (
        <div className="max-w-3xl mx-auto space-y-8">
            <PageHeader />

            {/* Greeting card skeleton */}
            <Card className="rounded-xl border shadow-sm overflow-hidden">
                <CardContent className="pt-6 pb-5 space-y-5">
                    {/* Greeting row */}
                    <div className="flex items-start gap-3">
                        <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
                        <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-5 w-full max-w-md" />
                            <Skeleton className="h-5 w-3/4 max-w-sm" />
                        </div>
                    </div>
                    {/* Stat blocks */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-16 rounded-lg" />
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Focus tasks skeleton */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <Skeleton className="w-1 h-5 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
            </div>

            {/* Objectives skeleton */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <Skeleton className="w-1 h-5 rounded-full" />
                    <Skeleton className="h-4 w-20" />
                </div>
                {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
            </div>
        </div>
    )
}

// ─── Animated Stat Card ───────────────────────────────────────────

interface AnimatedStatCardProps {
    /** Display label (e.g. "Completed") */
    label: string
    /** Current numeric value */
    value: number
    /** Yesterday's value for trend calculation */
    previousValue?: number
    /** Color token for the numeric value */
    color: string
    /** Staggered entrance delay in seconds */
    delay: number
}

/**
 * A small stat card that counts up the number on mount and optionally
 * shows a trend arrow comparing today vs yesterday.
 */
function AnimatedStatCard({
    label,
    value,
    previousValue,
    color,
    delay,
}: AnimatedStatCardProps): React.ReactElement {
    const motionValue = useMotionValue(0)
    const rounded = useTransform(motionValue, (v) => Math.round(v))

    useEffect(() => {
        const controls = animate(motionValue, value, {
            duration: 0.6,
            delay: delay + 0.2,
            ease: "easeOut",
        })
        return controls.stop
    }, [motionValue, value, delay])

    const delta = previousValue !== undefined ? value - previousValue : null
    const showTrend = delta !== null && delta !== 0

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay, ease: EASE_CURVE }}
            className="rounded-lg border bg-background p-3 space-y-1"
        >
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <div className="flex items-baseline gap-1.5">
                <motion.span className={cn("text-xl font-bold tabular-nums", color)}>
                    {rounded}
                </motion.span>
                {showTrend && (
                    <span
                        className={cn(
                            "flex items-center text-xs font-medium",
                            delta > 0 ? "text-status-success" : "text-destructive"
                        )}
                    >
                        {delta > 0 ? (
                            <TrendingUp className="h-3 w-3 mr-0.5" />
                        ) : (
                            <TrendingDown className="h-3 w-3 mr-0.5" />
                        )}
                        {Math.abs(delta)}
                    </span>
                )}
            </div>
        </motion.div>
    )
}

// ─── Focus Tasks Section ──────────────────────────────────────────

interface FocusTasksSectionProps {
    briefing: MorningBriefing | null
    overdueCount: number
}

/**
 * Renders the "Focus Today" section with task cards, or an appropriate
 * empty state depending on whether there are overdue tasks.
 */
function FocusTasksSection({ briefing, overdueCount }: FocusTasksSectionProps): React.ReactElement | null {
    if (!briefing) return null

    const hasTasks = briefing.topTasks.length > 0

    // All caught up — celebration empty state
    if (!hasTasks && overdueCount === 0) {
        return (
            <div>
                <SectionHeader icon={ListChecks} label="Focus Today" color="text-international-orange" />
                <Card className="rounded-xl border shadow-sm">
                    <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-status-success-light">
                            <CheckCircle2 className="h-5 w-5 text-status-success" />
                        </div>
                        <p className="text-sm font-semibold text-foreground">
                            You&apos;re all caught up!
                        </p>
                        <p className="text-xs text-muted-foreground max-w-xs">
                            No tasks due and nothing overdue. Time to plan your next move.
                        </p>
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/plan" className="gap-1.5">
                                <Calendar className="h-3.5 w-3.5" />
                                Go to Plan
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // No tasks due today, but overdue exist
    if (!hasTasks && overdueCount > 0) {
        return (
            <div>
                <SectionHeader icon={ListChecks} label="Focus Today" color="text-international-orange" />
                <Card className="rounded-xl border shadow-sm">
                    <CardContent className="py-6 flex items-center gap-3">
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                        <p className="text-sm text-muted-foreground">
                            No tasks scheduled for today, but you have {overdueCount} overdue{" "}
                            {overdueCount === 1 ? "item" : "items"}.
                        </p>
                        <Button variant="outline" size="sm" asChild className="shrink-0 ml-auto">
                            <Link href="/new-tasks" className="gap-1.5">
                                View tasks
                                <ArrowRight className="h-3 w-3" />
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div>
            <SectionHeader icon={ListChecks} label="Focus Today" color="text-international-orange" />
            <div className="space-y-2">
                {briefing.topTasks.map((task) => (
                    <Link
                        key={task.id}
                        href="/new-tasks"
                        className="flex items-center gap-3 p-3 rounded-xl border bg-background shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group"
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
        </div>
    )
}

// ─── Blockers Section ─────────────────────────────────────────────

interface BlockersSectionProps {
    blockers: DailyPulseData["blockers"]
}

/**
 * Displays team blockers flagged in the daily pulse.
 * Only rendered when blockers exist.
 */
function BlockersSection({ blockers }: BlockersSectionProps): React.ReactElement {
    return (
        <div>
            <SectionHeader icon={ShieldAlert} label="Blockers" color="text-destructive" />
            <div className="space-y-2">
                {blockers.map((blocker, i) => (
                    <Card key={i} className="rounded-xl border shadow-sm">
                        <CardContent className="py-3 px-4 flex items-start gap-3">
                            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <p className="text-sm font-medium text-foreground">
                                        {blocker.user_name}
                                    </p>
                                    {(blocker.severity === "high" || blocker.severity === "critical") && (
                                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                            {blocker.severity}
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    {blocker.blocker}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}

// ─── Pending Approvals Section ────────────────────────────────────

interface PendingApprovalsSectionProps {
    approvals: DailyPulseData["pending_approvals"]
}

/**
 * Displays tasks awaiting the user's review/approval.
 * Only rendered when pending approvals exist.
 */
function PendingApprovalsSection({ approvals }: PendingApprovalsSectionProps): React.ReactElement {
    return (
        <div>
            <SectionHeader icon={ClipboardCheck} label="Awaiting Your Review" color="text-status-warning" />
            <div className="space-y-2">
                {approvals.map((approval) => (
                    <Link
                        key={approval.task_id}
                        href="/new-tasks"
                        className="flex items-center gap-3 p-3 rounded-xl border bg-background shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group"
                    >
                        <ClipboardCheck className="h-4 w-4 text-status-warning shrink-0" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground group-hover:text-international-orange transition-colors truncate">
                                {approval.title}
                            </p>
                            {approval.assignee_name && (
                                <p className="text-xs text-muted-foreground truncate">
                                    from {approval.assignee_name}
                                </p>
                            )}
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-international-orange transition-colors shrink-0" />
                    </Link>
                ))}
            </div>
        </div>
    )
}

// ─── At-Risk Objectives Section ───────────────────────────────────

interface AtRiskObjectivesSectionProps {
    briefing: MorningBriefing | null
}

/**
 * Renders the "At Risk" section or a positive empty state when
 * all objectives are on track.
 */
function AtRiskObjectivesSection({ briefing }: AtRiskObjectivesSectionProps): React.ReactElement | null {
    if (!briefing) return null

    const hasAtRisk = briefing.atRiskObjectives.length > 0

    if (!hasAtRisk) {
        return (
            <div>
                <SectionHeader icon={Target} label="Objectives" color="text-status-success" />
                <Card className="rounded-xl border shadow-sm">
                    <CardContent className="py-6 flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-status-success-light shrink-0">
                            <CheckCircle2 className="h-4 w-4 text-status-success" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            All objectives on track. Keep the momentum going!
                        </p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div>
            <SectionHeader icon={Target} label="At Risk" color="text-status-warning" />
            <div className="space-y-2">
                {briefing.atRiskObjectives.map((obj) => (
                    <Link
                        key={obj.id}
                        href="/new-objectives"
                        className="flex items-center gap-3 p-3 rounded-xl border bg-background shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group"
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
        </div>
    )
}

// ─── Strategy Spotlight Section ───────────────────────────────────

interface StrategySpotlightSectionProps {
    items: StrategyHealthItem[]
}

/**
 * Compact strategy health overview for the Today page.
 *
 * @description Shows each strategic pillar with a colored health dot,
 * progress bar, and key metric (overdue count or objective count).
 * Taps link to the strategy dashboard.
 */
function StrategySpotlightSection({ items }: StrategySpotlightSectionProps): React.ReactElement {
    const needsAttention = items.filter(i => i.health === 'off-track' || i.health === 'at-risk')
    const allHealthy = needsAttention.length === 0

    return (
        <div>
            <SectionHeader icon={Waypoints} label="Strategy" color="text-international-orange" />
            {allHealthy ? (
                <Card className="rounded-xl border shadow-sm">
                    <CardContent className="py-6 flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-status-success-light shrink-0">
                            <Waypoints className="h-4 w-4 text-status-success" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm text-muted-foreground">
                                All {items.length} strategic {items.length === 1 ? 'pillar' : 'pillars'} on track.
                            </p>
                        </div>
                        <Button variant="ghost" size="sm" asChild className="shrink-0">
                            <Link href="/strategy" className="gap-1 text-xs">
                                Details
                                <ArrowRight className="h-3 w-3" />
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {items.map((item) => {
                        const healthColor = {
                            'on-track': 'bg-status-success',
                            'at-risk': 'bg-status-warning',
                            'off-track': 'bg-destructive',
                            'completed': 'bg-status-success',
                            'not-started': 'bg-muted-foreground',
                        }[item.health]

                        return (
                            <Link
                                key={item.id}
                                href="/strategy"
                                className="flex items-center gap-3 p-3 rounded-xl border bg-background shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group"
                            >
                                {/* Health dot */}
                                <div className={cn("w-2 h-2 rounded-full shrink-0", healthColor)} />
                                {/* Title & metadata */}
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground group-hover:text-international-orange transition-colors truncate">
                                        {item.title}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-xs text-muted-foreground">
                                            {item.objectiveCount} {item.objectiveCount === 1 ? 'objective' : 'objectives'}
                                        </span>
                                        {item.overdueTaskCount > 0 && (
                                            <span className="text-xs text-destructive font-medium">
                                                {item.overdueTaskCount} overdue
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {/* Progress */}
                                <div className="flex items-center gap-2 shrink-0">
                                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                        <div
                                            className={cn("h-full rounded-full transition-all", healthColor)}
                                            style={{ width: `${item.progress}%` }}
                                        />
                                    </div>
                                    <span className="text-xs font-semibold text-foreground tabular-nums w-8 text-right">
                                        {item.progress}%
                                    </span>
                                </div>
                            </Link>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ─── Insights Section ─────────────────────────────────────────────

interface InsightsSectionProps {
    pulse: FormattedReport | null
}

/**
 * Renders the "Insights" section from the daily pulse, or a gentle
 * empty state when no insights are available.
 */
function InsightsSection({ pulse }: InsightsSectionProps): React.ReactElement | null {
    const hasInsights = pulse && pulse.insights.length > 0

    if (!hasInsights) {
        return (
            <div>
                <SectionHeader icon={BarChart3} label="Insights" color="text-electric-blue" />
                <Card className="rounded-xl border shadow-sm">
                    <CardContent className="py-6 flex items-center gap-3">
                        <Lightbulb className="h-4 w-4 text-muted-foreground shrink-0" />
                        <p className="text-sm text-muted-foreground">
                            Check back tomorrow for fresh insights.
                        </p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div>
            <SectionHeader icon={BarChart3} label="Insights" color="text-electric-blue" />
            <div className="space-y-2">
                {pulse.insights.slice(0, 4).map((insight) => (
                    <div
                        key={insight.id}
                        className={cn(
                            "flex items-start gap-3 p-3 rounded-xl border shadow-sm",
                            insight.type === "celebration" && "bg-status-success-light/30",
                            insight.type === "warning" && "bg-status-warning-light/30",
                            insight.type === "suggestion" && "bg-status-info-light/30",
                        )}
                    >
                        <div className="shrink-0 mt-0.5">
                            {insight.type === "celebration" && <CheckCircle2 className="h-4 w-4 text-status-success" />}
                            {insight.type === "warning" && <AlertTriangle className="h-4 w-4 text-status-warning" />}
                            {insight.type === "suggestion" && <Lightbulb className="h-4 w-4 text-status-info" />}
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
        </div>
    )
}

// ─── Section Header ───────────────────────────────────────────────

interface SectionHeaderProps {
    /** Lucide icon component */
    icon: React.ComponentType<{ className?: string }>
    /** Section label text */
    label: string
    /** Text color token (e.g. "text-international-orange") */
    color: string
}

/**
 * Consistent section header with a colored accent bar, icon, and
 * uppercase monospace label.
 */
function SectionHeader({ icon: Icon, label, color }: SectionHeaderProps): React.ReactElement {
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
