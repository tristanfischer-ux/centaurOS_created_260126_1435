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
    Trash2,
    Clock,
    Zap,
    Presentation,
    GraduationCap,
    Handshake,
    ExternalLink,
    Pencil,
    Share2,
    MessageCircle,
    ChevronDown,
    CircleDot,
} from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { setRSVPStatus, deleteGuildEvent } from "@/actions/guild-events"
import { startDirectMessage } from "@/actions/messaging"
import { EditEventDialog } from "@/components/guild/edit-event-dialog"

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
    event_type: string
    event_format: string
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

/**
 * Client-side content for the Guild event detail page.
 *
 * @description Full event info with RSVP, edit, delete, attendee messaging, and share.
 */
export function EventDetailContent({
    event,
    attendees,
    attendeeCount,
    isAttending: initialIsAttending,
    canEdit,
    currentUserId,
}: EventDetailContentProps) {
    const router = useRouter()
    const [rsvpStatus, setRsvpStatus] = useState<'going' | 'maybe' | null>(initialIsAttending ? 'going' : null)
    const [count, setCount] = useState(attendeeCount)
    const [loadingRsvp, setLoadingRsvp] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [editOpen, setEditOpen] = useState(false)
    const [messagingId, setMessagingId] = useState<string | null>(null)

    const eventDate = new Date(event.event_date)
    const isPast = eventDate < new Date()
    const typeConfig = EVENT_TYPE_LABELS[event.event_type || 'meetup']
    const TypeIcon = typeConfig?.icon || Calendar
    const isFull = event.max_attendees != null && count >= event.max_attendees

    const handleSetStatus = useCallback(async (status: 'going' | 'maybe' | 'cancelled') => {
        setLoadingRsvp(true)
        try {
            const result = await setRSVPStatus(event.id, status)
            if (result.error) {
                toast.error(result.error)
                return
            }
            setRsvpStatus(result.status === 'cancelled' ? null : result.status)
            setCount(result.goingCount)
            const messages: Record<string, string> = {
                going: "You're going!",
                maybe: "Marked as maybe",
                cancelled: "RSVP cancelled",
            }
            toast.success(messages[status])
        } catch {
            toast.error('Failed to update RSVP')
        } finally {
            setLoadingRsvp(false)
        }
    }, [event.id])

    const handleDelete = async (): Promise<void> => {
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

    const handleShare = () => {
        const url = `${window.location.origin}/guild/events/${event.id}`
        navigator.clipboard.writeText(url).then(() => {
            toast.success('Link copied')
        }).catch(() => {
            toast.error('Failed to copy link')
        })
    }

    const handleMessageAttendee = async (userId: string) => {
        setMessagingId(userId)
        try {
            const result = await startDirectMessage(userId)
            if ('error' in result) {
                toast.error(result.error)
                return
            }
            router.push('/updates')
        } catch {
            toast.error('Failed to start conversation')
        } finally {
            setMessagingId(null)
        }
    }

    const handleEditSuccess = () => {
        router.refresh()
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
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleShare}
                            aria-label="Share event"
                        >
                            <Share2 className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditOpen(true)}
                                    aria-label="Edit event"
                                >
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" aria-label="Delete event">
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
                            </>
                        )}
                    </div>
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
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium text-foreground text-sm truncate">
                                                    {attendee.profile?.full_name || 'Unknown'}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {attendee.profile?.role || 'Member'}
                                                </p>
                                            </div>
                                            {attendee.user_id !== currentUserId && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0 shrink-0"
                                                    onClick={() => handleMessageAttendee(attendee.user_id)}
                                                    disabled={messagingId === attendee.user_id}
                                                    aria-label={`Message ${attendee.profile?.full_name || 'attendee'}`}
                                                >
                                                    {messagingId === attendee.user_id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <MessageCircle className="h-4 w-4" />
                                                    )}
                                                </Button>
                                            )}
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
                                <div className="flex gap-1">
                                    <Button
                                        className="flex-1"
                                        size="lg"
                                        variant={rsvpStatus === 'going' ? 'outline' : rsvpStatus === 'maybe' ? 'secondary' : 'default'}
                                        onClick={() => handleSetStatus(rsvpStatus ? 'cancelled' : 'going')}
                                        disabled={loadingRsvp || (isFull && !rsvpStatus)}
                                    >
                                        {loadingRsvp ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : rsvpStatus === 'going' ? (
                                            <CheckCircle2 className="mr-2 h-4 w-4 text-status-success" />
                                        ) : rsvpStatus === 'maybe' ? (
                                            <CircleDot className="mr-2 h-4 w-4 text-status-warning" />
                                        ) : null}
                                        {rsvpStatus === 'going' ? "Going" : rsvpStatus === 'maybe' ? "Maybe" : isFull ? "Event Full" : "RSVP"}
                                    </Button>
                                    {!loadingRsvp && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="outline" size="lg" className="px-2" aria-label="RSVP options">
                                                    <ChevronDown className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onClick={() => handleSetStatus('going')}
                                                    disabled={isFull && rsvpStatus !== 'going'}
                                                >
                                                    <CheckCircle2 className="mr-2 h-4 w-4 text-status-success" />
                                                    Going
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleSetStatus('maybe')}>
                                                    <CircleDot className="mr-2 h-4 w-4 text-status-warning" />
                                                    Maybe
                                                </DropdownMenuItem>
                                                {rsvpStatus && (
                                                    <DropdownMenuItem onClick={() => handleSetStatus('cancelled')}>
                                                        <span className="mr-2 h-4 w-4" />
                                                        Cancel RSVP
                                                    </DropdownMenuItem>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground text-center">
                                    This event has ended.
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

                            {/* Online URL — SECURITY: Only allow http(s) to prevent javascript: XSS */}
                            {event.event_url && /^https?:\/\//i.test(event.event_url) && (
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

            {/* Edit Event Dialog */}
            {canEdit && (
                <EditEventDialog
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    onUpdated={handleEditSuccess}
                    event={event}
                />
            )}
        </div>
    )
}
