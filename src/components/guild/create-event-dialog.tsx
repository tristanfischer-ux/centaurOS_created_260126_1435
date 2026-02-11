"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
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
    ChevronRight,
    ChevronLeft,
    CheckCircle2,
    Zap,
    Presentation,
    GraduationCap,
    Handshake,
} from "lucide-react"
import { createGuildEvent, type EventType, type EventFormat } from "@/actions/guild-events"
import { cn } from "@/lib/utils"

// ==========================================
// TYPES
// ==========================================

interface CreateEventDialogProps {
    /** Whether the dialog is open */
    open: boolean
    /** Callback when dialog open state changes */
    onOpenChange: (open: boolean) => void
    /** Callback after event is successfully created */
    onCreated: () => void
}

interface EventFormData {
    title: string
    description: string
    eventType: EventType
    eventFormat: EventFormat
    eventDate: string
    eventTime: string
    eventUrl: string
    locationGeo: string
    locationAddress: string
    maxAttendees: string
    isExecutiveOnly: boolean
}

// ==========================================
// CONSTANTS
// ==========================================

const EVENT_TYPES: { value: EventType; label: string; description: string; icon: typeof Calendar }[] = [
    { value: 'meetup', label: 'Meetup', description: 'Casual community gathering', icon: Handshake },
    { value: 'speed_networking', label: 'Speed Networking', description: 'Structured 1:1 rotations', icon: Zap },
    { value: 'workshop', label: 'Workshop', description: 'Hands-on learning session', icon: Presentation },
    { value: 'career_fair', label: 'Career Fair', description: 'Talent meets opportunity', icon: GraduationCap },
    { value: 'summit', label: 'Summit', description: 'Strategic leadership event', icon: Calendar },
]

const STEPS = [
    { id: 'type', label: 'Type' },
    { id: 'details', label: 'Details' },
    { id: 'logistics', label: 'Logistics' },
] as const

const INITIAL_FORM: EventFormData = {
    title: '',
    description: '',
    eventType: 'meetup',
    eventFormat: 'in_person',
    eventDate: '',
    eventTime: '',
    eventUrl: '',
    locationGeo: '',
    locationAddress: '',
    maxAttendees: '',
    isExecutiveOnly: false,
}

// ==========================================
// COMPONENT
// ==========================================

/**
 * 3-step wizard dialog for creating Guild events.
 *
 * @description Step 1: Choose event type. Step 2: Title, description, executive-only toggle.
 * Step 3: Date/time, format, location, capacity.
 *
 * @security Only Executives and Founders should be able to open this dialog
 * (enforced by parent component).
 */
export function CreateEventDialog({ open, onOpenChange, onCreated }: CreateEventDialogProps) {
    const [step, setStep] = useState(0)
    const [form, setForm] = useState<EventFormData>(INITIAL_FORM)
    const [creating, setCreating] = useState(false)

    const handleReset = (): void => {
        setStep(0)
        setForm(INITIAL_FORM)
    }

    const handleOpenChange = (newOpen: boolean): void => {
        if (!newOpen) handleReset()
        onOpenChange(newOpen)
    }

    const updateForm = (updates: Partial<EventFormData>): void => {
        setForm(prev => ({ ...prev, ...updates }))
    }

    const canProceed = (): boolean => {
        switch (step) {
            case 0: return !!form.eventType
            case 1: return !!form.title.trim() && form.title.trim().length >= 3
            case 2: return !!form.eventDate && !!form.eventTime
            default: return false
        }
    }

    const handleCreate = async (): Promise<void> => {
        if (!form.title.trim() || !form.eventDate || !form.eventTime) return

        setCreating(true)
        try {
            const eventDate = new Date(`${form.eventDate}T${form.eventTime}:00`).toISOString()

            const result = await createGuildEvent({
                title: form.title.trim(),
                description: form.description.trim() || undefined,
                eventType: form.eventType,
                eventFormat: form.eventFormat,
                eventDate,
                eventUrl: form.eventUrl.trim() || undefined,
                locationGeo: form.locationGeo.trim() || undefined,
                locationAddress: form.locationAddress.trim() || undefined,
                maxAttendees: form.maxAttendees ? parseInt(form.maxAttendees, 10) : undefined,
                isExecutiveOnly: form.isExecutiveOnly,
            })

            if (result.error) {
                toast.error(result.error)
                return
            }

            toast.success('Event created successfully')
            handleReset()
            onCreated()
        } catch {
            toast.error('Failed to create event')
        } finally {
            setCreating(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent size="md" className="max-h-[90dvh] flex flex-col p-0 gap-0 bg-background overflow-hidden">
                {/* Header */}
                <DialogHeader className="p-6 pb-4 border-b">
                    <DialogTitle className="text-xl font-display font-semibold">Create Guild Event</DialogTitle>

                    {/* Step Indicator */}
                    <div className="flex items-center gap-2 mt-4">
                        {STEPS.map((s, i) => (
                            <div key={s.id} className="flex items-center gap-2">
                                <div className={cn(
                                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                                    i < step ? "bg-status-success text-white" :
                                    i === step ? "bg-international-orange text-white" :
                                    "bg-muted text-muted-foreground"
                                )}>
                                    {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                                </div>
                                <span className={cn(
                                    "text-sm font-medium",
                                    i === step ? "text-foreground" : "text-muted-foreground"
                                )}>
                                    {s.label}
                                </span>
                                {i < STEPS.length - 1 && (
                                    <div className="w-8 h-px bg-muted mx-1" />
                                )}
                            </div>
                        ))}
                    </div>
                </DialogHeader>

                {/* Step Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Step 1: Event Type */}
                    {step === 0 && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                What kind of event are you organising?
                            </p>
                            <div className="grid gap-3">
                                {EVENT_TYPES.map(type => {
                                    const Icon = type.icon
                                    const isSelected = form.eventType === type.value
                                    return (
                                        <button
                                            key={type.value}
                                            onClick={() => updateForm({ eventType: type.value })}
                                            className={cn(
                                                "flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all",
                                                isSelected
                                                    ? "border-international-orange bg-international-orange-light"
                                                    : "border-muted hover:border-muted-foreground/30 hover:bg-muted/30"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-10 h-10 rounded-lg flex items-center justify-center",
                                                isSelected ? "bg-international-orange text-white" : "bg-muted text-muted-foreground"
                                            )}>
                                                <Icon className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-foreground">{type.label}</p>
                                                <p className="text-sm text-muted-foreground">{type.description}</p>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Details */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="event-title">
                                    Event Title <span className="text-destructive" aria-label="required">*</span>
                                </Label>
                                <Input
                                    id="event-title"
                                    placeholder="e.g., London Speed Networking — March Edition"
                                    value={form.title}
                                    onChange={e => updateForm({ title: e.target.value })}
                                    aria-required
                                    autoFocus
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="event-description">Description</Label>
                                <Textarea
                                    id="event-description"
                                    placeholder="What will attendees experience? What should they expect?"
                                    value={form.description}
                                    onChange={e => updateForm({ description: e.target.value })}
                                    rows={4}
                                />
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/30">
                                <div>
                                    <p className="font-medium text-foreground text-sm">Executive Only</p>
                                    <p className="text-xs text-muted-foreground">Restrict to Executives and Founders</p>
                                </div>
                                <Switch
                                    checked={form.isExecutiveOnly}
                                    onCheckedChange={checked => updateForm({ isExecutiveOnly: checked })}
                                    aria-label="Toggle executive only"
                                />
                            </div>
                        </div>
                    )}

                    {/* Step 3: Logistics */}
                    {step === 2 && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="event-date" className="flex items-center gap-1">
                                        <Calendar className="h-3.5 w-3.5" /> Date <span className="text-destructive" aria-label="required">*</span>
                                    </Label>
                                    <Input
                                        id="event-date"
                                        type="date"
                                        value={form.eventDate}
                                        onChange={e => updateForm({ eventDate: e.target.value })}
                                        aria-required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="event-time">
                                        Time <span className="text-destructive" aria-label="required">*</span>
                                    </Label>
                                    <Input
                                        id="event-time"
                                        type="time"
                                        value={form.eventTime}
                                        onChange={e => updateForm({ eventTime: e.target.value })}
                                        aria-required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="event-format">Format</Label>
                                <Select
                                    value={form.eventFormat}
                                    onValueChange={(value: EventFormat) => updateForm({ eventFormat: value })}
                                >
                                    <SelectTrigger id="event-format">
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

                            {(form.eventFormat === 'in_person' || form.eventFormat === 'hybrid') && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="event-location" className="flex items-center gap-1">
                                            <MapPin className="h-3.5 w-3.5" /> City / Region
                                        </Label>
                                        <Input
                                            id="event-location"
                                            placeholder="e.g., London, UK"
                                            value={form.locationGeo}
                                            onChange={e => updateForm({ locationGeo: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="event-address">Venue Address (optional)</Label>
                                        <Input
                                            id="event-address"
                                            placeholder="e.g., WeWork Moorgate, 1 Fore Street"
                                            value={form.locationAddress}
                                            onChange={e => updateForm({ locationAddress: e.target.value })}
                                        />
                                    </div>
                                </div>
                            )}

                            {(form.eventFormat === 'online' || form.eventFormat === 'hybrid') && (
                                <div className="space-y-2">
                                    <Label htmlFor="event-url" className="flex items-center gap-1">
                                        <Video className="h-3.5 w-3.5" /> Meeting URL
                                    </Label>
                                    <Input
                                        id="event-url"
                                        placeholder="e.g., https://meet.google.com/..."
                                        value={form.eventUrl}
                                        onChange={e => updateForm({ eventUrl: e.target.value })}
                                    />
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="event-capacity" className="flex items-center gap-1">
                                    <Users className="h-3.5 w-3.5" /> Max Attendees (optional)
                                </Label>
                                <Input
                                    id="event-capacity"
                                    type="number"
                                    placeholder="Leave blank for unlimited"
                                    value={form.maxAttendees}
                                    onChange={e => updateForm({ maxAttendees: e.target.value })}
                                    min="1"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Navigation */}
                <div className="p-6 pt-4 border-t flex items-center justify-between">
                    <Button
                        variant="ghost"
                        onClick={() => step === 0 ? handleOpenChange(false) : setStep(s => s - 1)}
                        disabled={creating}
                    >
                        {step === 0 ? (
                            "Cancel"
                        ) : (
                            <>
                                <ChevronLeft className="mr-1 h-4 w-4" /> Back
                            </>
                        )}
                    </Button>

                    {step < STEPS.length - 1 ? (
                        <Button
                            onClick={() => setStep(s => s + 1)}
                            disabled={!canProceed()}
                        >
                            Next <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                    ) : (
                        <Button
                            onClick={handleCreate}
                            disabled={!canProceed() || creating}
                        >
                            {creating ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            Create Event
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
