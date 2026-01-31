// @ts-nocheck
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AvailabilityCalendar } from '@/components/provider/AvailabilityCalendar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
    AlertCircle, 
    ArrowRight, 
    Calendar, 
    CalendarSync, 
    Check,
    Clock, 
    Download,
    ExternalLink,
    Settings
} from 'lucide-react'
import Link from 'next/link'

export const metadata = {
    title: 'Availability | Provider Portal',
    description: 'Manage your availability calendar'
}

export default async function AvailabilityPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Get provider profile
    const { data: profile } = await supabase
        .from('provider_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

    // Get date ranges for stats
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()

    // Get upcoming bookings count
    const { count: upcomingBookings } = await supabase
        .from('availability_slots')
        .select('*', { count: 'exact', head: true })
        .eq('provider_id', profile?.id)
        .eq('status', 'booked')
        .gte('date', todayStr)

    // Get this month's stats
    const { data: monthSlots } = await supabase
        .from('availability_slots')
        .select('status')
        .eq('provider_id', profile?.id)
        .gte('date', monthStart)
        .lte('date', monthEnd)

    const bookedThisMonth = monthSlots?.filter(s => s.status === 'booked').length || 0
    const blockedThisMonth = monthSlots?.filter(s => s.status === 'blocked').length || 0
    const availableThisMonth = daysInMonth - bookedThisMonth - blockedThisMonth

    // Check if profile exists
    if (!profile) {
        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Availability Calendar</h1>
                
                <Card className="border-status-warning/50 bg-status-warning-light/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-status-warning-dark">
                            <AlertCircle className="h-5 w-5" />
                            Provider Profile Required
                        </CardTitle>
                        <CardDescription className="text-status-warning">
                            You need to set up your provider profile before managing availability.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/provider-portal/pricing">
                            <Button className="gap-2">
                                Set Up Profile
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        Availability Calendar
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Manage when you&apos;re available for bookings
                    </p>
                </div>
                <Link href="/provider-portal/pricing">
                    <Button variant="secondary" className="gap-2">
                        <Settings className="h-4 w-4" />
                        Pricing Settings
                    </Button>
                </Link>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-full bg-status-success-light">
                                <Check className="h-6 w-6 text-status-success" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-foreground">
                                    {availableThisMonth}
                                </p>
                                <p className="text-sm text-muted-foreground">Days Available</p>
                                <p className="text-xs text-muted-foreground">This month</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-full bg-status-info-light">
                                <Calendar className="h-6 w-6 text-status-info" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-foreground">
                                    {bookedThisMonth}
                                </p>
                                <p className="text-sm text-muted-foreground">Days Booked</p>
                                <p className="text-xs text-muted-foreground">This month</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-full bg-purple-100">
                                <Clock className="h-6 w-6 text-purple-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-foreground">
                                    {upcomingBookings || 0}
                                </p>
                                <p className="text-sm text-muted-foreground">Upcoming</p>
                                <p className="text-xs text-muted-foreground">Bookings</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-full bg-status-warning-light">
                                <Settings className="h-6 w-6 text-status-warning" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <Badge variant={profile.is_active ? "default" : "secondary"}>
                                    {profile.is_active ? 'Active' : 'Paused'}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{profile.timezone || 'No timezone'}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Out of Office Banner */}
            {profile.out_of_office && (
                <Card className="border-status-warning bg-status-warning-light">
                    <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-status-warning mt-0.5" />
                            <div>
                                <p className="font-medium text-status-warning-dark">Out of Office Mode Active</p>
                                <p className="text-sm text-status-warning mt-1">
                                    {profile.out_of_office_message || 'You are currently marked as out of office.'}
                                    {profile.out_of_office_until && (
                                        <span className="block mt-1">
                                            Returns: {new Date(profile.out_of_office_until).toLocaleDateString()}
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Main Calendar */}
            <AvailabilityCalendar 
                providerId={profile.id}
                showBulkActions={true}
                showQuickActions={true}
                showLegend={true}
                showTimezone={true}
            />

            {/* Export/Sync Options */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CalendarSync className="h-5 w-5 text-muted-foreground" />
                        Calendar Sync
                    </CardTitle>
                    <CardDescription>
                        Export your availability or sync with external calendars
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Export iCal */}
                        <div className="p-4 border rounded-lg bg-muted/50">
                            <div className="flex items-start gap-3">
                                <div className="p-2 rounded-lg bg-background border">
                                    <Download className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-medium text-foreground">Export iCal</h4>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Download your availability as an iCal file
                                    </p>
                                    <Button 
                                        variant="secondary" 
                                        size="sm" 
                                        className="mt-2"
                                        disabled
                                    >
                                        Coming Soon
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Google Calendar */}
                        <div className="p-4 border rounded-lg bg-muted/50">
                            <div className="flex items-start gap-3">
                                <div className="p-2 rounded-lg bg-background border">
                                    <Calendar className="h-5 w-5 text-status-info" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-medium text-foreground">Google Calendar</h4>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Two-way sync with Google Calendar
                                    </p>
                                    <Button 
                                        variant="secondary" 
                                        size="sm" 
                                        className="mt-2"
                                        disabled
                                    >
                                        Coming Soon
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Outlook */}
                        <div className="p-4 border rounded-lg bg-muted/50">
                            <div className="flex items-start gap-3">
                                <div className="p-2 rounded-lg bg-background border">
                                    <ExternalLink className="h-5 w-5 text-status-info" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-medium text-foreground">Outlook</h4>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Sync with Microsoft Outlook
                                    </p>
                                    <Button 
                                        variant="secondary" 
                                        size="sm" 
                                        className="mt-2"
                                        disabled
                                    >
                                        Coming Soon
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 p-3 bg-status-info-light rounded-lg border border-status-info">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-status-info mt-0.5" />
                            <p className="text-sm text-status-info">
                                Calendar sync is coming soon. When enabled, you&apos;ll be able to automatically block 
                                dates from your external calendar and export your availability for clients.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Help Text */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">How it works</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>
                        <strong className="text-foreground">Green days</strong> are available for booking. 
                        Clients can see these when browsing your profile in the marketplace.
                    </p>
                    <p>
                        <strong className="text-foreground">Gray days</strong> are blocked. 
                        Block days when you&apos;re unavailable or need time off.
                    </p>
                    <p>
                        <strong className="text-foreground">Blue days</strong> are booked. 
                        These have confirmed orders and cannot be modified.
                    </p>
                    <p>
                        Click any available or blocked day to toggle its status. 
                        Use the bulk actions to quickly open or block entire months.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
