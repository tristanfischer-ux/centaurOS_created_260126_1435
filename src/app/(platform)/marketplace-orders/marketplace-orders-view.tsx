'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    ShoppingBag,
    CheckCircle,
    XCircle,
    Search,
    ArrowUpDown,
    AlertCircle,
    TrendingUp,
    Package
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { OrderSummaryCard } from '@/components/buyer/OrderSummaryCard'
import { EmptyState } from '@/components/ui/empty-state'
import { toast } from 'sonner'
import type { OrderSummary } from '@/types/booking'

// ==========================================
// PROPS
// ==========================================

interface MarketplaceOrdersViewProps {
    activeOrders: OrderSummary[]
    completedOrders: OrderSummary[]
    cancelledOrders: OrderSummary[]
    errors?: string[]
}

// ==========================================
// COMPONENT
// ==========================================

export function MarketplaceOrdersView({
    activeOrders,
    completedOrders,
    cancelledOrders,
    errors = []
}: MarketplaceOrdersViewProps) {
    const router = useRouter()
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'amount'>('newest')

    // Summary stats
    const totalOrders = activeOrders.length + completedOrders.length + cancelledOrders.length
    const totalSpend = [...activeOrders, ...completedOrders].reduce((sum, o) => sum + o.totalAmount, 0)
    const currency = activeOrders[0]?.currency || completedOrders[0]?.currency || 'GBP'

    // Filter and sort orders
    const filterOrders = (orders: OrderSummary[]) => {
        let filtered = orders

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase()
            filtered = filtered.filter(
                order =>
                    order.listingTitle.toLowerCase().includes(query) ||
                    order.providerName.toLowerCase().includes(query) ||
                    order.orderNumber.toLowerCase().includes(query)
            )
        }

        // Sort
        filtered = [...filtered].sort((a, b) => {
            switch (sortBy) {
                case 'oldest':
                    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                case 'amount':
                    return b.totalAmount - a.totalAmount
                case 'newest':
                default:
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            }
        })

        return filtered
    }

    const filteredActive = filterOrders(activeOrders)
    const filteredCompleted = filterOrders(completedOrders)
    const filteredCancelled = filterOrders(cancelledOrders)

    // Handlers
    const handleViewDetails = (orderId: string) => {
        router.push(`/orders/${orderId}`)
    }

    const handleMessageProvider = (orderId: string) => {
        // Get conversation ID and navigate
        const order = [...activeOrders, ...completedOrders, ...cancelledOrders].find(o => o.id === orderId)
        if (order?.conversationId) {
            router.push(`/messages/${order.conversationId}`)
        } else {
            toast.info('No conversation found. View the order details to start a new message.')
        }
    }

    const handleLeaveReview = (orderId: string) => {
        router.push(`/orders/${orderId}?action=review`)
    }

    // Empty state renderer
    const renderEmptyState = (type: 'active' | 'completed' | 'cancelled') => {
        switch (type) {
            case 'active':
                return (
                    <EmptyState
                        icon={<ShoppingBag className="h-12 w-12" />}
                        title="No active orders"
                        description="You don't have any active orders at the moment. Browse the marketplace to find providers."
                        action={
                            <Button onClick={() => router.push('/marketplace')}>
                                Browse Marketplace
                            </Button>
                        }
                    />
                )
            case 'completed':
                return (
                    <EmptyState
                        icon={<CheckCircle className="h-12 w-12" />}
                        title="No completed orders"
                        description="You haven't completed any orders yet. Once you approve deliverables, orders will appear here."
                    />
                )
            case 'cancelled':
                return (
                    <EmptyState
                        icon={<XCircle className="h-12 w-12" />}
                        title="No cancelled orders"
                        description="You don't have any cancelled or disputed orders."
                    />
                )
        }
    }

    // Order list renderer
    const renderOrderList = (orders: OrderSummary[], type: 'active' | 'completed' | 'cancelled') => {
        if (orders.length === 0) {
            return renderEmptyState(type)
        }

        return (
            <div className="space-y-4">
                {orders.map(order => (
                    <OrderSummaryCard
                        key={order.id}
                        order={order}
                        onViewDetails={handleViewDetails}
                        onMessageProvider={handleMessageProvider}
                        onLeaveReview={handleLeaveReview}
                    />
                ))}
            </div>
        )
    }

    const formatCurrency = (amount: number) => {
        return `${currency} ${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    }

    return (
        <div className="space-y-6">
            {/* Error Banner */}
            {errors.length > 0 && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        {errors.length === 1 
                            ? errors[0]
                            : `Failed to load some orders: ${errors.join('; ')}`
                        }
                    </AlertDescription>
                </Alert>
            )}

            {/* Summary Stats */}
            {totalOrders > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-2 mb-1">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Orders</span>
                        </div>
                        <p className="text-2xl font-semibold text-foreground">{totalOrders}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-2 mb-1">
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Spend</span>
                        </div>
                        <p className="text-2xl font-semibold text-foreground">{formatCurrency(totalSpend)}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 hidden sm:block">
                        <div className="flex items-center gap-2 mb-1">
                            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active</span>
                        </div>
                        <p className="text-2xl font-semibold text-foreground">{activeOrders.length}</p>
                    </div>
                </div>
            )}

            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search orders..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 border-slate-200"
                    />
                </div>
                <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
                    <SelectTrigger className="w-full sm:w-[180px] border-slate-200">
                        <ArrowUpDown className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="newest">Newest First</SelectItem>
                        <SelectItem value="oldest">Oldest First</SelectItem>
                        <SelectItem value="amount">Highest Amount</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="active" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="active" className="gap-2">
                        <ShoppingBag className="h-4 w-4" />
                        Active
                        {activeOrders.length > 0 && (
                            <Badge variant="secondary" className="ml-1 bg-international-orange/10 text-international-orange">
                                {activeOrders.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Completed
                        {completedOrders.length > 0 && (
                            <Badge variant="secondary" className="ml-1 bg-emerald-50 text-emerald-600">
                                {completedOrders.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="cancelled" className="gap-2">
                        <XCircle className="h-4 w-4" />
                        Cancelled
                        {cancelledOrders.length > 0 && (
                            <Badge variant="secondary" className="ml-1">
                                {cancelledOrders.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="active" className="mt-6">
                    {searchQuery && filteredActive.length !== activeOrders.length && (
                        <p className="text-sm text-muted-foreground mb-4">
                            Showing {filteredActive.length} of {activeOrders.length} orders
                        </p>
                    )}
                    {renderOrderList(filteredActive, 'active')}
                </TabsContent>

                <TabsContent value="completed" className="mt-6">
                    {searchQuery && filteredCompleted.length !== completedOrders.length && (
                        <p className="text-sm text-muted-foreground mb-4">
                            Showing {filteredCompleted.length} of {completedOrders.length} orders
                        </p>
                    )}
                    {renderOrderList(filteredCompleted, 'completed')}
                </TabsContent>

                <TabsContent value="cancelled" className="mt-6">
                    {searchQuery && filteredCancelled.length !== cancelledOrders.length && (
                        <p className="text-sm text-muted-foreground mb-4">
                            Showing {filteredCancelled.length} of {cancelledOrders.length} orders
                        </p>
                    )}
                    {renderOrderList(filteredCancelled, 'cancelled')}
                </TabsContent>
            </Tabs>
        </div>
    )
}

export default MarketplaceOrdersView
