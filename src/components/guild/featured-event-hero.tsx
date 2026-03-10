"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
    Sparkles,
    ChevronDown,
    CircleDot,
    Network,
    Briefcase,
    Plus,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
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

interface FeaturedEventHeroProps {
    /** The next upcoming event to feature prominently */
    event: GuildEvent | null
    /** Pre-loaded RSVP status for this event */
    rsvpStatus?: RSVPStatus
    /** Callback when RSVP status changes (to sync parent state) */
    onRSVPChange?: (eventId: string, status: RSVPStatus) => void
    /** Last past event to show when no upcoming events exist */
    lastPastEvent?: GuildEvent | null
    /** Callback to open create event dialog */
    onCreateEvent?: () => void
    /** User role for role-specific CTAs */
    userRole?: 'manager' | 'apprentice'
    /** Callback to switch to a specific tab */
    onTabSwitch?: (tab: string) => void
}

// ==========================================
// COMPONENT
// ==========================================

/**
 * Full-width hero card showcasing the next upcoming Guild event.
 *
 * @description Features role-specific empty states, capacity bar,
 * and split RSVP button (Going/Maybe/Cancel).
 */
export function FeaturedEventHero({
    event,
    rsvpStatus,
    onRSVPChange,
    lastPastEvent,
    onCreateEvent,
    userRole,
    onTabSwitch,
}: FeaturedEventHeroProps) {
    const [localRsvp, setLocalRsvp] = useState<RSVPStatus>(
        rsvpStatus || { attending: false, count: 0, status: null, goingCount: 0, maybeCount: 0 }
    )
    const [loadingRsvp, setLoadingRsvp] = useState(false)

    useEffect(() => {
        setLocalRsvp(rsvpStatus || { attending: false, count: 0, status: null, goingCount: 0, maybeCount: 0 })
    }, [rsvpStatus])

    const handleSetStatus = useCallback(async (newStatus: 'going' | 'maybe' | 'cancelled') => {
        if (!event) return
        setLoadingRsvp(true)
        try {
            const result = await setRSVPStatus(event.id, newStatus)
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
            setLocalRsvp(updated)
            onRSVPChange?.(event.id, updated)
        } catch (err) {
            console.error('[FeaturedEventHero] RSVP failed:', err instanceof Error ? err.message : 'Unknown error')
            toast.error('Failed to update RSVP. Please try again.')
        } finally {
            setLoadingRsvp(false)
        }
    }, [event, onRSVPChange])

    // Empty state: no upcoming events
    if (!event) {
        // Show most recent past event in muted style
        if (lastPastEvent) {
            const pastDate = new Date(lastPastEvent.event_date)
            return (
                <Card className="overflow-hidden border opacity-80">
                    <div className="flex flex-col md:flex-row">
                        <div className="bg-muted flex flex-col items-center justify-center px-8 py-6 md:min-w-[140px]">
                            <span className="text-4xl font-bold text-muted-foreground leading-none">
                                {pastDate.getDate()}
                            </span>
                            <span className="text-sm font-medium text-muted-foreground uppercase mt-1">
                                {pastDate.toLocaleString('default', { month: 'short' })}
                            </span>
                        </div>
                        <div className="flex-1 p-6 space-y-3">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-muted-foreground">Past Event</Badge>
                            </div>
                            <Link href={`/guild/events/${lastPastEvent.id}`} className="group block">
                                <h2 className="text-xl font-display font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                                    {lastPastEvent.title}
                                </h2>
                            </Link>
                            {lastPastEvent.description && (
                                <p className="text-muted-foreground text-sm line-clamp-2">{lastPastEvent.description}</p>
                            )}
                        </div>
                    </div>
                </Card>
            )
        }

        // Role-specific empty state
        return (
            <Card className="border-2 border-dashed border-muted overflow-hidden">
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                    <div className="p-4 bg-international-orange-light rounded-2xl mb-4">
                        <Sparkles className="h-8 w-8 text-international-orange" />
                    </div>

                    {userRole === 'manager' ? (
                        <>
                            <h2 className="text-xl font-display font-semibold text-foreground mb-2">
                                Host your first event
                            </h2>
                            <p className="text-muted-foreground text-sm max-w-md mb-4">
                                Workshops, speed networking, career fairs — what will you host first?
                            </p>
                            {onCreateEvent && (
                                <Button onClick={onCreateEvent} className="gap-2">
                                    <Plus className="h-4 w-4" />
                                    Create Event
                                </Button>
                            )}
                        </>
                    ) : userRole === 'apprentice' ? (
                        <>
                            <h2 className="text-xl font-display font-semibold text-foreground mb-2">
                                No upcoming events yet
                            </h2>
                            <p className="text-muted-foreground text-sm max-w-md mb-4">
                                Explore the Network tab to connect with others, or check your Assignments.
                            </p>
                            <div className="flex items-center gap-3">
                                {onTabSwitch && (
                                    <>
                                        <Button variant="outline" size="sm" onClick={() => onTabSwitch('network')} className="gap-2">
                                            <Network className="h-4 w-4" /> Network
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => onTabSwitch('assignments')} className="gap-2">
                                            <Briefcase className="h-4 w-4" /> Assignments
                                        </Button>
                                    </>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <h2 className="text-xl font-display font-semibold text-foreground mb-2">
                                No upcoming events yet
                            </h2>
                            <p className="text-muted-foreground text-sm max-w-md">
                                Guild events bring the community together for networking, workshops, and career growth.
                                Check back soon for new opportunities.
                            </p>
                        </>
                    )}
                </div>
            </Card>
        )
    }

    const eventDate = new Date(event.event_date)
    const typeConfig = EVENT_TYPE_CONFIG[event.event_type || 'meetup']
    const TypeIcon = typeConfig?.icon || Calendar
    const isPast = eventDate < new Date()
    const isFull = event.max_attendees != null && localRsvp.goingCount >= event.max_attendees
    const capacityPercent = event.max_attendees ? Math.min((localRsvp.goingCount / event.max_attendees) * 100, 100) : null

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
                        <Badge className="bg-international-orange text-white border-0">
                            Next Event
                        </Badge>

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

                        {event.is_executive_only && (
                            <Badge className="bg-status-warning-light text-status-warning-dark border border-status-warning/30">
                                <Lock className="mr-1 h-3 w-3" /> Executive Only
                            </Badge>
                        )}

                        {isFull && (
                            <Badge variant="destructive">Full</Badge>
                        )}
                    </div>

                    {/* Title */}
                    <Link href={`/guild/events/${event.id}`} className="group block">
                        <h2 className="text-xl sm:text-2xl font-display font-semibold text-foreground tracking-tight group-hover:text-electric-blue transition-colors">
                            {event.title}
                        </h2>
                    </Link>

                    {/* Meta row: location + countdown + attendees */}
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
                        {localRsvp.goingCount > 0 && (
                            <span className="flex items-center gap-1.5">
                                <Users className="h-4 w-4" />
                                {localRsvp.goingCount} going
                                {localRsvp.maybeCount > 0 && `, ${localRsvp.maybeCount} maybe`}
                            </span>
                        )}
                        {localRsvp.goingCount === 0 && localRsvp.maybeCount > 0 && (
                            <span className="flex items-center gap-1.5">
                                <Users className="h-4 w-4" />
                                {localRsvp.maybeCount} maybe
                            </span>
                        )}
                    </div>

                    {/* Capacity Bar */}
                    {event.max_attendees != null && capacityPercent !== null && (
                        <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{localRsvp.goingCount} / {event.max_attendees} spots</span>
                                {capacityPercent >= 80 && capacityPercent < 100 && (
                                    <span className="text-status-warning font-medium">Almost full</span>
                                )}
                            </div>
                            <Progress
                                value={capacityPercent}
                                className={`h-1.5 ${capacityPercent >= 100 ? "[&>div]:bg-destructive" : capacityPercent >= 80 ? "[&>div]:bg-status-warning" : ""}`}
                            />
                        </div>
                    )}

                    {/* Description (truncated) */}
                    {event.description && (
                        <p className="text-muted-foreground text-sm line-clamp-2">
                            {event.description}
                        </p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-1">
                        {!isPast && (
                            <RSVPSplitButton
                                currentStatus={localRsvp.status}
                                loading={loadingRsvp}
                                disabled={isFull && localRsvp.status !== 'going'}
                                onStatusChange={handleSetStatus}
                            />
                        )}

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

// ==========================================
// RSVP SPLIT BUTTON
// ==========================================

function RSVPSplitButton({
    currentStatus,
    loading,
    disabled,
    onStatusChange,
}: {
    currentStatus: 'going' | 'maybe' | null
    loading: boolean
    disabled: boolean
    onStatusChange: (status: 'going' | 'maybe' | 'cancelled') => void
}) {
    const statusConfig = {
        going: { label: "Going", variant: "outline" as const, className: "border-status-success text-status-success hover:bg-status-success-light", icon: CheckCircle2 },
        maybe: { label: "Maybe", variant: "outline" as const, className: "border-status-warning text-status-warning-dark hover:bg-status-warning-light", icon: CircleDot },
        null: { label: "RSVP", variant: "default" as const, className: "", icon: null },
    }

    const config = statusConfig[currentStatus || 'null']
    const StatusIcon = config.icon

    return (
        <div className="flex items-center">
            <Button
                variant={config.variant}
                onClick={() => {
                    if (!currentStatus) onStatusChange('going')
                    else if (currentStatus === 'going') onStatusChange('cancelled')
                    else if (currentStatus === 'maybe') onStatusChange('cancelled')
                }}
                disabled={loading || disabled}
                className={`${config.className} rounded-r-none`}
            >
                {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : StatusIcon ? (
                    <StatusIcon className="mr-2 h-4 w-4" />
                ) : null}
                {config.label}
            </Button>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant={config.variant}
                        size="sm"
                        disabled={loading}
                        className={`${config.className} rounded-l-none border-l-0 px-2`}
                    >
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem
                        onClick={() => onStatusChange('going')}
                        disabled={disabled && currentStatus !== 'going'}
                        className="text-status-success"
                    >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Going
                        {currentStatus === 'going' && <span className="ml-auto text-xs">Current</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => onStatusChange('maybe')}
                        className="text-status-warning-dark"
                    >
                        <CircleDot className="h-4 w-4 mr-2" />
                        Maybe
                        {currentStatus === 'maybe' && <span className="ml-auto text-xs">Current</span>}
                    </DropdownMenuItem>
                    {currentStatus && (
                        <DropdownMenuItem
                            onClick={() => onStatusChange('cancelled')}
                            className="text-destructive"
                        >
                            Cancel RSVP
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
