"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
    Calendar,
    MapPin,
    Video,
    Lock,
    Users,
    CheckCircle2,
    Loader2,
    ArrowLeft,
    Pencil,
    Trash2,
    Clock,
    Zap,
    Presentation,
    GraduationCap,
    Handshake,
    ExternalLink,
} from "lucide-react"
import { toggleRSVP, deleteGuildEvent } from "@/actions/guild-events"
import type { EventType, EventFormat } from "@/actions/guild-events"

// ==========================================
// TYPES
// ==========================================

interface EventCreator {
    id: string
    full_name: string | null
    role: string | null
    avatar_url: string | null
}

interface EventAttendeeProfile {
    id: string
    full_name: string | null
    role: string | null
    avatar_url: string | null
}

interface EventAttendee {
    id: string
    event_id: string
    user_id: string
    status: string
    rsvp_at: string
    profile: EventAttendeeProfile | null
}

interface GuildEventDetail {
    id: string
    title: string
    description: string | null
    event_date: string
    event_type: EventType
    event_format: EventFormat
    event_url: string | null
    location_geo: string | null
    location_address: string | null
    is_executive_only: boolean
    max_attendees: number | null
    created_by: string | null
    created_at: string
    creator: EventCreator | null
}

interface EventDetailContentProps {
    event: GuildEventDetail
    attendees: EventAttendee[]
    attendeeCount: number
    isAttending: boolean
    canEdit: boolean
    currentUserId: string
}

// ==========================================
// CONSTANTS
// ==========================================

const EVENT_TYPE_LABELS: Record<string, { label: string; icon: typeof Calendar; className: string }> = {
    speed_networking: { label: 'Speed Networking', icon: Zap, className: 'bg-chart-5/10 text-chart-5 border-chart-5/20' },
    workshop: { label: 'Workshop', icon: Presentation, className: 'bg-status-info-light text-status-info border-status-info/20' },
    career_fair: { label: 'Career Fair', icon: GraduationCap, className: 'bg-status-success-light text-status-success border-status-success/20' },
    meetup: { label: 'Meetup', icon: Handshake, className: 'bg-muted text-muted-foreground border' },
    summit: { label: 'Summit', icon: Calendar, className: 'bg-status-warning-light text-status-warning-dark border-status-warning/20' },
}

const FORMAT_LABELS: Record<string, string> = {
    in_person: 'In Person',
    online: 'Online',
    hybrid: 'Hybrid',
}

// ==========================================
// COMPONENT
// ==========================================

export function EventDetailContent({
    event,
    attendees,
    attendeeCount,
    isAttending: initialIsAttending,
    canEdit,
}: EventDetailContentProps) {
    const router = useRouter()
    const [attending, setAttending] = useState(initialIsAttending)
    const [count, setCount] = useState(attendeeCount)
    const [loadingRsvp, setLoadingRsvp] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const eventDate = new Date(event.event_date)
    const isPast = eventDate < new Date()
    const typeConfig = EVENT_TYPE_LABELS[event.event_type || 'meetup']
    const TypeIcon = typeConfig?.icon || Calendar

    const handleRSVP = useCallback(async () => {
        setLoadingRsvp(true)
        try {
            const result = await toggleRSVP(event.id)
            if (result.error) {
                toast.error(result.error)
                return
            }
            setAttending(result.attending)
            setCount(result.attendeeCount)
            toast.success(result.attending ? "You're going!" : "RSVP cancelled")
        } catch {
            toast.error('Failed to update RSVP')
        } finally {
            setLoadingRsvp(false)
        }
    }, [event.id])

    const handleDelete = async () => {
        setDeleting(true)
        try {
            const result = await deleteGuildEvent(event.id)
            if (result.error) {
                toast.error(result.error)
                return
            }
            toast.success('Event deleted')
            router.push('/guild')
        } catch {
            toast.error('Failed to delete event')
        } finally {
            setDeleting(false)
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Breadcrumb */}
            <Link
                href="/guild"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                <ArrowLeft className="h-4 w-4" /> Back to Guild
            </Link>

            {/* Header */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                            {typeConfig && (
                                <Badge variant="secondary" className={typeConfig.className}>
                                    <TypeIcon className="mr-1 h-3 w-3" />
                                    {typeConfig.label}
                                </Badge>
                            )}
                            <Badge variant="secondary">
                                {event.event_format === 'online' && <Video className="mr-1 h-3 w-3" />}
                                {event.event_format === 'in_person' && <MapPin className="mr-1 h-3 w-3" />}
                                {FORMAT_LABELS[event.event_format] || 'In Person'}
                            </Badge>
                            {event.is_executive_only && (
                                <Badge className="bg-status-warning-light text-status-warning-dark border border-status-warning/30">
                                    <Lock className="mr-1 h-3 w-3" /> Executive Only
                                </Badge>
                            )}
                            {isPast && (
                                <Badge variant="outline" className="text-muted-foreground">
                                    Past Event
                                </Badge>
                            )}
                        </div>

                        <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">
                            {event.title}
                        </h1>
                    </div>

                    {/* Action Buttons */}
                    {canEdit && (
                        <div className="flex items-center gap-2 shrink-0">
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will permanently delete &ldquo;{event.title}&rdquo; and remove all RSVPs. This action cannot be undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={handleDelete}
                                            disabled={deleting}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                            {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            Delete Event
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Main Content */}
                <div className="md:col-span-2 space-y-6">
                    {/* Description */}
                    {event.description && (
                        <Card>
                            <CardContent className="p-6">
                                <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                                    {event.description}
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Who's Going */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Users className="h-5 w-5 text-electric-blue" />
                                Who&apos;s Going
                                <Badge variant="secondary" className="ml-auto">
                                    {count} {count === 1 ? 'person' : 'people'}
                                    {event.max_attendees ? ` / ${event.max_attendees}` : ''}
                                </Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {attendees.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                    No RSVPs yet. Be the first!
                                </p>
                            ) : (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {attendees.map(attendee => (
                                        <div key={attendee.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                                            <UserAvatar
                                                name={attendee.profile?.full_name}
                                                role={attendee.profile?.role}
                                                size="md"
                                            />
                                            <div className="min-w-0">
                                                <p className="font-medium text-foreground text-sm truncate">
                                                    {attendee.profile?.full_name || 'Unknown'}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {attendee.profile?.role || 'Member'}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* RSVP Card */}
                    <Card className="border-2">
                        <CardContent className="p-6 space-y-4">
                            {!isPast ? (
                                <Button
                                    className="w-full"
                                    size="lg"
                                    variant={attending ? "outline" : "default"}
                                    onClick={handleRSVP}
                                    disabled={loadingRsvp}
                                >
                                    {loadingRsvp ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : attending ? (
                                        <CheckCircle2 className="mr-2 h-4 w-4 text-status-success" />
                                    ) : null}
                                    {attending ? "You're Going!" : "RSVP Now"}
                                </Button>
                            ) : (
                                <p className="text-sm text-muted-foreground text-center">
                                    This event has ended.
                                </p>
                            )}

                            {attending && !isPast && (
                                <p className="text-xs text-muted-foreground text-center">
                                    Click again to cancel your RSVP
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Event Details Card */}
                    <Card>
                        <CardContent className="p-6 space-y-4">
                            {/* Date & Time */}
                            <div className="flex items-start gap-3">
                                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                                <div>
                                    <p className="font-medium text-foreground text-sm">
                                        {eventDate.toLocaleDateString('en-GB', {
                                            weekday: 'long',
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric',
                                        })}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {eventDate.toLocaleTimeString('en-GB', {
                                            hour: 'numeric',
                                            minute: '2-digit',
                                            hour12: true,
                                        })}
                                    </p>
                                </div>
                            </div>

                            {/* Location */}
                            {event.location_geo && (
                                <div className="flex items-start gap-3">
                                    <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                                    <div>
                                        <p className="font-medium text-foreground text-sm">{event.location_geo}</p>
                                        {event.location_address && (
                                            <p className="text-sm text-muted-foreground">{event.location_address}</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Online URL */}
                            {event.event_url && (
                                <div className="flex items-start gap-3">
                                    <Video className="h-5 w-5 text-muted-foreground mt-0.5" />
                                    <div>
                                        <a
                                            href={event.event_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-medium text-electric-blue text-sm hover:underline flex items-center gap-1"
                                        >
                                            Join Online <ExternalLink className="h-3 w-3" />
                                        </a>
                                    </div>
                                </div>
                            )}

                            {/* Capacity */}
                            {event.max_attendees && (
                                <div className="flex items-start gap-3">
                                    <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                                    <div>
                                        <p className="font-medium text-foreground text-sm">
                                            {count} / {event.max_attendees} spots filled
                                        </p>
                                        {count >= event.max_attendees && (
                                            <p className="text-xs text-destructive">At capacity</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Organiser */}
                            {event.creator && (
                                <div className="flex items-start gap-3">
                                    <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Organised by</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <UserAvatar
                                                name={event.creator.full_name}
                                                role={event.creator.role}
                                                size="sm"
                                            />
                                            <span className="text-sm font-medium text-foreground">
                                                {event.creator.full_name || 'Unknown'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
