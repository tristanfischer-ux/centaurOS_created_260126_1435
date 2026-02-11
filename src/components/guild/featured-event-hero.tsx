"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Calendar,
    MapPin,
    Lock,
    Users,
    CheckCircle2,
    Loader2,
    Video,
    ArrowRight,
    Sparkles,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
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

interface FeaturedEventHeroProps {
    /** The next upcoming event to feature prominently */
    event: GuildEvent | null
    /** Pre-loaded RSVP status for this event */
    rsvpStatus?: RSVPStatus
    /** Callback when RSVP status changes (to sync parent state) */
    onRSVPChange?: (eventId: string, status: RSVPStatus) => void
}

// ==========================================
// COMPONENT
// ==========================================

/**
 * Full-width hero card showcasing the next upcoming Guild event.
 *
 * @description The centerpiece of the redesigned Guild page. Displays
 * the next event with a bold date panel, event details, countdown,
 * and a prominent RSVP call-to-action. When no event exists, shows
 * an encouraging empty state.
 *
 * @component
 *
 * @example
 * <FeaturedEventHero
 *   event={nextEvent}
 *   rsvpStatus={rsvpStatuses[nextEvent.id]}
 *   onRSVPChange={handleRSVPChange}
 * />
 */
export function FeaturedEventHero({ event, rsvpStatus, onRSVPChange }: FeaturedEventHeroProps) {
    const [localRsvp, setLocalRsvp] = useState<RSVPStatus>(
        rsvpStatus || { attending: false, count: 0 }
    )
    const [loadingRsvp, setLoadingRsvp] = useState(false)

    // Sync local state when parent RSVP status prop changes
    useEffect(() => {
        setLocalRsvp(rsvpStatus || { attending: false, count: 0 })
    }, [rsvpStatus])

    const handleRSVP = useCallback(async () => {
        if (!event) return
        setLoadingRsvp(true)
        try {
            const result = await toggleRSVP(event.id)
            if (result.error) {
                toast.error(result.error)
                return
            }
            const newStatus = { attending: result.attending, count: result.attendeeCount }
            setLocalRsvp(newStatus)
            onRSVPChange?.(event.id, newStatus)
        } catch (err) {
            console.error('[FeaturedEventHero] RSVP failed:', err instanceof Error ? err.message : 'Unknown error')
            toast.error('Failed to update RSVP. Please try again.')
        } finally {
            setLoadingRsvp(false)
        }
    }, [event, onRSVPChange])

    // Empty state: no upcoming events
    if (!event) {
        return (
            <Card className="border-2 border-dashed border-muted overflow-hidden">
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                    <div className="p-4 bg-international-orange-light rounded-2xl mb-4">
                        <Sparkles className="h-8 w-8 text-international-orange" />
                    </div>
                    <h2 className="text-xl font-display font-semibold text-foreground mb-2">
                        No upcoming events yet
                    </h2>
                    <p className="text-muted-foreground text-sm max-w-md">
                        Guild events bring the community together for networking, workshops, and career growth.
                        Check back soon for new opportunities.
                    </p>
                </div>
            </Card>
        )
    }

    const eventDate = new Date(event.event_date)
    const typeConfig = EVENT_TYPE_CONFIG[event.event_type || 'meetup']
    const TypeIcon = typeConfig?.icon || Calendar
    const isPast = eventDate < new Date()

    return (
        <Card className="overflow-hidden border-l-4 border-l-international-orange hover:shadow-lg transition-all duration-200">
            <div className="flex flex-col md:flex-row">
                {/* Date Panel */}
                <div className="bg-muted flex flex-col items-center justify-center px-8 py-6 md:min-w-[140px]">
                    <span className="text-4xl font-bold text-foreground leading-none">
                        {eventDate.getDate()}
                    </span>
                    <span className="text-sm font-medium text-muted-foreground uppercase mt-1">
                        {eventDate.toLocaleString('default', { month: 'short' })}
                    </span>
                    <span className="text-xs text-muted-foreground mt-2">
                        {eventDate.toLocaleString('default', {
                            weekday: 'short',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                        })}
                    </span>
                </div>

                {/* Event Content */}
                <div className="flex-1 p-6 space-y-4">
                    {/* Badges Row */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* "Next Event" label */}
                        <Badge className="bg-international-orange text-white border-0">
                            Next Event
                        </Badge>

                        {/* Event Type */}
                        {typeConfig && (
                            <Badge variant="secondary" className={typeConfig.className}>
                                <TypeIcon className="mr-1 h-3 w-3" />
                                {typeConfig.label}
                            </Badge>
                        )}

                        {/* Format */}
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

                        {/* Executive Only */}
                        {event.is_executive_only && (
                            <Badge className="bg-status-warning-light text-status-warning-dark border border-status-warning/30">
                                <Lock className="mr-1 h-3 w-3" /> Executive Only
                            </Badge>
                        )}
                    </div>

                    {/* Title */}
                    <Link href={`/guild/events/${event.id}`} className="group block">
                        <h2 className="text-xl sm:text-2xl font-display font-semibold text-foreground tracking-tight group-hover:text-electric-blue transition-colors">
                            {event.title}
                        </h2>
                    </Link>

                    {/* Meta row: location + countdown */}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        {event.location_geo && (
                            <span className="flex items-center gap-1.5">
                                <MapPin className="h-4 w-4" />
                                {event.location_geo}
                            </span>
                        )}
                        {!isPast && (
                            <span className="flex items-center gap-1.5 text-international-orange font-medium">
                                <Calendar className="h-4 w-4" />
                                Starts {formatDistanceToNow(eventDate, { addSuffix: true })}
                            </span>
                        )}
                        {localRsvp.count > 0 && (
                            <span className="flex items-center gap-1.5">
                                <Users className="h-4 w-4" />
                                {localRsvp.count} {localRsvp.count === 1 ? 'person' : 'people'} going
                            </span>
                        )}
                    </div>

                    {/* Description (truncated) */}
                    {event.description && (
                        <p className="text-muted-foreground text-sm line-clamp-2">
                            {event.description}
                        </p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-1">
                        <Button
                            variant={localRsvp.attending ? "outline" : "default"}
                            onClick={handleRSVP}
                            disabled={loadingRsvp}
                            className={localRsvp.attending ? "border-status-success text-status-success hover:bg-status-success-light" : ""}
                        >
                            {loadingRsvp ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : localRsvp.attending ? (
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                            ) : null}
                            {localRsvp.attending ? "Going" : "RSVP Now"}
                        </Button>

                        <Link
                            href={`/guild/events/${event.id}`}
                            className="text-sm text-electric-blue hover:underline flex items-center gap-1 font-medium"
                        >
                            View Details <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>
                </div>
            </div>
        </Card>
    )
}
