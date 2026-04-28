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

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowRight, Layers, ChevronDown, ChevronRight, Sparkles, X, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { SPECIALISTS, getSpecialistById } from "@/lib/agents/specialists-config"
import { BriefSpecialistDialog } from "./brief-specialist-dialog"
import { TeamMeetingDialog } from "./team-meeting-dialog"
import { MeetingHistory } from "./meeting-history"
import { HuddleCard } from "./huddle-card"
import { HUDDLES } from "./huddle-config"
import { IDEA_PROMPTS, type IdeaPrompt } from "./idea-prompts"
import { getInsightFeed } from "@/actions/agent-insights"
import type { AgentInsight } from "@/actions/agent-insights"
import type { HandoffTrailEntry } from "@/lib/agents/specialist-handoff-types"
import type { SpecialistId } from "@/lib/agents/specialists-config"

// INTENT: Key leaders — four specialists used as the default participant set
// for the Brainstorming box launch. Post-pivot (2026-04-24) lineup reflects the
// two product poles Tristan is focused on: Fang (manufacturing) + Chase (supply
// chain) cover The Forge side, Fiona (fundraising) covers the Investors side,
// and Sage (strategy) is the glue specialist who frames every brainstorm.
const KEY_LEADER_IDS: SpecialistId[] = [
    "vp-manufacturing",
    "vp-supply-chain",
    "fundraising-advisor",
    "strategist",
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
    /** Authenticated user id, forwarded to TeamMeetingDialog. */
    userId?: string
    /** Subscription tier, forwarded to TeamMeetingDialog. */
    userTier?: import("@/lib/billing/plans").SubscriptionTier
    /** Brainstorms used this month, forwarded to TeamMeetingDialog. */
    brainstormsUsedThisMonth?: number
}

export function SpecialistsLanding({
    onOpenProjectBuilder,
    userId,
    userTier,
    brainstormsUsedThisMonth,
}: SpecialistsLandingProps) {
    const searchParams = useSearchParams()
    const router = useRouter()

    const [briefSpecialistId, setBriefSpecialistId] = useState<string | null>(null)
    const [isMeetingOpen, setIsMeetingOpen] = useState(false)
    const [meetingPreset, setMeetingPreset] = useState<{
        participantIds: string[]
        topic: string
    } | null>(null)
    const [brainstormTopic, setBrainstormTopic] = useState("")
    const [handoffContext, setHandoffContext] = useState<string | null>(null)
    const [referredByName, setReferredByName] = useState<string | null>(null)
    const [handoffTrail, setHandoffTrail] = useState<HandoffTrailEntry[]>([])
    const [handoffSourceThreadId, setHandoffSourceThreadId] = useState<string | null>(null)
    const [handoffSourceSpecialistId, setHandoffSourceSpecialistId] = useState<string | null>(null)
    const [showOrgChart, setShowOrgChart] = useState(false)
    const [unreadInsights, setUnreadInsights] = useState<AgentInsight[]>([])
    const [allInsights, setAllInsights] = useState<AgentInsight[]>([])
    const [showCatchUp, setShowCatchUp] = useState(true)

    useEffect(() => {
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

    // INTENT: Honour ?specialist=<id> on first render, then strip the query
    // string so a refresh doesn't reopen the dialog. Ref guard ensures we
    // never re-fire on subsequent searchParams changes.
    const specialistParamHandled = useRef(false)
    useEffect(() => {
        if (specialistParamHandled.current) return
        const specialistParam = searchParams.get('specialist')
        if (specialistParam && SPECIALISTS.some(s => s.id === specialistParam)) {
            specialistParamHandled.current = true
            setBriefSpecialistId(specialistParam)
            router.replace('/agents', { scroll: false })
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams])

    const orgHierarchy = useMemo(() => getOrgChartHierarchy(), [])

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
        setHandoffContext(null)
        setReferredByName(null)
        setHandoffTrail([]) // Direct open = fresh start
        setHandoffSourceThreadId(null)
        setHandoffSourceSpecialistId(null)
        setBriefSpecialistId(specialistId)
    }, [])

    const handleJoinHuddle = useCallback((huddleId: string, participantIds: string[], topic: string) => {
        setMeetingPreset({ participantIds, topic })
        setIsMeetingOpen(true)
    }, [])

    // INTENT: Brainstorming box launches a team meeting with the four key leaders
    // on whatever topic the founder types. No persona selection, no pre-configured
    // huddle — a single blank whiteboard entry point. Mirrors the Red Team topic
    // input box in shape but routes to TeamMeetingDialog rather than debate stream.
    const handleLaunchBrainstorm = useCallback(() => {
        const trimmed = brainstormTopic.trim()
        if (trimmed.length < 10) return
        setMeetingPreset({ participantIds: [...KEY_LEADER_IDS], topic: trimmed })
        setIsMeetingOpen(true)
    }, [brainstormTopic])

    // INTENT: Idea prompts are curated brainstorming starters. Click → open a
    // team meeting with the prompt's question as the topic and its suggested
    // specialists pre-selected. Zero typing required.
    const handleLaunchIdea = useCallback((prompt: IdeaPrompt) => {
        setMeetingPreset({
            participantIds: prompt.specialistIds,
            topic: prompt.question,
        })
        setIsMeetingOpen(true)
    }, [])

    return (
        <div className="space-y-10 pb-12">
            {/* ── Ideas to brainstorm — curated prompts to start a session ── */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-4"
            >
                <div className="space-y-1">
                    <h2 className="text-xl sm:text-2xl font-display font-semibold text-foreground tracking-tight">
                        Ideas to brainstorm
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Pick a question to start a conversation with the specialists best placed to help.
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {IDEA_PROMPTS.map((prompt) => {
                        const participants = prompt.specialistIds
                            .map((id) => getSpecialistById(id))
                            .filter((s): s is NonNullable<ReturnType<typeof getSpecialistById>> => Boolean(s))
                        return (
                            <button
                                key={prompt.id}
                                type="button"
                                onClick={() => handleLaunchIdea(prompt)}
                                className="group flex flex-col gap-3 rounded-xl border bg-card hover:border-international-orange/40 hover:shadow-md transition-all text-left p-4"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                                        {prompt.category}
                                    </span>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:text-international-orange transition-all" />
                                </div>
                                <p className="text-sm font-semibold text-foreground leading-snug group-hover:text-international-orange transition-colors">
                                    {prompt.question}
                                </p>
                                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                                    {prompt.subtitle}
                                </p>
                                <div className="flex items-center gap-1.5 flex-wrap mt-auto pt-1">
                                    {participants.map((specialist) => (
                                        <span
                                            key={specialist.id}
                                            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                                        >
                                            {specialist.name}
                                        </span>
                                    ))}
                                </div>
                            </button>
                        )
                    })}
                </div>
            </motion.div>

            {/* ── Or write your own — ad-hoc brainstorm ───────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
            >
                <Card>
                    <CardContent className="pt-6 space-y-3">
                        <label
                            htmlFor="brainstorm-topic"
                            className="text-sm font-medium text-foreground"
                        >
                            Or brainstorm something else
                        </label>
                        <textarea
                            id="brainstorm-topic"
                            value={brainstormTopic}
                            onChange={(e) => setBrainstormTopic(e.target.value)}
                            placeholder="Type any topic — we'll open it up with the four key specialists."
                            rows={3}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-international-orange/30 resize-none"
                        />
                        <Button
                            onClick={handleLaunchBrainstorm}
                            disabled={brainstormTopic.trim().length < 10}
                            className="w-full bg-international-orange hover:bg-international-orange/90 text-white h-11 text-sm font-semibold"
                        >
                            <Sparkles className="h-4 w-4 mr-2" /> Start Brainstorming
                        </Button>
                    </CardContent>
                </Card>
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
                                            className="flex items-start gap-2.5 w-full text-left p-2 rounded-md hover:bg-muted transition-colors group"
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
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                            Team Huddles
                        </h3>
                    </div>
                    <p className="text-xs text-muted-foreground hidden sm:block">
                        Start with <strong className="text-foreground">Product Ideation</strong> — every
                        other huddle is downstream of deciding what to build.
                    </p>
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
                                <div className="h-7 w-7 rounded-full bg-international-orange flex items-center justify-center text-primary-foreground text-xs font-bold">
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

            {/* ── "You're in charge" footer disclaimer ────────────────── */}
            <div className="flex items-start gap-3 rounded-lg bg-status-info-light/50 border border-status-info/20 px-4 py-3">
                <Shield className="h-4 w-4 text-status-info mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                        You&apos;re in charge
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Your Specialists are fast, knowledgeable, and tireless&nbsp;&mdash;&nbsp;but
                        like any team member, they can make mistakes or miss nuances. You&apos;re the
                        decision-maker. Always verify critical information, especially legal and
                        financial guidance.
                    </p>
                </div>
            </div>

            {/* ── Brief Dialog (always — sidebar removed, modal is the single fallback) ── */}
            {selectedSpecialist && (
                <BriefSpecialistDialog
                    specialist={selectedSpecialist}
                    open={briefSpecialistId !== null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setBriefSpecialistId(null)
                            setHandoffContext(null)
                            setReferredByName(null)
                            setHandoffSourceThreadId(null)
                            setHandoffSourceSpecialistId(null)
                            // Don't clear handoffTrail on close — preserve for accidental closes.
                            // Trail is cleared in handleBrief when opening a new specialist directly.
                        }
                    }}
                    onSwitchSpecialist={(id, context, sourceThreadId, sourceSpecialistId) => {
                        const fromName = selectedSpecialist.name
                        const fromId = selectedSpecialist.id
                        // Append current specialist to trail before switching
                        setHandoffTrail(prev => [...prev, { specialistId: fromId, name: fromName }])
                        setHandoffContext(context ?? null)
                        setReferredByName(context ? fromName : null)
                        setHandoffSourceThreadId(sourceThreadId ?? null)
                        setHandoffSourceSpecialistId(sourceSpecialistId ?? null)
                        setBriefSpecialistId(id)
                    }}
                    handoffContext={handoffContext}
                    referredBy={referredByName}
                    handoffTrail={handoffTrail}
                    handoffSourceThreadId={handoffSourceThreadId}
                    handoffSourceSpecialistId={handoffSourceSpecialistId}
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
                userId={userId}
                userTier={userTier}
                brainstormsUsedThisMonth={brainstormsUsedThisMonth}
            />
        </div>
    )
}
