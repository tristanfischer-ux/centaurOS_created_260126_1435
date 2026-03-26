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

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
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
    MessageCircle,
    Waypoints,
} from "lucide-react"

import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getMorningBriefing, type MorningBriefing } from "@/actions/nudges"
import { getMyDailyPulse, type DailyPulseResult } from "@/actions/reports"
import { getStrategyHealthSummary, type StrategyHealthItem } from "@/actions/canvas"
import { getUnreadCount } from "@/actions/messaging"
import { typography } from "@/lib/design-system"
import { StreakBadge } from "@/components/celebrations/StreakBadge"
import { ReferralNudgeBanner } from "@/components/ui/referral-nudge-banner"
import { useCelebration } from "@/hooks/useCelebration"
import { AskSpecialistButton } from "@/components/specialists/ask-specialist-button"
import { InsightFeed } from "@/components/insights/insight-feed"
import { WeeklyBrief } from "@/components/insights/weekly-brief"
import { useRegisterScreenContext } from "@/contexts/screen-context"
import { GettingStartedHero } from "@/components/onboarding/getting-started-hero"
import { PageTour } from "@/components/guidance/page-tour"

import type { FormattedReport, DailyPulseData } from "@/lib/reports/types"
import { updateOnboardingData, type OnboardingData } from "@/actions/onboarding"
import { getMyReferralInfo } from "@/actions/referrals"
import { TodayTimeCard } from "@/components/time/today-time-card"
import { useCalBriefing } from "./use-cal-briefing"
import { SpecialistInsightCard } from "@/components/specialists/specialist-insight-card"
import { CHECKLIST_ITEMS } from "@/components/onboarding/GettingStartedChecklist"
import type { TodayInsightInput } from "@/actions/specialist-page-insights"
import Image from "next/image"

// ─── Props ────────────────────────────────────────────────────────

interface TodayViewProps {
    initialBriefing: MorningBriefing | null
    initialPulse: FormattedReport | null
    initialStrategyHealth: StrategyHealthItem[]
    initialUnreadCount: number
    initialBriefingError: boolean
    initialPulseError: boolean
    initialOnboardingData?: OnboardingData & { _userRole?: string }
}

// ─── Constants ────────────────────────────────────────────────────

/** Streak day counts that trigger a celebration on page load */
const STREAK_MILESTONES = [3, 7, 14, 30] as const

/** Shared easing curve for all entrance animations */
const EASE_CURVE = [0.22, 1, 0.36, 1] as const

// ─── Time-of-day helpers ─────────────────────────────────────────

/**
 * Returns the appropriate icon for the current time of day.
 *
 * @param size - Tailwind size class (default "h-5 w-5")
 * @returns Sun (5–12), CloudSun (12–17), or Moon (17–5)
 */
function getTimeIcon(size = "h-5 w-5"): React.ReactElement {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return <Sun className={`${size} text-status-warning`} />
    if (hour >= 12 && hour < 17) return <CloudSun className={`${size} text-status-warning`} />
    return <Moon className={`${size} text-electric-blue`} />
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

export function TodayView({
    initialBriefing,
    initialPulse,
    initialStrategyHealth,
    initialUnreadCount,
    initialBriefingError,
    initialPulseError,
    initialOnboardingData,
}: TodayViewProps): React.ReactElement {
    const [briefing, setBriefing] = useState<MorningBriefing | null>(initialBriefing)
    const [pulse, setPulse] = useState<FormattedReport | null>(initialPulse)
    const [strategyHealth, setStrategyHealth] = useState<StrategyHealthItem[]>(initialStrategyHealth)
    const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
    const [isLoading, setIsLoading] = useState(false)
    const [briefingError, setBriefingError] = useState(initialBriefingError)
    const [pulseError, setPulseError] = useState(initialPulseError)

    const confettiFiredRef = useRef(false)
    const streakCelebratedRef = useRef(false)
    const { fireConfetti, celebrateStreak } = useCelebration()

    const loadData = useCallback(async (): Promise<void> => {
        setIsLoading(true)
        setBriefingError(false)
        setPulseError(false)

        const [briefingResult, pulseResult, strategyResult, unreadResult] = await Promise.all([
            getMorningBriefing().catch(() => ({ data: null, error: "Failed" })),
            getMyDailyPulse().catch(() => ({ success: false, data: undefined, error: "Failed" }) as DailyPulseResult),
            getStrategyHealthSummary().catch(() => ({ error: "Failed" }) as { error: string }),
            getUnreadCount().catch(() => ({ count: 0 })),
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

        setUnreadCount(unreadResult?.count ?? 0)

        setIsLoading(false)
    }, [])

    const handleShareReferral = useCallback(async () => {
        try {
            const info = await getMyReferralInfo()
            if ('error' in info) {
                toast.error('Could not load your referral link.')
                return
            }
            const url = `${window.location.origin}/join?ref=${info.referralCode}`
            await navigator.clipboard.writeText(url)
            toast.success('Referral link copied to clipboard!')
            // Mark checklist item complete
            await updateOnboardingData({ checklist_friend_invited: true })
        } catch {
            toast.error('Failed to copy referral link.')
        }
    }, [])

    // Register screen context so specialists know what the user is viewing
    useRegisterScreenContext(useMemo(() => {
        if (isLoading) return null
        const pulseData = pulse?.data as DailyPulseData | undefined
        const parts: string[] = ['Viewing the daily briefing page.']
        if (briefing?.narrative) parts.push(briefing.narrative)
        if (pulseData?.personal && Array.isArray(pulseData.blockers) && Array.isArray(pulseData.pending_approvals)) {
            parts.push(`${pulseData.personal.tasks_due_today ?? 0} tasks due today, ${pulseData.blockers.length} blockers, ${pulseData.pending_approvals.length} pending approvals.`)
        }
        if (strategyHealth.length > 0) {
            const atRisk = strategyHealth.filter(s => s.health === 'at-risk').length
            const offTrack = strategyHealth.filter(s => s.health === 'off-track').length
            if (atRisk > 0 || offTrack > 0) parts.push(`Strategy: ${atRisk} at risk, ${offTrack} off track.`)
        }
        return {
            pageTitle: 'Today (Daily Briefing)',
            summary: parts.join(' '),
            entities: strategyHealth.map(s => ({
                type: 'strategy-pillar',
                title: s.title,
                status: s.health,
                progress: s.progress,
            })),
        }
    }, [isLoading, briefing, pulse, strategyHealth]))

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

    // ─── Welcome state for new users / full error state ──────────

    if (bothFailed) {
        const userRole = initialOnboardingData?._userRole
        return (
            <div className="max-w-5xl space-y-8">
                <PageHeader />

                {/* Getting Started Hero — shown for new users even in empty state */}
                {initialOnboardingData && (
                    <GettingStartedHero onboardingData={initialOnboardingData} userRole={userRole} onShareReferral={handleShareReferral} />
                )}

                <Card className="rounded-xl border shadow-sm bg-gradient-to-br from-background to-international-orange/[0.03]">
                    <CardContent className="pt-8 pb-8 flex flex-col items-center gap-5 text-center">
                        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-international-orange/10">
                            <Sun className="h-7 w-7 text-international-orange" />
                        </div>

                        {userRole === 'Executive' ? (
                            <>
                                <div className="space-y-2 max-w-md">
                                    <p className="text-xl font-bold text-foreground">
                                        Ventures are looking for executives like you.
                                    </p>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Complete your profile so ventures can find you, then browse what&apos;s available in the marketplace.
                                    </p>
                                </div>
                                <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center">
                                    <Button asChild size="sm" className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white">
                                        <Link href="/my-profile">
                                            <Target className="h-3.5 w-3.5" />
                                            Complete your profile
                                        </Link>
                                    </Button>
                                    <Button variant="outline" size="sm" asChild className="gap-1.5">
                                        <Link href="/marketplace">
                                            <Waypoints className="h-3.5 w-3.5" />
                                            Browse the marketplace
                                        </Link>
                                    </Button>
                                </div>
                            </>
                        ) : userRole === 'Apprentice' ? (
                            <>
                                <div className="space-y-2 max-w-md">
                                    <p className="text-xl font-bold text-foreground">
                                        Your training toolkit is ready.
                                    </p>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Start your first training objective and explore the tools that will make you 10x more productive.
                                    </p>
                                </div>
                                <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center">
                                    <Button asChild size="sm" className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white">
                                        <Link href="/objectives">
                                            <Target className="h-3.5 w-3.5" />
                                            Start your training
                                        </Link>
                                    </Button>
                                    <Button variant="outline" size="sm" asChild className="gap-1.5">
                                        <Link href="/the-forge">
                                            <Waypoints className="h-3.5 w-3.5" />
                                            Explore the toolkit
                                        </Link>
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="space-y-2 max-w-md">
                                    <p className="text-xl font-bold text-foreground">
                                        Welcome to ForgeOS
                                    </p>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Your daily briefing will appear here once you start creating objectives and tasks.
                                        Get started by setting up your first goal.
                                    </p>
                                </div>
                                <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center">
                                    <Button asChild size="sm" className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white">
                                        <Link href="/new-objectives">
                                            <Target className="h-3.5 w-3.5" />
                                            Create your first objective
                                        </Link>
                                    </Button>
                                    <Button variant="outline" size="sm" asChild className="gap-1.5">
                                        <Link href="/strategy">
                                            <Waypoints className="h-3.5 w-3.5" />
                                            Explore strategy
                                        </Link>
                                    </Button>
                                </div>
                            </>
                        )}

                        <Button onClick={loadData} variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
                            <RefreshCw className="h-3 w-3" />
                            Retry loading
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // ─── Hero greeting text ───────────────────────────────────────

    const greetingLabel = briefing?.userName
        ? getTimeGreeting(briefing.userName)
        : briefing?.greeting ?? "Welcome back"

    // ─── Cal's daily briefing ───────────────────────────────────

    const isNewUser = !!initialOnboardingData && !initialOnboardingData.checklist_dismissed
    const onboardingStepsRemaining = isNewUser
        ? CHECKLIST_ITEMS.filter(item => !initialOnboardingData?.[item.key]).map(item => item.label)
        : undefined

    const calInput: TodayInsightInput | null = useMemo(() => {
        if (!briefing) return null
        const atRiskCount = briefing.atRiskObjectives?.length ?? 0
        const atRisk = strategyHealth.filter(s => s.health === "at-risk").length
        const offTrack = strategyHealth.filter(s => s.health === "off-track").length
        const nudgeSummary = (briefing.nudges ?? []).map(n => n.message).join("; ")
        return {
            userName: briefing.userName,
            overdueCount: briefing.overdueCount ?? 0,
            dueToday: pulseData?.personal?.tasks_due_today ?? briefing.topTasks?.length ?? 0,
            completedToday: pulseData?.personal?.tasks_completed_count ?? 0,
            blockerCount: pulseData?.blockers?.length ?? 0,
            pendingApprovalCount: pulseData?.pending_approvals?.length ?? 0,
            atRiskObjectiveCount: atRiskCount,
            strategyAtRisk: atRisk,
            strategyOffTrack: offTrack,
            unreadMessages: unreadCount,
            streak: briefing.streak ?? 0,
            nudgeSummary,
        }
    }, [briefing, pulse, strategyHealth, unreadCount])

    const { calNarrative, calInsights, isCalLoading, dismissInsight } = useCalBriefing(calInput, isNewUser, onboardingStepsRemaining)

    // FLOW: Cal's narrative replaces the old Gemini narrative. DB greeting is the instant fallback.
    const heroNarrative = calNarrative || briefing?.narrative || briefing?.greeting || ""

    // ─── Main render ──────────────────────────────────────────────

    return (
        <div className="max-w-5xl space-y-8">
            <PageHeader />

            {/* Getting Started Hero Checklist — shown for new users */}
            {initialOnboardingData && (
                <GettingStartedHero onboardingData={initialOnboardingData} userRole={initialOnboardingData._userRole} onShareReferral={handleShareReferral} />
            )}

            {/* Running Low on AI Tasks — Referral Nudge */}
            <ReferralNudgeBanner />

            {/* Hero Narrative Card */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE_CURVE }}
                data-tour="today-briefing"
            >
                <Card className="rounded-xl border shadow-sm bg-gradient-to-br from-background to-international-orange/[0.03] overflow-hidden">
                    <CardContent className="pt-6 pb-5">
                        {/* Cal identity + Greeting + Streak */}
                        <div className="flex items-start justify-between gap-3 mb-5">
                            <div className="flex items-start gap-3 min-w-0">
                                <div className="relative shrink-0">
                                    <Image
                                        src="/images/specialists/chief-of-staff.png"
                                        alt="Cal"
                                        width={40}
                                        height={40}
                                        className="rounded-xl"
                                    />
                                    <div className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-status-warning-light border border-background">
                                        {getTimeIcon("h-2.5 w-2.5")}
                                    </div>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">
                                        Cal, Chief of Staff
                                    </p>
                                    <p className="text-sm font-medium text-muted-foreground">
                                        {greetingLabel}
                                    </p>
                                    {isCalLoading ? (
                                        <p className="text-sm italic text-muted-foreground/60 mt-1">
                                            Scanning your workstreams...
                                        </p>
                                    ) : heroNarrative ? (
                                        <motion.p
                                            className="text-base font-semibold text-foreground leading-relaxed mt-1"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ duration: 0.4, ease: EASE_CURVE }}
                                        >
                                            {heroNarrative}
                                        </motion.p>
                                    ) : null}
                                </div>
                            </div>
                            {briefing && <StreakBadge streak={briefing.streak} className="shrink-0" />}
                        </div>

                        {/* Quick Stats with Trends */}
                        {pulseData?.personal && (
                            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
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
                                <TodayTimeCard />
                            </div>
                        )}

                        {/* Smart Nudges */}
                        {(briefing?.nudges?.length ?? 0) > 0 || unreadCount > 0 ? (
                            <div className="space-y-1.5">
                                {briefing?.nudges.map((nudge, i) => (
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

                                {unreadCount > 0 && (
                                    <div className="flex items-center gap-2 text-xs">
                                        <div className="w-1 h-4 rounded-full shrink-0 bg-status-info" />
                                        <span className="text-muted-foreground flex-1">
                                            You have {unreadCount} unread message{unreadCount !== 1 ? 's' : ''}
                                        </span>
                                        <Link
                                            href="/updates"
                                            className="text-international-orange hover:underline shrink-0 flex items-center gap-0.5"
                                        >
                                            View messages
                                            <ArrowRight className="h-3 w-3" />
                                        </Link>
                                    </div>
                                )}
                            </div>
                        ) : null}

                        {/* Intelligence Signal — shows how long the system has been learning */}
                        {briefing && briefing.intelligenceDaysOfData > 7 && (
                            <div className="flex items-start gap-2 mt-4 pt-3 border-t text-xs text-muted-foreground">
                                <Lightbulb className="h-3.5 w-3.5 shrink-0 text-status-warning mt-0.5" />
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

            {/* Cal's Urgency-Triaged Insights */}
            {calInsights.length > 0 && (
                <motion.div
                    className="space-y-3"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: EASE_CURVE }}
                >
                    {calInsights.map((insight) => (
                        <SpecialistInsightCard
                            key={insight.id}
                            insight={insight}
                            onDismiss={() => dismissInsight(insight.id)}
                            compact
                        />
                    ))}
                </motion.div>
            )}

            {/* Focus Tasks Section */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1, ease: EASE_CURVE }}
                data-tour="today-focus"
            >
                <FocusTasksSection
                    briefing={briefing}
                    overdueCount={briefing?.overdueCount ?? 0}
                />
            </motion.div>

            {/* Unread Messages Section */}
            {unreadCount > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.12, ease: EASE_CURVE }}
                >
                    <SectionHeader icon={MessageCircle} label="Unread Messages" color="text-status-info" />
                    <Card className="rounded-xl border">
                        <CardContent className="pt-4 pb-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-status-info-light shrink-0">
                                        <MessageCircle className="h-4 w-4 text-status-info" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-foreground">
                                            {unreadCount} unread message{unreadCount !== 1 ? 's' : ''}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Conversations waiting for your response
                                        </p>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" asChild className="gap-1.5 w-full sm:w-auto shrink-0">
                                    <Link href="/updates">
                                        View messages
                                        <ArrowRight className="h-3.5 w-3.5" />
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            )}

            {/* Blockers Section */}
            {pulseData && Array.isArray(pulseData.blockers) && pulseData.blockers.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.15, ease: EASE_CURVE }}
                >
                    <BlockersSection blockers={pulseData.blockers} />
                </motion.div>
            )}

            {/* Pending Approvals Section */}
            {pulseData && Array.isArray(pulseData.pending_approvals) && pulseData.pending_approvals.length > 0 && (
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

            {/* AI Team Intelligence — proactive insights from your 13 specialists */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.28, ease: EASE_CURVE }}
                data-tour="today-insights"
            >
                <SectionHeader icon={Waypoints} label="Your AI Team" color="text-international-orange" />
                <p className="text-xs text-muted-foreground -mt-3 mb-4 ml-7">
                    Proactive insights from your 13 AI specialists — they&apos;re always analyzing your business.
                </p>
                <div className="space-y-6">
                    <WeeklyBrief />
                    <InsightFeed />
                </div>
            </motion.div>

            {/* Insights Section */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3, ease: EASE_CURVE }}
            >
                <InsightsSection pulse={pulse} />
            </motion.div>

            {/* Specialist Quick Access */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.32, ease: EASE_CURVE }}
            >
                <Card className="rounded-xl border bg-muted/30">
                    <CardContent className="pt-5 pb-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Lightbulb className="h-4 w-4 text-international-orange" />
                            <span className="text-sm font-semibold text-foreground">Brief Your AI Team</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">
                            Ask any of your 13 AI specialists for advice, analysis, or action plans. They remember your past conversations and can create objectives and tasks for you.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <AskSpecialistButton
                                context={{
                                    type: 'general',
                                    title: 'Daily Planning',
                                    description: "Help me prioritize today's work and identify what matters most.",
                                    metadata: {
                                        notes: pulse?.data && 'blockers' in pulse.data
                                            ? `Today: ${(pulse.data as DailyPulseData).personal.tasks_due_today} tasks due, ${(pulse.data as DailyPulseData).blockers.length} blockers, ${(pulse.data as DailyPulseData).pending_approvals.length} pending approvals`
                                            : 'Starting a new day — help me plan.',
                                    },
                                }}
                                specialistId="chief-of-staff"
                                specialistName="Cal"
                                variant="chip"
                                label="Plan my day with Cal"
                            />
                            <AskSpecialistButton
                                context={{
                                    type: 'strategy',
                                    title: 'Strategy Check-in',
                                    description: 'Quick strategy pulse — where should I focus?',
                                }}
                                specialistId="strategist"
                                specialistName="Sage"
                                variant="chip"
                                label="Strategy with Sage"
                            />
                            <AskSpecialistButton
                                context={{
                                    type: 'general',
                                    title: 'General Consultation',
                                    description: 'Open-ended discussion about any business challenge.',
                                }}
                                variant="chip"
                                label="Choose Specialist"
                            />
                        </div>
                    </CardContent>
                </Card>
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

            {/* Tour only starts when the onboarding hero is no longer visible.
                GettingStartedHero hides itself when completedCount >= 3 OR dismissed.
                We replicate that check here to avoid starting the tour over the
                onboarding screen. */}
            {(() => {
                if (!initialOnboardingData) return <PageTour page="today" />
                const d = initialOnboardingData
                const dismissed = d.checklist_dismissed === true
                const completed = [
                    d.checklist_profile_completed,
                    d.checklist_video_watched,
                    d.checklist_objective_created,
                    d.checklist_team_member_added,
                    d.checklist_marketplace_explored,
                    d.checklist_forge_project_created,
                ].filter(Boolean).length
                return (dismissed || completed >= 3) ? <PageTour page="today" /> : null
            })()}
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
        <div className="max-w-5xl space-y-8">
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
                    <CardContent className="py-6 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-3">
                            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                            <p className="text-sm text-muted-foreground">
                                No tasks scheduled for today, but you have {overdueCount} overdue{" "}
                                {overdueCount === 1 ? "item" : "items"}.
                            </p>
                        </div>
                        <Button variant="outline" size="sm" asChild className="shrink-0 sm:ml-auto self-start sm:self-auto">
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
                                    <div className="hidden sm:block w-16 h-1.5 rounded-full bg-muted overflow-hidden">
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
