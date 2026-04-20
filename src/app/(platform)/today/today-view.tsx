/**
 * TodayView — V3 triage surface (PR #1.5 rebuild).
 *
 * @description The 8am "open-it-to-get-oriented" screen. Not a duplicate of
 * Money's Cockpit (which is a 2-minute finance deep-dive) — Today is the
 * across-the-whole-business triage that ranks signals by consequence × decay.
 *
 * Layout frame per FORGE-MOCKUP-TODAY-V3.html:
 *   V1  Greeting h1 ("Morning, {name}")
 *   V2  Chip row — weekday/time + danger/warning/info counts + streak
 *   V3  Headline grid — Priority slab (left) + Runway stub (right)
 *   V4  Minigrid — 3 tiles (Forge cost · Money pipeline · Plan tasks)
 *   V5  Waiting-on-you inbox — approvals + blockers (+ Send-standup nudge)
 *   V6  Mid-grid — ranked queue (filters + decay/section toggle) + Calendar peek
 *   V7  14-day risk horizon stub
 *   V8  Section label
 *   V9  4-section signals strip (Forge · Products · Money · Plan)
 *   V10 App-signals footer (Comms · Time · Review · Knowledge pills)
 *
 * Every MUST-preserve signal from TODAY-V3-SIGNAL-PORTING-MAP.md §8 is
 * rendered somewhere on this page. DROP-WITH-APPROVAL items (C2d/C8/C13/C15/C16)
 * applied per Tristan's 2026-04-19 confirmation — defaults noted in PR body.
 *
 * @component
 */

"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import Link from "next/link"
import Image from "next/image"
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
    RefreshCw,
    TrendingUp,
    TrendingDown,
    Waypoints,
    Building2,
    Users,
    X,
    ChevronDown,
    ChevronRight,
    Calendar,
    Flame,
    MessageSquare,
    FileCheck2,
    BookOpen,
    Megaphone,
} from "lucide-react"

import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getMorningBriefing, type MorningBriefing } from "@/actions/nudges"
import { getMyDailyPulse, type DailyPulseResult } from "@/actions/reports"
import { getStrategyHealthSummary, type StrategyHealthItem } from "@/actions/canvas"
import { getUnreadCount } from "@/actions/messaging"
import { StreakBadge } from "@/components/celebrations/StreakBadge"
import { ReferralNudgeBanner } from "@/components/ui/referral-nudge-banner"
import { useCelebration } from "@/hooks/useCelebration"
import { AskSpecialistButton } from "@/components/specialists/ask-specialist-button"
import { InsightFeed } from "@/components/insights/insight-feed"
import { WeeklyBrief } from "@/components/insights/weekly-brief"
import { useRegisterScreenContext } from "@/contexts/screen-context"
import { GettingStartedHero } from "@/components/onboarding/getting-started-hero"
import { FractionalExecPromoCard } from "@/components/today/fractional-exec-promo"
import { PlanPanel } from "@/components/today/PlanPanel"
import { PageTour } from "@/components/guidance/page-tour"
import { CreateCompanyDialog } from "@/components/create-company-dialog"
import type { FormattedReport, DailyPulseData } from "@/lib/reports/types"
import { updateOnboardingData, type OnboardingData } from "@/actions/onboarding"
import { getMyReferralInfo } from "@/actions/referrals"
import { useWeeklyTime } from "@/hooks/use-weekly-time"
import { useCalBriefing } from "./use-cal-briefing"
import { ReleaseNoticeBanner } from "./release-notice-banner"
import { SpecialistInsightCard } from "@/components/specialists/specialist-insight-card"
import { useAdvisorPanel } from "@/contexts/advisor-panel-context"
import { CHECKLIST_ITEMS } from "@/components/onboarding/GettingStartedChecklist"
import type { TodayInsightInput } from "@/actions/specialist-page-insights"
import { useTodayForgeFeed } from "@/hooks/useTodayForgeFeed"
import { useTodayMoneyFeed } from "@/hooks/useTodayMoneyFeed"
import type { TodaySignal, TodaySignalSection } from "@/types/today"
import { DECAY_RATE_RANK } from "@/types/today"
import {
    getTodayMoneyRunwayTile,
    getTodayMoneyPipelineTile,
    type TodayMoneyRunwayTile,
    type TodayMoneyPipelineTile,
} from "@/actions/money-today"

// ─── Props ────────────────────────────────────────────────────────

interface TodayViewProps {
    initialBriefing: MorningBriefing | null
    initialPulse: FormattedReport | null
    initialStrategyHealth: StrategyHealthItem[]
    initialUnreadCount: number
    initialBriefingError: boolean
    initialPulseError: boolean
    initialOnboardingData?: OnboardingData & { _userRole?: string; _isSandbox?: boolean }
    /** Render the "List yourself as a fractional executive" promo card. */
    showFractionalExecPrompt?: boolean
    /** Active foundry for the useTodayForgeFeed Realtime subscription. Null = hook skips subscribe. */
    foundryId: string | null
}

// ─── Constants ────────────────────────────────────────────────────

const STREAK_MILESTONES = [3, 7, 14, 30] as const
const EASE_CURVE = [0.22, 1, 0.36, 1] as const

// ─── Source-tag palette ───────────────────────────────────────────
// Mockup uses 7 source colours; map each to semantic / permitted palette tokens
// (international-orange, electric-blue, status-*, sky/lime/purple/teal are not
// in check-design-tokens.sh's forbidden set). No hardcoded hex.

type QueueSource = TodaySignalSection | 'compliance' | 'comms' | 'people'

const SOURCE_LABEL: Record<QueueSource, string> = {
    forge: 'Forge',
    products: 'Products',
    plan: 'Plan',
    money: 'Money',
    meta: 'Meta',
    compliance: 'Compliance',
    comms: 'Comms',
    people: 'People',
}

const SOURCE_CLASS: Record<QueueSource, string> = {
    forge:       'bg-international-orange/10 text-international-orange border border-international-orange/20',
    products:    'bg-sky-50 text-sky-700 border border-sky-200',
    plan:        'bg-lime-50 text-lime-700 border border-lime-200',
    money:       'bg-purple-50 text-purple-700 border border-purple-200',
    meta:        'bg-muted text-muted-foreground border border-border',
    compliance:  'bg-status-warning-light text-status-warning border border-status-warning/30',
    comms:       'bg-teal-50 text-teal-700 border border-teal-200',
    people:      'bg-sky-100 text-sky-700 border border-sky-200',
}

function SourceTag({ source, className }: { source: QueueSource; className?: string }): React.ReactElement {
    return (
        <span className={cn(
            "inline-flex items-center gap-1 rounded text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5",
            SOURCE_CLASS[source],
            className,
        )}>
            {SOURCE_LABEL[source]}
        </span>
    )
}

// ─── Time-of-day helpers ─────────────────────────────────────────

function getTimeIcon(size = "h-5 w-5"): React.ReactElement {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return <Sun className={`${size} text-status-warning`} />
    if (hour >= 12 && hour < 17) return <CloudSun className={`${size} text-status-warning`} />
    return <Moon className={`${size} text-electric-blue`} />
}

function getTimeGreeting(name: string): string {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return `Good morning, ${name}`
    if (hour >= 12 && hour < 17) return `Good afternoon, ${name}`
    return `Good evening, ${name}`
}

function formatWeekdayDate(now: Date): string {
    return now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

function formatClock(now: Date): string {
    return now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// ─── Queue signal normalization ──────────────────────────────────

interface QueueItem {
    key: string
    label: string
    sub?: string
    source: QueueSource
    decayLabel: string
    decayTone: 'overdue' | 'warn' | 'normal'
    decayRank: number       // 0 = immediate, higher = later
    consequenceWeight: number
    ctaHref: string
    ctaLabel: string
}

function daysBetween(from: Date, toISO: string | null | undefined): number | null {
    if (!toISO) return null
    const to = new Date(toISO)
    if (Number.isNaN(to.getTime())) return null
    const MS_PER_DAY = 86_400_000
    return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY)
}

function formatDecayFromDays(days: number): { label: string; tone: QueueItem['decayTone']; rank: number } {
    if (days < 0) return { label: `${days} days`, tone: 'overdue', rank: -days }
    if (days <= 3) return { label: `${days} days`, tone: 'warn', rank: 10 + days }
    if (days <= 14) return { label: `${days} days`, tone: 'warn', rank: 20 + days }
    return { label: `${days} days`, tone: 'normal', rank: 100 + days }
}

function buildQueueItems(params: {
    briefing: MorningBriefing | null
    pulseInsights: FormattedReport['insights'] | null
    forgeFeedSignals: TodaySignal[]
    moneyFeedSignals: TodaySignal[]
}): QueueItem[] {
    const { briefing, pulseInsights, forgeFeedSignals, moneyFeedSignals } = params
    const now = new Date()
    const items: QueueItem[] = []

    // topTasks → plan rows
    briefing?.topTasks?.forEach((task) => {
        const days = daysBetween(now, task.dueDate)
        const decay = days !== null
            ? formatDecayFromDays(days)
            : task.isOverdue
                ? { label: 'Overdue', tone: 'overdue' as const, rank: 0 }
                : { label: 'Due today', tone: 'warn' as const, rank: 10 }
        items.push({
            key: `task-${task.id}`,
            label: task.title,
            sub: task.objectiveTitle ?? undefined,
            source: 'plan',
            decayLabel: decay.label,
            decayTone: decay.tone,
            decayRank: decay.rank,
            consequenceWeight: task.isOverdue ? 2 : 1,
            ctaHref: '/new-tasks',
            ctaLabel: 'Open',
        })
    })

    // atRiskObjectives → plan rows
    briefing?.atRiskObjectives?.forEach((obj) => {
        const days = obj.daysUntilDeadline ?? null
        const decay = days !== null
            ? formatDecayFromDays(days)
            : { label: obj.reason, tone: 'warn' as const, rank: 15 }
        items.push({
            key: `obj-${obj.id}`,
            label: obj.title,
            sub: obj.reason ? `${obj.progress}% · ${obj.reason}` : `${obj.progress}%`,
            source: 'plan',
            decayLabel: decay.label,
            decayTone: decay.tone,
            decayRank: decay.rank,
            consequenceWeight: 1.5,
            ctaHref: '/new-objectives',
            ctaLabel: 'Review',
        })
    })

    // briefing.nudges → meta rows (every nudge preserved)
    briefing?.nudges?.forEach((nudge, idx) => {
        const toneByType: Record<MorningBriefing['nudges'][number]['type'], QueueItem['decayTone']> = {
            overdue: 'overdue',
            at_risk: 'warn',
            stale: 'warn',
            momentum: 'normal',
        }
        const rankByType: Record<MorningBriefing['nudges'][number]['type'], number> = {
            overdue: 1,
            at_risk: 12,
            stale: 25,
            momentum: 50,
        }
        items.push({
            key: `nudge-${idx}`,
            label: nudge.message,
            source: 'meta',
            decayLabel: nudge.type.replace('_', ' '),
            decayTone: toneByType[nudge.type],
            decayRank: rankByType[nudge.type],
            consequenceWeight: nudge.type === 'overdue' ? 1.5 : 0.8,
            ctaHref: nudge.actionHref ?? '#',
            ctaLabel: nudge.actionLabel ?? 'Open',
        })
    })

    // pulse.insights (warning + suggestion) → meta rows (celebration folded into hero chip)
    pulseInsights?.forEach((insight) => {
        if (insight.type === 'celebration') return
        items.push({
            key: `pi-${insight.id}`,
            label: insight.title,
            sub: insight.description,
            source: 'meta',
            decayLabel: insight.type,
            decayTone: insight.type === 'warning' ? 'warn' : 'normal',
            decayRank: insight.type === 'warning' ? 18 : 40,
            consequenceWeight: insight.type === 'warning' ? 1.2 : 0.6,
            ctaHref: insight.action?.href ?? '#',
            ctaLabel: insight.action?.label ?? 'Open',
        })
    })

    // useTodayForgeFeed + useTodayMoneyFeed signals → section rows.
    // Both hooks return TodaySignal shapes and merge into the same queue;
    // we tag the queue key with the section to keep React keys stable across
    // mixed-source updates.
    const sectionFeed: Array<{ keyPrefix: string; sigs: TodaySignal[] }> = [
        { keyPrefix: 'forge', sigs: forgeFeedSignals },
        { keyPrefix: 'money', sigs: moneyFeedSignals },
    ]
    sectionFeed.forEach(({ keyPrefix, sigs }) => {
        sigs.forEach((sig) => {
            const rank = sig.decayRate ? DECAY_RATE_RANK[sig.decayRate] : 100
            const tone: QueueItem['decayTone'] =
                sig.decayRate === 'immediate' ? 'overdue' :
                sig.decayRate === '1d' || sig.decayRate === '3d' ? 'warn' :
                'normal'
            const decayLabel =
                sig.decayRate === 'immediate' ? 'Now' :
                sig.decayRate === '1d' ? '1 day' :
                sig.decayRate === '3d' ? '3 days' :
                sig.decayRate === '7d' ? '7 days' :
                sig.decayRate === '30d' ? '30 days' :
                'open'
            items.push({
                key: `${keyPrefix}-${sig.id}`,
                label: sig.title,
                sub: sig.body ?? undefined,
                source: sig.section,
                decayLabel,
                decayTone: tone,
                decayRank: rank,
                consequenceWeight: sig.consequenceWeight ?? 1,
                ctaHref: sig.ctaHref ?? '#',
                ctaLabel: sig.ctaLabel ?? 'Open',
            })
        })
    })

    // Sort: decayRank asc, then consequence desc, then key for stability
    return items.sort((a, b) => {
        if (a.decayRank !== b.decayRank) return a.decayRank - b.decayRank
        if (a.consequenceWeight !== b.consequenceWeight) return b.consequenceWeight - a.consequenceWeight
        return a.key.localeCompare(b.key)
    })
}

// ─── Waiting-on-you items ────────────────────────────────────────

interface WaitingItem {
    key: string
    initials: string           // avatar letters
    who: string                // "Jian · Engineering"
    ask: string                // body sentence
    meta: string               // "Queued X · {source-tag} · reason"
    source: QueueSource
    ctaPrimary: { label: string; href: string }
    ctaAsk?: { label: string; onClick?: () => void; href?: string }
    ctaDismiss?: { label: string; onClick?: () => void; href?: string }
}

function initials(name: string | undefined | null): string {
    if (!name) return '??'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] ?? '').concat(parts[parts.length - 1][0] ?? '').toUpperCase()
}

function buildWaitingItems(params: {
    approvals: DailyPulseData['pending_approvals']
    blockers: DailyPulseData['blockers']
}): WaitingItem[] {
    const items: WaitingItem[] = []
    params.approvals.forEach((ap) => {
        items.push({
            key: `ap-${ap.task_id}`,
            initials: initials(ap.assignee_name ?? undefined),
            who: ap.assignee_name ? `${ap.assignee_name} · Review` : 'Review request',
            ask: `— approve ${ap.title}?`,
            meta: 'Pending approval',
            source: 'plan',
            ctaPrimary: { label: 'Approve', href: '/new-tasks' },
            ctaAsk: { label: 'Ask', href: '/new-tasks' },
            ctaDismiss: { label: 'Reject', href: '/new-tasks' },
        })
    })
    params.blockers.forEach((bl, idx) => {
        const severity = bl.severity ?? 'normal'
        const sevLabel = severity === 'high' || severity === 'critical' ? ` · ${severity}` : ''
        items.push({
            key: `bl-${idx}-${bl.user_name ?? 'anon'}`,
            initials: initials(bl.user_name ?? undefined),
            who: bl.user_name ? `${bl.user_name} · Blocker` : 'Team blocker',
            ask: `— ${bl.blocker}`,
            meta: `Blocker${sevLabel}`,
            source: 'plan',
            ctaPrimary: { label: 'View', href: '/new-tasks' },
            ctaAsk: { label: 'Ask', href: '/new-tasks' },
            ctaDismiss: { label: 'Dismiss', href: '/new-tasks' },
        })
    })
    return items
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
    showFractionalExecPrompt = false,
    foundryId,
}: TodayViewProps): React.ReactElement {
    const [briefing, setBriefing] = useState<MorningBriefing | null>(initialBriefing)
    const [pulse, setPulse] = useState<FormattedReport | null>(initialPulse)
    const [strategyHealth, setStrategyHealth] = useState<StrategyHealthItem[]>(initialStrategyHealth)
    const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
    const [isLoading, setIsLoading] = useState(false)
    const [briefingError, setBriefingError] = useState(initialBriefingError)
    const [pulseError, setPulseError] = useState(initialPulseError)
    const [sandboxBannerDismissed, setSandboxBannerDismissed] = useState(initialOnboardingData?.sandbox_banner_dismissed === true)
    const [showCreateCompany, setShowCreateCompany] = useState(false)

    // Queue UI state
    const [queueFilter, setQueueFilter] = useState<'all' | QueueSource>('all')
    const [queueView, setQueueView] = useState<'decay' | 'section'>('decay')
    const [teamBriefOpen, setTeamBriefOpen] = useState(false)

    // Migrated users went through old onboarding but are now in sandbox
    const isMigratedUser = !!(initialOnboardingData?._isSandbox && !initialOnboardingData?.intent_selection && initialOnboardingData?.has_completed_onboarding)

    const handleDismissSandboxBanner = useCallback(() => {
        setSandboxBannerDismissed(true)
        updateOnboardingData({ sandbox_banner_dismissed: true }).catch(() => {
            setSandboxBannerDismissed(false)
        })
    }, [])

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

        if (briefingResult.data) setBriefing(briefingResult.data)
        else setBriefingError(true)

        if (pulseResult.success && pulseResult.data) setPulse(pulseResult.data)
        else setPulseError(true)

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
            await updateOnboardingData({ checklist_friend_invited: true })
        } catch {
            toast.error('Failed to copy referral link.')
        }
    }, [])

    // ─── Derived data ─────────────────────────────────────────────

    const pulseData = pulse?.data as DailyPulseData | undefined
    const bothFailed = briefingError && pulseError

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
            strategyPillars: strategyHealth.map(s => ({ title: s.title, health: s.health, progress: s.progress })),
            totalPillarCount: strategyHealth.length,
            completedYesterday: briefing.completedYesterday ?? 0,
            velocityTrend: briefing.velocityTrend ?? 0,
            teamCompletionRate: pulseData?.team?.completion_rate ?? 0,
        }
    }, [briefing, pulseData, strategyHealth, unreadCount])

    const { calNarrative, calInsights, isCalLoading, dismissInsight, refreshBriefing } = useCalBriefing(calInput, isNewUser, onboardingStepsRemaining)

    const { openPanel } = useAdvisorPanel()
    const handleDiscussInsight = (specialistId: string, context: string) => {
        openPanel(specialistId, { handoffContext: context, contextLabel: 'Today' })
    }

    // ─── Forge + Money feeds (Supabase Realtime) ─────────────────

    const forgeFeed = useTodayForgeFeed({ foundryId })
    const moneyFeed = useTodayMoneyFeed({ foundryId })

    // ─── Money tile state (runway + pipeline) ────────────────────
    // Phase 2: replace the V3b/V4/V9 stubs with live data. Each tile fetches
    // independently so a slow runway calculation doesn't block the pipeline tile.
    const [moneyRunwayTile, setMoneyRunwayTile] = useState<TodayMoneyRunwayTile | null>(null)
    const [moneyPipelineTile, setMoneyPipelineTile] = useState<TodayMoneyPipelineTile | null>(null)

    useEffect(() => {
        let cancelled = false
        Promise.allSettled([
            getTodayMoneyRunwayTile(),
            getTodayMoneyPipelineTile(),
        ]).then(([runwayRes, pipelineRes]) => {
            if (cancelled) return
            if (runwayRes.status === 'fulfilled' && !('error' in runwayRes.value)) {
                setMoneyRunwayTile(runwayRes.value)
            }
            if (pipelineRes.status === 'fulfilled' && !('error' in pipelineRes.value)) {
                setMoneyPipelineTile(pipelineRes.value)
            }
        })
        return () => { cancelled = true }
    }, [])

    // ─── Queue items (merged + sorted) ────────────────────────────

    const allQueueItems = useMemo(() => buildQueueItems({
        briefing,
        pulseInsights: pulse?.insights ?? null,
        forgeFeedSignals: forgeFeed.signals,
        moneyFeedSignals: moneyFeed.signals,
    }), [briefing, pulse, forgeFeed.signals, moneyFeed.signals])

    const visibleQueueItems = useMemo(() => {
        const filtered = queueFilter === 'all'
            ? allQueueItems
            : allQueueItems.filter(i => i.source === queueFilter)
        if (queueView === 'section') {
            return [...filtered].sort((a, b) => a.source.localeCompare(b.source) || a.decayRank - b.decayRank)
        }
        return filtered
    }, [allQueueItems, queueFilter, queueView])

    const waitingItems = useMemo(() => buildWaitingItems({
        approvals: pulseData?.pending_approvals ?? [],
        blockers: pulseData?.blockers ?? [],
    }), [pulseData])

    // ─── Hero chips counts ───────────────────────────────────────

    const celebrations = useMemo(() => (pulse?.insights ?? []).filter(i => i.type === 'celebration'), [pulse])
    const overdueCount = briefing?.overdueCount ?? 0
    const waitingOnYouCount = waitingItems.length

    // ─── Screen context registration (for AdvisorPanel) ──────────

    useRegisterScreenContext(useMemo(() => {
        if (isLoading) return null
        const parts: string[] = ['Viewing the Today V3 triage surface.']
        if (briefing?.narrative) parts.push(briefing.narrative)
        if (pulseData?.personal && Array.isArray(pulseData.blockers) && Array.isArray(pulseData.pending_approvals)) {
            parts.push(`${pulseData.personal.tasks_due_today ?? 0} tasks due today, ${pulseData.blockers.length} blockers, ${pulseData.pending_approvals.length} pending approvals.`)
        }
        parts.push(`Waiting-on-you: ${waitingOnYouCount}. Queue total: ${allQueueItems.length}.`)
        if (strategyHealth.length > 0) {
            const atRisk = strategyHealth.filter(s => s.health === 'at-risk').length
            const offTrack = strategyHealth.filter(s => s.health === 'off-track').length
            if (atRisk > 0 || offTrack > 0) parts.push(`Strategy: ${atRisk} at risk, ${offTrack} off track.`)
        }
        return {
            pageTitle: 'Today (V3 triage)',
            summary: parts.join(' '),
            entities: strategyHealth.map(s => ({
                type: 'strategy-pillar',
                title: s.title,
                status: s.health,
                progress: s.progress,
            })),
        }
    }, [isLoading, briefing, pulseData, strategyHealth, waitingOnYouCount, allQueueItems.length]))

    // ─── Celebration effects ──────────────────────────────────────

    useEffect(() => {
        if (!briefing || isLoading) return

        if (
            !streakCelebratedRef.current &&
            STREAK_MILESTONES.includes(briefing.streak as typeof STREAK_MILESTONES[number])
        ) {
            streakCelebratedRef.current = true
            celebrateStreak(briefing.streak)
        }

        if (
            !confettiFiredRef.current &&
            briefing.topTasks.length === 0 &&
            briefing.overdueCount === 0
        ) {
            confettiFiredRef.current = true
            fireConfetti()
        }
    }, [briefing, isLoading, celebrateStreak, fireConfetti])

    // ─── Loading ─────────────────────────────────────────────────

    if (isLoading) return <TodayViewSkeleton />

    // ─── Error-branch "welcome" view (preserved verbatim) ────────

    if (bothFailed) {
        const userRole = initialOnboardingData?._userRole
        return (
            <div className="max-w-5xl space-y-8">
                <ReleaseNoticeBanner />
                <FractionalExecPromoCard visible={showFractionalExecPrompt} />

                {initialOnboardingData && (
                    <GettingStartedHero onboardingData={initialOnboardingData} userRole={userRole} onShareReferral={handleShareReferral} />
                )}

                {initialOnboardingData?._isSandbox && !sandboxBannerDismissed && (
                    <SandboxWelcomeBanner
                        isMigratedUser={isMigratedUser}
                        onDismiss={handleDismissSandboxBanner}
                        onCreateCompany={() => setShowCreateCompany(true)}
                    />
                )}
                <CreateCompanyDialog open={showCreateCompany} onOpenChange={setShowCreateCompany} />

                <Card className="rounded-xl border shadow-sm bg-gradient-to-br from-background to-international-orange/[0.03]">
                    <CardContent className="pt-8 pb-8 flex flex-col items-center gap-5 text-center">
                        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-international-orange/10">
                            <Sun className="h-7 w-7 text-international-orange" />
                        </div>

                        {userRole === 'Executive' ? (
                            <ErrorBranchExecutive />
                        ) : userRole === 'Apprentice' ? (
                            <ErrorBranchApprentice />
                        ) : (
                            <ErrorBranchDefault />
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

    // ─── Greeting text ────────────────────────────────────────────

    const firstName = briefing?.userName ?? 'there'
    const greetingLabel = briefing?.userName ? getTimeGreeting(briefing.userName) : briefing?.greeting ?? "Welcome back"
    const heroNarrative = calNarrative || briefing?.narrative || briefing?.greeting || ""
    const now = new Date()

    // ─── Priority slab content (stubbed per §9 open-question 1) ──
    const prioritySlab = pickPrioritySlab(allQueueItems, briefing, waitingItems)

    // ─── Minigrid derivations ────────────────────────────────────

    const dueToday = pulseData?.personal?.tasks_due_today ?? 0
    const tasksOverdue = pulseData?.personal?.tasks_overdue ?? 0
    const atRiskCount = briefing?.atRiskObjectives?.length ?? 0
    const onTrackCount = strategyHealth.filter(s => s.health === 'on-track').length
    const pillarTotal = strategyHealth.length

    // ─── Main render — V3 frame ──────────────────────────────────

    return (
        <div className="max-w-5xl space-y-6">
            {/* Above-V1: dismissible/onboarding banners (preserved) */}
            <ReleaseNoticeBanner />
            <FractionalExecPromoCard visible={showFractionalExecPrompt} />

            {initialOnboardingData && (
                <GettingStartedHero onboardingData={initialOnboardingData} userRole={initialOnboardingData._userRole} onShareReferral={handleShareReferral} />
            )}

            {initialOnboardingData?._isSandbox && !sandboxBannerDismissed && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_CURVE }}>
                    <SandboxWelcomeBanner
                        isMigratedUser={isMigratedUser}
                        onDismiss={handleDismissSandboxBanner}
                        onCreateCompany={() => setShowCreateCompany(true)}
                    />
                </motion.div>
            )}
            <CreateCompanyDialog open={showCreateCompany} onOpenChange={setShowCreateCompany} />

            {/* V1 + V2 — greeting + chip row + Cal narrative line */}
            <section data-tour="today-briefing" aria-label="Today greeting">
                <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight mb-1">
                    {firstName === 'there' ? 'Welcome back' : `Morning, ${firstName}`}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                        {getTimeIcon("h-3.5 w-3.5")}
                        {formatWeekdayDate(now)} · {formatClock(now)}
                    </span>
                    {tasksOverdue > 0 && (
                        <Chip tone="danger" label={`${tasksOverdue} overdue`} />
                    )}
                    {overdueCount > 0 && tasksOverdue === 0 && (
                        <Chip tone="warning" label={`${overdueCount} overdue`} />
                    )}
                    {waitingOnYouCount > 0 && (
                        <Chip tone="info" label={`${waitingOnYouCount} waiting on you`} />
                    )}
                    {briefing && briefing.streak > 0 && (
                        <StreakBadge streak={briefing.streak} />
                    )}
                </div>

                {/* Cal's narrative line */}
                <div className="mt-3 flex items-start gap-2.5 text-sm">
                    <Image
                        src="/images/specialists/chief-of-staff.png"
                        alt=""
                        width={28}
                        height={28}
                        className="rounded-lg shrink-0"
                    />
                    <div className="flex-1 min-w-0" aria-live="polite">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                            Cal says · {greetingLabel}
                        </p>
                        {isCalLoading ? (
                            <p className="text-sm italic text-muted-foreground/60" aria-label="Loading Cal's briefing">
                                Scanning your workstreams…
                            </p>
                        ) : heroNarrative ? (
                            <motion.p
                                className="text-sm font-medium text-foreground leading-relaxed"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.4, ease: EASE_CURVE }}
                            >
                                {heroNarrative}
                            </motion.p>
                        ) : null}
                        <div className="flex items-center gap-2 mt-1.5">
                            <AskSpecialistButton
                                context={{
                                    type: 'general',
                                    title: 'Daily Briefing Follow-up',
                                    description: `Cal's briefing: "${heroNarrative}" — continue this conversation.`,
                                    metadata: {
                                        notes: calInput
                                            ? [
                                                `Overdue: ${calInput.overdueCount}, Due today: ${calInput.dueToday}, Completed: ${calInput.completedToday}, Blockers: ${calInput.blockerCount}`,
                                                ...(calInput.strategyPillars ?? []).map(p => `Pillar "${p.title}": ${p.health}, ${p.progress}%`),
                                            ].join('. ')
                                            : undefined,
                                    },
                                }}
                                specialistId="chief-of-staff"
                                specialistName="Cal"
                                variant="chip"
                                label="Reply to Cal"
                            />
                            {calNarrative && (
                                <button
                                    onClick={refreshBriefing}
                                    disabled={isCalLoading}
                                    className="p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 transition-colors disabled:opacity-30"
                                    title="Refresh briefing"
                                    aria-label="Refresh Cal's briefing"
                                >
                                    <RefreshCw className={cn("h-3 w-3", isCalLoading && "animate-spin")} />
                                </button>
                            )}
                            {celebrations.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs text-status-success">
                                    <CheckCircle2 className="h-3 w-3" />
                                    {celebrations[0].title}
                                </span>
                            )}
                        </div>

                        {/* C2d quiet caption — gated days>7 per Tristan's confirmed default */}
                        {briefing && briefing.intelligenceDaysOfData > 7 && (
                            <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                                Based on {briefing.intelligenceDaysOfData} days
                                {briefing.bestProductivityDay && ` · best day ${briefing.bestProductivityDay}`}
                                {briefing.velocityTrend !== 0 && ` · velocity ${briefing.velocityTrend > 0 ? '+' : ''}${briefing.velocityTrend}%`}
                            </p>
                        )}
                    </div>
                </div>

                {/* Partial data warning */}
                {pulseError && !briefingError && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1">Some data unavailable</span>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={loadData}>
                            <RefreshCw className="h-3 w-3" /> Retry
                        </Button>
                    </div>
                )}
            </section>

            {/* V3 — Headline grid: Priority slab + Runway stub */}
            <div className="grid grid-cols-1 lg:grid-cols-[2.2fr_1fr] gap-4">
                <PrioritySlab item={prioritySlab} />
                <RunwayStub data={moneyRunwayTile} />
            </div>

            {/* V4 — Minigrid: Forge cost · Money pipeline · Plan tasks */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <ForgeCostTile signals={forgeFeed.signals} />
                <MoneyPipelineTile data={moneyPipelineTile} />
                <PlanTasksTile
                    onTrack={onTrackCount}
                    pillarTotal={pillarTotal}
                    atRisk={atRiskCount}
                    dueToday={dueToday}
                    completedYesterday={pulseData?.trends?.personal_completed_yesterday ?? 0}
                    completedToday={pulseData?.personal?.tasks_completed_count ?? 0}
                    teamTotalCompleted={pulseData?.team?.total_completed ?? 0}
                />
            </div>

            {/* Cal's Urgency-Triaged Insights — preserved as compact block */}
            {calInsights.length > 0 && (
                <motion.div
                    className="space-y-3"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: EASE_CURVE }}
                    aria-label="Cal's insights"
                >
                    {calInsights.map((insight) => (
                        <SpecialistInsightCard
                            key={insight.id}
                            insight={insight}
                            onDismiss={() => dismissInsight(insight.id)}
                            onDiscuss={handleDiscussInsight}
                            compact
                        />
                    ))}
                </motion.div>
            )}

            {/* V5 — Waiting-on-you inbox */}
            {waitingItems.length > 0 && (
                <WaitingOnYouCard items={waitingItems} />
            )}

            {/* V6 — Mid-grid: ranked queue + calendar peek */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4" data-tour="today-focus">
                <QueueCard
                    items={visibleQueueItems}
                    total={allQueueItems.length}
                    filter={queueFilter}
                    onFilterChange={setQueueFilter}
                    view={queueView}
                    onViewChange={setQueueView}
                />
                <CalendarPeekStub />
            </div>

            {/* V7 — 14-day horizon stub */}
            <HorizonStub />

            {/* V8 — section label */}
            <div className="flex items-baseline justify-between pt-2">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Where you stand · 4 sections at a glance
                </h3>
                <span className="text-[11px] text-muted-foreground/70">
                    Each card links to its section
                </span>
            </div>

            {/* V9 — 4-section signals strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <ForgeSignalCard forgeSignals={forgeFeed.signals} />
                <ProductsSignalCard />
                <MoneySignalCard
                    runway={moneyRunwayTile}
                    pipeline={moneyPipelineTile}
                    signals={moneyFeed.signals}
                />
                <PlanSignalCard
                    onTrack={onTrackCount}
                    pillarTotal={pillarTotal}
                    atRisk={atRiskCount}
                    dueThisWeek={dueToday}
                />
            </div>

            {/* Chunk D — Plan live feed (PLAN-SCHEMA §14.5, Supabase Realtime). */}
            <PlanPanel foundryId={foundryId} />

            {/* Strategy spotlight — preserved below V9 per map §3 row 22 */}
            {strategyHealth.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: EASE_CURVE }}
                >
                    <StrategySpotlightSection items={strategyHealth} />
                </motion.div>
            )}

            {/* Team brief — C13 collapsed-by-default per Tristan's default */}
            <section aria-label="Team brief" data-tour="today-insights">
                <button
                    type="button"
                    onClick={() => setTeamBriefOpen(v => !v)}
                    className="flex items-center gap-2 w-full text-left py-2 px-3 rounded-lg border border-border hover:bg-muted/40 transition-colors"
                    aria-expanded={teamBriefOpen}
                >
                    {teamBriefOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <Waypoints className="h-4 w-4 text-international-orange" />
                    <span className="text-sm font-semibold text-foreground">Team brief</span>
                    <span className="text-xs text-muted-foreground">· Proactive insights from your 13 specialists</span>
                </button>
                {teamBriefOpen && (
                    <div className="mt-3 space-y-6">
                        <WeeklyBrief />
                        <InsightFeed />
                    </div>
                )}
            </section>

            {/* V10 — App-signals footer pill row */}
            <AppSignalsFooter
                unreadCount={unreadCount}
                reviewCount={pulseData?.pending_approvals?.length ?? 0}
            />

            {/* C15 demoted — thin chip row below V10 */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium pr-1">
                    Brief a specialist
                </span>
                <AskSpecialistButton
                    context={{
                        type: 'general',
                        title: 'Daily Planning',
                        description: "Help me prioritize today's work and identify what matters most.",
                        metadata: {
                            notes: pulseData
                                ? `Today: ${pulseData.personal.tasks_due_today} tasks due, ${pulseData.blockers.length} blockers, ${pulseData.pending_approvals.length} pending approvals`
                                : 'Starting a new day — help me plan.',
                        },
                    }}
                    specialistId="chief-of-staff"
                    specialistName="Cal"
                    variant="chip"
                    label="Plan with Cal"
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
                    label="Choose specialist"
                />
            </div>

            {/* Referral nudge — NICE, below footer */}
            <ReferralNudgeBanner />

            {/* PageTour — only once onboarding hero is gone */}
            {(() => {
                if (!initialOnboardingData) return <PageTour page="today" />
                const d = initialOnboardingData
                const dismissed = d.checklist_dismissed === true
                const completed = [
                    d.checklist_profile_completed,
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

// ─── Priority slab selector ──────────────────────────────────────

function pickPrioritySlab(
    items: QueueItem[],
    briefing: MorningBriefing | null,
    waitingItems: WaitingItem[],
): QueueItem | null {
    // Skip meta/nudge items — the priority slab should promote real priorities
    // (forge / products / plan / money / compliance), not echo a nudge that
    // already renders in the queue. Otherwise the same signal sits in two
    // surfaces — exactly the "one signal, two surfaces" bug the V3 annotations
    // warn against.
    const realPriority = items.find(i => i.source !== 'meta')
    if (realPriority) return realPriority
    if (waitingItems.length > 0) {
        const first = waitingItems[0]
        return {
            key: first.key,
            label: first.ask.replace(/^—\s*/, ''),
            sub: first.who,
            source: first.source,
            decayLabel: first.meta,
            decayTone: 'warn',
            decayRank: 5,
            consequenceWeight: 1.5,
            ctaHref: first.ctaPrimary.href,
            ctaLabel: first.ctaPrimary.label,
        }
    }
    // No real priorities and no waiting items → return null so PrioritySlab
    // renders its empty-state branch (green check + "all caught up" copy).
    // Meta nudges still render in the queue card below.
    void briefing
    return null
}

// ─── Chip ────────────────────────────────────────────────────────

function Chip({ tone, label }: { tone: 'danger' | 'warning' | 'info'; label: string }): React.ReactElement {
    const classMap = {
        danger: 'bg-destructive/10 text-destructive border-destructive/30',
        warning: 'bg-status-warning-light text-status-warning border-status-warning/30',
        info: 'bg-status-info-light text-status-info border-status-info/30',
    } as const
    return (
        <span className={cn("inline-flex items-center gap-1.5 rounded-full text-[11px] font-medium px-2 py-0.5 border", classMap[tone])}>
            <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                tone === 'danger' ? 'bg-destructive' : tone === 'warning' ? 'bg-status-warning' : 'bg-status-info',
            )} />
            {label}
        </span>
    )
}

// ─── V3a — Priority slab ─────────────────────────────────────────

function PrioritySlab({ item }: { item: QueueItem | null }): React.ReactElement {
    if (!item) {
        return (
            <Card className="rounded-xl border bg-gradient-to-br from-background to-international-orange/[0.03]">
                <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-status-success-light">
                        <CheckCircle2 className="h-5 w-5 text-status-success" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">You&apos;re all caught up</p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                        No triage items today. Good time to work on something proactive.
                    </p>
                </CardContent>
            </Card>
        )
    }
    const isBlocking = item.decayTone === 'overdue'
    return (
        <Card className="rounded-xl border-l-[3px] border-l-international-orange bg-gradient-to-br from-background to-international-orange/[0.03]">
            <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-[10.5px] font-bold uppercase tracking-widest text-international-orange">
                        {isBlocking ? '🔴 Blocking — #1 today' : "Today's focus"}
                    </span>
                    <SourceTag source={item.source} />
                </div>
                <h2 className="text-lg font-semibold text-foreground leading-snug tracking-tight mb-2">
                    {item.label}
                </h2>
                {item.sub && (
                    <p className="text-sm text-foreground/80 mb-3">{item.sub}</p>
                )}
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" asChild className="bg-international-orange hover:bg-international-orange/90 text-white">
                        <Link href={item.ctaHref}>{item.ctaLabel}</Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/strategy" className="gap-1.5">
                            See all open risks
                            <ArrowRight className="h-3 w-3" />
                        </Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

// ─── V3b — Runway card (Phase 2 Money: live data via getTodayMoneyRunwayTile) ──

function formatMoneyAmount(cents: number, currency: string): string {
    try {
        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
        }).format(cents / 100)
    } catch {
        return `${(cents / 100).toFixed(0)}`
    }
}

function RunwayStub({ data }: { data: TodayMoneyRunwayTile | null }): React.ReactElement {
    // Loading: data not yet hydrated by the parent useEffect.
    if (data === null) {
        return (
            <Card className="rounded-xl border relative">
                <CardContent className="pt-5 pb-5">
                    <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                        Cash runway
                    </p>
                    <Skeleton className="h-7 w-24 mb-2" />
                    <Skeleton className="h-3 w-40 mb-3" />
                    <Skeleton className="h-8 w-full" />
                </CardContent>
            </Card>
        )
    }

    // Cold start: no plan_line_items yet — keep the original CTA.
    if (!data.connected) {
        return (
            <Card className="rounded-xl border relative">
                <CardContent className="pt-5 pb-5">
                    <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                        Cash runway
                    </p>
                    <div className="flex items-baseline gap-1 mb-1">
                        <span className="text-2xl font-bold text-muted-foreground/70 tabular-nums">—</span>
                        <span className="text-xs text-muted-foreground">months</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                        Add a plan to see runway here.
                    </p>
                    <Button size="sm" variant="outline" asChild className="w-full">
                        <Link href="/money/plan" className="gap-1.5">
                            <Building2 className="h-3.5 w-3.5" />
                            Connect Cash/Burn
                        </Link>
                    </Button>
                </CardContent>
            </Card>
        )
    }

    const months = data.runwayMonths
    const status = data.runwayStatus
    const statusToneClass =
        status === 'critical' ? 'text-destructive' :
        status === 'caution' ? 'text-status-warning' :
        status === 'sustainable' ? 'text-status-success' :
        'text-foreground'
    const statusLabel =
        status === 'critical' ? 'Critical' :
        status === 'caution' ? 'Caution' :
        status === 'sustainable' ? 'Sustainable' :
        'Healthy'

    const monthsDisplay =
        status === 'sustainable' ? '∞' :
        months === null ? '—' :
        months >= 24 ? '24+' :
        months.toFixed(1)
    const burnLabel = data.monthlyBurnCents > 0
        ? `${formatMoneyAmount(data.monthlyBurnCents, data.currency)}/mo burn`
        : 'Net positive — income covers burn'

    return (
        <Card className="rounded-xl border relative">
            <CardContent className="pt-5 pb-5">
                <div className="flex items-center justify-between mb-1">
                    <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">
                        Cash runway
                    </p>
                    <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider",
                        statusToneClass,
                    )}>
                        {statusLabel}
                    </span>
                </div>
                <div className="flex items-baseline gap-1 mb-1">
                    <span className={cn("text-2xl font-bold tabular-nums", statusToneClass)}>
                        {monthsDisplay}
                    </span>
                    <span className="text-xs text-muted-foreground">months</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{burnLabel}</p>
                <Button size="sm" variant="outline" asChild className="w-full">
                    <Link href="/money/cockpit" className="gap-1.5">
                        Open Cockpit
                    </Link>
                </Button>
            </CardContent>
        </Card>
    )
}

// ─── V4 — Minigrid tiles ─────────────────────────────────────────

function ForgeCostTile({ signals }: { signals: TodaySignal[] }): React.ReactElement {
    const topForge = signals.find(s => s.section === 'forge')
    return (
        <Link
            href="/the-forge"
            className="block rounded-xl border bg-background p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
            <div className="flex items-center justify-between mb-2">
                <SourceTag source="forge" />
                <span className="text-[10px] text-muted-foreground">today</span>
            </div>
            {topForge ? (
                <>
                    <div className="text-xl font-bold text-foreground tabular-nums">{topForge.title}</div>
                    {topForge.body && <div className="text-xs text-muted-foreground mt-1">{topForge.body}</div>}
                </>
            ) : (
                <div className="flex items-center gap-2 pt-1">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-status-success-light text-status-success">
                        <CheckCircle2 className="h-3 w-3" />
                        All clear
                    </span>
                    <span className="text-xs text-muted-foreground">No Forge breaches today</span>
                </div>
            )}
        </Link>
    )
}

function MoneyPipelineTile({ data }: { data: TodayMoneyPipelineTile | null }): React.ReactElement {
    // Loading skeleton — same outer frame as a populated tile so the layout doesn't shift.
    if (data === null) {
        return (
            <div className="block rounded-xl border bg-background p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                    <SourceTag source="money" />
                    <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-6 w-20 mb-1" />
                <Skeleton className="h-3 w-32" />
            </div>
        )
    }

    if (!data.hasRound) {
        return (
            <Link
                href="/money/raise"
                className="block rounded-xl border bg-background p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
                <div className="flex items-center justify-between mb-2">
                    <SourceTag source="money" />
                    <span className="text-[10px] text-muted-foreground">no round</span>
                </div>
                <div className="text-xl font-bold text-muted-foreground/70 tabular-nums">—</div>
                <div className="text-xs text-muted-foreground mt-1">Open Raise to start a round</div>
            </Link>
        )
    }

    const pctClosed = data.target_cents > 0
        ? Math.min(100, Math.round((data.committed_cents / data.target_cents) * 100))
        : 0

    return (
        <Link
            href="/money/raise"
            className="block rounded-xl border bg-background p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
            <div className="flex items-center justify-between mb-2">
                <SourceTag source="money" />
                <span className="text-[10px] text-muted-foreground">{data.roundName}</span>
            </div>
            <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-foreground tabular-nums">
                    {formatMoneyAmount(data.committed_cents, data.currency)}
                </span>
                <span className="text-xs text-muted-foreground">
                    of {formatMoneyAmount(data.target_cents, data.currency)}
                </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
                <strong className="text-foreground font-semibold">{pctClosed}% closed</strong>
                {' · '}
                {data.pipeline_count} in pipeline
            </div>
        </Link>
    )
}

function PlanTasksTile(props: {
    onTrack: number
    pillarTotal: number
    atRisk: number
    dueToday: number
    completedYesterday: number
    completedToday: number
    teamTotalCompleted: number
}): React.ReactElement {
    const { onTrack, pillarTotal, atRisk, dueToday, completedYesterday, completedToday, teamTotalCompleted } = props
    const delta = completedToday - completedYesterday
    return (
        <Link
            href="/strategy"
            className="block rounded-xl border bg-background p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
            <div className="flex items-center justify-between mb-2">
                <SourceTag source="plan" />
                <span className="text-[10px] text-muted-foreground">Q2</span>
            </div>
            <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-foreground tabular-nums">
                    {onTrack}/{pillarTotal || 0}
                </span>
                <span className="text-xs text-muted-foreground">on-track</span>
                {delta !== 0 && pillarTotal > 0 && (
                    <span className={cn(
                        "flex items-center text-[11px] font-medium ml-1",
                        delta > 0 ? "text-status-success" : "text-destructive",
                    )}>
                        {delta > 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                        {Math.abs(delta)}
                    </span>
                )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
                <strong className="text-foreground font-semibold">{atRisk} at risk</strong> · {dueToday} due today
                {teamTotalCompleted > 0 && ` · team ${teamTotalCompleted}`}
            </div>
        </Link>
    )
}

// ─── V5 — Waiting-on-you card ───────────────────────────────────

function WaitingOnYouCard({ items }: { items: WaitingItem[] }): React.ReactElement {
    return (
        <Card className="rounded-xl border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div className="text-sm font-semibold text-foreground">
                    Waiting on you
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-international-orange text-white text-[11px] font-bold tabular-nums">
                        {items.length}
                    </span>
                </div>
                <Link
                    href="/updates"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-international-orange hover:bg-international-orange/10 border border-international-orange/30 rounded-md px-2.5 py-1"
                >
                    <Megaphone className="h-3 w-3" />
                    Send standup
                </Link>
            </div>
            <div>
                {items.map((item, idx) => (
                    <div
                        key={item.key}
                        className={cn(
                            "grid grid-cols-[28px_1fr_auto] gap-3 px-5 py-3.5 items-start",
                            idx < items.length - 1 && "border-b border-border/50",
                        )}
                    >
                        <div className="w-7 h-7 rounded-full bg-electric-blue/10 flex items-center justify-center text-[11px] font-bold text-electric-blue">
                            {item.initials}
                        </div>
                        <div className="text-sm leading-relaxed min-w-0">
                            <span className="font-semibold text-foreground">{item.who}</span>
                            <span className="text-foreground/90"> {item.ask}</span>
                            <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5">
                                {item.meta}
                                <SourceTag source={item.source} />
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 pt-0.5">
                            <Button size="sm" variant="outline" asChild className="h-7 text-xs bg-status-success-light border-status-success/30 text-status-success hover:bg-status-success hover:text-white">
                                <Link href={item.ctaPrimary.href}>{item.ctaPrimary.label}</Link>
                            </Button>
                            {item.ctaAsk && (
                                <Button size="sm" variant="outline" asChild className="h-7 text-xs">
                                    <Link href={item.ctaAsk.href ?? '#'}>{item.ctaAsk.label}</Link>
                                </Button>
                            )}
                            {item.ctaDismiss && (
                                <Button size="sm" variant="outline" asChild className="h-7 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/30">
                                    <Link href={item.ctaDismiss.href ?? '#'}>{item.ctaDismiss.label}</Link>
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    )
}

// ─── V6a — Queue card ───────────────────────────────────────────

function QueueCard({
    items,
    total,
    filter,
    onFilterChange,
    view,
    onViewChange,
}: {
    items: QueueItem[]
    total: number
    filter: 'all' | QueueSource
    onFilterChange: (f: 'all' | QueueSource) => void
    view: 'decay' | 'section'
    onViewChange: (v: 'decay' | 'section') => void
}): React.ReactElement {
    const filters: Array<{ key: 'all' | QueueSource; label: string }> = [
        { key: 'all', label: 'All' },
        { key: 'forge', label: 'Forge' },
        { key: 'products', label: 'Products' },
        { key: 'plan', label: 'Plan' },
        { key: 'money', label: 'Money' },
        { key: 'compliance', label: 'Compliance' },
    ]

    return (
        <Card className="rounded-xl border overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <span className="text-sm font-semibold text-foreground">Today</span>
                    <span className="ml-2 text-[11px] text-muted-foreground">
                        · {total} items · ordered by consequence × decay
                    </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex gap-0.5 p-0.5 bg-muted rounded-md text-[11px]">
                        {filters.map(f => (
                            <button
                                key={f.key}
                                type="button"
                                onClick={() => onFilterChange(f.key)}
                                className={cn(
                                    "px-2 py-0.5 rounded font-medium transition-colors",
                                    filter === f.key
                                        ? "bg-background text-foreground font-semibold shadow-sm"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                                aria-pressed={filter === f.key}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex border border-border rounded-md overflow-hidden text-[10.5px]">
                        <button
                            type="button"
                            onClick={() => onViewChange('decay')}
                            className={cn(
                                "px-2 py-1 font-bold uppercase tracking-wide transition-colors",
                                view === 'decay'
                                    ? "bg-international-orange text-white"
                                    : "text-muted-foreground hover:bg-muted",
                            )}
                            aria-pressed={view === 'decay'}
                        >
                            By decay
                        </button>
                        <button
                            type="button"
                            onClick={() => onViewChange('section')}
                            className={cn(
                                "px-2 py-1 font-bold uppercase tracking-wide transition-colors",
                                view === 'section'
                                    ? "bg-international-orange text-white"
                                    : "text-muted-foreground hover:bg-muted",
                            )}
                            aria-pressed={view === 'section'}
                        >
                            By section
                        </button>
                    </div>
                </div>
            </div>
            {items.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                    {total === 0
                        ? "You're all caught up — time to plan your next move."
                        : "No items match this filter."}
                </div>
            ) : (
                <div>
                    {items.map((item, idx) => (
                        <div
                            key={item.key}
                            className={cn(
                                "grid grid-cols-[28px_1fr_auto_auto] gap-3 px-5 py-3 items-center text-sm",
                                idx < items.length - 1 && "border-b border-border/50",
                                "hover:bg-muted/30 transition-colors",
                            )}
                        >
                            <div className="text-[11px] font-bold text-muted-foreground/70 tabular-nums text-center">
                                {idx + 1}
                            </div>
                            <div className="min-w-0">
                                <div className="font-medium text-foreground truncate">{item.label}</div>
                                <div className="text-[11px] text-muted-foreground truncate mt-0.5 flex items-center gap-1.5 flex-wrap">
                                    <SourceTag source={item.source} />
                                    {item.sub && <span>· {item.sub}</span>}
                                </div>
                            </div>
                            <div className={cn(
                                "text-[11px] tabular-nums text-right min-w-[72px]",
                                item.decayTone === 'overdue' && "text-destructive font-semibold",
                                item.decayTone === 'warn' && "text-status-warning font-medium",
                                item.decayTone === 'normal' && "text-muted-foreground",
                            )}>
                                {item.decayLabel}
                            </div>
                            <Link
                                href={item.ctaHref}
                                className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-border bg-background hover:bg-international-orange hover:text-white hover:border-international-orange transition-colors inline-flex items-center gap-1"
                            >
                                {item.ctaLabel}
                                <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    )
}

// ─── V6b — Calendar peek stub ────────────────────────────────────

function CalendarPeekStub(): React.ReactElement {
    return (
        <Card className="rounded-xl border">
            <CardContent className="pt-5 pb-5">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                    Today&apos;s calendar
                </h3>
                <div className="flex flex-col items-center text-center py-6 gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground max-w-[14rem]">
                        Google Calendar peek arrives in a future release. For now, keep calls in your own calendar.
                    </p>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Coming soon
                    </span>
                </div>
            </CardContent>
        </Card>
    )
}

// ─── V7 — Horizon stub ───────────────────────────────────────────

function HorizonStub(): React.ReactElement {
    return (
        <Card className="rounded-xl border">
            <CardContent className="pt-5 pb-5">
                <div className="flex items-baseline justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">14-day risk horizon</h3>
                    <span className="text-xs text-muted-foreground">Anchor: first flight window</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Flame className="h-4 w-4 text-international-orange shrink-0" />
                    <span className="flex-1">
                        Timeline view arrives with Plan — it maps every upcoming milestone across Forge, Products, Money, Plan and Compliance onto a 14-day window.
                    </span>
                    <Link href="/strategy" className="text-international-orange hover:underline shrink-0 inline-flex items-center gap-0.5 font-semibold">
                        Open Strategy
                        <ArrowRight className="h-3 w-3" />
                    </Link>
                </div>
            </CardContent>
        </Card>
    )
}

// ─── V9 — Signal strip cards ─────────────────────────────────────

function SignalCard({
    source,
    href,
    body,
    tag,
}: {
    source: QueueSource
    href: string
    body: React.ReactNode
    tag: string
}): React.ReactElement {
    return (
        <Link
            href={href}
            className="block rounded-xl border bg-background p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
            <div className="flex items-center justify-between mb-3">
                <span className="text-[10.5px] font-bold uppercase tracking-widest text-international-orange">
                    {SOURCE_LABEL[source]}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/70" />
            </div>
            <div className="text-xs text-foreground leading-relaxed">{body}</div>
            <div className="mt-2">
                <SourceTag source={source} className="text-[9.5px]" />
                <span className="text-[10px] text-muted-foreground ml-1.5">{tag}</span>
            </div>
        </Link>
    )
}

function ForgeSignalCard({ forgeSignals }: { forgeSignals: TodaySignal[] }): React.ReactElement {
    const criticalCount = forgeSignals.filter(s => s.decayRate === 'immediate' || s.decayRate === '1d').length
    return (
        <SignalCard
            source="forge"
            href="/the-forge"
            body={
                forgeSignals.length === 0
                    ? <>No active Forge signals<br />Builds populate here as events land</>
                    : <><strong>{forgeSignals.length} active</strong>{criticalCount > 0 && <> · <span className="text-destructive font-bold">{criticalCount} critical</span></>}</>
            }
            tag="Workshop › Forge"
        />
    )
}

function ProductsSignalCard(): React.ReactElement {
    return (
        <SignalCard
            source="products"
            href="/products"
            body={<>Products module<br />Coming in Phase 4</>}
            tag="Workshop › Products"
        />
    )
}

function MoneySignalCard({
    runway,
    pipeline,
    signals,
}: {
    runway: TodayMoneyRunwayTile | null
    pipeline: TodayMoneyPipelineTile | null
    signals: TodaySignal[]
}): React.ReactElement {
    // Composite read: runway one-liner + raise one-liner + active critical-signal count.
    // Falls back gracefully when either side hasn't loaded or isn't connected yet.
    const criticalCount = signals.filter(s => s.decayRate === 'immediate' || s.decayRate === '1d').length

    const runwayLine = runway === null
        ? 'Loading runway…'
        : !runway.connected
            ? 'No plan yet'
            : runway.runwayStatus === 'sustainable'
                ? 'Net positive'
                : runway.runwayMonths === null
                    ? '—'
                    : `${runway.runwayMonths.toFixed(1)} mo runway`

    const pipelineLine = pipeline === null
        ? 'Loading raise…'
        : !pipeline.hasRound
            ? 'No active round'
            : `${pipeline.pipeline_count} in pipeline · ${formatMoneyAmount(pipeline.committed_cents, pipeline.currency)} committed`

    return (
        <SignalCard
            source="money"
            href="/money/cockpit"
            body={
                <>
                    <strong>{runwayLine}</strong>
                    <br />{pipelineLine}
                    {criticalCount > 0 && (
                        <> · <span className="text-destructive font-bold">{criticalCount} critical</span></>
                    )}
                </>
            }
            tag="Money › Cockpit"
        />
    )
}

function PlanSignalCard({
    onTrack,
    pillarTotal,
    atRisk,
    dueThisWeek,
}: {
    onTrack: number
    pillarTotal: number
    atRisk: number
    dueThisWeek: number
}): React.ReactElement {
    return (
        <SignalCard
            source="plan"
            href="/strategy"
            body={
                <>
                    Q2 <strong>{onTrack}/{pillarTotal || 0}</strong> on-track
                    {atRisk > 0 && <> · <strong>{atRisk} at risk</strong></>}
                    <br />{dueThisWeek} tasks due this week
                </>
            }
            tag="Plan › Strategy"
        />
    )
}

// ─── V10 — App signals footer ────────────────────────────────────

function AppSignalsFooter({ unreadCount, reviewCount }: { unreadCount: number; reviewCount: number }): React.ReactElement {
    const weeklyTime = useWeeklyTime()
    const weeklyHours = weeklyTime ? Math.round(weeklyTime.totalMinutes / 60) : null
    return (
        <div className="flex flex-wrap items-center gap-2 bg-background border border-border rounded-xl px-4 py-3">
            <span className="text-[10.5px] uppercase tracking-widest font-bold text-muted-foreground pr-2 border-r border-border mr-1">
                Elsewhere in ForgeOS
            </span>
            <AppSignalPill href="/updates" icon={MessageSquare} label="Comms" count={unreadCount} countLabel="unread" tone={unreadCount > 0 ? 'active' : 'quiet'} />
            <AppSignalPill href="/time" icon={Clock} label="Time" count={weeklyHours} countLabel={weeklyHours !== null ? `/ 40h this week` : 'this week'} tone="quiet" />
            <AppSignalPill href="/new-tasks" icon={FileCheck2} label="Review" count={reviewCount} countLabel="to approve" tone={reviewCount > 0 ? 'active' : 'quiet'} />
            <AppSignalPill href="/updates" icon={BookOpen} label="Knowledge" count={0} countLabel="digest" tone="quiet" />
            <span className="flex-1" />
            <span className="text-[10px] text-muted-foreground/70 italic hidden sm:inline">Pills link to their full pages — counts update live</span>
        </div>
    )
}

function AppSignalPill({
    href,
    icon: Icon,
    label,
    count,
    countLabel,
    tone,
}: {
    href: string
    icon: React.ComponentType<{ className?: string }>
    label: string
    count: number | null
    countLabel: React.ReactNode
    tone: 'active' | 'quiet'
}): React.ReactElement {
    return (
        <Link
            href={href}
            className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 border border-border/60 text-[11px] font-medium transition-colors",
                "hover:bg-international-orange/10 hover:border-international-orange/30 hover:text-international-orange",
            )}
        >
            <Icon className="h-3 w-3 opacity-70" />
            <span className="text-foreground">{label}</span>
            <span className="text-muted-foreground">·</span>
            {count !== null && (
                <span className={cn(
                    "tabular-nums font-bold",
                    tone === 'active' ? 'text-international-orange' : 'text-muted-foreground',
                )}>
                    {count}
                </span>
            )}
            <span className="text-muted-foreground">{countLabel}</span>
        </Link>
    )
}

// ─── Strategy spotlight (preserved from pre-V3) ──────────────────

function StrategySpotlightSection({ items }: { items: StrategyHealthItem[] }): React.ReactElement {
    const needsAttention = items.filter(i => i.health === 'off-track' || i.health === 'at-risk')
    const allHealthy = needsAttention.length === 0

    if (allHealthy) {
        return (
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-5 rounded-full bg-status-success" />
                    <Waypoints className="h-4 w-4 text-status-success" />
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Strategy</p>
                </div>
                <Card className="rounded-xl border shadow-sm">
                    <CardContent className="py-5 flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-status-success-light shrink-0">
                            <Waypoints className="h-4 w-4 text-status-success" />
                        </div>
                        <p className="text-sm text-muted-foreground flex-1">
                            All {items.length} strategic {items.length === 1 ? 'pillar' : 'pillars'} on track.
                        </p>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/strategy" className="gap-1 text-xs">
                                Details
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
            <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-5 rounded-full bg-international-orange" />
                <Waypoints className="h-4 w-4 text-international-orange" />
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Strategy pillars</p>
            </div>
            <div className="space-y-2">
                {items.map((item) => {
                    const healthColor = {
                        'on-track': 'bg-status-success',
                        'at-risk': 'bg-status-warning',
                        'off-track': 'bg-destructive',
                        'completed': 'bg-status-success',
                        'not-started': 'bg-muted-foreground',
                    }[item.health]
                    const healthLabel = {
                        'on-track': 'On track',
                        'at-risk': 'At risk',
                        'off-track': 'Off track',
                        'completed': 'Completed',
                        'not-started': 'Not started',
                    }[item.health]

                    return (
                        <Link
                            key={item.id}
                            href="/strategy"
                            className="flex items-center gap-3 p-3 rounded-xl border bg-background shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group"
                            aria-label={`${item.title} — ${healthLabel}, ${item.progress}% complete`}
                        >
                            <div
                                className={cn("w-2 h-2 rounded-full shrink-0", healthColor)}
                                role="img"
                                aria-label={healthLabel}
                            />
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
                            <div className="flex items-center gap-2 shrink-0">
                                <div className="hidden sm:block w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div className={cn("h-full rounded-full transition-all", healthColor)} style={{ width: `${item.progress}%` }} />
                                </div>
                                <span className="text-xs font-semibold text-foreground tabular-nums w-8 text-right">
                                    {item.progress}%
                                </span>
                            </div>
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}

// ─── Sandbox welcome banner (extracted — used by main + error branch) ────

function SandboxWelcomeBanner({
    isMigratedUser,
    onDismiss,
    onCreateCompany,
}: {
    isMigratedUser: boolean
    onDismiss: () => void
    onCreateCompany: () => void
}): React.ReactElement {
    return (
        <Card className="rounded-xl border-2 border-electric-blue/20 shadow-sm bg-gradient-to-br from-electric-blue/[0.03] to-background">
            <CardContent className="pt-6 pb-6">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-foreground">
                            {isMigratedUser ? "We\u2019ve moved you to your own private workspace" : "Welcome to your personal workspace"}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            {isMigratedUser
                                ? "Your data is now fully private \u2014 no one else can see it. When you\u2019re ready, you have two paths:"
                                : "This is your private space to explore ForgeOS. When you\u2019re ready, you have two paths:"}
                        </p>
                    </div>
                    <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground transition-colors p-1 -mt-1 -mr-1" aria-label="Dismiss banner">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg border bg-card hover:border-electric-blue/30 transition-colors">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-9 h-9 rounded-full bg-electric-blue/10 flex items-center justify-center flex-shrink-0">
                                <Building2 className="w-[18px] h-[18px] text-electric-blue" />
                            </div>
                            <h4 className="text-sm font-semibold text-foreground">Set up a company</h4>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed mb-3">Create your company workspace, build your team, and manage your venture.</p>
                        <Button size="sm" onClick={onCreateCompany} className="bg-electric-blue hover:bg-electric-blue/90 text-white">Create Company</Button>
                    </div>
                    <div className="p-4 rounded-lg border bg-card hover:border-international-orange/30 transition-colors">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-9 h-9 rounded-full bg-international-orange/10 flex items-center justify-center flex-shrink-0">
                                <Users className="w-[18px] h-[18px] text-international-orange" />
                            </div>
                            <h4 className="text-sm font-semibold text-foreground">Get found as a fractional executive</h4>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed mb-3">Complete your profile so companies can discover you on the Recruits page and invite you to their teams.</p>
                        <Button size="sm" variant="outline" asChild className="gap-1.5"><Link href="/my-profile">Complete Profile</Link></Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

// ─── Error-branch role-aware hero variants ──────────────────────

function ErrorBranchExecutive(): React.ReactElement {
    return (
        <>
            <div className="space-y-2 max-w-md">
                <p className="text-xl font-bold text-foreground">Ventures are looking for executives like you.</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    Complete your profile so ventures can find you, then browse what&apos;s available in the marketplace.
                </p>
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center">
                <Button asChild size="sm" className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white">
                    <Link href="/my-profile"><Target className="h-3.5 w-3.5" /> Complete your profile</Link>
                </Button>
                <Button variant="outline" size="sm" asChild className="gap-1.5">
                    <Link href="/marketplace"><Waypoints className="h-3.5 w-3.5" /> Browse the marketplace</Link>
                </Button>
            </div>
        </>
    )
}

function ErrorBranchApprentice(): React.ReactElement {
    return (
        <>
            <div className="space-y-2 max-w-md">
                <p className="text-xl font-bold text-foreground">Your training toolkit is ready.</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    Start your first training objective and explore the tools that will make you 10x more productive.
                </p>
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center">
                <Button asChild size="sm" className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white">
                    <Link href="/objectives"><Target className="h-3.5 w-3.5" /> Start your training</Link>
                </Button>
                <Button variant="outline" size="sm" asChild className="gap-1.5">
                    <Link href="/the-forge"><Waypoints className="h-3.5 w-3.5" /> Explore the toolkit</Link>
                </Button>
            </div>
        </>
    )
}

function ErrorBranchDefault(): React.ReactElement {
    return (
        <>
            <div className="space-y-2 max-w-md">
                <p className="text-xl font-bold text-foreground">Welcome to ForgeOS</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    Your daily briefing will appear here once you start creating objectives and tasks. Get started by setting up your first goal.
                </p>
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center">
                <Button asChild size="sm" className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white">
                    <Link href="/new-objectives"><Target className="h-3.5 w-3.5" /> Create your first objective</Link>
                </Button>
                <Button variant="outline" size="sm" asChild className="gap-1.5">
                    <Link href="/strategy"><Waypoints className="h-3.5 w-3.5" /> Explore strategy</Link>
                </Button>
            </div>
        </>
    )
}

// ─── Skeleton — rewritten for V3 grid ────────────────────────────

function TodayViewSkeleton(): React.ReactElement {
    return (
        <div className="max-w-5xl space-y-6">
            {/* Greeting + chips */}
            <div className="space-y-2">
                <Skeleton className="h-8 w-56" />
                <div className="flex gap-2">
                    <Skeleton className="h-5 w-40 rounded-full" />
                    <Skeleton className="h-5 w-28 rounded-full" />
                    <Skeleton className="h-5 w-32 rounded-full" />
                </div>
                <Skeleton className="h-12 w-full max-w-xl" />
            </div>
            {/* V3 headline grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[2.2fr_1fr] gap-4">
                <Skeleton className="h-40 rounded-xl" />
                <Skeleton className="h-40 rounded-xl" />
            </div>
            {/* V4 minigrid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            {/* V5 waiting */}
            <Skeleton className="h-48 rounded-xl" />
            {/* V6 mid-grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4">
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-64 rounded-xl" />
            </div>
            {/* V9 signals strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
        </div>
    )
}

