// @ts-nocheck
"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from "@/components/ui/select"
import { 
    getProviderProfile, 
    updateProviderProfile,
    ProviderProfile 
} from "@/actions/provider"
import { 
    User, 
    Save, 
    Loader2, 
    Eye, 
    Clock, 
    AlertCircle,
    CheckCircle2,
    Building2
} from "lucide-react"
import { cn } from "@/lib/utils"

const timezones = [
    { value: 'Europe/London', label: 'London (GMT/BST)' },
    { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
    { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
    { value: 'America/New_York', label: 'New York (EST/EDT)' },
    { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
]

const currencies = [
    { value: 'GBP', label: 'GBP (£)', symbol: '£' },
    { value: 'EUR', label: 'EUR (€)', symbol: '€' },
    { value: 'USD', label: 'USD ($)', symbol: '$' },
]

export default function ProviderProfilePage() {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [profile, setProfile] = useState<ProviderProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [showPreview, setShowPreview] = useState(false)

    // Form state
    const [headline, setHeadline] = useState("")
    const [bio, setBio] = useState("")
    const [dayRate, setDayRate] = useState("")
    const [currency, setCurrency] = useState("GBP")
    const [timezone, setTimezone] = useState("Europe/London")
    const [maxConcurrentOrders, setMaxConcurrentOrders] = useState(5)
    const [autoPauseAtCapacity, setAutoPauseAtCapacity] = useState(true)
    const [outOfOffice, setOutOfOffice] = useState(false)
    const [outOfOfficeMessage, setOutOfOfficeMessage] = useState("")
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
                setHeadline(profile.headline || "")
                setBio(profile.bio || "")
                setDayRate(profile.day_rate?.toString() || "")
                setCurrency(profile.currency || "GBP")
                setTimezone(profile.timezone || "Europe/London")
                setMaxConcurrentOrders(profile.max_concurrent_orders || 5)
                setAutoPauseAtCapacity(profile.auto_pause_at_capacity)
                setOutOfOffice(profile.out_of_office)
                setOutOfOfficeMessage(profile.out_of_office_message || "")
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
                headline: headline || undefined,
                bio: bio || undefined,
                day_rate: dayRate ? parseFloat(dayRate) : undefined,
                currency,
                timezone,
                max_concurrent_orders: maxConcurrentOrders,
                auto_pause_at_capacity: autoPauseAtCapacity,
                out_of_office: outOfOffice,
                out_of_office_message: outOfOfficeMessage || undefined,
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
                    <h1 className="text-2xl font-bold text-foreground">Profile Settings</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage how you appear in the marketplace
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="secondary"
                        onClick={() => setShowPreview(!showPreview)}
                    >
                        <Eye className="h-4 w-4 mr-2" />
                        {showPreview ? "Hide Preview" : "Preview"}
                    </Button>
                    <Button onClick={handleSave} disabled={isPending}>
                        {isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Changes
                    </Button>
                </div>
            </div>

            {/* Success/Error Messages */}
            {success && (
                <div className="flex items-center gap-2 p-4 rounded-lg bg-green-50 border border-green-200">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <p className="text-sm text-green-700">Profile updated successfully!</p>
                </div>
            )}
            {error && (
                <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            <div className={cn(
                "grid gap-6",
                showPreview ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
            )}>
                {/* Edit Form */}
                <div className="space-y-6">
                    {/* Basic Info */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <User className="h-5 w-5" />
                                Basic Information
                            </CardTitle>
                            <CardDescription>
                                How you appear to potential clients
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="headline">Headline</Label>
                                <Input
                                    id="headline"
                                    value={headline}
                                    onChange={(e) => setHeadline(e.target.value)}
                                    placeholder="e.g., Senior Manufacturing Consultant"
                                    maxLength={100}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {headline.length}/100 characters
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="bio">Bio</Label>
                                <Textarea
                                    id="bio"
                                    value={bio}
                                    onChange={(e) => setBio(e.target.value)}
                                    placeholder="Tell potential clients about your experience and expertise..."
                                    className="min-h-[150px]"
                                    maxLength={2000}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {bio.length}/2000 characters
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="dayRate">Day Rate</Label>
                                    <Input
                                        id="dayRate"
                                        type="number"
                                        value={dayRate}
                                        onChange={(e) => setDayRate(e.target.value)}
                                        placeholder="e.g., 500"
                                        min={0}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="currency">Currency</Label>
                                    <Select value={currency} onValueChange={setCurrency}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {currencies.map((c) => (
                                                <SelectItem key={c.value} value={c.value}>
                                                    {c.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="timezone">Timezone</Label>
                                    <Select value={timezone} onValueChange={setTimezone}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {timezones.map((tz) => (
                                                <SelectItem key={tz.value} value={tz.value}>
                                                    {tz.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Capacity Settings */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="h-5 w-5" />
                                Capacity Settings
                            </CardTitle>
                            <CardDescription>
                                Control how many orders you can handle
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="maxOrders">Maximum Concurrent Orders</Label>
                                <Input
                                    id="maxOrders"
                                    type="number"
                                    value={maxConcurrentOrders}
                                    onChange={(e) => setMaxConcurrentOrders(parseInt(e.target.value) || 1)}
                                    min={1}
                                    max={20}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Current: {profile.current_order_count} / {maxConcurrentOrders}
                                </p>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Auto-pause at capacity</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Automatically pause new orders when at capacity
                                    </p>
                                </div>
                                <Switch
                                    checked={autoPauseAtCapacity}
                                    onCheckedChange={setAutoPauseAtCapacity}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Out of Office */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Building2 className="h-5 w-5" />
                                Availability
                            </CardTitle>
                            <CardDescription>
                                Let clients know when you&apos;re unavailable
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Out of Office</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Show as unavailable to new clients
                                    </p>
                                </div>
                                <Switch
                                    checked={outOfOffice}
                                    onCheckedChange={setOutOfOffice}
                                />
                            </div>

                            {outOfOffice && (
                                <div className="space-y-2">
                                    <Label htmlFor="oooMessage">Out of Office Message</Label>
                                    <Textarea
                                        id="oooMessage"
                                        value={outOfOfficeMessage}
                                        onChange={(e) => setOutOfOfficeMessage(e.target.value)}
                                        placeholder="I'm currently unavailable but will return soon..."
                                        className="min-h-[80px]"
                                    />
                                </div>
                            )}

                            <Separator />

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Auto-response</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Send automatic replies to new inquiries
                                    </p>
                                </div>
                                <Switch
                                    checked={autoResponseEnabled}
                                    onCheckedChange={setAutoResponseEnabled}
                                />
                            </div>

                            {autoResponseEnabled && (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="autoMessage">Auto-response Message</Label>
                                        <Textarea
                                            id="autoMessage"
                                            value={autoResponseMessage}
                                            onChange={(e) => setAutoResponseMessage(e.target.value)}
                                            placeholder="Thanks for your inquiry! I'll get back to you soon..."
                                            className="min-h-[80px]"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="autoDelay">Delay (minutes)</Label>
                                        <Input
                                            id="autoDelay"
                                            type="number"
                                            value={autoResponseDelay}
                                            onChange={(e) => setAutoResponseDelay(parseInt(e.target.value) || 60)}
                                            min={5}
                                            max={1440}
                                        />
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Preview Panel */}
                {showPreview && (
                    <div className="lg:sticky lg:top-6 h-fit">
                        <Card className="border-2 border-dashed">
                            <CardHeader>
                                <CardTitle className="text-sm text-muted-foreground">
                                    Marketplace Preview
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {/* Provider Card Preview */}
                                    <div className="p-4 rounded-lg border bg-white">
                                        <div className="flex items-start gap-4">
                                            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                                                <User className="h-8 w-8 text-muted-foreground" />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold">Provider Name</h3>
                                                    <Badge variant="secondary" className="text-xs capitalize">
                                                        {profile.tier}
                                                    </Badge>
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    {headline || "No headline set"}
                                                </p>
                                                {dayRate && (
                                                <p className="text-sm font-medium text-green-600 mt-2">
                                                    {currency} {parseFloat(dayRate).toFixed(0)} / day
                                                </p>
                                                )}
                                            </div>
                                        </div>
                                        {bio && (
                                            <p className="mt-4 text-sm text-muted-foreground line-clamp-3">
                                                {bio}
                                            </p>
                                        )}
                                        {outOfOffice && (
                                            <div className="mt-4 p-2 rounded bg-amber-50 text-amber-800 text-xs">
                                                Currently unavailable
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    )
}
