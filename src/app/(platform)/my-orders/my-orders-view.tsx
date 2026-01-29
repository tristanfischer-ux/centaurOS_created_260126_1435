'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    ShoppingBag,
    CheckCircle,
    XCircle,
    Search,
    ArrowUpDown
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { OrderSummaryCard } from '@/components/buyer/OrderSummaryCard'
import { EmptyState } from '@/components/ui/empty-state'
import type { OrderSummary } from '@/types/booking'

// ==========================================
// PROPS
// ==========================================

interface MyOrdersViewProps {
    activeOrders: OrderSummary[]
    completedOrders: OrderSummary[]
    cancelledOrders: OrderSummary[]
}

// ==========================================
// COMPONENT
// ==========================================

export function MyOrdersView({
    activeOrders,
    completedOrders,
    cancelledOrders
}: MyOrdersViewProps) {
    const router = useRouter()
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'amount'>('newest')

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
        router.push(`/my-orders/${orderId}`)
    }

    const handleMessageProvider = (orderId: string) => {
        // Get conversation ID and navigate
        const order = [...activeOrders, ...completedOrders, ...cancelledOrders].find(o => o.id === orderId)
        if (order?.conversationId) {
            router.push(`/messages/${order.conversationId}`)
        }
    }

    const handleLeaveReview = (orderId: string) => {
        router.push(`/my-orders/${orderId}?action=review`)
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

    return (
        <div className="space-y-6">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search orders..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
                    <SelectTrigger className="w-full sm:w-[180px]">
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
                            <Badge variant="secondary" className="ml-1">
                                {activeOrders.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Completed
                        {completedOrders.length > 0 && (
                            <Badge variant="secondary" className="ml-1">
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

export default MyOrdersView
