"use client"

import { useState, useEffect, useTransition } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { 
    getProviderProfile, 
    updateProviderProfile,
    ProviderProfile 
} from "@/actions/provider"
import { 
    Settings, 
    Save, 
    Loader2, 
    AlertCircle,
    CheckCircle2,
    Clock,
    Pause,
    Calendar as CalendarIcon,
    MessageSquare,
    Palmtree
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"

export default function ProviderSettingsPage() {
    const [isPending, startTransition] = useTransition()
    const [profile, setProfile] = useState<ProviderProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    // Capacity Settings
    const [maxConcurrentOrders, setMaxConcurrentOrders] = useState(5)
    const [autoPauseAtCapacity, setAutoPauseAtCapacity] = useState(true)

    // Vacation Mode
    const [outOfOffice, setOutOfOffice] = useState(false)
    const [outOfOfficeMessage, setOutOfOfficeMessage] = useState("")
    const [outOfOfficeUntil, setOutOfOfficeUntil] = useState<Date | undefined>(undefined)

    // Auto-response
    const [autoResponseEnabled, setAutoResponseEnabled] = useState(false)
    const [autoResponseMessage, setAutoResponseMessage] = useState("")
    const [autoResponseDelay, setAutoResponseDelay] = useState(60)

    useEffect(() => {
        async function loadProfile() {
            const { profile, error } = await getProviderProfile()
            if (error) {
                setError(error)
            } else if (profile) {
                setProfile(profile)
                setMaxConcurrentOrders(profile.max_concurrent_orders || 5)
                setAutoPauseAtCapacity(profile.auto_pause_at_capacity)
                setOutOfOffice(profile.out_of_office)
                setOutOfOfficeMessage(profile.out_of_office_message || "")
                setOutOfOfficeUntil(profile.out_of_office_until ? new Date(profile.out_of_office_until) : undefined)
                setAutoResponseEnabled(profile.auto_response_enabled)
                setAutoResponseMessage(profile.auto_response_message || "")
                setAutoResponseDelay(profile.auto_response_delay_minutes || 60)
            }
            setLoading(false)
        }
        loadProfile()
    }, [])

    const handleSave = () => {
        setError(null)
        setSuccess(false)
        
        startTransition(async () => {
            const result = await updateProviderProfile({
                max_concurrent_orders: maxConcurrentOrders,
                auto_pause_at_capacity: autoPauseAtCapacity,
                out_of_office: outOfOffice,
                out_of_office_message: outOfOfficeMessage || undefined,
                out_of_office_until: outOfOfficeUntil?.toISOString(),
                auto_response_enabled: autoResponseEnabled,
                auto_response_message: autoResponseMessage || undefined,
                auto_response_delay_minutes: autoResponseDelay
            })

            if (result.error) {
                setError(result.error)
            } else {
                setSuccess(true)
                setTimeout(() => setSuccess(false), 3000)
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

    if (!profile) {
        return (
            <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
                <h2 className="text-xl font-semibold">Profile Not Found</h2>
                <p className="text-muted-foreground mt-2">
                    You don&apos;t have a provider profile yet.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage your capacity and availability preferences
                    </p>
                </div>
                <Button onClick={handleSave} disabled={isPending}>
                    {isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Changes
                </Button>
            </div>

            {/* Success/Error Messages */}
            {success && (
                <div className="flex items-center gap-2 p-4 rounded-lg bg-green-50 border border-green-200">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <p className="text-sm text-green-700">Settings updated successfully!</p>
                </div>
            )}
            {error && (
                <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            <div className="grid gap-6">
                {/* Capacity Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5" />
                            Capacity Settings
                        </CardTitle>
                        <CardDescription>
                            Control how many orders you can handle at once
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="maxOrders">Maximum Concurrent Orders</Label>
                            <div className="flex items-center gap-4">
                                <Input
                                    id="maxOrders"
                                    type="number"
                                    value={maxConcurrentOrders}
                                    onChange={(e) => setMaxConcurrentOrders(parseInt(e.target.value) || 1)}
                                    min={1}
                                    max={50}
                                    className="w-24"
                                />
                                <div className="flex-1">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">Current capacity</span>
                                        <span className="font-medium">
                                            {profile.current_order_count} / {maxConcurrentOrders}
                                        </span>
                                    </div>
                                    <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div 
                                            className={cn(
                                                "h-full transition-all rounded-full",
                                                profile.current_order_count / maxConcurrentOrders >= 0.9 
                                                    ? "bg-red-500"
                                                    : profile.current_order_count / maxConcurrentOrders >= 0.7
                                                        ? "bg-amber-500"
                                                        : "bg-green-500"
                                            )}
                                            style={{ 
                                                width: `${Math.min((profile.current_order_count / maxConcurrentOrders) * 100, 100)}%` 
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Set how many orders you can work on simultaneously
                            </p>
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                    <Pause className="h-4 w-4 text-muted-foreground" />
                                    <Label>Auto-pause at capacity</Label>
                                </div>
                                <p className="text-xs text-muted-foreground pl-6">
                                    Automatically pause new orders when you reach your maximum capacity.
                                    You&apos;ll stop appearing in search results until you have availability.
                                </p>
                            </div>
                            <Switch
                                checked={autoPauseAtCapacity}
                                onCheckedChange={setAutoPauseAtCapacity}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Vacation Mode */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Palmtree className="h-5 w-5" />
                            Vacation Mode
                        </CardTitle>
                        <CardDescription>
                            Temporarily pause your availability
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Enable Vacation Mode</Label>
                                <p className="text-xs text-muted-foreground">
                                    Show as unavailable and stop receiving new orders
                                </p>
                            </div>
                            <Switch
                                checked={outOfOffice}
                                onCheckedChange={setOutOfOffice}
                            />
                        </div>

                        {outOfOffice && (
                            <>
                                <Separator />
                                
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Return Date (optional)</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className={cn(
                                                        "w-full justify-start text-left font-normal",
                                                        !outOfOfficeUntil && "text-muted-foreground"
                                                    )}
                                                >
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {outOfOfficeUntil 
                                                        ? format(outOfOfficeUntil, "PPP") 
                                                        : "Select return date"
                                                    }
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={outOfOfficeUntil}
                                                    onSelect={setOutOfOfficeUntil}
                                                    disabled={(date) => date < new Date()}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                        <p className="text-xs text-muted-foreground">
                                            Vacation mode will automatically turn off on this date
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="oooMessage">Away Message</Label>
                                        <Textarea
                                            id="oooMessage"
                                            value={outOfOfficeMessage}
                                            onChange={(e) => setOutOfOfficeMessage(e.target.value)}
                                            placeholder="I'm currently on vacation and will return soon. For urgent matters, please..."
                                            className="min-h-[100px]"
                                            maxLength={500}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            {outOfOfficeMessage.length}/500 characters
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Auto-Response */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5" />
                            Auto-Response
                        </CardTitle>
                        <CardDescription>
                            Send automatic replies to new inquiries
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Enable Auto-Response</Label>
                                <p className="text-xs text-muted-foreground">
                                    Automatically reply to new messages after a delay
                                </p>
                            </div>
                            <Switch
                                checked={autoResponseEnabled}
                                onCheckedChange={setAutoResponseEnabled}
                            />
                        </div>

                        {autoResponseEnabled && (
                            <>
                                <Separator />
                                
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="autoMessage">Auto-Response Message</Label>
                                        <Textarea
                                            id="autoMessage"
                                            value={autoResponseMessage}
                                            onChange={(e) => setAutoResponseMessage(e.target.value)}
                                            placeholder="Thanks for reaching out! I typically respond within 24 hours. In the meantime, feel free to check out my portfolio..."
                                            className="min-h-[100px]"
                                            maxLength={500}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            {autoResponseMessage.length}/500 characters
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="autoDelay">Response Delay</Label>
                                        <div className="flex items-center gap-3">
                                            <Input
                                                id="autoDelay"
                                                type="number"
                                                value={autoResponseDelay}
                                                onChange={(e) => setAutoResponseDelay(parseInt(e.target.value) || 5)}
                                                min={5}
                                                max={1440}
                                                className="w-24"
                                            />
                                            <span className="text-sm text-muted-foreground">minutes</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Wait time before sending the auto-response (5 min - 24 hours)
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
