import { Suspense } from "react"
import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { 
    getProviderProfile, 
    getProviderDashboardStats, 
    getProviderOrders, 
    getProviderRecentActivity 
} from "@/actions/provider"
import { checkStripeAccountStatus } from "@/actions/stripe-connect"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ProviderOnboardingProgress } from "@/components/provider/ProviderOnboardingProgress"
import { StripeAccountStatus } from "@/components/provider/StripeAccountStatus"
import { EarningsCard } from "@/components/provider/EarningsCard"
import { RFQWidget } from "@/components/provider-portal/RFQWidget"
import { 
    ShoppingCart, 
    Calendar, 
    Star, 
    Clock, 
    ArrowRight,
    Package,
    Activity,
    BarChart3
} from "lucide-react"
import { cn } from "@/lib/utils"

function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            <Skeleton className="h-8 w-48" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-32" />
                ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Skeleton className="h-64" />
                <Skeleton className="h-64" />
            </div>
        </div>
    )
}

async function DashboardContent() {
    const { profile, error: profileError } = await getProviderProfile()
    
    if (!profile) {
        redirect("/provider-portal")
    }

    const [
        { stats },
        { orders: recentOrders },
        { activities },
        stripeStatus
    ] = await Promise.all([
        getProviderDashboardStats(),
        getProviderOrders({ limit: 5 }),
        getProviderRecentActivity(5),
        checkStripeAccountStatus()
    ])

    // Build onboarding steps
    const onboardingSteps = [
        { id: 'headline', label: 'Add a headline', completed: !!profile.headline, required: true },
        { id: 'bio', label: 'Write your bio', completed: !!profile.bio, required: true },
        { id: 'stripe', label: 'Connect Stripe account', completed: stripeStatus.isReady, required: true },
        { id: 'rates', label: 'Set your day rate', completed: !!profile.day_rate, required: true },
    ]

    const statusColors = {
        pending: 'bg-yellow-100 text-yellow-800',
        confirmed: 'bg-blue-100 text-blue-800',
        in_progress: 'bg-purple-100 text-purple-800',
        completed: 'bg-green-100 text-green-800',
        cancelled: 'bg-red-100 text-red-800',
        disputed: 'bg-orange-100 text-orange-800'
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="h-8 w-1 bg-orange-600 rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                        <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">Provider Dashboard</h1>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">
                        Welcome back! Here&apos;s an overview of your provider activity
                    </p>
                </div>
                {profile.out_of_office && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                        Out of Office
                    </Badge>
                )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-green-50">
                                <ShoppingCart className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats?.activeOrdersCount || 0}</p>
                                <p className="text-sm text-muted-foreground">Active Orders</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-50">
                                <Calendar className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats?.upcomingBookingsCount || 0}</p>
                                <p className="text-sm text-muted-foreground">Upcoming Bookings</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-amber-50">
                                <Star className="h-5 w-5 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">
                                    {stats?.averageRating ? stats.averageRating.toFixed(1) : '-'}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Rating ({stats?.reviewCount || 0} reviews)
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-purple-50">
                                <Clock className="h-5 w-5 text-purple-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{profile.current_order_count}</p>
                                <p className="text-sm text-muted-foreground">
                                    of {profile.max_concurrent_orders} capacity
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Earnings Overview */}
                <EarningsCard
                    earningsThisMonth={stats?.earningsThisMonth || 0}
                    pendingPayout={stats?.pendingPayout || 0}
                    totalEarnings={stats?.totalEarnings || 0}
                    currency={profile.currency}
                />

                {/* RFQ Widget */}
                <RFQWidget />
            </div>

            {/* Profile Completion */}
            <ProviderOnboardingProgress
                steps={onboardingSteps}
                completionPercent={stats?.profileCompletionPercent}
            />

            {/* Analytics Link Card */}
            <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100">
                <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-100">
                            <BarChart3 className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="font-medium text-blue-900">Full Analytics Dashboard</p>
                            <p className="text-sm text-blue-700">View detailed performance metrics, trends, and insights</p>
                        </div>
                    </div>
                    <Link href="/provider-portal/analytics">
                        <Button variant="secondary" className="border hover:bg-blue-100">
                            View Analytics
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                </CardContent>
            </Card>

            {/* Stripe Status (if not ready) */}
            {!stripeStatus.isReady && (
                <StripeAccountStatus
                    hasAccount={stripeStatus.hasAccount}
                    isReady={stripeStatus.isReady}
                    chargesEnabled={stripeStatus.chargesEnabled}
                    payoutsEnabled={stripeStatus.payoutsEnabled}
                    detailsSubmitted={stripeStatus.detailsSubmitted}
                    requirements={stripeStatus.requirements}
                />
            )}

            {/* Recent Orders and Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Orders */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <div>
                            <CardTitle className="text-lg">Recent Orders</CardTitle>
                            <CardDescription>Your latest orders</CardDescription>
                        </div>
                        <Link href="/provider-portal/orders">
                            <Button variant="ghost" size="sm">
                                View All
                                <ArrowRight className="ml-1 h-4 w-4" />
                            </Button>
                        </Link>
                    </CardHeader>
                    <CardContent>
                        {recentOrders.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">No orders yet</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {recentOrders.map((order) => (
                                    <div 
                                        key={order.id}
                                        className="flex items-center justify-between p-3 rounded-lg bg-muted"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">
                                                {order.listing_title || `Order ${order.order_number}`}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {order.buyer_name}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Badge 
                                                variant="secondary"
                                                className={cn(
                                                    "text-xs",
                                                    statusColors[order.status as keyof typeof statusColors] || 'bg-muted'
                                                )}
                                            >
                                                {order.status.replace('_', ' ')}
                                            </Badge>
                                            <span className="text-sm font-medium">
                                                {order.currency} {order.total_amount.toFixed(0)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Activity className="h-5 w-5 text-blue-600" />
                            Recent Activity
                        </CardTitle>
                        <CardDescription>Latest updates on your account</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {activities.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">No recent activity</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {activities.map((activity) => (
                                    <div 
                                        key={activity.id}
                                        className="flex items-start gap-3 p-3 rounded-lg bg-muted"
                                    >
                                        <div className={cn(
                                            "w-2 h-2 rounded-full mt-2 flex-shrink-0",
                                            activity.type === 'order' && "bg-blue-500",
                                            activity.type === 'review' && "bg-amber-500",
                                            activity.type === 'booking' && "bg-green-500",
                                            activity.type === 'payout' && "bg-purple-500"
                                        )} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium">{activity.title}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {activity.description}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {new Date(activity.created_at).toLocaleDateString('en-GB', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

export default function ProviderDashboardPage() {
    return (
        <Suspense fallback={<DashboardSkeleton />}>
            <DashboardContent />
        </Suspense>
    )
}
