"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
    Loader2,
    Calendar,
    MapPin,
    Video,
    Users,
} from "lucide-react"
import { updateGuildEvent, type EventType, type EventFormat } from "@/actions/guild-events"

// ==========================================
// TYPES
// ==========================================

interface EditEventDialogProps {
    /** Whether the dialog is open */
    open: boolean
    /** Callback when dialog open state changes */
    onOpenChange: (open: boolean) => void
    /** Callback after event is successfully updated */
    onUpdated: () => void
    /** The event data to pre-populate the form */
    event: {
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
    }
}

// ==========================================
// COMPONENT
// ==========================================

/**
 * Single-page edit dialog for Guild events.
 *
 * @description Pre-populated form with all event fields.
 * Uses updateGuildEvent server action on submit.
 */
export function EditEventDialog({ open, onOpenChange, onUpdated, event }: EditEventDialogProps) {
    const [title, setTitle] = useState(event.title)
    const [description, setDescription] = useState(event.description || "")
    const [eventType, setEventType] = useState<EventType>(event.event_type as EventType)
    const [eventFormat, setEventFormat] = useState<EventFormat>(event.event_format as EventFormat)
    const [eventDate, setEventDate] = useState("")
    const [eventTime, setEventTime] = useState("")
    const [eventUrl, setEventUrl] = useState(event.event_url || "")
    const [locationGeo, setLocationGeo] = useState(event.location_geo || "")
    const [locationAddress, setLocationAddress] = useState(event.location_address || "")
    const [maxAttendees, setMaxAttendees] = useState(event.max_attendees?.toString() || "")
    const [isExecutiveOnly, setIsExecutiveOnly] = useState(event.is_executive_only)
    const [saving, setSaving] = useState(false)

    // Re-sync all form state when the event prop changes (e.g., dialog reopened for same/different event)
    useEffect(() => {
        setTitle(event.title)
        setDescription(event.description || "")
        setEventType(event.event_type as EventType)
        setEventFormat(event.event_format as EventFormat)
        setEventUrl(event.event_url || "")
        setLocationGeo(event.location_geo || "")
        setLocationAddress(event.location_address || "")
        setMaxAttendees(event.max_attendees?.toString() || "")
        setIsExecutiveOnly(event.is_executive_only)

        const d = new Date(event.event_date)
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, "0")
        const day = String(d.getDate()).padStart(2, "0")
        setEventDate(`${year}-${month}-${day}`)
        const hours = String(d.getHours()).padStart(2, "0")
        const minutes = String(d.getMinutes()).padStart(2, "0")
        setEventTime(`${hours}:${minutes}`)
    }, [event])

    const handleSave = async () => {
        if (!title.trim() || !eventDate || !eventTime) return

        setSaving(true)
        try {
            const dateISO = new Date(`${eventDate}T${eventTime}:00`).toISOString()

            // INTENT: Always send field values so users can clear optional fields.
            // The server action converts empty strings to null.
            const result = await updateGuildEvent(event.id, {
                title: title.trim(),
                description: description.trim(),
                eventType,
                eventFormat,
                eventDate: dateISO,
                eventUrl: eventUrl.trim(),
                locationGeo: locationGeo.trim(),
                locationAddress: locationAddress.trim(),
                maxAttendees: maxAttendees ? parseInt(maxAttendees, 10) : null,
                isExecutiveOnly,
            })

            if (result.error) {
                toast.error(result.error)
                return
            }

            toast.success("Event updated")
            onUpdated()
            onOpenChange(false)
        } catch {
            toast.error("Failed to update event")
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="md" className="max-h-[90dvh] flex flex-col gap-0 bg-background overflow-hidden">
                <DialogHeader>
                    <DialogTitle className="text-xl font-display font-semibold">Edit Event</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-6 py-4">
                    {/* Title */}
                    <div className="space-y-2">
                        <Label htmlFor="edit-event-title">
                            Title <span className="text-destructive" aria-label="required">*</span>
                        </Label>
                        <Input
                            id="edit-event-title"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            aria-required
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <Label htmlFor="edit-event-description">Description</Label>
                        <Textarea
                            id="edit-event-description"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={4}
                        />
                    </div>

                    {/* Type */}
                    <div className="space-y-2">
                        <Label htmlFor="edit-event-type">Event Type</Label>
                        <Select value={eventType} onValueChange={(v: EventType) => setEventType(v)}>
                            <SelectTrigger id="edit-event-type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="meetup">Meetup</SelectItem>
                                <SelectItem value="speed_networking">Speed Networking</SelectItem>
                                <SelectItem value="workshop">Workshop</SelectItem>
                                <SelectItem value="career_fair">Career Fair</SelectItem>
                                <SelectItem value="summit">Summit</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Date & Time */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-event-date" className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" /> Date <span className="text-destructive" aria-label="required">*</span>
                            </Label>
                            <Input
                                id="edit-event-date"
                                type="date"
                                value={eventDate}
                                onChange={e => setEventDate(e.target.value)}
                                aria-required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-event-time">
                                Time <span className="text-destructive" aria-label="required">*</span>
                            </Label>
                            <Input
                                id="edit-event-time"
                                type="time"
                                value={eventTime}
                                onChange={e => setEventTime(e.target.value)}
                                aria-required
                            />
                        </div>
                    </div>

                    {/* Format */}
                    <div className="space-y-2">
                        <Label htmlFor="edit-event-format">Format</Label>
                        <Select value={eventFormat} onValueChange={(v: EventFormat) => setEventFormat(v)}>
                            <SelectTrigger id="edit-event-format">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="in_person">
                                    <span className="flex items-center gap-2">
                                        <MapPin className="h-4 w-4" /> In Person
                                    </span>
                                </SelectItem>
                                <SelectItem value="online">
                                    <span className="flex items-center gap-2">
                                        <Video className="h-4 w-4" /> Online
                                    </span>
                                </SelectItem>
                                <SelectItem value="hybrid">
                                    <span className="flex items-center gap-2">
                                        <Users className="h-4 w-4" /> Hybrid
                                    </span>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Location (conditional) */}
                    {(eventFormat === "in_person" || eventFormat === "hybrid") && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-event-location" className="flex items-center gap-1">
                                    <MapPin className="h-3.5 w-3.5" /> City / Region
                                </Label>
                                <Input
                                    id="edit-event-location"
                                    placeholder="e.g., London, UK"
                                    value={locationGeo}
                                    onChange={e => setLocationGeo(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-event-address">Venue Address</Label>
                                <Input
                                    id="edit-event-address"
                                    placeholder="e.g., WeWork Moorgate"
                                    value={locationAddress}
                                    onChange={e => setLocationAddress(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {/* Meeting URL (conditional) */}
                    {(eventFormat === "online" || eventFormat === "hybrid") && (
                        <div className="space-y-2">
                            <Label htmlFor="edit-event-url" className="flex items-center gap-1">
                                <Video className="h-3.5 w-3.5" /> Meeting URL
                            </Label>
                            <Input
                                id="edit-event-url"
                                placeholder="e.g., https://meet.google.com/..."
                                value={eventUrl}
                                onChange={e => setEventUrl(e.target.value)}
                            />
                        </div>
                    )}

                    {/* Max Attendees */}
                    <div className="space-y-2">
                        <Label htmlFor="edit-event-capacity" className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" /> Max Attendees
                        </Label>
                        <Input
                            id="edit-event-capacity"
                            type="number"
                            placeholder="Leave blank for unlimited"
                            value={maxAttendees}
                            onChange={e => setMaxAttendees(e.target.value)}
                            min="1"
                        />
                    </div>

                    {/* Executive Only */}
                    <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/30">
                        <div>
                            <p className="font-medium text-foreground text-sm">Executive Only</p>
                            <p className="text-xs text-muted-foreground">Restrict to Executives and Founders</p>
                        </div>
                        <Switch
                            checked={isExecutiveOnly}
                            onCheckedChange={setIsExecutiveOnly}
                            aria-label="Toggle executive only"
                        />
                    </div>
                </div>

                <DialogFooter className="pt-4 border-t">
                    <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!title.trim() || !eventDate || !eventTime || saving}
                    >
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
