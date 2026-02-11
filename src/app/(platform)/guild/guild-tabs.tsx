"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
    MapPin,
    Lock,
    Calendar,
    Users,
    CheckCircle2,
    Loader2,
    Search,
    Video,
    Zap,
    GraduationCap,
    Presentation,
    Handshake,
    ArrowRight
} from "lucide-react"
import { toggleRSVP } from "@/actions/guild-events"
import type { EventType, EventFormat } from "@/actions/guild-events"

// ==========================================
// TYPES
// ==========================================

interface GuildEvent {
    id: string
    title: string
    description: string | null
    event_date: string
    event_type?: EventType
    event_format?: EventFormat
    event_url?: string | null
    location_geo: string | null
    is_executive_only: boolean
}

interface Member {
    id: string
    full_name: string | null
    role: string | null
    email: string | null
    foundry_name?: string
}

interface RSVPStatus {
    attending: boolean
    count: number
}

interface GuildTabsProps {
    /** Pre-filtered events (executive-only removed server-side for non-executives) */
    events: GuildEvent[]
    /** Guild community members */
    members: Member[]
    /** Whether the current user is Executive/Founder */
    isExecutive: boolean
    /** Pre-loaded RSVP statuses keyed by event ID */
    rsvpStatuses?: Record<string, RSVPStatus>
}

// ==========================================
// HELPERS
// ==========================================

const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: typeof Calendar; className: string }> = {
    speed_networking: {
        label: 'Speed Networking',
        icon: Zap,
        className: 'bg-chart-5/10 text-chart-5 border-chart-5/20'
    },
    workshop: {
        label: 'Workshop',
        icon: Presentation,
        className: 'bg-status-info-light text-status-info border-status-info/20'
    },
    career_fair: {
        label: 'Career Fair',
        icon: GraduationCap,
        className: 'bg-status-success-light text-status-success border-status-success/20'
    },
    meetup: {
        label: 'Meetup',
        icon: Handshake,
        className: 'bg-muted text-muted-foreground border'
    },
    summit: {
        label: 'Summit',
        icon: Calendar,
        className: 'bg-status-warning-light text-status-warning-dark border-status-warning/20'
    },
}

function getRoleBadgeClass(role: string | null): string {
    switch (role) {
        case 'Founder':
            return 'bg-chart-5/20 text-chart-5 border-chart-5/30'
        case 'Executive':
            return 'bg-status-warning-light text-status-warning-dark border-status-warning/30'
        case 'Apprentice':
            return 'bg-status-info-light text-status-info border-status-info/30'
        case 'AI_Agent':
            return 'bg-chart-5/20 text-chart-5 border-chart-5/30'
        default:
            return 'bg-muted text-muted-foreground border'
    }
}

// ==========================================
// COMPONENT
// ==========================================

/**
 * Community sub-tabs for the Guild page: Events and Network.
 *
 * @description Events tab shows upcoming events with RSVP buttons, event type badges,
 * format indicators, and links to detail pages. Network tab shows Guild members with
 * search/filter capability.
 */
export function GuildTabs({ events, members, rsvpStatuses = {} }: GuildTabsProps) {
    const [rsvpState, setRsvpState] = useState<Record<string, RSVPStatus>>(rsvpStatuses)
    const [loadingRsvp, setLoadingRsvp] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")

    const handleRSVP = useCallback(async (eventId: string) => {
        setLoadingRsvp(eventId)
        try {
            const result = await toggleRSVP(eventId)
            if (!result.error) {
                setRsvpState(prev => ({
                    ...prev,
                    [eventId]: { attending: result.attending, count: result.attendeeCount }
                }))
            }
        } catch (err) {
            console.error('[GuildTabs] RSVP failed:', err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setLoadingRsvp(null)
        }
    }, [])

    const filteredMembers = searchQuery.trim()
        ? members.filter(m =>
            m.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.role?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.foundry_name?.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : members

    return (
        <Tabs defaultValue="events" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 max-w-xs">
                <TabsTrigger value="events" className="gap-2">
                    <Calendar className="h-4 w-4" />
                    <span className="hidden sm:inline">Events</span>
                </TabsTrigger>
                <TabsTrigger value="network" className="gap-2">
                    <Users className="h-4 w-4" />
                    <span className="hidden sm:inline">Network</span>
                </TabsTrigger>
            </TabsList>

            {/* Events Tab */}
            <TabsContent value="events" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Offline-to-Online (O2O) networking events and workshops.
                </p>

                <div className="grid gap-4">
                    {events.length === 0 ? (
                        <EmptyState
                            icon={<Calendar className="h-8 w-8" />}
                            title="No Upcoming Events"
                            description="Check back soon for new networking opportunities."
                            className="border-2 border-dashed border-muted"
                        />
                    ) : (
                        events.map(event => {
                            const eventRsvp = rsvpState[event.id] || { attending: false, count: 0 }
                            const isLoading = loadingRsvp === event.id
                            const typeConfig = EVENT_TYPE_CONFIG[event.event_type || 'meetup']
                            const TypeIcon = typeConfig?.icon || Calendar

                            return (
                                <Card key={event.id} className="bg-card flex flex-col md:flex-row overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                                    {/* Date Panel */}
                                    <div className="bg-muted p-6 flex flex-col items-center justify-center min-w-[120px]">
                                        <span className="text-2xl font-bold text-foreground">
                                            {new Date(event.event_date).getDate()}
                                        </span>
                                        <span className="text-sm text-muted-foreground uppercase">
                                            {new Date(event.event_date).toLocaleString('default', { month: 'short' })}
                                        </span>
                                        <span className="text-xs text-muted-foreground mt-1">
                                            {new Date(event.event_date).toLocaleString('default', {
                                                hour: 'numeric', minute: '2-digit', hour12: true
                                            })}
                                        </span>
                                    </div>

                                    {/* Event Content */}
                                    <div className="flex-1 p-6">
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            {/* Event Type Badge */}
                                            {typeConfig && (
                                                <Badge variant="secondary" className={typeConfig.className}>
                                                    <TypeIcon className="mr-1 h-3 w-3" />
                                                    {typeConfig.label}
                                                </Badge>
                                            )}

                                            {/* Format Badge */}
                                            {event.event_format === 'online' && (
                                                <Badge variant="secondary" className="bg-chart-5/10 text-chart-5 border-chart-5/20">
                                                    <Video className="mr-1 h-3 w-3" /> Online
                                                </Badge>
                                            )}
                                            {event.event_format === 'hybrid' && (
                                                <Badge variant="secondary" className="bg-chart-5/10 text-chart-5 border-chart-5/20">
                                                    <Video className="mr-1 h-3 w-3" /> Hybrid
                                                </Badge>
                                            )}

                                            {/* Location */}
                                            {event.location_geo && (
                                                <Badge variant="secondary" className="text-muted-foreground">
                                                    <MapPin className="mr-1 h-3 w-3" /> {event.location_geo}
                                                </Badge>
                                            )}

                                            {/* Executive Only */}
                                            {event.is_executive_only && (
                                                <Badge className="bg-status-warning-light text-status-warning-dark border border-status-warning/30">
                                                    <Lock className="mr-1 h-3 w-3" /> Executive Only
                                                </Badge>
                                            )}
                                        </div>

                                        <Link href={`/guild/events/${event.id}`} className="group">
                                            <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-electric-blue transition-colors">
                                                {event.title}
                                            </h3>
                                        </Link>
                                        <p className="text-muted-foreground text-sm mb-4 line-clamp-2">{event.description}</p>

                                        <div className="flex items-center gap-4">
                                            {/* RSVP Button */}
                                            <Button
                                                size="sm"
                                                variant={eventRsvp.attending ? "outline" : "default"}
                                                onClick={() => handleRSVP(event.id)}
                                                disabled={isLoading}
                                                className={eventRsvp.attending ? "border-status-success text-status-success hover:bg-status-success-light" : ""}
                                            >
                                                {isLoading ? (
                                                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                                ) : eventRsvp.attending ? (
                                                    <CheckCircle2 className="mr-1 h-4 w-4" />
                                                ) : null}
                                                {eventRsvp.attending ? "Going" : "RSVP"}
                                            </Button>

                                            {/* Attendee Count */}
                                            {eventRsvp.count > 0 && (
                                                <span className="text-sm text-muted-foreground flex items-center gap-1">
                                                    <Users className="h-3.5 w-3.5" />
                                                    {eventRsvp.count} {eventRsvp.count === 1 ? 'person' : 'people'} going
                                                </span>
                                            )}

                                            {/* View Details */}
                                            <Link
                                                href={`/guild/events/${event.id}`}
                                                className="text-sm text-electric-blue hover:underline ml-auto flex items-center gap-1"
                                            >
                                                Details <ArrowRight className="h-3 w-3" />
                                            </Link>
                                        </div>
                                    </div>
                                </Card>
                            )
                        })
                    )}
                </div>
            </TabsContent>

            {/* Network Tab */}
            <TabsContent value="network" className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                        Connect with other members of The Guild community.
                    </p>
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="guild-member-search"
                            placeholder="Search members..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                            aria-label="Search Guild members"
                        />
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredMembers.length === 0 ? (
                        <div className="col-span-full">
                            <EmptyState
                                icon={<Users className="h-8 w-8" />}
                                title={searchQuery ? "No Members Found" : "No Members Yet"}
                                description={searchQuery
                                    ? `No members match "${searchQuery}". Try a different search.`
                                    : "Be the first to join the Guild network."
                                }
                                className="border-2 border-dashed border-muted"
                            />
                        </div>
                    ) : (
                        filteredMembers.map(member => (
                            <Card key={member.id} className="p-4 bg-card hover:shadow-md transition-shadow">
                                <div className="flex items-start gap-3">
                                    <UserAvatar
                                        name={member.full_name}
                                        role={member.role}
                                        size="lg"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-foreground truncate">
                                            {member.full_name || "Unknown"}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge
                                                variant="secondary"
                                                className={`text-xs ${getRoleBadgeClass(member.role)}`}
                                            >
                                                {member.role || "Member"}
                                            </Badge>
                                        </div>
                                        {member.foundry_name && (
                                            <p className="text-xs text-muted-foreground mt-1 truncate">
                                                {member.foundry_name}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        ))
                    )}
                </div>
            </TabsContent>
        </Tabs>
    )
}
