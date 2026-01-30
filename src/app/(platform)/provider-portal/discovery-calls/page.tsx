'use client'

import { useState, useEffect, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select'
import {
    getDiscoveryCallSettings,
    updateDiscoveryCallSettings,
    getDiscoveryCallSlots,
    addDiscoveryCallSlot,
    removeDiscoveryCallSlot,
    getDiscoveryCalls,
    updateDiscoveryCallStatus,
    DiscoveryCallSettings,
    DiscoveryCallSlot
} from '@/actions/discovery-calls'
import { 
    Calendar, 
    Clock, 
    Plus, 
    Trash2, 
    Loader2,
    Video,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Settings
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const daysOfWeek = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' }
]

const timeSlots = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0')
    return [
        { value: `${hour}:00`, label: `${hour}:00` },
        { value: `${hour}:30`, label: `${hour}:30` }
    ]
}).flat()

export default function DiscoveryCallsPage() {
    const [isPending, startTransition] = useTransition()
    const [loading, setLoading] = useState(true)
    const [settings, setSettings] = useState<DiscoveryCallSettings | null>(null)
    const [slots, setSlots] = useState<DiscoveryCallSlot[]>([])
    const [calls, setCalls] = useState<Record<string, unknown>[]>([])
    
    // Form states
    const [isEnabled, setIsEnabled] = useState(true)
    const [duration, setDuration] = useState(30)
    const [bufferMinutes, setBufferMinutes] = useState(15)
    const [maxAdvanceDays, setMaxAdvanceDays] = useState(30)
    const [minNoticeHours, setMinNoticeHours] = useState(24)
    const [confirmationMessage, setConfirmationMessage] = useState('')
    
    // New slot form
    const [newSlotDay, setNewSlotDay] = useState<number>(1)
    const [newSlotStart, setNewSlotStart] = useState('09:00')
    const [newSlotEnd, setNewSlotEnd] = useState('17:00')
    
    useEffect(() => {
        loadData()
    }, [])
    
    async function loadData() {
        const [settingsResult, slotsResult, callsResult] = await Promise.all([
            getDiscoveryCallSettings(),
            getDiscoveryCallSlots(),
            getDiscoveryCalls('provider')
        ])
        
        if (settingsResult.settings) {
            setSettings(settingsResult.settings)
            setIsEnabled(settingsResult.settings.is_enabled)
            setDuration(settingsResult.settings.call_duration_minutes)
            setBufferMinutes(settingsResult.settings.buffer_minutes)
            setMaxAdvanceDays(settingsResult.settings.max_advance_days)
            setMinNoticeHours(settingsResult.settings.min_notice_hours)
            setConfirmationMessage(settingsResult.settings.confirmation_message || '')
        }
        
        setSlots(slotsResult.slots)
        setCalls(callsResult.calls)
        setLoading(false)
    }
    
    async function handleSaveSettings() {
        startTransition(async () => {
            const result = await updateDiscoveryCallSettings({
                is_enabled: isEnabled,
                call_duration_minutes: duration,
                buffer_minutes: bufferMinutes,
                max_advance_days: maxAdvanceDays,
                min_notice_hours: minNoticeHours,
                confirmation_message: confirmationMessage || undefined
            })
            
            if (result.success) {
                toast.success('Settings saved!')
            } else {
                toast.error(result.error || 'Failed to save settings')
            }
        })
    }
    
    async function handleAddSlot() {
        startTransition(async () => {
            const result = await addDiscoveryCallSlot({
                day_of_week: newSlotDay,
                start_time: newSlotStart,
                end_time: newSlotEnd
            })
            
            if (result.success) {
                toast.success('Availability slot added!')
                loadData()
            } else {
                toast.error(result.error || 'Failed to add slot')
            }
        })
    }
    
    async function handleRemoveSlot(slotId: string) {
        startTransition(async () => {
            const result = await removeDiscoveryCallSlot(slotId)
            
            if (result.success) {
                toast.success('Slot removed')
                loadData()
            } else {
                toast.error(result.error || 'Failed to remove slot')
            }
        })
    }
    
    async function handleUpdateCallStatus(callId: string, status: 'confirmed' | 'cancelled' | 'completed') {
        startTransition(async () => {
            const result = await updateDiscoveryCallStatus(callId, status)
            
            if (result.success) {
                toast.success(`Call ${status}`)
                loadData()
            } else {
                toast.error(result.error || 'Failed to update call')
            }
        })
    }
    
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }
    
    // Group slots by day
    const slotsByDay = daysOfWeek.map(day => ({
        ...day,
        slots: slots.filter(s => s.day_of_week === day.value)
    }))
    
    // Upcoming and past calls
    const now = new Date()
    const upcomingCalls = calls.filter(c => new Date(c.scheduled_at as string) > now && c.status !== 'cancelled')
    const pastCalls = calls.filter(c => new Date(c.scheduled_at as string) <= now || c.status === 'cancelled')
    
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-foreground">Discovery Calls</h1>
                <p className="text-muted-foreground mt-1">
                    Let potential clients book intro calls with you
                </p>
            </div>
            
            <Tabs defaultValue="settings">
                <TabsList>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                    <TabsTrigger value="availability">Availability</TabsTrigger>
                    <TabsTrigger value="upcoming">
                        Upcoming ({upcomingCalls.length})
                    </TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>
                
                {/* Settings Tab */}
                <TabsContent value="settings" className="space-y-4 mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings className="h-5 w-5" />
                                Discovery Call Settings
                            </CardTitle>
                            <CardDescription>
                                Configure how discovery calls work on your profile
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Enable Discovery Calls</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Allow potential clients to book calls with you
                                    </p>
                                </div>
                                <Switch
                                    checked={isEnabled}
                                    onCheckedChange={setIsEnabled}
                                />
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Call Duration (minutes)</Label>
                                    <Select value={duration.toString()} onValueChange={(v) => setDuration(parseInt(v))}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="15">15 minutes</SelectItem>
                                            <SelectItem value="30">30 minutes</SelectItem>
                                            <SelectItem value="45">45 minutes</SelectItem>
                                            <SelectItem value="60">60 minutes</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                
                                <div className="space-y-2">
                                    <Label>Buffer Between Calls (minutes)</Label>
                                    <Select value={bufferMinutes.toString()} onValueChange={(v) => setBufferMinutes(parseInt(v))}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="0">No buffer</SelectItem>
                                            <SelectItem value="5">5 minutes</SelectItem>
                                            <SelectItem value="10">10 minutes</SelectItem>
                                            <SelectItem value="15">15 minutes</SelectItem>
                                            <SelectItem value="30">30 minutes</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                
                                <div className="space-y-2">
                                    <Label>Maximum Days in Advance</Label>
                                    <Input
                                        type="number"
                                        value={maxAdvanceDays}
                                        onChange={(e) => setMaxAdvanceDays(parseInt(e.target.value) || 30)}
                                        min={1}
                                        max={90}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        How far ahead can clients book?
                                    </p>
                                </div>
                                
                                <div className="space-y-2">
                                    <Label>Minimum Notice (hours)</Label>
                                    <Input
                                        type="number"
                                        value={minNoticeHours}
                                        onChange={(e) => setMinNoticeHours(parseInt(e.target.value) || 24)}
                                        min={1}
                                        max={168}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        How much notice do you need?
                                    </p>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <Label>Confirmation Message (optional)</Label>
                                <Textarea
                                    value={confirmationMessage}
                                    onChange={(e) => setConfirmationMessage(e.target.value)}
                                    placeholder="Custom message to include in booking confirmation..."
                                    className="min-h-[100px]"
                                />
                            </div>
                            
                            <Button onClick={handleSaveSettings} disabled={isPending}>
                                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Save Settings
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>
                
                {/* Availability Tab */}
                <TabsContent value="availability" className="space-y-4 mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Calendar className="h-5 w-5" />
                                Weekly Availability
                            </CardTitle>
                            <CardDescription>
                                Set your recurring availability for discovery calls
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Add Slot Form */}
                            <div className="flex flex-wrap gap-3 p-4 bg-muted rounded-lg">
                                <Select value={newSlotDay.toString()} onValueChange={(v) => setNewSlotDay(parseInt(v))}>
                                    <SelectTrigger className="w-36">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {daysOfWeek.map((day) => (
                                            <SelectItem key={day.value} value={day.value.toString()}>
                                                {day.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                
                                <Select value={newSlotStart} onValueChange={setNewSlotStart}>
                                    <SelectTrigger className="w-24">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {timeSlots.map((slot) => (
                                            <SelectItem key={slot.value} value={slot.value}>
                                                {slot.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                
                                <span className="self-center text-muted-foreground">to</span>
                                
                                <Select value={newSlotEnd} onValueChange={setNewSlotEnd}>
                                    <SelectTrigger className="w-24">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {timeSlots.map((slot) => (
                                            <SelectItem key={slot.value} value={slot.value}>
                                                {slot.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                
                                <Button onClick={handleAddSlot} disabled={isPending}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Slot
                                </Button>
                            </div>
                            
                            {/* Slots by Day */}
                            <div className="space-y-3">
                                {slotsByDay.map((day) => (
                                    <div key={day.value} className="flex items-start gap-4">
                                        <div className="w-24 font-medium text-sm pt-2">
                                            {day.label}
                                        </div>
                                        <div className="flex-1">
                                            {day.slots.length === 0 ? (
                                                <p className="text-sm text-muted-foreground py-2">No availability</p>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    {day.slots.map((slot) => (
                                                        <Badge 
                                                            key={slot.id} 
                                                            variant="secondary"
                                                            className="px-3 py-1.5 flex items-center gap-2"
                                                        >
                                                            <Clock className="h-3 w-3" />
                                                            {slot.start_time} - {slot.end_time}
                                                            <button
                                                                onClick={() => handleRemoveSlot(slot.id)}
                                                                className="ml-1 hover:text-destructive"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </button>
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
                
                {/* Upcoming Calls Tab */}
                <TabsContent value="upcoming" className="space-y-4 mt-6">
                    {upcomingCalls.length === 0 ? (
                        <Card className="border-dashed">
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <Video className="h-12 w-12 text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No upcoming calls</h3>
                                <p className="text-muted-foreground text-center max-w-md">
                                    When clients book discovery calls, they'll appear here.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {upcomingCalls.map((call) => {
                                const buyer = call.buyer as { full_name: string; avatar_url: string | null }
                                const scheduledAt = new Date(call.scheduled_at as string)
                                
                                return (
                                    <Card key={call.id as string}>
                                        <CardContent className="flex items-center justify-between py-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                                    <Video className="h-6 w-6 text-muted-foreground" />
                                                </div>
                                                <div>
                                                    <p className="font-medium">{buyer?.full_name || 'Unknown'}</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {scheduledAt.toLocaleDateString('en-GB', {
                                                            weekday: 'short',
                                                            day: 'numeric',
                                                            month: 'short'
                                                        })} at {scheduledAt.toLocaleTimeString('en-GB', {
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="secondary" className={cn(
                                                    call.status === 'confirmed' && 'bg-green-100 text-green-800',
                                                    call.status === 'scheduled' && 'bg-blue-100 text-blue-800'
                                                )}>
                                                    {call.status as string}
                                                </Badge>
                                                {call.status === 'scheduled' && (
                                                    <Button 
                                                        size="sm" 
                                                        onClick={() => handleUpdateCallStatus(call.id as string, 'confirmed')}
                                                    >
                                                        <CheckCircle2 className="h-4 w-4 mr-1" />
                                                        Confirm
                                                    </Button>
                                                )}
                                                <Button 
                                                    size="sm" 
                                                    variant="destructive"
                                                    onClick={() => handleUpdateCallStatus(call.id as string, 'cancelled')}
                                                >
                                                    <XCircle className="h-4 w-4 mr-1" />
                                                    Cancel
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </TabsContent>
                
                {/* History Tab */}
                <TabsContent value="history" className="space-y-4 mt-6">
                    {pastCalls.length === 0 ? (
                        <Card className="border-dashed">
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No call history</h3>
                                <p className="text-muted-foreground text-center max-w-md">
                                    Completed and cancelled calls will appear here.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {pastCalls.map((call) => {
                                const buyer = call.buyer as { full_name: string; avatar_url: string | null }
                                const scheduledAt = new Date(call.scheduled_at as string)
                                
                                return (
                                    <Card key={call.id as string} className="opacity-75">
                                        <CardContent className="flex items-center justify-between py-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                                    <Video className="h-6 w-6 text-muted-foreground" />
                                                </div>
                                                <div>
                                                    <p className="font-medium">{buyer?.full_name || 'Unknown'}</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {scheduledAt.toLocaleDateString('en-GB', {
                                                            weekday: 'short',
                                                            day: 'numeric',
                                                            month: 'short',
                                                            year: 'numeric'
                                                        })}
                                                    </p>
                                                </div>
                                            </div>
                                            <Badge variant="secondary" className={cn(
                                                call.status === 'completed' && 'bg-green-100 text-green-800',
                                                call.status === 'cancelled' && 'bg-red-100 text-red-800',
                                                call.status === 'no_show' && 'bg-amber-100 text-amber-800'
                                            )}>
                                                {call.status as string}
                                            </Badge>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}
