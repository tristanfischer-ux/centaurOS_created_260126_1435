"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    GraduationCap,
    Briefcase,
    Building2,
    Clock,
    Loader2,
    Users,
    Plus,
} from "lucide-react"
import { ApprenticePoolBrowser } from "@/components/guild/ApprenticePoolBrowser"
import { ProjectAssignmentsList } from "@/components/guild/ProjectAssignmentsList"
import { GuildNetwork } from "./guild-network"
import { CreateEventDialog } from "@/components/guild/create-event-dialog"
import { FeaturedEventHero } from "@/components/guild/featured-event-hero"
import { GuildStatsBar } from "@/components/guild/guild-stats-bar"
import { EventsSection } from "@/components/guild/events-section"
import { getMyAssignments } from "@/actions/project-assignments"
import { getGuildEvents, getEventRSVPStatuses, getGuildEventsSummary, type GuildEvent } from "@/actions/guild-events"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { SpecialistInsightCard } from "@/components/specialists/specialist-insight-card"
import { usePageInsights } from "@/hooks/use-page-insights"
import { useAdvisorPanel } from "@/contexts/advisor-panel-context"
import { generateGuildInsights } from "@/actions/specialist-page-insights"
import type { AgentInsight } from "@/actions/agent-insights"

// INTENT: Static coaching insight when no members in guild yet — no API call needed
const EMPTY_STATE_INSIGHT: AgentInsight = {
    id: 'harper-guild-empty',
    foundry_id: '',
    specialist_id: 'hiring-team',
    insight_type: 'recommendation',
    urgency: 'informational',
    title: 'Welcome to the Guild',
    body: 'The Guild connects apprentices with mentors and companies. Build your network to find and develop talent.',
    domain_data: {},
    suggested_actions: [],
    is_read: false,
    is_dismissed: false,
    acted_on: false,
    acted_on_at: null,
    created_at: new Date().toISOString(),
    expires_at: null,
}

// ==========================================
// TYPES
// ==========================================

interface GuildPageContentProps {
    /** Whether user can manage assignments (Founder/Executive) */
    isManager: boolean
    /** Whether user is an Apprentice */
    isApprentice: boolean
    /** Whether user is Executive/Founder (can create events) */
    isExecutive: boolean
    /** Current authenticated user's ID */
    currentUserId: string
    /** Guild community members with resolved foundry names */
    members: {
        id: string
        full_name: string | null
        role: string | null
        email: string | null
        foundry_name?: string
    }[]
}

interface MyAssignment {
    id: string
    foundryName: string
    projectName: string
    projectDescription: string | null
    status: string
    startedAt: string
    assignedByName: string
}

interface EventSummary {
    upcomingCount: number
    totalThisMonth: number
}

// ==========================================
// COMPONENT
// ==========================================

/**
 * Main Guild page content with events-first layout.
 *
 * @description Redesigned to put events front and center with smart empty states,
 * animated stats, capacity bars, and role-specific CTAs.
 */
export function GuildPageContent({ isManager, isApprentice, isExecutive, currentUserId, members }: GuildPageContentProps) {
    const [myAssignments, setMyAssignments] = useState<MyAssignment[]>([])
    const [events, setEvents] = useState<GuildEvent[]>([])
    const [lastPastEvent, setLastPastEvent] = useState<GuildEvent | null>(null)
    const [rsvpStatuses, setRsvpStatuses] = useState<Record<string, { attending: boolean; count: number; status: 'going' | 'maybe' | null; goingCount: number; maybeCount: number }>>({})
    const [summary, setSummary] = useState<EventSummary>({ upcomingCount: 0, totalThisMonth: 0 })
    const [loading, setLoading] = useState(true)
    const [createEventOpen, setCreateEventOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<string>(isManager ? "pool" : "assignments")
    const tabsRef = useRef<HTMLDivElement>(null)

    const loadData = async (): Promise<void> => {
        setLoading(true)

        try {
            // Load events for everyone
            const eventsResult = await getGuildEvents({ upcoming: true, limit: 10 })
            if (eventsResult.error) {
                toast.error('Failed to load events')
            }
            let filteredEvents: GuildEvent[] = []
            if (eventsResult.data) {
                // SECURITY: Executive-only filtering now handled server-side in getGuildEvents
                filteredEvents = eventsResult.data
                setEvents(filteredEvents)
                // Clear stale past event when upcoming events exist
                if (filteredEvents.length > 0) setLastPastEvent(null)

                // Load RSVP statuses for all visible events
                const eventIds = filteredEvents.map(e => e.id)
                if (eventIds.length > 0) {
                    const rsvpResult = await getEventRSVPStatuses(eventIds)
                    if (rsvpResult.data) {
                        setRsvpStatuses(rsvpResult.data)
                    }
                }
            }

            // If no upcoming events, fetch the most recent past event
            if (filteredEvents.length === 0) {
                const pastResult = await getGuildEvents({ past: true, limit: 1 })
                if (pastResult.data && pastResult.data.length > 0) {
                    setLastPastEvent(pastResult.data[0])
                }
            }

            // Load summary stats
            const summaryResult = await getGuildEventsSummary()
            if (summaryResult.data) {
                setSummary({
                    upcomingCount: summaryResult.data.upcomingCount,
                    totalThisMonth: summaryResult.data.totalThisMonth,
                })
            }

            // Load assignments for apprentices
            if (isApprentice) {
                const result = await getMyAssignments()
                if (result.error) {
                    toast.error('Failed to load your assignments')
                }
                if (result.assignments) {
                    setMyAssignments(result.assignments)
                }
            }
        } catch (err) {
            console.error('[Guild] Failed to load data:', err instanceof Error ? err.message : 'Unknown error')
            toast.error('Failed to load Guild data. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isApprentice, isExecutive])

    const handleEventCreated = (): void => {
        setCreateEventOpen(false)
        loadData()
    }

    // Sync RSVP changes across Hero and EventsSection
    const handleRSVPChange = useCallback((eventId: string, status: { attending: boolean; count: number; status: 'going' | 'maybe' | null; goingCount: number; maybeCount: number }) => {
        setRsvpStatuses(prev => ({ ...prev, [eventId]: status }))
    }, [])

    // Handle stat card clicks
    const handleStatClick = useCallback((action: string) => {
        if (action === 'network') {
            setActiveTab('network')
            tabsRef.current?.scrollIntoView({ behavior: 'smooth' })
        } else if (action === 'events') {
            // Scroll to top where events are
            window.scrollTo({ top: 0, behavior: 'smooth' })
        }
    }, [])

    // Handle tab switching from hero CTA
    const handleTabSwitch = useCallback((tab: string) => {
        setActiveTab(tab)
        tabsRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [])

    // Harper's proactive insights
    const { openPanel } = useAdvisorPanel()
    const handleDiscuss = useCallback((specialistId: string, context: string) => {
        openPanel(specialistId, { handoffContext: context, contextLabel: 'Guild' })
    }, [openPanel])

    const roleCounts = useMemo(() => {
        let apprenticeCount = 0
        let executiveCount = 0
        let founderCount = 0
        for (const m of members) {
            if (m.role === 'Apprentice') apprenticeCount++
            else if (m.role === 'Executive') executiveCount++
            else if (m.role === 'Founder') founderCount++
        }
        return { apprenticeCount, executiveCount, founderCount }
    }, [members])

    const { insights, dismissInsight } = usePageInsights(
        (fast) => generateGuildInsights({
            memberCount: members.length,
            apprenticeCount: roleCounts.apprenticeCount,
            executiveCount: roleCounts.executiveCount,
            founderCount: roleCounts.founderCount,
        }, fast),
        members.length > 0,
        { cacheKey: 'harper-guild', emptyInsight: EMPTY_STATE_INSIGHT },
    )

    // Split events: first goes to Hero, rest to EventsSection
    const featuredEvent = events.length > 0 ? events[0] : null
    const remainingEvents = events.length > 1 ? events.slice(1) : []

    // Calculate total attending across all events
    // INTENT: Only count confirmed "going" RSVPs, not "maybe"
    const totalAttending = Object.values(rsvpStatuses).reduce((sum, s) => sum + s.goingCount, 0)

    // Shared events-first layout used by both Manager and Apprentice views
    const eventsLayout = (
        <>
            {/* 1. Featured Event Hero */}
            <FeaturedEventHero
                event={featuredEvent}
                rsvpStatus={featuredEvent ? rsvpStatuses[featuredEvent.id] : undefined}
                onRSVPChange={handleRSVPChange}
                lastPastEvent={lastPastEvent}
                onCreateEvent={isExecutive ? () => setCreateEventOpen(true) : undefined}
                userRole={isManager ? 'manager' : isApprentice ? 'apprentice' : undefined}
                onTabSwitch={handleTabSwitch}
            />

            {/* 2. Stats Bar */}
            <GuildStatsBar
                upcomingEvents={summary.upcomingCount}
                totalMembers={members.length}
                totalAttending={totalAttending}
                eventsThisMonth={summary.totalThisMonth}
                onStatClick={handleStatClick}
            />

            {/* 3. Events Grid */}
            {remainingEvents.length > 0 && (
                <EventsSection
                    events={remainingEvents}
                    rsvpStatuses={rsvpStatuses}
                    onRSVPChange={handleRSVPChange}
                />
            )}
        </>
    )

    // Manager view - events-first, then management tabs
    if (isManager) {
        return (
            <div className="space-y-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-muted">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 mb-1">
                            <div className="h-8 w-1 bg-international-orange rounded-full shadow-[0_0_8px_rgba(255,69,0,0.4)]" />
                            <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">Guild</h1>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">
                            Your community hub for events, learning, and growth
                        </p>
                    </div>
                    {isExecutive && (
                        <Button onClick={() => setCreateEventOpen(true)} className="gap-2">
                            <Plus className="h-4 w-4" />
                            Create Event
                        </Button>
                    )}
                </div>

                {/* Harper's proactive insights */}
                {insights.length > 0 && (
                    <div className="space-y-3">
                        {insights.map((insight) => (
                            <SpecialistInsightCard
                                key={insight.id}
                                insight={insight}
                                onDismiss={() => dismissInsight(insight.id)}
                                onDiscuss={handleDiscuss}
                                compact
                            />
                        ))}
                    </div>
                )}

                {/* Events-first layout */}
                {loading ? (
                    <Card className="border">
                        <CardContent className="p-8 text-center">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground">Loading Guild...</p>
                        </CardContent>
                    </Card>
                ) : (
                    eventsLayout
                )}

                {/* Management Tabs */}
                <div ref={tabsRef}>
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                        <TabsList className="bg-muted">
                            <TabsTrigger value="pool" className="flex items-center gap-2">
                                <GraduationCap className="h-4 w-4" />
                                Apprentice Pool
                            </TabsTrigger>
                            <TabsTrigger value="assignments" className="flex items-center gap-2">
                                <Briefcase className="h-4 w-4" />
                                Assignments
                            </TabsTrigger>
                            <TabsTrigger value="network" className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Network
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="pool">
                            <ApprenticePoolBrowser />
                        </TabsContent>

                        <TabsContent value="assignments">
                            <ProjectAssignmentsList />
                        </TabsContent>

                        <TabsContent value="network">
                            <GuildNetwork
                                members={members}
                                currentUserId={currentUserId}
                                isExecutive={isExecutive}
                            />
                        </TabsContent>
                    </Tabs>
                </div>

                <CreateEventDialog
                    open={createEventOpen}
                    onOpenChange={setCreateEventOpen}
                    onCreated={handleEventCreated}
                />
            </div>
        )
    }

    // Apprentice view - events-first, then assignments + network
    if (isApprentice) {
        const activeAssignments = myAssignments.filter(a => a.status === 'active')
        const pastAssignments = myAssignments.filter(a => a.status !== 'active')

        return (
            <div className="space-y-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-muted">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 mb-1">
                            <div className="h-8 w-1 bg-international-orange rounded-full shadow-[0_0_8px_rgba(255,69,0,0.4)]" />
                            <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">Guild</h1>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">
                            Your community hub for events, learning, and growth
                        </p>
                    </div>
                </div>

                {/* Harper's proactive insights */}
                {insights.length > 0 && (
                    <div className="space-y-3">
                        {insights.map((insight) => (
                            <SpecialistInsightCard
                                key={insight.id}
                                insight={insight}
                                onDismiss={() => dismissInsight(insight.id)}
                                onDiscuss={handleDiscuss}
                                compact
                            />
                        ))}
                    </div>
                )}

                {/* Events-first layout */}
                {loading ? (
                    <Card className="border">
                        <CardContent className="p-8 text-center">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground">Loading Guild...</p>
                        </CardContent>
                    </Card>
                ) : (
                    eventsLayout
                )}

                {/* Apprentice Tabs: Assignments + Network */}
                <div ref={tabsRef}>
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                        <TabsList className="bg-muted">
                            <TabsTrigger value="assignments" className="flex items-center gap-2">
                                <Briefcase className="h-4 w-4" />
                                My Assignments
                            </TabsTrigger>
                            <TabsTrigger value="network" className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Network
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="assignments">
                            {loading ? (
                                <Card className="border">
                                    <CardContent className="p-8 text-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
                                        <p className="text-muted-foreground">Loading your assignments...</p>
                                    </CardContent>
                                </Card>
                            ) : myAssignments.length === 0 ? (
                                <Card className="border">
                                    <CardContent className="p-8 text-center">
                                        <GraduationCap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                        <h3 className="text-lg font-semibold text-foreground mb-2">No Assignments Yet</h3>
                                        <p className="text-muted-foreground">
                                            You haven&apos;t been assigned to any projects yet. Companies can find you in the Guild pool and assign you to their projects.
                                        </p>
                                    </CardContent>
                                </Card>
                            ) : (
                                <div className="space-y-6">
                                    {/* Active Assignments */}
                                    {activeAssignments.length > 0 && (
                                        <Card className="border">
                                            <CardHeader>
                                                <CardTitle className="flex items-center gap-2 text-lg">
                                                    <Briefcase className="h-5 w-5 text-status-success" />
                                                    Active Assignments
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-4">
                                                {activeAssignments.map((assignment) => (
                                                    <div
                                                        key={assignment.id}
                                                        className="p-4 border border-status-success-light rounded-lg bg-status-success-light"
                                                    >
                                                        <div className="flex items-start justify-between">
                                                            <div>
                                                                <h4 className="font-semibold text-foreground">{assignment.projectName}</h4>
                                                                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                                                    <Building2 className="h-4 w-4" />
                                                                    <span>{assignment.foundryName}</span>
                                                                </div>
                                                                {assignment.projectDescription && (
                                                                    <p className="text-sm text-muted-foreground mt-2">
                                                                        {assignment.projectDescription}
                                                                    </p>
                                                                )}
                                                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-3">
                                                                    <Clock className="h-3 w-3" />
                                                                    <span>Started {formatDistanceToNow(new Date(assignment.startedAt), { addSuffix: true })}</span>
                                                                    <span className="text-muted-foreground">|</span>
                                                                    <span>Assigned by {assignment.assignedByName}</span>
                                                                </div>
                                                            </div>
                                                            <Badge className="bg-status-success text-status-success-foreground">Active</Badge>
                                                        </div>
                                                    </div>
                                                ))}
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* Past Assignments */}
                                    {pastAssignments.length > 0 && (
                                        <Card className="border">
                                            <CardHeader>
                                                <CardTitle className="flex items-center gap-2 text-lg text-muted-foreground">
                                                    <Clock className="h-5 w-5" />
                                                    Past Assignments
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                {pastAssignments.map((assignment) => (
                                                    <div
                                                        key={assignment.id}
                                                        className="p-4 border border-muted rounded-lg opacity-70"
                                                    >
                                                        <div className="flex items-start justify-between">
                                                            <div>
                                                                <h4 className="font-medium text-foreground">{assignment.projectName}</h4>
                                                                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                                                    <Building2 className="h-4 w-4" />
                                                                    <span>{assignment.foundryName}</span>
                                                                </div>
                                                            </div>
                                                            <Badge
                                                                variant="outline"
                                                                className={
                                                                    assignment.status === 'completed'
                                                                        ? 'border text-status-info'
                                                                        : 'border-destructive text-destructive'
                                                                }
                                                            >
                                                                {assignment.status}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                ))}
                                            </CardContent>
                                        </Card>
                                    )}
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="network">
                            <GuildNetwork
                                members={members}
                                currentUserId={currentUserId}
                                isExecutive={false}
                            />
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        )
    }

    return null
}
