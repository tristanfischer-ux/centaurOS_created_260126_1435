"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Progress } from "@/components/ui/progress"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Calendar,
    MapPin,
    Lock,
    Users,
    CheckCircle2,
    Loader2,
    Video,
    ArrowRight,
    ChevronDown,
    CircleDot,
} from "lucide-react"
import { toast } from "sonner"
import { setRSVPStatus } from "@/actions/guild-events"
import { EVENT_TYPE_CONFIG } from "./guild-constants"
import type { GuildEvent } from "@/actions/guild-events"

// ==========================================
// TYPES
// ==========================================

interface RSVPStatus {
    attending: boolean
    count: number
    status: 'going' | 'maybe' | null
    goingCount: number
    maybeCount: number
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
 * @description Displays upcoming events with RSVP split buttons,
 * capacity bars, and event type badges.
 */
export function EventsSection({ events, rsvpStatuses, onRSVPChange }: EventsSectionProps) {
    const [localRsvp, setLocalRsvp] = useState<Record<string, RSVPStatus>>(rsvpStatuses)
    const [loadingRsvp, setLoadingRsvp] = useState<string | null>(null)

    useEffect(() => { setLocalRsvp(rsvpStatuses) }, [rsvpStatuses])

    const handleSetStatus = useCallback(async (eventId: string, newStatus: 'going' | 'maybe' | 'cancelled') => {
        setLoadingRsvp(eventId)
        try {
            const result = await setRSVPStatus(eventId, newStatus)
            if (result.error) {
                toast.error(result.error)
                return
            }
            const updated: RSVPStatus = {
                attending: result.status === 'going',
                count: result.goingCount,
                status: result.status === 'cancelled' ? null : result.status,
                goingCount: result.goingCount,
                maybeCount: result.maybeCount,
            }
            setLocalRsvp(prev => ({ ...prev, [eventId]: updated }))
            onRSVPChange?.(eventId, updated)
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
                    const eventRsvp = localRsvp[event.id] || { attending: false, count: 0, status: null, goingCount: 0, maybeCount: 0 }
                    const isLoading = loadingRsvp === event.id
                    const typeConfig = EVENT_TYPE_CONFIG[event.event_type || 'meetup']
                    const TypeIcon = typeConfig?.icon || Calendar
                    const eventDate = new Date(event.event_date)
                    const isFull = event.max_attendees != null && eventRsvp.goingCount >= event.max_attendees
                    const capacityPercent = event.max_attendees ? Math.min((eventRsvp.goingCount / event.max_attendees) * 100, 100) : null

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
                                {isFull && (
                                    <Badge variant="destructive" className="ml-auto text-[10px]">Full</Badge>
                                )}
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

                                {/* Capacity Bar */}
                                {event.max_attendees != null && capacityPercent !== null && (
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                            <span>{eventRsvp.goingCount} / {event.max_attendees} spots</span>
                                        </div>
                                        <Progress
                                            value={capacityPercent}
                                            className={`h-1.5 ${capacityPercent >= 100 ? "[&>div]:bg-destructive" : capacityPercent >= 80 ? "[&>div]:bg-status-warning" : ""}`}
                                        />
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex items-center gap-3 pt-1">
                                    <div className="flex items-center">
                                        <Button
                                            size="sm"
                                            variant={eventRsvp.status ? "outline" : "default"}
                                            onClick={() => {
                                                if (!eventRsvp.status) handleSetStatus(event.id, 'going')
                                                else handleSetStatus(event.id, 'cancelled')
                                            }}
                                            disabled={isLoading || (isFull && !eventRsvp.status)}
                                            className={`rounded-r-none ${
                                                eventRsvp.status === 'going' ? "border-status-success text-status-success hover:bg-status-success-light" :
                                                eventRsvp.status === 'maybe' ? "border-status-warning text-status-warning-dark hover:bg-status-warning-light" : ""
                                            }`}
                                        >
                                            {isLoading ? (
                                                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                            ) : eventRsvp.status === 'going' ? (
                                                <CheckCircle2 className="mr-1 h-4 w-4" />
                                            ) : eventRsvp.status === 'maybe' ? (
                                                <CircleDot className="mr-1 h-4 w-4" />
                                            ) : null}
                                            {eventRsvp.status === 'going' ? "Going" : eventRsvp.status === 'maybe' ? "Maybe" : "RSVP"}
                                        </Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    size="sm"
                                                    variant={eventRsvp.status ? "outline" : "default"}
                                                    disabled={isLoading}
                                                    className={`rounded-l-none border-l-0 px-1.5 ${
                                                        eventRsvp.status === 'going' ? "border-status-success text-status-success" :
                                                        eventRsvp.status === 'maybe' ? "border-status-warning text-status-warning-dark" : ""
                                                    }`}
                                                >
                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onClick={() => handleSetStatus(event.id, 'going')}
                                                    disabled={isFull && eventRsvp.status !== 'going'}
                                                    className="text-status-success"
                                                >
                                                    <CheckCircle2 className="h-4 w-4 mr-2" /> Going
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => handleSetStatus(event.id, 'maybe')}
                                                    className="text-status-warning-dark"
                                                >
                                                    <CircleDot className="h-4 w-4 mr-2" /> Maybe
                                                </DropdownMenuItem>
                                                {eventRsvp.status && (
                                                    <DropdownMenuItem
                                                        onClick={() => handleSetStatus(event.id, 'cancelled')}
                                                        className="text-destructive"
                                                    >
                                                        Cancel RSVP
                                                    </DropdownMenuItem>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>

                                    {(eventRsvp.goingCount > 0 || eventRsvp.maybeCount > 0) && (
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Users className="h-3.5 w-3.5" />
                                            {eventRsvp.goingCount > 0 && `${eventRsvp.goingCount} going`}
                                            {eventRsvp.goingCount > 0 && eventRsvp.maybeCount > 0 && ", "}
                                            {eventRsvp.maybeCount > 0 && `${eventRsvp.maybeCount} maybe`}
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
