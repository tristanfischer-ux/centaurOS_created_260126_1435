import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getBuyerDashboardStats, getBuyerOrders, getRecommendedProviders, getFavoriteProviders } from '@/actions/buyer'
import { BuyerDashboardView } from './buyer-dashboard-view'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

// Force dynamic since we're fetching user-specific data
export const dynamic = 'force-dynamic'

export const metadata = {
    title: 'Buyer Dashboard | Marketplace',
    description: 'Your marketplace dashboard - orders, favorites, and recommendations'
}

function DashboardLoadingSkeleton() {
    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                    <Card key={i}>
                        <CardHeader className="pb-2">
                            <Skeleton className="h-4 w-24" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-8 w-16" />
                            <Skeleton className="h-3 w-32 mt-2" />
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Recent Orders */}
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex gap-3">
                            <Skeleton className="h-10 w-10 rounded-full" />
                            <div className="flex-1">
                                <Skeleton className="h-4 w-48" />
                                <Skeleton className="h-3 w-24 mt-2" />
                            </div>
                            <Skeleton className="h-6 w-20" />
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    )
}

export default async function BuyerDashboardPage() {
    const supabase = await createClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        redirect('/login?redirect=/buyer')
    }

    // Fetch all dashboard data in parallel
    const [statsResult, activeOrdersResult, recommendedResult, favoritesResult] = await Promise.all([
        getBuyerDashboardStats(),
        getBuyerOrders('active', 5),
        getRecommendedProviders(6),
        getFavoriteProviders()
    ])

    return (
        <div className="container max-w-6xl mx-auto py-8 px-4">
            <div className="pb-4 border-b border-slate-100 mb-8">
                <div className="flex items-center gap-3 mb-1">
                    <div className="h-8 w-1 bg-orange-600 rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                    <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">Buyer Dashboard</h1>
                </div>
                <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">
                    Manage your orders and discover providers
                </p>
            </div>

            <Suspense fallback={<DashboardLoadingSkeleton />}>
                <BuyerDashboardView
                    stats={statsResult.data}
                    activeOrders={activeOrdersResult.data}
                    recommendedProviders={recommendedResult.data}
                    favoriteProviders={favoritesResult.data}
                />
            </Suspense>
        </div>
    )
}
