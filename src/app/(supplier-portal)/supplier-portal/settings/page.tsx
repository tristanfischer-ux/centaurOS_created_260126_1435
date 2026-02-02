// @ts-nocheck
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
import { typography } from "@/lib/design-system"
import { 
    Settings, 
    Save, 
    Loader2, 
    AlertCircle,
    CheckCircle2,
    Clock,
    Palmtree,
    Calendar as CalendarIcon
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"

export default function SupplierSettingsPage() {
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
                out_of_office_until: outOfOfficeUntil?.toISOString()
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
                <AlertCircle className="h-12 w-12 mx-auto text-status-warning mb-4" />
                <h2 className="text-xl font-semibold">Profile Not Found</h2>
                <p className="text-muted-foreground mt-2">
                    Create your listing first to access settings.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="min-w-0 flex-1">
                    <div className={typography.pageHeader}>
                        <div className={typography.pageHeaderAccent} />
                        <h1 className={typography.h1}>Settings</h1>
                    </div>
                    <p className={typography.pageSubtitle}>
                        Manage your capacity and availability
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
                <div className="flex items-center gap-2 p-4 rounded-lg bg-status-success-light border border-status-success">
                    <CheckCircle2 className="h-5 w-5 text-status-success" />
                    <p className="text-sm text-status-success">Settings updated successfully!</p>
                </div>
            )}
            {error && (
                <div className="flex items-center gap-2 p-4 rounded-lg bg-status-error-light border border-destructive">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    <p className="text-sm text-destructive">{error}</p>
                </div>
            )}

            <div className="grid gap-6 max-w-2xl">
                {/* Capacity Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5" />
                            Capacity
                        </CardTitle>
                        <CardDescription>
                            Control how many orders you can handle
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
                                <span className="text-sm text-muted-foreground">
                                    Currently: {profile.current_order_count} / {maxConcurrentOrders}
                                </span>
                            </div>
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Auto-pause at capacity</Label>
                                <p className="text-xs text-muted-foreground">
                                    Hide from search when at max orders
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
                                    Stop receiving new orders
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
                                        <Label>Return Date</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="secondary"
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
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="oooMessage">Away Message</Label>
                                        <Textarea
                                            id="oooMessage"
                                            value={outOfOfficeMessage}
                                            onChange={(e) => setOutOfOfficeMessage(e.target.value)}
                                            placeholder="I'm currently unavailable..."
                                            className="min-h-[100px]"
                                            maxLength={500}
                                        />
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
