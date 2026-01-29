'use client'

import { useState, useEffect, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
    Calendar, 
    Check, 
    DollarSign, 
    Loader2, 
    Pause,
    Settings,
    TrendingUp 
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import {
    getProviderProfile,
    updateCapacitySettings,
    ensureProviderProfile,
    type ProviderProfile,
    type Currency
} from '@/actions/availability'
import { PricingForm } from '@/components/provider/PricingForm'

export default function PricingPage() {
    const [profile, setProfile] = useState<ProviderProfile | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, startTransition] = useTransition()

    // Capacity settings
    const [maxConcurrentOrders, setMaxConcurrentOrders] = useState<string>('5')
    const [autoPauseAtCapacity, setAutoPauseAtCapacity] = useState(true)

    // Load profile on mount
    useEffect(() => {
        async function loadProfile() {
            setIsLoading(true)
            
            // Ensure profile exists (creates if needed)
            const result = await ensureProviderProfile()
            
            if (result.data) {
                setProfile(result.data)
                setMaxConcurrentOrders(result.data.max_concurrent_orders?.toString() || '5')
                setAutoPauseAtCapacity(result.data.auto_pause_at_capacity ?? true)
                
                if (result.isNew) {
                    toast.success('Provider profile created! Set your pricing to get started.')
                }
            } else if (result.error) {
                toast.error(result.error)
            }
            
            setIsLoading(false)
        }

        loadProfile()
    }, [])

    const handleSaveCapacity = async () => {
        const maxOrders = parseInt(maxConcurrentOrders)
        
        if (isNaN(maxOrders) || maxOrders < 1) {
            toast.error('Max concurrent orders must be at least 1')
            return
        }

        startTransition(async () => {
            const result = await updateCapacitySettings(maxOrders, autoPauseAtCapacity)
            
            if (result.success) {
                toast.success('Capacity settings updated')
                // Refresh profile
                const updated = await getProviderProfile()
                if (updated.data) setProfile(updated.data)
            } else {
                toast.error(result.error || 'Failed to update settings')
            }
        })
    }

    const handlePricingSaved = async () => {
        // Refresh profile after pricing changes
        const updated = await getProviderProfile()
        if (updated.data) setProfile(updated.data)
    }

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                        Pricing & Capacity
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Set your rates and manage your workload
                    </p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <Skeleton className="h-6 w-32" />
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-24 w-full" />
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <Skeleton className="h-6 w-32" />
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-20 w-full" />
                        </CardContent>
                    </Card>
                </div>
            </div>
        )
    }

    const isAtCapacity = profile && 
        profile.current_order_count >= profile.max_concurrent_orders

    // Extract pricing values from profile for the form
    // Note: Some fields are accessed via type assertion since they may not be in generated types yet
    const profileData = profile as unknown as Record<string, unknown>
    const pricingInitialValues = profile ? {
        dayRate: profile.day_rate,
        currency: (profile.currency || 'GBP') as Currency,
        minimumDays: (profileData.minimum_engagement_days as number) || 1,
        retainerEnabled: (profileData.retainer_enabled as boolean) || false,
        retainerHoursPerWeek: (profileData.retainer_hours_per_week as number | null) ?? null,
        retainerHourlyRate: (profileData.retainer_hourly_rate as number | null) ?? null,
        retainerDiscountPercent: (profileData.retainer_discount_percent as number) || 0
    } : undefined

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                        Pricing & Capacity
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Set your rates and manage your workload
                    </p>
                </div>
                <Link href="/provider-portal/availability">
                    <Button variant="secondary" className="gap-2">
                        <Calendar className="h-4 w-4" />
                        Availability Calendar
                    </Button>
                </Link>
            </div>

            {/* Capacity Warning */}
            {isAtCapacity && (
                <Card className="border-amber-200 bg-amber-50">
                    <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                            <Pause className="h-5 w-5 text-amber-600 mt-0.5" />
                            <div>
                                <p className="font-medium text-amber-900">At Maximum Capacity</p>
                                <p className="text-sm text-amber-700 mt-1">
                                    You have {profile.current_order_count} active orders, which is your maximum.
                                    {autoPauseAtCapacity && ' New bookings are automatically paused.'}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Tabs for Pricing and Capacity */}
            <Tabs defaultValue="pricing" className="space-y-6">
                <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="pricing" className="gap-2">
                        <DollarSign className="h-4 w-4" />
                        Pricing
                    </TabsTrigger>
                    <TabsTrigger value="capacity" className="gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Capacity
                    </TabsTrigger>
                </TabsList>

                {/* Pricing Tab */}
                <TabsContent value="pricing" className="space-y-6">
                    <PricingForm 
                        initialValues={pricingInitialValues}
                        onSaved={handlePricingSaved}
                        showPreview={true}
                    />
                </TabsContent>

                {/* Capacity Tab */}
                <TabsContent value="capacity" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="h-5 w-5 text-slate-500" />
                                Capacity Settings
                            </CardTitle>
                            <CardDescription>
                                Control how many orders you can handle at once
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label 
                                        htmlFor="maxOrders" 
                                        className="text-sm font-medium text-slate-700"
                                    >
                                        Maximum Concurrent Orders
                                    </label>
                                    <input
                                        id="maxOrders"
                                        type="number"
                                        min="1"
                                        max="50"
                                        value={maxConcurrentOrders}
                                        onChange={(e) => setMaxConcurrentOrders(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                    <p className="text-xs text-slate-500">
                                        How many active orders you can work on simultaneously
                                    </p>
                                </div>

                                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                                    <div className="space-y-0.5">
                                        <label 
                                            htmlFor="autoPause" 
                                            className="text-sm font-medium text-slate-700 cursor-pointer"
                                        >
                                            Auto-pause at capacity
                                        </label>
                                        <p className="text-xs text-slate-500">
                                            Automatically pause new bookings when at max capacity
                                        </p>
                                    </div>
                                    <button
                                        id="autoPause"
                                        role="switch"
                                        aria-checked={autoPauseAtCapacity}
                                        onClick={() => setAutoPauseAtCapacity(!autoPauseAtCapacity)}
                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 ${
                                            autoPauseAtCapacity ? 'bg-slate-900' : 'bg-slate-200'
                                        }`}
                                    >
                                        <span
                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
                                                autoPauseAtCapacity ? 'translate-x-5' : 'translate-x-0'
                                            }`}
                                        />
                                    </button>
                                </div>

                                {/* Current Capacity Display */}
                                <div className="p-4 bg-slate-50 rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm text-slate-500">Current Workload</p>
                                        <Badge variant={isAtCapacity ? "destructive" : "default"}>
                                            {profile?.current_order_count || 0} / {profile?.max_concurrent_orders || 5}
                                        </Badge>
                                    </div>
                                    <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full transition-all ${
                                                isAtCapacity ? 'bg-red-500' : 'bg-emerald-500'
                                            }`}
                                            style={{ 
                                                width: `${Math.min(
                                                    ((profile?.current_order_count || 0) / 
                                                    (profile?.max_concurrent_orders || 5)) * 100, 
                                                    100
                                                )}%` 
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <Button 
                                onClick={handleSaveCapacity}
                                disabled={isSaving}
                                className="w-full"
                            >
                                {isSaving ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <Check className="h-4 w-4 mr-2" />
                                )}
                                Save Capacity Settings
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Profile Status Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings className="h-5 w-5 text-slate-500" />
                                Profile Status
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-4 bg-slate-50 rounded-lg">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Status</p>
                                    <div className="mt-1">
                                        <Badge variant={profile?.is_active ? "default" : "secondary"}>
                                            {profile?.is_active ? 'Active' : 'Paused'}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-lg">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Timezone</p>
                                    <p className="mt-1 font-medium text-slate-900 text-sm truncate">
                                        {profile?.timezone || 'Not set'}
                                    </p>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-lg">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Stripe</p>
                                    <div className="mt-1">
                                        <Badge variant={profileData?.stripe_onboarding_complete ? "default" : "secondary"}>
                                            {profileData?.stripe_onboarding_complete ? 'Connected' : 'Not Connected'}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-lg">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Out of Office</p>
                                    <div className="mt-1">
                                        <Badge variant={profileData?.out_of_office ? "destructive" : "secondary"}>
                                            {profileData?.out_of_office ? 'Away' : 'Available'}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Help Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Understanding Your Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                    <p>
                        <strong className="text-slate-900">Day Rate:</strong> This is your standard rate 
                        per day of work. Clients will see this when browsing your profile.
                    </p>
                    <p>
                        <strong className="text-slate-900">Minimum Engagement:</strong> Set a minimum 
                        number of days for bookings. This ensures engagements are worth your time.
                    </p>
                    <p>
                        <strong className="text-slate-900">Retainer Pricing:</strong> Offer a discounted 
                        hourly rate for clients who commit to ongoing weekly hours.
                    </p>
                    <p>
                        <strong className="text-slate-900">Max Concurrent Orders:</strong> Limits how 
                        many active engagements you can have at once. This helps prevent overcommitment.
                    </p>
                    <p>
                        <strong className="text-slate-900">Auto-pause:</strong> When enabled, your 
                        profile will automatically stop accepting new orders when you reach capacity. 
                        It resumes when orders are completed.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
