"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import {
    Calendar,
    MapPin,
    Lock,
    Users,
    CheckCircle2,
    Loader2,
    Video,
    ArrowRight,
} from "lucide-react"
import { toast } from "sonner"
import { toggleRSVP } from "@/actions/guild-events"
import { EVENT_TYPE_CONFIG } from "./guild-constants"
import type { GuildEvent } from "@/actions/guild-events"

// ==========================================
// TYPES
// ==========================================

interface RSVPStatus {
    attending: boolean
    count: number
}

interface EventsSectionProps {
    /** Events to display (excluding the featured hero event) */
    events: GuildEvent[]
    /** Pre-loaded RSVP statuses keyed by event ID */
    rsvpStatuses: Record<string, RSVPStatus>
    /** Callback when RSVP status changes (to sync parent state) */
    onRSVPChange?: (eventId: string, status: RSVPStatus) => void
}

// ==========================================
// COMPONENT
// ==========================================

/**
 * Top-level events grid for the Guild page.
 *
 * @description Displays upcoming events in a responsive 2-column grid with
 * RSVP buttons, event type/format badges, and links to detail pages.
 * Extracted from the nested GuildTabs component to be a first-class
 * section on the Guild page.
 *
 * @component
 *
 * @example
 * <EventsSection
 *   events={remainingEvents}
 *   rsvpStatuses={rsvpStatuses}
 *   onRSVPChange={handleRSVPChange}
 * />
 */
export function EventsSection({ events, rsvpStatuses, onRSVPChange }: EventsSectionProps) {
    const [localRsvp, setLocalRsvp] = useState<Record<string, RSVPStatus>>(rsvpStatuses)
    const [loadingRsvp, setLoadingRsvp] = useState<string | null>(null)

    // Sync local state when parent RSVP statuses change (e.g. after RSVP from hero component)
    useEffect(() => { setLocalRsvp(rsvpStatuses) }, [rsvpStatuses])

    const handleRSVP = useCallback(async (eventId: string) => {
        setLoadingRsvp(eventId)
        try {
            const result = await toggleRSVP(eventId)
            if (result.error) {
                toast.error(result.error)
                return
            }
            const newStatus = { attending: result.attending, count: result.attendeeCount }
            setLocalRsvp(prev => ({ ...prev, [eventId]: newStatus }))
            onRSVPChange?.(eventId, newStatus)
        } catch (err) {
            console.error('[EventsSection] RSVP failed:', err instanceof Error ? err.message : 'Unknown error')
            toast.error('Failed to update RSVP. Please try again.')
        } finally {
            setLoadingRsvp(null)
        }
    }, [onRSVPChange])

    if (events.length === 0) {
        return (
            <div className="space-y-4">
                <h2 className="text-xl font-display font-semibold text-foreground tracking-tight">
                    More Events
                </h2>
                <EmptyState
                    icon={<Calendar className="h-8 w-8" />}
                    title="No More Upcoming Events"
                    description="That's the only event for now. Check back soon for more networking opportunities."
                    className="border-2 border-dashed border-muted"
                />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-display font-semibold text-foreground tracking-tight">
                Upcoming Events
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {events.map(event => {
                    const eventRsvp = localRsvp[event.id] || { attending: false, count: 0 }
                    const isLoading = loadingRsvp === event.id
                    const typeConfig = EVENT_TYPE_CONFIG[event.event_type || 'meetup']
                    const TypeIcon = typeConfig?.icon || Calendar
                    const eventDate = new Date(event.event_date)

                    return (
                        <Card
                            key={event.id}
                            className="bg-card overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                        >
                            {/* Compact Date Strip */}
                            <div className="bg-muted px-4 py-3 flex items-center gap-3 border-b border-muted">
                                <div className="text-center min-w-[40px]">
                                    <span className="text-lg font-bold text-foreground leading-none block">
                                        {eventDate.getDate()}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground uppercase">
                                        {eventDate.toLocaleString('default', { month: 'short' })}
                                    </span>
                                </div>
                                <div className="h-8 w-px bg-border" />
                                <span className="text-xs text-muted-foreground">
                                    {eventDate.toLocaleString('default', {
                                        weekday: 'short',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                        hour12: true,
                                    })}
                                </span>
                            </div>

                            {/* Event Content */}
                            <div className="p-5 space-y-3">
                                {/* Badges */}
                                <div className="flex flex-wrap gap-1.5">
                                    {typeConfig && (
                                        <Badge variant="secondary" className={typeConfig.className}>
                                            <TypeIcon className="mr-1 h-3 w-3" />
                                            {typeConfig.label}
                                        </Badge>
                                    )}
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
                                    {event.location_geo && (
                                        <Badge variant="secondary" className="text-muted-foreground">
                                            <MapPin className="mr-1 h-3 w-3" /> {event.location_geo}
                                        </Badge>
                                    )}
                                    {event.is_executive_only && (
                                        <Badge className="bg-status-warning-light text-status-warning-dark border border-status-warning/30">
                                            <Lock className="mr-1 h-3 w-3" /> Executive Only
                                        </Badge>
                                    )}
                                </div>

                                {/* Title */}
                                <Link href={`/guild/events/${event.id}`} className="group block">
                                    <h3 className="text-base font-semibold text-foreground group-hover:text-electric-blue transition-colors line-clamp-1">
                                        {event.title}
                                    </h3>
                                </Link>

                                {/* Description */}
                                {event.description && (
                                    <p className="text-muted-foreground text-sm line-clamp-2">
                                        {event.description}
                                    </p>
                                )}

                                {/* Actions */}
                                <div className="flex items-center gap-3 pt-1">
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

                                    {eventRsvp.count > 0 && (
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Users className="h-3.5 w-3.5" />
                                            {eventRsvp.count}
                                        </span>
                                    )}

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
                })}
            </div>
        </div>
    )
}
