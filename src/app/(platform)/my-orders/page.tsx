import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getBuyerOrders } from '@/actions/buyer'
import { MyOrdersView } from './my-orders-view'
import { Skeleton } from '@/components/ui/skeleton'

// Force dynamic since we're fetching user-specific data
export const dynamic = 'force-dynamic'

export const metadata = {
    title: 'My Orders | Marketplace',
    description: 'View and manage your marketplace orders'
}

function OrdersLoadingSkeleton() {
    return (
        <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
                <div key={i} className="border rounded-lg p-6">
                    <div className="flex gap-4">
                        <Skeleton className="h-14 w-14 rounded-full" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-5 w-48" />
                            <Skeleton className="h-4 w-32" />
                            <div className="flex gap-4 mt-2">
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-4 w-28" />
                            </div>
                        </div>
                        <Skeleton className="h-6 w-24" />
                    </div>
                </div>
            ))}
        </div>
    )
}

export default async function MyOrdersPage() {
    const supabase = await createClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        redirect('/login?redirect=/my-orders')
    }

    // Fetch orders for all tabs
    const [activeResult, completedResult, cancelledResult] = await Promise.all([
        getBuyerOrders('active'),
        getBuyerOrders('completed'),
        getBuyerOrders('cancelled')
    ])

    return (
        <div className="container max-w-5xl mx-auto py-8 px-4">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">My Orders</h1>
                <p className="text-muted-foreground mt-1">
                    View and manage your marketplace orders
                </p>
            </div>

            <Suspense fallback={<OrdersLoadingSkeleton />}>
                <MyOrdersView
                    activeOrders={activeResult.data}
                    completedOrders={completedResult.data}
                    cancelledOrders={cancelledResult.data}
                />
            </Suspense>
        </div>
    )
}
