"use client"

import { useState, useMemo, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowRight, Layers, Users, MessageSquare, ChevronDown, ChevronRight, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
// Design system imported only when needed for inline usage
import { SPECIALISTS } from "./specialists-data"
import { SpecialistCard } from "./specialist-card"
import { getPromptsByCategory } from "./lib/prompt-library"
import { BriefSpecialistDialog } from "./brief-specialist-dialog"
import { TeamMeetingDialog } from "./team-meeting-dialog"

import { MeetingHistory } from "./meeting-history"
import { getSpecialistActivities } from "@/actions/agent-memory"
import type { SpecialistActivity } from "@/actions/agent-memory"
import { getInsightFeed } from "@/actions/agent-insights"
import type { AgentInsight } from "@/actions/agent-insights"
import { getSpecialistById } from "./specialists-data"
import { useAdvisorPanel } from "@/contexts/advisor-panel-context"

/**
 * Organises specialists into a hierarchical org chart structure.
 */
function getOrgChartHierarchy() {
    const departments = [
        { id: 'strategy', name: 'Strategy', color: 'bg-chart-5' },
        { id: 'technology', name: 'Technology', color: 'bg-chart-2' },
        { id: 'product', name: 'Product', color: 'bg-chart-6' },
        { id: 'growth', name: 'Growth', color: 'bg-chart-3' },
        { id: 'operations', name: 'Operations', color: 'bg-chart-4' },
        { id: 'finance', name: 'Finance', color: 'bg-chart-1' },
        { id: 'people', name: 'People', color: 'bg-chart-3' },
        { id: 'legal', name: 'Legal', color: 'bg-chart-2' },
    ]

    // Build hierarchy: direct reports first, then by department
    const directReports = SPECIALISTS.filter(s => s.reportsTo === null)
    const byDepartment = SPECIALISTS.filter(s => s.reportsTo !== null).reduce((acc, specialist) => {
        const dept = departments.find(d => d.id === specialist.department.toLowerCase())?.id || 'other'
        if (!acc[dept]) acc[dept] = []
        acc[dept].push(specialist)
        return acc
    }, {} as Record<string, typeof SPECIALISTS>)

    return { departments, directReports, byDepartment }
}

interface SpecialistsLandingProps {
    /** Callback to switch to the workflow builder ("Team Project" mode) */
    onOpenProjectBuilder: () => void
}

/**
 * SpecialistsLanding -- The default view for the Specialists page.
 *
 * @description Displays a flat 3x3 grid of specialist cards with human names
 * and functional titles, a meeting history section, and a
 * "Plan a Team Project" CTA that opens the workflow builder.
 */
export function SpecialistsLanding({
    onOpenProjectBuilder,
}: SpecialistsLandingProps) {
    const searchParams = useSearchParams()
    const router = useRouter()
    const advisorPanel = useAdvisorPanel()

    // Desktop detection for panel vs dialog routing
    const [isDesktop, setIsDesktop] = useState(false)
    useEffect(() => {
        const mql = window.matchMedia("(min-width: 1024px)")
        setIsDesktop(mql.matches)
        const handler = (e: MediaQueryListEvent): void => setIsDesktop(e.matches)
        mql.addEventListener("change", handler)
        return () => mql.removeEventListener("change", handler)
    }, [])

    // Mobile-only dialog state (desktop uses advisor panel)
    const [briefSpecialistId, setBriefSpecialistId] = useState<string | null>(null)
    const [isMeetingOpen, setIsMeetingOpen] = useState(false)

    const [handoffContext, setHandoffContext] = useState<string | null>(null)
    const [referredByName, setReferredByName] = useState<string | null>(null)
    const [showOrgChart, setShowOrgChart] = useState(false)
    const [specialistActivities, setSpecialistActivities] = useState<Record<string, SpecialistActivity>>({})
    const [unreadInsights, setUnreadInsights] = useState<AgentInsight[]>([])
    const [showCatchUp, setShowCatchUp] = useState(true)

    // Fetch specialist activity data and unread insights for catch-up card
    useEffect(() => {
        getSpecialistActivities().then((result) => {
            if (result.data) setSpecialistActivities(result.data)
        })
        getInsightFeed(5).then((result) => {
            const allUnread = [
                ...result.critical.filter((i) => !i.is_read),
                ...result.important.filter((i) => !i.is_read),
                ...result.informational.filter((i) => !i.is_read),
            ].slice(0, 5)
            setUnreadInsights(allUnread)
        })
    }, [])

    // Auto-open specialist from URL query param (e.g. /agents?specialist=strategist)
    useEffect(() => {
        const specialistParam = searchParams.get('specialist')
        if (specialistParam && SPECIALISTS.some(s => s.id === specialistParam)) {
            if (isDesktop) {
                advisorPanel.openPanel(specialistParam)
            } else {
                setBriefSpecialistId(specialistParam)
            }
            // Clean the URL so refreshing doesn't re-open
            router.replace('/agents', { scroll: false })
        }
    }, [searchParams, router, isDesktop, advisorPanel])

    // Pre-compute hierarchy
    const orgHierarchy = useMemo(() => getOrgChartHierarchy(), [])

    // Pre-compute capability counts for each specialist
    const capabilityCounts = useMemo(() => {
        const counts: Record<string, number> = {}
        for (const specialist of SPECIALISTS) {
            let count = 0
            for (const cat of specialist.categories) {
                count += getPromptsByCategory(cat).length
            }
            counts[specialist.id] = count
        }
        return counts
    }, [])

    const totalBriefs = useMemo(() => {
        return Object.values(capabilityCounts).reduce((sum, count) => sum + count, 0)
    }, [capabilityCounts])

    const selectedSpecialist = SPECIALISTS.find((s) => s.id === briefSpecialistId)

    const handleBrief = (specialistId: string) => {
        if (isDesktop) {
            advisorPanel.openPanel(specialistId)
        } else {
            // Mobile: open dialog
            setHandoffContext(null)
            setReferredByName(null)
            setBriefSpecialistId(specialistId)
        }
    }

    return (
        <div className="space-y-10 pb-12">
            {/* ── Hero Section ──────────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-5"
            >
                <div className="max-w-3xl space-y-4">
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-display font-bold text-foreground tracking-tight leading-tight">
                        Your team is bigger than you think.
                    </h2>
                    <p className="text-lg text-muted-foreground leading-relaxed">
                        Thirteen specialists, ready right now. Brief them on anything &mdash; strategy,
                        technology, product, manufacturing, sales, fundraising, legal, hiring, and more. No recruiting. No waiting. No payroll.
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-sm text-foreground font-medium">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span>13 specialists</span>
                            <span className="text-muted-foreground">&middot;</span>
                            <span>{totalBriefs} briefs ready</span>
                        </div>
                        <Button
                            onClick={() => setIsMeetingOpen(true)}
                            className="bg-international-orange hover:bg-international-orange-hover text-white rounded-full"
                            size="sm"
                        >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Call a Team Meeting
                        </Button>
                    </div>
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
                    {showOrgChart ? 'Hide' : 'View'} Org Chart
                </Button>
            </div>

            {/* ── Org Chart ─────────────────────────────────────────────── */}
            {showOrgChart && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-4"
                >
                    <div className="flex flex-col gap-4">
                        {/* CEO Row */}
                        <div className="flex justify-center">
                            <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-international-orange flex items-center justify-center text-white text-sm font-bold">
                                    CEO
                                </div>
                            </div>
                        </div>
                        
                        {/* Direct Reports Row */}
                        <div className="flex flex-wrap justify-center gap-3">
                            {orgHierarchy.directReports.map((specialist) => (
                                <button
                                    key={specialist.id}
                                    onClick={() => handleBrief(specialist.id)}
                                    className="flex flex-col items-center gap-1 p-3 rounded-lg border bg-card hover:bg-muted hover:shadow-md transition-all min-w-[100px]"
                                >
                                    <span className="text-sm font-semibold text-foreground">{specialist.name}</span>
                                    <span className="text-xs text-muted-foreground">{specialist.title}</span>
                                </button>
                            ))}
                        </div>

                        {/* Department Groups */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                            {orgHierarchy.departments.filter(dept => 
                                SPECIALISTS.some(s => s.department.toLowerCase() === dept.id)
                            ).map((dept) => {
                                const deptSpecialists = SPECIALISTS.filter(s => 
                                    s.department.toLowerCase() === dept.id && s.reportsTo !== null
                                )
                                if (deptSpecialists.length === 0) return null
                                
                                return (
                                    <div key={dept.id} className="p-3 rounded-lg border bg-card">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className={cn("h-2 w-2 rounded-full", dept.color)} />
                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                                {dept.name}
                                            </span>
                                        </div>
                                        <div className="space-y-2">
                                            {deptSpecialists.map((specialist) => (
                                                <button
                                                    key={specialist.id}
                                                    onClick={() => handleBrief(specialist.id)}
                                                    className="w-full text-left p-2 rounded hover:bg-muted transition-colors"
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

            {/* ── Specialist Grid ──────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {SPECIALISTS.map((specialist, idx) => (
                    <SpecialistCard
                        key={specialist.id}
                        specialist={specialist}
                        capabilityCount={capabilityCounts[specialist.id] ?? 0}
                        onBrief={handleBrief}
                        index={idx}
                        activity={specialistActivities[specialist.id]}
                    />
                ))}
            </div>

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
                                        For complex, multi-step work &mdash; brief multiple specialists in sequence
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
                onOpenChange={setIsMeetingOpen}
            />

        </div>
    )
}
