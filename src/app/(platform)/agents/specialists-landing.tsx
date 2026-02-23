"use client"

/**
 * @file specialists-landing.tsx
 *
 * @description Redesigned AI Team landing page with Key Leaders row and
 * Team Huddles grid. Replaces the verbose specialist card grid with an
 * action-oriented layout: click a leader for 1:1 chat, or join a
 * pre-configured huddle with a proactive discussion topic.
 *
 * DECISION: Removed the 3x3 specialist card grid because the cards were
 * verbose (taglines, working styles, capability badges, try-asking prompts)
 * without driving engagement. Huddle cards surface specific discussion
 * topics so users immediately see what's actionable.
 *
 * @related
 * - huddle-config.ts — Huddle team definitions
 * - huddle-card.tsx — Individual huddle card component
 * - team-meeting-dialog.tsx — Team meeting conversation dialog
 * - brief-specialist-dialog.tsx — 1:1 specialist conversation
 */

import { useState, useMemo, useEffect, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Image from "next/image"
import { motion } from "framer-motion"
import { ArrowRight, Layers, Users, ChevronDown, ChevronRight, Sparkles, X, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { SPECIALISTS, getSpecialistById } from "./specialists-data"
import { BriefSpecialistDialog } from "./brief-specialist-dialog"
import { TeamMeetingDialog } from "./team-meeting-dialog"
import { MeetingHistory } from "./meeting-history"
import { HuddleCard } from "./huddle-card"
import { HUDDLES } from "./huddle-config"
import { getSpecialistActivities } from "@/actions/agent-memory"
import type { SpecialistActivity } from "@/actions/agent-memory"
import { getInsightFeed } from "@/actions/agent-insights"
import type { AgentInsight } from "@/actions/agent-insights"
import { useAdvisorPanel } from "@/contexts/advisor-panel-context"
import type { SpecialistId } from "./specialists-data"

function formatTimeAgo(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return "just now"
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// INTENT: Key leaders are the four specialists a founder speaks to most.
// They appear as prominent clickable avatars at the top of the page.
const KEY_LEADER_IDS: SpecialistId[] = [
    "strategist",
    "cto",
    "chief-of-staff",
    "legal-counsel",
]

/**
 * Organises specialists into a hierarchical org chart structure.
 */
function getOrgChartHierarchy() {
    const departments = [
        { id: 'strategist', name: 'Strategy', color: 'bg-chart-5' },
        { id: 'cto', name: 'Technology', color: 'bg-chart-2' },
        { id: 'legal-counsel', name: 'Legal, Finance & People', color: 'bg-chart-1' },
    ]

    const directReports = SPECIALISTS.filter(s => s.reportsTo === null)
    const byDepartment = SPECIALISTS.filter(s => s.reportsTo !== null).reduce((acc, specialist) => {
        const leadId = specialist.reportsTo
        if (!leadId) return acc
        if (!acc[leadId]) acc[leadId] = []
        acc[leadId].push(specialist)
        return acc
    }, {} as Record<string, typeof SPECIALISTS>)

    return { departments, directReports, byDepartment }
}

interface SpecialistsLandingProps {
    onOpenProjectBuilder: () => void
}

export function SpecialistsLanding({
    onOpenProjectBuilder,
}: SpecialistsLandingProps) {
    const searchParams = useSearchParams()
    const router = useRouter()
    const advisorPanel = useAdvisorPanel()

    const [isDesktop, setIsDesktop] = useState(false)
    useEffect(() => {
        const mql = window.matchMedia("(min-width: 1024px)")
        setIsDesktop(mql.matches)
        const handler = (e: MediaQueryListEvent): void => setIsDesktop(e.matches)
        mql.addEventListener("change", handler)
        return () => mql.removeEventListener("change", handler)
    }, [])

    const [briefSpecialistId, setBriefSpecialistId] = useState<string | null>(null)
    const [isMeetingOpen, setIsMeetingOpen] = useState(false)
    const [meetingPreset, setMeetingPreset] = useState<{
        participantIds: string[]
        topic: string
    } | null>(null)
    const [handoffContext, setHandoffContext] = useState<string | null>(null)
    const [referredByName, setReferredByName] = useState<string | null>(null)
    const [showOrgChart, setShowOrgChart] = useState(false)
    const [specialistActivities, setSpecialistActivities] = useState<Record<string, SpecialistActivity>>({})
    const [unreadInsights, setUnreadInsights] = useState<AgentInsight[]>([])
    const [allInsights, setAllInsights] = useState<AgentInsight[]>([])
    const [showCatchUp, setShowCatchUp] = useState(true)

    useEffect(() => {
        getSpecialistActivities().then((result) => {
            if (result.data) setSpecialistActivities(result.data)
        })
        getInsightFeed(20).then((result) => {
            const all = [
                ...result.critical,
                ...result.important,
                ...result.informational,
            ]
            setAllInsights(all)
            setUnreadInsights(all.filter((i) => !i.is_read).slice(0, 5))
        })
    }, [])

    useEffect(() => {
        const specialistParam = searchParams.get('specialist')
        if (specialistParam && SPECIALISTS.some(s => s.id === specialistParam)) {
            if (isDesktop) {
                advisorPanel.openPanel(specialistParam)
            } else {
                setBriefSpecialistId(specialistParam)
            }
            router.replace('/agents', { scroll: false })
        }
    }, [searchParams, router, isDesktop, advisorPanel])

    const orgHierarchy = useMemo(() => getOrgChartHierarchy(), [])

    const keyLeaders = useMemo(() => {
        return KEY_LEADER_IDS.map((id) => getSpecialistById(id)).filter(Boolean)
    }, [])

    // INTENT: Group insights by huddle based on which specialist generated them.
    // Each huddle card shows its most relevant discussion topics.
    const huddleTopics = useMemo(() => {
        const topicsByHuddle: Record<string, AgentInsight[]> = {}
        for (const huddle of HUDDLES) {
            const relevantInsights = allInsights.filter(
                (insight) => huddle.insightSpecialistIds.includes(insight.specialist_id as SpecialistId)
            )
            // Sort: critical first, then important, then informational
            const urgencyOrder = { critical: 0, important: 1, informational: 2 }
            relevantInsights.sort((a, b) =>
                (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2)
            )
            topicsByHuddle[huddle.id] = relevantInsights.slice(0, 5)
        }
        return topicsByHuddle
    }, [allInsights])

    const selectedSpecialist = SPECIALISTS.find((s) => s.id === briefSpecialistId)

    const handleBrief = useCallback((specialistId: string) => {
        if (isDesktop) {
            advisorPanel.openPanel(specialistId)
        } else {
            setHandoffContext(null)
            setReferredByName(null)
            setBriefSpecialistId(specialistId)
        }
    }, [isDesktop, advisorPanel])

    const handleJoinHuddle = useCallback((huddleId: string, participantIds: string[], topic: string) => {
        setMeetingPreset({ participantIds, topic })
        setIsMeetingOpen(true)
    }, [])

    return (
        <div className="space-y-10 pb-12">
            {/* ── Hero Section ──────────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-5"
            >
                <div className="max-w-3xl space-y-3">
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-display font-bold text-foreground tracking-tight leading-tight">
                        Your leadership team, ready to huddle.
                    </h2>
                    <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
                        Talk to your key leaders one-on-one, or jump into a team huddle where
                        they&apos;ve already identified what needs discussing.
                    </p>
                </div>
            </motion.div>

            {/* ── Human-First Philosophy Banner ─────────────────────────── */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="flex items-start gap-3 rounded-lg bg-status-info-light/50 border border-status-info/20 px-4 py-3"
            >
                <Shield className="h-4 w-4 text-status-info mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                        You&apos;re in charge
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Your AI Specialists are fast, knowledgeable, and tireless&nbsp;&mdash;&nbsp;but
                        like any team member, they can make mistakes or miss nuances. You&apos;re the
                        decision-maker. Always verify critical information, especially legal and
                        financial guidance.
                    </p>
                </div>
            </motion.div>

            {/* ── Key Leaders Row ───────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
            >
                <div className="flex items-center gap-2 mb-3">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        Your Key Leaders
                    </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    {keyLeaders.map((leader) => {
                        if (!leader) return null
                        const activity = specialistActivities[leader.id]
                        return (
                            <button
                                key={leader.id}
                                onClick={() => handleBrief(leader.id)}
                                className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-muted hover:shadow-md transition-all text-left group"
                            >
                                <div className="relative h-11 w-11 rounded-full overflow-hidden bg-muted flex-shrink-0">
                                    {leader.avatarImage ? (
                                        <Image
                                            src={leader.avatarImage}
                                            alt={leader.name}
                                            fill
                                            unoptimized
                                            className="object-cover"
                                            sizes="44px"
                                        />
                                    ) : (
                                        <span className="flex items-center justify-center h-full w-full text-base font-semibold text-foreground">
                                            {leader.name.charAt(0)}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-foreground group-hover:text-international-orange transition-colors truncate">
                                        {leader.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {leader.title}
                                    </p>
                                    {activity?.lastMessageAt && (
                                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                            Last talked {formatTimeAgo(activity.lastMessageAt)}
                                        </p>
                                    )}
                                </div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            </button>
                        )
                    })}
                </div>
            </motion.div>

            {/* ── Catch-Up Card — shows when specialists have unread insights ── */}
            {showCatchUp && unreadInsights.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    <Card className="border-international-orange/20 bg-international-orange/5 rounded-xl overflow-hidden">
                        <CardContent className="pt-5 pb-4">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="h-4 w-4 text-international-orange" />
                                    <h3 className="font-display font-semibold text-foreground text-sm">
                                        While you were away
                                    </h3>
                                    <span className="text-xs text-muted-foreground">
                                        {unreadInsights.length} update{unreadInsights.length !== 1 ? "s" : ""}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowCatchUp(false)}
                                    className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                                    aria-label="Dismiss catch-up card"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="space-y-2">
                                {unreadInsights.map((insight) => {
                                    const specialist = getSpecialistById(insight.specialist_id)
                                    return (
                                        <button
                                            key={insight.id}
                                            type="button"
                                            onClick={() => {
                                                if (specialist) handleBrief(specialist.id)
                                            }}
                                            className="flex items-start gap-2.5 w-full text-left p-2 rounded-md hover:bg-background/60 transition-colors group"
                                        >
                                            <div className={cn(
                                                "h-2 w-2 rounded-full mt-1.5 flex-shrink-0",
                                                insight.urgency === "critical" ? "bg-destructive" :
                                                insight.urgency === "important" ? "bg-status-warning" :
                                                "bg-status-info"
                                            )} />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-foreground font-medium leading-snug">
                                                    {specialist ? (
                                                        <span className="text-international-orange">{specialist.name}</span>
                                                    ) : null}
                                                    {specialist ? " " : ""}
                                                    {insight.title}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                                    {insight.body.slice(0, 100)}
                                                </p>
                                            </div>
                                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-international-orange flex-shrink-0 mt-1 transition-colors" />
                                        </button>
                                    )
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            )}

            {/* ── Team Huddles Grid ────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
                className="space-y-4"
            >
                <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        Team Huddles
                    </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {HUDDLES.map((huddle, idx) => (
                        <HuddleCard
                            key={huddle.id}
                            huddle={huddle}
                            topics={huddleTopics[huddle.id] ?? []}
                            onJoinHuddle={handleJoinHuddle}
                            index={idx}
                        />
                    ))}
                </div>
            </motion.div>

            {/* ── Org Chart Toggle ──────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <Button
                    variant="ghost"
                    onClick={() => setShowOrgChart(!showOrgChart)}
                    className="text-muted-foreground hover:text-foreground gap-2"
                >
                    {showOrgChart ? (
                        <ChevronDown className="h-4 w-4" />
                    ) : (
                        <ChevronRight className="h-4 w-4" />
                    )}
                    {showOrgChart ? 'Hide' : 'View'} Full Org Chart
                </Button>
            </div>

            {/* ── Org Chart ─────────────────────────────────────────────── */}
            {showOrgChart && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2"
                >
                    <div className="flex flex-col gap-2">
                        <div className="flex justify-center">
                            <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-international-orange flex items-center justify-center text-white text-xs font-bold">
                                    CEO
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                            {orgHierarchy.directReports.map((specialist) => (
                                <button
                                    key={specialist.id}
                                    onClick={() => handleBrief(specialist.id)}
                                    className="flex flex-col items-center gap-1 p-2 rounded-lg border bg-card hover:bg-muted hover:shadow-md transition-all min-w-[80px]"
                                >
                                    <span className="text-sm font-semibold text-foreground">{specialist.name}</span>
                                    <span className="text-xs text-muted-foreground">{specialist.title}</span>
                                </button>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                            {orgHierarchy.departments.map((dept) => {
                                const deptSpecialists = orgHierarchy.byDepartment[dept.id] ?? []
                                if (deptSpecialists.length === 0) return null
                                return (
                                    <div key={dept.id} className="p-2 rounded-lg border bg-card">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className={cn("h-2 w-2 rounded-full", dept.color)} />
                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                                {dept.name}
                                            </span>
                                        </div>
                                        <div className="space-y-1">
                                            {deptSpecialists.map((specialist) => (
                                                <button
                                                    key={specialist.id}
                                                    onClick={() => handleBrief(specialist.id)}
                                                    className="w-full text-left p-1.5 rounded hover:bg-muted transition-colors"
                                                >
                                                    <div className="text-sm font-medium text-foreground">{specialist.name}</div>
                                                    <div className="text-xs text-muted-foreground">{specialist.title}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ── Meeting History ─────────────────────────────────────── */}
            <MeetingHistory initialLimit={3} />

            {/* ── Team Project CTA ─────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.8 }}
            >
                <Card className="border-dashed border-2 bg-muted/30 rounded-xl">
                    <CardContent className="pt-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-muted">
                                    <Layers className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div>
                                    <h3 className="font-display font-semibold text-foreground">
                                        Plan a Team Project
                                    </h3>
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        For complex, multi-step work &mdash; chain multiple specialists together
                                        and build a complete project from start to finish.
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="secondary"
                                className="flex-shrink-0"
                                onClick={onOpenProjectBuilder}
                            >
                                Open Project Builder
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* ── Brief Dialog (mobile only — desktop uses advisor panel) ── */}
            {selectedSpecialist && !isDesktop && (
                <BriefSpecialistDialog
                    specialist={selectedSpecialist}
                    open={briefSpecialistId !== null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setBriefSpecialistId(null)
                            setHandoffContext(null)
                            setReferredByName(null)
                        }
                    }}
                    onSwitchSpecialist={(id, context) => {
                        const fromName = selectedSpecialist.name
                        setHandoffContext(context ?? null)
                        setReferredByName(context ? fromName : null)
                        setBriefSpecialistId(id)
                    }}
                    handoffContext={handoffContext}
                    referredBy={referredByName}
                />
            )}

            {/* ── Team Meeting Dialog ──────────────────────────────────── */}
            <TeamMeetingDialog
                open={isMeetingOpen}
                onOpenChange={(open) => {
                    setIsMeetingOpen(open)
                    if (!open) setMeetingPreset(null)
                }}
                preset={meetingPreset ?? undefined}
            />
        </div>
    )
}
