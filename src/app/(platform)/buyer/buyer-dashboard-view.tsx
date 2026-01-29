'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    ShoppingBag,
    CheckCircle,
    TrendingUp,
    Heart,
    ArrowRight,
    Star,
    User,
    Search,
    Sparkles,
    BarChart3
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { OrderSummaryCardCompact } from '@/components/buyer/OrderSummaryCard'
import { BuyerOnboarding, BuyerOnboardingBanner } from '@/components/buyer/BuyerOnboarding'
import type { BuyerDashboardStats, OrderSummary, FavoriteProvider } from '@/types/booking'

// ==========================================
// PROPS
// ==========================================

interface BuyerDashboardViewProps {
    stats: BuyerDashboardStats | null
    activeOrders: OrderSummary[]
    recommendedProviders: FavoriteProvider[]
    favoriteProviders: FavoriteProvider[]
}

// ==========================================
// COMPONENT
// ==========================================

export function BuyerDashboardView({
    stats,
    activeOrders,
    recommendedProviders,
    favoriteProviders
}: BuyerDashboardViewProps) {
    const router = useRouter()
    const [showOnboarding, setShowOnboarding] = useState(false)

    const formatCurrency = (amount: number, currency: string) => {
        return `${currency} ${amount.toLocaleString('en-GB', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        })}`
    }

    return (
        <div className="space-y-6">
            {/* Onboarding Banner */}
            <BuyerOnboardingBanner 
                onGetStarted={() => setShowOnboarding(true)} 
            />

            {/* Onboarding Modal */}
            {showOnboarding && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="max-w-lg w-full">
                        <BuyerOnboarding
                            forceShow
                            onComplete={() => setShowOnboarding(false)}
                        />
                    </div>
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* Active Orders */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
                        <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {stats?.activeOrdersCount ?? 0}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Orders in progress
                        </p>
                    </CardContent>
                </Card>

                {/* Completed Orders */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Completed</CardTitle>
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {stats?.completedOrdersCount ?? 0}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Successfully completed
                        </p>
                    </CardContent>
                </Card>

                {/* Spend This Month */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">This Month</CardTitle>
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {stats 
                                ? formatCurrency(stats.spendThisMonth, stats.currency)
                                : '£0'}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Total: {stats 
                                ? formatCurrency(stats.totalSpend, stats.currency)
                                : '£0'}
                        </p>
                    </CardContent>
                </Card>

                {/* Favorite Providers */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Favorites</CardTitle>
                        <Heart className="h-4 w-4 text-rose-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {stats?.favoriteProvidersCount ?? 0}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Saved providers
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content Grid */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Active Orders Section */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Recent Active Orders */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Active Orders</CardTitle>
                                <CardDescription>
                                    Your orders in progress
                                </CardDescription>
                            </div>
                            <Button 
                                variant="secondary" 
                                size="sm"
                                onClick={() => router.push('/my-orders')}
                            >
                                View All
                                <ArrowRight className="h-4 w-4 ml-1" />
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {activeOrders.length === 0 ? (
                                <div className="text-center py-8">
                                    <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                                    <p className="text-muted-foreground mb-4">
                                        No active orders
                                    </p>
                                    <Button onClick={() => router.push('/marketplace')}>
                                        Browse Marketplace
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {activeOrders.map(order => (
                                        <OrderSummaryCardCompact
                                            key={order.id}
                                            order={order}
                                            onClick={() => router.push(`/my-orders/${order.id}`)}
                                        />
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Recommended Providers */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Sparkles className="h-5 w-5 text-amber-500" />
                                    Recommended for You
                                </CardTitle>
                                <CardDescription>
                                    Top providers you might like
                                </CardDescription>
                            </div>
                            <Button 
                                variant="secondary" 
                                size="sm"
                                onClick={() => router.push('/marketplace')}
                            >
                                Browse All
                                <ArrowRight className="h-4 w-4 ml-1" />
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {recommendedProviders.length === 0 ? (
                                <div className="text-center py-8">
                                    <Search className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                                    <p className="text-muted-foreground">
                                        No recommendations yet. Browse the marketplace to get personalized suggestions.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {recommendedProviders.slice(0, 4).map(provider => (
                                        <ProviderCard
                                            key={provider.providerId}
                                            provider={provider}
                                            onClick={() => router.push(`/marketplace?provider=${provider.providerId}`)}
                                        />
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Quick Actions */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Quick Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Button 
                                variant="secondary" 
                                className="w-full justify-start"
                                onClick={() => router.push('/marketplace')}
                            >
                                <Search className="h-4 w-4 mr-2" />
                                Find Providers
                            </Button>
                            <Button 
                                variant="secondary" 
                                className="w-full justify-start"
                                onClick={() => router.push('/my-orders')}
                            >
                                <ShoppingBag className="h-4 w-4 mr-2" />
                                View Orders
                            </Button>
                            <Button 
                                variant="secondary" 
                                className="w-full justify-start"
                                onClick={() => router.push('/buyer/analytics')}
                            >
                                <BarChart3 className="h-4 w-4 mr-2" />
                                View Analytics
                            </Button>
                            <Button 
                                variant="secondary" 
                                className="w-full justify-start"
                                onClick={() => setShowOnboarding(true)}
                            >
                                <Sparkles className="h-4 w-4 mr-2" />
                                How It Works
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Favorite Providers */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Heart className="h-5 w-5 text-rose-500" />
                                Favorites
                            </CardTitle>
                            <CardDescription>
                                Your saved providers
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {favoriteProviders.length === 0 ? (
                                <div className="text-center py-4">
                                    <Heart className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                                    <p className="text-sm text-muted-foreground">
                                        No favorites yet
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {favoriteProviders.slice(0, 5).map(provider => (
                                        <div 
                                            key={provider.providerId}
                                            className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-1 rounded-lg transition-colors"
                                            onClick={() => router.push(`/marketplace?provider=${provider.providerId}`)}
                                        >
                                            <Avatar className="h-9 w-9">
                                                <AvatarImage src={provider.avatarUrl} alt={provider.name} />
                                                <AvatarFallback>
                                                    <User className="h-4 w-4" />
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm truncate">
                                                    {provider.name}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {provider.currency} {provider.dayRate?.toLocaleString()}/day
                                                </p>
                                            </div>
                                            {provider.isAvailable && (
                                                <Badge variant="secondary" className="text-emerald-600 border-emerald-200 text-xs">
                                                    Available
                                                </Badge>
                                            )}
                                        </div>
                                    ))}
                                    {favoriteProviders.length > 5 && (
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="w-full"
                                            onClick={() => router.push('/buyer/favorites')}
                                        >
                                            View all {favoriteProviders.length} favorites
                                        </Button>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

// ==========================================
// PROVIDER CARD COMPONENT
// ==========================================

interface ProviderCardProps {
    provider: FavoriteProvider
    onClick?: () => void
}

function ProviderCard({ provider, onClick }: ProviderCardProps) {
    return (
        <Card 
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={onClick}
        >
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <Avatar className="h-12 w-12">
                        <AvatarImage src={provider.avatarUrl} alt={provider.name} />
                        <AvatarFallback>
                            <User className="h-5 w-5" />
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <h4 className="font-semibold truncate">{provider.name}</h4>
                        {provider.headline && (
                            <p className="text-sm text-muted-foreground truncate">
                                {provider.headline}
                            </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                            {provider.averageRating && (
                                <span className="flex items-center gap-1 text-sm">
                                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                    {provider.averageRating.toFixed(1)}
                                </span>
                            )}
                            {provider.totalReviews > 0 && (
                                <span className="text-xs text-muted-foreground">
                                    ({provider.totalReviews} reviews)
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                    <span className="font-semibold">
                        {provider.currency} {provider.dayRate?.toLocaleString()}/day
                    </span>
                    {provider.isAvailable ? (
                        <Badge variant="secondary" className="text-emerald-600 border-emerald-200">
                            Available
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="text-slate-500">
                            Busy
                        </Badge>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

export default BuyerDashboardView
